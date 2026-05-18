import type { BreathHoldStage } from "./BreathHoldGuide";

/**
 * Compact breath-hold status indicator. Two layout modes:
 *
 * - **horizontal** (default): one-row bar that sits above a waveform.
 * - **vertical**: a narrow column that sits to the *right* of the waveform,
 *   so the whole DIBH footer collapses to a single waveform-height row.
 *
 * Same information either way: a stage badge (countdown digit or status
 * dot), a colored label, elapsed/timeout/tolerance info, and a progress
 * bar driven by `holdElapsedSec / timeoutSec`.
 */
export default function DibhStatusRow({
    stage,
    countdown,
    holdElapsedSec,
    timeoutSec,
    amplitudeToleranceMm = 2.0,
    vertical = false,
}: {
    stage: BreathHoldStage;
    countdown: number;
    holdElapsedSec: number;
    timeoutSec: number;
    amplitudeToleranceMm?: number;
    vertical?: boolean;
}) {
    const ringColor =
        stage === "stable" || stage === "scanning" ? "#22c55e" :
        stage === "holding" ? "#facc15" :
        stage === "aborted" ? "#ef4444" :
        "#38bdf8";

    const label =
        stage === "countdown" ? "深吸气准备" :
        stage === "holding" ? "屏住呼吸 · 等待稳定" :
        stage === "stable" ? "屏息稳定，触发曝光" :
        stage === "scanning" ? "门控曝光中" :
        stage === "aborted" ? "屏息超时" :
        "等待物理按键";

    const progressPct = Math.min(100, (holdElapsedSec / Math.max(timeoutSec, 0.001)) * 100);
    const showCountdown = stage === "countdown";
    const showElapsed = stage === "holding" || stage === "stable" || stage === "scanning";

    if (vertical) {
        // NOTE: the linear progress bar that used to sit here was removed —
        // scan progress is now visualized on the bed-position strip inside
        // the waveform panel, so the duplicate bar here was redundant and
        // visually competed for attention. Keeping just the stage badge +
        // label + elapsed/tolerance text.
        // `progressPct` is intentionally unused here; suppress lint warning.
        void progressPct;
        return (
            <div className="flex w-[160px] shrink-0 flex-col items-center justify-center gap-2 border-l border-white/10 px-3 py-3">
                <div
                    className="flex h-11 w-11 items-center justify-center rounded-full border-2"
                    style={{
                        borderColor: ringColor,
                        boxShadow: `0 0 10px ${ringColor}55`,
                    }}
                >
                    <span
                        className="text-[16px] font-black leading-none"
                        style={{ color: ringColor }}
                    >
                        {showCountdown ? countdown : "●"}
                    </span>
                </div>
                <div className="text-center">
                    <div className="text-[12px] font-bold leading-tight" style={{ color: ringColor }}>{label}</div>
                    <div className="mt-1 text-[10px] leading-tight text-slate-400">
                        {showElapsed
                            ? `${holdElapsedSec.toFixed(1)} / ${timeoutSec.toFixed(0)} s`
                            : `超时 ${timeoutSec.toFixed(0)} s`}
                    </div>
                    <div className="text-[10px] leading-tight text-slate-400">
                        容差 ±{amplitudeToleranceMm.toFixed(1)} mm
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 px-3 py-2 border-b border-white/10">
            <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
                style={{
                    borderColor: ringColor,
                    boxShadow: `0 0 8px ${ringColor}55`,
                }}
            >
                <span
                    className="text-[12px] font-black leading-none"
                    style={{ color: ringColor }}
                >
                    {showCountdown ? countdown : "●"}
                </span>
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold" style={{ color: ringColor }}>{label}</div>
                <div className="text-[10px] text-slate-400">
                    {showElapsed
                        ? `${holdElapsedSec.toFixed(1)} s · 超时 ${timeoutSec}s · 容差 ±${amplitudeToleranceMm.toFixed(1)} mm`
                        : `超时 ${timeoutSec}s · 容差 ±${amplitudeToleranceMm.toFixed(1)} mm`}
                </div>
            </div>
            <div className="w-[140px] shrink-0">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                        className="h-full transition-[width] duration-100"
                        style={{ width: `${progressPct}%`, background: ringColor }}
                    />
                </div>
            </div>
        </div>
    );
}
