import { useEffect, useMemo, useRef, useState } from "react";

export type GatingBreathingMode = "breath_hold_inspiration" | "breath_hold_expiration" | "free_breathing";

export type StabilityState = "stable" | "unstable" | "warming_up";

export interface FreeBreathingTelemetry {
    cycleCv: number;          // 0..1, e.g. 0.08 = 8% variation
    amplitudeCv: number;
    baselineDriftMm: number;
    stability: StabilityState;
    inWindow: boolean;        // current sample inside phase window?
    triggering: boolean;      // exposure firing right now?
}

interface GatingWaveformPanelProps {
    mode: "free_breathing" | "breath_hold";
    phaseStartPct: number;
    phaseEndPct: number;
    onPhaseRangeChange?: (start: number, end: number) => void;
    stabilityCvThreshold?: number;
    baselineDriftThresholdMm?: number;
    onTelemetry?: (telemetry: FreeBreathingTelemetry) => void;
    /** When true, panel renders as read-only preview (no drag). */
    readOnly?: boolean;
}

const PRESETS = [
    { label: "呼气末 30-70%", start: 30, end: 70 },
    { label: "吸气末 0-20%", start: 0, end: 20 },
    { label: "全相位", start: 0, end: 100 },
] as const;

const SAMPLES = 240; // points across the visible window (~5 cycles)
const CYCLE_SAMPLES = 48;

/**
 * Mock waveform generator (sine-ish breathing trace with mild noise / drift).
 * Returns an array of samples in [0, 1] range where 0 = expiration trough.
 */
function generateWaveform(now: number, jitter: number, drift: number): number[] {
    const out: number[] = [];
    const period = CYCLE_SAMPLES;
    for (let i = 0; i < SAMPLES; i++) {
        const t = (now + i) / period;
        const base = 0.5 - 0.45 * Math.cos(2 * Math.PI * t);
        const noise = (Math.sin(t * 17.3) * 0.03 + Math.sin(t * 5.7) * 0.02) * jitter;
        const driftTerm = drift * (i / SAMPLES) * 0.15;
        out.push(Math.max(0, Math.min(1, base + noise + driftTerm)));
    }
    return out;
}

