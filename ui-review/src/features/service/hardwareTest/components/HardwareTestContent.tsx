import type { HardwareTestRow, HardwareTestTab } from "../types";

const paramToneStyles = {
  muted: "text-[#94A3B8]",
  primary: "text-[#2F7BFF]",
  secondary: "text-[#6366F1]",
} as const;

const paramBorderStyles = {
  muted: "border-[#CBD5E1]",
  primary: "border-[#93C5FD]",
  secondary: "border-[#A5B4FC]",
} as const;

type HardwareTestContentProps = {
  activeTab: HardwareTestTab;
  rows: HardwareTestRow[];
  tabs: HardwareTestTab[];
  onTabChange: (tab: HardwareTestTab) => void;
};

export function HardwareTestContent({
  activeTab,
  rows,
  tabs,
  onTabChange,
}: HardwareTestContentProps) {
  return (
    <div className="flex-1 min-h-0 bg-white border border-[#E2E8F0] rounded-xl shadow-sm flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-0 px-4 pt-3 pb-0 border-b border-[#EEF2F9]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-5 py-2 text-[13px] font-semibold rounded-t-md transition-all relative -mb-px ${
              activeTab === tab
                ? "text-[#2F7BFF] border border-b-white border-[#E2E8F0] bg-white z-10"
                : "text-[#94A3B8] hover:text-[#64748B] border border-transparent"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2F7BFF] rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[2fr_2fr_1fr] px-5 py-2 bg-[#F8FAFC] border-b border-[#EEF2F9]">
        <div className="text-[11px] font-semibold text-[#94A3B8] tracking-widest uppercase">测试项目</div>
        <div className="text-[11px] font-semibold text-[#94A3B8] tracking-widest uppercase text-center">参数调节</div>
        <div className="text-[11px] font-semibold text-[#94A3B8] tracking-widest uppercase text-right">操作</div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {rows.map((row, index) => {
          const isLast = index === rows.length - 1;
          const isPrimary = row.actionLabel === "开始";

          return (
            <div
              key={`${row.name}-${index}`}
              className={`grid grid-cols-[2fr_2fr_1fr] items-center px-5 py-3 hover:bg-[#FAFCFF] transition-colors ${!isLast ? "border-b border-[#F1F5F9]" : ""}`}
            >
              {/* Name */}
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[#1E293B]">{row.name}</span>
                {row.code && (
                  <span className="text-[10px] font-medium text-[#94A3B8] bg-[#F1F5F9] px-1.5 py-0.5 rounded">
                    {row.code}
                  </span>
                )}
              </div>

              {/* Params */}
              <div className="flex justify-center items-center gap-4">
                {row.params?.length ? (
                  row.params.map((param) => (
                    <div key={param.label} className="flex items-center gap-2">
                      <span className={`text-[11px] font-medium ${paramToneStyles[param.tone ?? "muted"]}`}>
                        {param.label}
                      </span>
                      <div
                        className={`${param.widthClass ?? "w-14"} h-7 bg-white border rounded-md flex items-center justify-center text-[13px] font-semibold ${paramToneStyles[param.tone ?? "primary"]} ${paramBorderStyles[param.tone ?? "muted"]}`}
                      >
                        {param.value}
                      </div>
                    </div>
                  ))
                ) : (
                  <span className="text-[12px] text-[#CBD5E1] italic">无需参数</span>
                )}
              </div>

              {/* Action */}
              <div className="flex justify-end">
                <button
                  className={`h-7 px-5 text-[12px] font-semibold rounded-full transition-all active:scale-95 ${
                    isPrimary
                      ? "bg-[#2F7BFF] text-white hover:bg-[#1D6AF5] shadow-sm shadow-blue-200"
                      : "bg-white border border-[#CBD5E1] text-[#475569] hover:bg-[#F8FAFC]"
                  }`}
                >
                  {row.actionLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
