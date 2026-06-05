import { AlertTriangle } from "lucide-react";

import { useI18n } from "../../../../lib/i18nContext";
import { PHANTOM_LABEL_KEYS } from "../dailyQaI18n";
import type { PhantomType } from "../types";

type DailyQAOverlaysProps = {
  analysisStage: string;
  isRunningQa: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  phantomType: PhantomType;
  showAnalyzeConfirm: boolean;
};

export function DailyQAOverlays({
  analysisStage,
  isRunningQa,
  onCancel,
  onConfirm,
  phantomType,
  showAnalyzeConfirm,
}: DailyQAOverlaysProps) {
  const { t } = useI18n();
  const phantomLabel = t(PHANTOM_LABEL_KEYS[phantomType]);

  return (
    <>
      {showAnalyzeConfirm && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-[100] flex items-center justify-center animate-in fade-in duration-300">
          <div className="bg-white w-[560px] rounded-[32px] shadow-2xl p-10 flex flex-col relative animate-in zoom-in-95 duration-300">
            <div className="flex gap-6 mb-8">
              <div className="w-14 h-14 rounded-full bg-[#FFF7E6] flex items-center justify-center shrink-0 border border-[#FFE7BA]">
                <AlertTriangle size={32} className="text-[#FA8C16]" />
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="text-[22px] font-black text-[#263238] leading-tight">
                  {t("service.dailyQa.confirmTitle", { phantom: phantomLabel })}
                </h3>
                <p className="text-[16px] text-[#90A4AE] font-bold leading-relaxed">
                  {t("service.dailyQa.confirmBody")}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-4">
              <button
                onClick={onCancel}
                className="px-10 h-12 bg-white border border-[#B0C4DE] text-[#263238] font-black rounded-xl hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={onConfirm}
                className="px-10 h-12 bg-[#2F54EB] text-white font-black rounded-xl hover:bg-[#1D39C4] transition-all active:scale-95 shadow-lg"
              >
                {t("service.dailyQa.confirmRun")}
              </button>
            </div>
          </div>
        </div>
      )}

      {isRunningQa && (
        <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px] z-[105] flex items-center justify-center">
          <div className="w-[420px] rounded-[28px] bg-white p-10 shadow-2xl text-center">
            <div className="text-[28px] font-black text-[#263238]">{t("service.dailyQa.runningTitle")}</div>
            <div className="mt-4 text-[16px] font-bold text-[#4D94FF]">{analysisStage}</div>
            <div className="mt-6 h-2 rounded-full bg-[#E7EEF8] overflow-hidden">
              <div className="h-full w-[70%] bg-[#4D94FF] animate-pulse" />
            </div>
          </div>
        </div>
      )}

    </>
  );
}
