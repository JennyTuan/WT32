import { AlertTriangle, Square, Activity, Cpu } from "lucide-react";

import { useI18n } from "../../../../lib/i18nContext";
import { formatCalibrationCombo } from "../labels";
import type { CalibrationCombo } from "../types";

type AirCalibrationOverlaysProps = {
  calibrationProgress: number;
  completedCount: number;
  confirmAbort: () => void;
  currentCombo: CalibrationCombo | null;
  failedCount: number;
  handleAbort: () => void;
  isCalibrating: boolean;
  pendingCount: number;
  setShowAbortConfirm: (value: boolean) => void;
  stageLabel: string;
  showAbortConfirm: boolean;
  totalCombinations: number;
};

export function AirCalibrationOverlays({
  calibrationProgress,
  completedCount,
  confirmAbort,
  currentCombo,
  failedCount,
  handleAbort,
  isCalibrating,
  pendingCount,
  setShowAbortConfirm,
  stageLabel,
  showAbortConfirm,
  totalCombinations,
}: AirCalibrationOverlaysProps) {
  const { t } = useI18n();

  return (
    <>
      {isCalibrating && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-300">
          <div className="bg-white w-[640px] rounded-3xl shadow-2xl p-8 border border-slate-100 flex flex-col justify-between animate-in zoom-in-95 duration-300">
            <div>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-2 text-[#1E88E5] font-bold text-xs uppercase tracking-wider mb-1">
                    <Activity className="w-4 h-4 animate-spin" />
                    <span>CALIBRATION IN PROGRESS</span>
                  </div>
                  <h2 className="text-[26px] font-black text-[#1E293B]">
                    {t("service.airCalibration.runningTitle")}
                  </h2>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[52px] font-black leading-none text-[#4D94FF] italic">
                    {Math.floor(calibrationProgress)}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative w-full h-3.5 bg-slate-100 rounded-full overflow-hidden mb-6 shadow-inner">
                <div
                  className="h-full bg-[#4D94FF] rounded-full transition-all duration-300 relative"
                  style={{ width: `${calibrationProgress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>

              {/* Stage & Combo Details */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#4D94FF]" />
                    <span>{t("service.airCalibration.stage")}</span>
                  </div>
                  <div className="mt-1.5 text-[16px] font-black text-slate-800">{stageLabel}</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-[#1E88E5]" />
                    <span>{t("service.airCalibration.currentCombo")}</span>
                  </div>
                  <div className="mt-1.5 text-[15px] font-bold text-[#1E88E5] leading-snug">
                    {currentCombo
                      ? formatCalibrationCombo(t, currentCombo)
                      : t("service.airCalibration.preparingQueue")}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Status Bar */}
            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <div className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-700">
                  {calibrationProgress.toFixed(2)}%
                </div>
                <div className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-700">
                  {t("service.airCalibration.completedRatio", {
                    completed: completedCount,
                    total: totalCombinations,
                  })}
                </div>
                <div className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-700">
                  {t("service.airCalibration.failedPending", {
                    failed: failedCount,
                    pending: pendingCount,
                  })}
                </div>
              </div>

              <button
                onClick={handleAbort}
                className="flex items-center gap-2 px-5 h-11 bg-rose-50 border border-rose-200 text-rose-600 font-bold rounded-xl shadow-2xs hover:bg-rose-100 transition-all active:scale-95 text-[14px]"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>{t("service.airCalibration.action.stop")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showAbortConfirm && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs z-[60] flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white w-[520px] rounded-3xl shadow-2xl border border-slate-100 p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-5 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-500 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-[20px] font-black text-slate-800 mb-2">
                  {t("service.airCalibration.stopConfirmTitle")}
                </h3>
                <p className="text-[14px] text-slate-600 font-medium leading-relaxed">
                  {t("service.airCalibration.stopConfirmBody")}
                </p>
                <div className="mt-3 px-3 py-1.5 bg-[#E3F2FD] border border-[#BBDEFB] rounded-lg text-[13px] font-bold text-[#1E88E5] inline-block">
                  {t("service.airCalibration.progress", {
                    progress: calibrationProgress.toFixed(2),
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setShowAbortConfirm(false)}
                className="flex-1 h-12 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl text-[15px] hover:bg-slate-50 transition-all active:scale-95 shadow-2xs"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmAbort}
                className="flex-1 h-12 bg-rose-600 text-white font-bold rounded-xl text-[15px] hover:bg-rose-700 transition-all active:scale-95 shadow-md"
              >
                {t("service.airCalibration.action.confirmStop")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


