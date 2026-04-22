/**
 * ImageLoadScreen — 图像加载 4 步向导
 *
 * Step 1 选择相位 → Step 2 检查重复数据 → Step 3 确认重建 → Step 4 重建中
 * 完成后进入 /image-viewer。
 */

import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Info,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  MousePointer2,
  Move,
  Sun,
  Pencil,
  RotateCcw,
  ChevronDown,
  LayoutGrid,
  Square,
} from "lucide-react";

// ─── 类型 ─────────────────────────────────────────────────────────────────────

type PhaseStatus = "ok" | "duplicate" | "missing";

interface DataSegment {
  id: string;
  time: string;
  quality: "优秀" | "良好" | "一般";
  bedPosition: string;
  sliceCount: number;
  avgDose: string;
  clarity: number; // 0-10
  noise: number;   // 0-10
  motion: number;  // 0-10
}

interface PhaseData {
  label: string;           // "0%" ~ "90%"
  status: PhaseStatus;
  segments: DataSegment[]; // duplicate 时 >=2 段；ok 时 1 段；missing 时 0 段
  selectedSegmentId?: string;
}

// ─── Mock 数据 ────────────────────────────────────────────────────────────────

const PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];

function makeSegment(idx: number, phaseIdx: number): DataSegment {
  const times = ["12:34:56.78", "12:45:12.34", "12:55:45.67"];
  const qualities: DataSegment["quality"][] = ["优秀", "良好", "一般"];
  const clarities = [9, 7, 6];
  const noises = [8, 7, 5];
  const motions = [9, 7, 6];
  return {
    id: `seg-${phaseIdx}-${idx}`,
    time: times[idx] ?? "—",
    quality: qualities[idx] ?? "良好",
    bedPosition: "450.0 - 500.0 mm",
    sliceCount: 280,
    avgDose: "CTDIvol 8.5 mGy",
    clarity: clarities[idx] ?? 8,
    noise: noises[idx] ?? 7,
    motion: motions[idx] ?? 8,
  };
}

function buildMockPhases(): PhaseData[] {
  return PHASE_LABELS.map((label, i) => {
    const status: PhaseStatus = i === 0 ? "duplicate" : "ok";
    const segCount = status === "duplicate" ? 3 : 1;
    const segments = Array.from({ length: segCount }, (_, si) => makeSegment(si, i));
    return {
      label,
      status,
      segments,
      selectedSegmentId: segments[0]?.id,
    };
  });
}

// ─── 缩略图（SVG，模拟肺部 CT 轴位） ──────────────────────────────────────────

