import { useEffect, useRef, useState } from "react";

import { useI18n } from "../lib/i18nContext";

export type BreathHoldStage = "idle" | "countdown" | "holding" | "stable" | "scanning" | "release" | "aborted";

/**
 * Shared DIBH state machine. Separated from BreathHoldGuide so screens that
 * need a compact / custom layout (e.g. the helical DIBH execute panel) can
 * drive their own UI off the same authoritative state, without re-rendering
 * the full circular badge.
 */
export interface BreathHoldStateMachineOptions {
    armed: boolean;
    timeoutSeconds: number;
    forceFailure: boolean;
    onStageChange?: (stage: BreathHoldStage) => void;
    onStableHold?: () => void;
    onAbort?: () => void;
}

export interface BreathHoldStateMachineState {
    stage: BreathHoldStage;
    countdown: number;
    holdElapsed: number;
}

export function useBreathHoldStateMachine(
    opts: BreathHoldStateMachineOptions
): BreathHoldStateMachineState {
    const { armed, timeoutSeconds, forceFailure, onStageChange, onStableHold, onAbort } = opts;
    const [stage, setStage] = useState<BreathHoldStage>("idle");
    const [countdown, setCountdown] = useState(3);
    const [holdElapsed, setHoldElapsed] = useState(0);
    const stageRef = useRef(stage);
    stageRef.current = stage;
    const stableFiredRef = useRef(false);

    useEffect(() => { onStageChange?.(stage); }, [stage, onStageChange]);

    useEffect(() => {
        if (!armed) {
            setStage("idle");
            setCountdown(3);
            setHoldElapsed(0);
            stableFiredRef.current = false;
            return;
        }
        setStage("countdown");
        setCountdown(3);
    }, [armed]);

    useEffect(() => {
        if (stage !== "countdown") return;
        if (countdown <= 0) { setStage("holding"); setHoldElapsed(0); return; }
        const t = window.setTimeout(() => setCountdown((c) => c - 1), 800);
        return () => window.clearTimeout(t);
    }, [stage, countdown]);

    useEffect(() => {
        if (stage !== "holding" && stage !== "stable" && stage !== "scanning") return;
        const id = window.setInterval(() => {
            setHoldElapsed((s) => {
                const next = s + 0.1;
                // Mock stability judgement: stable after 1.0s of hold.
                // forceFailure skips this transition so the guide stays in
                // `holding` until timeoutSeconds expires → onAbort fires.
                if (!stableFiredRef.current && next >= 1.0 && stageRef.current === "holding" && !forceFailure) {
                    stableFiredRef.current = true;
                    setStage("stable");
                    onStableHold?.();
                }
                if (next >= timeoutSeconds) {
                    setStage("aborted");
                    onAbort?.();
                }
                return next;
            });
        }, 100);
        return () => window.clearInterval(id);
    }, [stage, timeoutSeconds, onStableHold, onAbort, forceFailure]);

    return { stage, countdown, holdElapsed };
}

interface BreathHoldGuideProps {
    /** When true, runs the countdown → hold flow. */
    armed: boolean;
    timeoutSeconds?: number;
    amplitudeToleranceMm?: number;
    /**
     * Demo flag: when true, the guide stays in `holding` without ever
     * transitioning to `stable` — simulates a patient who can't maintain a
     * stable plateau. After `timeoutSeconds`, fires `onAbort`. Use this for
     * the first-attempt failure demo.
     */
    forceFailure?: boolean;
    onStageChange?: (stage: BreathHoldStage) => void;
    /** Called once when the system judges the hold stable enough to scan. */
    onStableHold?: () => void;
    /** Reset back to idle. */
    onAbort?: () => void;
}

export default function BreathHoldGuide({
    armed,
    timeoutSeconds = 25,
    amplitudeToleranceMm = 2.0,
    forceFailure = false,
    onStageChange,
    onStableHold,
    onAbort,
}: BreathHoldGuideProps) {
    const { t } = useI18n();
    const { stage, countdown, holdElapsed } = useBreathHoldStateMachine({
        armed,
        timeoutSeconds,
        forceFailure,
        onStageChange,
        onStableHold,
        onAbort,
    });

    const ringColor =
        stage === "stable" || stage === "scanning" ? "#22c55e" :
        stage === "holding" ? "#facc15" :
        stage === "aborted" ? "#ef4444" :
        "#38bdf8";

    const big =
        stage === "countdown" ? String(countdown) :
        stage === "holding" ? t("scanFlow.dibh.holdBreath") :
        stage === "stable" ? t("scanFlow.dibh.maintain") :
        stage === "scanning" ? t("scanFlow.dibh.scanning") :
        stage === "aborted" ? t("scanFlow.dibh.breatheNormally") :
        t("scanFlow.dibh.idle");

    const elapsedStr = holdElapsed.toFixed(1);
    const sub =
        stage === "countdown" ? t("scanFlow.dibh.countdownLabel") :
        stage === "holding" ? t("scanFlow.dibh.holdingSub", { seconds: elapsedStr }) :
        stage === "stable" ? t("scanFlow.dibh.stableSub", { seconds: elapsedStr }) :
        stage === "scanning" ? `${elapsedStr} s` :
        stage === "aborted" ? t("scanFlow.dibh.timeoutAborted") :
        "";

    return (
        <div style={{
            background: "#0f172a",
            color: "#e2e8f0",
            border: "1px solid #1e293b",
            borderRadius: 10,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 14,
        }}>
            <div style={{
                width: 96, height: 96, borderRadius: "50%",
                border: `4px solid ${ringColor}`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                boxShadow: `0 0 14px ${ringColor}55`,
                fontWeight: 700,
                fontSize: stage === "countdown" ? 36 : 16,
                color: ringColor,
            }}>
                {big}
            </div>
            <div style={{ flex: 1, fontSize: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t("scanFlow.dibh.guideTitle")}</div>
                <div style={{ color: "#94a3b8", marginBottom: 6 }}>{sub || "—"}</div>
                <div style={{ display: "flex", gap: 12, color: "#94a3b8" }}>
                    <span>{t("scanFlow.dibh.timeoutLabel", { timeout: timeoutSeconds })}</span>
                    <span>{t("scanFlow.dibh.toleranceLabel", { tolerance: amplitudeToleranceMm })}</span>
                </div>
                <div style={{ marginTop: 8, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                        width: `${Math.min(100, (holdElapsed / timeoutSeconds) * 100)}%`,
                        height: "100%",
                        background: ringColor,
                        transition: "width 0.1s linear",
                    }} />
                </div>
            </div>
        </div>
    );
}
