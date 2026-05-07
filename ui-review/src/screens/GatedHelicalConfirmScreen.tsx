import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import ScanConfirmScreen from "./ScanConfirmScreen";
import GatingWaveformPanel from "../components/GatingWaveformPanel";
import BreathHoldGuide from "../components/BreathHoldGuide";

/**
 * Gated helical screen — only supports breath-hold inspiration (per requirements).
 * Wraps ScanConfirmScreen and injects breath-hold + waveform monitor on the right.
 */
export default function GatedHelicalConfirmScreen() {
    const [params] = useSearchParams();
    const breathingMode = (params.get("breathingMode") ?? "breath_hold_inspiration") as
        "breath_hold_inspiration" | "breath_hold_expiration";
    const [holdArmed, setHoldArmed] = useState(false);

    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="helicalScan"
            nextRoute="/gated-execute?mode=helical&breathingMode=breath_hold_inspiration"
            allowBackNavigation={false}
            rightViewportContent={
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
                    <div style={{
                        background: "#0f172a", color: "#e2e8f0",
                        border: "1px solid #1e293b", borderRadius: 10, padding: 12, fontSize: 12,
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>螺旋门控 · 深吸气屏息</div>
                        <div style={{ color: "#94a3b8" }}>
                            呼吸模式：{breathingMode === "breath_hold_inspiration" ? "深吸气末屏息" : "深呼气末屏息"}
                        </div>
                        <div style={{ color: "#94a3b8" }}>触发策略：屏息稳定后系统自动开始扫描</div>
                    </div>
                    <BreathHoldGuide
                        armed={holdArmed}
                        timeoutSeconds={25}
                        amplitudeToleranceMm={2.0}
                    />
                    <GatingWaveformPanel
                        mode="breath_hold"
                        phaseStartPct={0}
                        phaseEndPct={100}
                        readOnly
                    />
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
                </div>
            }
        />
    );
}