function LungThumb({ phaseIdx, size = 140 }: { phaseIdx: number; size?: number }) {
  const breath = Math.sin((phaseIdx / 10) * Math.PI * 2) * 3;
  const dots = useMemo(() => {
    const arr: { x: number; y: number; r: number; o: number }[] = [];
    let seed = phaseIdx * 97 + 7;
    const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
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

// ─── 步骤条 ───────────────────────────────────────────────────────────────────

const STEPS = ["选择相位", "检查重复数据", "确认重建", "重建中"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors ${
                active
                  ? "bg-blue-50 text-blue-600"
                  : done
                    ? "text-blue-500"
                    : "text-slate-400"
              }`}
            >
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  active
                    ? "bg-[#4D94FF] text-white"
                    : done
                      ? "bg-blue-100 text-blue-600"
                      : "bg-slate-200 text-slate-500"
                }`}
              >
                {done ? <Check size={12} /> : i + 1}
              </div>
              <span className="text-[12px] font-bold">{label}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-300" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── 相位卡片 ─────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: PhaseStatus }) {
  const color =
    status === "ok" ? "bg-green-500"
    : status === "duplicate" ? "bg-yellow-400"
    : "bg-red-500";
  return <div className={`h-2.5 w-2.5 rounded-full ${color}`} />;
}

interface PhaseCardProps {
  phase: PhaseData;
  phaseIdx: number;
  selected: boolean;
  onClick: () => void;
}

function PhaseCard({ phase, phaseIdx, selected, onClick }: PhaseCardProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col overflow-hidden rounded-lg border-2 bg-white text-left transition-all active:scale-[0.98] ${
        selected
          ? "border-[#4D94FF] shadow-[0_0_0_3px_rgba(77,148,255,0.15)]"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      {/* 顶部信息条 */}
      <div className="flex items-center justify-between px-2.5 py-2">
        <span className="text-[12px] font-bold text-slate-700">Phase {phase.label}</span>
        {selected ? (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#4D94FF]">
            <Check size={10} className="text-white" />
          </div>
        ) : (
          <StatusDot status={phase.status} />
        )}
      </div>

      {/* 冲突警告图标（选中时也显示） */}
      {phase.status === "duplicate" && selected && (
        <div className="absolute left-2 top-8 rounded-full bg-amber-100 p-1">
          <AlertTriangle size={10} className="text-amber-500" />
        </div>
      )}

      {/* 缩略图 */}
      <div className="flex items-center justify-center bg-black">
        <LungThumb phaseIdx={phaseIdx} size={140} />
      </div>

      {/* 选中且冲突时底部提示 */}
      {phase.status === "duplicate" && selected && (
        <div className="border-t border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[10px] text-slate-600">
          重复数据: <span className="font-bold text-amber-600">{phase.segments.length} 段</span>
        </div>
      )}
    </button>
  );
}

// ─── MPR 预览小格 ─────────────────────────────────────────────────────────────

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
    <div className="relative overflow-hidden rounded border border-slate-300 bg-black">
      <div className="absolute left-2 top-1.5 text-[10px] font-bold text-slate-200">{label}</div>
      {rightLabel && (
        <div className={`absolute right-2 top-1.5 text-[10px] font-bold ${accentClass}`}>{rightLabel}</div>
      )}
      <div className="flex h-full items-center justify-center">{children}</div>
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

// ─── 进度条 ───────────────────────────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = (value / 10) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="w-[64px] shrink-0 text-[11px] text-slate-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-[32px] shrink-0 text-right text-[11px] font-bold text-slate-700">{value}/10</span>
    </div>
  );
}

// ─── 床位加载缩略图网格（子阶段 1A） ─────────────────────────────────────────

interface BedLoadingGridProps {
  bedCount: number;
  slicesPerBed: number;
  loadedSlices: number;
}

