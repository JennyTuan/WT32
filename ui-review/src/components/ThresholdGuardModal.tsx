import { AlertTriangle, ShieldAlert } from "lucide-react";

import type { ThresholdAction } from "../lib/doseSettingsApi";
import type { ThresholdMatch } from "../lib/doseThreshold";
import { useI18n } from "../lib/i18nContext";
import type { TranslationKey } from "../lib/i18n";

type Props = {
  open: boolean;
  action: ThresholdAction;
  match: ThresholdMatch;
  ctdiVol: number | null | undefined;
  dlp: number | null | undefined;
  onContinue: () => void;
  onCancel: () => void;
};

const fmt = (v: number | null | undefined, digits = 2): string =>
  v == null ? "—" : v.toFixed(digits);

export default function ThresholdGuardModal({
  open,
  action,
  match,
  ctdiVol,
  dlp,
  onContinue,
  onCancel,
}: Props) {
  const { t } = useI18n();
  if (!open || !match.drl) return null;

  const isRequireConfirm = action === "require_confirm";

  const accent = isRequireConfirm
    ? {
        ring: "border-[#C62828]",
        bg: "bg-[#FFEBEE]",
        text: "text-[#C62828]",
        button: "bg-[#C62828] hover:bg-[#B71C1C]",
        title: t("scanFlow.thresholdGuard.titleRequire"),
        Icon: ShieldAlert,
        continueLabel: t("scanFlow.thresholdGuard.continueRequire"),
      }
    : {
        ring: "border-[#F9A825]",
        bg: "bg-[#FFF8E1]",
        text: "text-[#E65100]",
        button: "bg-[#F9A825] hover:bg-[#F57F17]",
        title: t("scanFlow.thresholdGuard.titleWarn"),
        Icon: AlertTriangle,
        continueLabel: t("scanFlow.thresholdGuard.continueWarn"),
      };

  const ageGroupKey = (a: string): TranslationKey | null => {
    if (a === "adult") return "service.doseSettings.age.adult";
    if (a === "pediatric" || a === "child") return "service.doseSettings.age.pediatric";
    if (a === "infant") return "service.doseSettings.age.infant";
    return null;
  };
  const ageKey = ageGroupKey(match.drl.age_group);
  const ageLabel = ageKey ? t(ageKey) : match.drl.age_group;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
      <div
        className={`w-[440px] rounded-xl border-2 ${accent.ring} bg-white shadow-2xl`}
      >
        <div className={`flex items-center gap-3 ${accent.bg} px-5 py-4 rounded-t-[10px]`}>
          <accent.Icon size={22} className={accent.text} />
          <div className={`font-black text-[15px] ${accent.text}`}>{accent.title}</div>
        </div>
        <div className="px-5 py-4 text-[13px] text-[#37474F] space-y-3">
          <div>
            {t("scanFlow.thresholdGuard.matchLabel")}
            <span className="font-bold">
              {match.drl.body_part} / {ageLabel}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-[#E2EBF5] rounded-lg p-3">
              <div className="text-[11px] text-[#90A4AE] mb-1">CTDIvol (mGy)</div>
              <div className="font-mono text-[15px] flex items-baseline gap-2">
                <span className={match.ctdiExceeded ? "text-[#C62828] font-bold" : ""}>
                  {fmt(ctdiVol)}
                </span>
                <span className="text-[11px] text-[#90A4AE]">{t("scanFlow.thresholdGuard.refValue", { value: fmt(match.drl.ctdi_ref) })}</span>
              </div>
            </div>
            <div className="border border-[#E2EBF5] rounded-lg p-3">
              <div className="text-[11px] text-[#90A4AE] mb-1">DLP (mGy·cm)</div>
              <div className="font-mono text-[15px] flex items-baseline gap-2">
                <span className={match.dlpExceeded ? "text-[#C62828] font-bold" : ""}>
                  {fmt(dlp)}
                </span>
                <span className="text-[11px] text-[#90A4AE]">{t("scanFlow.thresholdGuard.refValue", { value: fmt(match.drl.dlp_ref) })}</span>
              </div>
            </div>
          </div>
          {isRequireConfirm && (
            <div className="text-[12px] text-[#C62828] leading-relaxed">
              {t("scanFlow.thresholdGuard.confirmExplain")}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[#E2EBF5] flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 h-9 border border-[#D6E2EF] rounded-lg text-[13px] font-bold text-[#37474F] hover:bg-[#F5F8FC]"
          >
            {t("scanFlow.thresholdGuard.back")}
          </button>
          <button
            onClick={onContinue}
            className={`px-4 h-9 rounded-lg text-[13px] font-bold text-white ${accent.button}`}
          >
            {accent.continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
