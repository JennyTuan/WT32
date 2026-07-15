import { AlertTriangle, CheckCircle } from "lucide-react";
import { useRef } from "react";

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
    const activePointerIdRef = useRef<number | null>(null);
    const pointerPressHandledRef = useRef(false);
    const keyboardPressActiveRef = useRef(false);
    const keyboardPressHandledRef = useRef(false);

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (disabled || activePointerIdRef.current !== null) return;
        event.preventDefault();
        activePointerIdRef.current = event.pointerId;
        pointerPressHandledRef.current = true;
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // 部分触控环境不支持指针捕获，仍需继续处理本次按键。
        }
        onHoldStart();
    };

    const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return;
        activePointerIdRef.current = null;
        onHoldEnd();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const handleLostPointerCapture = () => {
        if (activePointerIdRef.current === null) return;
        activePointerIdRef.current = null;
        onHoldEnd();
    };

    const handleClick = () => {
        if (disabled) return;
        if (pointerPressHandledRef.current || keyboardPressHandledRef.current) {
            pointerPressHandledRef.current = false;
            keyboardPressHandledRef.current = false;
            return;
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled || event.repeat || (event.key !== " " && event.key !== "Enter")) return;
        event.preventDefault();
        if (activePointerIdRef.current !== null || keyboardPressActiveRef.current) return;
        keyboardPressActiveRef.current = true;
        keyboardPressHandledRef.current = true;
        onHoldStart();
    };

    const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!keyboardPressActiveRef.current) return;
        keyboardPressActiveRef.current = false;
        onHoldEnd();
    };

    const buttonClass = disabled
        ? "border-[#8A98A8] bg-[radial-gradient(circle_at_38%_30%,#CBD5E1_0%,#94A3B8_54%,#64748B_100%)] opacity-75 cursor-not-allowed"
        : buttonActive
            ? "translate-y-[2px] border-[#09623E] bg-[radial-gradient(circle_at_38%_28%,#39E296_0%,#11A66F_46%,#08734D_100%)] shadow-[0_8px_14px_rgba(6,95,70,0.38),inset_0_8px_15px_rgba(0,0,0,0.24)]"
            : "border-[#0A6A45] bg-[radial-gradient(circle_at_38%_28%,#52F0A6_0%,#14B87A_48%,#08734D_100%)] shadow-[0_16px_28px_rgba(15,23,42,0.25),inset_0_5px_12px_rgba(255,255,255,0.28)] hover:translate-y-[-1px]";

    return (
        <div className="pointer-events-auto flex h-full w-[235px] flex-col overflow-hidden rounded-l-2xl border border-r-0 border-[#CBD5E1] bg-[#E9EEF5] shadow-[-24px_0_48px_rgba(15,23,42,0.22)]">
            <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#F8FAFC_0%,#EEF3F9_100%)] px-5 py-4">
                <div className="text-[14px] font-black text-slate-700">{title}</div>
                <div className="mt-1 text-[11px] font-medium leading-snug text-slate-500">{description}</div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
                <div className="rounded-[18px] border border-[#D6E0EA] bg-[#F8FAFC] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_28px_-24px_rgba(15,23,42,0.75)]">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="flex flex-col items-center gap-1">
                            <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-[5px] border-[#FCA5A5] bg-[radial-gradient(circle,#FFFFFF_34%,#EF4444_36%,#DC2626_74%)] shadow-[0_6px_10px_rgba(127,29,29,0.22)]">
                                <AlertTriangle size={16} className="text-red-600" />
                            </div>
                            <span className="text-[8px] font-black tracking-[0.08em] text-red-500">{emergencyLabel}</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <div className="h-[30px] w-[30px] rounded-full border border-[#CBD5E1] bg-[radial-gradient(circle_at_36%_30%,#F8FAFC_0%,#CBD5E1_58%,#94A3B8_100%)] shadow-[inset_0_2px_4px_rgba(15,23,42,0.18)]" />
                            <span className="text-[8px] font-black tracking-[0.08em] text-slate-400">{simulatedLabel}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${disabled ? "bg-slate-300" : buttonActive ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.9)]" : "bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.75)]"}`} />
                        <span className="text-[9px] font-black tracking-[0.12em] text-slate-500">{triggerLabel}</span>
                    </div>

                    <div className="mt-2 flex flex-col items-center">
                        <button
                            type="button"
                            aria-label={triggerLabel}
                            disabled={disabled}
                            onPointerDown={handlePointerDown}
                            onPointerUp={handlePointerEnd}
                            onPointerCancel={handlePointerEnd}
                            onLostPointerCapture={handleLostPointerCapture}
                            onClick={handleClick}
                            onKeyDown={handleKeyDown}
                            onKeyUp={handleKeyUp}
                            className={`relative flex h-[118px] w-[118px] touch-none items-center justify-center rounded-full border-[12px] transition-all duration-150 ${buttonClass}`}
                        >
                            <div className="h-[72px] w-[72px] rounded-full border border-white/30 bg-white/10 shadow-[inset_0_8px_14px_rgba(255,255,255,0.18),inset_0_-8px_15px_rgba(6,95,70,0.22)]" />
                        </button>
                        <div className="mt-2 text-[12px] font-black text-[#0F5130]">{triggerLabel}</div>
                        <div className="mt-0.5 text-[9px] font-semibold text-slate-400">{guideTitle}</div>
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
