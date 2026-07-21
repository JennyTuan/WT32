import type { ReactNode } from "react";
import {
  Clock,
  Target,
  Zap,
  Layers,
  Check,
  RotateCcw,
  Play,
  Cpu,
  Wind,
} from "lucide-react";

import { useI18n } from "../../../../lib/i18nContext";
import { formatCalibrationFocusLabel } from "../labels";
import type {
  CalibrationRunStatus,
  CalibrationSelections,
} from "../types";

const OptionButton = ({
  label,
  unit,
  active,
  disabled,
  onClick,
}: {
  label: string;
  unit?: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`relative px-4 h-[40px] rounded-xl border transition-all duration-200 inline-flex items-center gap-2 font-medium text-[13px] select-none ${
      active
        ? "bg-[#4D94FF] text-white border-[#4D94FF] shadow-[0_4px_12px_rgba(77,148,255,0.25)] hover:bg-[#3B82F6] scale-[1.01]"
        : disabled
          ? "bg-[#F8FAFC] text-[#94A3B8] border-[#E2E8F0] cursor-not-allowed"
          : "bg-white text-[#334155] border-[#CBD5E1] hover:border-[#94A3B8] hover:bg-[#F8FAFC] hover:shadow-2xs active:scale-[0.98]"
    }`}
  >
    <div
      className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${
        active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-400 border border-slate-300"
      }`}
    >
      {active ? (
        <Check className="w-2.5 h-2.5 stroke-[3]" />
      ) : (
        <div className="w-1.5 h-1.5 rounded-full bg-slate-400/60" />
      )}
    </div>
    <span className="font-bold tracking-tight">{label}</span>
    {unit && (
      <span className={`text-[11px] font-semibold ${active ? "text-blue-50" : "text-slate-400"}`}>
        {unit}
      </span>
    )}
  </button>
);

const ParameterCard = ({
  title,
  icon: Icon,
  unitHint,
  selectedCount,
  totalCount,
  children,
}: {
  title: string;
  icon: React.ElementType;
  unitHint?: string;
  selectedCount: number;
  totalCount: number;
  children: ReactNode;
}) => (
  <div className="bg-[#F8FAFC]/90 border border-[#E2E8F0] rounded-xl p-4 transition-all hover:bg-slate-50 hover:border-[#CBD5E1] hover:shadow-2xs flex flex-col justify-between">
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#E3F2FD] border border-[#BBDEFB] text-[#1E88E5] flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-black text-[#1E293B] tracking-tight">{title}</h3>
            {unitHint && <span className="text-[11px] text-[#64748B] font-medium">{unitHint}</span>}
          </div>
        </div>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
            selectedCount > 0
              ? "bg-[#E3F2FD] text-[#1E88E5] border-[#BBDEFB]"
              : "bg-amber-50 text-amber-600 border-amber-200"
          }`}
        >
          {selectedCount > 0 ? `已选 ${selectedCount}/${totalCount}` : "未选择"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  </div>
);

type AirCalibrationContentProps = {
  completedCount: number;
  failedCount: number;
  handleStartCalibration: () => void | Promise<void>;
  isCalibrating: boolean;
  pendingCount: number;
  resetSelections: () => void;
  runStatus: CalibrationRunStatus;
  selectionState: CalibrationSelections;
  toggleSelection: (key: keyof CalibrationSelections, value: string) => void;
  totalCombinations: number;
};

