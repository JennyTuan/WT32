/**
 * FourDRescanSelectScreen - 4D 扫描后的重扫数据选择页面
 */

import { useMemo, useRef, useState } from "react";
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
  Settings,
  Siren,
  Sun,
  User,
} from "lucide-react";

import { loadSelectedPatient } from "../lib/patientSession";
import type { FourDPostScanState, RescanChoices } from "../lib/fourDTypes";

const BED_TRAVEL_MM = 19.2;
const FIRST_ACQUISITION_EXPOSURE = "2s";
const SECOND_ACQUISITION_EXPOSURE = "6s";

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

interface RespiratoryWaveMonitorProps {
  points: WaveformPoint[];
  bedCount: number;
  rescanRange: [number, number];
  onPointMove: (id: number, t: number, value: number) => void;
}

function RespiratoryWaveMonitor({ points, bedCount, rescanRange, onPointMove }: RespiratoryWaveMonitorProps) {
  const chartWidth = 760;
  const chartHeight = 222;
  const leftPad = 34;
  const rightPad = 18;
  const plotTop = 18;
  const plotBottom = 132;
  const bedTop = 164;
  const bedHeight = 26;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingPointId, setDraggingPointId] = useState<number | null>(null);
  const sortedPoints = useMemo(() => [...points].sort((a, b) => a.t - b.t), [points]);
  const signal = useMemo(() => buildRespiratorySignal(sortedPoints, 180), [sortedPoints]);
  const [rescanStart, rescanEnd] = rescanRange;
  const totalCycles = bedCount + 2;

  const xFromT = (t: number) => leftPad + t * (chartWidth - leftPad - rightPad);
  const yFromValue = (value: number) => plotTop + ((100 - value) / 100) * (plotBottom - plotTop);
  const tFromX = (x: number) => clamp((x - leftPad) / (chartWidth - leftPad - rightPad), 0.01, 0.99);
  const valueFromY = (y: number) => {
    const normalized = clamp((y - plotTop) / (plotBottom - plotTop), 0, 1);
    return 100 - normalized * 100;
  };

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
    if (draggingPointId === null || !svgRef.current) return;

    const pointIndex = sortedPoints.findIndex((point) => point.id === draggingPointId);
    if (pointIndex === -1) return;

    const point = sortedPoints[pointIndex];
    const previousPoint = sortedPoints[pointIndex - 1];
    const nextPoint = sortedPoints[pointIndex + 1];
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * chartWidth;
    const svgY = ((event.clientY - rect.top) / rect.height) * chartHeight;
    const minT = previousPoint ? previousPoint.t + 0.025 : 0.01;
    const maxT = nextPoint ? nextPoint.t - 0.025 : 0.99;
    const t = clamp(tFromX(svgX), minT, maxT);
    const rawValue = valueFromY(svgY);
    const value = point.kind === "peak" ? clamp(rawValue, 55, 92) : clamp(rawValue, 8, 45);

    onPointMove(point.id, t, value);
  };

  const handlePointerUp = () => {
    setDraggingPointId(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[12px] font-black text-slate-700">呼吸波形监测</div>
          <div className="mt-1 text-[11px] text-slate-400">
            全部床位范围完整覆盖，床位前后各保留一个完整呼吸周期作为缓冲
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            可直接拖动波峰和波谷，实时调整周期时刻与呼吸幅值
          </div>
        </div>
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
      </div>

      <div className="rounded-lg border border-slate-200 bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF4FF_100%)] px-3 py-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-[222px] w-full touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
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
            const label = `${isPeak ? "P" : "V"}${Math.floor(index / 2) + (isPeak ? 1 : 1)}`;

            return (
              <g key={`control-${point.id}`}>
                <circle
                  cx={x}
                  cy={y}
                  r="8"
                  fill={isPeak ? "#2563EB" : "#DC2626"}
                  fillOpacity="0.16"
                />
                <circle
                  cx={x}
                  cy={y}
                  r="5"
                  fill={isPeak ? "#2563EB" : "#DC2626"}
                  stroke="white"
                  strokeWidth="2"
                  className="cursor-grab active:cursor-grabbing"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDraggingPointId(point.id);
                  }}
                />
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

          <text x={8} y={bedTop + 17} fontSize="10" fontWeight="700" fill="#475569">
            床位
          </text>
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#2563EB]" />
          波峰
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#DC2626]" />
          波谷
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-[#F97316] bg-[#FDBA74]" />
          受辐射区域
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-5 rounded bg-[#94A3B8]" />
          床位连接线
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-slate-400 bg-white" />
          拖动控制点
        </span>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        当前重扫覆盖床位 {rescanStart + 1}-{rescanEnd + 1}。橙色高亮完整覆盖全部床位区间，床位 1 前和末床位后各额外显示一个完整呼吸周期。
      </div>
    </div>
  );
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
  const initialWavePoints = useMemo<WaveformPoint[]>(() => {
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
  }, [bedCount]);
  const [wavePoints, setWavePoints] = useState<WaveformPoint[]>(initialWavePoints);

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
