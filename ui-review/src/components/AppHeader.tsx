import { useEffect, useState } from "react";
import { Ambulance, Sun } from "lucide-react";

import PatientHeaderCard from "./PatientHeaderCard";
import NetworkStatusButton from "./NetworkStatusButton";
import SystemMenuButton from "./SystemMenuButton";
import iconTable from "../assets/icon-table.svg";
import iconGantry from "../assets/icon-gantry.svg";
import iconTube from "../assets/icon-tube.svg";

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

const formatClock = (date: Date) =>
  date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString("zh-CN", {
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
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    if (clockOverride) return;
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [clockOverride]);

  const timeLabel = clockOverride?.time ?? formatClock(clock);
  const dateLabel = clockOverride?.date ?? formatDateLabel(clock);

  const isLaserInteractive = typeof onLaserToggle === "function";

  return (
    <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
      <div className="flex items-center gap-3">
        <PatientHeaderCard name={patientName ?? null} patientId={patientId ?? null} />
        <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
          <div className="flex items-center gap-1 text-[11px] font-bold">
            <img src={iconTable} alt="机床" className="w-3.5 h-3.5" />
            <span>{tableLabel}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold">
            <img src={iconGantry} alt="机架角度" className="w-3.5 h-3.5" />
            <span>{gantryLabel}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold">
            <img src={iconTube} alt="球管" className="w-3.5 h-3.5" />
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
          aria-label="急诊"
          className="flex flex-col items-center gap-0.5 p-1 bg-transparent border-0 text-[#D32F2F] transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D32F2F]/50 rounded"
        >
          <Ambulance size={26} strokeWidth={1.8} />
          <span className="text-[10px] font-black leading-none tracking-wider">急诊</span>
        </button>
        <NetworkStatusButton />
        {isLaserInteractive ? (
          <button
            type="button"
            aria-label="激光灯"
            aria-pressed={laserActive ?? false}
            onClick={onLaserToggle}
            className={`relative p-1 transition-all ${
              laserActive ? "text-[#F59E0B]" : "text-[#546E7A] hover:opacity-70"
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
