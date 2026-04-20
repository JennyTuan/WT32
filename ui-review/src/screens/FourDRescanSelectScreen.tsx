/**
 * FourDRescanSelectScreen - 4D 扫描后的重扫数据选择页面
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  LayoutGrid,
  List,
  Network,
  Plus,
  RotateCcw,
  Settings,
  Siren,
  Sun,
  Trash2,
  User,
} from "lucide-react";

import { loadSelectedPatient } from "../lib/patientSession";
import type { FourDPostScanState, RescanChoices } from "../lib/fourDTypes";

const BED_TRAVEL_MM = 19.2;
const FIRST_ACQUISITION_EXPOSURE = "2s";
const SECOND_ACQUISITION_EXPOSURE = "6s";
// 4D-CT 呼吸记录典型时长（秒），用于将归一化时间 t 映射为真实秒数
const WAVEFORM_DURATION_SEC = 30;
// 相位分箱数（临床标准 10 相位：0%=吸气末，50%=呼气末）
const PHASE_BIN_COUNT = 10;

interface BedTimelineProps {
  bedCount: number;
  rescanRange: [number, number];
  choices: RescanChoices;
  onBedClick: (bedIdx: number) => void;
}

function BedTimeline({ bedCount, rescanRange, choices, onBedClick }: BedTimelineProps) {
  const [start, end] = rescanRange;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-1">
        {Array.from({ length: bedCount }, (_, bedIdx) => {
          const inRescan = bedIdx >= start && bedIdx <= end;
          const choice = choices[bedIdx];

          return (
            <div key={bedIdx} className="flex flex-1 flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => inRescan && onBedClick(bedIdx)}
                disabled={!inRescan}
                title={inRescan ? `床位 ${bedIdx + 1}：点击切换重扫选择` : `床位 ${bedIdx + 1}`}
                className={`w-full rounded transition-all ${
                  inRescan
                    ? choice === "rescan"
                      ? "h-[52px] cursor-pointer border-2 border-[#2563EB] bg-[#4D94FF] hover:brightness-110 active:scale-95"
                      : "h-[52px] cursor-pointer border-2 border-[#D97706] bg-[#F59E0B] hover:brightness-110 active:scale-95"
                    : "h-[44px] cursor-default border border-[#94A3B8] bg-[#CBD5E1]"
                }`}
              >
                {inRescan && (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex flex-col items-center leading-none text-white">
                      <span className="text-[9px] font-black">
                        {choice === "rescan" ? "采集 2" : "采集 1"}
                      </span>
                      <span className="mt-1 text-[8px] font-semibold opacity-90">
                        {choice === "rescan" ? SECOND_ACQUISITION_EXPOSURE : FIRST_ACQUISITION_EXPOSURE}
                      </span>
                    </div>
                  </div>
                )}
              </button>

              <span className={`text-[9px] font-bold ${inRescan ? "text-slate-700" : "text-slate-400"}`}>
                {bedIdx + 1}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex items-center justify-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded border border-[#94A3B8] bg-[#CBD5E1]" />
          <span className="text-[10px] text-slate-500">正常单次采集</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded border-2 border-[#D97706] bg-[#F59E0B]" />
          <span className="text-[10px] text-slate-500">使用采集 1：{FIRST_ACQUISITION_EXPOSURE}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded border-2 border-[#2563EB] bg-[#4D94FF]" />
          <span className="text-[10px] text-slate-500">使用采集 2：{SECOND_ACQUISITION_EXPOSURE}</span>
        </div>
      </div>
    </div>
  );
}

interface BedTableProps {
  rescanRange: [number, number];
  choices: RescanChoices;
  onChange: (bedIdx: number, choice: "first" | "rescan") => void;
}

function BedTable({ rescanRange, choices, onChange }: BedTableProps) {
  const [start, end] = rescanRange;
  const beds = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-[#F1F5F9]">
            <th className="px-4 py-2.5 text-left font-bold text-slate-600">床位</th>
            <th className="px-4 py-2.5 text-left font-bold text-slate-600">扫描位置范围</th>
            <th className="px-4 py-2.5 text-center font-bold text-amber-600">采集 1（初扫 · {FIRST_ACQUISITION_EXPOSURE}）</th>
            <th className="px-4 py-2.5 text-center font-bold text-[#4D94FF]">采集 2（重扫 · {SECOND_ACQUISITION_EXPOSURE}）</th>
          </tr>
        </thead>
        <tbody>
          {beds.map((bedIdx) => {
            const posStart = (bedIdx * BED_TRAVEL_MM).toFixed(1);
            const posEnd = ((bedIdx + 1) * BED_TRAVEL_MM).toFixed(1);
            const choice = choices[bedIdx];

            return (
              <tr key={bedIdx} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-700">床位 {bedIdx + 1}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                  {posStart} - {posEnd} mm
                </td>
                <td className="px-4 py-3 text-center">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name={`bed-${bedIdx}`}
                      checked={choice === "first"}
                      onChange={() => onChange(bedIdx, "first")}
                      className="h-4 w-4 accent-amber-500"
                    />
                    <span className={`font-bold ${choice === "first" ? "text-amber-600" : "text-slate-400"}`}>
                      {choice === "first" && <CheckCircle2 size={12} className="mr-1 inline text-amber-500" />}
                      采集 1：{FIRST_ACQUISITION_EXPOSURE}
                    </span>
                  </label>
                </td>
                <td className="px-4 py-3 text-center">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name={`bed-${bedIdx}`}
                      checked={choice === "rescan"}
                      onChange={() => onChange(bedIdx, "rescan")}
                      className="h-4 w-4 accent-[#4D94FF]"
                    />
                    <span className={`font-bold ${choice === "rescan" ? "text-[#4D94FF]" : "text-slate-400"}`}>
                      {choice === "rescan" && <CheckCircle2 size={12} className="mr-1 inline text-[#4D94FF]" />}
                      采集 2：{SECOND_ACQUISITION_EXPOSURE}
                    </span>
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface WaveformPoint {
  id: number;
  kind: "peak" | "valley";
  t: number;
  value: number;
}

interface WaveSample {
  t: number;
  value: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function movingAverage(values: number[], radius: number) {
  return values.map((_, index) => {
    let weightedSum = 0;
    let weightTotal = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const sample = values[clamp(index + offset, 0, values.length - 1)];
      const weight = radius + 1 - Math.abs(offset);
      weightedSum += sample * weight;
      weightTotal += weight;
    }

    return weightedSum / weightTotal;
  });
}

function buildRespiratorySignal(points: WaveformPoint[], sampleCount: number) {
  const anchors = [...points].sort((a, b) => a.t - b.t);
  const rawSamples: WaveSample[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1);
    let segmentIndex = anchors.findIndex((point, pointIndex) => {
      const next = anchors[pointIndex + 1];
      return next && t >= point.t && t <= next.t;
    });

    if (segmentIndex === -1) {
      segmentIndex = Math.max(0, anchors.length - 2);
    }

    const start = anchors[segmentIndex];
    const end = anchors[segmentIndex + 1] ?? anchors[segmentIndex];
    const duration = Math.max(0.0001, end.t - start.t);
    const localT = clamp((t - start.t) / duration, 0, 1);
    const eased = 0.5 - 0.5 * Math.cos(localT * Math.PI);
    const baseline = start.value + (end.value - start.value) * eased;
    const harmonic =
      Math.sin(t * Math.PI * 18) * 1.6 +
      Math.sin(t * Math.PI * 43 + 0.8) * 0.8 +
      Math.sin(t * Math.PI * 71 + 1.5) * 0.35;

    rawSamples.push({
      t,
      value: clamp(baseline + harmonic, 6, 94),
    });
  }

  const filteredValues = movingAverage(rawSamples.map((sample) => sample.value), 5);

  return {
    raw: rawSamples,
    filtered: rawSamples.map((sample, index) => ({
      t: sample.t,
      value: filteredValues[index],
    })),
  };
}

interface CycleStat {
  peakIdx: number; // 在 sortedPoints 中的下标
  startT: number;
  endT: number;
  periodSec: number;
  amplitude: number;
  isIrregular: boolean;
}

interface RespiratoryStats {
  cycles: CycleStat[];
  meanPeriod: number;
  periodCV: number;
  meanAmplitude: number;
  amplitudeCV: number;
  irregularCount: number;
  rpm: number;
}

function computeRespiratoryStats(sortedPoints: WaveformPoint[]): RespiratoryStats {
  const peaks = sortedPoints
    .map((point, index) => ({ point, index }))
    .filter((entry) => entry.point.kind === "peak");

  const cycles: Omit<CycleStat, "isIrregular">[] = [];
  for (let i = 0; i < peaks.length - 1; i += 1) {
    const current = peaks[i];
    const next = peaks[i + 1];
    const valleyBetween = sortedPoints.find(
      (p) => p.kind === "valley" && p.t > current.point.t && p.t < next.point.t,
    );
    const amplitude = valleyBetween
      ? current.point.value - valleyBetween.value
      : current.point.value - 25;
    cycles.push({
      peakIdx: current.index,
      startT: current.point.t,
      endT: next.point.t,
      periodSec: (next.point.t - current.point.t) * WAVEFORM_DURATION_SEC,
      amplitude,
    });
  }

  const meanPeriod = cycles.length
    ? cycles.reduce((sum, c) => sum + c.periodSec, 0) / cycles.length
    : 0;
  const meanAmplitude = cycles.length
    ? cycles.reduce((sum, c) => sum + c.amplitude, 0) / cycles.length
    : 0;
  const periodStd = cycles.length
    ? Math.sqrt(
        cycles.reduce((sum, c) => sum + (c.periodSec - meanPeriod) ** 2, 0) / cycles.length,
      )
    : 0;
  const amplitudeStd = cycles.length
    ? Math.sqrt(
        cycles.reduce((sum, c) => sum + (c.amplitude - meanAmplitude) ** 2, 0) / cycles.length,
      )
    : 0;
  const periodCV = meanPeriod > 0 ? periodStd / meanPeriod : 0;
  const amplitudeCV = meanAmplitude > 0 ? amplitudeStd / meanAmplitude : 0;

  const flagged: CycleStat[] = cycles.map((c) => ({
    ...c,
    // 临床经验：单周期周期或幅值偏离均值 >20% 即视为不规则呼吸（重建伪影风险）
    isIrregular:
      meanPeriod > 0 && meanAmplitude > 0
        ? Math.abs(c.periodSec - meanPeriod) / meanPeriod > 0.2 ||
          Math.abs(c.amplitude - meanAmplitude) / meanAmplitude > 0.2
        : false,
  }));

  return {
    cycles: flagged,
    meanPeriod,
    periodCV,
    meanAmplitude,
    amplitudeCV,
    irregularCount: flagged.filter((c) => c.isIrregular).length,
    rpm: meanPeriod > 0 ? 60 / meanPeriod : 0,
  };
}

interface RespiratoryWaveMonitorProps {
  points: WaveformPoint[];
  bedCount: number;
  rescanRange: [number, number];
  onPointMove: (id: number, t: number, value: number) => void;
  onPointAdd: (kind: "peak" | "valley", t: number, value: number) => void;
  onPointDelete: (id: number) => void;
  onReset: () => void;
}

function RespiratoryWaveMonitor({
  points,
  bedCount,
  rescanRange,
  onPointMove,
  onPointAdd,
  onPointDelete,
  onReset,
}: RespiratoryWaveMonitorProps) {
  const chartWidth = 960;
  const chartHeight = 360;
  const leftPad = 40;
  const rightPad = 22;
  const plotTop = 22;
  const plotBottom = 230;
  const bedTop = 278;
  const bedHeight = 38;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingPointId, setDraggingPointId] = useState<number | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; t: number; value: number } | null>(null);
  const [showPhaseBins, setShowPhaseBins] = useState(false);
  const [addMode, setAddMode] = useState<"peak" | "valley" | null>(null);
  const sortedPoints = useMemo(() => [...points].sort((a, b) => a.t - b.t), [points]);
  const signal = useMemo(() => buildRespiratorySignal(sortedPoints, 180), [sortedPoints]);
  const stats = useMemo(() => computeRespiratoryStats(sortedPoints), [sortedPoints]);
  const [rescanStart, rescanEnd] = rescanRange;
  const totalCycles = bedCount + 2;

  const xFromT = (t: number) => leftPad + t * (chartWidth - leftPad - rightPad);
  const yFromValue = (value: number) => plotTop + ((100 - value) / 100) * (plotBottom - plotTop);
  const tFromX = (x: number) => clamp((x - leftPad) / (chartWidth - leftPad - rightPad), 0.01, 0.99);
  const valueFromY = (y: number) => {
    const normalized = clamp((y - plotTop) / (plotBottom - plotTop), 0, 1);
    return 100 - normalized * 100;
  };

  const svgCoords = useCallback((event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * chartWidth;
    const y = ((event.clientY - rect.top) / rect.height) * chartHeight;
    return { x, y };
  }, []);

  const rawPath = signal.raw
    .map((sample) => `${xFromT(sample.t)},${yFromValue(sample.value)}`)
    .join(" ");
  const filteredPath = signal.filtered
    .map((sample) => `${xFromT(sample.t)},${yFromValue(sample.value)}`)
    .join(" ");

  const bedSegments = Array.from({ length: bedCount }, (_, index) => {
    const segmentStart = (index + 1) / totalCycles;
    const segmentEnd = (index + 2) / totalCycles;
    const centerT = (segmentStart + segmentEnd) / 2;

    return {
      index,
      x: xFromT(segmentStart),
      width: xFromT(segmentEnd) - xFromT(segmentStart),
      centerX: xFromT(centerT),
      inRescan: index >= rescanStart && index <= rescanEnd,
    };
  });
  const allBedOverlay = {
    x: bedSegments[0]?.x ?? xFromT(1 / totalCycles),
    width:
      bedSegments.length > 0
        ? bedSegments[bedSegments.length - 1].x + bedSegments[bedSegments.length - 1].width - bedSegments[0].x
        : xFromT((totalCycles - 1) / totalCycles) - xFromT(1 / totalCycles),
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const coords = svgCoords(event);
    if (!coords) return;

    if (draggingPointId !== null) {
      const pointIndex = sortedPoints.findIndex((point) => point.id === draggingPointId);
      if (pointIndex === -1) return;

      const point = sortedPoints[pointIndex];
      const previousPoint = sortedPoints[pointIndex - 1];
      const nextPoint = sortedPoints[pointIndex + 1];
      const minT = previousPoint ? previousPoint.t + 0.025 : 0.01;
      const maxT = nextPoint ? nextPoint.t - 0.025 : 0.99;
      const t = clamp(tFromX(coords.x), minT, maxT);
      const rawValue = valueFromY(coords.y);
      const value = point.kind === "peak" ? clamp(rawValue, 55, 92) : clamp(rawValue, 8, 45);

      onPointMove(point.id, t, value);
      setHover({ x: xFromT(t), y: yFromValue(value), t, value });
      return;
    }

    const t = tFromX(coords.x);
    const value = valueFromY(coords.y);
    setHover({ x: coords.x, y: coords.y, t, value });
  };

  const handlePointerUp = () => {
    setDraggingPointId(null);
  };

  const handlePointerLeave = () => {
    setDraggingPointId(null);
    setHover(null);
  };

  const handleSvgClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!addMode) return;
    const coords = svgCoords(event);
    if (!coords || coords.y > plotBottom) return;
    const t = tFromX(coords.x);
    // 限制在两侧相邻控制点之间，避免时序错位
    const prev = [...sortedPoints].reverse().find((p) => p.t < t);
    const next = sortedPoints.find((p) => p.t > t);
    if (prev && t - prev.t < 0.025) return;
    if (next && next.t - t < 0.025) return;
    const rawValue = valueFromY(coords.y);
    const value = addMode === "peak" ? clamp(rawValue, 55, 92) : clamp(rawValue, 8, 45);
    onPointAdd(addMode, t, value);
    setAddMode(null);
  };

  // 键盘微调（方向键 1% 幅值 / 0.005 时间；Shift 加速；Delete 删除）
  useEffect(() => {
    if (selectedPointId === null) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const point = sortedPoints.find((p) => p.id === selectedPointId);
      if (!point) return;
      const idx = sortedPoints.findIndex((p) => p.id === selectedPointId);
      const prev = sortedPoints[idx - 1];
      const next = sortedPoints[idx + 1];
      const tStep = event.shiftKey ? 0.02 : 0.005;
      const vStep = event.shiftKey ? 4 : 1;
      const vRange: [number, number] = point.kind === "peak" ? [55, 92] : [8, 45];

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const minT = prev ? prev.t + 0.025 : 0.01;
        onPointMove(point.id, clamp(point.t - tStep, minT, 0.99), point.value);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        const maxT = next ? next.t - 0.025 : 0.99;
        onPointMove(point.id, clamp(point.t + tStep, 0.01, maxT), point.value);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        onPointMove(point.id, point.t, clamp(point.value + vStep, vRange[0], vRange[1]));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        onPointMove(point.id, point.t, clamp(point.value - vStep, vRange[0], vRange[1]));
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onPointDelete(point.id);
        setSelectedPointId(null);
      } else if (event.key === "Escape") {
        setSelectedPointId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedPointId, sortedPoints, onPointMove, onPointDelete]);

  // 相位分箱标记线（仅针对稳态周期 startT→endT 按 10 相位均分）
  const phaseLines = useMemo(() => {
    if (!showPhaseBins) return [];
    const lines: { x: number; phase: number; cycleIdx: number }[] = [];
    stats.cycles.forEach((cycle, cycleIdx) => {
      for (let phase = 0; phase < PHASE_BIN_COUNT; phase += 1) {
        const t = cycle.startT + ((cycle.endT - cycle.startT) * phase) / PHASE_BIN_COUNT;
        lines.push({ x: xFromT(t), phase: phase * PHASE_BIN_COUNT, cycleIdx });
      }
    });
    return lines;
  }, [showPhaseBins, stats.cycles]);

  const regularityBadge = (() => {
    if (stats.cycles.length === 0) return { label: "数据不足", color: "bg-slate-100 text-slate-500" };
    if (stats.periodCV < 0.1 && stats.amplitudeCV < 0.15) {
      return { label: "呼吸规律", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    if (stats.periodCV < 0.2 && stats.amplitudeCV < 0.25) {
      return { label: "轻度不齐", color: "bg-amber-50 text-amber-700 border-amber-200" };
    }
    return { label: "不规律·建议重采", color: "bg-rose-50 text-rose-700 border-rose-200" };
  })();

  const hoverPhase = useMemo(() => {
    if (!hover) return null;
    const cycle = stats.cycles.find((c) => hover.t >= c.startT && hover.t <= c.endT);
    if (!cycle) return null;
    const localPhase = ((hover.t - cycle.startT) / (cycle.endT - cycle.startT)) * 100;
    return Math.round(localPhase);
  }, [hover, stats.cycles]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-[12px] font-black text-slate-700">呼吸波形编辑</div>
            <span
              className={`rounded-full border px-2 py-[1px] text-[10px] font-bold ${regularityBadge.color}`}
            >
              {regularityBadge.label}
            </span>
            {stats.irregularCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-[1px] text-[10px] font-bold text-amber-700">
                <AlertTriangle size={10} /> {stats.irregularCount} 个不规则周期
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            床位前后各保留一个完整呼吸周期作为缓冲；不规则周期将影响 4D 分箱重建质量
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            拖动波峰/波谷调整；点击选中后可使用 ↑↓←→ 微调（Shift 加速），Delete 删除
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[2px] w-6 rounded bg-slate-400 opacity-80" />
              原始波形
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[3px] w-6 rounded bg-[#2563EB]" />
              平滑滤波
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAddMode(addMode === "peak" ? null : "peak")}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${
                addMode === "peak"
                  ? "border-[#2563EB] bg-[#2563EB] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              title="点击波形区域添加一个波峰"
            >
              <Plus size={10} /> 加波峰
            </button>
            <button
              type="button"
              onClick={() => setAddMode(addMode === "valley" ? null : "valley")}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${
                addMode === "valley"
                  ? "border-[#DC2626] bg-[#DC2626] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              title="点击波形区域添加一个波谷"
            >
              <Plus size={10} /> 加波谷
            </button>
            <button
              type="button"
              onClick={() => setShowPhaseBins((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${
                showPhaseBins
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              title="显示 10 相位分箱（0%=吸气末，50%≈呼气末）"
            >
              10 相位
            </button>
            <button
              type="button"
              onClick={() => {
                onReset();
                setSelectedPointId(null);
                setAddMode(null);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
              title="恢复自动检测的波峰波谷"
            >
              <RotateCcw size={10} /> 重置
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF4FF_100%)] px-3 py-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className={`h-[360px] w-full touch-none ${addMode ? "cursor-crosshair" : ""}`}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onClick={handleSvgClick}
        >
          <defs>
            <linearGradient id="resp-wave-stroke-monitor" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>

          <rect
            x={allBedOverlay.x}
            y={plotTop - 2}
            width={allBedOverlay.width}
            height={plotBottom - plotTop + bedHeight + 22}
            fill="#F97316"
            fillOpacity={0.14}
            rx={6}
          />

          {/* 不规则周期高亮 */}
          {stats.cycles
            .filter((cycle) => cycle.isIrregular)
            .map((cycle) => (
              <rect
                key={`irreg-${cycle.peakIdx}`}
                x={xFromT(cycle.startT)}
                y={plotTop - 2}
                width={xFromT(cycle.endT) - xFromT(cycle.startT)}
                height={plotBottom - plotTop + 4}
                fill="#FB7185"
                fillOpacity={0.12}
                stroke="#F43F5E"
                strokeOpacity={0.5}
                strokeDasharray="3 3"
                rx={4}
              />
            ))}

          {/* 10 相位分箱 */}
          {phaseLines.map((line, i) => (
            <line
              key={`phase-${i}`}
              x1={line.x}
              y1={plotTop}
              x2={line.x}
              y2={plotBottom}
              stroke="#10B981"
              strokeWidth={line.phase === 0 ? 1.2 : 0.6}
              strokeDasharray={line.phase === 0 ? "" : "2 3"}
              opacity={line.phase === 0 ? 0.55 : 0.35}
            />
          ))}

          {[20, 40, 60, 80].map((level) => (
            <line
              key={level}
              x1={leftPad - 8}
              y1={yFromValue(level)}
              x2={chartWidth - rightPad}
              y2={yFromValue(level)}
              stroke="#D7E4FA"
              strokeDasharray="4 4"
            />
          ))}

          <line
            x1={leftPad - 8}
            y1={plotBottom}
            x2={chartWidth - rightPad}
            y2={plotBottom}
            stroke="#94A3B8"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.45"
          />

          <polyline
            fill="none"
            stroke="#64748B"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.46"
            points={rawPath}
          />
          <polyline
            fill="none"
            stroke="url(#resp-wave-stroke-monitor)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={filteredPath}
          />

          {sortedPoints.map((point, index) => {
            const isPeak = point.kind === "peak";
            const x = xFromT(point.t);
            const y = yFromValue(point.value);
            const sameKindBefore = sortedPoints
              .slice(0, index)
              .filter((p) => p.kind === point.kind).length;
            const label = `${isPeak ? "P" : "V"}${sameKindBefore + 1}`;
            const isSelected = selectedPointId === point.id;

            return (
              <g key={`control-${point.id}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 11 : 8}
                  fill={isPeak ? "#2563EB" : "#DC2626"}
                  fillOpacity={isSelected ? 0.25 : 0.16}
                />
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 6 : 5}
                  fill={isPeak ? "#2563EB" : "#DC2626"}
                  stroke="white"
                  strokeWidth={isSelected ? 2.5 : 2}
                  className="cursor-grab active:cursor-grabbing"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDraggingPointId(point.id);
                    setSelectedPointId(point.id);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onPointDelete(point.id);
                    if (selectedPointId === point.id) setSelectedPointId(null);
                  }}
                >
                  <title>{`${label} · t=${(point.t * WAVEFORM_DURATION_SEC).toFixed(2)}s · 幅值=${point.value.toFixed(1)}（双击删除）`}</title>
                </circle>
                <text
                  x={x}
                  y={isPeak ? y - 13 : y + 19}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill={isPeak ? "#1D4ED8" : "#B91C1C"}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* 悬停 / 拖动 tooltip */}
          {hover && (
            <g pointerEvents="none">
              <line
                x1={xFromT(hover.t)}
                y1={plotTop}
                x2={xFromT(hover.t)}
                y2={plotBottom}
                stroke="#2563EB"
                strokeWidth="0.8"
                strokeDasharray="3 3"
                opacity="0.5"
              />
              <g transform={`translate(${clamp(xFromT(hover.t) + 8, leftPad, chartWidth - 130)}, ${clamp(yFromValue(hover.value) - 34, plotTop, plotBottom - 36)})`}>
                <rect width="124" height="32" rx="4" fill="#0F172A" opacity="0.88" />
                <text x="8" y="13" fontSize="10" fill="#E2E8F0" fontWeight="600">
                  {`t = ${(hover.t * WAVEFORM_DURATION_SEC).toFixed(2)} s · 幅值 ${hover.value.toFixed(1)}`}
                </text>
                <text x="8" y="26" fontSize="10" fill="#93C5FD" fontWeight="600">
                  {hoverPhase !== null ? `相位 ≈ ${hoverPhase}%` : "—— 非稳态周期"}
                </text>
              </g>
            </g>
          )}

          {bedSegments.map((segment) => (
            <g key={`bed-${segment.index}`}>
              <line
                x1={segment.centerX}
                y1={plotBottom + 4}
                x2={segment.centerX}
                y2={bedTop}
                stroke={segment.inRescan ? "#F97316" : "#94A3B8"}
                strokeWidth="1"
                strokeDasharray={segment.inRescan ? "4 3" : "2 4"}
                opacity="0.95"
              />
              <rect
                x={segment.x + 1}
                y={bedTop}
                width={Math.max(0, segment.width - 2)}
                height={bedHeight}
                rx={5}
                fill={segment.inRescan ? "#FDBA74" : "#E2E8F0"}
                stroke={segment.inRescan ? "#F97316" : "#94A3B8"}
                strokeWidth={segment.inRescan ? "1.4" : "1"}
              />
              <text
                x={segment.centerX}
                y={bedTop + 17}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill={segment.inRescan ? "#9A3412" : "#475569"}
              >
                {segment.index + 1}
              </text>
            </g>
          ))}

          {[20, 40, 60, 80].map((level) => (
            <text key={`axis-${level}`} x={8} y={yFromValue(level) + 3} fontSize="10" fill="#64748B">
              {level}
            </text>
          ))}

          {/* 时间轴刻度（秒） */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={`tick-${t}`}>
              <line
                x1={xFromT(t)}
                y1={plotBottom}
                x2={xFromT(t)}
                y2={plotBottom + 3}
                stroke="#94A3B8"
                strokeWidth="1"
              />
              <text
                x={xFromT(t)}
                y={plotBottom + 13}
                textAnchor="middle"
                fontSize="9"
                fill="#64748B"
              >
                {`${(t * WAVEFORM_DURATION_SEC).toFixed(0)}s`}
              </text>
            </g>
          ))}

          <text x={8} y={bedTop + 17} fontSize="10" fontWeight="700" fill="#475569">
            床位
          </text>
        </svg>
      </div>

      {/* 临床统计 */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[10px] text-slate-500">呼吸频率</div>
          <div className="mt-0.5 text-[14px] font-black text-slate-700">
            {stats.rpm > 0 ? stats.rpm.toFixed(1) : "—"}
            <span className="ml-1 text-[10px] font-semibold text-slate-400">次/分</span>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[10px] text-slate-500">平均周期</div>
          <div className="mt-0.5 text-[14px] font-black text-slate-700">
            {stats.meanPeriod > 0 ? stats.meanPeriod.toFixed(2) : "—"}
            <span className="ml-1 text-[10px] font-semibold text-slate-400">s</span>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[10px] text-slate-500">周期变异 CV</div>
          <div
            className={`mt-0.5 text-[14px] font-black ${
              stats.periodCV > 0.2 ? "text-rose-600" : stats.periodCV > 0.1 ? "text-amber-600" : "text-emerald-600"
            }`}
          >
            {stats.meanPeriod > 0 ? `${(stats.periodCV * 100).toFixed(1)}%` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[10px] text-slate-500">幅值变异 CV</div>
          <div
            className={`mt-0.5 text-[14px] font-black ${
              stats.amplitudeCV > 0.25 ? "text-rose-600" : stats.amplitudeCV > 0.15 ? "text-amber-600" : "text-emerald-600"
            }`}
          >
            {stats.meanAmplitude > 0 ? `${(stats.amplitudeCV * 100).toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#2563EB]" />
          波峰（P · 吸气末）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#DC2626]" />
          波谷（V · 呼气末）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-[#F97316] bg-[#FDBA74]" />
          受辐射区域
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-[#F43F5E] bg-[#FB7185] opacity-40" />
          不规则周期
        </span>
        {showPhaseBins && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-[2px] bg-emerald-500" />
            相位分箱
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-slate-400">
          <Trash2 size={10} /> 双击控制点删除
        </span>
      </div>

      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        当前重扫覆盖床位 {rescanStart + 1}-{rescanEnd + 1}。橙色高亮完整覆盖全部床位区间，床位 1 前和末床位后各额外显示一个完整呼吸周期。
        {stats.irregularCount > 0 && (
          <span className="ml-1 font-bold text-rose-600">
            检测到 {stats.irregularCount} 个不规则呼吸周期（粉色虚框），如位于辐射区域内建议调整波峰/波谷位置或联合医师评估是否重采集。
          </span>
        )}
      </div>
    </div>
  );
}

function buildInitialWavePoints(bedCount: number): WaveformPoint[] {
  const points: WaveformPoint[] = [];
  const cycles = Math.max(bedCount + 2, 3);
  const cycleWidth = 1 / cycles;

  for (let index = 0; index <= cycles; index += 1) {
    const valleyT = clamp(index * cycleWidth, 0.01, 0.99);
    points.push({
      id: points.length + 1,
      kind: "valley",
      t: valleyT,
      value: 24 + (index % 3) * 2,
    });

    if (index < cycles) {
      const peakT = clamp(index * cycleWidth + cycleWidth * 0.48, 0.02, 0.98);
      points.push({
        id: points.length + 1,
        kind: "peak",
        t: peakT,
        value: 76 + (index % 4) * 2,
      });
    }
  }

  return points.sort((a, b) => a.t - b.t);
}

export default function FourDRescanSelectScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as FourDPostScanState | null;
  const scanResult = state?.scanResult;
  const selectedPatient = useMemo(() => loadSelectedPatient(), []);
  const rescanRange = scanResult?.rescanBedRange ?? null;
  const bedCount = scanResult?.bedCount ?? 0;

  const [choices, setChoices] = useState<RescanChoices>(() => {
    if (!rescanRange) return {};

    const initialChoices: RescanChoices = {};
    for (let bedIdx = rescanRange[0]; bedIdx <= rescanRange[1]; bedIdx += 1) {
      initialChoices[bedIdx] = "rescan";
    }
    return initialChoices;
  });

  const [viewMode, setViewMode] = useState<"timeline" | "table">("table");
  const [laserActive, setLaserActive] = useState(false);
  const initialWavePoints = useMemo<WaveformPoint[]>(() => buildInitialWavePoints(bedCount), [bedCount]);
  const [wavePoints, setWavePoints] = useState<WaveformPoint[]>(initialWavePoints);
  const nextPointIdRef = useRef<number>(initialWavePoints.length + 1);

  useEffect(() => {
    setWavePoints(initialWavePoints);
    nextPointIdRef.current = initialWavePoints.length + 1;
  }, [initialWavePoints]);

  const handleBulkSelect = (choice: "first" | "rescan") => {
    if (!rescanRange) return;

    const nextChoices: RescanChoices = {};
    for (let bedIdx = rescanRange[0]; bedIdx <= rescanRange[1]; bedIdx += 1) {
      nextChoices[bedIdx] = choice;
    }
    setChoices(nextChoices);
  };

  const handleBedChange = (bedIdx: number, choice: "first" | "rescan") => {
    setChoices((prev) => ({ ...prev, [bedIdx]: choice }));
  };

  const handleBedClick = (bedIdx: number) => {
    setChoices((prev) => ({
      ...prev,
      [bedIdx]: prev[bedIdx] === "rescan" ? "first" : "rescan",
    }));
  };

  const handleWavePointMove = (id: number, t: number, value: number) => {
    setWavePoints((prev) =>
      prev
        .map((point) => (point.id === id ? { ...point, t, value } : point))
        .sort((a, b) => a.t - b.t),
    );
  };

  const handleWavePointAdd = (kind: "peak" | "valley", t: number, value: number) => {
    const id = nextPointIdRef.current;
    nextPointIdRef.current += 1;
    setWavePoints((prev) => [...prev, { id, kind, t, value }].sort((a, b) => a.t - b.t));
  };

  const handleWavePointDelete = (id: number) => {
    setWavePoints((prev) => prev.filter((point) => point.id !== id));
  };

  const handleWaveReset = () => {
    const fresh = buildInitialWavePoints(bedCount);
    setWavePoints(fresh);
    nextPointIdRef.current = fresh.length + 1;
  };

  const rescanCount = rescanRange ? rescanRange[1] - rescanRange[0] + 1 : 0;
  const rescanSelectedCount = Object.values(choices).filter((choice) => choice === "rescan").length;

  const handleConfirm = () => {
    if (!scanResult) return;

    navigate("/image-viewer", {
      state: { ...state, scanResult, rescanChoices: choices } as FourDPostScanState,
    });
  };

  if (!scanResult || !rescanRange) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0F172A] text-[13px] text-white">
        无效状态，请重新扫描。
      </div>
    );
  }

  return (
    <div className="flex h-full select-none flex-col bg-[#EDF1F7]">
      <header className="flex h-[80px] shrink-0 items-center justify-between border-b border-[#B0C4DE] bg-[#E8EAF1] px-4">
        <div className="flex items-center gap-3">
          <div className="flex min-w-[220px] items-center gap-3 rounded-sm border border-[#B0C4DE] bg-[#DCE6F2] px-4 py-1.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#4A6982] text-white opacity-90">
              <User size={22} />
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold text-[#37474F]">{selectedPatient?.name ?? "未选择患者"}</span>
              <span className="text-[11px] font-medium text-[#546E7A]">{selectedPatient?.id ?? "-"}</span>
            </div>
          </div>

          <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
            <div className="text-[9px] font-bold italic">⌀ 0</div>
            <div className="text-[9px] font-bold">⏚ 0</div>
            <div className="flex items-center gap-1 text-[11px] font-bold">
              <Flame size={13} />
              <span>0%</span>
            </div>
          </div>
        </div>

        <div className="text-center leading-none">
          <div className="text-[24px] font-bold tracking-tight text-[#37474F]">13:52</div>
          <div className="mt-1 text-[11px] font-medium uppercase opacity-80 text-[#546E7A]">4月16日 周四</div>
        </div>

        <div className="flex items-center gap-4 pr-2 text-[#546E7A]">
          <div className="cursor-pointer p-1 text-[#D32F2F] hover:opacity-70">
            <Siren size={24} />
          </div>
          <div className="relative cursor-pointer p-1 hover:opacity-70">
            <Network size={20} />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#D32F2F] text-[9px] font-bold text-white">
              5
            </span>
          </div>
          <button
            type="button"
            aria-label="激光灯"
            aria-pressed={laserActive}
            onClick={() => setLaserActive((prev) => !prev)}
            className={`p-1 ${laserActive ? "text-[#F59E0B]" : "hover:opacity-70"}`}
          >
            <Sun size={20} />
          </button>
          <div className="relative cursor-pointer p-1 hover:opacity-70">
            <Settings size={20} />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#D32F2F] text-[9px] font-bold text-white">
              10
            </span>
          </div>
        </div>
      </header>

      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-500" />
          <span className="text-[13px] font-bold text-slate-700">
            床位 {rescanRange[0] + 1}-{rescanRange[1] + 1} 存在重扫重叠
            <span className="ml-2 text-[11px] font-normal text-slate-400">
              共 {rescanCount} 个床位存在两套采集数据，请为每个床位选择使用哪一套
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleBulkSelect("first")}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-100"
          >
            全选采集 1
          </button>
          <button
            type="button"
            onClick={() => handleBulkSelect("rescan")}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-[#4D94FF] transition-colors hover:bg-blue-100"
          >
            全选重扫
          </button>

          <div className="ml-3 flex overflow-hidden rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold transition-colors ${
                viewMode === "table" ? "bg-[#4D94FF] text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <List size={12} /> 列表
            </button>
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold transition-colors ${
                viewMode === "timeline" ? "bg-[#4D94FF] text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <LayoutGrid size={12} /> 时间轴
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-auto px-6 py-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[12px] font-black text-slate-700">扫描床位总览</div>
            <div className="text-[11px] text-slate-400">
              总扫描长度 {scanResult.scanLength.toFixed(1)} mm · {bedCount} 个床位
            </div>
          </div>

          <BedTimeline
            bedCount={bedCount}
            rescanRange={rescanRange}
            choices={choices}
            onBedClick={handleBedClick}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[12px] font-black text-slate-700">重扫床位逐一选择</div>
            <div className="text-[11px] text-slate-400">
              已选重扫 {rescanSelectedCount}/{rescanCount} 个床位
            </div>
          </div>

          {viewMode === "table" ? (
            <BedTable rescanRange={rescanRange} choices={choices} onChange={handleBedChange} />
          ) : (
            <div className="flex h-24 items-center justify-center text-[12px] text-slate-400">
              在上方时间轴中直接点击床位块切换选择
            </div>
          )}
        </div>

        <RespiratoryWaveMonitor
          points={wavePoints}
          bedCount={bedCount}
          rescanRange={rescanRange}
          onPointMove={handleWavePointMove}
          onPointAdd={handleWavePointAdd}
          onPointDelete={handleWavePointDelete}
          onReset={handleWaveReset}
        />
      </div>

      <footer className="flex h-[84px] shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-[52px] items-center gap-2 rounded-md border-2 border-[#4D94FF] bg-white px-10 text-[13px] font-bold uppercase text-[#4D94FF] shadow-sm transition-all hover:bg-blue-50 active:scale-95"
        >
          <ChevronLeft size={20} /> 上一步
        </button>

        <div className="text-center text-[11px] text-slate-400">
          所有 {rescanCount} 个床位均已完成选择，可进入重建
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          className="flex h-[52px] items-center gap-2 rounded-md bg-[#4D94FF] px-10 text-[13px] font-bold uppercase text-white shadow-lg transition-all hover:bg-blue-600 active:scale-95"
        >
          进入图像重建 <ChevronRight size={20} />
        </button>
      </footer>
    </div>
  );
}
