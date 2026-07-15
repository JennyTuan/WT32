import { AlertTriangle, Square, X } from "lucide-react";

import PhysicalControlPanelSvg from "../../../../components/PhysicalControlPanelSvg";
import { PhysicalButtonStatusDot } from "../../../../components/SimulatedPhysicalButton";
import { useI18n } from "../../../../lib/i18nContext";
import type { WarmupPhase, WarmupStatus } from "../types";

type WarmupOverlaysProps = {
  activePhase: WarmupPhase;
  confirmAbort: () => void;
  currentHeat: number;
  dismissPhysicalTrigger: () => void;
  handleAbort: () => void;
  handlePhysicalTrigger: () => void;
  setShowAbortConfirm: (value: boolean) => void;
  showAbortConfirm: boolean;
  showPhysicalTrigger: boolean;
  status: WarmupStatus;
  targetHeat: number;
  warmupProgress: number;
};

export function WarmupOverlays({
  activePhase,
  confirmAbort,
  currentHeat,
  dismissPhysicalTrigger,
  handleAbort,
  handlePhysicalTrigger,
  setShowAbortConfirm,
  showAbortConfirm,
  showPhysicalTrigger,
  status,
  targetHeat,
  warmupProgress,
}: WarmupOverlaysProps) {
  const { t } = useI18n();

  return (
    <>
      {showPhysicalTrigger && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="warmup-physical-trigger-title"
            className="relative flex w-[560px] flex-col rounded-[28px] border border-white bg-white px-10 pb-9 pt-8 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.28)] animate-in zoom-in-95 duration-200"
          >
            <button
              type="button"
              onClick={dismissPhysicalTrigger}
              aria-label={t("service.tubeWarmup.closePhysicalGuide")}
              className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={20} />
            </button>

            <div className="pr-12">
              <div id="warmup-physical-trigger-title" className="text-[22px] font-black text-[#1E293B]">
                {t("service.tubeWarmup.physicalGuideTitle")}
              </div>
              <div className="mt-2 text-[14px] font-bold leading-relaxed text-[#52657A]">
                {t("service.tubeWarmup.physicalGuideDescription")}
              </div>
            </div>

            <div className="mt-7 flex items-center justify-center gap-8 rounded-2xl border border-[#D6E0EA] bg-slate-50 px-8 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <PhysicalControlPanelSvg
                className="w-[62px] shrink-0"
                lampOn
                onPressStart={handlePhysicalTrigger}
                panelLabel={t("service.tubeWarmup.physicalGuideTitle")}
                triggerLabel={t("service.tubeWarmup.exposureButton")}
              />
              <div className="min-w-0">
                <div className="mb-4 flex items-center gap-2">
                  <PhysicalButtonStatusDot />
                  <span className="text-[11px] font-black tracking-[0.12em] text-slate-500">
                    {t("service.tubeWarmup.physicalGuideWaiting")}
                  </span>
                </div>
                <div className="text-[16px] font-black text-[#0F5130]">
                  {t("service.tubeWarmup.exposureButton")}
                </div>
                <div className="mt-2 max-w-[220px] text-[11px] font-semibold leading-relaxed text-slate-400">
                  {t("service.tubeWarmup.simulationOnly")}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {status === "warming" && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center animate-in fade-in duration-300">
          <div className="bg-white w-[660px] rounded-3xl shadow-2xl p-10 flex flex-col justify-center animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-baseline mb-8">
              <div>
                <h2 className="text-[32px] font-black text-[#37474F]">{t("service.tubeWarmup.overlayTitle")}</h2>
                <p className="text-[14px] text-[#78909C] font-medium mt-2">{activePhase.description}</p>
              </div>
              <span className="text-[72px] font-black text-[#4D94FF] italic">{Math.floor(warmupProgress)}%</span>
            </div>

            <div className="w-full h-4 bg-[#F0F4F9] rounded-full overflow-hidden mb-8 shadow-inner">
              <div className="h-full bg-[#4D94FF] rounded-full transition-all duration-300" style={{ width: `${warmupProgress}%` }} />
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="rounded-2xl bg-[#F8FAFC] border border-[#D8E2EE] p-4">
                <div className="text-[12px] font-black text-[#90A4AE] uppercase tracking-[0.1em]">{t("service.tubeWarmup.currentHeatShort")}</div>
                <div className="mt-2 text-[28px] font-black text-[#37474F] font-mono">{currentHeat.toFixed(2)}%</div>
              </div>
              <div className="rounded-2xl bg-[#F8FAFC] border border-[#D8E2EE] p-4">
                <div className="text-[12px] font-black text-[#90A4AE] uppercase tracking-[0.1em]">{t("service.tubeWarmup.targetValue")}</div>
                <div className="mt-2 text-[28px] font-black text-[#37474F] font-mono">{targetHeat}%</div>
              </div>
              <div className="rounded-2xl bg-[#F8FAFC] border border-[#D8E2EE] p-4">
                <div className="text-[12px] font-black text-[#90A4AE] uppercase tracking-[0.1em]">{t("service.tubeWarmup.currentPhase")}</div>
                <div className="mt-2 text-[22px] font-black text-[#1E88E5]">{activePhase.title}</div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-[18px] text-[#90A4AE] font-bold">{t("service.tubeWarmup.liveProgress")}</span>
                <div className="px-4 py-1.5 bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg text-[18px] font-bold text-[#37474F] shadow-sm">
                  {warmupProgress.toFixed(2)}%
                </div>
              </div>
              <button
                onClick={handleAbort}
                className="flex items-center gap-2 px-6 h-12 bg-[#FFF1F0] border border-[#FFA39E] text-[#CF1322] font-black rounded-xl shadow-sm hover:bg-[#FFCCC7] transition-all active:scale-95"
              >
                <Square size={16} fill="currentColor" />
                <span className="text-[16px]">{t("service.tubeWarmup.abort")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showAbortConfirm && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] z-[60] flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white w-[560px] rounded-[32px] shadow-2xl border border-white p-12 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-6 mb-8 text-[24px]">
              <div className="w-14 h-14 rounded-full bg-[#FFF3E0] flex items-center justify-center shrink-0">
                <AlertTriangle size={32} className="text-[#FF9800]" />
              </div>
              <div>
                <h3 className="font-black text-[#37474F] mb-3">{t("service.tubeWarmup.abortConfirmTitle")}</h3>
                <p className="text-[16px] text-[#546E7A] font-bold leading-relaxed">
                  {t("service.tubeWarmup.abortConfirmBody")}
                </p>
                <p className="text-[16px] text-[#4D94FF] font-black mt-2">
                  {t("service.tubeWarmup.abortHeatLine", { current: currentHeat.toFixed(2), target: targetHeat })}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowAbortConfirm(false)}
                className="flex-1 h-14 bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-black rounded-2xl text-[18px] hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
              >
                {t("service.tubeWarmup.continueWarmup")}
              </button>
              <button
                onClick={confirmAbort}
                className="flex-1 h-14 bg-[#4D94FF] text-white font-black rounded-2xl text-[18px] hover:bg-blue-600 transition-all active:scale-95 shadow-lg"
              >
                {t("service.tubeWarmup.confirmAbort")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
