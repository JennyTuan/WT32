import { useI18n } from "../lib/i18nContext";
import { useBreathHoldStateMachine, type BreathHoldStage } from "./useBreathHoldStateMachine";

interface BreathHoldGuideProps {
    armed: boolean;
    timeoutSeconds?: number;
    amplitudeToleranceMm?: number;
    forceFailure?: boolean;
    onStageChange?: (stage: BreathHoldStage) => void;
    onStableHold?: () => void;
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
                width: 96,
                height: 96,
                borderRadius: "50%",
                border: `4px solid ${ringColor}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 14px ${ringColor}55`,
                fontWeight: 700,
                fontSize: stage === "countdown" ? 36 : 16,
                color: ringColor,
            }}>
                {big}
            </div>
            <div style={{ flex: 1, fontSize: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t("scanFlow.dibh.guideTitle")}</div>
                <div style={{ color: "#94a3b8", marginBottom: 6 }}>{sub || "-"}</div>
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
