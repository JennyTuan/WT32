import { useSimulatedPhysicalPress } from "./useSimulatedPhysicalPress";

type SimulatedPhysicalButtonSize = "compact" | "default";

type SimulatedPhysicalButtonProps = {
    active?: boolean;
    ariaLabel: string;
    disabled?: boolean;
    onPressEnd?: () => void;
    onPressStart: () => void;
    size?: SimulatedPhysicalButtonSize;
};

type PhysicalButtonStatusDotProps = {
    active?: boolean;
    disabled?: boolean;
    size?: "small" | "default";
};

const sizeClasses: Record<SimulatedPhysicalButtonSize, { button: string; center: string }> = {
    compact: {
        button: "h-[92px] w-[92px] border-[10px]",
        center: "h-[54px] w-[54px]",
    },
    default: {
        button: "h-[118px] w-[118px] border-[12px]",
        center: "h-[70px] w-[70px]",
    },
};

export function PhysicalButtonStatusDot({
    active = false,
    disabled = false,
    size = "default",
}: PhysicalButtonStatusDotProps) {
    const colorClass = disabled
        ? "bg-slate-300"
        : active
            ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.9)]"
            : "bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.75)]";

    return <span className={`${size === "small" ? "h-2 w-2" : "h-2.5 w-2.5"} rounded-full ${colorClass}`} />;
}

export default function SimulatedPhysicalButton({
    active = false,
    ariaLabel,
    disabled = false,
    onPressEnd,
    onPressStart,
    size = "default",
}: SimulatedPhysicalButtonProps) {
    const pressHandlers = useSimulatedPhysicalPress({ disabled, onPressEnd, onPressStart });
    const buttonClass = disabled
        ? "border-[#8A98A8] bg-[radial-gradient(circle_at_38%_30%,#CBD5E1_0%,#94A3B8_54%,#64748B_100%)] opacity-75 cursor-not-allowed"
        : active
            ? "translate-y-[2px] border-[#07533A] bg-[radial-gradient(circle_at_38%_28%,#39E296_0%,#11A66F_46%,#08734D_100%)] shadow-[0_8px_14px_rgba(6,95,70,0.38),inset_0_8px_15px_rgba(0,0,0,0.24)]"
            : "border-[#07533A] bg-[radial-gradient(circle_at_38%_28%,#52F0A6_0%,#14B87A_48%,#08734D_100%)] shadow-[0_16px_28px_rgba(15,23,42,0.25),inset_0_5px_12px_rgba(255,255,255,0.28)] hover:translate-y-[-1px]";
    const dimensions = sizeClasses[size];

    return (
        <button
            type="button"
            aria-label={ariaLabel}
            disabled={disabled}
            {...pressHandlers}
            className={`relative flex touch-none items-center justify-center rounded-full transition-all duration-150 ${dimensions.button} ${buttonClass}`}
        >
            <span className="pointer-events-none absolute -inset-2 rounded-full border border-emerald-300/80" />
            <span className={`${dimensions.center} rounded-full border border-white/25 bg-white/10 shadow-[inset_0_7px_12px_rgba(255,255,255,0.18),inset_0_-8px_14px_rgba(6,95,70,0.22)]`} />
        </button>
    );
}
