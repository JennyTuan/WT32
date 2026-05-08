import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import GatingWaveformPanel, {
    type FreeBreathingTelemetry,
    type TriggerMarker,
} from "../components/GatingWaveformPanel";
import BreathHoldGuide, { type BreathHoldStage } from "../components/BreathHoldGuide";

type Mode = "helical" | "axial";
type BreathingMode = "free_breathing" | "breath_hold_inspiration" | "breath_hold_expiration";
type TriggerDirection = "rising" | "falling";

type FreeBreathingState =
    | "idle"
    | "waiting_trigger"
    | "exposing"
    | "bed_advance"
    | "completed"
    | "aborted";

const BED_STEP_MM = 19.2;
const EXPOSURE_DURATION_MS = 750;     // simulated single-bed axial scan duration
const BED_ADVANCE_DURATION_MS = 600;  // simulated table movement

/**
 * Gated scan execution.
 *  - free_breathing (axial): threshold-crossing prospective trigger + 19.2mm bed step loop.
 *  - breath-hold (DIBH): existing demo behavior preserved.
 */
export default function GatedExecuteScanScreen() {
    const [params] = useSearchParams();
    const navigate = useNavigate();

    const mode = (params.get("mode") ?? "axial") as Mode;
    const breathingMode = (params.get("breathingMode") ?? "free_breathing") as BreathingMode;
    const isFreeBreathing = breathingMode === "free_breathing";
    const isBreathHold = !isFreeBreathing;

    const threshold = Number(params.get("threshold") ?? "1.0");
    const direction = (params.get("direction") ?? "rising") as TriggerDirection;
    const waitTimeoutS = Number(params.get("waitTimeoutS") ?? "30");
    const scanLengthMm = Number(params.get("scanLengthMm") ?? "320");
    const totalBeds = Math.max(1, Math.ceil(scanLengthMm / BED_STEP_MM));

    // shared
    const [armed, setArmed] = useState(false);

    // free-breathing state machine
    const [fbState, setFbState] = useState<FreeBreathingState>("idle");
    const [completedBeds, setCompletedBeds] = useState(0);
    const [waitStartMs, setWaitStartMs] = useState<number | null>(null);
    const [waitElapsedS, setWaitElapsedS] = useState(0);
    const [timeoutHit, setTimeoutHit] = useState(false);
    const [triggerMarkers, setTriggerMarkers] = useState<TriggerMarker[]>([]);
    const [telemetry, setTelemetry] = useState<FreeBreathingTelemetry | null>(null);
    const sampleCountRef = useRef(0);

    // breath-hold state (single-bed sweep, behavior unchanged)
    const totalSlicesBh = mode === "helical" ? 1 : 16;
    const sliceDurationBh = mode === "helical" ? 8000 : 750;
    const [holdStage, setHoldStage] = useState<BreathHoldStage>("idle");
    const [acquiredSlicesBh, setAcquiredSlicesBh] = useState(0);
    const [bhCompleted, setBhCompleted] = useState(false);

    // ------ free-breathing: arming & wait timer ------
    useEffect(() => {
        if (!isFreeBreathing) return;
        if (armed && fbState === "idle") {
            setFbState("waiting_trigger");
            setWaitStartMs(Date.now());
        }
        if (!armed && (fbState === "waiting_trigger" || fbState === "exposing" || fbState === "bed_advance")) {
            setFbState("idle");
            setWaitStartMs(null);
            setWaitElapsedS(0);
            setTimeoutHit(false);
        }
    }, [armed, fbState, isFreeBreathing]);

    useEffect(() => {
        if (!isFreeBreathing || fbState !== "waiting_trigger" || waitStartMs == null) return;
        const id = window.setInterval(() => {
            const elapsed = (Date.now() - waitStartMs) / 1000;
            setWaitElapsedS(elapsed);
            if (elapsed >= waitTimeoutS) setTimeoutHit(true);
        }, 200);
        return () => window.clearInterval(id);
    }, [fbState, waitStartMs, waitTimeoutS, isFreeBreathing]);

    // count incoming samples so trigger markers can be placed in waveform space
    useEffect(() => {
        if (!telemetry) return;
        sampleCountRef.current += 2; // matches GatingWaveformPanel tick increment
    }, [telemetry]);

    // ------ free-breathing: detect crossing → fire ------
    useEffect(() => {
        if (!isFreeBreathing || fbState !== "waiting_trigger" || !telemetry) return;
        if (!telemetry.crossingNow) return;
        if (telemetry.stability !== "stable") return; // require stability gate

        // record marker, advance state
        setTriggerMarkers((prev) => [
            ...prev.slice(-9),
            { sampleIndex: sampleCountRef.current, value: telemetry.currentValue },
        ]);
        setFbState("exposing");
    }, [telemetry, fbState, isFreeBreathing]);

    // ------ free-breathing: exposing → bed_advance → waiting_trigger / completed ------
    useEffect(() => {
        if (!isFreeBreathing) return;
        if (fbState === "exposing") {
            const id = window.setTimeout(() => {
                setCompletedBeds((b) => {
                    const next = b + 1;
                    if (next >= totalBeds) {
                        setFbState("completed");
                    } else {
                        setFbState("bed_advance");
                    }
                    return next;
                });
            }, EXPOSURE_DURATION_MS);
            return () => window.clearTimeout(id);
        }
        if (fbState === "bed_advance") {
            const id = window.setTimeout(() => {
                setFbState("waiting_trigger");
                setWaitStartMs(Date.now());
                setWaitElapsedS(0);
                setTimeoutHit(false);
            }, BED_ADVANCE_DURATION_MS);
            return () => window.clearTimeout(id);
        }
    }, [fbState, totalBeds, isFreeBreathing]);

    // ------ breath-hold path (preserved) ------
    useEffect(() => {
        if (!isBreathHold || !armed || bhCompleted) return;
        if (holdStage !== "stable" && holdStage !== "scanning") return;
        const id = window.setInterval(() => {
            setAcquiredSlicesBh((s) => {
                const next = Math.min(totalSlicesBh, s + 1);
                if (next >= totalSlicesBh) {
                    setBhCompleted(true);
                    window.clearInterval(id);
                }
                return next;
            });
        }, sliceDurationBh / Math.max(1, totalSlicesBh));
        return () => window.clearInterval(id);
    }, [holdStage, armed, bhCompleted, sliceDurationBh, totalSlicesBh, isBreathHold]);

    const skipCurrentWait = () => {
        if (fbState !== "waiting_trigger") return;
        // jump straight to exposing for the demo, marker uses current value if known
        if (telemetry) {
            setTriggerMarkers((prev) => [
                ...prev.slice(-9),
                { sampleIndex: sampleCountRef.current, value: telemetry.currentValue },
            ]);
        }
        setFbState("exposing");
    };

    const abortScan = () => {
        if (isFreeBreathing) {
            setArmed(false);
            setFbState("aborted");
        } else {
            setArmed(false);
            setBhCompleted(true);
        }
    };

    const completed = isFreeBreathing ? fbState === "completed" : bhCompleted;
    const progress = isFreeBreathing
        ? (completedBeds / totalBeds) * 100
        : (acquiredSlicesBh / totalSlicesBh) * 100;

    const titleText = useMemo(() => {
        const modeLabel = mode === "helical" ? "螺旋门控" : "断层门控";
        const breathLabel = isFreeBreathing ? "自由呼吸" : "深吸气屏息";
        return `${modeLabel} · ${breathLabel}`;
    }, [mode, isFreeBreathing]);

    const fbStateLabel: Record<FreeBreathingState, string> = {
        idle: "未启动",
        waiting_trigger: "等待触发",
        exposing: "扫描中",
        bed_advance: "床位推进中",
        completed: "扫描完成",
        aborted: "已中止",
    };

    const fbStateColor: Record<FreeBreathingState, string> = {
        idle: "#94a3b8",
        waiting_trigger: "#facc15",
        exposing: "#22c55e",
        bed_advance: "#0ea5e9",
        completed: "#22c55e",
        aborted: "#ef4444",
    };

    return (
        <div style={{
            background: "#020617", minHeight: "100vh", color: "#e2e8f0",
            padding: 24, fontFamily: "system-ui, sans-serif",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{titleText}</div>
                    <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>
                        {isFreeBreathing
                            ? `波形过阈值 ${threshold.toFixed(1)} ${direction === "rising" ? "↑上行" : "↓下行"} 时自动触发；床位 19.2 mm 步进。`
                            : "屏息稳定后系统自动触发曝光。"}
                    </div>
                </div>
                <button
                    onClick={() => navigate(-1)}
                    style={{ padding: "8px 14px", background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer" }}
                >返回</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
                {/* Left: waveform */}
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
                        threshold={threshold}
                        direction={direction}
                        readOnly
                        onTelemetry={setTelemetry}
                        triggerMarkers={isFreeBreathing ? triggerMarkers : []}
                    />

                    {/* trigger log */}
                    {isFreeBreathing && (
                        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 12, fontSize: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>触发日志</div>
                            <div style={{ color: "#94a3b8" }}>
                                已触发 <strong style={{ color: "#e2e8f0" }}>{triggerMarkers.length}</strong> 次 ·
                                完成床位 <strong style={{ color: "#e2e8f0" }}>{completedBeds}/{totalBeds}</strong> ·
                                预估覆盖 <strong style={{ color: "#e2e8f0" }}>{(completedBeds * BED_STEP_MM).toFixed(1)} / {scanLengthMm} mm</strong>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: status & controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {isFreeBreathing && (
                        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>实时状态</div>
                            <Row label="当前状态" value={fbStateLabel[fbState]} accent={fbStateColor[fbState]} />
                            <Row label="呼吸稳定性" value={
                                telemetry?.stability === "stable" ? "稳定"
                                : telemetry?.stability === "unstable" ? "不稳定"
                                : telemetry?.stability === "warming_up" ? "采样中" : "—"
                            } accent={
                                telemetry?.stability === "stable" ? "#22c55e"
                                : telemetry?.stability === "unstable" ? "#ef4444" : "#facc15"
                            } />
                            <Row label="阈值 / 方向" value={`${threshold.toFixed(1)} · ${direction === "rising" ? "上行" : "下行"}`} />
                            <Row label="当前值" value={telemetry ? telemetry.currentValue.toFixed(2) : "—"} />
                            <Row label="等待计时"
                                value={fbState === "waiting_trigger" ? `${waitElapsedS.toFixed(1)} / ${waitTimeoutS} s` : "—"}
                                accent={timeoutHit ? "#ef4444" : undefined} />
                        </div>
                    )}

                    {isBreathHold && (
                        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>实时状态</div>
                            <Row label="屏息阶段" value={holdStage} />
                            <Row label="自动触发" value={(armed && (holdStage === "scanning" || holdStage === "stable")) ? "进行中" : armed ? "等待稳定" : "未启动"} />
                        </div>
                    )}

                    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                            {isFreeBreathing ? `床位进度 ${completedBeds}/${totalBeds}` : "扫描进度"}
                        </div>
                        {isFreeBreathing ? (
                            <BedProgressBar total={totalBeds} completed={completedBeds} />
                        ) : (
                            <div style={{ height: 10, background: "#1e293b", borderRadius: 5, overflow: "hidden" }}>
                                <div style={{ width: `${progress}%`, height: "100%", background: completed ? "#22c55e" : "#0ea5e9", transition: "width 0.2s ease" }} />
                            </div>
                        )}
                        <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 12 }}>
                            {completed ? "扫描完成" : `${progress.toFixed(0)}%`}
                        </div>
                    </div>

                    {timeoutHit && fbState === "waiting_trigger" && (
                        <div style={{ background: "#7f1d1d", color: "#fff", padding: 10, borderRadius: 8, fontSize: 12 }}>
                            等待触发已超过 {waitTimeoutS}s。请评估患者呼吸是否规律，可选择「跳过当前等待」或「中止」。
                        </div>
                    )}

                    {!completed && fbState !== "aborted" ? (
                        <>
                            <button
                                onClick={() => setArmed((v) => !v)}
                                style={{
                                    padding: "12px 16px",
                                    background: armed ? "#7f1d1d" : "#0ea5e9",
                                    color: "#fff", border: "none", borderRadius: 6,
                                    cursor: "pointer", fontSize: 14, fontWeight: 600,
                                }}
                            >
                                {armed ? "暂停" : "开始扫描"}
                            </button>
                            {isFreeBreathing && armed && (
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        onClick={skipCurrentWait}
                                        disabled={fbState !== "waiting_trigger"}
                                        style={secondaryBtnStyle(fbState !== "waiting_trigger")}
                                    >跳过当前等待</button>
                                    <button onClick={abortScan} style={dangerBtnStyle}>中止</button>
                                </div>
                            )}
                        </>
                    ) : completed ? (
                        <button
                            onClick={() => navigate("/image-load")}
                            style={{ padding: "12px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600 }}
                        >查看图像</button>
                    ) : (
                        <button
                            onClick={() => navigate(-1)}
                            style={{ padding: "12px 16px", background: "#475569", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600 }}
                        >已中止 · 返回</button>
                    )}
                </div>
            </div>
        </div>
    );
}

function BedProgressBar({ total, completed }: { total: number; completed: number }) {
    const cells = Array.from({ length: total });
    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(total, 24)}, 1fr)`, gap: 2 }}>
            {cells.map((_, i) => (
                <div key={i} style={{
                    height: 14,
                    background: i < completed ? "#22c55e" : i === completed ? "#facc15" : "#1e293b",
                    borderRadius: 2,
                    transition: "background 0.2s ease",
                }} />
            ))}
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

const secondaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
    flex: 1, padding: "10px 12px",
    background: disabled ? "#1e293b" : "#334155",
    color: disabled ? "#64748b" : "#e2e8f0",
    border: "1px solid #475569", borderRadius: 6,
    cursor: disabled ? "default" : "pointer", fontSize: 13,
});
const dangerBtnStyle: React.CSSProperties = {
    flex: 1, padding: "10px 12px", background: "#7f1d1d",
    color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13,
};
