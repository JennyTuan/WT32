/**
 * FourDRescanSelectScreen — 4D 扫描后处理：重扫区域数据选择
 *
 * 触发条件：本次 4D 扫描发生了暂停重扫（rescanOccurred=true），
 * 某段床位范围存在两套采集数据，用户需要为每个冲突床位选择使用
 * 第一次采集还是重扫采集的数据，之后进入图像重建。
 */

import { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  CheckCircle2,
  AlertTriangle,
  User,
  Flame,
  Siren,
  Network,
  Sun,
  Settings,
  MoveVertical,
} from "lucide-react";

import { loadSelectedPatient } from "../lib/patientSession";
import type { FourDPostScanState, RescanChoices } from "../lib/fourDTypes";

// ─── 常量 ───────────────────────────────────────────────────────────────────

const BED_TRAVEL_MM = 19.2;

// ─── 子组件：床位时间轴可视化 ────────────────────────────────────────────────

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
      {/* 标尺 */}
      <div className="flex items-end gap-1">
        {Array.from({ length: bedCount }, (_, bi) => {
          const inRescan = bi >= start && bi <= end;
          const choice = choices[bi];
          return (
            <div key={bi} className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
              {/* 床位方块 */}
              <button
                onClick={() => inRescan && onBedClick(bi)}
                disabled={!inRescan}
                title={inRescan ? `床位 ${bi + 1}：点击切换选择` : `床位 ${bi + 1}`}
                className={`
                  w-full rounded transition-all
                  ${inRescan
                    ? choice === "rescan"
                      ? "h-[52px] bg-[#4D94FF] border-2 border-[#2563EB] cursor-pointer hover:brightness-110 active:scale-95"
                      : "h-[52px] bg-[#F59E0B] border-2 border-[#D97706] cursor-pointer hover:brightness-110 active:scale-95"
                    : "h-[44px] bg-[#CBD5E1] border border-[#94A3B8] cursor-default"
                  }
                `}
              >
                {inRescan && (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-[9px] font-black text-white">
                      {choice === "rescan" ? "重扫" : "采集1"}
                    </span>
                  </div>
                )}
              </button>

              {/* 床位编号 */}
              <span className={`text-[9px] font-bold ${inRescan ? "text-slate-700" : "text-slate-400"}`}>
                {bi + 1}
              </span>
            </div>
          );
        })}
      </div>

      {/* 图例说明 */}
      <div className="flex items-center gap-4 justify-center mt-1">
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded bg-[#CBD5E1] border border-[#94A3B8]" />
          <span className="text-[10px] text-slate-500">单次采集（正常）</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded bg-[#F59E0B] border-2 border-[#D97706]" />
          <span className="text-[10px] text-slate-500">使用采集 1</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded bg-[#4D94FF] border-2 border-[#2563EB]" />
          <span className="text-[10px] text-slate-500">使用重扫</span>
        </div>
      </div>
    </div>
  );
}

// ─── 子组件：床位逐条列表 ──────────────────────────────────────────────────

interface BedTableProps {
  rescanRange: [number, number];
  choices: RescanChoices;
  onChange: (bedIdx: number, choice: "first" | "rescan") => void;
}

function BedTable({ rescanRange, choices, onChange }: BedTableProps) {
  const [start, end] = rescanRange;
  const beds = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-[#F1F5F9]">
            <th className="px-4 py-2.5 text-left font-bold text-slate-600">床位</th>
            <th className="px-4 py-2.5 text-left font-bold text-slate-600">
              扫描位置范围
            </th>
            <th className="px-4 py-2.5 text-center font-bold text-amber-600">
              采集 1（初次）
            </th>
            <th className="px-4 py-2.5 text-center font-bold text-[#4D94FF]">
              采集 2（重扫）
            </th>
          </tr>
        </thead>
        <tbody>
          {beds.map((bi) => {
            const posStart = (bi * BED_TRAVEL_MM).toFixed(1);
            const posEnd = ((bi + 1) * BED_TRAVEL_MM).toFixed(1);
            const choice = choices[bi];
            return (
              <tr key={bi} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-700">床位 {bi + 1}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                  {posStart} – {posEnd} mm
                </td>
                <td className="px-4 py-3 text-center">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`bed-${bi}`}
                      checked={choice === "first"}
                      onChange={() => onChange(bi, "first")}
                      className="accent-amber-500 h-4 w-4"
                    />
                    <span className={`font-bold ${choice === "first" ? "text-amber-600" : "text-slate-400"}`}>
                      {choice === "first" && <CheckCircle2 size={12} className="inline mr-1 text-amber-500" />}
                      采集 1
                    </span>
                  </label>
                </td>
                <td className="px-4 py-3 text-center">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`bed-${bi}`}
                      checked={choice === "rescan"}
                      onChange={() => onChange(bi, "rescan")}
                      className="accent-[#4D94FF] h-4 w-4"
                    />
                    <span className={`font-bold ${choice === "rescan" ? "text-[#4D94FF]" : "text-slate-400"}`}>
                      {choice === "rescan" && <CheckCircle2 size={12} className="inline mr-1 text-[#4D94FF]" />}
                      重扫
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
  label: string;
  kind: "peak" | "valley";
  value: number;
}

interface RespiratoryWaveEditorProps {
  points: WaveformPoint[];
  onValueChange: (id: number, value: number) => void;
}

function RespiratoryWaveEditor({ points, onValueChange }: RespiratoryWaveEditorProps) {
  const chartWidth = 760;
  const chartHeight = 180;
  const yFromValue = (value: number) => 20 + ((100 - value) / 100) * (chartHeight - 40);
  const xFromIndex = (index: number) => 24 + (index * (chartWidth - 48)) / (points.length - 1);

  const polyline = points
    .map((point, idx) => `${xFromIndex(idx)},${yFromValue(point.value)}`)
    .join(" ");

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[12px] font-black text-slate-700">呼吸波形编辑（波峰/波谷）</div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <MoveVertical size={13} />
          可拖动滑杆调整每个波峰与波谷幅值
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF4FF_100%)] px-3 py-3">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[180px] w-full">
          <defs>
            <linearGradient id="waveStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4D94FF" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>
          {[20, 40, 60, 80].map((y) => (
            <line
              key={y}
              x1={8}
              y1={yFromValue(y)}
              x2={chartWidth - 8}
              y2={yFromValue(y)}
              stroke="#D7E4FA"
              strokeDasharray="4 4"
            />
          ))}
          <polyline fill="none" stroke="url(#waveStroke)" strokeWidth="3" strokeLinejoin="round" points={polyline} />
          {points.map((point, idx) => {
            const x = xFromIndex(idx);
            const y = yFromValue(point.value);
            const isPeak = point.kind === "peak";
            return (
              <g key={point.id}>
                <circle
                  cx={x}
                  cy={y}
                  r="6"
                  fill={isPeak ? "#F97316" : "#2563EB"}
                  stroke="white"
                  strokeWidth="2"
                />
                <text x={x} y={y - 12} textAnchor="middle" fontSize="10" fill={isPeak ? "#C2410C" : "#1D4ED8"}>
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {points.map((point) => (
          <label key={point.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className={`font-bold ${point.kind === "peak" ? "text-orange-600" : "text-blue-600"}`}>
                {point.label} · {point.kind === "peak" ? "波峰" : "波谷"}
              </span>
              <span className="font-mono text-slate-500">{point.value}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={95}
              step={1}
              value={point.value}
              onChange={(event) => onValueChange(point.id, Number(event.target.value))}
              className="h-2 w-full accent-[#4D94FF]"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── 主界面 ──────────────────────────────────────────────────────────────────

export default function FourDRescanSelectScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as FourDPostScanState | null;
  const scanResult = state?.scanResult;

  const selectedPatient = useMemo(() => loadSelectedPatient(), []);

  const rescanRange = scanResult?.rescanBedRange ?? null;
  const bedCount = scanResult?.bedCount ?? 0;

  // ── 每个重扫床位的选择，默认选"重扫"（通常质量更好） ──
  const [choices, setChoices] = useState<RescanChoices>(() => {
    if (!rescanRange) return {};
    const init: RescanChoices = {};
    for (let bi = rescanRange[0]; bi <= rescanRange[1]; bi++) {
      init[bi] = "rescan";
    }
    return init;
  });

  // ── 批量选择模式 ──
  const [viewMode, setViewMode] = useState<"timeline" | "table">("table");
  const [laserActive, setLaserActive] = useState(false);
  const [wavePoints, setWavePoints] = useState<WaveformPoint[]>([
    { id: 1, label: "P1", kind: "peak", value: 78 },
    { id: 2, label: "V1", kind: "valley", value: 26 },
    { id: 3, label: "P2", kind: "peak", value: 82 },
    { id: 4, label: "V2", kind: "valley", value: 24 },
    { id: 5, label: "P3", kind: "peak", value: 74 },
    { id: 6, label: "V3", kind: "valley", value: 30 },
  ]);

  const handleBulkSelect = (choice: "first" | "rescan") => {
    if (!rescanRange) return;
    const next: RescanChoices = {};
    for (let bi = rescanRange[0]; bi <= rescanRange[1]; bi++) {
      next[bi] = choice;
    }
    setChoices(next);
  };

  const handleBedChange = (bedIdx: number, choice: "first" | "rescan") => {
    setChoices((prev) => ({ ...prev, [bedIdx]: choice }));
  };

  // 时间轴模式点击：切换单床位选择
  const handleBedClick = (bedIdx: number) => {
    setChoices((prev) => ({
      ...prev,
      [bedIdx]: prev[bedIdx] === "rescan" ? "first" : "rescan",
    }));
  };

  const rescanCount = rescanRange ? rescanRange[1] - rescanRange[0] + 1 : 0;
  const rescanSelectedCount = Object.values(choices).filter((c) => c === "rescan").length;
  const handleWavePointChange = (id: number, value: number) => {
    setWavePoints((prev) =>
      prev.map((point) => (point.id === id ? { ...point, value } : point))
    );
  };

  // ── 确认进入重建 ──
  const handleConfirm = () => {
    if (!scanResult) return;
    navigate("/image-viewer", {
      state: { ...state, scanResult, rescanChoices: choices } as FourDPostScanState,
    });
  };

  // ── 无数据保护 ──
  if (!scanResult || !rescanRange) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0F172A] text-white text-[13px]">
        无效状态，请重新扫描。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#EDF1F7] select-none">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex h-[80px] shrink-0 items-center justify-between border-b border-[#B0C4DE] bg-[#E8EAF1] px-4">
        <div className="flex items-center gap-3">
          <div className="flex min-w-[220px] items-center gap-3 rounded-sm border border-[#B0C4DE] bg-[#DCE6F2] px-4 py-1.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#4A6982] text-white opacity-90">
              <User size={22} />
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold text-[#37474F]">{selectedPatient?.name ?? "未选择患者"}</span>
              <span className="text-[11px] font-medium text-[#546E7A]">{selectedPatient?.id ?? "—"}</span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
            <div className="text-[9px] font-bold italic">♂ 0</div>
            <div className="text-[9px] font-bold">♀ 0</div>
            <div className="flex items-center gap-1 text-[11px] font-bold">
              <Flame size={13} />
              <span>0%</span>
            </div>
          </div>
        </div>

        <div className="text-center leading-none">
          <div className="text-[24px] font-bold tracking-tight text-[#37474F]">13:52</div>
          <div className="mt-1 text-[11px] font-medium text-[#546E7A] uppercase opacity-80">2月26日 周四</div>
        </div>

        <div className="flex items-center gap-4 pr-2 text-[#546E7A]">
          <div className="cursor-pointer p-1 text-[#D32F2F] hover:opacity-70"><Siren size={24} /></div>
          <div className="relative cursor-pointer p-1 hover:opacity-70">
            <Network size={20} />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#D32F2F] text-[9px] font-bold text-white">5</span>
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
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#D32F2F] text-[9px] font-bold text-white">10</span>
          </div>
        </div>
      </header>

      {/* ── 状态栏 ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-500" />
          <span className="text-[13px] font-bold text-slate-700">
            床位 {rescanRange[0] + 1}–{rescanRange[1] + 1} 存在重扫重叠
            <span className="ml-2 text-[11px] font-normal text-slate-400">
              共 {rescanCount} 个床位有两套采集数据，请为每个床位选择使用哪套
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 批量选择 */}
          <button
            onClick={() => handleBulkSelect("first")}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
          >
            全选采集 1
          </button>
          <button
            onClick={() => handleBulkSelect("rescan")}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-[#4D94FF] bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
          >
            全选重扫
          </button>

          {/* 视图切换 */}
          <div className="ml-3 flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold transition-colors ${
                viewMode === "table" ? "bg-[#4D94FF] text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <List size={12} /> 列表
            </button>
            <button
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

      {/* ── 主内容区 ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-5">
        {/* 全程扫描可视化 */}
        <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
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

        {/* 详细选择区 */}
        <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[12px] font-black text-slate-700">
              重扫床位逐一选择
            </div>
            <div className="text-[11px] text-slate-400">
              已选重扫 {rescanSelectedCount}/{rescanCount} 个床位
            </div>
          </div>

          {viewMode === "table" ? (
            <BedTable
              rescanRange={rescanRange}
              choices={choices}
              onChange={handleBedChange}
            />
          ) : (
            /* 时间轴模式下不需要额外列表 */
            <div className="flex items-center justify-center h-24 text-[12px] text-slate-400">
              在上方时间轴中直接点击床位块切换选择
            </div>
          )}
        </div>

        <RespiratoryWaveEditor points={wavePoints} onValueChange={handleWavePointChange} />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="flex h-[84px] shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-blue-50 shadow-sm transition-all uppercase text-[13px] active:scale-95"
        >
          <ChevronLeft size={20} /> 上一步
        </button>

        <div className="text-center text-[11px] text-slate-400">
          所有 {rescanCount} 个床位均已完成选择，可进入重建
        </div>

        <button
          onClick={handleConfirm}
          className="flex items-center gap-2 px-10 h-[52px] bg-[#4D94FF] text-white font-bold rounded-md shadow-lg hover:bg-blue-600 transition-all uppercase text-[13px] active:scale-95"
        >
          进入图像重建 <ChevronRight size={20} />
        </button>
      </footer>
    </div>
  );
}
