import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Info,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { getFourDImageUrl } from "../lib/fourDImageSource";
import { generateMockScanResult, type FourDPostScanState } from "../lib/fourDTypes";

type PhaseStatus = "ok" | "duplicate" | "missing";

interface DataSegment {
  id: string;
  time: string;
  quality: "优秀" | "良好" | "一般";
  candidateLabel: string;
  range: string;
  sliceCount: number;
  avgDose: string;
  clarity: number;
  noise: number;
  motion: number;
}

interface BedPhaseData {
  id: string;
  label: string;
  range: string;
  segments: DataSegment[];
  selectedSegmentId?: string;
}

interface PhaseData {
  label: string;
  status: PhaseStatus;
  beds: BedPhaseData[];
}

const PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];
const PREVIEW_SLICES = {
  axial: 71,
  coronal: 256,
  sagittal: 256,
} as const;

function makeSegment(idx: number, phaseIdx: number, bedIdx: number): DataSegment {
  const times = ["12:34:56.78", "12:45:12.34", "12:55:45.67", "13:02:18.22"];
  const qualities: DataSegment["quality"][] = ["优秀", "良好", "一般"];
  const clarities = [9, 7, 6];
  const noises = [8, 7, 5];
  const motions = [9, 7, 6];
  return {
    id: `seg-${phaseIdx}-${bedIdx}-${idx}`,
    time: times[(idx + bedIdx) % times.length] ?? "—",
    quality: qualities[idx] ?? "良好",
    candidateLabel: `候选 ${idx + 1}`,
    range: `${390 + bedIdx * 30}.0 - ${440 + bedIdx * 30}.0 mm`,
    sliceCount: 280,
    avgDose: `CTDIvol ${(8.2 + bedIdx * 0.3).toFixed(1)} mGy`,
    clarity: clarities[idx] ?? 8,
    noise: noises[idx] ?? 7,
    motion: motions[idx] ?? 8,
  };
}

function buildMockPhases(): PhaseData[] {
  const duplicateConfig: Record<number, Array<{ bedNo: number; count: number }>> = {
    0: [
      { bedNo: 3, count: 3 },
      { bedNo: 7, count: 2 },
    ],
    3: [{ bedNo: 2, count: 2 }],
    6: [
      { bedNo: 5, count: 3 },
      { bedNo: 8, count: 2 },
    ],
  };

  return PHASE_LABELS.map((label, i) => {
    const duplicateBeds = duplicateConfig[i] ?? [];
    const status: PhaseStatus = duplicateBeds.length > 0 ? "duplicate" : "ok";
    const beds: BedPhaseData[] = duplicateBeds.map(({ bedNo, count }) => {
      const bedIdx = bedNo - 1;
      const range = `${390 + bedIdx * 30}.0 - ${440 + bedIdx * 30}.0 mm`;
      const segments = Array.from({ length: count }, (_, si) => makeSegment(si, i, bedIdx));
      return {
        id: `bed-${i}-${String(bedNo).padStart(2, "0")}`,
        label: `床位 ${String(bedNo).padStart(2, "0")}`,
        range,
        segments,
        selectedSegmentId: segments[0]?.id,
      };
    });
    return { label, status, beds };
  });
}

function MprTile({
  label,
  rightLabel,
  accent,
  children,
}: {
  label: string;
  rightLabel?: string;
  accent?: "green" | "red";
  children: React.ReactNode;
}) {
  const accentClass = accent === "green" ? "text-green-400" : "text-red-400";
  return (
    <div className="relative overflow-hidden bg-black">
      <div className="pointer-events-none absolute left-2 top-1.5 z-10 text-[10px] font-bold tracking-wide text-[#CFD8DC]">{label}</div>
      {rightLabel && (
        <div className={`pointer-events-none absolute right-2 top-1.5 z-10 text-[10px] font-bold ${accentClass}`}>
          {rightLabel}
        </div>
      )}
      <div className="flex h-full w-full items-center justify-center">{children}</div>
    </div>
  );
}

function CrossHair() {
  return (
    <>
      <div className="absolute left-0 right-0 top-1/2 h-px bg-green-500/60" />
      <div className="absolute bottom-0 top-0 left-1/2 w-px bg-red-500/60" />
    </>
  );
}

function FourDPreviewImage({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="h-full w-full object-contain"
    />
  );
}

