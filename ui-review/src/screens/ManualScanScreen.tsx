import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FlipHorizontal2,
  Maximize2,
  Move,
  Play,
  RefreshCw,
  RotateCcw,
  Ruler,
  ScanLine,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import DicomViewer from "../components/DicomViewer";
import PhysicalTriggerGuide, { type PhysicalTriggerStep } from "../components/PhysicalTriggerGuide";
import ServiceModeShell from "../features/service/shared/ServiceModeShell";

const scanModes = [
  { id: "helical", label: "螺旋扫描", desc: "连续进床采集" },
  { id: "axial", label: "断层扫描", desc: "定点分步曝光" },
];

const acquisitionFields: FieldControlProps[] = [
  { label: "管电压 (kV)", value: "120", type: "select", options: ["100", "120", "140"] },
  { label: "管电流 (mA)", value: "200", type: "input" },
  { label: "旋转时间 (s)", value: "1", type: "select", options: ["0.5", "1", "1.5", "2"] },
  { label: "准直器宽度", value: "32*0.6", type: "select", options: ["32*0.6", "16*1.2", "64*0.6"] },
];

const reconFields: (FieldControlProps & { fullWidth?: boolean })[] = [
  { label: "层厚 (mm)", value: "5", type: "input" },
  { label: "层间距 (mm)", value: "5", type: "input" },
  { label: "窗位 (WL)", value: "40", type: "input" },
  { label: "窗宽 (WW)", value: "400", type: "input" },
  { label: "重建视野 (mm)", value: "500", type: "input" },
  { label: "矩阵大小", value: "512", type: "select", options: ["256", "512", "1024"] },
  { label: "重建算法", value: "Standard", type: "select", options: ["Standard", "Bone", "Soft"], fullWidth: true },
];

const extraAcquisitionFields = [
  { label: "螺距 (Pitch)", value: "1" },
  { label: "体位", value: "HFS", select: ["HFS", "FFS", "HFP", "FFP"] },
  { label: "起始位置 (START)", value: "--.-" },
  { label: "结束位置 (END)", value: "--.-" },
  { label: "扫描方向", value: "IN", select: ["IN", "OUT"] },
  { label: "部位", value: "Body", select: ["Body", "Head", "Chest", "Abdomen"] },
];

const viewerTools = [
  { id: "pan", label: "平移", icon: Move },
  { id: "zoom", label: "放大", icon: ZoomIn },
  { id: "zoomout", label: "缩小", icon: ZoomOut },
  { id: "window", label: "调窗", icon: SlidersHorizontal },
  { id: "ruler", label: "测量", icon: Ruler },
  { id: "flip", label: "翻转", icon: FlipHorizontal2 },
  { id: "fit", label: "适合", icon: Maximize2 },
  { id: "reset", label: "重置", icon: RefreshCw },
];

