import type { ReactNode } from "react";
import { useState } from "react";
import { BatteryCharging, ChevronDown, RotateCcw, Save } from "lucide-react";

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
  <div className="bg-white border border-[#B0C4DE]/40 rounded-2xl p-4 flex flex-col shadow-sm hover:shadow-md transition-all">
    <div className="flex justify-between items-start mb-2">
      <span className="text-[12px] font-bold text-[#90A4AE] tracking-wide">{title}</span>
      <span className="text-[12px] font-bold text-[#B0C4DE]">{unit}</span>
    </div>
    <div className="flex items-baseline gap-1 mb-2">
      <span className="text-[28px] font-black text-[#263238] leading-none">{value}</span>
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
      <section className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 h-full">
        <div className="bg-white border border-[#B0C4DE] rounded-md shadow-sm p-4 shrink-0 px-8">
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
        </div>

        <div className="bg-white border border-[#B0C4DE] rounded-md shadow-sm p-8 flex flex-col shrink-0">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[15px] font-black text-[#263238] uppercase tracking-wider">数据面板</h2>
            <span className="text-[12px] font-bold text-[#90A4AE]">实时数据 (示例)</span>
          </div>

          <div className="bg-[#F6FFED] border border-[#B7EB8F] rounded-xl p-5 mb-8 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#52C41A] rounded-lg flex items-center justify-center text-white shadow-md">
                <BatteryCharging size={24} />
              </div>
              <div className="flex flex-col">
                <span className="text-[18px] font-black text-[#135200]">充电中</span>
                <span className="text-[12px] font-bold text-[#52C41A]/70">状态由电流方向判断</span>
              </div>
            </div>
            <div className="text-[32px] font-black text-[#135200]">
              -1.0 <span className="text-[16px] font-bold ml-1">A</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 mb-8">
            <MetricCard title="总电压" value="540.20" unit="V" />
            <MetricCard
              title="SOC"
              value="78"
              unit="%"
              extra={
                <div className="w-full h-2.5 bg-[#EEF2F9] rounded-full mt-4 overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-[#4D94FF] rounded-full shadow-[0_0_8px_rgba(77,148,255,0.4)]"
                    style={{ width: "78%" }}
                  />
                </div>
              }
            />
            <MetricCard title="电流" value="-1.0" unit="A" />
          </div>

          <div className="grid grid-cols-4 gap-6">
            <MetricCard title="单体最小电压" value="3.12" unit="V" />
            <MetricCard title="单体最大电压" value="3.48" unit="V" />
            <MetricCard title="最低温度" value="12" unit="℃" />
            <MetricCard title="最高温度" value="36" unit="℃" />
          </div>

          <div className="grid grid-cols-4 gap-6 mt-6">
            <MetricCard title="温度差值" value="24" unit="℃" sub="计算项" />
            <MetricCard title="压差" value="0.36" unit="V" sub="计算项" />
          </div>
        </div>

        <div className="bg-white border border-[#B0C4DE] rounded-md shadow-sm p-8 flex flex-col shrink-0 mb-4">
          <h2 className="text-[15px] font-black text-[#263238] uppercase tracking-wider mb-8">放电保护条件</h2>

          <div className="space-y-8 max-w-[500px]">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-bold text-[#546E7A]">总电压保护</span>
              <div className="flex items-center gap-4">
                <span className="text-[13px] text-[#90A4AE] font-bold">当 总电压 ≤</span>
                <div className="flex items-center bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg h-10 px-4 gap-4 shadow-inner">
                  <input
                    type="text"
                    value={config.voltage}
                    onChange={(event) => setConfig({ ...config, voltage: event.target.value })}
                    className="w-16 bg-transparent text-[15px] font-black text-[#263238] focus:outline-none text-center"
                  />
                  <div className="flex flex-col border-l border-[#B0C4DE]/30 pl-2">
                    <ChevronDown size={14} className="rotate-180 text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                    <ChevronDown size={14} className="text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                  </div>
                </div>
                <span className="text-[13px] font-black text-[#B0C4DE]">V</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[14px] font-bold text-[#546E7A]">SOC保护</span>
              <div className="flex items-center gap-4">
                <span className="text-[13px] text-[#90A4AE] font-bold">当 SOC ≤</span>
                <div className="flex items-center bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg h-10 px-4 gap-4 shadow-inner">
                  <input
                    type="text"
                    value={config.soc}
                    onChange={(event) => setConfig({ ...config, soc: event.target.value })}
                    className="w-16 bg-transparent text-[15px] font-black text-[#263238] focus:outline-none text-center"
                  />
                  <div className="flex flex-col border-l border-[#B0C4DE]/30 pl-2">
                    <ChevronDown size={14} className="rotate-180 text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                    <ChevronDown size={14} className="text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                  </div>
                </div>
                <span className="text-[13px] font-black text-[#B0C4DE]">%</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <span className="text-[12px] font-bold text-[#52C41A]">配置已保存</span>
              <div className="flex gap-4">
                <button className="flex items-center gap-2 px-6 h-10 bg-white border border-[#B0C4DE] text-[#546E7A] font-black rounded-lg hover:bg-gray-50 transition-all active:scale-95 text-[13px] shadow-sm">
                  <RotateCcw size={16} /> 重置
                </button>
                <button className="flex items-center gap-2 px-6 h-10 bg-[#4D94FF] text-white font-black rounded-lg hover:bg-[#3B82F6] active:bg-[#2563EB] transition-all active:scale-95 text-[13px] shadow-lg">
                  <Save size={16} /> 保存
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </ServiceModeShell>
  );
}
