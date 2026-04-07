import { useState } from "react";
import { ImageIcon } from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";

export default function PerformanceEvaluationScreen() {
  const [activeTab, setActiveTab] = useState("MTF");
  const [showBaseline, setShowBaseline] = useState(true);

  const tabs = ["MTF", "FWHM_H", "FWHM_V"];
  const tabMeta = {
    MTF: { label: "空间分辨率", accent: "text-[#1D4ED8]" },
    FWHM_H: { label: "水平响应", accent: "text-[#0F766E]" },
    FWHM_V: { label: "垂直响应", accent: "text-[#7C3AED]" },
  } as const;

  const chartProfiles = {
    MTF: {
      title: "空间分辨率 (MTF)",
      subtitle: "调制传递函数曲线，用于观察空间频率与响应衰减关系。",
      unit: "lp/cm",
      yLabel: "MTF",
      points: [
        { x: 0, y: 1 },
        { x: 1, y: 0.67 },
        { x: 2.5, y: 0.28 },
        { x: 4, y: 0.25 },
        { x: 6, y: 0.14 },
        { x: 7.5, y: 0.18 },
        { x: 10, y: 0.12 },
        { x: 11, y: 0.08 },
        { x: 15, y: 0.02 },
        { x: 20, y: 0.01 },
        { x: 25, y: 0.005 },
      ],
      markers: [
        { type: "mtf50", label: "MTF50", y: 0.5, x: 1.5, color: "#EF4444" },
        { type: "mtf10", label: "MTF10", y: 0.1, x: 10.5, color: "#3B82F6" },
      ],
      baseline: [
        { x: 0, y: 1 },
        { x: 5, y: 0.4 },
        { x: 10, y: 0.15 },
        { x: 15, y: 0.05 },
        { x: 20, y: 0.02 },
        { x: 25, y: 0.01 },
      ],
    },
    FWHM_H: {
      title: "水平半高宽 (FWHM_H)",
      subtitle: "水平方向扩散响应曲线，观察边缘锐度与成像扩展宽度。",
      unit: "Pixel",
      yLabel: "Normalized Intensity",
      points: Array.from({ length: 50 }, (_, index) => {
        const x = index;
        const peak = 22;
        const sigma = 1.5;
        const y =
          3000 * Math.exp(-Math.pow(x - peak, 2) / (2 * Math.pow(sigma, 2))) +
          (Math.sqrt(index) * 10 - 50);
        return { x, y: Math.max(y, -200) };
      }),
      markers: [
        { type: "half-max", label: "Half Max", y: 1500, color: "#EF4444" },
        { type: "fwhm-range", label: "FWHM", x1: 20.8, x2: 23.2, color: "#10B981" },
      ],
      baseline: Array.from({ length: 50 }, (_, index) => ({
        x: index,
        y: 2800 * Math.exp(-Math.pow(index - 22, 2) / 10),
      })),
    },
    FWHM_V: {
      title: "垂直半高宽 (FWHM_V)",
      subtitle: "垂直方向扩散响应曲线，用于检查扫描方向上的模糊控制。",
      unit: "Pixel",
      yLabel: "Normalized Intensity",
      points: Array.from({ length: 50 }, (_, index) => {
        const x = index;
        const peak = 21;
        const sigma = 1.8;
        const y =
          2950 * Math.exp(-Math.pow(x - peak, 2) / (2 * Math.pow(sigma, 2))) +
          (Math.sqrt(index) * 8 - 40);
        return { x, y: Math.max(y, -150) };
      }),
      markers: [
        { type: "half-max", label: "Half Max", y: 1475, color: "#EF4444" },
        { type: "fwhm-range", label: "FWHM", x1: 19.5, x2: 22.5, color: "#10B981" },
      ],
      baseline: Array.from({ length: 50 }, (_, index) => ({
        x: index,
        y: 2700 * Math.exp(-Math.pow(index - 21, 2) / 12),
      })),
    },
  } as const;

  const activeProfile = chartProfiles[activeTab as keyof typeof chartProfiles];
  const chartWidth = 244;
  const chartHeight = 184;
  const chartPadding = { left: 32, right: 10, top: 12, bottom: 20 };

  const minX = 0;
  const maxX = activeTab === "MTF" ? 25 : 50;
  const minY = activeTab === "MTF" ? 0 : -500;
  const maxY = activeTab === "MTF" ? 1.0 : 3000;

  const xTicks = activeTab === "MTF" ? [0, 5, 10, 15, 20, 25] : [0, 10, 20, 30, 40, 50];
  const yTicks = activeTab === "MTF" ? [0, 0.2, 0.4, 0.6, 0.8, 1.0] : [0, 1000, 2000, 3000];

  const toChartX = (value: number) =>
    chartPadding.left +
    ((value - minX) / Math.max(maxX - minX, 1)) *
      (chartWidth - chartPadding.left - chartPadding.right);
  const toChartY = (value: number) =>
    chartHeight -
    chartPadding.bottom -
    ((value - minY) / Math.max(maxY - minY, 0.001)) *
      (chartHeight - chartPadding.top - chartPadding.bottom);

  const buildPath = (points: readonly { x: number; y: number }[]) =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${toChartX(point.x)} ${toChartY(point.y)}`)
      .join(" ");

  const currentPath = buildPath(activeProfile.points);
  const baselinePath = activeProfile.baseline ? buildPath(activeProfile.baseline) : "";

  return (
    <ServiceModeShell currentRoute="/service/performance">
      <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm p-3 flex flex-col relative overflow-hidden h-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 rounded-2xl border border-[#D6E2F2] bg-[linear-gradient(180deg,#F8FBFF_0%,#EDF3FA_100%)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_14px_rgba(148,163,184,0.12)]">
            {tabs.map((tab) => {
              const active = activeTab === tab;
              const meta = tabMeta[tab as keyof typeof tabMeta];
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`group relative flex h-[42px] min-w-[104px] flex-col items-start justify-center rounded-[14px] border px-4 text-left transition-all duration-200 ${active ? "border-[#BFDBFE] bg-white shadow-[0_8px_18px_rgba(59,130,246,0.18)]" : "border-transparent bg-transparent text-[#94A3B8] hover:border-white/70 hover:bg-white/65"}`}
                >
                  <span className={`text-[12px] font-black tracking-[0.06em] ${active ? meta.accent : "text-[#64748B]"}`}>
                    {tab}
                  </span>
                  <span
                    className={`mt-0.5 text-[10px] font-bold ${active ? "text-[#475569]" : "text-[#A3B2C2] group-hover:text-[#64748B]"}`}
                  >
                    {meta.label}
                  </span>
                  {active && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#60A5FA] shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-[#90A4AE]">显示基线</span>
              <div
                onClick={() => setShowBaseline(!showBaseline)}
                className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-all duration-200 ${showBaseline ? "bg-[#4D94FF]" : "bg-[#B0C4DE]"}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-all ${showBaseline ? "translate-x-6" : "translate-x-0"}`} />
              </div>
            </div>
            <button className="px-6 h-10 bg-[#2F54EB] text-white font-bold rounded-full hover:bg-blue-600 transition-all active:scale-95 shadow-md text-[13px]">
              导入图像
            </button>
          </div>
        </div>

        <div className="flex-1 flex gap-3 overflow-hidden">
          <div className="flex-1 bg-[#050A19] rounded-3xl relative flex items-center justify-center overflow-hidden border border-[#1A2642] shadow-2xl">
            <div className="flex flex-col items-center gap-4 opacity-40">
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#4D94FF] flex items-center justify-center text-[#4D94FF]">
                <ImageIcon size={32} />
              </div>
              <span className="text-[#4D94FF] text-[14px] font-bold tracking-widest uppercase">
                Target Phantom View
              </span>
            </div>

            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-0 w-24 h-24 border-t border-l border-[#4D94FF]/20 rounded-tl-3xl m-6" />
              <div className="absolute top-0 right-0 w-24 h-24 border-t border-r border-[#4D94FF]/20 rounded-tr-3xl m-6" />
              <div className="absolute bottom-0 left-0 w-24 h-24 border-b border-l border-[#4D94FF]/20 rounded-bl-3xl m-6" />
              <div className="absolute bottom-0 right-0 w-24 h-24 border-b border-r border-[#4D94FF]/20 rounded-br-3xl m-6" />
            </div>
          </div>

          <div className="w-[300px] flex flex-col gap-3 h-full overflow-hidden">
            <div className="flex flex-col flex-1 bg-[#F8FAFC] border border-[#B0C4DE]/50 rounded-3xl p-3 shadow-sm overflow-hidden">
              <div className="flex items-start justify-between gap-3 mb-2 shrink-0">
                <div>
                  <div className="font-black text-[#263238] text-[15px]">{activeProfile.title}</div>
                  <div className="text-[10px] text-[#90A4AE] font-medium leading-[1.2] mt-0.5">
                    {activeProfile.subtitle}
                  </div>
                </div>
                <div className="shrink-0 rounded-full bg-[#E3F2FD] px-2.5 py-1 text-[10px] font-black text-[#1E88E5]">
                  {activeTab}
                </div>
              </div>

              <div className="flex-1 bg-white rounded-2xl border border-[#D7E3F4] shadow-inner p-2 min-h-[180px] flex flex-col">
                <div className="flex-1 items-center justify-center flex overflow-hidden">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(77,148,255,0.25)" />
                        <stop offset="100%" stopColor="rgba(77,148,255,0.01)" />
                      </linearGradient>
                    </defs>

                    {yTicks.map((value) => (
                      <line
                        key={`y-grid-${value}`}
                        x1={chartPadding.left}
                        y1={toChartY(value)}
                        x2={chartWidth - chartPadding.right}
                        y2={toChartY(value)}
                        stroke="#E2E8F0"
                        strokeWidth="0.5"
                        strokeDasharray="3 4"
                      />
                    ))}

                    <path
                      d={`${currentPath} L ${toChartX(activeProfile.points[activeProfile.points.length - 1].x)} ${toChartY(0)} L ${toChartX(activeProfile.points[0].x)} ${toChartY(0)} Z`}
                      fill="url(#curveFill)"
                    />

                    {activeProfile.markers.map((marker, index: number) => {
                      if (marker.type === "mtf50" || marker.type === "mtf10") {
                        const item = marker as { label: string; y: number; x: number; color: string };
                        return (
                          <g key={index}>
                            <line
                              x1={chartPadding.left}
                              y1={toChartY(item.y)}
                              x2={toChartX(item.x)}
                              y2={toChartY(item.y)}
                              stroke="#94A3B8"
                              strokeDasharray="2 2"
                              strokeWidth="1"
                            />
                            <line
                              x1={toChartX(item.x)}
                              y1={chartPadding.top}
                              x2={toChartX(item.x)}
                              y2={toChartY(0)}
                              stroke={item.color}
                              strokeDasharray="4 2"
                              strokeWidth="1.5"
                            />
                            <circle
                              cx={toChartX(item.x)}
                              cy={toChartY(item.y)}
                              r="3.5"
                              fill={item.color}
                              stroke="white"
                              strokeWidth="1.5"
                            />
                            <text
                              x={toChartX(item.x) + 4}
                              y={toChartY(item.y) - 6}
                              fontSize="8"
                              fontWeight="bold"
                              fill={item.color}
                            >
                              {item.label}
                            </text>
                          </g>
                        );
                      }
                      if (marker.type === "half-max") {
                        const item = marker as { y: number; color: string };
                        return (
                          <line
                            key={index}
                            x1={chartPadding.left}
                            y1={toChartY(item.y)}
                            x2={chartWidth - chartPadding.right}
                            y2={toChartY(item.y)}
                            stroke={item.color}
                            strokeDasharray="4 2"
                            strokeWidth="1.5"
                          />
                        );
                      }
                      if (marker.type === "fwhm-range") {
                        const item = marker as { x1: number; x2: number; color: string };
                        return (
                          <g key={index}>
                            <line
                              x1={toChartX(item.x1)}
                              y1={chartPadding.top}
                              x2={toChartX(item.x1)}
                              y2={toChartY(0)}
                              stroke={item.color}
                              strokeDasharray="4 2"
                              strokeWidth="1.5"
                            />
                            <line
                              x1={toChartX(item.x2)}
                              y1={chartPadding.top}
                              x2={toChartX(item.x2)}
                              y2={toChartY(0)}
                              stroke={item.color}
                              strokeDasharray="4 2"
                              strokeWidth="1.5"
                            />
                          </g>
                        );
                      }
                      return null;
                    })}

                    {showBaseline && (
                      <path
                        d={baselinePath}
                        fill="none"
                        stroke="#94A3B8"
                        strokeWidth="1.2"
                        strokeDasharray="4 4"
                        opacity="0.6"
                      />
                    )}

                    <path
                      d={currentPath}
                      fill="none"
                      stroke="#3B82F6"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />

                    <line
                      x1={chartPadding.left}
                      y1={toChartY(0)}
                      x2={chartWidth - chartPadding.right}
                      y2={toChartY(0)}
                      stroke="#475569"
                      strokeWidth="1"
                    />
                    <line
                      x1={chartPadding.left}
                      y1={chartPadding.top}
                      x2={chartPadding.left}
                      y2={chartHeight - chartPadding.bottom}
                      stroke="#475569"
                      strokeWidth="1"
                    />

                    {yTicks.map((value) => (
                      <text
                        key={`y-${value}`}
                        x={chartPadding.left - 6}
                        y={toChartY(value) + 3}
                        textAnchor="end"
                        fontSize="8"
                        fontWeight="500"
                        fill="#64748B"
                      >
                        {value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toFixed(value < 1 ? 1 : 0)}
                      </text>
                    ))}
                    {xTicks.map((value) => (
                      <text
                        key={`x-${value}`}
                        x={toChartX(value)}
                        y={chartHeight - 8}
                        textAnchor="middle"
                        fontSize="8"
                        fontWeight="500"
                        fill="#64748B"
                      >
                        {value.toFixed(value < 1 ? 1 : 0)}
                      </text>
                    ))}
                  </svg>
                </div>

                <div className="mt-1 flex items-center justify-between text-[8px] font-bold text-[#94A3B8] border-t border-[#F1F5F9] pt-1">
                  <span>Unit: {activeProfile.unit}</span>
                  <span>Axis: {activeProfile.yLabel}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-[#D7E3F4] p-4 shadow-sm shrink-0">
              <div className="text-[12px] font-black text-[#1E293B] mb-3 uppercase tracking-tighter flex items-center gap-2">
                <div className="w-1 h-3 bg-[#3B82F6] rounded-full" />
                测量数值统计
              </div>
              <div className="space-y-2">
                {activeTab === "MTF" ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#64748B] font-semibold">MTF50 频率</span>
                      <span className="text-[12px] text-[#2563EB] font-black">1.5 lp/cm</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#64748B] font-semibold">MTF10 频率</span>
                      <span className="text-[12px] text-[#2563EB] font-black">10.5 lp/cm</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#64748B] font-semibold">FWHM 估值</span>
                      <span className="text-[12px] text-[#059669] font-black">
                        {activeTab === "FWHM_H" ? "2.40" : "3.00"} Pixels
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-[#64748B] font-semibold">峰值中心</span>
                      <span className="text-[12px] text-[#059669] font-black">
                        {activeTab === "FWHM_H" ? "22.0" : "21.0"}
                      </span>
                    </div>
                  </>
                )}
                <div className="pt-2 border-t border-[#F1F5F9] flex justify-between items-center">
                  <span className="text-[11px] text-[#64748B] font-semibold">基线偏差</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] text-[#DC2626] font-black">+0.2%</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#DC2626] animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </ServiceModeShell>
  );
}