export default function ManualScanScreen() {
  const [activeMode, setActiveMode] = useState("helical");
  const [activePanel, setActivePanel] = useState<"acq" | "recon">("acq");
  const [activeTool, setActiveTool] = useState("pan");
  const [windowCenter] = useState(40);
  const [windowWidth] = useState(400);
  const [physicalGuideVisible, setPhysicalGuideVisible] = useState(false);
  const [manualScanStage, setManualScanStage] = useState<"idle" | "hold" | "press" | "completed">("idle");
  const physicalPressStartedAtRef = useRef<number | null>(null);

  const physicalTriggerSteps = useMemo<PhysicalTriggerStep[]>(
    () => [
      {
        id: "manual-trigger",
        label: "长按模拟物理曝光按键",
        detail: "点击执行扫描后，长按绿色按键至少 0.8 秒。",
        state: manualScanStage === "hold" ? "active" : manualScanStage === "press" || manualScanStage === "completed" ? "done" : "pending",
      },
      {
        id: "manual-execute",
        label: "执行扫描",
        detail: manualScanStage === "completed" ? "模拟扫描完成，未生成患者或检查记录。" : "完成长按后，短按一次绿色按键。",
        state: manualScanStage === "press" ? "active" : manualScanStage === "completed" ? "done" : "pending",
      },
    ],
    [manualScanStage],
  );

  const openPhysicalGuide = () => {
    setManualScanStage("idle");
    physicalPressStartedAtRef.current = null;
    setPhysicalGuideVisible(true);
  };

  const handlePhysicalPressStart = () => {
    if (manualScanStage === "hold" || manualScanStage === "press") {
      physicalPressStartedAtRef.current = Date.now();
    }
  };

  const handlePhysicalPressEnd = () => {
    const startedAt = physicalPressStartedAtRef.current;
    physicalPressStartedAtRef.current = null;
    if (!startedAt) return;
    const heldForMs = Date.now() - startedAt;

    if (manualScanStage === "hold" && heldForMs >= 800) {
      setManualScanStage("press");
    } else if (manualScanStage === "press") {
      setManualScanStage("completed");
      setPhysicalGuideVisible(false);
    }
  };

  return (
    <ServiceModeShell
      currentRoute="/mobile/manual-scan"
      overlays={
        <div className={`absolute bottom-[56px] right-0 top-[68px] z-40 flex items-stretch transition-all duration-300 ${physicalGuideVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
          <PhysicalTriggerGuide
            title="模拟物理按键"
            description="手动扫描未选择患者，仅用于原型界面的模拟采集。"
            guideTitle="按住绿色按键"
            triggerLabel="模拟扫描触发"
            emergencyLabel="紧急停止参考"
            simulatedLabel="原型模拟"
            steps={physicalTriggerSteps}
            onHoldStart={handlePhysicalPressStart}
            onHoldEnd={handlePhysicalPressEnd}
            footer={
              <button
                type="button"
                disabled={manualScanStage !== "idle"}
                onClick={() => setManualScanStage("hold")}
                className="h-10 w-full rounded-lg bg-[#1D8B5D] text-[12px] font-black text-white shadow-[0_8px_16px_rgba(5,150,105,0.24)] transition hover:bg-[#13734B] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {manualScanStage === "idle" ? "执行扫描" : manualScanStage === "completed" ? "模拟扫描完成" : "请完成按键步骤"}
              </button>
            }
            buttonActive={manualScanStage === "hold" || manualScanStage === "press"}
          />
        </div>
      }
    >
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-[#BFD0E4] bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF3F9_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_22px_rgba(148,163,184,0.12)]">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[10px] bg-[#050A19] shadow-[inset_0_0_0_1px_rgba(26,38,66,0.95)]">
            <DicomViewer
              dicomUrl="/dicom/test/SYNO0160.dcm"
              activeTool={activeTool}
              windowCenter={windowCenter}
              windowWidth={windowWidth}
            />

            <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-row gap-1.5 rounded-2xl border border-[#4D94FF]/15 bg-black/30 px-3 py-2 backdrop-blur-sm">
              {viewerTools.map((tool) => {
                const Icon = tool.icon;

                return (
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
                    <Icon size={15} />
                  </button>
                );
              })}
            </div>

            <div className="pointer-events-none absolute bottom-4 left-5 flex flex-col gap-0.5 font-mono text-[10px] font-bold text-[#4D94FF]/40">
              <div>WL: {windowCenter} / WW: {windowWidth}</div>
              <div>SYNO-0160 · HELICAL</div>
            </div>
          </div>

          <div className="mx-3 w-px shrink-0 bg-[linear-gradient(180deg,rgba(191,208,228,0)_0%,rgba(191,208,228,0.95)_10%,rgba(191,208,228,0.95)_90%,rgba(191,208,228,0)_100%)]" />

          <div className="flex h-full w-[260px] flex-col overflow-hidden">
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="mb-3 flex shrink-0 items-center rounded-[14px] bg-white/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <button
                  type="button"
                  onClick={() => setActivePanel("acq")}
                  className={`flex h-[36px] flex-1 items-center justify-center gap-2 rounded-lg text-[12px] font-black transition-all ${
                    activePanel === "acq" ? "bg-white text-[#1E88E5] shadow-sm" : "text-[#64748B]"
                  }`}
                >
                  <ScanLine size={14} />
                  采集参数
                </button>
                <button
                  type="button"
                  onClick={() => setActivePanel("recon")}
                  className={`flex h-[36px] flex-1 items-center justify-center gap-2 rounded-lg text-[12px] font-black transition-all ${
                    activePanel === "recon" ? "bg-white text-[#1E88E5] shadow-sm" : "text-[#64748B]"
                  }`}
                >
                  <RotateCcw size={14} />
                  重建参数
                </button>
              </div>

              <div className="custom-scrollbar flex-1 overflow-y-auto px-1 pb-1">
                <div className="space-y-2 border-b border-[#E2E8F0] pb-3">
                  <div className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    扫描模式
                  </div>
                  <div className="flex items-center gap-2 rounded-[14px] bg-white/75 p-1">
                    {scanModes.map((mode) => {
                      const active = activeMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setActiveMode(mode.id)}
                          className={`flex h-[38px] flex-1 flex-col items-center justify-center rounded-lg border transition-all ${
                            active
                              ? "border-[#BFDBFE] bg-white text-[#1D4ED8] shadow-sm"
                              : "border-transparent text-slate-400 hover:bg-white/50"
                          }`}
                        >
                          <span className="text-[11px] font-black uppercase leading-tight tracking-tighter">
                            {mode.id}
                          </span>
                          <span className="text-[9px] font-bold leading-tight opacity-70">{mode.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activePanel === "acq" ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-3">
                    {acquisitionFields.map((field) => (
                      <FieldControl key={field.label} {...field} />
                    ))}

                    {extraAcquisitionFields.map((field) => (
                      <FieldControl key={field.label} {...field} type={field.select ? "select" : "input"} options={field.select} />
                    ))}

                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-3">
                    {reconFields.map((field) => (
                      <FieldControl key={field.label} {...field} className={field.fullWidth ? "col-span-2" : ""} compact={false} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-1 mt-3 flex shrink-0 justify-center gap-2 px-1">
              <button
                type="button"
                onClick={openPhysicalGuide}
                className="flex h-[38px] min-w-[92px] items-center justify-center gap-2 rounded-[14px] bg-[#4D94FF] px-3.5 text-[12px] font-black uppercase tracking-[0.04em] text-white shadow-[0_10px_20px_rgba(77,148,255,0.24)] transition-all hover:bg-blue-600 active:scale-95"
              >
                <Play size={14} fill="currentColor" />
                扫描
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualScanStage("idle");
                  setPhysicalGuideVisible(false);
                }}
                className="flex h-[38px] min-w-[92px] items-center justify-center gap-2 rounded-[14px] border border-[#C9D8E8] bg-white/88 px-3.5 text-[11px] font-bold text-[#546E7A] transition-all hover:bg-white active:scale-95"
              >
                <RotateCcw size={16} />
                重置
              </button>
            </div>
          </div>
        </div>
      </section>
    </ServiceModeShell>
  );
}

type FieldControlProps = {
  label: string;
  value: string;
  type: "select" | "input";
  options?: string[];
  className?: string;
  compact?: boolean;
};

function FieldControl({
  label,
  value,
  type,
  options,
  className,
  compact = true,
}: FieldControlProps) {
  const controlClassName = compact
    ? "h-[32px] rounded-lg px-2 text-[12px]"
    : "h-[36px] rounded-xl px-3 text-[12px]";
  const labelClassName = compact
    ? "text-[10px] font-black uppercase tracking-wider text-slate-400"
    : "px-0.5 font-sans text-[10px] font-black uppercase tracking-[0.05em] text-slate-400";

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label className={labelClassName}>{label}</label>
      {type === "select" ? (
        <div className="relative">
          <select
            defaultValue={value}
            className={`w-full appearance-none border border-slate-200 bg-white font-bold outline-none transition-all focus:border-[#4D94FF] ${controlClassName}`}
          >
            {options?.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${compact ? "right-2" : "right-3"}`}
          />
        </div>
      ) : (
        <input
          type="text"
          defaultValue={value}
          className={`w-full border border-slate-200 bg-white font-bold outline-none transition-all focus:border-[#4D94FF] ${controlClassName}`}
        />
      )}
    </div>
  );
}