function BedLoadingGrid({ bedCount, slicesPerBed, loadedSlices }: BedLoadingGridProps) {
  const total = bedCount * slicesPerBed;
  const currentBed = Math.min(Math.floor(loadedSlices / slicesPerBed), bedCount - 1);
  const allDone = loadedSlices >= total;
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      {/* 顶部状态行 */}
      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[#4D94FF]" />
          <span className="text-[12px] font-bold text-slate-700">
            图像加载中 · 床 {Math.min(currentBed + 1, bedCount)} / {bedCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-[180px] overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[#4D94FF] transition-all"
              style={{ width: `${(loadedSlices / total) * 100}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-slate-600">
            {loadedSlices} / {total}
          </span>
        </div>
      </div>

      {/* 床位窗格网格：每床一个窗格，展示当前加载中的切片 */}
      <div className="grid flex-1 grid-cols-5 grid-rows-2 gap-2">
        {Array.from({ length: bedCount }, (_, bedIdx) => {
          const bedStart = bedIdx * slicesPerBed;
          const bedLoaded = Math.max(0, Math.min(loadedSlices - bedStart, slicesPerBed));
          const isActive = bedIdx === currentBed && !allDone;
          const isDone = bedLoaded >= slicesPerBed;
          const isWaiting = bedLoaded === 0 && !isActive;
          // 当前切片索引（加载中时正在填充这张；完成后定格在最后一张）
          const currentSlice = isDone ? slicesPerBed : bedLoaded;
          const pct = (bedLoaded / slicesPerBed) * 100;

          return (
            <div
              key={bedIdx}
              className={`relative flex flex-col overflow-hidden rounded-md border bg-white shadow-sm ${
                isActive
                  ? "border-[#4D94FF] shadow-[0_0_0_2px_rgba(77,148,255,0.18)]"
                  : isDone
                    ? "border-green-400"
                    : "border-slate-200"
              }`}
            >
              {/* 顶部标签 */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-2 py-1">
                <span className="text-[10px] font-bold text-slate-700">床位 {bedIdx + 1}</span>
                <span
                  className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                    isDone
                      ? "bg-green-100 text-green-600"
                      : isActive
                        ? "bg-blue-100 text-blue-600"
                        : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {isDone ? "已完成" : isActive ? "加载中" : "等待中"}
                </span>
              </div>

              {/* 图像显示区 */}
              <div className="relative flex flex-1 items-center justify-center bg-black">
                {isWaiting ? (
                  <div className="text-[10px] text-slate-500">等待加载</div>
                ) : (
                  <LungThumb phaseIdx={(bedIdx * 3 + currentSlice) % 10} size={140} />
                )}
                {/* 右上：切片计数 */}
                {!isWaiting && (
                  <div className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-slate-100">
                    {currentSlice}/{slicesPerBed}
                  </div>
                )}
                {/* 扫描线动画（加载中） */}
                {isActive && (
                  <div
                    className="pointer-events-none absolute inset-x-0 h-[2px] bg-blue-400/80 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                    style={{ top: `${pct}%` }}
                  />
                )}
              </div>

              {/* 底部进度条 */}
              <div className="h-1 w-full bg-slate-100">
                <div
                  className={`h-full transition-all ${isDone ? "bg-green-500" : "bg-[#4D94FF]"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 主界面 ───────────────────────────────────────────────────────────────────

export default function ImageLoadScreen() {
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [phases, setPhases] = useState<PhaseData[]>(() => buildMockPhases());
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(0);
  const [rebuildProgress, setRebuildProgress] = useState(0);

  // ─ 床位加载子阶段 ─
  const BED_COUNT = 10;
  const SLICES_PER_BED = 32;
  const TOTAL_SLICES = BED_COUNT * SLICES_PER_BED;
  const [loadedSlices, setLoadedSlices] = useState(0);
  const loading = loadedSlices < TOTAL_SLICES;
  const loadingBedIdx = Math.min(Math.floor(loadedSlices / SLICES_PER_BED), BED_COUNT - 1);
  const loadingInBedIdx = loadedSlices % SLICES_PER_BED;

  // Step 0 进入时驱动加载动画
  useEffect(() => {
    if (step !== 0) return;
    setLoadedSlices(0);
    const timer = window.setInterval(() => {
      setLoadedSlices((n) => {
        if (n >= TOTAL_SLICES) {
          window.clearInterval(timer);
          return TOTAL_SLICES;
        }
        return n + 1;
      });
    }, 40);
    return () => window.clearInterval(timer);
  }, [step, TOTAL_SLICES]);

  const selectedPhase = phases[selectedPhaseIdx];
  const selectedSegment = selectedPhase?.segments.find(
    (s) => s.id === selectedPhase.selectedSegmentId
  );

  const setSegmentForPhase = (phaseIdx: number, segId: string) => {
    setPhases((prev) =>
      prev.map((p, i) => (i === phaseIdx ? { ...p, selectedSegmentId: segId } : p))
    );
  };

  const applySelectionToAll = () => {
    if (!selectedPhase || !selectedSegment) return;
    // 对每个冲突相位选用首个最优段（这里简单演示：每个相位选择自己 segments[0]）
    setPhases((prev) =>
      prev.map((p) =>
        p.status === "duplicate" && p.segments.length > 0
          ? { ...p, selectedSegmentId: p.segments[0].id }
          : p
      )
    );
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      navigate("/image-viewer");
    }
  };

  const handlePrev = () => {
    if (step === 0) navigate(-1);
    else setStep(step - 1);
  };

  // Step 4 自动进度
  useEffect(() => {
    if (step !== 3) {
      setRebuildProgress(0);
      return;
    }
    setRebuildProgress(0);
    const timer = window.setInterval(() => {
      setRebuildProgress((p) => {
        if (p >= 100) {
          window.clearInterval(timer);
          return 100;
        }
        return p + 2;
      });
    }, 80);
    return () => window.clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (step === 3 && rebuildProgress >= 100) {
      const t = window.setTimeout(() => navigate("/image-viewer"), 600);
      return () => window.clearTimeout(t);
    }
  }, [step, rebuildProgress, navigate]);

  return (
    <div className="flex h-full flex-col bg-[#EDF1F7] text-slate-700 select-none">
      {/* ═══ Header ═══ */}
      <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-3">
         
          <StepBar current={step} />
        </div>
        
      </header>

      {/* ═══ Body ═══ */}
      <div className="flex flex-1 overflow-hidden">
        {step === 0 && loading && (
          <section className="flex flex-1 flex-col px-5 py-4">
            <BedLoadingGrid
              bedCount={BED_COUNT}
              slicesPerBed={SLICES_PER_BED}
              loadedSlices={loadedSlices}
            />
          </section>
        )}
        {step === 0 && !loading && (
          <>
            {/* ─── 左：相位网格 ─── */}
            <section className="flex w-[200px] shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-[13px] font-bold text-slate-700">需处理的相位</h2>
                <Info size={12} className="text-slate-400" />
              </div>

              <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
                {phases
                  .map((p, i) => ({ p, i }))
                  .filter(({ p }) => p.status !== "ok")
                  .map(({ p, i }) => (
                    <PhaseCard
                      key={p.label}
                      phase={p}
                      phaseIdx={i}
                      selected={selectedPhaseIdx === i}
                      onClick={() => setSelectedPhaseIdx(i)}
                    />
                  ))}
              </div>
              {/* 图例 */}
              <div className="mt-3 flex flex-col gap-1.5 text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={11} className="text-amber-500" /> 存在重复数据
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-red-500" /> 数据缺失
                </div>
              </div>
            </section>

            {/* ─── 右：详情 ─── */}
            <section className="flex flex-1 flex-col overflow-auto px-5 py-4">
              {/* 顶部标题条 */}
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[13px] font-bold text-slate-700">
                  相位 {selectedPhase?.label} -
                  {selectedPhase?.status === "duplicate"
                    ? " 存在重复数据，请选择数据段"
                    : " 数据充足"}
                </span>
                {selectedPhase?.status === "duplicate" && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {selectedPhase.segments.length} 段可用
                  </span>
                )}
              </div>

              {/* 黄色提示 */}
              {selectedPhase?.status === "duplicate" && (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
                  <p className="text-[11px] text-amber-700">
                    该相位检测到 {selectedPhase.segments.length} 段重复数据，通过对多平面重建（MPR）比对后选择最优数据段用于重建。
                  </p>
                </div>
              )}

              {/* 段列表 + MPR */}
              <div className="mb-3 flex gap-3">
                {/* 左：段列表 */}
                <div className="flex w-[160px] shrink-0 flex-col gap-2">
                  {selectedPhase?.segments.map((seg, idx) => {
                    const active = seg.id === selectedPhase.selectedSegmentId;
                    return (
                      <button
                        key={seg.id}
                        onClick={() => setSegmentForPhase(selectedPhaseIdx, seg.id)}
                        className={`flex flex-col gap-1.5 rounded-md border p-2.5 text-left transition-colors ${
                          active
                            ? "border-[#4D94FF] bg-blue-50"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-bold text-slate-700">数据段 {idx + 1}</span>
                          <div
                            className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ${
                              active ? "border-[#4D94FF] bg-[#4D94FF]" : "border-slate-300"
                            }`}
                          >
                            {active && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <span>🕒</span> {seg.time}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          质量评分:{" "}
                          <span
                            className={
                              seg.quality === "优秀"
                                ? "font-bold text-green-600"
                                : seg.quality === "良好"
                                  ? "font-bold text-amber-600"
                                  : "font-bold text-slate-500"
                            }
                          >
                            {seg.quality}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 右：MPR 预览 + 工具栏 */}
                <div className="flex flex-1 gap-2">
                  <div className="flex flex-1 flex-col">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-slate-600">
                        当前预览: 数据段{" "}
                        {(selectedPhase?.segments.findIndex(
                          (s) => s.id === selectedPhase?.selectedSegmentId
                        ) ?? 0) + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50">
                          MPR <ChevronDown size={10} />
                        </button>
                        <button className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50">
                          <LayoutGrid size={11} />
                        </button>
                        <button className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50">
                          <Square size={11} />
                        </button>
                      </div>
                    </div>

                    <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-1.5" style={{ minHeight: 280 }}>
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
                        <div className="flex h-full w-full items-center justify-center bg-[#1a0806]">
                          <svg width="70%" height="70%" viewBox="0 0 100 100">
                            <path
                              d="M50 20 C30 25 22 45 25 65 C28 80 42 85 50 80 C58 85 72 80 75 65 C78 45 70 25 50 20 Z"
                              fill="#c44a3a"
                              opacity="0.9"
                            />
                            <path
                              d="M35 40 Q30 55 35 70 M65 40 Q70 55 65 70 M50 30 V78"
                              stroke="#8b2a1e"
                              strokeWidth="1"
                              fill="none"
                            />
                          </svg>
                        </div>
                      </MprTile>
                    </div>
                  </div>

                  {/* 工具栏 */}
                  <div className="flex w-9 flex-col items-center gap-1.5">
                    {[MousePointer2, Move, Sun, Pencil, RotateCcw].map((Icon, i) => (
                      <button
                        key={i}
                        className={`flex h-8 w-8 items-center justify-center rounded border ${
                          i === 0
                            ? "border-[#4D94FF] bg-blue-50 text-[#4D94FF]"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Icon size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {step === 1 && (
          <PlaceholderStep
            title="检查重复数据"
            description="系统正在核对所有相位的数据选择，确认无冲突后可进入下一步。"
          />
        )}

        {step === 2 && (
          <PlaceholderStep
            title="确认重建"
            description="请确认重建参数与选择的相位数据。点击下一步开始重建。"
          />
        )}

        {step === 3 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-12">
            <div className="text-[18px] font-bold text-slate-700">图像重建中…</div>
            <div className="h-2 w-[520px] overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[#4D94FF] transition-all"
                style={{ width: `${rebuildProgress}%` }}
              />
            </div>
            <div className="text-[12px] text-slate-500">{rebuildProgress}%</div>
          </div>
        )}
      </div>

      {/* ═══ Footer ═══ */}
      <footer className="flex h-[72px] shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <Info size={12} />
          {step === 0 && loading && `提示: 正在按床位加载图像，共 ${BED_COUNT} 个床位，完成后可进行相位选择。`}
          {step === 0 && !loading && "提示: 黄色标识表示该相位存在重复数据，需要您选择最优数据段进行重建。"}
          {step === 1 && "提示: 系统自动检查选择，发现异常会在此提醒。"}
          {step === 2 && "提示: 请再次确认所选数据和重建参数。"}
          {step === 3 && "提示: 重建完成后将自动进入图像浏览。"}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrev}
            disabled={step === 3 && rebuildProgress < 100}
            className="flex items-center gap-1.5 rounded-md border-2 border-[#4D94FF] bg-white px-6 py-2 text-[12px] font-bold text-[#4D94FF] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} /> 上一步
          </button>
          <button
            onClick={handleNext}
            disabled={(step === 0 && loading) || (step === 3 && rebuildProgress < 100)}
            className="flex items-center gap-1.5 rounded-md bg-[#4D94FF] px-6 py-2 text-[12px] font-bold text-white shadow-sm hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            下一步 <ChevronRight size={14} />
          </button>
        </div>
      </footer>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="w-[64px] shrink-0 text-slate-500">{label}</span>
      <span className="font-bold text-slate-700">{value}</span>
    </div>
  );
}

function PlaceholderStep({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-12 text-center">
      <div className="text-[18px] font-bold text-slate-700">{title}</div>
      <div className="max-w-[520px] text-[12px] text-slate-500">{description}</div>
    </div>
  );
}
