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
    /**
     * Bed-coverage strip footer (helical version of 4D-CT's 床位进度 bar).
     * Divides the scan length into discrete `床位` segments of `bedTravelMm`
     * (default 19.2 mm, matching the 4D / gated-axial system convention) and
     * renders each as a numbered cell. All cells appear in the "planned"
     * state on the confirm screen since no scan is in progress.
     *
     * `startMm` / `endMm` (optional) are surfaced as small Z annotations on
     * the strip endpoints so the technician still sees the absolute bed
     * coordinates.
     */
    zRangeStrip?: {
        scanLengthMm: number;
        bedTravelMm?: number;
        startMm?: number;
        endMm?: number;
        /** Number of fully-scanned segments (filled solid blue). */
        completedSegments?: number;
        /** Index (0-based) of the currently-scanning segment (light blue pulse). */
        activeSegment?: number;
    };
    /**
     * When true, reserves a thin track at the bottom of the waveform SVG
     * to render the binary gate signal (0 / 1 step function). Use this on
     * the execute screen during a gated scan; off by default for the confirm
     * screens where there is nothing to show yet.
     */
    gateTrack?: boolean;
    /**
     * Draws a horizontal tolerance band (semi-transparent) around a target
     * amplitude so the technician can see whether the breath-hold plateau is
     * sitting inside the allowed window. Used during DIBH execution.
     */
    holdTolerance?: {
        /** Target normalized amplitude (e.g. +1 for max inspiration). */
        target: number;
        /** Half-width of the tolerance band in normalized amplitude units. */
        halfWidth: number;
        /** Display label, e.g. "±2.0 mm". */
        label?: string;
    };
    /**
     * When true, marks the waveform region covered since the gate opened as
     * "exposure in progress". Internal sample index of the gate-open moment
     * is tracked across renders so the highlighted span extends in real time.
     */
    exposing?: boolean;
    /**
     * When true, drops the card chrome (background, border, rounded corners,
     * outer padding) so the panel can sit seamlessly inside an already-dark
     * container (e.g. an execute / confirm right pane). Header + waveform SVG
     * are still rendered; SVG height is reduced for a more compact footprint.
     */
    bare?: boolean;
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
    zRangeStrip,
    holdTolerance,
    exposing = false,
    gateTrack = false,
    stabilityCvThreshold = 0.15,
    baselineDriftThresholdMm = 5.0,
    readOnly = false,
    bare = false,
}: GatingWaveformPanelProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [tick, setTick] = useState(0);
    const [draggingThreshold, setDraggingThreshold] = useState(false);
    const prevValueRef = useRef<number>(0);
    const prevCrossingTickRef = useRef<number>(-9999);
    // Snapshot the sample index where the exposure gate opened so we can
    // render the "曝光中" band across the waveform as time advances. Reset
    // when `exposing` flips back to false.
    const exposureStartTickRef = useRef<number | null>(null);
    // Measure the SVG's actual rendered pixel size so the viewBox matches 1:1
    // and the waveform fills the container width. Without this, the default
    // `preserveAspectRatio="xMidYMid meet"` would letter-box the 520-wide
    // viewBox inside a wider container, leaving big empty strips on either
    // side. Driving viewBox from measured size keeps text glyphs and trigger
    // dots at their natural visual size (no horizontal stretch).
    const [measuredWidth, setMeasuredWidth] = useState(520);
    useEffect(() => {
        const el = svgRef.current;
        if (!el) return;
        const update = () => {
            const w = el.clientWidth;
            if (w > 0) setMeasuredWidth(w);
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

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
        if (exposing) {
            if (exposureStartTickRef.current === null) {
                exposureStartTickRef.current = tick;
            }
        } else {
            exposureStartTickRef.current = null;
        }
    }, [exposing, tick]);

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

    // SVG geometry: y axis maps amplitude in [-1.5, +1.5] to pixels. Width
    // tracks the rendered pixel width so the viewBox is 1:1 with the screen;
    // height tracks the actual rendered svg height (bare = 110, regular = 160)
    // so vertical proportions are also pixel-accurate.
    //
    // When `gateTrack` is enabled, the bottom ~22 px are reserved for the
    // binary gate-signal step waveform; the analog respiratory waveform is
    // squeezed into the area above it.
    const width = measuredWidth;
    const height = bare ? 110 : 160;
    const GATE_TRACK_HEIGHT = 22;
    const analogBottom = gateTrack ? height - GATE_TRACK_HEIGHT : height;
    const yMin = -1.5;
    const yMax = 1.5;
    const yToPx = (v: number) => {
        const clamped = Math.max(yMin, Math.min(yMax, v));
        return 12 + ((yMax - clamped) / (yMax - yMin)) * (analogBottom - 24);
    };
    const pxToY = (px: number) => {
        const clamped = Math.max(12, Math.min(analogBottom - 12, px));
        return yMax - ((clamped - 12) / (analogBottom - 24)) * (yMax - yMin);
    };
    // Gate-track geometry: low = bottom edge, high = top edge of the track.
    const gateLowY = height - 4;
    const gateHighY = analogBottom + 4;

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

    const containerStyle = bare
        ? {
            color: "#e2e8f0",
            fontSize: 12,
            width: "100%",
            boxSizing: "border-box" as const,
        }
        : {
            background: "#0f172a",
            color: "#e2e8f0",
            border: "1px solid #1e293b",
            borderRadius: 10,
            padding: 14,
            fontSize: 12,
            width: "100%",
            boxSizing: "border-box" as const,
        };
    const headerMarginBottom = bare ? 4 : 8;
    const headerTitleSize = bare ? 12 : 13;

    return (
        <div style={containerStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: headerMarginBottom }}>
                <div style={{ fontSize: headerTitleSize, fontWeight: 600 }}>
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
                style={{ width: "100%", height, display: "block", touchAction: "none" }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                {/* +1 / 0 / -1 reference lines */}
                <line x1={0} x2={width} y1={yPlus1} y2={yPlus1} stroke="#475569" strokeWidth={1} strokeDasharray="3 3" />
                <line x1={0} x2={width} y1={yZero} y2={yZero} stroke="#1e293b" strokeWidth={1} />
                <line x1={0} x2={width} y1={yMinus1} y2={yMinus1} stroke="#475569" strokeWidth={1} strokeDasharray="3 3" />
                <text x={4} y={yPlus1 - 2} fill="#64748b" fontSize={9}>+1 平均最大吸气</text>
                <text x={4} y={yMinus1 + 10} fill="#64748b" fontSize={9}>-1 平均最大呼气</text>

                {/* DIBH hold tolerance band */}
                {holdTolerance && (() => {
                    const yTop = yToPx(holdTolerance.target + holdTolerance.halfWidth);
                    const yBottom = yToPx(holdTolerance.target - holdTolerance.halfWidth);
                    return (
                        <g>
                            <rect
                                x={0} y={yTop} width={width} height={Math.max(0, yBottom - yTop)}
                                fill="#22c55e" fillOpacity={0.14}
                                stroke="#22c55e" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 3"
                            />
                            <text
                                x={width - 6} y={yTop - 3}
                                fill="#22c55e" fontSize={9} fontWeight={600} textAnchor="end"
                            >
                                屏息容差带 {holdTolerance.label ?? `±${holdTolerance.halfWidth.toFixed(1)}`}
                            </text>
                        </g>
                    );
                })()}

                {/* Subtle backdrop tint over the analog area for the exposure
                    window — paired with the prominent gate-signal step below.
                    Only shown when the dedicated gate track is reserved; the
                    track itself is the primary 0/1 indicator. */}
                {gateTrack && exposing && exposureStartTickRef.current !== null && (() => {
                    const elapsed = Math.max(0, tick - exposureStartTickRef.current);
                    const startVisibleIdx = Math.max(0, SAMPLES - 1 - elapsed);
                    const x0 = startVisibleIdx * stepX;
                    const w = Math.max(2, width - x0);
                    return (
                        <rect
                            x={x0} y={4} width={w} height={analogBottom - 8}
                            fill="#22c55e" fillOpacity={0.08}
                        />
                    );
                })()}

                {/* Gate signal track: binary 0/1 step waveform across the
                    visible window. Renders as a flat low line until the
                    gate-open tick, then steps up to high and stays high
                    until the right edge. */}
                {gateTrack && (() => {
                    const startTick = exposureStartTickRef.current;
                    // Compute the rising-edge visible index. If gate is closed
                    // (startTick === null), the whole track stays at "low".
                    const isOpen = exposing && startTick !== null;
                    const elapsed = isOpen ? Math.max(0, tick - (startTick as number)) : -1;
                    const edgeVisibleIdx = isOpen
                        ? Math.max(0, Math.min(SAMPLES - 1, SAMPLES - 1 - elapsed))
                        : SAMPLES; // off-screen → all low
                    const edgeX = edgeVisibleIdx * stepX;
                    return (
                        <g>
                            {/* Track separator + background */}
                            <line x1={0} x2={width} y1={analogBottom} y2={analogBottom}
                                stroke="#1e293b" strokeWidth={1} />
                            <rect x={0} y={analogBottom + 1} width={width} height={GATE_TRACK_HEIGHT - 1}
                                fill="#0b1220" />
                            {/* Low / high reference dashes */}
                            <line x1={0} x2={width} y1={gateLowY} y2={gateLowY}
                                stroke="#334155" strokeWidth={0.6} strokeDasharray="2 3" />
                            <line x1={0} x2={width} y1={gateHighY} y2={gateHighY}
                                stroke="#334155" strokeWidth={0.6} strokeDasharray="2 3" />
                            {/* GATE label + 0/1 ticks */}
                            <text x={4} y={analogBottom + 11} fill="#94a3b8" fontSize={8} fontWeight={800} letterSpacing="0.5">
                                GATE
                            </text>
                            <text x={width - 12} y={gateHighY + 4} fill="#475569" fontSize={7} fontWeight={700}>1</text>
                            <text x={width - 12} y={gateLowY + 1} fill="#475569" fontSize={7} fontWeight={700}>0</text>
                            {/* Step signal: low to edge, rise, high to right */}
                            <path
                                d={`M 0 ${gateLowY} L ${edgeX.toFixed(1)} ${gateLowY} L ${edgeX.toFixed(1)} ${gateHighY} L ${width} ${gateHighY}`}
                                fill="none"
                                stroke={isOpen ? "#22c55e" : "#475569"}
                                strokeWidth={1.8}
                                strokeLinejoin="miter"
                            />
                            {/* Filled high segment for visual emphasis */}
                            {isOpen && edgeVisibleIdx < SAMPLES && (
                                <rect
                                    x={edgeX} y={gateHighY}
                                    width={Math.max(0, width - edgeX)}
                                    height={gateLowY - gateHighY}
                                    fill="#22c55e" fillOpacity={0.32}
                                />
                            )}
                            {/* Rising edge marker dot */}
                            {isOpen && edgeVisibleIdx < SAMPLES && (
                                <circle cx={edgeX} cy={gateHighY} r={2.5} fill="#22c55e" />
                            )}
                        </g>
                    );
                })()}

                {/* Legacy exposing highlight when no dedicated gate track is
                    reserved (kept for any caller that opts not to use the
                    track; current execute screen uses the track instead). */}
                {!gateTrack && exposing && exposureStartTickRef.current !== null && (() => {
                    const elapsed = Math.max(0, tick - exposureStartTickRef.current);
                    const startVisibleIdx = Math.max(0, SAMPLES - 1 - elapsed);
                    const x0 = startVisibleIdx * stepX;
                    const w = Math.max(2, width - x0);
                    return (
                        <g>
                            <rect
                                x={x0} y={4} width={w} height={height - 8}
                                fill="#22c55e" fillOpacity={0.22}
                            />
                            <line
                                x1={x0} x2={x0} y1={4} y2={height - 4}
                                stroke="#22c55e" strokeWidth={1.5}
                            />
                            <text
                                x={x0 + 6} y={16}
                                fill="#22c55e" fontSize={9} fontWeight={700}
                            >
                                Gate · 曝光中
                            </text>
                        </g>
                    );
                })()}

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

            {zRangeStrip && (() => {
                const bedTravelMm = zRangeStrip.bedTravelMm ?? 19.2;
                const bedCount = Math.max(1, Math.ceil(zRangeStrip.scanLengthMm / bedTravelMm));
                const fmtZ = (v?: number) =>
                    v === undefined ? null : v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
                const startLabel = fmtZ(zRangeStrip.startMm);
                const endLabel = fmtZ(zRangeStrip.endMm);
                return (
                    <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        marginTop: 10, paddingTop: 8, borderTop: "1px solid #1e293b",
                    }}>
                        <span style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                            床位进度
                        </span>
                        {startLabel && (
                            <span style={{
                                color: "#64748b", fontFamily: "monospace", fontSize: 9, fontWeight: 700,
                                whiteSpace: "nowrap",
                            }}>
                                Z{startLabel}
                            </span>
                        )}
                        <div style={{ display: "flex", flex: 1, gap: 3, alignItems: "flex-end" }}>
                            {Array.from({ length: bedCount }).map((_, i) => {
                                const completed = zRangeStrip.completedSegments ?? 0;
                                const activeIdx = zRangeStrip.activeSegment ?? -1;
                                const isCompleted = i < completed;
                                const isActive = i === activeIdx && !isCompleted;
                                const bg = isCompleted ? "#3b82f6"
                                    : isActive ? "#60a5fa"
                                    : "#334155";
                                const numColor = isCompleted ? "#bfdbfe"
                                    : isActive ? "#dbeafe"
                                    : "#64748b";
                                return (
                                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                                        <div style={{
                                            height: 6, width: "100%", borderRadius: 2,
                                            background: bg,
                                            boxShadow: isActive ? "0 0 6px rgba(96,165,250,0.55)" : undefined,
                                        }} />
                                        <span style={{
                                            textAlign: "center", fontSize: 8, fontFamily: "monospace",
                                            fontWeight: 700, color: numColor, lineHeight: 1,
                                        }}>
                                            {i + 1}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        {endLabel && (
                            <span style={{
                                color: "#64748b", fontFamily: "monospace", fontSize: 9, fontWeight: 700,
                                whiteSpace: "nowrap",
                            }}>
                                Z{endLabel}
                            </span>
                        )}
                        <span style={{
                            color: "#e2e8f0", fontFamily: "monospace", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                        }}>
                            {bedCount} 床位
                        </span>
                    </div>
                );
            })()}

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
