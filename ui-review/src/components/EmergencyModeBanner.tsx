import { Siren } from "lucide-react";

import { useAuth } from "../lib/authContext";
import { useI18n } from "../lib/i18nContext";

export default function EmergencyModeBanner() {
  const { isEmergencySession } = useAuth();
  const { t } = useI18n();

  if (!isEmergencySession) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-2 z-50 -translate-x-1/2"
    >
      <div className="flex items-center gap-2 rounded-full border border-[#F59E0B] bg-[#D97706] px-4 py-1.5 text-[12px] font-bold text-white shadow-lg shadow-orange-900/30">
        <Siren size={14} className="animate-pulse" />
        <span>{t("emergency.modeBadge")}</span>
      </div>
    </div>
  );
}
