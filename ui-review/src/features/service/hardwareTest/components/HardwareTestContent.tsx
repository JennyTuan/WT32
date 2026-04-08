import type { EditingField, HardwareTestAction, HardwareTestTab } from "../types";

const actionToneClassMap = {
  neutral: "bg-white border border-[#D7E1EC] text-[#43576B] hover:bg-[#F8FAFC]",
  primary: "bg-[#2F67D8] text-white shadow-[0_8px_16px_rgba(47,103,216,0.18)] hover:bg-[#2558C0]",
} as const;

type HardwareTestContentProps = {
  activeTab: HardwareTestTab;
  editingFieldKey: string | null;
  rows: HardwareTestAction[];
  runningActions: Record<string, boolean>;
  tabs: HardwareTestTab[];
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
  return (
    <section className="relative flex flex-1 flex-col overflow-hidden rounded-md border border-[#B0C4DE] bg-white p-5 shadow-sm">
      <div className="mb-5 flex">
        <div className="flex rounded-[18px] border border-[#2B3440] bg-white p-1 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`h-[44px] min-w-[104px] rounded-[14px] px-6 text-[14px] font-black transition-all ${
                activeTab === tab
                  ? "bg-white text-[#2F67D8] shadow-[0_2px_10px_rgba(15,23,42,0.08)]"
                  : "text-[#75879B] hover:text-[#465A70]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-[#2B3440] bg-white">
        <div className="grid grid-cols-[1.2fr_1fr_156px] items-center border-b border-[#2B3440] px-6 py-4 text-[13px] font-black text-[#6F88A6]">
          <div>测试项目</div>
          <div className="text-center">参数调节</div>
          <div className="text-center">操作控制</div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {rows.map((row, index) => {
            const actionKey = buildActionKey(activeTab, row.id);
            const isRunning = Boolean(runningActions[actionKey]);
            const actionLabel =
              row.control === "toggle" ? (isRunning ? row.runningLabel : row.idleLabel) ?? row.idleLabel : row.idleLabel;
            const actionTone = row.buttonTone ?? "primary";

            return (
              <div
                key={row.id}
                className={`grid grid-cols-[1.2fr_1fr_156px] items-center px-6 py-5 ${
                  index < rows.length - 1 ? "border-b border-[#D8E3EE]" : ""
                }`}
              >
                <div className="pr-6">
                  <div className="text-[19px] font-black leading-[1.45] text-[#1F2B3A]">{row.name}</div>
                  {row.code ? <div className="mt-1 text-[12px] font-bold text-[#8EA1B5]">{row.code}</div> : null}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 px-3">
                  {row.params?.length ? (
                    row.params.map((param) => {
                      const fieldKey = `${activeTab}:${row.id}:${param.key}`;
                      const isEditing = editingFieldKey === fieldKey;

                      return (
                        <div key={param.key} className="flex items-center gap-3">
                          <span className="text-[13px] font-bold text-[#8CA0B5]">{param.label}</span>
                          {isEditing ? (
                            <input
                              autoFocus
                              value={param.value}
                              onChange={(event) => onParamChange(activeTab, row.id, param.key, event.target.value)}
                              onBlur={() => onStartEditing(null)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === "Escape") {
                                  onStartEditing(null);
                                }
                              }}
                              className={`${param.widthClass ?? "w-16"} h-10 rounded-2xl border border-[#D8E3EE] bg-white px-3 text-center text-[16px] font-black text-[#2F67D8] outline-none ring-2 ring-[#BFD3FF]`}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                onStartEditing({
                                  tab: activeTab,
                                  rowId: row.id,
                                  paramKey: param.key,
                                })
                              }
                              className={`${param.widthClass ?? "w-16"} h-10 rounded-2xl border border-[#D8E3EE] bg-white px-3 text-center text-[16px] font-black text-[#2F67D8] shadow-[inset_0_1px_1px_rgba(15,23,42,0.03)] transition-colors hover:border-[#B9CDE3]`}
                            >
                              {param.value}
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-[14px] font-bold text-[#B1C0D0]">无需参数</span>
                  )}
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => onActionExecute(row.id)}
                    className={`min-w-[102px] rounded-full px-8 py-3 text-[15px] font-black transition-all active:scale-95 ${actionToneClassMap[actionTone]}`}
                  >
                    {actionLabel}
                  </button>
                </div>
              </div>
          );
        })}
      </div>
    </div>
  </section>
  );
}
