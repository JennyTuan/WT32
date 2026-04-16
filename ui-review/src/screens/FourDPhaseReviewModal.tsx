/**
 * FourDPhaseReviewModal — 相位数据审核弹窗
 *
 * 在图像浏览界面 (ViewScreen) 的 4D 数据加载完成后弹出。
 * 不依赖路由，通过 props 驱动：传入 scanResult，完成后调用 onComplete。
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  ChevronRight, Sparkles, AlertCircle,
  CheckCircle2, X, Info,
} from "lucide-react";

import type { FourDScanResult, BedPhaseCell, PhaseSelections } from "../lib/fourDTypes";

// ─── 常量 ───────────────────────────────────────────────────────────────────

const PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];
const CELL_W = 78;
const CELL_H = 46;
const LABEL_W = 72;

// ─── 工具：模拟 SNR ──────────────────────────────────────────────────────────

function mockSnr(bedIdx: number, phaseIdx: number, frameIdx: number): number {
  const base = 38 + ((bedIdx * 7 + phaseIdx * 3) % 10);
  return parseFloat((base - frameIdx * 3.2).toFixed(1));
}

// ─── CT 截面缩略图（SVG 模拟） ───────────────────────────────────────────────

interface CtThumbProps {
  bedIdx: number;
  phaseIdx: number;
  frameIdx: number;
  size?: number;
}

function CtThumb({ bedIdx, phaseIdx, frameIdx, size = 120 }: CtThumbProps) {
  const breathShift = Math.sin((phaseIdx / 10) * Math.PI * 2) * 5;
  const noiseLevel = frameIdx * 18;
  const fovScale = 1 + (bedIdx % 3) * 0.02;
  const cx = 50, cy = 52 + breathShift;

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
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect width="100" height="100" fill="#08121e" />
      <ellipse cx={cx} cy={cy} rx={38 * fovScale} ry={36} fill="#152535" stroke="#1e3d55" strokeWidth="0.8" />
      <circle cx={cx} cy={cy + 20} r={7} fill="#3a6a8a" opacity="0.9" />
      <circle cx={cx} cy={cy + 20} r={4} fill="#5a9abf" opacity="0.7" />
      <circle cx={cx - 3} cy={cy + 10} r={4} fill="#2a5a7a" opacity="0.9" />
      <ellipse cx={cx + 4} cy={cy + 12} rx={2} ry={2.5} fill="#1a3a5a" opacity="0.8" />
      <ellipse cx={cx - 14} cy={cy - 2} rx={14} ry={20} fill="#07111e" stroke="#0f2535" strokeWidth="0.6" />
      <ellipse cx={cx + 15} cy={cy - 2} rx={13} ry={20} fill="#07111e" stroke="#0f2535" strokeWidth="0.6" />
      <ellipse cx={cx - 2} cy={cy + 2} rx={9} ry={10} fill="#1e3a5a" stroke="#2a5070" strokeWidth="0.6" />
      <ellipse cx={cx - 4} cy={cy + 4} rx={4} ry={5} fill="#2a5a7a" opacity="0.7" />
      <ellipse cx={cx + 3} cy={cy + 4} rx={3.5} ry={5} fill="#244e6e" opacity="0.6" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="white" opacity={d.o} />
      ))}
    </svg>
  );
}

// ─── 帧选择子弹窗 ────────────────────────────────────────────────────────────

interface FramePickerProps {
  bedIdx: number;
  phaseIdx: number;
  cell: BedPhaseCell;
  onSelect: (frameIdx: number) => void;
  onClose: () => void;
}

function FramePicker({ bedIdx, phaseIdx, cell, onSelect, onClose }: FramePickerProps) {
  const [localSel, setLocalSel] = useState(cell.selectedFrame);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const snrs = Array.from({ length: cell.frameCount }, (_, fi) => mockSnr(bedIdx, phaseIdx, fi));
  const bestFrame = snrs.indexOf(Math.max(...snrs));

  return (
    // 内层弹窗（叠加在 PhaseReviewModal 之上）
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 rounded-2xl"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[480px] rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between bg-[#1E3A5F] px-5 py-4">
          <div>
            <div className="text-[13px] font-black text-white">选择保留帧</div>
            <div className="mt-0.5 text-[10px] text-blue-200">
              床位 {bedIdx + 1} · 相位 {PHASE_LABELS[phaseIdx]} · 共 {cell.frameCount} 帧采集
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-blue-200 hover:bg-white/10">
            <X size={15} />
          </button>
        </div>

        <div className="flex gap-4 p-5">
          {Array.from({ length: cell.frameCount }, (_, fi) => {
            const snr = snrs[fi];
            const isBest = fi === bestFrame;
            const isSel  = localSel === fi;
            return (
              <button
                key={fi}
                onClick={() => setLocalSel(fi)}
                className={`flex-1 rounded-xl border-2 overflow-hidden transition-all ${
                  isSel
                    ? "border-[#4D94FF] shadow-[0_0_0_3px_rgba(77,148,255,0.18)] scale-[1.02]"
                    : "border-[#CBD5E1] hover:border-[#93C5FD]"
                }`}
              >
                <div className="relative bg-[#08121e] flex items-center justify-center">
                  <CtThumb bedIdx={bedIdx} phaseIdx={phaseIdx} frameIdx={fi} size={120} />
                  {isBest && (
                    <span className="absolute top-2 left-2 rounded bg-green-500/85 px-1.5 py-0.5 text-[9px] font-black text-white">推荐</span>
                  )}
                  <span className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    SNR {snr}
                  </span>
                </div>
                <div className={`flex items-center justify-between px-3 py-2 ${isSel ? "bg-blue-50" : "bg-[#F8FAFC]"}`}>
                  <span className={`text-[11px] font-bold ${isSel ? "text-[#2563EB]" : "text-slate-600"}`}>帧 {fi + 1}</span>
                  {isSel
                    ? <CheckCircle2 size={13} className="text-[#4D94FF]" />
                    : <div className="h-3 w-3 rounded-full border-2 border-slate-300" />
                  }
                </div>
              </button>
            );
          })}
        </div>

        <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg bg-slate-50 px-4 py-2.5">
          <Info size={12} className="mt-0.5 shrink-0 text-slate-400" />
          <p className="text-[10px] text-slate-500 leading-relaxed">
            SNR 越高图像质量越好，推荐保留 SNR 最高的帧。
          </p>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-3">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50">
            取消
          </button>
          <button
            onClick={() => { onSelect(localSel); onClose(); }}
            className="px-5 py-1.5 rounded-lg bg-[#4D94FF] text-white text-[11px] font-bold hover:bg-blue-600 shadow-sm"
          >
            确认保留帧 {localSel + 1}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 主弹窗组件 ──────────────────────────────────────────────────────────────

export interface FourDPhaseReviewModalProps {
  scanResult: FourDScanResult;
  onComplete: (phaseSelections: PhaseSelections) => void;
}

export function FourDPhaseReviewModal({ scanResult, onComplete }: FourDPhaseReviewModalProps) {
  const [matrix, setMatrix] = useState<BedPhaseCell[][]>(() =>
    scanResult.phaseMatrix.map((bed) => bed.map((cell) => ({ ...cell })))
  );
  const [confirmedKeys, setConfirmedKeys] = useState<Set<string>>(new Set());
  const [pickerPos, setPickerPos] = useState<{ bedIdx: number; phaseIdx: number } | null>(null);

  const bedCount  = scanResult.bedCount;
  const phaseCount = scanResult.phaseCount;

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

  const handleAutoSelect = useCallback(() => {
    setMatrix((prev) => prev.map((bed) => bed.map((cell) => ({ ...cell, selectedFrame: 0 }))));
    setConfirmedKeys(new Set(conflictKeys));
  }, [conflictKeys]);

  const handleCellSelect = useCallback((bedIdx: number, phaseIdx: number, frameIdx: number) => {
    setMatrix((prev) =>
      prev.map((bed, bi) =>
        bi !== bedIdx ? bed : bed.map((cell, pi) =>
          pi !== phaseIdx ? cell : { ...cell, selectedFrame: frameIdx }
        )
      )
    );
    setConfirmedKeys((prev) => new Set(prev).add(`${bedIdx}-${phaseIdx}`));
  }, []);

  const handleConfirm = useCallback(() => {
    const phaseSelections: PhaseSelections = {};
    matrix.forEach((bed, bi) => {
      bed.forEach((cell, pi) => {
        if (cell.frameCount > 1) phaseSelections[`${bi}-${pi}`] = cell.selectedFrame;
      });
    });
    onComplete(phaseSelections);
  }, [matrix, onComplete]);

  const pickerCell = pickerPos ? matrix[pickerPos.bedIdx]?.[pickerPos.phaseIdx] : null;

  return (
    // 全屏遮罩层——覆盖图像浏览界面
    <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-[3px]">
      {/* 弹窗容器 */}
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl">

        {/* ── 弹窗 Header ── */}
        <div className="flex h-[72px] shrink-0 items-center justify-between bg-[#1E3A5F] px-8">
          <div className="flex flex-col gap-0.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300">4D 数据后处理</div>
            <div className="text-[15px] font-black text-white">相位数据审核</div>
          </div>

          {/* 进度 */}
          <div className="flex items-center gap-3">
            {totalConflicts > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-[100px] rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#4D94FF] transition-all duration-300"
                      style={{ width: `${(confirmedCount / totalConflicts) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-blue-200">
                    {confirmedCount}/{totalConflicts}
                  </span>
                </div>
                <div className="h-4 w-px bg-white/20" />
              </>
            )}
            <button
              onClick={handleAutoSelect}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-bold text-blue-100 hover:bg-white/20 transition-colors"
            >
              <Sparkles size={12} />
              自动选优
            </button>
          </div>
        </div>

        {/* ── 状态提示条 ── */}
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-8">
          {totalConflicts > 0 ? (
            <>
              <AlertCircle size={14} className="text-amber-500 shrink-0" />
              <span className="text-[12px] font-bold text-slate-700">
                发现 <span className="text-amber-600">{totalConflicts}</span> 个相位冲突
              </span>
              <span className="text-[11px] text-slate-400">· 点击橙色格子选择保留哪一帧，或使用"自动选优"</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="text-green-500 shrink-0" />
              <span className="text-[12px] font-bold text-slate-700">所有相位数据正常，可直接确认</span>
            </>
          )}
        </div>

        {/* ── 矩阵区域 ── */}
        <div className="flex-1 overflow-auto px-8 py-6">
          <table className="border-separate" style={{ borderSpacing: "3px" }}>
            <thead>
              <tr>
                <th style={{ width: LABEL_W }} />
                {Array.from({ length: phaseCount }, (_, pi) => (
                  <th key={pi} style={{ width: CELL_W }}
                      className="pb-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    {PHASE_LABELS[pi]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: bedCount }, (_, bi) => (
                <tr key={bi}>
                  <td style={{ width: LABEL_W }}>
                    <div className="flex flex-col items-end justify-center pr-2" style={{ height: CELL_H }}>
                      <span className="text-[10px] font-black text-slate-600">床位 {bi + 1}</span>
                      <span className="text-[8px] text-slate-400 font-mono">{(bi * 19.2).toFixed(1)} mm</span>
                    </div>
                  </td>
                  {matrix[bi]?.map((cell, pi) => {
                    const key = `${bi}-${pi}`;
                    const isConflict  = cell.frameCount > 1;
                    const isConfirmed = confirmedKeys.has(key);

                    if (!isConflict) {
                      return (
                        <td key={pi}>
                          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-100 bg-[#FAFAFA]"
                               style={{ width: CELL_W, height: CELL_H }}>
                            <CheckCircle2 size={12} className="text-green-400" />
                            <span className="mt-0.5 text-[8px] text-slate-300">正常</span>
                          </div>
                        </td>
                      );
                    }

                    if (isConfirmed) {
                      return (
                        <td key={pi}>
                          <button
                            onClick={() => setPickerPos({ bedIdx: bi, phaseIdx: pi })}
                            className="flex flex-col items-center justify-center rounded-lg border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors active:scale-95"
                            style={{ width: CELL_W, height: CELL_H }}
                          >
                            <div className="flex items-center gap-0.5">
                              <CheckCircle2 size={10} className="text-amber-500" />
                              <span className="text-[11px] font-black text-amber-700">帧 {cell.selectedFrame + 1}</span>
                            </div>
                            <span className="text-[7px] font-bold text-amber-400">SNR {mockSnr(bi, pi, cell.selectedFrame)}</span>
                          </button>
                        </td>
                      );
                    }

                    return (
                      <td key={pi}>
                        <button
                          onClick={() => setPickerPos({ bedIdx: bi, phaseIdx: pi })}
                          className="flex flex-col items-center justify-center rounded-lg border-2 border-orange-300 bg-orange-50 hover:bg-orange-100 transition-colors active:scale-95"
                          style={{ width: CELL_W, height: CELL_H }}
                        >
                          <div className="flex items-center gap-0.5">
                            <span className="text-[13px] font-black text-orange-600">{cell.frameCount}</span>
                            <span className="text-[8px] font-bold text-orange-400">帧</span>
                          </div>
                          <span className="text-[7px] font-bold text-orange-400">待确认</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* 图例 */}
          <div className="mt-3 flex items-center gap-5 text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className="h-3.5 w-3.5 rounded border border-slate-100 bg-[#FAFAFA] flex items-center justify-center">
                <CheckCircle2 size={8} className="text-green-400" />
              </div>
              正常（1 帧）
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3.5 w-3.5 rounded border-2 border-orange-300 bg-orange-50" />
              冲突待确认（点击选帧）
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3.5 w-3.5 rounded border-2 border-amber-300 bg-amber-50" />
              冲突已确认（点击修改）
            </div>
          </div>
        </div>

        {/* ── 弹窗 Footer ── */}
        <div className="flex h-[72px] shrink-0 items-center justify-between border-t border-slate-200 bg-white px-8">
          <div className="text-[11px] text-slate-400">
            {!allConfirmed
              ? <span className="text-amber-500 font-bold">还有 {totalConflicts - confirmedCount} 个冲突未确认</span>
              : totalConflicts > 0
                ? <span className="text-green-600 font-bold">所有冲突已确认</span>
                : null
            }
          </div>
          <button
            onClick={handleConfirm}
            className={`flex items-center gap-2 px-8 h-[44px] font-bold rounded-lg shadow-md transition-all uppercase text-[12px] active:scale-95 ${
              allConfirmed
                ? "bg-[#4D94FF] text-white hover:bg-blue-600"
                : "bg-[#4D94FF]/65 text-white hover:bg-[#4D94FF]"
            }`}
          >
            确认并进入图像浏览 <ChevronRight size={16} />
          </button>
        </div>

        {/* ── 帧选择子弹窗 ── */}
        {pickerPos !== null && pickerCell !== null && (
          <FramePicker
            bedIdx={pickerPos.bedIdx}
            phaseIdx={pickerPos.phaseIdx}
            cell={pickerCell}
            onSelect={(fi) => handleCellSelect(pickerPos.bedIdx, pickerPos.phaseIdx, fi)}
            onClose={() => setPickerPos(null)}
          />
        )}
      </div>
    </div>
  );
}
