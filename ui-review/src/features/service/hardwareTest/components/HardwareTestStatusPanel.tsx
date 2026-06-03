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
    <section className="mt-3 shrink-0 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EEF2F9] bg-[#F8FAFC] px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${runningCount > 0 ? "bg-[#2F7BFF]" : "bg-[#4ADE80]"}`}
          />
          <span className="text-[12px] font-semibold text-[#475569]">{t("service.hardwareTest.logTitle")}</span>
          <span className="text-[11px] text-[#94A3B8]">
            {t("service.hardwareTest.recentLogs", { count: logs.length })}
            {runningCount > 0
              ? t("service.hardwareTest.runningSummary", { count: runningCount })
              : t("service.hardwareTest.idleSummary")}
          </span>
        </div>
        <button
          type="button"
          onClick={onClearLogs}
          className="rounded px-2 py-0.5 text-[11px] font-medium text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#475569]"
        >
          {t("service.hardwareTest.clearLogs")}
        </button>
      </div>

      <div className="grid grid-cols-[96px_72px_1fr_1.2fr_120px] border-b border-[#F1F5F9] px-5 py-1.5">
        {columns.map((col) => (
          <div key={col} className="text-[10px] font-semibold uppercase tracking-widest text-[#CBD5E1]">
            {col}
          </div>
        ))}
      </div>

      <div className="max-h-[130px] overflow-y-auto custom-scrollbar">
        {logs.length === 0 ? (
          <div className="px-5 py-4 text-[12px] italic text-[#CBD5E1]">{t("service.hardwareTest.emptyLogs")}</div>
        ) : (
          logs.map((log, index) => (
            <div
              key={log.id}
              className={`grid grid-cols-[96px_72px_1fr_1.2fr_120px] items-center px-5 py-2 transition-colors hover:bg-[#FAFCFF] ${
                index < logs.length - 1 ? "border-b border-[#F8FAFC]" : ""
              }`}
            >
              <div className="font-mono text-[11px] text-[#94A3B8]">{log.time}</div>
              <div className="text-[12px] font-semibold text-[#475569]">{log.module}</div>
              <div className="text-[12px] text-[#475569]">{log.actionName}</div>
              <div className="truncate text-[12px] text-[#94A3B8]" title={log.paramsSnapshot}>
                {log.paramsSnapshot}
              </div>
              <div className="text-[12px] font-semibold text-[#2F7BFF]">{log.result}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
