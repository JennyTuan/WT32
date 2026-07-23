import { FileText } from "lucide-react";
import type { HardwareTestLog } from "../types";
import { useI18n } from "../../../../lib/i18nContext";

type HardwareTestStatusPanelProps = {
  logs: HardwareTestLog[];
  onClearLogs: () => void;
  runningCount: number;
};

export function HardwareTestStatusPanel({ logs, onClearLogs, runningCount }: HardwareTestStatusPanelProps) {
  const { t } = useI18n();
  const columns = [
    t("service.hardwareTest.logColumn.time"),
    t("service.hardwareTest.logColumn.module"),
    t("service.hardwareTest.logColumn.action"),
    t("service.hardwareTest.logColumn.params"),
    t("service.hardwareTest.logColumn.result"),
  ];

  return (
    <section className="mt-4 flex h-[184px] shrink-0 flex-col overflow-hidden rounded-lg bg-[#172334] px-3 pt-3">
      {/* Panel Header */}
      <div className="flex shrink-0 items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#274766]">
            <FileText size={12} style={{ color: "#8BC5FF" }} />
          </div>
          <span className="text-[12px] font-bold text-[#E2E8F0]">
            {t("service.hardwareTest.logTitle")}
          </span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              runningCount > 0 ? "animate-pulse bg-[#4D94FF]" : "bg-[#4ADE80]"
            }`}
          />
          <span className="text-[11px] text-[#9FB3C8]">
            {t("service.hardwareTest.recentLogs", { count: logs.length })}
            {runningCount > 0
              ? t("service.hardwareTest.runningSummary", { count: runningCount })
              : t("service.hardwareTest.idleSummary")}
          </span>
        </div>
        <button
          type="button"
          onClick={onClearLogs}
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[#9FB3C8] transition-colors hover:bg-white/10 hover:text-white"
        >
          {t("service.hardwareTest.clearLogs")}
        </button>
      </div>

      {/* Column Headers */}
      <div className="grid shrink-0 grid-cols-[96px_72px_1fr_1.2fr_120px] rounded-t-md bg-[#213248] px-4 py-1.5">
        {columns.map((col) => (
          <div key={col} className="text-[10px] font-semibold uppercase tracking-widest text-[#9FB3C8]">
            {col}
          </div>
        ))}
      </div>

      {/* Log Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {logs.length === 0 ? (
          <div className="px-4 py-4 text-[12px] italic text-[#9FB3C8]">
            {t("service.hardwareTest.emptyLogs")}
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={log.id}
              className={`grid grid-cols-[96px_72px_1fr_1.2fr_120px] items-center px-4 py-2 transition-colors hover:bg-white/10 ${
                index % 2 === 0 ? "bg-[#172334]" : "bg-[#1B2A3E]"
              }`}
            >
              <div className="font-mono text-[11px] text-[#9FB3C8]">{log.time}</div>
              <div className="text-[12px] font-semibold text-[#E2E8F0]">{log.module}</div>
              <div className="text-[12px] text-[#D4DEE9]">{log.actionName}</div>
              <div className="truncate text-[12px] text-[#9FB3C8]" title={log.paramsSnapshot}>
                {log.paramsSnapshot}
              </div>
              <div className="text-[12px] font-semibold" style={{ color: "#8BC5FF" }}>
                {log.result}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
