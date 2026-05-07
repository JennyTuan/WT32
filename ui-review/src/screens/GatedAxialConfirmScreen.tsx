import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import ScanConfirmScreen from "./ScanConfirmScreen";
import GatingWaveformPanel from "../components/GatingWaveformPanel";
import BreathHoldGuide from "../components/BreathHoldGuide";

type BreathingMode = "free_breathing" | "breath_hold_inspiration";

/**
 * Gated axial screen — supports both free-breathing (phase-gated) and breath-hold modes.
 */
export default function GatedAxialConfirmScreen() {
    const [params] = useSearchParams();
    const breathingMode = (params.get("breathingMode") ?? "free_breathing") as BreathingMode;

    const [phaseStart, setPhaseStart] = useState(30);
    const [phaseEnd, setPhaseEnd] = useState(70);
    const [holdArmed, setHoldArmed] = useState(false);

    const isFreeBreathing = breathingMode === "free_breathing";
    const nextRoute = `/gated-execute?mode=axial&breathingMode=${breathingMode}&phaseStart=${phaseStart}&phaseEnd=${phaseEnd}`;

    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="tomographicScan"
            nextRoute={nextRoute}
            allowBackNavigation={false}
            rightViewportContent={
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
                    <div style={{
                        background: "#0f172a", color: "#e2e8f0",
                        border: "1px solid #1e293b", borderRadius: 10, padding: 12, fontSize: 12,
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                            断层门控 · {isFreeBreathing ? "自由呼吸（相位门控）" : "深吸气屏息"}
                        </div>
                        <div style={{ color: "#94a3b8" }}>
                            {isFreeBreathing
                                ? "系统监测呼吸波形，仅在稳定且处于相位窗口内自动触发曝光。"
                                : "屏息稳定后系统自动开始扫描。"}
                        </div>
                    </div>

                    {isFreeBreathing ? (
                        <GatingWaveformPanel
                            mode="free_breathing"
                            phaseStartPct={phaseStart}
                            phaseEndPct={phaseEnd}
                            onPhaseRangeChange={(s, e) => { setPhaseStart(s); setPhaseEnd(e); }}
                        />
                    ) : (
                        <>
                            <BreathHoldGuide armed={holdArmed} timeoutSeconds={25} amplitudeToleranceMm={2.0} />
                            <GatingWaveformPanel mode="breath_hold" phaseStartPct={0} phaseEndPct={100} readOnly />
                            <button
                                onClick={() => setHoldArmed((v) => !v)}
                                style={{
                                    padding: "8px 12px",
                                    background: holdArmed ? "#7f1d1d" : "#0ea5e9",
                                    color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13,
                                }}
                            >
                                {holdArmed ? "取消屏息引导" : "开始屏息引导（演示）"}
                            </button>
                        </>
                    )}
                </div>
            }
        />
    );
}
