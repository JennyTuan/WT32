import { CheckCircle } from "lucide-react";

import PhysicalControlPanelSvg from "./PhysicalControlPanelSvg";
import { PhysicalButtonStatusDot } from "./SimulatedPhysicalButton";

export type PhysicalTriggerStepState = "pending" | "active" | "done";

export type PhysicalTriggerStep = {
    id: string;
    label: string;
    detail: string;
    state: PhysicalTriggerStepState;
};

type PhysicalTriggerGuideProps = {
    title: string;
    description: string;
    guideTitle: string;
    triggerLabel: string;
    emergencyLabel: string;
    simulatedLabel: string;
    steps: PhysicalTriggerStep[];
    onHoldStart: () => void;
    onHoldEnd: () => void;
    buttonActive?: boolean;
    disabled?: boolean;
};

const stepClasses: Record<PhysicalTriggerStepState, string> = {
    pending: "border-slate-200 bg-white/60 text-slate-400",
    active: "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-[0_8px_18px_-14px_rgba(5,150,105,0.9)]",
    done: "border-blue-200 bg-blue-50 text-blue-700",
};

export default function PhysicalTriggerGuide({
    title,
    description,
    guideTitle,
    triggerLabel,
    emergencyLabel,
    simulatedLabel,
    steps,
    onHoldStart,
    onHoldEnd,
    buttonActive = false,
    disabled = false,
}: PhysicalTriggerGuideProps) {
    const lampOn = !disabled && steps.some((step) => step.state === "active");

    return (
        <div className="pointer-events-auto flex h-full w-[235px] flex-col overflow-hidden rounded-l-2xl border border-r-0 border-[#CBD5E1] bg-[#E9EEF5] shadow-[-24px_0_48px_rgba(15,23,42,0.22)]">
            <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#F8FAFC_0%,#EEF3F9_100%)] px-5 py-4">
                <div className="text-[14px] font-black text-slate-700">{title}</div>
                <div className="mt-1 text-[11px] font-medium leading-snug text-slate-500">{description}</div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
                <div className="rounded-[18px] border border-[#D6E0EA] bg-[#F8FAFC] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_28px_-24px_rgba(15,23,42,0.75)]">
                    <div className="flex items-center justify-center gap-5">
                        <PhysicalControlPanelSvg
                            active={buttonActive}
                            className="w-[72px]"
                            disabled={disabled}
                            lampOn={lampOn}
                            onPressEnd={onHoldEnd}
                            onPressStart={onHoldStart}
                            panelLabel={`${title} · ${simulatedLabel}`}
                            triggerLabel={triggerLabel}
                        />
                        <div className="flex w-[86px] flex-col items-center gap-3">
                            <div className="flex items-center gap-2">
                                <PhysicalButtonStatusDot active={lampOn} disabled={disabled} />
                                <span className="text-[9px] font-black tracking-[0.08em] text-slate-500">{triggerLabel}</span>
                            </div>
                            <div className="text-center text-[12px] font-black text-[#0F5130]">{triggerLabel}</div>
                            <div className="text-center text-[9px] font-semibold leading-snug text-slate-400">{guideTitle}</div>
                            <div className="w-full border-t border-slate-200 pt-2 text-center text-[8px] font-bold leading-relaxed text-slate-400">
                                <span className="text-red-500">{emergencyLabel}</span>
                                <span className="mx-1">·</span>
                                {simulatedLabel}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-2 grid gap-2">
                    {steps.map((step, index) => (
                        <div key={step.id} className={`flex min-h-[45px] items-center gap-2 rounded-lg border px-2.5 py-2 transition-all ${stepClasses[step.state]}`}>
                            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${step.state === "done" ? "bg-blue-600 text-white" : step.state === "active" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                                {step.state === "done" ? <CheckCircle size={14} /> : index + 1}
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-[11px] font-black leading-tight">{step.label}</div>
                                <div className="mt-0.5 max-h-[22px] overflow-hidden text-[9px] font-semibold leading-tight opacity-80">{step.detail}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
