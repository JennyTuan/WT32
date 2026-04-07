import type { HardwareTestRow, HardwareTestTab } from "../types";

const toneStyles = {
  muted: "text-[#B0C4DE]",
  primary: "text-[#4D94FF]",
  secondary: "text-[#2F54EB]",
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
    <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm p-5 flex flex-col relative overflow-hidden h-full">
      <div className="flex mb-4">
        <div className="flex items-center bg-[#F8FBFF] p-1 rounded-lg border border-[#C9D8EA] shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`w-[108px] h-[36px] text-[13px] font-bold rounded-md transition-all duration-200 ${activeTab === tab ? "bg-[#EAF3FF] text-[#2F7BFF] border border-[#C9DEFF]" : "text-[#3B82F6] hover:bg-white"} ${tab !== tabs[tabs.length - 1] ? "mr-1" : ""}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white border border-[#B0C4DE] rounded-2xl overflow-hidden shadow-sm">
        <div className="h-[48px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center px-6 text-[13px] font-black text-[#90A4AE] tracking-wider">
          <div className="w-1/3 text-left">测试项目</div>
          <div className="w-1/3 text-center">参数调节</div>
          <div className="w-1/3 text-right pr-10">操作控制</div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {rows.map((row, index) => {
            const bordered = index < rows.length - 1;
            const primaryAction = row.actionLabel === "开始";

            return (
              <div
                key={`${row.name}-${index}`}
                className={`flex items-center px-6 py-4 hover:bg-[#FAFCFF] transition-all ${bordered ? "border-b border-[#EEF2F9]" : ""}`}
              >
                <div className="w-1/3">
                  <div className="text-[15px] font-black text-[#263238] leading-6">{row.name}</div>
                  {row.code && <div className="text-[12px] font-bold text-[#90A4AE] mt-0.5">{row.code}</div>}
                </div>

                <div className="w-1/3 flex justify-center items-center gap-6">
                  {row.params?.length ? (
                    row.params.map((param) => (
                      <div key={param.label} className="flex items-center gap-3">
                        <span className={`text-[12px] font-bold ${toneStyles[param.tone ?? "muted"]}`}>{param.label}</span>
                        <div
                          className={`${param.widthClass ?? "w-16"} h-9 bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg flex items-center justify-center font-bold text-[14px] shadow-inner ${toneStyles[param.tone ?? "primary"]}`}
                        >
                          {param.value}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="italic text-[#B0C4DE] font-bold text-[13px]">无需参数</div>
                  )}
                </div>

                <div className="w-1/3 flex justify-end pr-6">
                  <button
                    className={`px-8 h-9 font-black rounded-full transition-all active:scale-95 text-[13px] ${primaryAction ? "bg-[#4D94FF] text-white hover:bg-[#3B82F6] active:bg-[#2563EB] shadow-md" : "bg-white border border-[#B0C4DE] text-[#546E7A] hover:bg-gray-50 shadow-sm"}`}
                  >
                    {row.actionLabel}
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
