import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ScanConfirmScreen from "./ScanConfirmScreen";
import GatingWaveformPanel from "../components/GatingWaveformPanel";
import BreathHoldGuide from "../components/BreathHoldGuide";

type BreathingMode = "free_breathing" | "breath_hold_inspiration";
type TargetPhase = "max_inspiration" | "max_expiration" | "custom";
type TriggerDirection = "rising" | "falling";

const BED_STEP_MM = 19.2;

const TARGET_PHASE_OPTIONS: { value: TargetPhase; label: string; threshold: number; direction: TriggerDirection }[] = [
    { value: "max_inspiration", label: "最大吸气", threshold: 1.0, direction: "rising" },
    { value: "max_expiration", label: "最大呼气", threshold: -1.0, direction: "falling" },
    { value: "custom", label: "自定义", threshold: 0.5, direction: "rising" },
];

/**
 * Gated axial confirm — supports free-breathing (threshold-crossing) and DIBH branches.
 * Free-breathing branch follows §5 of the gating design doc:
 *   target phase + normalized amplitude threshold + crossing direction + wait timeout.
 *   Bed step is fixed at 19.2 mm (detector collimation), not configurable.
 */
export default function GatedAxialConfirmScreen() {
    const [params] = useSearchParams();
    const breathingMode = (params.get("breathingMode") ?? "free_breathing") as BreathingMode;
    const isFreeBreathing = breathingMode === "free_breathing";

    const [targetPhase, setTargetPhase] = useState<TargetPhase>("max_inspiration");
    const [threshold, setThreshold] = useState<number>(1.0);
    const [direction, setDirection] = useState<TriggerDirection>("rising");
    const [waitTimeoutS, setWaitTimeoutS] = useState<number>(30);
    const [scanLengthMm] = useState<number>(320); // matches胸腔自由呼吸 seed; could be wired to session later
    const [holdArmed, setHoldArmed] = useState(false);

    const totalBeds = useMemo(() => Math.ceil(scanLengthMm / BED_STEP_MM), [scanLengthMm]);

    const handleTargetPhase = (next: TargetPhase) => {
        setTargetPhase(next);
        const preset = TARGET_PHASE_OPTIONS.find((o) => o.value === next);
        if (preset && next !== "custom") {
            setThreshold(preset.threshold);
            setDirection(preset.direction);
        }
    };

    const nextRoute = isFreeBreathing
        ? `/gated-execute?mode=axial&breathingMode=free_breathing` +
          `&threshold=${threshold}&direction=${direction}` +
          `&waitTimeoutS=${waitTimeoutS}&scanLengthMm=${scanLengthMm}`
        : `/gated-execute?mode=axial&breathingMode=${breathingMode}`;

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
                            门控-断层 · {isFreeBreathing ? "自由呼吸" : "深吸气屏息"}
                        </div>
                        <div style={{ color: "#94a3b8", lineHeight: 1.5 }}>
                            {isFreeBreathing
                                ? "波形过阈值时自动触发一次轴扫（19.2 mm），完成后床位推进，等待下一次穿越，重复至覆盖完成。"
                                : "技师对讲指导患者屏息；波形进入平台后启用「启动扫描」按钮。"}
                        </div>
                    </div>

                    {isFreeBreathing ? (
                        <>
                            <GatingWaveformPanel
                                mode="free_breathing"
                                threshold={threshold}
                                direction={direction}
                                onThresholdChange={(v) => {
                                    setThreshold(v);
                                    if (targetPhase !== "custom") setTargetPhase("custom");
                                }}
                            />

                            <div style={{
                                background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 12,
                                display: "flex", flexDirection: "column", gap: 10, fontSize: 12,
                            }}>
                                <Row label="目标相位">
                                    <select
                                        value={targetPhase}
                                        onChange={(e) => handleTargetPhase(e.target.value as TargetPhase)}
                                        style={selectStyle}
                                    >
                                        {TARGET_PHASE_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </Row>
                                <Row label="触发方向">
                                    <select
                                        value={direction}
                                        onChange={(e) => {
                                            setDirection(e.target.value as TriggerDirection);
                                            if (targetPhase !== "custom") setTargetPhase("custom");
                                        }}
                                        style={selectStyle}
                                    >
                                        <option value="rising">上行穿越</option>
                                        <option value="falling">下行穿越</option>
                                    </select>
                                </Row>
                                <Row label="等待超时 (s)">
                                    <input
                                        type="number" min={5} max={120} step={1} value={waitTimeoutS}
                                        onChange={(e) => setWaitTimeoutS(Number(e.target.value))}
                                        style={inputStyle}
                                    />
                                </Row>
                                <Row label="床位步距">
                                    <span style={{ color: "#94a3b8" }}>19.2 mm（探测器准直，不可调）</span>
                                </Row>
                                <Row label="预估触发次数">
                                    <span style={{ color: "#22c55e", fontWeight: 600 }}>{totalBeds} 次</span>
                                    <span style={{ color: "#64748b", marginLeft: 6 }}>
                                        （扫描总长 {scanLengthMm} mm ÷ 19.2，向上取整）
                                    </span>
                                </Row>
                            </div>
                        </>
                    ) : (
                        <>
                            <BreathHoldGuide armed={holdArmed} timeoutSeconds={25} amplitudeToleranceMm={2.0} />
                            <GatingWaveformPanel mode="breath_hold" readOnly />
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

const selectStyle: React.CSSProperties = {
    background: "#0b1220", color: "#e2e8f0", border: "1px solid #334155",
    borderRadius: 4, padding: "3px 8px", fontSize: 12,
};
const inputStyle: React.CSSProperties = {
    width: 72, padding: "2px 6px", background: "#0b1220", color: "#e2e8f0",
    border: "1px solid #334155", borderRadius: 4, fontSize: 12,
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#94a3b8" }}>{label}</span>
            <div>{children}</div>
        </div>
    );
}
