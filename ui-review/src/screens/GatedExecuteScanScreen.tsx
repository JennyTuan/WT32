import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import GatingWaveformPanel, { type FreeBreathingTelemetry } from "../components/GatingWaveformPanel";
import BreathHoldGuide, { type BreathHoldStage } from "../components/BreathHoldGuide";

type Mode = "helical" | "axial";
type BreathingMode = "free_breathing" | "breath_hold_inspiration" | "breath_hold_expiration";

/**
 * Unified gated scan execution screen with auto-trigger driven by stability state.
 * - Free breathing: fires exposure each time the waveform enters the phase window AND stability=stable.
 * - Breath-hold: fires once when BreathHoldGuide reports stable hold; aborts on timeout.
 */
export default function GatedExecuteScanScreen() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const mode = (params.get("mode") ?? "axial") as Mode;
    const breathingMode = (params.get("breathingMode") ?? "free_breathing") as BreathingMode;
    const phaseStart = Number(params.get("phaseStart") ?? "30");
    const phaseEnd = Number(params.get("phaseEnd") ?? "70");

    const isBreathHold = breathingMode !== "free_breathing";
    const totalSlices = mode === "helical" ? 1 : 16;
    const sliceDurationMs = mode === "helical" ? 8000 : 750;

    const [armed, setArmed] = useState(false);
    const [holdStage, setHoldStage] = useState<BreathHoldStage>("idle");
    const [acquiredSlices, setAcquiredSlices] = useState(0);
    const [completed, setCompleted] = useState(false);
    const [exposureCount, setExposureCount] = useState(0);
    const [lastTrigger, setLastTrigger] = useState<number>(0);
    const [telemetry, setTelemetry] = useState<FreeBreathingTelemetry | null>(null);

    // Free-breathing auto-trigger: fire when telemetry enters window + stable
    useEffect(() => {
        if (!armed || isBreathHold || completed || !telemetry) return;
        if (!telemetry.triggering) return;
        const now = Date.now();
        if (now - lastTrigger < sliceDurationMs + 200) return; // throttle to one fire per slice cycle
        setLastTrigger(now);
        setExposureCount((c) => c + 1);
        setAcquiredSlices((s) => {
            const next = Math.min(totalSlices, s + 1);
            if (next >= totalSlices) setCompleted(true);
            return next;
        });
    }, [telemetry, armed, isBreathHold, completed, lastTrigger, sliceDurationMs, totalSlices]);

    // Breath-hold auto-trigger: when stable, run a single helical sweep / fast burst
    useEffect(() => {
        if (!armed || !isBreathHold || completed) return;
        if (holdStage !== "stable" && holdStage !== "scanning") return;
        if (holdStage === "stable") setExposureCount(1);
        const id = window.setInterval(() => {
            setAcquiredSlices((s) => {
                const next = Math.min(totalSlices, s + 1);
                if (next >= totalSlices) {
                    setCompleted(true);
                    window.clearInterval(id);
                }
                return next;
            });
        }, sliceDurationMs / Math.max(1, totalSlices));
        return () => window.clearInterval(id);
    }, [holdStage, armed, isBreathHold, completed, sliceDurationMs, totalSlices]);

    const progress = (acquiredSlices / totalSlices) * 100;

    const titleText = useMemo(() => {
        const modeLabel = mode === "helical" ? "螺旋门控" : "断层门控";
        const breathLabel = breathingMode === "free_breathing" ? "自由呼吸（相位门控）" : "深吸气屏息";
        return `${modeLabel} · ${breathLabel}`;
    }, [mode, breathingMode]);

    const stabilityLabel = telemetry?.stability === "stable" ? "稳定"
        : telemetry?.stability === "unstable" ? "不稳定"
        : telemetry?.stability === "warming_up" ? "采样中"
        : "—";

    return (
        <div style={{
            background: "#020617", minHeight: "100vh", color: "#e2e8f0",
            padding: 24, fontFamily: "system-ui, sans-serif",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{titleText}</div>
                    <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>
                        系统将根据稳定性自动触发曝光，无需手动确认。
                    </div>
                </div>
                <button
                    onClick={() => navigate(-1)}
                    style={{
                        padding: "8px 14px", background: "#1e293b", color: "#e2e8f0",
                        border: "1px solid #334155", borderRadius: 6, cursor: "pointer",
                    }}
                >返回</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
                {/* Left: waveform + (optional) breath-hold guide */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {isBreathHold && (
                        <BreathHoldGuide
                            armed={armed}
                            timeoutSeconds={25}
                            amplitudeToleranceMm={2.0}
                            onStageChange={setHoldStage}
                        />
                    )}
                    <GatingWaveformPanel
                        mode={isBreathHold ? "breath_hold" : "free_breathing"}
                        phaseStartPct={phaseStart}
                        phaseEndPct={phaseEnd}
                        readOnly
                        onTelemetry={setTelemetry}
                    />

                    {/* Exposure log */}
                    <div style={{
                        background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10,
                        padding: 12, fontSize: 12,
                    }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>触发日志</div>
                        <div style={{ color: "#94a3b8" }}>
                            已触发 <strong style={{ color: "#e2e8f0" }}>{exposureCount}</strong> 次曝光 ·
                            采集层数 <strong style={{ color: "#e2e8f0" }}>{acquiredSlices}/{totalSlices}</strong>
                        </div>
                    </div>
                </div>

                {/* Right: status + controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{
                        background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 14,
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>实时状态</div>
                        <Row label="呼吸稳定性" value={stabilityLabel} accent={telemetry?.stability === "stable" ? "#22c55e" : telemetry?.stability === "unstable" ? "#ef4444" : "#facc15"} />
                        {!isBreathHold && (
                            <>
                                <Row label="相位窗口" value={`${Math.round(phaseStart)}% – ${Math.round(phaseEnd)}%`} />
                                <Row label="窗口内" value={telemetry?.inWindow ? "是" : "否"} />
                                <Row label="振幅 CV" value={telemetry ? `${(telemetry.amplitudeCv * 100).toFixed(1)}%` : "—"} />
                                <Row label="基线漂移" value={telemetry ? `${telemetry.baselineDriftMm.toFixed(1)} mm` : "—"} />
                            </>
                        )}
                        {isBreathHold && <Row label="屏息阶段" value={holdStage} />}
                        <Row label="自动触发" value={(armed && (telemetry?.triggering || holdStage === "scanning" || holdStage === "stable")) ? "进行中" : armed ? "等待稳定" : "未启动"} />
                    </div>

                    <div style={{
                        background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 14,
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>扫描进度</div>
                        <div style={{ height: 10, background: "#1e293b", borderRadius: 5, overflow: "hidden" }}>
                            <div style={{
                                width: `${progress}%`, height: "100%",
                                background: completed ? "#22c55e" : "#0ea5e9",
                                transition: "width 0.2s ease",
                            }} />
                        </div>
                        <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 12 }}>
                            {completed ? "扫描完成" : `${progress.toFixed(0)}%`}
                        </div>
                    </div>

                    {!completed ? (
                        <button
                            onClick={() => setArmed((v) => !v)}
                            style={{
                                padding: "12px 16px",
                                background: armed ? "#7f1d1d" : "#0ea5e9",
                                color: "#fff", border: "none", borderRadius: 6,
                                cursor: "pointer", fontSize: 14, fontWeight: 600,
                            }}
                        >
                            {armed ? "暂停自动触发" : "启用自动触发"}
                        </button>
                    ) : (
                        <button
                            onClick={() => navigate("/image-load")}
                            style={{
                                padding: "12px 16px", background: "#22c55e", color: "#fff",
                                border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600,
                            }}
                        >查看图像</button>
                    )}
                </div>
            </div>
        </div>
    );
}

function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
            <span style={{ color: "#94a3b8" }}>{label}</span>
            <span style={{ color: accent ?? "#e2e8f0", fontWeight: 600 }}>{value}</span>
        </div>
    );
}