export default function GatingWaveformPanel({
    mode,
    phaseStartPct,
    phaseEndPct,
    onPhaseRangeChange,
    stabilityCvThreshold = 0.15,
    baselineDriftThresholdMm = 5.0,
    onTelemetry,
    readOnly = false,
}: GatingWaveformPanelProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [tick, setTick] = useState(0);
    const [dragging, setDragging] = useState<"start" | "end" | null>(null);

    // Mock instability that toggles every ~12 seconds for demo of auto-trigger
    const noisePhase = Math.floor(tick / 600) % 3; // 0/1/2 cycles
    const jitter = noisePhase === 1 ? 1.6 : 0.6;
    const drift = noisePhase === 2 ? 1.2 : 0.2;

    useEffect(() => {
        const id = window.setInterval(() => setTick((t) => t + 2), 50);
        return () => window.clearInterval(id);
    }, []);

    const samples = useMemo(() => generateWaveform(tick, jitter, drift), [tick, jitter, drift]);

    const stability: StabilityState = useMemo(() => {
        // Compute simple amplitude CV over the visible buffer
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
        const cv = Math.sqrt(variance) / Math.max(0.01, mean);
        const baselineDrift = Math.abs(samples[samples.length - 1] - samples[0]) * 30; // mm-scale mock
        if (tick < 80) return "warming_up";
        if (cv > stabilityCvThreshold * 4 || baselineDrift > baselineDriftThresholdMm) return "unstable";
        return "stable";
    }, [samples, stabilityCvThreshold, baselineDriftThresholdMm, tick]);

    // Current sample position % within most recent cycle
    const currentPhasePct = useMemo(() => {
        return ((tick % CYCLE_SAMPLES) / CYCLE_SAMPLES) * 100;
    }, [tick]);

    const inWindow = currentPhasePct >= phaseStartPct && currentPhasePct <= phaseEndPct;
    const triggering = mode === "free_breathing" && stability === "stable" && inWindow;

    useEffect(() => {
        if (!onTelemetry) return;
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
        const cv = Math.sqrt(variance) / Math.max(0.01, mean);
        onTelemetry({
            cycleCv: cv * 0.6,
            amplitudeCv: cv,
            baselineDriftMm: Math.abs(samples[samples.length - 1] - samples[0]) * 30,
            stability,
            inWindow,
            triggering,
        });
    }, [samples, stability, inWindow, triggering, onTelemetry]);

    const width = 520;
    const height = 140;
    const path = useMemo(() => {
        const stepX = width / (SAMPLES - 1);
        return samples
            .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${(height - 12 - v * (height - 24)).toFixed(1)}`)
            .join(" ");
    }, [samples]);

    const handleHandleDown = (which: "start" | "end") => (e: React.PointerEvent) => {
        if (readOnly || mode !== "free_breathing") return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(which);
    };
    const handleHandleMove = (e: React.PointerEvent) => {
        if (!dragging || !svgRef.current || !onPhaseRangeChange) return;
        const rect = svgRef.current.getBoundingClientRect();
        const cycleWidthPx = (width / SAMPLES) * CYCLE_SAMPLES;
        // Use the most recent full visible cycle band as the reference for picking
        const bandLeft = rect.right - cycleWidthPx;
        const x = e.clientX - bandLeft;
        const pct = Math.max(0, Math.min(100, (x / cycleWidthPx) * 100));
        if (dragging === "start") onPhaseRangeChange(Math.min(pct, phaseEndPct - 5), phaseEndPct);
        else onPhaseRangeChange(phaseStartPct, Math.max(pct, phaseStartPct + 5));
    };
    const handleHandleUp = () => setDragging(null);

    // Draw repeating phase window over each visible cycle
    const cycleCount = Math.ceil(SAMPLES / CYCLE_SAMPLES);
    const cycleStartPx = (idx: number) => (idx * CYCLE_SAMPLES * width) / SAMPLES;
    const cyclePx = (CYCLE_SAMPLES * width) / SAMPLES;

    const stabilityColor = stability === "stable" ? "#22c55e" : stability === "unstable" ? "#ef4444" : "#facc15";
    const stabilityText = stability === "stable" ? "稳定 · 触发就绪" : stability === "unstable" ? "不稳定 · 已暂停触发" : "采样中…";

    return (
        <div style={{
            background: "#0f172a",
            color: "#e2e8f0",
            border: "1px solid #1e293b",
            borderRadius: 10,
            padding: 14,
            fontSize: 12,
            width: "100%",
            boxSizing: "border-box",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                    呼吸门控信号
                    <span style={{ marginLeft: 8, color: "#94a3b8", fontWeight: 400 }}>
                        {mode === "free_breathing" ? "自由呼吸 · 相位门控" : "屏息监测"}
                    </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                        width: 10, height: 10, borderRadius: 999,
                        background: stabilityColor,
                        boxShadow: `0 0 8px ${stabilityColor}`,
                    }} />
                    <span style={{ color: stabilityColor, fontWeight: 600 }}>{stabilityText}</span>
                </div>
            </div>

            <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                style={{ width: "100%", height: 140, display: "block", touchAction: "none" }}
                onPointerMove={handleHandleMove}
                onPointerUp={handleHandleUp}
            >
                {/* gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
                    <line key={i} x1={0} x2={width} y1={12 + g * (height - 24)} y2={12 + g * (height - 24)}
                        stroke="#1e293b" strokeWidth={1} />
                ))}

                {/* phase windows per cycle (only for free_breathing) */}
                {mode === "free_breathing" &&
                    Array.from({ length: cycleCount }).map((_, idx) => {
                        const baseX = cycleStartPx(idx);
                        const x1 = baseX + (phaseStartPct / 100) * cyclePx;
                        const x2 = baseX + (phaseEndPct / 100) * cyclePx;
                        return (
                            <rect
                                key={idx}
                                x={x1}
                                y={4}
                                width={Math.max(0, x2 - x1)}
                                height={height - 8}
                                fill="#22c55e"
                                opacity={0.18}
                            />
                        );
                    })}

                {/* waveform */}
                <path d={path} stroke={triggering ? "#22c55e" : "#38bdf8"} strokeWidth={1.7} fill="none" />

                {/* current position marker (last sample) */}
                <circle
                    cx={width - 2}
                    cy={height - 12 - samples[samples.length - 1] * (height - 24)}
                    r={3.5}
                    fill={triggering ? "#22c55e" : inWindow ? "#facc15" : "#38bdf8"}
                />

                {/* drag handles on the LAST cycle band */}
                {mode === "free_breathing" && !readOnly && (() => {
                    const lastBaseX = width - cyclePx;
                    const x1 = lastBaseX + (phaseStartPct / 100) * cyclePx;
                    const x2 = lastBaseX + (phaseEndPct / 100) * cyclePx;
                    return (
                        <>
                            <rect x={x1 - 3} y={2} width={6} height={height - 4} fill="#22c55e" opacity={0.85}
                                style={{ cursor: "ew-resize" }} onPointerDown={handleHandleDown("start")} />
                            <rect x={x2 - 3} y={2} width={6} height={height - 4} fill="#22c55e" opacity={0.85}
                                style={{ cursor: "ew-resize" }} onPointerDown={handleHandleDown("end")} />
                        </>
                    );
                })()}
            </svg>

            {mode === "free_breathing" && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                    <span style={{ color: "#94a3b8" }}>相位窗口</span>
                    <input
                        type="number" min={0} max={phaseEndPct - 5} value={Math.round(phaseStartPct)}
                        disabled={readOnly}
                        onChange={(e) => onPhaseRangeChange?.(Number(e.target.value), phaseEndPct)}
                        style={{ width: 56, padding: "2px 6px", background: "#0b1220", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4 }}
                    />
                    <span>—</span>
                    <input
                        type="number" min={phaseStartPct + 5} max={100} value={Math.round(phaseEndPct)}
                        disabled={readOnly}
                        onChange={(e) => onPhaseRangeChange?.(phaseStartPct, Number(e.target.value))}
                        style={{ width: 56, padding: "2px 6px", background: "#0b1220", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4 }}
                    />
                    <span style={{ color: "#94a3b8" }}>%</span>
                    <div style={{ flex: 1 }} />
                    {PRESETS.map((p) => (
                        <button
                            key={p.label}
                            disabled={readOnly}
                            onClick={() => onPhaseRangeChange?.(p.start, p.end)}
                            style={{
                                padding: "3px 8px",
                                background: "#1e293b",
                                color: "#e2e8f0",
                                border: "1px solid #334155",
                                borderRadius: 4,
                                cursor: readOnly ? "default" : "pointer",
                                fontSize: 11,
                            }}
                        >{p.label}</button>
                    ))}
                </div>
            )}
        </div>
    );
}
