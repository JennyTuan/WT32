import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, LoaderCircle } from "lucide-react";
import * as dicomParser from "dicom-parser";
import {
  FOUR_D_DICOM_MP_IDS,
  FOUR_D_DICOM_SLICES_PER_PHASE,
  getFourDDicomSeriesUrls,
  type FourDDicomMpId,
} from "../lib/fourDDicomSource";
import { generateMockScanResult, type FourDPostScanState } from "../lib/fourDTypes";

const PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"] as const;
const REQUEST_CONCURRENCY = 5;
const PREVIEW_SLICE_INDEX = Math.floor(FOUR_D_DICOM_SLICES_PER_PHASE / 2);

type LoadStatus = "waiting" | "loading" | "done" | "error";

interface PhaseLoadState {
  phaseIndex: number;
  completedBeds: number;
  activeBedNumber: number | null;
  activeFileCount: number;
  previewUrl: string | null;
  latestSourceBedNumber: number | null;
  status: LoadStatus;
  errorMessage: string | null;
}

interface FullscreenImageState {
  phaseIndex: number;
  phaseLabel: string;
  sourceBedNumber: number | null;
  imageUrl: string;
}

function parseFirstNumber(value?: string | null) {
  if (!value) return undefined;
  const first = value.split("\\")[0]?.trim();
  if (!first) return undefined;
  const parsed = Number(first);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp01(value: number) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function decodeDicomPreview(buffer: ArrayBuffer) {
  const byteArray = new Uint8Array(buffer);
  const dataSet = dicomParser.parseDicom(byteArray);

  const rows = dataSet.uint16("x00280010");
  const cols = dataSet.uint16("x00280011");
  const bitsAllocated = dataSet.uint16("x00280100") ?? 16;
  const pixelRepresentation = dataSet.uint16("x00280103") ?? 0;
  const photometricInterpretation = dataSet.string("x00280004") ?? "MONOCHROME2";
  const slope = parseFirstNumber(dataSet.string("x00281053")) ?? 1;
  const intercept = parseFirstNumber(dataSet.string("x00281052")) ?? 0;
  const windowCenter = parseFirstNumber(dataSet.string("x00281050"));
  const windowWidth = parseFirstNumber(dataSet.string("x00281051"));
  const pixelElement = dataSet.elements.x7fe00010;

  if (!rows || !cols || !pixelElement) {
    throw new Error("Missing DICOM pixel data");
  }

  const pixelCount = rows * cols;
  const pixelDataOffset = byteArray.byteOffset + pixelElement.dataOffset;
  const pixelDataLength = pixelElement.length;
  const view = new DataView(byteArray.buffer, pixelDataOffset, pixelDataLength);
  const values = new Float32Array(pixelCount);

  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < pixelCount; index += 1) {
    let raw = 0;
    if (bitsAllocated === 16) {
      raw = pixelRepresentation === 1 ? view.getInt16(index * 2, true) : view.getUint16(index * 2, true);
    } else {
      raw = view.getUint8(index);
    }
    const value = raw * slope + intercept;
    values[index] = value;
    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }

  const lower =
    windowCenter !== undefined && windowWidth !== undefined && windowWidth > 1
      ? windowCenter - windowWidth / 2
      : minValue;
  const upper =
    windowCenter !== undefined && windowWidth !== undefined && windowWidth > 1
      ? windowCenter + windowWidth / 2
      : maxValue;
  const range = Math.max(upper - lower, 1);
  const invert = photometricInterpretation.toUpperCase() === "MONOCHROME1";

  const maxPreviewEdge = 224;
  const scale = Math.min(1, maxPreviewEdge / Math.max(rows, cols));
  const previewWidth = Math.max(1, Math.round(cols * scale));
  const previewHeight = Math.max(1, Math.round(rows * scale));

  const canvas = document.createElement("canvas");
  canvas.width = previewWidth;
  canvas.height = previewHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context unavailable");
  }

  const imageData = context.createImageData(previewWidth, previewHeight);

  for (let y = 0; y < previewHeight; y += 1) {
    const sourceY = Math.min(rows - 1, Math.floor((y / previewHeight) * rows));
    for (let x = 0; x < previewWidth; x += 1) {
      const sourceX = Math.min(cols - 1, Math.floor((x / previewWidth) * cols));
      const sourceIndex = sourceY * cols + sourceX;
      let normalized = (values[sourceIndex] - lower) / range;
      normalized = clamp01(normalized);
      if (invert) normalized = 1 - normalized;
      const gray = Math.round(normalized * 255);
      const targetIndex = (y * previewWidth + x) * 4;
      imageData.data[targetIndex] = gray;
      imageData.data[targetIndex + 1] = gray;
      imageData.data[targetIndex + 2] = gray;
      imageData.data[targetIndex + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function fetchArrayBuffer(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.arrayBuffer();
}

async function loadBedPhaseSeries(
  mpId: FourDDicomMpId,
  phaseIndex: number,
  signal: AbortSignal,
  onProgress: (loadedFileCount: number) => void,
) {
  const urls = getFourDDicomSeriesUrls(phaseIndex, mpId);
  let loadedFileCount = 0;
  let nextIndex = 0;
  let previewUrl: string | null = null;

  const worker = async () => {
    while (nextIndex < urls.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const buffer = await fetchArrayBuffer(urls[currentIndex], signal);
      if (currentIndex === PREVIEW_SLICE_INDEX) {
        previewUrl = decodeDicomPreview(buffer);
      }
      loadedFileCount += 1;
      if (loadedFileCount === 1 || loadedFileCount === urls.length || loadedFileCount % 5 === 0) {
        onProgress(loadedFileCount);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(REQUEST_CONCURRENCY, urls.length) }, () => worker()),
  );

  return {
    previewUrl,
    fileCount: urls.length,
  };
}

function PhaseThumbnail({
  phase,
  totalBeds,
  onDoubleClick,
}: {
  phase: PhaseLoadState;
  totalBeds: number;
  onDoubleClick: (payload: FullscreenImageState) => void;
}) {
  const phaseLabel = PHASE_LABELS[phase.phaseIndex];
  const partialBedProgress =
    phase.activeBedNumber === null ? 0 : phase.activeFileCount / FOUR_D_DICOM_SLICES_PER_PHASE;
  const progressPercent = Math.round(
    ((phase.completedBeds + partialBedProgress) / Math.max(totalBeds, 1)) * 100,
  );
  const canOpenFullscreen = !!phase.previewUrl;

  return (
    <div className="group flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition hover:border-blue-400/70 hover:shadow-md">
      <div className="flex items-center justify-between border-b border-slate-700/80 bg-slate-900/95 px-2.5 py-1.5 text-[10px] font-bold text-slate-100">
        <span>Phase {phaseLabel}</span>
        <span className="text-[9px] text-slate-300">{phase.completedBeds}/{totalBeds} beds</span>
      </div>

      <button
        type="button"
        disabled={!canOpenFullscreen}
        onDoubleClick={() => {
          if (!phase.previewUrl) return;
          onDoubleClick({
            phaseIndex: phase.phaseIndex,
            phaseLabel,
            sourceBedNumber: phase.latestSourceBedNumber ?? phase.activeBedNumber,
            imageUrl: phase.previewUrl,
          });
        }}
        className="relative block min-h-0 w-full flex-1 bg-black text-left disabled:cursor-default"
      >
        {phase.previewUrl ? (
          <img src={phase.previewUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(37,99,235,0.22),rgba(2,6,23,0.96)_72%)]" />
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-2 py-2 text-white">
          <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className={`h-full rounded-full transition-all ${
                phase.status === "error"
                  ? "bg-rose-500"
                  : phase.status === "done"
                    ? "bg-emerald-400"
                    : "bg-[#4D94FF]"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {phase.status === "loading" && (
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span>床位 {phase.activeBedNumber} 加载中</span>
              <span>{phase.activeFileCount}/{FOUR_D_DICOM_SLICES_PER_PHASE}</span>
            </div>
          )}

          {phase.status === "done" && (
            <div className="text-[10px] font-bold text-emerald-300">已完成全部床位拼接</div>
          )}

          {phase.status === "waiting" && phase.completedBeds > 0 && (
            <div className="text-[10px] font-bold text-slate-200">等待下一个床位段并入</div>
          )}

          {phase.status === "waiting" && phase.completedBeds === 0 && (
            <div className="text-[10px] font-bold text-slate-400">等待队列中</div>
          )}

          {phase.status === "error" && (
            <div className="text-[10px] font-bold text-rose-300">{phase.errorMessage ?? "加载失败"}</div>
          )}
        </div>

        {phase.status === "loading" && (
          <div className="absolute right-2 top-8 flex items-center gap-1 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[9px] font-bold text-slate-100">
            <LoaderCircle size={10} className="animate-spin" />
            实时
          </div>
        )}
      </button>
    </div>
  );
}

export default function ImageLoadScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as FourDPostScanState | null;

  const phaseFilterState = useMemo<FourDPostScanState>(
    () => ({
      ...(routeState?.scanResult
        ? routeState
        : { scanResult: generateMockScanResult(FOUR_D_DICOM_MP_IDS.length, 10, 165.0) }),
      showSliceLoadingBeforeImageLoad: false,
    }),
    [routeState],
  );

  const [fullscreenImage, setFullscreenImage] = useState<FullscreenImageState | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [phaseLoads, setPhaseLoads] = useState<PhaseLoadState[]>(
    () =>
      PHASE_LABELS.map((_, phaseIndex) => ({
        phaseIndex,
        completedBeds: 0,
        activeBedNumber: null,
        activeFileCount: 0,
        previewUrl: null,
        latestSourceBedNumber: null,
        status: "waiting",
        errorMessage: null,
      })),
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      setGlobalError(null);

      for (let bedIndex = 0; bedIndex < FOUR_D_DICOM_MP_IDS.length; bedIndex += 1) {
        const mpId = FOUR_D_DICOM_MP_IDS[bedIndex];
        const bedNumber = bedIndex + 1;

        for (let phaseIndex = 0; phaseIndex < PHASE_LABELS.length; phaseIndex += 1) {
          if (cancelled) return;

          setPhaseLoads((prev) =>
            prev.map((phase) =>
              phase.phaseIndex !== phaseIndex
                ? phase
                : {
                    ...phase,
                    activeBedNumber: bedNumber,
                    activeFileCount: 0,
                    status: "loading",
                    errorMessage: null,
                  },
            ),
          );

          try {
            const result = await loadBedPhaseSeries(
              mpId,
              phaseIndex,
              controller.signal,
              (loadedFileCount) => {
                if (cancelled) return;
                setPhaseLoads((prev) =>
                  prev.map((phase) =>
                    phase.phaseIndex !== phaseIndex
                      ? phase
                      : {
                          ...phase,
                          activeBedNumber: bedNumber,
                          activeFileCount: loadedFileCount,
                          status: "loading",
                        },
                  ),
                );
              },
            );

            if (cancelled) return;

            setPhaseLoads((prev) =>
              prev.map((phase) =>
                phase.phaseIndex !== phaseIndex
                  ? phase
                  : {
                      ...phase,
                      completedBeds: phase.completedBeds + 1,
                      activeBedNumber: null,
                      activeFileCount: 0,
                      previewUrl: result.previewUrl ?? phase.previewUrl,
                      latestSourceBedNumber: bedNumber,
                      status: phase.completedBeds + 1 >= FOUR_D_DICOM_MP_IDS.length ? "done" : "waiting",
                      errorMessage: null,
                    },
              ),
            );
          } catch (error) {
            if (controller.signal.aborted) return;
            const message = error instanceof Error ? error.message : String(error);
            setGlobalError(`Failed at bed ${bedNumber}, phase ${PHASE_LABELS[phaseIndex]}: ${message}`);
            setPhaseLoads((prev) =>
              prev.map((phase) =>
                phase.phaseIndex !== phaseIndex
                  ? phase
                  : {
                      ...phase,
                      activeBedNumber: null,
                      activeFileCount: 0,
                      status: "error",
                      errorMessage: message,
                    },
              ),
            );
            return;
          }
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const totalBeds = FOUR_D_DICOM_MP_IDS.length;
  const completedTaskCount = phaseLoads.reduce((sum, phase) => sum + phase.completedBeds, 0);
  const totalTaskCount = totalBeds * PHASE_LABELS.length;
  const allLoaded = completedTaskCount === totalTaskCount && !globalError;

  return (
    <div className="relative flex h-full select-none flex-col bg-[#E5E7EB] text-slate-700">
      <div className="flex min-h-0 flex-1 overflow-hidden p-3">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {globalError && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] font-medium text-rose-700">
              {globalError}
            </div>
          )}

          <div className="min-h-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid h-full min-h-0 grid-cols-5 grid-rows-2 gap-2">
              {phaseLoads.map((phase) => (
                <PhaseThumbnail
                  key={phase.phaseIndex}
                  phase={phase}
                  totalBeds={totalBeds}
                  onDoubleClick={setFullscreenImage}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      <footer className="flex h-[72px] shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5">
        <div className="flex items-center gap-3 text-[12px]">
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[#1565C0]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1E64F0] text-[11px] font-black text-white">1</span>
            <span className="font-bold">图像加载</span>
          </div>
          <div className="h-px w-6 bg-slate-300" />
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[11px] font-black text-slate-700">2</span>
            <span className="font-medium">相位筛选</span>
          </div>
        </div>
        <button
          onClick={() => navigate("/phase-filter", { state: phaseFilterState })}
          disabled={!allLoaded}
          className={`flex items-center gap-1.5 rounded-md px-6 py-2 text-[12px] font-bold text-white shadow-sm ${
            !allLoaded ? "cursor-not-allowed bg-slate-300" : "bg-[#4D94FF] hover:bg-blue-600"
          }`}
        >
          下一步：相位筛选 <ChevronRight size={14} />
        </button>
      </footer>

      {fullscreenImage && (
        <div className="absolute inset-0 z-50 bg-black">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between bg-gradient-to-b from-black/75 via-black/35 to-transparent px-6 py-5 text-white">
            <div className="pointer-events-auto">
              <div className="text-[18px] font-bold">相位 {fullscreenImage.phaseLabel}</div>
              <div className="mt-1 text-[12px] text-slate-300">
                预览来自床位 {fullscreenImage.sourceBedNumber ?? "-"}，双击影像退出全屏
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFullscreenImage(null)}
              className="pointer-events-auto rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-white/15"
            >
              关闭
            </button>
          </div>
          <button
            type="button"
            onDoubleClick={() => setFullscreenImage(null)}
            className="block h-full w-full bg-black"
          >
            <img
              src={fullscreenImage.imageUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-contain"
            />
          </button>
        </div>
      )}
    </div>
  );
}
