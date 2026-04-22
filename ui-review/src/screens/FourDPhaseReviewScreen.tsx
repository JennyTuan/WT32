/**
 * FourDPhaseReviewScreen — 4D 扫描后处理：相位筛选
 *
 * 进入条件：phaseMatrix 中存在 frameCount > 1 的格子（相位冗余）。
 * 用户对每个冲突格子选择保留哪一帧（可手动逐个确认，也可批量自动选优）。
 * 完成后传递 PhaseSelections 进入下一步（重扫选择 or 图像重建）。
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Sparkles, AlertCircle,
  CheckCircle2, X, Info,
} from "lucide-react";

import { loadSelectedPatient, formatPatientCardSubtitle } from "../lib/patientSession";
import type { FourDPostScanState, BedPhaseCell, PhaseSelections } from "../lib/fourDTypes";
import { generateMockScanResult } from "../lib/fourDTypes";

// ── Dev fallback: 直接访问 /fourd-phase-review 时注入 mock 数据 ──
const DEV_MOCK_STATE: FourDPostScanState = {
  scanResult: generateMockScanResult(9, 10, 165.0),
};

// ─── 常量 ───────────────────────────────────────────────────────────────────

const PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];
const CELL_W = 82;   // px，每个相位格宽
const CELL_H = 48;   // px，每个格高
const LABEL_W = 76;  // px，床位标签列宽

// ─── 工具：模拟 SNR（基于床位/相位/帧索引，结果确定性） ──────────────────────

function mockSnr(bedIdx: number, phaseIdx: number, frameIdx: number): number {
  const base = 38 + ((bedIdx * 7 + phaseIdx * 3) % 10);
  return parseFloat((base - frameIdx * 3.2).toFixed(1));
}

// ─── 子组件：CT 截面缩略图（SVG 模拟） ──────────────────────────────────────

interface CtThumbProps {
  bedIdx: number;
  phaseIdx: number;
  frameIdx: number;
  size?: number;
}

function CtThumb({ bedIdx, phaseIdx, frameIdx, size = 130 }: CtThumbProps) {
  // 用相位索引稍微移动解剖结构，模拟呼吸运动
  const breathShift = Math.sin((phaseIdx / 10) * Math.PI * 2) * 5;
  // 帧索引越大，噪声越多（SNR 越低）
  const noiseLevel = frameIdx * 18;
  // 用 bedIdx 给 fov 做微小变化，让不同床位看起来略有不同
  const fovScale = 1 + (bedIdx % 3) * 0.02;

  const cx = 50;
  const cy = 52 + breathShift;

  // 随机噪点（种子确定性）
  const dots = useMemo(() => {
    const arr: { x: number; y: number; r: number; o: number }[] = [];
    let seed = bedIdx * 31 + phaseIdx * 17 + frameIdx * 7;
    const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
    for (let i = 0; i < noiseLevel; i++) {
      arr.push({ x: rng() * 100, y: rng() * 100, r: rng() * 1.2 + 0.3, o: rng() * 0.35 + 0.1 });
    }
    return arr;
  }, [bedIdx, phaseIdx, frameIdx, noiseLevel]);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#08121e" />
      {/* 身体轮廓 */}
      <ellipse cx={cx} cy={cy} rx={38 * fovScale} ry={36} fill="#152535" stroke="#1e3d55" strokeWidth="0.8" />
      {/* 胸椎 */}
      <circle cx={cx} cy={cy + 20} r={7} fill="#3a6a8a" opacity="0.9" />
      <circle cx={cx} cy={cy + 20} r={4} fill="#5a9abf" opacity="0.7" />
      {/* 主动脉 */}
      <circle cx={cx - 3} cy={cy + 10} r={4} fill="#2a5a7a" opacity="0.9" />
      {/* 食管 */}
      <ellipse cx={cx + 4} cy={cy + 12} rx={2} ry={2.5} fill="#1a3a5a" opacity="0.8" />
      {/* 左肺 */}
      <ellipse
        cx={cx - 14} cy={cy - 2}
        rx={14} ry={20}
        fill="#07111e" stroke="#0f2535" strokeWidth="0.6"
      />
      {/* 右肺 */}
      <ellipse
        cx={cx + 15} cy={cy - 2}
        rx={13} ry={20}
        fill="#07111e" stroke="#0f2535" strokeWidth="0.6"
      />
      {/* 心脏 */}
      <ellipse
        cx={cx - 2} cy={cy + 2}
        rx={9} ry={10}
        fill="#1e3a5a" stroke="#2a5070" strokeWidth="0.6"
      />
      {/* 心室高亮 */}
      <ellipse cx={cx - 4} cy={cy + 4} rx={4} ry={5} fill="#2a5a7a" opacity="0.7" />
      <ellipse cx={cx + 3} cy={cy + 4} rx={3.5} ry={5} fill="#244e6e" opacity="0.6" />
      {/* 噪声点 */}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="white" opacity={d.o} />
      ))}
    </svg>
  );
}

