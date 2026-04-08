import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Battery,
  CheckCircle2,
  ChevronDown,
  Disc,
  Flame,
  FlipHorizontal2,
  LayoutGrid,
  Maximize2,
  Menu,
  MousePointer2,
  Move,
  Network,
  Play,
  RefreshCw,
  RotateCcw,
  Ruler,
  ScanLine,
  Search,
  Settings,
  Siren,
  SlidersHorizontal,
  Sun,
  TestTube,
  Thermometer,
  User,
  Wind,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import DicomViewer from "../components/DicomViewer";

const scanModes = [
  { id: "helical", label: "\u87ba\u65cb\u626b\u63cf", desc: "\u8fde\u7eed\u8fdb\u5e8a\u91c7\u96c6" },
  { id: "axial", label: "\u65ad\u5c42\u626b\u63cf", desc: "\u5b9a\u70b9\u5206\u6b65\u66dd\u5149" },
];

const acquisitionFields = [
  { label: "\u7ba1\u7535\u538b (kV)", value: "120", type: "select", options: ["100", "120", "140"] },
  { label: "\u7ba1\u7535\u6d41 (mA)", value: "200", type: "input" },
  { label: "\u65cb\u8f6c\u65f6\u95f4 (s)", value: "1", type: "select", options: ["0.5", "1", "1.5", "2"] },
  { label: "\u51c6\u76f4\u5668\u5bbd\u5ea6", value: "32*0.6", type: "select", options: ["32*0.6", "16*1.2", "64*0.6"] },
];

const reconFields = [
  { label: "\u5c42\u539a (mm)", value: "5", type: "input" },
  { label: "\u5c42\u95f4\u8ddd (mm)", value: "5", type: "input" },
  { label: "\u7a97\u4f4d (WL)", value: "40", type: "input" },
  { label: "\u7a97\u5bbd (WW)", value: "400", type: "input" },
  { label: "\u91cd\u5efa\u89c6\u91ce (mm)", value: "500", type: "input" },
  { label: "\u77e9\u9635\u5927\u5c0f", value: "512", type: "select", options: ["256", "512", "1024"] },
  { label: "\u91cd\u5efa\u7b97\u6cd5", value: "Standard", type: "select", options: ["Standard", "Bone", "Soft"], fullWidth: true },
];

const sidebarItems = [
  { icon: Thermometer, label: "\u7403\u7ba1\u9884\u70ed", route: "/service/tube-warmup" },
  { icon: Wind, label: "\u7a7a\u6c14\u6821\u6b63", route: "/service/air-calibration" },
  { icon: CheckCircle2, label: "\u65e5\u5e38 QA", route: "/service/daily-qa" },
  { icon: TestTube, label: "\u786c\u4ef6\u6d4b\u8bd5", route: "/service/hardware-test" },
  { icon: Battery, label: "\u7535\u6c60\u7ba1\u7406", route: "/service/battery" },
  { icon: Disc, label: "\u78c1\u76d8\u7ba1\u7406", route: "/service/disk" },
  { icon: BarChart3, label: "\u6027\u80fd\u8bc4\u4f30", route: "/service/performance" },
  { icon: MousePointer2, label: "\u624b\u52a8\u626b\u63cf", route: "/mobile/manual-scan", active: true },
];

