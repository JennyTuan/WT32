import { useEffect, useMemo, useRef, useState } from "react";

export type GatingBreathingMode = "breath_hold_inspiration" | "breath_hold_expiration" | "free_breathing";
export type StabilityState = "stable" | "unstable" | "warming_up";
export type TriggerDirection = "rising" | "falling";

export interface FreeBreathingTelemetry {
    cycleCv: number;
    amplitudeCv: number;
    baselineDriftMm: number;
    stability: StabilityState;
    /** True for exactly one tick when the waveform crosses threshold in target direction. */
    crossingNow: boolean;
    /** Last sample value in normalized [-1.5, +1.5]-ish scale. */
    currentValue: number;
}

export interface TriggerMarker {
    /** Sample index (within visible buffer) where trigger fired. */
    sampleIndex: number;
    /** Normalized amplitude at fire moment. */
    value: number;
}

interface GatingWaveformPanelProps {
    mode: "free_breathing" | "breath_hold";
    /** Threshold in normalized amplitude (typ. -2..+2; +1 = avg max inspiration). */
    threshold?: number;
    direction?: TriggerDirection;
    onThresholdChange?: (value: number) => void;
    onTelemetry?: (telemetry: FreeBreathingTelemetry) => void;
    /** Markers (in sample-index space) of recent triggers, drawn as colored dots. */
    triggerMarkers?: TriggerMarker[];
    stabilityCvThreshold?: number;
    baselineDriftThresholdMm?: number;
    readOnly?: boolean;
    /** Optional bed-position strip rendered as a footer inside the same panel. */
    bedStrip?: { total: number; completed?: number };
}

const SAMPLES = 240;
const CYCLE_SAMPLES = 48;

/**
 * Mock waveform: returns normalized amplitudes around 0, where +1 ≈ avg max inspiration,
 * -1 ≈ avg max expiration. Range roughly [-1.2, +1.2].
 */
function generateWaveform(now: number, jitter: number, drift: number): number[] {
    const out: number[] = [];
    const period = CYCLE_SAMPLES;
    for (let i = 0; i < SAMPLES; i++) {
        const t = (now + i) / period;
        // sine-ish breathing in [-1, +1]
        const base = -Math.cos(2 * Math.PI * t);
        const noise = (Math.sin(t * 17.3) * 0.06 + Math.sin(t * 5.7) * 0.04) * jitter;
        const driftTerm = drift * (i / SAMPLES) * 0.2;
        out.push(base + noise + driftTerm);
    }
    return out;
}

function findWaveExtrema(samples: number[]) {
    const extrema: { index: number; value: number; type: "peak" | "valley" }[] = [];
    const radius = 5;
    const minSpacing = Math.floor(CYCLE_SAMPLES * 0.42);
    let lastIndex = -minSpacing;

    for (let i = radius; i < samples.length - radius; i += 1) {
        const value = samples[i];
        const neighborhood = samples.slice(i - radius, i + radius + 1);
        const isPeak = value === Math.max(...neighborhood) && value > 0.72;
        const isValley = value === Math.min(...neighborhood) && value < -0.72;

        if ((isPeak || isValley) && i - lastIndex >= minSpacing) {
            extrema.push({ index: i, value, type: isPeak ? "peak" : "valley" });
            lastIndex = i;
        }
    }

    return extrema;
}