// ─── 子组件：帧选择 Modal ────────────────────────────────────────────────────

interface FramePickerModalProps {
  bedIdx: number;
  phaseIdx: number;
  cell: BedPhaseCell;
  currentSelection: number;
  onSelect: (frameIdx: number) => void;
  onClose: () => void;
}

function FramePickerModal({
  bedIdx, phaseIdx, cell, currentSelection, onSelect, onClose,
}: FramePickerModalProps) {
  const [localSel, setLocalSel] = useState(currentSelection);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const snrs = Array.from({ length: cell.frameCount }, (_, fi) =>
    mockSnr(bedIdx, phaseIdx, fi)
  );
  const bestFrame = snrs.indexOf(Math.max(...snrs));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[520px] rounded-2xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">

        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between bg-[#1E3A5F] px-6 py-4">
          <div>
            <div className="text-[14px] font-black text-white">选择保留帧</div>
            <div className="mt-0.5 text-[11px] text-blue-200">
              床位 {bedIdx + 1} · 相位 {PHASE_LABELS[phaseIdx]} · 共 {cell.frameCount} 帧采集
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-blue-200 hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── 帧缩略图 ── */}
        <div className={`flex gap-4 p-6 ${cell.frameCount > 3 ? "flex-wrap" : ""}`}>
          {Array.from({ length: cell.frameCount }, (_, fi) => {
            const snr = snrs[fi];
            const isBest = fi === bestFrame;
            const isSelected = localSel === fi;
            return (
              <button
                key={fi}
                onClick={() => setLocalSel(fi)}
                className={`
                  flex-1 min-w-[140px] rounded-xl border-2 overflow-hidden transition-all duration-150
                  ${isSelected
                    ? "border-[#4D94FF] shadow-[0_0_0_3px_rgba(77,148,255,0.20)] scale-[1.02]"
                    : "border-[#CBD5E1] hover:border-[#93C5FD] hover:scale-[1.01]"
                  }
                `}
              >
                {/* 缩略图区域 */}
                <div className="relative bg-[#08121e] flex items-center justify-center">
                  <CtThumb bedIdx={bedIdx} phaseIdx={phaseIdx} frameIdx={fi} size={130} />
                  {/* 推荐/已选标签 */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {isBest && (
                      <span className="rounded bg-green-500/85 px-1.5 py-0.5 text-[9px] font-black text-white">
                        推荐
                      </span>
                    )}
                  </div>
                  {/* SNR */}
                  <div className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    SNR {snr}
                  </div>
                  {/* 选中遮罩 */}
                  {isSelected && (
                    <div className="absolute inset-0 border-2 border-[#4D94FF] rounded pointer-events-none" />
                  )}
                </div>

                {/* 底部信息 */}
                <div className={`flex items-center justify-between px-3 py-2 ${
                  isSelected ? "bg-blue-50" : "bg-[#F8FAFC]"
                }`}>
                  <span className={`text-[12px] font-bold ${isSelected ? "text-[#2563EB]" : "text-slate-600"}`}>
                    帧 {fi + 1}
                  </span>
                  {isSelected
                    ? <CheckCircle2 size={14} className="text-[#4D94FF]" />
                    : <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300" />
                  }
                </div>
              </button>
            );
          })}
        </div>

        {/* ── 说明行 ── */}
        <div className="mx-6 mb-4 flex items-start gap-2 rounded-lg bg-slate-50 px-4 py-3">
          <Info size={13} className="mt-0.5 shrink-0 text-slate-400" />
          <p className="text-[11px] text-slate-500 leading-relaxed">
            SNR（信噪比）越高图像质量越好，推荐保留 SNR 最高的帧。
            如需对比查看可在正式系统中调取完整图像。
          </p>
        </div>

        {/* ── 操作按钮 ── */}
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-500 hover:bg-slate-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => { onSelect(localSel); onClose(); }}
            className="px-6 py-2 rounded-lg bg-[#4D94FF] text-white text-[12px] font-bold hover:bg-blue-600 transition-colors shadow-sm"
          >
            确认保留帧 {localSel + 1}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 主界面 ──────────────────────────────────────────────────────────────────

export default function FourDPhaseReviewScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as FourDPostScanState | null) ?? DEV_MOCK_STATE;
  const scanResult = state.scanResult;
  const selectedPatient = useMemo(() => loadSelectedPatient(), []);

  // ── 矩阵副本（selectedFrame 可修改） ──
  const [matrix, setMatrix] = useState<BedPhaseCell[][]>(() =>
    scanResult?.phaseMatrix.map((bed) => bed.map((cell) => ({ ...cell }))) ?? []
  );

  // ── 已"明确确认"的冲突格子 key 集合 (`${bi}-${pi}`) ──
  const [confirmedKeys, setConfirmedKeys] = useState<Set<string>>(new Set());

  // ── 当前打开的 Modal ──
  const [modalPos, setModalPos] = useState<{ bedIdx: number; phaseIdx: number } | null>(null);

  const bedCount  = scanResult?.bedCount  ?? 0;
  const phaseCount = scanResult?.phaseCount ?? 10;

  // ── 派生统计 ──
  const { totalConflicts, conflictKeys } = useMemo(() => {
    let total = 0;
    const keys: string[] = [];
    matrix.forEach((bed, bi) => {
      bed.forEach((cell, pi) => {
        if (cell.frameCount > 1) { total++; keys.push(`${bi}-${pi}`); }
      });
    });
    return { totalConflicts: total, conflictKeys: keys };
  }, [matrix]);

  const confirmedCount = useMemo(
    () => conflictKeys.filter((k) => confirmedKeys.has(k)).length,
    [conflictKeys, confirmedKeys]
  );
  const allConfirmed = totalConflicts === 0 || confirmedCount === totalConflicts;

  // ── 自动选优：批量标记所有冲突格为"确认"，选 SNR 最高帧（frame 0） ──
  const handleAutoSelect = useCallback(() => {
    setMatrix((prev) =>
      prev.map((bed) => bed.map((cell) => ({ ...cell, selectedFrame: 0 })))
    );
    setConfirmedKeys(new Set(conflictKeys));
  }, [conflictKeys]);

  // ── 单格子确认 ──
  const handleCellSelect = useCallback(
    (bedIdx: number, phaseIdx: number, frameIdx: number) => {
      setMatrix((prev) =>
        prev.map((bed, bi) =>
          bi !== bedIdx
            ? bed
            : bed.map((cell, pi) =>
                pi !== phaseIdx ? cell : { ...cell, selectedFrame: frameIdx }
              )
        )
      );
      setConfirmedKeys((prev) => new Set(prev).add(`${bedIdx}-${phaseIdx}`));
    },
    []
  );

  // ── 下一步 ──
  const handleNext = useCallback(() => {
    const phaseSelections: PhaseSelections = {};
    matrix.forEach((bed, bi) => {
      bed.forEach((cell, pi) => {
        if (cell.frameCount > 1) phaseSelections[`${bi}-${pi}`] = cell.selectedFrame;
      });
    });
    const nextState: FourDPostScanState = {
      ...state,
      scanResult,
      phaseSelections,
      showSliceLoadingBeforeImageLoad: true,
    };
    navigate(
      scanResult.rescanOccurred ? "/fourd-rescan-select" : "/image-viewer",
      { state: nextState }
    );
  }, [matrix, navigate, scanResult, state]);

  const modalCell = modalPos ? matrix[modalPos.bedIdx]?.[modalPos.phaseIdx] : null;

  return (
    <div className="flex h-full flex-col bg-[#EDF1F7] select-none">

      {/* ════ Header ════ */}
      <header className="flex h-[88px] shrink-0 items-center justify-between bg-[#1E3A5F] px-6">
        {/* 左：标题 */}
        <div className="flex flex-col gap-0.5 min-w-[160px]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
            4D 扫描后处理
          </div>
          <div className="text-[18px] font-black text-white leading-tight">相位数据审核</div>
        </div>

        {/* 中：患者信息 */}
        {selectedPatient && (
          <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-2">
            <div className="h-8 w-8 rounded-full bg-blue-400/25 flex items-center justify-center">
              <span className="text-[13px] font-black text-blue-100">
                {selectedPatient.name?.[0] ?? "患"}
              </span>
            </div>
            <div>
              <div className="text-[13px] font-black text-white">{selectedPatient.name ?? "—"}</div>
              <div className="text-[10px] text-blue-200">
                {formatPatientCardSubtitle(selectedPatient)}
              </div>
            </div>
          </div>
        )}

        {/* 右：步骤指示器 */}
        <div className="flex items-center gap-1.5 text-[11px] font-bold">
          <div className="flex items-center gap-1 rounded-full bg-[#4D94FF] px-3 py-1 text-white">
            <div className="h-1.5 w-1.5 rounded-full bg-white" />
            相位审核
          </div>
          <ChevronRight size={12} className="text-blue-300" />
          {scanResult.rescanOccurred ? (
            <span className="rounded-full bg-white/10 px-3 py-1 text-blue-300">重扫选择</span>
          ) : (
            <span className="rounded-full bg-white/5 px-3 py-1 text-blue-400/60">图像重建</span>
          )}
        </div>
      </header>

      {/* ════ 状态栏 ════ */}
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        {/* 左：冲突统计 */}
        <div className="flex items-center gap-3">
          {totalConflicts > 0 ? (
            <>
              <AlertCircle size={15} className="shrink-0 text-amber-500" />
              <span className="text-[12px] font-bold text-slate-700">
                共 <span className="text-amber-600">{totalConflicts}</span> 个相位冲突
              </span>
              <div className="h-4 w-px bg-slate-200" />
              {/* 进度条 */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-[120px] rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#4D94FF] transition-all duration-300"
                    style={{ width: `${(confirmedCount / totalConflicts) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-slate-500">
                  {confirmedCount}/{totalConflicts} 已确认
                </span>
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 size={15} className="text-green-500" />
              <span className="text-[12px] font-bold text-slate-700">所有相位数据正常，可直接进入下一步</span>
            </>
          )}
        </div>

        {/* 右：自动选优按钮 */}
        {totalConflicts > 0 && (
          <button
            onClick={handleAutoSelect}
            className="flex items-center gap-1.5 rounded-lg bg-[#EFF6FF] px-4 py-2 text-[12px] font-bold text-[#4D94FF] border border-[#BFDBFE] hover:bg-blue-100 transition-colors active:scale-95"
          >
            <Sparkles size={13} />
            自动选优（按 SNR）
          </button>
        )}
      </div>

      {/* ════ 矩阵区域 ════ */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <table
          className="border-separate"
          style={{ borderSpacing: "3px" }}
        >
          <thead>
            <tr>
              {/* 左上角 */}
              <th style={{ width: LABEL_W }} />
              {Array.from({ length: phaseCount }, (_, pi) => (
                <th
                  key={pi}
                  style={{ width: CELL_W }}
                  className="pb-1.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wide"
                >
                  {PHASE_LABELS[pi]}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {Array.from({ length: bedCount }, (_, bi) => (
              <tr key={bi}>
                {/* 床位标签 */}
                <td style={{ width: LABEL_W }}>
                  <div
                    className="flex flex-col items-end justify-center pr-2"
                    style={{ height: CELL_H }}
                  >
                    <span className="text-[11px] font-black text-slate-600">床位 {bi + 1}</span>
                    <span className="text-[9px] text-slate-400 font-mono">
                      {(bi * 19.2).toFixed(1)} mm
                    </span>
                  </div>
                </td>

                {/* 相位格子 */}
                {matrix[bi]?.map((cell, pi) => {
                  const key = `${bi}-${pi}`;
                  const isConflict  = cell.frameCount > 1;
                  const isConfirmed = confirmedKeys.has(key);

                  if (!isConflict) {
                    // 正常格子
                    return (
                      <td key={pi}>
                        <div
                          className="flex flex-col items-center justify-center rounded-lg border border-slate-100 bg-white"
                          style={{ width: CELL_W, height: CELL_H }}
                        >
                          <CheckCircle2 size={13} className="text-green-400" />
                          <span className="mt-0.5 text-[9px] text-slate-300">正常</span>
                        </div>
                      </td>
                    );
                  }

                  if (isConfirmed) {
                    // 已确认冲突格子
                    return (
                      <td key={pi}>
                        <button
                          onClick={() => setModalPos({ bedIdx: bi, phaseIdx: pi })}
                          className="flex flex-col items-center justify-center rounded-lg border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors active:scale-95"
                          style={{ width: CELL_W, height: CELL_H }}
                          title="点击重新选择"
                        >
                          <div className="flex items-center gap-1">
                            <CheckCircle2 size={11} className="text-amber-500" />
                            <span className="text-[12px] font-black text-amber-700">
                              帧 {cell.selectedFrame + 1}
                            </span>
                          </div>
                          <span className="text-[8px] font-bold text-amber-500 mt-0.5">
                            SNR {mockSnr(bi, pi, cell.selectedFrame)}
                          </span>
                        </button>
                      </td>
                    );
                  }

                  // 未确认冲突格子
                  return (
                    <td key={pi}>
                      <button
                        onClick={() => setModalPos({ bedIdx: bi, phaseIdx: pi })}
                        className="flex flex-col items-center justify-center rounded-lg border-2 border-orange-300 bg-orange-50 hover:bg-orange-100 transition-colors active:scale-95"
                        style={{ width: CELL_W, height: CELL_H }}
                        title={`${cell.frameCount} 帧，点击选择`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-[14px] font-black text-orange-600">
                            {cell.frameCount}
                          </span>
                          <span className="text-[9px] font-bold text-orange-400">帧</span>
                        </div>
                        <span className="text-[8px] font-bold text-orange-400 mt-0.5">
                          待确认
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* 图例 */}
        <div className="mt-3 flex items-center gap-5 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded border border-slate-100 bg-white flex items-center justify-center">
              <CheckCircle2 size={9} className="text-green-400" />
            </div>
            正常（1 帧）
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded border-2 border-orange-300 bg-orange-50" />
            冲突待确认（点击选帧）
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded border-2 border-amber-300 bg-amber-50 flex items-center justify-center">
              <CheckCircle2 size={9} className="text-amber-500" />
            </div>
            冲突已确认（点击修改）
          </div>
        </div>
      </div>

      {/* ════ Footer ════ */}
      <footer className="flex h-[84px] shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-8 h-[48px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-blue-50 shadow-sm transition-all uppercase text-[12px] active:scale-95"
        >
          <ChevronLeft size={18} /> 返回扫描
        </button>

        {/* 中间提示文字 */}
        <div className="text-center text-[11px] text-slate-400">
          {!allConfirmed
            ? <span className="text-amber-500 font-bold">还有 {totalConflicts - confirmedCount} 个冲突未确认，可点击橙色格子或使用"自动选优"</span>
            : totalConflicts > 0
              ? <span className="text-green-600 font-bold">所有冲突已确认，可进入下一步</span>
              : null
          }
        </div>

        <button
          onClick={handleNext}
          className={`flex items-center gap-2 px-8 h-[48px] font-bold rounded-md shadow-lg transition-all uppercase text-[12px] active:scale-95 ${
            allConfirmed
              ? "bg-[#4D94FF] text-white hover:bg-blue-600"
              : "bg-[#4D94FF]/70 text-white hover:bg-[#4D94FF]"
          }`}
        >
          {scanResult.rescanOccurred ? "下一步：重扫选择" : "进入图像重建"}
          <ChevronRight size={18} />
        </button>
      </footer>

      {/* ════ 帧选择 Modal ════ */}
      {modalPos !== null && modalCell !== null && (
        <FramePickerModal
          bedIdx={modalPos.bedIdx}
          phaseIdx={modalPos.phaseIdx}
          cell={modalCell}
          currentSelection={modalCell.selectedFrame}
          onSelect={(fi) => handleCellSelect(modalPos.bedIdx, modalPos.phaseIdx, fi)}
          onClose={() => setModalPos(null)}
        />
      )}
    </div>
  );
}
