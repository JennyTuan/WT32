import type { ReactNode } from "react";
import { useState } from "react";
import { BatteryCharging, BatteryWarning, ChevronDown, RotateCcw, Save } from "lucide-react";

import { useI18n } from "../../../lib/i18nContext";
import ServiceModeShell from "../shared/ServiceModeShell";

type BatteryTab = "high" | "low";

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
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<BatteryTab>("high");
  const [config, setConfig] = useState({
    voltage: "480",
    soc: "20",
  });

  const tabs: { id: BatteryTab; label: string }[] = [
    { id: "high", label: t("service.battery.highVoltageBattery") },
    { id: "low", label: t("service.battery.lowVoltageBattery") },
  ];
  const isHighVoltage = activeTab === "high";

  return (
    <ServiceModeShell currentRoute="/service/battery">
      <section className="flex-1 overflow-y-auto custom-scrollbar flex flex-col h-full">
        <div className="bg-white border border-[#B0C4DE] rounded-md shadow-sm p-5 flex flex-col flex-1">
          <div className="flex items-center justify-between mb-4">
            <div className="flex bg-[#EEF2F9] p-1 rounded-md border border-[#B0C4DE]/50 overflow-hidden shadow-sm w-fit">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-10 h-[32px] text-[13px] font-bold rounded-md transition-all duration-200 ${activeTab === tab.id ? "bg-[#4D94FF] text-white shadow-sm" : "text-[#4D94FF] hover:bg-white/50"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span className="text-[12px] font-bold text-[#90A4AE]">{t("service.battery.realtimeSample")}</span>
          </div>

          {isHighVoltage ? (
            <div className="bg-[#F6FFED] border border-[#B7EB8F] rounded-xl px-5 py-2.5 mb-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#52C41A] rounded-lg flex items-center justify-center text-white shadow-md">
                  <BatteryCharging size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[15px] font-black text-[#135200]">{t("service.battery.charging")}</span>
                  <span className="text-[11px] font-bold text-[#52C41A]/70">{t("service.battery.currentDirectionHint")}</span>
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
                  <span className="text-[15px] font-black text-[#873800]">{t("service.battery.discharging")}</span>
                  <span className="text-[11px] font-bold text-[#FA8C16]/70">{t("service.battery.currentDirectionHint")}</span>
                </div>
              </div>
              <div className="text-[26px] font-black text-[#873800]">
                2.5 <span className="text-[13px] font-bold ml-1">A</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-5 gap-3 mb-3">
            <MetricCard title={t("service.battery.totalVoltage")} value={isHighVoltage ? "540.20" : "25.60"} unit="V" />
            <MetricCard
              title="SOC"
              value={isHighVoltage ? "78" : "45"}
              unit="%"
              extra={
                <div className="w-full h-2 bg-[#EEF2F9] rounded-full mt-2 overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-[#4D94FF] rounded-full shadow-[0_0_8px_rgba(77,148,255,0.4)]"
                    style={{ width: isHighVoltage ? "78%" : "45%" }}
                  />
                </div>
              }
            />
            <MetricCard title={t("service.battery.current")} value={isHighVoltage ? "-1.0" : "2.5"} unit="A" />
            <MetricCard title={t("service.battery.minCellVoltage")} value={isHighVoltage ? "3.12" : "3.08"} unit="V" />
            <MetricCard title={t("service.battery.maxCellVoltage")} value={isHighVoltage ? "3.48" : "3.32"} unit="V" />
          </div>

          <div className="grid grid-cols-5 gap-3">
            <MetricCard title={t("service.battery.minTemperature")} value={isHighVoltage ? "12" : "18"} unit="℃" />
            <MetricCard title={t("service.battery.maxTemperature")} value={isHighVoltage ? "36" : "29"} unit="℃" />
            <MetricCard title={t("service.battery.temperatureDelta")} value={isHighVoltage ? "24" : "11"} unit="℃" sub={t("service.battery.calculatedItem")} />
            <MetricCard title={t("service.battery.voltageDelta")} value={isHighVoltage ? "0.36" : "0.24"} unit="V" sub={t("service.battery.calculatedItem")} />
          </div>

          <div className="border-t border-[#EEF2F9] my-4" />
          <h3 className="text-[13px] font-black text-[#263238] uppercase tracking-wider mb-4">{t("service.battery.dischargeProtection")}</h3>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-bold text-[#546E7A]">{t("service.battery.totalVoltageProtection")}</span>
              <span className="text-[12px] text-[#90A4AE] font-bold">{t("service.battery.whenTotalVoltageBelow")}</span>
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
              <span className="text-[13px] font-bold text-[#546E7A]">{t("service.battery.socProtection")}</span>
              <span className="text-[12px] text-[#90A4AE] font-bold">{t("service.battery.whenSocBelow")}</span>
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
              <span className="text-[11px] font-bold text-[#52C41A]">{t("service.battery.saved")}</span>
              <button className="flex items-center gap-1.5 px-4 h-9 bg-white border border-[#B0C4DE] text-[#546E7A] font-black rounded-lg hover:bg-gray-50 transition-all active:scale-95 text-[12px] shadow-sm">
                <RotateCcw size={14} /> {t("service.battery.reset")}
              </button>
              <button className="flex items-center gap-1.5 px-4 h-9 bg-[#4D94FF] text-white font-black rounded-lg hover:bg-[#3B82F6] active:bg-[#2563EB] transition-all active:scale-95 text-[12px] shadow-lg">
                <Save size={14} /> {t("service.battery.save")}
              </button>
            </div>
          </div>
        </div>
      </section>
    </ServiceModeShell>
  );
}
