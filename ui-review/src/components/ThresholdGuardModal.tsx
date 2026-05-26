import { AlertTriangle, ShieldAlert } from "lucide-react";

import type { ThresholdAction } from "../lib/doseSettingsApi";
import type { ThresholdMatch } from "../lib/doseThreshold";

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
  if (!open || !match.drl) return null;

  const isRequireConfirm = action === "require_confirm";

  const accent = isRequireConfirm
    ? {
        ring: "border-[#C62828]",
        bg: "bg-[#FFEBEE]",
        text: "text-[#C62828]",
        button: "bg-[#C62828] hover:bg-[#B71C1C]",
        title: "扫描剂量将超过参考阈值，请确认风险",
        Icon: ShieldAlert,
        continueLabel: "确认风险并继续",
      }
    : {
        ring: "border-[#F9A825]",
        bg: "bg-[#FFF8E1]",
        text: "text-[#E65100]",
        button: "bg-[#F9A825] hover:bg-[#F57F17]",
        title: "扫描剂量将达到或超过参考阈值",
        Icon: AlertTriangle,
        continueLabel: "知悉风险并继续",
      };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <div
        className={`w-[440px] rounded-xl border-2 ${accent.ring} bg-white shadow-2xl`}
      >
        <div className={`flex items-center gap-3 ${accent.bg} px-5 py-4 rounded-t-[10px]`}>
          <accent.Icon size={22} className={accent.text} />
          <div className={`font-black text-[15px] ${accent.text}`}>{accent.title}</div>
        </div>
        <div className="px-5 py-4 text-[13px] text-[#37474F] space-y-3">
          <div>
            匹配阈值：
            <span className="font-bold">
              {match.drl.body_part} / {ageGroupLabel(match.drl.age_group)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-[#E2EBF5] rounded-lg p-3">
              <div className="text-[11px] text-[#90A4AE] mb-1">CTDIvol (mGy)</div>
              <div className="font-mono text-[15px] flex items-baseline gap-2">
                <span className={match.ctdiExceeded ? "text-[#C62828] font-bold" : ""}>
                  {fmt(ctdiVol)}
                </span>
                <span className="text-[11px] text-[#90A4AE]">/ 阈值 {fmt(match.drl.ctdi_ref)}</span>
              </div>
            </div>
            <div className="border border-[#E2EBF5] rounded-lg p-3">
              <div className="text-[11px] text-[#90A4AE] mb-1">DLP (mGy·cm)</div>
              <div className="font-mono text-[15px] flex items-baseline gap-2">
                <span className={match.dlpExceeded ? "text-[#C62828] font-bold" : ""}>
                  {fmt(dlp)}
                </span>
                <span className="text-[11px] text-[#90A4AE]">/ 阈值 {fmt(match.drl.dlp_ref)}</span>
              </div>
            </div>
          </div>
          {isRequireConfirm && (
            <div className="text-[12px] text-[#C62828] leading-relaxed">
              系统已配置为「强制二次确认」。请确认本次扫描确有必要后再继续。
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[#E2EBF5] flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 h-9 border border-[#D6E2EF] rounded-lg text-[13px] font-bold text-[#37474F] hover:bg-[#F5F8FC]"
          >
            返回参数调整
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

const ageGroupLabel = (a: string): string => {
  if (a === "adult") return "成人";
  if (a === "pediatric" || a === "child") return "儿童";
  if (a === "infant") return "婴幼儿";
  return a;
};
