import type { ReactNode } from "react";
import { useState } from "react";
import { BatteryCharging, BatteryWarning, ChevronDown, RotateCcw, Save } from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";

const MetricCard = ({
  title,
  value,
  unit,
  extra,
  sub,
}: {
  title: string;
  value: string | number;
  unit: string;
  extra?: ReactNode;
  sub?: string;
}) => (
  <div className="bg-white border border-[#B0C4DE]/40 rounded-2xl p-3.5 flex flex-col shadow-sm hover:shadow-md transition-all">
    <div className="flex justify-between items-start mb-1.5">
      <span className="text-[11px] font-bold text-[#90A4AE] tracking-wide">{title}</span>
      <span className="text-[11px] font-bold text-[#B0C4DE]">{unit}</span>
    </div>
    <div className="flex items-baseline gap-1 mb-1">
      <span className="text-[24px] font-black text-[#263238] leading-none">{value}</span>
    </div>
    {extra}
    {sub && (
      <div className="mt-auto pt-3 border-t border-[#EEF2F9]">
        <div className="px-3 py-1 bg-[#EEF2F9] rounded text-[11px] font-bold text-[#4D94FF] w-fit">
          {sub}
        </div>
      </div>
    )}
  </div>
);

export default function BatteryManagementScreen() {
  const [activeTab, setActiveTab] = useState("高压电池");
  const [config, setConfig] = useState({
    voltage: "480",
    soc: "20",
  });

  const tabs = ["高压电池", "低压电池"];

  return (
    <ServiceModeShell currentRoute="/service/battery">
      <section className="flex-1 overflow-y-auto custom-scrollbar flex flex-col h-full">
        <div className="bg-white border border-[#B0C4DE] rounded-md shadow-sm p-5 flex flex-col flex-1">
          {/* Tab + 标题 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex bg-[#EEF2F9] p-1 rounded-md border border-[#B0C4DE]/50 overflow-hidden shadow-sm w-fit">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-10 h-[32px] text-[13px] font-bold rounded-md transition-all duration-200 ${activeTab === tab ? "bg-[#4D94FF] text-white shadow-sm" : "text-[#4D94FF] hover:bg-white/50"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <span className="text-[12px] font-bold text-[#90A4AE]">实时数据 (示例)</span>
          </div>

          {/* 电池状态 */}
          {activeTab === "高压电池" ? (
            <div className="bg-[#F6FFED] border border-[#B7EB8F] rounded-xl px-5 py-2.5 mb-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#52C41A] rounded-lg flex items-center justify-center text-white shadow-md">
                  <BatteryCharging size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[15px] font-black text-[#135200]">充电中</span>
                  <span className="text-[11px] font-bold text-[#52C41A]/70">状态由电流方向判断</span>
                </div>
              </div>
              <div className="text-[26px] font-black text-[#135200]">
                -1.0 <span className="text-[13px] font-bold ml-1">A</span>
              </div>
            </div>
          ) : (
            <div className="bg-[#FFF7E6] border border-[#FFD591] rounded-xl px-5 py-2.5 mb-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#FA8C16] rounded-lg flex items-center justify-center text-white shadow-md">
                  <BatteryWarning size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[15px] font-black text-[#873800]">放电中</span>
                  <span className="text-[11px] font-bold text-[#FA8C16]/70">状态由电流方向判断</span>
                </div>
              </div>
              <div className="text-[26px] font-black text-[#873800]">
                2.5 <span className="text-[13px] font-bold ml-1">A</span>
              </div>
            </div>
          )}

          {/* 数据指标 */}
          <div className="grid grid-cols-5 gap-3 mb-3">
            <MetricCard title="总电压" value={activeTab === "高压电池" ? "540.20" : "25.60"} unit="V" />
            <MetricCard
              title="SOC"
              value={activeTab === "高压电池" ? "78" : "45"}
              unit="%"
              extra={
                <div className="w-full h-2 bg-[#EEF2F9] rounded-full mt-2 overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-[#4D94FF] rounded-full shadow-[0_0_8px_rgba(77,148,255,0.4)]"
                    style={{ width: activeTab === "高压电池" ? "78%" : "45%" }}
                  />
                </div>
              }
            />
            <MetricCard title="电流" value={activeTab === "高压电池" ? "-1.0" : "2.5"} unit="A" />
            <MetricCard title="单体最小电压" value={activeTab === "高压电池" ? "3.12" : "3.08"} unit="V" />
            <MetricCard title="单体最大电压" value={activeTab === "高压电池" ? "3.48" : "3.32"} unit="V" />
          </div>

          <div className="grid grid-cols-5 gap-3">
            <MetricCard title="最低温度" value={activeTab === "高压电池" ? "12" : "18"} unit="℃" />
            <MetricCard title="最高温度" value={activeTab === "高压电池" ? "36" : "29"} unit="℃" />
            <MetricCard title="温度差值" value={activeTab === "高压电池" ? "24" : "11"} unit="℃" sub="计算项" />
            <MetricCard title="压差" value={activeTab === "高压电池" ? "0.36" : "0.24"} unit="V" sub="计算项" />
          </div>

          {/* 放电保护条件 */}
              <div className="border-t border-[#EEF2F9] my-4" />
              <h3 className="text-[13px] font-black text-[#263238] uppercase tracking-wider mb-4">放电保护条件</h3>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-bold text-[#546E7A]">总电压保护</span>
                  <span className="text-[12px] text-[#90A4AE] font-bold">当 总电压 ≤</span>
                  <div className="flex items-center bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg h-9 px-3 gap-3 shadow-inner">
                    <input
                      type="text"
                      value={config.voltage}
                      onChange={(event) => setConfig({ ...config, voltage: event.target.value })}
                      className="w-14 bg-transparent text-[14px] font-black text-[#263238] focus:outline-none text-center"
                    />
                    <div className="flex flex-col border-l border-[#B0C4DE]/30 pl-1.5">
                      <ChevronDown size={12} className="rotate-180 text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                      <ChevronDown size={12} className="text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                    </div>
                  </div>
                  <span className="text-[12px] font-black text-[#B0C4DE]">V</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-bold text-[#546E7A]">SOC保护</span>
                  <span className="text-[12px] text-[#90A4AE] font-bold">当 SOC ≤</span>
                  <div className="flex items-center bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg h-9 px-3 gap-3 shadow-inner">
                    <input
                      type="text"
                      value={config.soc}
                      onChange={(event) => setConfig({ ...config, soc: event.target.value })}
                      className="w-14 bg-transparent text-[14px] font-black text-[#263238] focus:outline-none text-center"
                    />
                    <div className="flex flex-col border-l border-[#B0C4DE]/30 pl-1.5">
                      <ChevronDown size={12} className="rotate-180 text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                      <ChevronDown size={12} className="text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                    </div>
                  </div>
                  <span className="text-[12px] font-black text-[#B0C4DE]">%</span>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  <span className="text-[11px] font-bold text-[#52C41A]">配置已保存</span>
                  <button className="flex items-center gap-1.5 px-4 h-9 bg-white border border-[#B0C4DE] text-[#546E7A] font-black rounded-lg hover:bg-gray-50 transition-all active:scale-95 text-[12px] shadow-sm">
                    <RotateCcw size={14} /> 重置
                  </button>
                  <button className="flex items-center gap-1.5 px-4 h-9 bg-[#4D94FF] text-white font-black rounded-lg hover:bg-[#3B82F6] active:bg-[#2563EB] transition-all active:scale-95 text-[12px] shadow-lg">
                    <Save size={14} /> 保存
                  </button>
                </div>
              </div>
        </div>
      </section>
    </ServiceModeShell>
  );
}