export default function ManualScanScreen() {
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeMode, setActiveMode] = useState("helical");
  const [activePanel, setActivePanel] = useState<"acq" | "recon">("acq");
  const [activeTool, setActiveTool] = useState("pan");
  const [windowCenter] = useState(40);
  const [windowWidth] = useState(400);

  return (
    <div className="relative flex h-[768px] w-[1024px] select-none flex-col overflow-hidden rounded-md border border-[#B0C4DE] bg-[#EEF2F9] font-sans shadow-2xl">
      <header className="z-10 flex h-[80px] shrink-0 items-center justify-between border-b border-[#B0C4DE] bg-[#E8EAF1] px-4">
        <div className="flex items-center gap-3">
          <div className="flex min-w-[210px] items-center gap-3 rounded-sm border border-[#B0C4DE] bg-[#DCE6F2] px-4 py-1.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#4A6982] text-white opacity-90">
              <User size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-[16px] font-bold">Roky Zhang</span>
              <span className="mt-0.5 text-[12px] font-medium leading-none text-[#546E7A]">ID: 67890</span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
            <div className="text-[9px] font-bold italic">L 0</div>
            <div className="text-[9px] font-bold">&#8736; 0</div>
            <div className="flex items-center gap-1 text-[11px] font-bold">
              <Flame size={14} />
              <span>0%</span>
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="leading-none text-[28px] font-bold tracking-tight text-[#37474F]">13:52</div>
          <div className="mt-1 text-[12px] font-medium text-[#546E7A]">{"2\u670826\u65e5\u5468\u56db"}</div>
        </div>

        <div className="flex items-center gap-5 pr-2">
          <div className="cursor-pointer p-1 text-[#D32F2F] hover:opacity-70">
            <Siren size={30} strokeWidth={1.8} />
          </div>
          <div className="relative cursor-pointer p-1 text-[#546E7A] hover:opacity-70">
            <Network size={24} />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#D32F2F] text-[9px] font-bold text-white">
              5
            </span>
          </div>
          <div className="cursor-pointer p-1 text-[#546E7A] hover:opacity-70">
            <Sun size={24} />
          </div>
          <div className="relative cursor-pointer p-1 text-[#546E7A] hover:opacity-70">
            <Settings size={24} />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#D32F2F] text-[9px] font-bold text-white">
              10
            </span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 gap-2 overflow-hidden bg-[#EEF2F9] p-2">
        <aside
          className={`${isCollapsed ? "w-[80px]" : "w-[220px]"} flex shrink-0 flex-col overflow-hidden rounded-md border border-[#B0C4DE] bg-white p-4 shadow-sm transition-all duration-300 ease-in-out`}
        >
          <div className="mb-6 flex h-10 items-center justify-between">
            {!isCollapsed && (
              <div>
                <div className="text-[14px] font-black uppercase tracking-wider text-[#37474F]">{"\u670d\u52a1\u6a21\u5f0f"}</div>
                <div className="mt-0.5 text-[10px] font-bold text-[#90A4AE]">{"\u786c\u4ef6 / \u624b\u52a8\u626b\u63cf"}</div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className={`flex h-9 w-9 items-center justify-center rounded-md border border-[#B0C4DE] bg-white text-[#546E7A] shadow-sm transition-all hover:bg-gray-50 active:scale-95 ${isCollapsed ? "mx-auto" : ""}`}
            >
              <Menu size={18} />
            </button>
          </div>

          {!isCollapsed && (
            <div className="relative mb-6">
              <input
                type="text"
                placeholder={"\u5173\u952e\u5b57\u641c\u7d22..."}
                className="h-[36px] w-full rounded-md border border-[#B0C4DE] bg-white pl-10 pr-4 text-[13px] focus:border-[#4D94FF] focus:outline-none focus:ring-1 focus:ring-[#4D94FF]/20"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" size={16} />
            </div>
          )}

          <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto pr-1">
            <div className={`mb-2 flex items-center ${isCollapsed ? "justify-center" : "justify-between"} rounded-md border border-[#B0C4DE]/30 bg-[#EEF2F9] p-3 text-[#4D94FF] shadow-sm`}>
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-[#4D94FF] p-1.5 text-white">
                  <LayoutGrid size={20} />
                </div>
                {!isCollapsed && <span className="text-[14px] font-bold">{"\u786c\u4ef6"}</span>}
              </div>
              {!isCollapsed && <ChevronDown size={18} className="opacity-60" />}
            </div>

            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => navigate(item.route)}
                  className={`flex w-full items-center ${isCollapsed ? "justify-center px-0" : "gap-3 px-4"} rounded-md py-2.5 transition-all ${item.active ? "border-l-4 border-[#4D94FF] bg-[#E3F2FD] text-[#4D94FF]" : "text-[#546E7A] hover:bg-gray-50"}`}
                >
                  <div className={item.active ? "text-[#4D94FF]" : "text-[#90A4AE]"}>
                    <Icon size={18} />
                  </div>
                  {!isCollapsed && <span className={`whitespace-nowrap text-[13px] ${item.active ? "font-bold" : "font-medium"}`}>{item.label}</span>}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="relative flex flex-1 flex-col overflow-hidden">
          <div className="flex h-full flex-1 gap-3 overflow-hidden">
            <div className="relative flex-1 overflow-hidden rounded-md border border-[#1A2642] bg-[#050A19] shadow-2xl">
              <DicomViewer
                dicomUrl="/dicom/test/SYNO0160.dcm"
                activeTool={activeTool}
                windowCenter={windowCenter}
                windowWidth={windowWidth}
              />

              <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-row gap-1.5 rounded-2xl border border-[#4D94FF]/15 bg-black/30 px-3 py-2 backdrop-blur-sm">
                {[
                  { id: "pan", icon: <Move size={15} />, label: "\u5e73\u79fb" },
                  { id: "zoom", icon: <ZoomIn size={15} />, label: "\u653e\u5927" },
                  { id: "zoomout", icon: <ZoomOut size={15} />, label: "\u7f29\u5c0f" },
                  { id: "window", icon: <SlidersHorizontal size={15} />, label: "\u8c03\u7a97" },
                  { id: "ruler", icon: <Ruler size={15} />, label: "\u6d4b\u91cf" },
                  { id: "flip", icon: <FlipHorizontal2 size={15} />, label: "\u7ffb\u8f6c" },
                  { id: "fit", icon: <Maximize2 size={15} />, label: "\u9002\u5408" },
                  { id: "reset", icon: <RefreshCw size={15} />, label: "\u91cd\u7f6e" },
                ].map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    title={tool.label}
                    onClick={() => setActiveTool(tool.id)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
                      activeTool === tool.id
                        ? "border-[#4D94FF] bg-[#4D94FF] text-white shadow-[0_0_8px_rgba(77,148,255,0.5)]"
                        : "border-[#4D94FF]/20 bg-white/5 text-[#4D94FF]/60 hover:bg-white/15 hover:text-[#4D94FF]"
                    }`}
                  >
                    {tool.icon}
                  </button>
                ))}
              </div>

              <div className="pointer-events-none absolute bottom-4 left-5 flex flex-col gap-0.5 font-mono text-[10px] font-bold text-[#4D94FF]/40">
                <div>WL: {windowCenter} / WW: {windowWidth}</div>
                <div>SYNO-0160 · HELICAL</div>
              </div>
            </div>

            <div className="flex h-full w-[260px] flex-col overflow-hidden rounded-md border border-[#B0C4DE]/50 bg-[#F8FAFC] shadow-sm">
              <div className="flex flex-1 flex-col overflow-hidden p-3 pb-3">
                <div className="mb-3 flex shrink-0 items-center rounded-xl bg-[#EEF2F9] p-1">
                  <button
                    type="button"
                    onClick={() => setActivePanel("acq")}
                    className={`flex h-[36px] flex-1 items-center justify-center gap-2 rounded-lg text-[12px] font-black transition-all ${activePanel === "acq" ? "bg-white text-[#1E88E5] shadow-sm" : "text-[#64748B]"}`}
                  >
                    <ScanLine size={14} />
                    {"\u91c7\u96c6\u53c2\u6570"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePanel("recon")}
                    className={`flex h-[36px] flex-1 items-center justify-center gap-2 rounded-lg text-[12px] font-black transition-all ${activePanel === "recon" ? "bg-white text-[#1E88E5] shadow-sm" : "text-[#64748B]"}`}
                  >
                    <RotateCcw size={14} />
                    {"\u91cd\u5efa\u53c2\u6570"}
                  </button>
                </div>

                <div className="custom-scrollbar flex-1 overflow-y-auto px-1 pb-1">
                  <div className="space-y-2 border-b border-[#E2E8F0] pb-3">
                    <div className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{"\u626b\u63cf\u6a21\u5f0f"}</div>
                    <div className="flex items-center gap-2 rounded-lg bg-white/70 p-1">
                      {scanModes.map((mode) => {
                        const active = activeMode === mode.id;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setActiveMode(mode.id)}
                            className={`flex h-[38px] flex-1 flex-col items-center justify-center rounded-lg border transition-all ${
                              active ? "border-[#BFDBFE] bg-white text-[#1D4ED8] shadow-sm" : "border-transparent text-slate-400 hover:bg-white/50"
                            }`}
                          >
                            <span className="text-[11px] font-black uppercase leading-tight tracking-tighter">{mode.id}</span>
                            <span className="text-[9px] font-bold leading-tight opacity-70">{mode.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {activePanel === "acq" ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-3">
                      {acquisitionFields.map((field) => (
                        <div key={field.label} className="flex flex-col gap-1">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{field.label}</label>
                          {field.type === "select" ? (
                            <div className="relative">
                              <select className="h-[32px] w-full appearance-none rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-bold outline-none transition-all focus:border-[#4D94FF]">
                                {field.options?.map((option) => (
                                  <option key={option}>{option}</option>
                                ))}
                              </select>
                              <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                          ) : (
                            <input
                              type="text"
                              defaultValue={field.value}
                              className="h-[32px] w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-bold outline-none transition-all focus:border-[#4D94FF]"
                            />
                          )}
                        </div>
                      ))}

                      {[
                        { label: "\u87ba\u8ddd (Pitch)", value: "1" },
                        { label: "\u4f53\u4f4d", value: "HFS", select: ["HFS", "FFS", "HFP", "FFP"] },
                        { label: "\u8d77\u59cb\u4f4d\u7f6e (START)", value: "--.-" },
                        { label: "\u7ed3\u675f\u4f4d\u7f6e (END)", value: "--.-" },
                        { label: "\u626b\u63cf\u65b9\u5411", value: "IN", select: ["IN", "OUT"] },
                        { label: "\u90e8\u4f4d", value: "Body", select: ["Body", "Head", "Chest", "Abdomen"] },
                      ].map((field) => (
                        <div key={field.label} className="flex flex-col gap-1">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{field.label}</label>
                          {field.select ? (
                            <div className="relative">
                              <select className="h-[32px] w-full appearance-none rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-bold outline-none transition-all focus:border-[#4D94FF]">
                                {field.select.map((option) => (
                                  <option key={option}>{option}</option>
                                ))}
                              </select>
                              <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                          ) : (
                            <input
                              type="text"
                              defaultValue={field.value}
                              className="h-[32px] w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-bold outline-none transition-all focus:border-[#4D94FF]"
                            />
                          )}
                        </div>
                      ))}

                      <div className="col-span-2 flex flex-col gap-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{"\u626b\u63cf\u540d\u79f0"}</label>
                        <input
                          type="text"
                          defaultValue={"\u5f85\u5b9a"}
                          className="h-[32px] w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-bold outline-none transition-all focus:border-[#4D94FF]"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-3">
                      {reconFields.map((field) => (
                        <div key={field.label} className={`flex flex-col gap-1 ${field.fullWidth ? "col-span-2" : ""}`}>
                          <label className="px-0.5 font-sans text-[10px] font-black uppercase tracking-[0.05em] text-slate-400">{field.label}</label>
                          {field.type === "select" ? (
                            <div className="relative">
                              <select className="h-[36px] w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none transition-all focus:border-[#4D94FF]">
                                {field.options?.map((option) => (
                                  <option key={option}>{option}</option>
                                ))}
                              </select>
                              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                          ) : (
                            <input
                              type="text"
                              defaultValue={field.value}
                              className="h-[36px] w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none transition-all focus:border-[#4D94FF]"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-3 mt-3 flex shrink-0 justify-center gap-2 px-2">
                <button className="flex h-[36px] min-w-[92px] items-center justify-center gap-2 rounded-lg bg-[#4D94FF] px-3.5 text-[12px] font-black uppercase tracking-[0.04em] text-white shadow-sm transition-all hover:bg-blue-600 active:scale-95">
                  <Play size={14} fill="currentColor" />
                  {"\u626b\u63cf"}
                </button>
                <button className="flex h-[36px] min-w-[92px] items-center justify-center gap-2 rounded-lg border border-[#B0C4DE] bg-white px-3.5 text-[11px] font-bold text-[#546E7A] transition-all hover:bg-slate-50 active:scale-95">
                  <RotateCcw size={16} />
                  {"\u91cd\u7f6e"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="flex h-[80px] shrink-0 items-center border-t border-[#B0C4DE] bg-[#E8EAF1] px-8">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="h-[52px] rounded-md border-2 border-[#B0C4DE] bg-white px-10 text-[14px] font-bold text-[#37474F] shadow-sm transition-all hover:bg-gray-50 active:scale-95"
        >
          {"\u9996\u9875"}
        </button>
        <div className="ml-8 text-[13px] font-medium leading-none text-[#546E7A]">{"\u670d\u52a1\u6a21\u5f0f \u00b7 \u786c\u4ef6 / \u624b\u52a8\u626b\u63cf"}</div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
      `}</style>
    </div>
  );
}
