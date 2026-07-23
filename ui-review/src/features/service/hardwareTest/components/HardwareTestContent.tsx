import { Activity } from "lucide-react";

import { useI18n } from "../../../../lib/i18nContext";
import type { EditingField, HardwareTestAction, HardwareTestTab, HardwareTestTabOption } from "../types";

type HardwareTestContentProps = {
  activeTab: HardwareTestTab;
  editingFieldKey: string | null;
  rows: HardwareTestAction[];
  runningActions: Record<string, boolean>;
  tabs: HardwareTestTabOption[];
  onActionExecute: (rowId: string) => void;
  onParamChange: (tab: HardwareTestTab, rowId: string, paramKey: string, nextValue: string) => void;
  onStartEditing: (field: EditingField | null) => void;
  onTabChange: (tab: HardwareTestTab) => void;
};

const buildActionKey = (tab: HardwareTestTab, rowId: string) => `${tab}:${rowId}`;

export function HardwareTestContent({
  activeTab,
  editingFieldKey,
  rows,
  runningActions,
  tabs,
  onActionExecute,
  onParamChange,
  onStartEditing,
  onTabChange,
}: HardwareTestContentProps) {
  const { t } = useI18n();
  const activeRunningKey = Object.entries(runningActions).find(([, running]) => running)?.[0] ?? null;
  const runningCount = Object.values(runningActions).filter(Boolean).length;
  const runningSummary = t("service.hardwareTest.runningSummary", { count: runningCount }).replace(/^[,，]\s*/, "");

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-4 pb-3">
        {/* 与服务页内的筛选控件一致：模块切换不再单独占用标题栏。 */}
        <div className="inline-flex items-center rounded-lg bg-[#F1F5F9] p-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-pressed={isActive}
                className={`rounded-md px-5 py-2 text-[13px] font-semibold transition-all ${
                  isActive
                    ? "bg-white text-[#1E88E5] shadow-sm"
                    : "text-[#64748B] hover:bg-white/70 hover:text-[#334155]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {runningCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-[#E3F2FD] px-3 py-1 text-[11px] font-semibold text-[#1E88E5]">
            <Activity size={12} className="animate-pulse" />
            {runningSummary}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[2fr_2fr_140px] rounded-t-lg bg-[#F6F8FC] px-4 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">
          {t("service.hardwareTest.column.testItem")}
        </div>
        <div className="text-center text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">
          {t("service.hardwareTest.column.params")}
        </div>
        <div className="text-center text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">
          {t("service.hardwareTest.column.control")}
        </div>
      </div>

      <div key={activeTab} className="flex-1 overflow-y-auto custom-scrollbar">
        {rows.map((row, index) => {
          const actionKey = buildActionKey(activeTab, row.id);
          const isRunning = Boolean(runningActions[actionKey]);
          const isDisabled = activeRunningKey !== null && activeRunningKey !== actionKey;
          const actionLabel = isRunning
            ? (row.runningLabel ?? t("service.hardwareTest.button.stop"))
            : row.idleLabel;
          const isPrimary = (row.buttonTone ?? "primary") === "primary";

          return (
            <div
              key={row.id}
              className={`grid grid-cols-[2fr_2fr_140px] items-center px-4 py-3 transition-colors ${
                isDisabled
                  ? "bg-[#FAFBFD] opacity-40"
                  : isRunning
                    ? "bg-[#F0F7FF]"
                    : index % 2 === 0
                      ? "bg-white hover:bg-[#FAFCFF]"
                      : "bg-[#FBFCFE] hover:bg-[#F6FAFF]"
              }`}
              style={isRunning ? { boxShadow: "inset 3px 0 0 #4D94FF" } : undefined}
            >
              <div className="flex items-center gap-2 pr-4">
                {isRunning && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4D94FF]" />}
                <span className="text-[13px] font-semibold text-[#1E293B]">{row.name}</span>
                {row.code ? (
                  <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-medium text-[#94A3B8]">
                    {row.code.replace(/[()]/g, "")}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2">
                {row.params?.length ? (
                  row.params.map((param) => {
                    const fieldKey = `${activeTab}:${row.id}:${param.key}`;
                    const isEditing = editingFieldKey === fieldKey;

                    return (
                      <div key={param.key} className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-[#94A3B8]">{param.label}</span>
                        {isEditing ? (
                          <input
                            autoFocus
                            value={param.value}
                            onChange={(event) => onParamChange(activeTab, row.id, param.key, event.target.value)}
                            onBlur={() => onStartEditing(null)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === "Escape") onStartEditing(null);
                            }}
                            className={`${param.widthClass ?? "w-14"} h-7 rounded-md border border-[#93C5FD] bg-white px-2 text-center text-[13px] font-semibold text-[#4D94FF] outline-none ring-2 ring-[#BFDBFE]`}
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={isDisabled}
                            onClick={() => onStartEditing({ tab: activeTab, rowId: row.id, paramKey: param.key })}
                            className={`${param.widthClass ?? "w-14"} h-7 rounded-md border border-[#CBD5E1] bg-white px-2 text-center text-[13px] font-semibold text-[#4D94FF] transition-colors ${
                              isDisabled ? "cursor-not-allowed" : "hover:border-[#93C5FD] hover:bg-[#F0F7FF]"
                            }`}
                          >
                            {param.value}
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <span className="text-[12px] italic text-[#CBD5E1]">{t("service.hardwareTest.noParams")}</span>
                )}
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onActionExecute(row.id)}
                  className={`h-7 min-w-[80px] rounded-full px-5 text-[12px] font-semibold transition-all ${
                    isDisabled
                      ? "cursor-not-allowed border border-[#E2E8F0] bg-[#F8FAFC] text-[#A8B4C2]"
                      : isRunning
                        ? "bg-[#EF4444] text-white shadow-sm hover:bg-[#DC2626] active:scale-95"
                        : isPrimary
                          ? "text-white shadow-sm active:scale-95"
                          : "border border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAFC] active:scale-95"
                  }`}
                  style={
                    !isDisabled && !isRunning && isPrimary
                      ? { background: "linear-gradient(135deg, #4D94FF 0%, #1E88E5 100%)", boxShadow: "0 2px 8px rgba(77,148,255,0.3)" }
                      : undefined
                  }
                >
                  {actionLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
