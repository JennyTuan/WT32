import { CircleDot } from "lucide-react";

import { useI18n } from "../../../../lib/i18nContext";
import type { WarmupPhase, WarmupLog, WarmupStatus } from "../types";

type WarmupContentProps = {
  activePhase: WarmupPhase;
  currentHeat: number;
  deltaToTarget: number;
  estimatedMinutes: number;
  handleAbort: () => void;
  handleStartWarmup: () => void;
  handleTargetInput: (value: string) => void;
  inputValue: string;
  lastCompletedAt: string | null;
  logs: WarmupLog[];
  normalizeTargetInput: () => void;
  recommendedTarget: number;
  resetToRecommended: () => void;
  setLogs: (updater: (prev: WarmupLog[]) => WarmupLog[]) => void;
  status: WarmupStatus;
  targetHeat: number;
  warmupProgress: number;
};

export function WarmupContent({
  currentHeat,
  handleStartWarmup,
  handleTargetInput,
  inputValue,
  normalizeTargetInput,
  status,
}: WarmupContentProps) {
  const { t } = useI18n();

  return (
    <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm px-10 py-8 flex flex-col h-full">
      <div className="text-[16px] font-black text-[#FF6F00]">{t("service.tubeWarmup.hint")}</div>

      <div className="flex-1 flex flex-col justify-center gap-12 max-w-[720px]">
        <div className="grid grid-cols-[220px_240px_60px] items-center gap-4">
          <label className="text-[32px] font-black text-[#37474F]">{t("service.tubeWarmup.currentHeat")}</label>
          <div className="h-[72px] bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg px-6 flex items-center text-[24px] font-mono font-black text-[#90A4AE]">
            {currentHeat.toFixed(2)}
          </div>
          <span className="text-[48px] font-black text-[#B0BEC5]">%</span>
        </div>

        <div className="grid grid-cols-[220px_180px_60px] items-center gap-4">
          <label className="text-[32px] font-black text-[#37474F]">{t("service.tubeWarmup.targetHeat")}</label>
          <input
            type="number"
            min={20}
            max={100}
            value={inputValue}
            onChange={(event) => handleTargetInput(event.target.value)}
            onBlur={normalizeTargetInput}
            className="h-[72px] bg-white border border-[#B0C4DE] rounded-lg px-6 text-[24px] font-mono font-black text-[#37474F] focus:outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-[48px] font-black text-[#B0BEC5]">%</span>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleStartWarmup}
          disabled={status === "warming"}
          className="w-[195px] h-[64px] bg-[#4D94FF] disabled:bg-[#A7C8F7] text-white rounded-lg font-black text-[18px] shadow-lg hover:bg-[#3B82F6] transition-all active:scale-95 flex items-center justify-center gap-3"
        >
          <CircleDot size={22} />
          <span>{status === "warming" ? t("service.tubeWarmup.warming") : t("service.tubeWarmup.startWarmup")}</span>
        </button>
      </div>
    </section>
  );
}
