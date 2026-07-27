import { useEffect, useState } from "react";
import { Ambulance, Sun } from "lucide-react";

import PatientHeaderCard from "./PatientHeaderCard";
import NetworkStatusButton from "./NetworkStatusButton";
import SystemMenuButton from "./SystemMenuButton";
import iconTable from "../assets/icon-table.svg";
import iconGantry from "../assets/icon-gantry.svg";
import iconTube from "../assets/icon-tube.svg";
import { useI18n } from "../lib/i18nContext";

type AppHeaderProps = {
  /** Patient name; null/undefined → 显示 "未选择患者" */
  patientName?: string | null;
  /** Patient ID; null/undefined → 显示 "ID: --" */
  patientId?: string | null;

  /** 顶部参数条 — 机床位置（默认 "0"，含单位写在 label 里） */
  tableLabel?: string;
  /** 机架角度（默认 "0"） */
  gantryLabel?: string;
  /** 球管热容量（默认 "0%"） */
  heatLabel?: string;

  /** 提供时激光灯按钮可点击切换；不提供时为静态显示 */
  laserActive?: boolean;
  onLaserToggle?: () => void;

  /** SystemMenuButton 的徽标数字；默认 10 */
  badgeCount?: number;

  /** 急诊按钮点击事件；具体急诊流程由调用方实现 */
  onEmergencyClick?: () => void;

  /** 覆盖时钟显示（用于静态/演示截图）；不提供时使用实时时钟 */
  clockOverride?: { time: string; date: string };
};

const formatClock = (date: Date, locale: string) =>
  date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const formatDateLabel = (date: Date, locale: string) =>
  date.toLocaleDateString(locale, {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });

export default function AppHeader({
  patientName,
  patientId,
  tableLabel = "0",
  gantryLabel = "0",
  heatLabel = "0%",
  laserActive,
  onLaserToggle,
  badgeCount = 10,
  onEmergencyClick,
  clockOverride,
}: AppHeaderProps) {
  const { locale, t } = useI18n();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    if (clockOverride) return;
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [clockOverride]);

  const timeLabel = clockOverride?.time ?? formatClock(clock, locale);
  const dateLabel = clockOverride?.date ?? formatDateLabel(clock, locale);

  const isLaserInteractive = typeof onLaserToggle === "function";

  return (
    <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
      <div className="flex items-center gap-3">
        <PatientHeaderCard name={patientName ?? null} patientId={patientId ?? null} />
        <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
          <div className="flex items-center gap-1 text-[11px] font-bold">
            <img src={iconTable} alt={t("appHeader.table")} className="w-3.5 h-3.5" />
            <span>{tableLabel}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold">
            <img src={iconGantry} alt={t("appHeader.gantry")} className="w-3.5 h-3.5" />
            <span>{gantryLabel}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold">
            <img src={iconTube} alt={t("appHeader.tube")} className="w-3.5 h-3.5" />
            <span>{heatLabel}</span>
          </div>
        </div>
      </div>

      <div className="text-center">
        <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">{timeLabel}</div>
        <div className="text-[12px] text-[#546E7A] font-medium mt-1">{dateLabel}</div>
      </div>

      <div className="flex items-center gap-5 pr-2">
        <button
          type="button"
          onClick={onEmergencyClick}
          aria-label={t("appHeader.emergency")}
          className="flex flex-col items-center gap-0.5 p-1 bg-transparent border-0 text-[#D32F2F] transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D32F2F]/50 rounded"
        >
          <Ambulance size={26} strokeWidth={1.8} />
          <span className="text-[10px] font-black leading-none tracking-wider">{t("appHeader.emergency")}</span>
        </button>
        <NetworkStatusButton />
        {isLaserInteractive ? (
          <button
            type="button"
            aria-label={t("appHeader.laser")}
            aria-pressed={laserActive ?? false}
            onClick={onLaserToggle}
            className={`relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent !bg-transparent p-0 transition-all hover:border-[#B0C4DE]/60 hover:!bg-[#DCE6F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D94FF]/50 ${
              laserActive ? "!bg-[#FFF3D6] text-[#D97706] hover:!bg-[#FFE7B0]" : "text-[#546E7A]"
            }`}
          >
            <Sun size={24} />
          </button>
        ) : (
          <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
            <Sun size={24} />
          </div>
        )}
        <SystemMenuButton iconSize={24} badgeCount={badgeCount} />
      </div>
    </header>
  );
}
