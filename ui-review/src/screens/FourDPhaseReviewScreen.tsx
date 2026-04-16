/**
 * FourDPhaseReviewScreen — 4D 扫描后处理：相位筛选
 *
 * 触发条件：扫描完成后，phaseMatrix 中存在 frameCount > 1 的格子。
 * 用户在此界面对每个冗余格子选择保留哪一帧，完成后进入下一步
 * （重扫选择 或 直接重建）。
 */

import { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, Sparkles, AlertCircle, CheckCircle2, X } from "lucide-react";

import { loadSelectedPatient } from "../lib/patientSession";
import type {
  FourDPostScanState,
  BedPhaseCell,
  PhaseSelections,
} from "../lib/fourDTypes";

// ─── 常量 ───────────────────────────────────────────────────────────────────

const PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];

// ─── 子组件：单帧选择 Modal ──────────────────────────────────────────────────

interface FramePickerModalProps {
  bedIdx: number;
  phaseIdx: number;
  cell: BedPhaseCell;
  currentSelection: number;
  onSelect: (frameIdx: number) => void;
  onClose: () => void;
}

function FramePickerModal({
  bedIdx,
  phaseIdx,
  cell,
  currentSelection,
  onSelect,
  onClose,
}: FramePickerModalProps) {
  const [localSel, setLocalSel] = useState(currentSelection);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-[#1E3A5F] px-6 py-4">
          <div>
            <div className="text-[13px] font-black text-white">选择保留帧</div>
            <div className="mt-0.5 text-[11px] text-blue-200">
              床位 {bedIdx + 1} · 相位 {PHASE_LABELS[phaseIdx]} · 共 {cell.frameCount} 帧
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-blue-200 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {/* Frame thumbnails */}
        <div className="flex gap-4 p-6">
          {Array.from({ length: cell.frameCount }, (_, fi) => (
            <button
              key={fi}
              onClick={() => setLocalSel(fi)}
              className={`flex-1 rounded-xl border-2 overflow-hidden transition-all ${
                localSel === fi
                  ? "border-[#4D94FF] shadow-[0_0_0_3px_rgba(77,148,255,0.25)]"
                  : "border-[#CBD5E1] hover:border-[#93C5FD]"
              }`}
            >
              {/* Mock thumbnail — 真实实现替换为 DICOM 缩略图 */}
              <div className="relative h-[120px] bg-gradient-to-br from-[#0a1a2e] to-[#1a3a5e] flex items-center justify-center">
                <div className="text-[11px] text-slate-400 font-mono">
                  床{bedIdx + 1} · {PHASE_LABELS[phaseIdx]} · 帧{fi + 1}
                </div>
                {/* 模拟图像噪声差异标记 */}
                <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white font-bold">
                  {fi === 0 ? "SNR 42.3" : "SNR 39.1"}
                </div>
              </div>
              <div className="flex items-center justify-between bg-[#F8FAFC] px-3 py-2">
                <span className="text-[11px] font-bold text-slate-600">帧 {fi + 1}</span>
                {localSel === fi && (
                  <CheckCircle2 size={14} className="text-[#4D94FF]" />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-500 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={() => { onSelect(localSel); onClose(); }}
            className="px-5 py-2 rounded-lg bg-[#4D94FF] text-white text-[12px] font-bold hover:bg-blue-600"
          >
            确认保留
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
  const state = location.state as FourDPostScanState | null;
  const scanResult = state?.scanResult;

  const selectedPatient = useMemo(() => loadSelectedPatient(), []);

  // ── 局部状态 ──
  // 维护一份可编辑的矩阵副本（selectedFrame 字段用户可修改）
  const [matrix, setMatrix] = useState<BedPhaseCell[][]>(() =>
    scanResult?.phaseMatrix.map((bed) => bed.map((cell) => ({ ...cell }))) ?? []
  );

  // 当前打开的 Modal 位置
  const [modalPos, setModalPos] = useState<{ bedIdx: number; phaseIdx: number } | null>(null);

  // ── 派生数据 ──
  const conflictCount = useMemo(
    () => matrix.reduce((t, bed) => t + bed.filter((c) => c.frameCount > 1).length, 0),
    [matrix]
  );

  const bedCount = scanResult?.bedCount ?? 0;
  const phaseCount = scanResult?.phaseCount ?? 10;

  // ── 自动选优：选 SNR 较高的帧（mock 逻辑：始终选帧 0） ──
  const handleAutoSelect = () => {
    setMatrix((prev) =>
      prev.map((bed) => bed.map((cell) => ({ ...cell, selectedFrame: 0 })))
    );
  };

  // ── 更新单格子选择 ──
  const handleCellSelect = (bedIdx: number, phaseIdx: number, frameIdx: number) => {
    setMatrix((prev) =>
      prev.map((bed, bi) =>
        bi !== bedIdx
          ? bed
          : bed.map((cell, pi) =>
              pi !== phaseIdx ? cell : { ...cell, selectedFrame: frameIdx }
            )
      )
    );
  };

  // ── 下一步导航 ──
  const handleNext = () => {
    if (!scanResult) return;

    // 将选择结果打包
    const phaseSelections: PhaseSelections = {};
    matrix.forEach((bed, bi) => {
      bed.forEach((cell, pi) => {
        if (cell.frameCount > 1) {
          phaseSelections[`${bi}-${pi}`] = cell.selectedFrame;
        }
      });
    });

    const nextState: FourDPostScanState = {
      ...state,
      scanResult,
      phaseSelections,
    };

    if (scanResult.rescanOccurred) {
      navigate("/fourd-rescan-select", { state: nextState });
    } else {
      navigate("/image-viewer", { state: nextState });
    }
  };

  // ── 无数据保护 ──
  if (!scanResult) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0F172A] text-white text-[13px]">
        无效状态，请重新扫描。
      </div>
    );
  }

  // ── 打开 Modal ──
  const openModal = (bedIdx: number, phaseIdx: number) => {
    setModalPos({ bedIdx, phaseIdx });
  };

  const modalCell =
    modalPos !== null ? matrix[modalPos.bedIdx]?.[modalPos.phaseIdx] : null;

  return (
    <div className="flex h-full flex-col bg-[#EDF1F7] select-none">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex h-[88px] shrink-0 items-center justify-between bg-[#1E3A5F] px-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-blue-300">
            4D 扫描后处理
          </div>
          <div className="text-[17px] font-black text-white">相位数据审核</div>
        </div>

        {/* 患者信息 */}
        {selectedPatient && (
          <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-2">
            <div className="h-8 w-8 rounded-full bg-blue-400/30 flex items-center justify-center">
              <span className="text-[12px] font-black text-blue-100">
                {selectedPatient.name?.[0] ?? "患"}
              </span>
            </div>
            <div>
              <div className="text-[13px] font-black text-white">
                {selectedPatient.name ?? "—"}
              </div>
              <div className="text-[10px] text-blue-200">{selectedPatient.id ?? "—"}</div>
            </div>
          </div>
        )}

        {/* 步骤指示器 */}
        <div className="flex items-center gap-2 text-[11px] font-bold">
          <span className="rounded-full bg-[#4D94FF] px-3 py-1 text-white">① 相位审核</span>
          <ChevronRight size={14} className="text-blue-300" />
          <span className={`rounded-full px-3 py-1 ${scanResult.rescanOccurred ? "bg-white/10 text-blue-200" : "bg-white/5 text-blue-400"}`}>
            {scanResult.rescanOccurred ? "② 重扫选择" : "② 图像重建"}
          </span>
        </div>
      </header>

      {/* ── 状态栏 ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3">
          {conflictCount > 0 ? (
            <>
              <AlertCircle size={16} className="text-amber-500" />
              <span className="text-[13px] font-bold text-slate-700">
                发现 <span className="text-amber-600">{conflictCount}</span> 个相位冲突
                <span className="ml-2 text-[11px] font-normal text-slate-400">
                  （相同床位+相位出现多帧采集，请选择保留哪一帧）
                </span>
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 size={16} className="text-green-500" />
              <span className="text-[13px] font-bold text-slate-700">所有相位无冲突，可直接进入下一步</span>
            </>
          )}
        </div>
        <button
          onClick={handleAutoSelect}
          className="flex items-center gap-1.5 rounded-lg bg-[#F0F7FF] px-4 py-2 text-[12px] font-bold text-[#4D94FF] border border-[#BFDBFE] hover:bg-blue-50 transition-colors"
        >
          <Sparkles size={13} />
          自动选优（按 SNR）
        </button>
      </div>

      {/* ── 矩阵区域 ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="inline-block min-w-full">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                {/* 左上角空格 */}
                <th className="w-[72px]" />
                {Array.from({ length: phaseCount }, (_, pi) => (
                  <th
                    key={pi}
                    className="w-[76px] pb-2 text-center text-[11px] font-bold text-slate-500 uppercase"
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
                  <td className="pr-2 text-right">
                    <div className="flex flex-col items-end justify-center h-[52px]">
                      <span className="text-[11px] font-black text-slate-600">床位 {bi + 1}</span>
                      <span className="text-[9px] text-slate-400">
                        {(bi * 19.2).toFixed(1)}mm
                      </span>
                    </div>
                  </td>

                  {/* 相位格子 */}
                  {matrix[bi]?.map((cell, pi) => {
                    const isConflict = cell.frameCount > 1;
                    return (
                      <td key={pi}>
                        <button
                          onClick={() => isConflict && openModal(bi, pi)}
                          disabled={!isConflict}
                          className={`
                            w-[76px] h-[52px] rounded-lg border text-center transition-all
                            ${isConflict
                              ? "border-amber-300 bg-amber-50 hover:bg-amber-100 cursor-pointer active:scale-95"
                              : "border-slate-200 bg-white cursor-default"
                            }
                          `}
                        >
                          {isConflict ? (
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[13px] font-black text-amber-600">
                                  {cell.frameCount}
                                </span>
                                <span className="text-[9px] text-amber-500">帧</span>
                              </div>
                              <div className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                                已选帧 {cell.selectedFrame + 1}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              <CheckCircle2 size={14} className="text-green-400" />
                              <span className="text-[9px] text-slate-400">正常</span>
                            </div>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 图例 */}
        <div className="mt-4 flex items-center gap-6 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded border border-slate-200 bg-white flex items-center justify-center">
              <CheckCircle2 size={10} className="text-green-400" />
            </div>
            正常（1 帧）
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded border border-amber-300 bg-amber-50" />
            冲突（多帧，点击选择）
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="flex h-[84px] shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-blue-50 shadow-sm transition-all uppercase text-[13px] active:scale-95"
        >
          <ChevronLeft size={20} /> 返回扫描
        </button>

        <div className="text-center text-[11px] text-slate-400">
          {conflictCount > 0
            ? `还有 ${conflictCount} 个冲突待确认（点击橙色格子选帧，或使用"自动选优"）`
            : "所有格子均已就绪"}
        </div>

        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-10 h-[52px] bg-[#4D94FF] text-white font-bold rounded-md shadow-lg hover:bg-blue-600 transition-all uppercase text-[13px] active:scale-95"
        >
          {scanResult.rescanOccurred ? "下一步：重扫选择" : "进入图像重建"}
          <ChevronRight size={20} />
        </button>
      </footer>

      {/* ── 帧选择 Modal ────────────────────────────────────────────── */}
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