export function AirCalibrationContent({
  completedCount,
  failedCount,
  handleStartCalibration,
  isCalibrating,
  pendingCount,
  resetSelections,
  runStatus,
  selectionState,
  toggleSelection,
  totalCombinations,
}: AirCalibrationContentProps) {
  const { t } = useI18n();
  const startButtonLabel =
    runStatus === "paused"
      ? t("service.airCalibration.action.resume")
      : runStatus === "completed"
        ? t("service.airCalibration.action.retryIncomplete")
        : t("service.airCalibration.action.start");

  return (
    <section className="flex-1 bg-white border border-[#CBD5E1] rounded-xl shadow-xs p-6 flex flex-col relative overflow-hidden h-full">
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Header Title Bar */}
        <div className="flex items-center justify-between gap-6 pb-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#4D94FF] text-white flex items-center justify-center shadow-sm shrink-0">
              <Wind className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="text-[20px] font-black text-[#1E293B] tracking-tight flex items-center gap-2">
                <span>{t("service.airCalibration.title")}</span>
              </div>
              <div className="text-[13px] text-[#64748B] mt-0.5">
                {t("service.airCalibration.subtitle")}
              </div>
            </div>
          </div>

          <div className="px-3.5 py-1.5 bg-[#E3F2FD] border border-[#BBDEFB] rounded-full text-[12px] font-bold text-[#1E88E5] flex items-center gap-1.5 shadow-2xs">
            <div className="w-2 h-2 rounded-full bg-[#4D94FF] animate-pulse" />
            <span>{t("service.airCalibration.combosQueued", { count: totalCombinations })}</span>
          </div>
        </div>

        {/* Parameter Cards Grid */}
        <div className="grid grid-cols-2 gap-4 mt-5">
          <ParameterCard
            title={t("service.airCalibration.rotationSpeed")}
            icon={Clock}
            unitHint="曝光时间 (s)"
            selectedCount={selectionState.rotationSpeeds.length}
            totalCount={3}
          >
            {["1", "2", "0.75"].map((value) => (
              <OptionButton
                key={value}
                label={value}
                unit="s"
                active={selectionState.rotationSpeeds.includes(value)}
                disabled={isCalibrating}
                onClick={() => toggleSelection("rotationSpeeds", value)}
              />
            ))}
          </ParameterCard>

          <ParameterCard
            title={t("service.airCalibration.focus")}
            icon={Target}
            unitHint="焦点规格"
            selectedCount={selectionState.focuses.length}
            totalCount={2}
          >
            {["small", "big"].map((value) => (
              <OptionButton
                key={value}
                label={formatCalibrationFocusLabel(t, value)}
                active={selectionState.focuses.includes(value)}
                disabled={isCalibrating}
                onClick={() => toggleSelection("focuses", value)}
              />
            ))}
          </ParameterCard>

          <ParameterCard
            title={t("service.airCalibration.voltage")}
            icon={Zap}
            unitHint="管电压 (kV)"
            selectedCount={selectionState.voltages.length}
            totalCount={4}
          >
            {["80", "100", "120", "140"].map((value) => (
              <OptionButton
                key={value}
                label={value}
                unit="kV"
                active={selectionState.voltages.includes(value)}
                disabled={isCalibrating}
                onClick={() => toggleSelection("voltages", value)}
              />
            ))}
          </ParameterCard>

          <ParameterCard
            title={t("service.airCalibration.collimator")}
            icon={Layers}
            unitHint="准直宽度 (mm)"
            selectedCount={selectionState.collimators.length}
            totalCount={1}
          >
            {["32*0.6"].map((value) => (
              <OptionButton
                key={value}
                label={value}
                active={selectionState.collimators.includes(value)}
                disabled={isCalibrating}
                onClick={() => toggleSelection("collimators", value)}
              />
            ))}
          </ParameterCard>
        </div>

        {/* Combination Matrix Summary Box */}
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-slate-50 to-[#F0F7FF] border border-[#BBDEFB] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-white border border-[#BBDEFB] shadow-2xs flex items-center justify-center text-[#1E88E5] shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-[#1E293B] flex items-center gap-2">
                <span>校正组合矩阵计算</span>
                <span className="text-[11px] font-normal text-[#64748B]">
                  ({selectionState.rotationSpeeds.length} 速度 × {selectionState.focuses.length} 焦点 × {selectionState.voltages.length} 电压 × {selectionState.collimators.length} 准直器)
                </span>
              </div>
              <div className="text-[12px] text-[#64748B] mt-0.5 flex items-center gap-3">
                <span>预计扫描时间: ~{Math.max(1, Math.round((totalCombinations * 10) / 60))} 分钟</span>
                <span className="inline-block w-1 h-1 rounded-full bg-slate-300" />
                <span className="text-[#1E88E5] font-medium">支持断点续传校正</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">待计算组合:</span>
            <span className="px-3 py-1 bg-white border border-[#BBDEFB] rounded-lg text-[16px] font-black text-[#1E88E5] shadow-2xs">
              {totalCombinations}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Actions & Queue Status */}
      <div className="mt-4 pt-4 border-t border-[#E2E8F0] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#334155]">
            <span>{t("service.airCalibration.queueSize")}</span>
            <span className="px-2.5 py-0.5 rounded-md bg-[#E3F2FD] text-[#1E88E5] border border-[#BBDEFB] text-[15px] font-black">
              {totalCombinations}
            </span>
          </div>
          <div className="h-4 w-[1px] bg-slate-200" />
          <div className="flex items-center gap-3 text-[12px] font-semibold text-[#64748B]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              已完成: <strong className="text-slate-800">{completedCount}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              失败: <strong className="text-slate-800">{failedCount}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#4D94FF]" />
              待执行: <strong className="text-slate-800">{pendingCount}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={resetSelections}
            disabled={isCalibrating}
            className={`px-5 h-[42px] min-w-[120px] border font-bold rounded-xl transition-all shadow-2xs text-[13px] flex items-center justify-center gap-1.5 ${
              isCalibrating
                ? "bg-[#F8FAFC] border-[#E2E8F0] text-[#94A3B8] cursor-not-allowed"
                : "bg-white border-[#CBD5E1] text-[#475569] hover:bg-[#F8FAFC] hover:text-[#1E293B] active:scale-95"
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>{t("service.airCalibration.action.clear")}</span>
          </button>
          <button
            onClick={handleStartCalibration}
            disabled={isCalibrating || totalCombinations === 0}
            className={`flex items-center justify-center gap-2 px-6 h-[42px] min-w-[170px] font-black rounded-xl text-[14px] transition-all ${
              isCalibrating || totalCombinations === 0
                ? "bg-[#CBD5E1] text-white cursor-not-allowed shadow-none"
                : "bg-[#4D94FF] hover:bg-[#3B82F6] text-white shadow-[0_6px_18px_rgba(77,148,255,0.25)] active:scale-95"
            }`}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{startButtonLabel}</span>
          </button>
        </div>
      </div>
    </section>
  );
}


