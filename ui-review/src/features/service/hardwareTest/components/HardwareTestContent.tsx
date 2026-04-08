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
  // 是否有任何项目正在运行
  const anyRunning = Object.values(runningActions).some(Boolean);

  return (
    <section className="relative flex flex-1 flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm min-h-0">
      {/* Tab bar */}
      <div className="flex items-end border-b border-[#EEF2F9] px-4 pt-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative px-5 py-2 text-[13px] font-semibold transition-colors ${
              activeTab === tab.id
                ? "text-[#2F7BFF]"
                : "text-[#94A3B8] hover:text-[#64748B]"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-[#2F7BFF]" />
            )}
          </button>
        ))}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[2fr_2fr_140px] border-b border-[#F1F5F9] bg-[#F8FAFC] px-5 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">测试项目</div>
        <div className="text-center text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">参数调节</div>
        <div className="text-center text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">操作控制</div>
      </div>

      {/* Rows */}
      <div key={activeTab} className="flex-1 overflow-y-auto custom-scrollbar">
        {rows.map((row, index) => {
          const actionKey = buildActionKey(activeTab, row.id);
          const isRunning = Boolean(runningActions[actionKey]);
          // 当有其他项目在运行时，本行按钮禁用（自己正在运行的不禁用，可以点停止）
          const isDisabled = anyRunning && !isRunning;
          const actionLabel =
            row.control === "toggle"
              ? (isRunning ? row.runningLabel : row.idleLabel) ?? row.idleLabel
              : row.idleLabel;
          const isPrimary = (row.buttonTone ?? "primary") === "primary";

          return (
            <div
              key={row.id}
              className={`grid grid-cols-[2fr_2fr_140px] items-center px-5 py-3 transition-colors ${
                isDisabled ? "opacity-40" : "hover:bg-[#FAFCFF]"
              } ${index < rows.length - 1 ? "border-b border-[#F1F5F9]" : ""}`}
            >
              {/* Name */}
              <div className="flex items-center gap-2 pr-4">
                <span className="text-[13px] font-semibold text-[#1E293B]">{row.name}</span>
                {row.code && (
                  <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-medium text-[#94A3B8]">
                    {row.code.replace(/[()]/g, "")}
                  </span>
                )}
              </div>

              {/* Params */}
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
                            onChange={(e) => onParamChange(activeTab, row.id, param.key, e.target.value)}
                            onBlur={() => onStartEditing(null)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "Escape") onStartEditing(null);
                            }}
                            className={`${param.widthClass ?? "w-14"} h-7 rounded-md border border-[#93C5FD] bg-white px-2 text-center text-[13px] font-semibold text-[#2F7BFF] outline-none ring-2 ring-[#BFDBFE]`}
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={isDisabled}
                            onClick={() => onStartEditing({ tab: activeTab, rowId: row.id, paramKey: param.key })}
                            className={`${param.widthClass ?? "w-14"} h-7 rounded-md border border-[#CBD5E1] bg-white px-2 text-center text-[13px] font-semibold text-[#2F7BFF] transition-colors ${isDisabled ? "cursor-not-allowed" : "hover:border-[#93C5FD]"}`}
                          >
                            {param.value}
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <span className="text-[12px] italic text-[#CBD5E1]">无需参数</span>
                )}
              </div>

              {/* Action button */}
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onActionExecute(row.id)}
                  className={`h-7 min-w-[80px] rounded-full px-5 text-[12px] font-semibold transition-all ${
                    isDisabled
                      ? "cursor-not-allowed"
                      : isPrimary
                        ? isRunning
                          ? "bg-[#EF4444] text-white shadow-sm hover:bg-[#DC2626] active:scale-95"
                          : "bg-[#2F7BFF] text-white shadow-sm shadow-blue-100 hover:bg-[#1D6AF5] active:scale-95"
                        : "border border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAFC] active:scale-95"
                  }`}
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
