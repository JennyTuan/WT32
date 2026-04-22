import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Info,
  AlertTriangle,
  ChevronRight,
  MousePointer2,
  Move,
  Sun,
  Pencil,
  RotateCcw,
} from "lucide-react";
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

function LungThumb({ phaseIdx, size = 140 }: { phaseIdx: number; size?: number }) {
  const breath = Math.sin((phaseIdx / 10) * Math.PI * 2) * 3;
  const dots = useMemo(() => {
    const arr: { x: number; y: number; r: number; o: number }[] = [];
    let seed = phaseIdx * 97 + 7;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0xffffffff;
    };
    for (let i = 0; i < 40; i++) arr.push({ x: rng() * 100, y: rng() * 100, r: rng() * 0.8 + 0.2, o: rng() * 0.25 + 0.1 });
    return arr;
  }, [phaseIdx]);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#05090f" />
      <ellipse cx={50} cy={52 + breath} rx={40} ry={36} fill="#b8bfc6" />
      <ellipse cx={35} cy={48 + breath} rx={14} ry={22} fill="#0a1420" />
      <ellipse cx={65} cy={48 + breath} rx={14} ry={22} fill="#0a1420" />
      <path d={`M30 ${42 + breath} Q34 ${50 + breath} 32 ${58 + breath}`} stroke="#e2e8f0" strokeWidth="0.6" fill="none" opacity="0.8" />
      <path d={`M70 ${42 + breath} Q66 ${50 + breath} 68 ${58 + breath}`} stroke="#e2e8f0" strokeWidth="0.6" fill="none" opacity="0.8" />
      <circle cx={50} cy={58 + breath} r={5} fill="#6b7280" opacity="0.8" />
      <ellipse cx={50} cy={82} rx={38} ry={6} fill="#1e293b" opacity="0.6" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="white" opacity={d.o} />
      ))}
    </svg>
  );
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
                                  <button
                                    key={seg.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedBedId(bed.id);
                                      setSegmentForBed(i, bed.id, seg.id);
                                    }}
                                    className={`mb-1 flex h-7 w-full items-center justify-between rounded px-2 text-left transition-colors ${
                                      active ? "bg-[#4D94FF] text-white" : "bg-white text-slate-600 hover:bg-blue-50"
                                    }`}
                                  >
                                    <span className="text-[10px] font-bold">{seg.candidateLabel}</span>
                                    <span className={`text-[9px] ${active ? "text-white/80" : "text-slate-400"}`}>{seg.time}</span>
                                  </button>
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
              <MprTile label="Axial" rightLabel="A" accent="green">
                <div className="relative h-full w-full">
                  <LungThumb phaseIdx={selectedPhaseIdx} size={180} />
                  <CrossHair />
                  <div className="absolute bottom-1 left-2 text-[9px] text-slate-400">R</div>
                </div>
              </MprTile>
              <MprTile label="Coronal" rightLabel="H" accent="green">
                <div className="relative h-full w-full bg-[#05090f]">
                  <svg width="100%" height="100%" viewBox="0 0 100 100">
                    <rect width="100" height="100" fill="#05090f" />
                    <rect x="20" y="15" width="60" height="70" fill="#b8bfc6" rx="6" />
                    <rect x="28" y="22" width="18" height="55" fill="#0a1420" />
                    <rect x="54" y="22" width="18" height="55" fill="#0a1420" />
                  </svg>
                  <CrossHair />
                </div>
              </MprTile>
              <MprTile label="Sagittal" rightLabel="H" accent="red">
                <div className="relative h-full w-full bg-[#05090f]">
                  <svg width="100%" height="100%" viewBox="0 0 100 100">
                    <rect width="100" height="100" fill="#05090f" />
                    <ellipse cx="50" cy="52" rx="32" ry="38" fill="#b8bfc6" />
                    <ellipse cx="52" cy="48" rx="16" ry="26" fill="#0a1420" />
                  </svg>
                  <CrossHair />
                  <div className="absolute bottom-1 left-2 text-[9px] text-slate-400">A</div>
                </div>
              </MprTile>
              <MprTile label="3D Preview">
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0f1620] via-[#0a0f17] to-[#1a0806]">
                  <svg width="70%" height="70%" viewBox="0 0 100 100">
                    <path
                      d="M50 20 C30 25 22 45 25 65 C28 80 42 85 50 80 C58 85 72 80 75 65 C78 45 70 25 50 20 Z"
                      fill="#c44a3a"
                      opacity="0.9"
                    />
                    <path d="M35 40 Q30 55 35 70 M65 40 Q70 55 65 70 M50 30 V78" stroke="#8b2a1e" strokeWidth="1" fill="none" />
                  </svg>
                </div>
              </MprTile>
            </div>

            <aside className="flex w-[48px] shrink-0 flex-col items-center gap-1 border-l border-[#B0C4DE] bg-[#0F172A] py-2">
              {[MousePointer2, Move, Sun, Pencil, RotateCcw].map((Icon, i) => {
                const active = i === 0;
                return (
                  <button
                    key={i}
                    className="flex h-9 w-9 items-center justify-center rounded-[8px] transition-all"
                    style={{
                      background: active ? "#3B82F6" : "transparent",
                      color: active ? "#ffffff" : "#94A3B8",
                      boxShadow: active ? "0 0 12px rgba(59,130,246,0.55)" : "none",
                    }}
                  >
                    <Icon size={16} strokeWidth={1.5} />
                  </button>
                );
              })}
            </aside>
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
