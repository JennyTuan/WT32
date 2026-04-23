import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, Layers3, LoaderCircle } from "lucide-react";
import { getFourDImageUrl } from "../lib/fourDImageSource";
import { generateMockScanResult, type FourDPostScanState } from "../lib/fourDTypes";

const PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];
const BED_COUNT = 9;

type LoadStatus = "waiting" | "loading" | "done";

interface BedLoadState {
  id: number;
  progress: number;
  status: LoadStatus;
}

interface FullscreenImageState {
  phaseIndex: number;
  bedNumber: number;
  imageUrl: string;
}

function buildWavePath(bedNumber: number, width: number, height: number) {
  const points = Array.from({ length: 80 }, (_, idx) => {
    const x = (idx / 79) * width;
    const base = Math.sin(idx * 0.28 + bedNumber * 0.55) * 0.55;
    const detail = Math.sin(idx * 0.83 + bedNumber) * 0.18;
    const drift = Math.cos(idx * 0.12 + bedNumber * 0.4) * 0.08;
    const y = height * (0.5 - (base + detail + drift) * 0.34);
    return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  return points.join(" ");
}

function PhaseThumbnail({
  phaseIndex,
  bedNumber,
  loaded,
  onDoubleClick,
}: {
  phaseIndex: number;
  bedNumber: number;
  loaded: boolean;
  onDoubleClick: (payload: FullscreenImageState) => void;
}) {
  const view = "axial";
  const slice = Math.min(140, 44 + bedNumber * 6 + phaseIndex * 4);
  const imageUrl = getFourDImageUrl(phaseIndex, view, slice);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
      <div className="flex items-center justify-between border-b border-slate-700/80 bg-slate-900/95 px-2 py-1.5 text-[10px] font-bold">
        <span className="text-slate-100">Phase {PHASE_LABELS[phaseIndex]}</span>
        <span className="text-slate-400">{view.toUpperCase()}</span>
      </div>
      <button
        type="button"
        onDoubleClick={() => onDoubleClick({ phaseIndex, bedNumber, imageUrl })}
        className="relative block aspect-[4/3] w-full bg-black text-left"
      >
        <img src={imageUrl} alt="" draggable={false} className="h-full w-full object-contain" />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/72">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] font-bold text-slate-100">
              <LoaderCircle size={12} className="animate-spin" />
              正在加载
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 py-1 text-[10px] text-slate-200">
          床位 {bedNumber}
        </div>
      </button>
    </div>
  );
}

function WaveformPanel({ bedNumber }: { bedNumber: number }) {
  const width = 860;
  const height = 180;
  const path = useMemo(() => buildWavePath(bedNumber, width, height), [bedNumber]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[15px] font-bold text-slate-800">床位 {bedNumber} 波形图</div>
          <div className="text-[11px] text-slate-500">当前加载床位对应的呼吸波形预览</div>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">已定位床位 {bedNumber}</div>
      </div>
      <div className="relative flex-1 overflow-hidden rounded-lg border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)]">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
          {Array.from({ length: 9 }).map((_, idx) => {
            const x = (idx / 8) * width;
            return <line key={`v-${idx}`} x1={x} x2={x} y1="0" y2={height} stroke="rgba(148,163,184,0.18)" strokeWidth="1" />;
          })}
          {Array.from({ length: 5 }).map((_, idx) => {
            const y = (idx / 4) * height;
            return <line key={`h-${idx}`} x1="0" x2={width} y1={y} y2={y} stroke="rgba(148,163,184,0.18)" strokeWidth="1" />;
          })}
          <path d={path} fill="none" stroke="#0F766E" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-4 pb-2 text-[10px] font-medium text-slate-500">
          {PHASE_LABELS.slice(0, 5).map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ImageLoadScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as FourDPostScanState | null;
  const phaseFilterState = useMemo<FourDPostScanState>(
    () => ({
      ...(routeState?.scanResult ? routeState : { scanResult: generateMockScanResult(9, 10, 165.0) }),
      showSliceLoadingBeforeImageLoad: false,
    }),
    [routeState],
  );

  const [selectedBedNumber, setSelectedBedNumber] = useState(1);
  const [fullscreenImage, setFullscreenImage] = useState<FullscreenImageState | null>(null);
  const [bedLoads, setBedLoads] = useState<BedLoadState[]>(
    Array.from({ length: BED_COUNT }, (_, idx) => ({
      id: idx + 1,
      progress: idx === 0 ? 18 : 0,
      status: idx === 0 ? "loading" : "waiting",
    })),
  );

  useEffect(() => {
    const activeLoadingBed = bedLoads.find((bed) => bed.status === "loading");
    if (!activeLoadingBed) return;

    const timer = window.setTimeout(() => {
      setBedLoads((prev) =>
        prev.map((bed) => {
          if (bed.id !== activeLoadingBed.id) return bed;
          const nextProgress = Math.min(100, bed.progress + 16);
          return {
            ...bed,
            progress: nextProgress,
            status: nextProgress >= 100 ? "done" : "loading",
          };
        }),
      );
    }, 260);

    return () => window.clearTimeout(timer);
  }, [bedLoads]);

  useEffect(() => {
    const doneCount = bedLoads.filter((bed) => bed.status === "done").length;
    const loadingBed = bedLoads.find((bed) => bed.status === "loading");
    if (loadingBed || doneCount >= BED_COUNT) return;

    setBedLoads((prev) =>
      prev.map((bed) =>
        bed.id === doneCount + 1
          ? { ...bed, status: "loading", progress: bed.progress > 0 ? bed.progress : 12 }
          : bed,
      ),
    );
  }, [bedLoads]);

  useEffect(() => {
    const selectedLoad = bedLoads.find((bed) => bed.id === selectedBedNumber);
    if (selectedLoad?.status === "done") return;
    const loadingBed = bedLoads.find((bed) => bed.status === "loading");
    if (!loadingBed || loadingBed.id === selectedBedNumber) return;
    setSelectedBedNumber(loadingBed.id);
  }, [bedLoads, selectedBedNumber]);

  const selectedBedLoad = bedLoads.find((bed) => bed.id === selectedBedNumber) ?? null;
  const loadedBedCount = bedLoads.filter((bed) => bed.status === "done").length;
  const bedQueue = useMemo(
    () =>
      Array.from({ length: BED_COUNT }, (_, idx) => ({
        id: idx + 1,
        label: `床位 ${idx + 1}`,
        load: bedLoads[idx],
      })),
    [bedLoads],
  );

  return (
    <div className="relative flex h-full select-none flex-col bg-[#E5E7EB] text-slate-700">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex w-[240px] shrink-0 flex-col border-r border-slate-200 bg-[#F7F8FA] px-3 py-4">
          <div className="mb-3 flex items-center gap-2">
            <Layers3 size={14} className="text-slate-500" />
            <h2 className="text-[13px] font-bold text-slate-700">床位队列</h2>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {bedQueue.map((bed) => {
              const active = bed.id === selectedBedNumber;
              const isDone = bed.load.status === "done";
              const isLoading = bed.load.status === "loading";
              const statusText = isDone ? "已完成" : isLoading ? `加载中 ${bed.load.progress}%` : "待加载";

              return (
                <button
                  key={bed.id}
                  type="button"
                  onClick={() => setSelectedBedNumber(bed.id)}
                  className={`rounded-xl border px-3 py-3 text-left transition-all ${
                    active
                      ? "border-[#1E64F0] bg-blue-50 shadow-[0_6px_18px_rgba(30,100,240,0.12)]"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[13px] font-bold ${active ? "text-[#0F4CAD]" : "text-slate-700"}`}>{bed.label}</span>
                    <span className="flex items-center gap-1">
                      {isDone && <CheckCircle2 size={13} className="text-emerald-600" />}
                      {isLoading && <LoaderCircle size={13} className="animate-spin text-[#1E64F0]" />}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isDone
                            ? "bg-emerald-100 text-emerald-700"
                            : isLoading
                              ? "bg-blue-100 text-[#1565C0]"
                              : active
                                ? "bg-[#1E64F0] text-white"
                                : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isDone ? "完成" : isLoading ? "加载中" : `${bed.id}/9`}
                      </span>
                    </span>
                  </div>
                  <div className={`mt-2 text-[11px] ${active ? "text-[#3B82F6]" : "text-slate-500"}`}>{statusText}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isDone ? "bg-emerald-500" : isLoading ? "bg-[#1E64F0]" : "bg-slate-300"
                      }`}
                      style={{ width: `${Math.max(bed.load.progress, bed.load.status === "waiting" ? 4 : 8)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[18px] font-bold text-slate-800">图像加载</div>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 shadow-sm">当前床位：{selectedBedNumber}</div>
              <div className="rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 shadow-sm">已加载 {loadedBedCount}/{BED_COUNT}</div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-[1.45fr_0.55fr] gap-3">
            <div className="min-h-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[14px] font-bold text-slate-800">Axial 相位影像</div>
                <div className="text-[11px] text-slate-500">双击任一缩略图可全屏查看，再双击退出</div>
              </div>
              <div className="grid h-[calc(100%-28px)] min-h-0 grid-cols-5 grid-rows-2 gap-2">
                {PHASE_LABELS.map((_, phaseIndex) => (
                  <PhaseThumbnail
                    key={`${selectedBedNumber}-${phaseIndex}`}
                    phaseIndex={phaseIndex}
                    bedNumber={selectedBedNumber}
                    loaded={selectedBedLoad?.status === "done"}
                    onDoubleClick={setFullscreenImage}
                  />
                ))}
              </div>
            </div>

            <div className="min-h-0">
              <div className="h-full min-h-0">
                <div className="relative h-full">
                  <WaveformPanel bedNumber={selectedBedNumber} />
                  {selectedBedLoad?.status !== "done" && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/75 backdrop-blur-[1px]">
                      <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-bold text-slate-600 shadow-sm">
                        床位 {selectedBedNumber} 波形载入中 {selectedBedLoad?.progress ?? 0}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
          disabled={loadedBedCount < BED_COUNT}
          className={`flex items-center gap-1.5 rounded-md px-6 py-2 text-[12px] font-bold text-white shadow-sm ${
            loadedBedCount < BED_COUNT ? "cursor-not-allowed bg-slate-300" : "bg-[#4D94FF] hover:bg-blue-600"
          }`}
        >
          下一步：相位筛选
          <ChevronRight size={14} />
        </button>
      </footer>

      {fullscreenImage && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/92">
          <div className="flex h-full w-full flex-col px-8 py-6">
            <div className="mb-4 flex items-center justify-between text-white">
              <div>
                <div className="text-[18px] font-bold">Axial · Phase {PHASE_LABELS[fullscreenImage.phaseIndex]}</div>
                <div className="mt-1 text-[12px] text-slate-300">床位 {fullscreenImage.bedNumber}，双击影像返回主界面</div>
              </div>
              <button
                type="button"
                onClick={() => setFullscreenImage(null)}
                className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-white/15"
              >
                退出全屏
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-black">
              <img
                src={fullscreenImage.imageUrl}
                alt=""
                draggable={false}
                className="max-h-full max-w-full object-contain"
                onDoubleClick={() => setFullscreenImage(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