export default function ImageLoadScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as FourDPostScanState | null;
  const fourDViewerState = useMemo<FourDPostScanState>(
    () => (routeState?.scanResult ? routeState : { scanResult: generateMockScanResult(9, 10, 165.0) }),
    [routeState],
  );

  const [phases, setPhases] = useState<PhaseData[]>(() => buildMockPhases());
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(0);
  const [selectedBedId, setSelectedBedId] = useState("bed-0-03");
  const previewUrls = useMemo(
    () => ({
      axial: getFourDImageUrl(selectedPhaseIdx, "axial", PREVIEW_SLICES.axial),
      coronal: getFourDImageUrl(selectedPhaseIdx, "coronal", PREVIEW_SLICES.coronal),
      sagittal: getFourDImageUrl(selectedPhaseIdx, "sagittal", PREVIEW_SLICES.sagittal),
    }),
    [selectedPhaseIdx],
  );

  const setSegmentForBed = (phaseIdx: number, bedId: string, segId: string) => {
    setPhases((prev) =>
      prev.map((phase, i) =>
        i === phaseIdx
          ? {
              ...phase,
              beds: phase.beds.map((bed) => (bed.id === bedId ? { ...bed, selectedSegmentId: segId } : bed)),
            }
          : phase,
      ),
    );
  };

  return (
    <div className="flex h-full flex-col bg-[#EDF1F7] text-slate-700 select-none">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[13px] font-bold text-slate-700">相位数据选择</h2>
            <Info size={12} className="text-slate-400" />
          </div>

          <div className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {phases
              .map((p, i) => ({ p, i }))
              .filter(({ p }) => p.status !== "ok")
              .map(({ p, i }) => {
                const phaseActive = selectedPhaseIdx === i;
                return (
                  <div
                    key={p.label}
                    className={`overflow-hidden rounded-md border bg-white transition-shadow ${phaseActive ? "border-[#4D94FF]/50 shadow-sm" : "border-slate-200"}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPhaseIdx(i);
                        setSelectedBedId(p.beds[0]?.id ?? "");
                      }}
                      className={`flex h-9 w-full items-center justify-between px-2.5 text-left transition-colors ${
                        phaseActive ? "bg-blue-50 text-[#1565C0]" : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <span className="text-[12px] font-black">Phase {p.label}</span>
                      <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                        <AlertTriangle size={10} /> 待选择
                      </span>
                    </button>

                    {phaseActive && (
                      <div className="border-t border-slate-100 bg-slate-50 py-1">
                        {p.beds.map((bed) => (
                          <div key={bed.id} className="mx-1 rounded">
                            <div
                              className={`flex h-8 w-full items-center justify-between rounded px-2 text-left ${
                                selectedBedId === bed.id ? "bg-white text-[#37474F] shadow-sm" : "text-slate-600"
                              }`}
                            >
                              <span className="text-[11px] font-bold">{bed.label}</span>
                              <span className="text-[9px] text-slate-400">{bed.range}</span>
                            </div>

                            <div className="ml-3 border-l border-slate-200 py-1 pl-2">
                              {bed.segments.map((seg) => {
                                const active = seg.id === bed.selectedSegmentId;
                                return (
                                  <label
                                    key={seg.id}
                                    className={`mb-1 flex h-7 w-full cursor-pointer items-center justify-between rounded border px-2 text-left transition-colors ${
                                      active ? "border-[#4D94FF] bg-blue-50 text-[#1565C0]" : "border-slate-200 bg-white text-slate-600 hover:bg-blue-50"
                                    }`}
                                    onClick={() => {
                                      setSelectedBedId(bed.id);
                                      setSegmentForBed(i, bed.id, seg.id);
                                    }}
                                  >
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <input
                                        type="radio"
                                        name={`segment-${bed.id}`}
                                        checked={active}
                                        onChange={() => {
                                          setSelectedBedId(bed.id);
                                          setSegmentForBed(i, bed.id, seg.id);
                                        }}
                                        className="h-3 w-3 accent-[#4D94FF]"
                                      />
                                      <span className="truncate text-[10px] font-bold">{seg.candidateLabel}</span>
                                    </span>
                                    <span className={`shrink-0 text-[9px] ${active ? "text-[#4D94FF]" : "text-slate-400"}`}>{seg.time}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          <div className="mt-3 flex flex-col gap-1.5 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={11} className="text-amber-500" /> 存在床位相位重复
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500" /> 数据缺失
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-[#B0C4DE] bg-black">
            <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-px bg-[#B0C4DE]">
              <div className="row-span-2 min-h-0">
                <MprTile label="Coronal" rightLabel="H" accent="green">
                  <div className="relative h-full w-full bg-[#05090f]">
                    <FourDPreviewImage src={previewUrls.coronal} />
                    <CrossHair />
                  </div>
                </MprTile>
              </div>
              <MprTile label="Sagittal" rightLabel="H" accent="red">
                <div className="relative h-full w-full bg-[#05090f]">
                  <FourDPreviewImage src={previewUrls.sagittal} />
                  <CrossHair />
                  <div className="absolute bottom-1 left-2 text-[9px] text-slate-400">A</div>
                </div>
              </MprTile>
              <MprTile label="Axial" rightLabel="A" accent="green">
                <div className="relative h-full w-full">
                  <FourDPreviewImage src={previewUrls.axial} />
                  <CrossHair />
                  <div className="absolute bottom-1 left-2 text-[9px] text-slate-400">R</div>
                </div>
              </MprTile>
            </div>
          </div>
        </section>
      </div>

      <footer className="flex h-[72px] shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <Info size={12} />
          提示: 黄色标识表示该相位中某个床位存在多个候选数据，需要您选择该床位用于重建的数据。
        </div>
        <button
          onClick={() => navigate("/image-viewer", { state: fourDViewerState })}
          className="flex items-center gap-1.5 rounded-md bg-[#4D94FF] px-6 py-2 text-[12px] font-bold text-white shadow-sm hover:bg-blue-600"
        >
          图像浏览 <ChevronRight size={14} />
        </button>
      </footer>
    </div>
  );
}