export default function GatingWaveformPanel({
    mode,
    threshold = 1.0,
    direction = "rising",
    onThresholdChange,
    onTelemetry,
    triggerMarkers = [],
    bedStrip,
    stabilityCvThreshold = 0.15,
    baselineDriftThresholdMm = 5.0,
    readOnly = false,
}: GatingWaveformPanelProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [tick, setTick] = useState(0);
    const [draggingThreshold, setDraggingThreshold] = useState(false);
    const prevValueRef = useRef<number>(0);
    const prevCrossingTickRef = useRef<number>(-9999);

    // demo instability cycling
    const noisePhase = Math.floor(tick / 600) % 3;
    const jitter = noisePhase === 1 ? 1.6 : 0.6;
    const drift = noisePhase === 2 ? 1.2 : 0.2;

    useEffect(() => {
        const id = window.setInterval(() => setTick((t) => t + 2), 50);
        return () => window.clearInterval(id);
    }, []);

    const samples = useMemo(() => generateWaveform(tick, jitter, drift), [tick, jitter, drift]);

    const stability: StabilityState = useMemo(() => {
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
        const cv = Math.sqrt(variance) / Math.max(0.05, Math.abs(mean) + 0.5);
        const baselineDrift = Math.abs(samples[samples.length - 1] - samples[0]) * 30;
        if (tick < 80) return "warming_up";
        if (cv > stabilityCvThreshold * 4 || baselineDrift > baselineDriftThresholdMm) return "unstable";
        return "stable";
    }, [samples, stabilityCvThreshold, baselineDriftThresholdMm, tick]);

    const currentValue = samples[samples.length - 1];
    const prevValue = prevValueRef.current;

    // Detect threshold crossing in configured direction (debounced ~one cycle)
    const crossingNow = useMemo(() => {
        const debounceTicks = CYCLE_SAMPLES / 2;
        if (tick - prevCrossingTickRef.current < debounceTicks) return false;
        if (direction === "rising") {
            return prevValue < threshold && currentValue >= threshold;
        }
        return prevValue > threshold && currentValue <= threshold;
    }, [currentValue, prevValue, threshold, direction, tick]);

    useEffect(() => {
        prevValueRef.current = currentValue;
        if (crossingNow) prevCrossingTickRef.current = tick;
    }, [currentValue, crossingNow, tick]);

    useEffect(() => {
        if (!onTelemetry) return;
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
        const cv = Math.sqrt(variance) / Math.max(0.05, Math.abs(mean) + 0.5);
        onTelemetry({
            cycleCv: cv * 0.6,
            amplitudeCv: cv,
            baselineDriftMm: Math.abs(samples[samples.length - 1] - samples[0]) * 30,
            stability,
            crossingNow,
            currentValue,
        });
    }, [samples, stability, crossingNow, currentValue, onTelemetry]);

    // SVG geometry: y axis maps amplitude in [-1.5, +1.5] to pixels
    const width = 520;
    const height = 160;
    const yMin = -1.5;
    const yMax = 1.5;
    const yToPx = (v: number) => {
        const clamped = Math.max(yMin, Math.min(yMax, v));
        return 12 + ((yMax - clamped) / (yMax - yMin)) * (height - 24);
    };
    const pxToY = (px: number) => {
        const clamped = Math.max(12, Math.min(height - 12, px));
        return yMax - ((clamped - 12) / (height - 24)) * (yMax - yMin);
    };

    const path = useMemo(() => {
        const stepX = width / (SAMPLES - 1);
        return samples
            .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${yToPx(v).toFixed(1)}`)
            .join(" ");
    }, [samples]);
    const extrema = useMemo(() => findWaveExtrema(samples), [samples]);

    const handlePointerDown = (e: React.PointerEvent<SVGRectElement>) => {
        if (readOnly || mode !== "free_breathing") return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDraggingThreshold(true);
    };
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!draggingThreshold || !svgRef.current || !onThresholdChange) return;
        const rect = svgRef.current.getBoundingClientRect();
        const localY = ((e.clientY - rect.top) / rect.height) * height;
        const v = pxToY(localY);
        const rounded = Math.max(-2, Math.min(2, Math.round(v * 10) / 10));
        onThresholdChange(rounded);
    };
    const handlePointerUp = () => setDraggingThreshold(false);

    const stepX = width / (SAMPLES - 1);
    const stabilityColor = stability === "stable" ? "#22c55e" : stability === "unstable" ? "#ef4444" : "#facc15";
    const stabilityText = stability === "stable" ? "稳定" : stability === "unstable" ? "不稳定" : "采样中…";

    const thresholdY = yToPx(threshold);
    const yPlus1 = yToPx(1);
    const yMinus1 = yToPx(-1);
    const yZero = yToPx(0);

    return (
        <div style={{
            background: "#0f172a", color: "#e2e8f0",
            border: "1px solid #1e293b", borderRadius: 10, padding: 14, fontSize: 12,
            width: "100%", boxSizing: "border-box",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                    呼吸波形
                    <span style={{ marginLeft: 8, color: "#94a3b8", fontWeight: 400 }}>
                        {mode === "free_breathing" ? "自由呼吸 · 阈值穿越触发" : "屏息监测"}
                    </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: stabilityColor, boxShadow: `0 0 8px ${stabilityColor}` }} />
                    <span style={{ color: stabilityColor, fontWeight: 600 }}>{stabilityText}</span>
                </div>
            </div>

            <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                style={{ width: "100%", height: 160, display: "block", touchAction: "none" }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                {/* +1 / 0 / -1 reference lines */}
                <line x1={0} x2={width} y1={yPlus1} y2={yPlus1} stroke="#475569" strokeWidth={1} strokeDasharray="3 3" />
                <line x1={0} x2={width} y1={yZero} y2={yZero} stroke="#1e293b" strokeWidth={1} />
                <line x1={0} x2={width} y1={yMinus1} y2={yMinus1} stroke="#475569" strokeWidth={1} strokeDasharray="3 3" />
                <text x={4} y={yPlus1 - 2} fill="#64748b" fontSize={9}>+1 平均最大吸气</text>
                <text x={4} y={yMinus1 + 10} fill="#64748b" fontSize={9}>-1 平均最大呼气</text>

                {/* threshold line (free_breathing only) */}
                {mode === "free_breathing" && (
                    <>
                        <line x1={0} x2={width} y1={thresholdY} y2={thresholdY}
                            stroke="#22c55e" strokeWidth={2} />
                        <text x={width - 60} y={thresholdY - 4} fill="#22c55e" fontSize={10} fontWeight={600}>
                            阈值 {threshold.toFixed(1)} ↑{direction === "rising" ? "上行" : "下行"}
                        </text>
                        {/* drag hit area */}
                        <rect x={0} y={thresholdY - 8} width={width} height={16} fill="transparent"
                            style={{ cursor: readOnly ? "default" : "ns-resize" }}
                            onPointerDown={handlePointerDown} />
                    </>
                )}

                {/* waveform */}
                <path d={path} stroke="#38bdf8" strokeWidth={1.7} fill="none" />

                {extrema.map((point) => (
                    <circle
                        key={`${point.type}-${point.index}`}
                        cx={point.index * stepX}
                        cy={yToPx(point.value)}
                        r={4}
                        fill={point.type === "peak" ? "#ef4444" : "#2563eb"}
                        stroke="#0f172a"
                        strokeWidth={1.4}
                    />
                ))}

                {/* current marker */}
                <circle cx={width - 2} cy={yToPx(currentValue)} r={3.5}
                    fill={crossingNow ? "#22c55e" : "#38bdf8"} />

                {/* trigger markers */}
                {mode === "free_breathing" && triggerMarkers.map((m, i) => {
                    const visibleIdx = m.sampleIndex - (tick - SAMPLES + 1);
                    if (visibleIdx < 0 || visibleIdx >= SAMPLES) return null;
                    return (
                        <circle key={i} cx={visibleIdx * stepX} cy={yToPx(m.value)} r={4}
                            fill="#22c55e" stroke="#052e16" strokeWidth={1} />
                    );
                })}
            </svg>

            {mode === "free_breathing" && !readOnly && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                    <span style={{ color: "#94a3b8" }}>阈值</span>
                    <input
                        type="number" min={-2} max={2} step={0.1} value={threshold}
                        onChange={(e) => onThresholdChange?.(Number(e.target.value))}
                        style={{ width: 64, padding: "2px 6px", background: "#0b1220", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4 }}
                    />
                    <span style={{ color: "#94a3b8" }}>(归一化 −2 到 +2)</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ color: "#94a3b8" }}>方向</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 600 }}>
                        {direction === "rising" ? "上行穿越" : "下行穿越"}
                    </span>
                </div>
            )}

            {bedStrip && bedStrip.total > 0 && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    marginTop: 10, paddingTop: 8, borderTop: "1px solid #1e293b",
                }}>
                    <span style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        床位示意
                    </span>
                    <div style={{ display: "flex", flex: 1, gap: 2, alignItems: "flex-end", height: 12 }}>
                        {Array.from({ length: bedStrip.total }).map((_, i) => {
                            const done = i < (bedStrip.completed ?? 0);
                            return (
                                <div
                                    key={i}
                                    title={`床位 ${i + 1}`}
                                    style={{
                                        flex: 1, height: 6, borderRadius: 2,
                                        background: done ? "#3b82f6" : "#1e293b",
                                    }}
                                />
                            );
                        })}
                    </div>
                    <span style={{ color: "#e2e8f0", fontFamily: "monospace", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {bedStrip.completed ?? 0}/{bedStrip.total}
                    </span>
                </div>
            )}
        </div>
    );
}
