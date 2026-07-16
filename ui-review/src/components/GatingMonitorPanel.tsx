import { useEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "../lib/i18nContext";

type TriggerDirection = "rising" | "falling";
type StabilityState = "stable" | "unstable" | "warming_up";

interface GatingMonitorPanelProps {
    threshold?: number;
    direction?: TriggerDirection;
    onThresholdChange?: (value: number) => void;
    bedStrip?: {
        total: number;
        completed?: number;
        completedIndices?: number[];
        currentIndex?: number | null;
        pendingIndices?: number[];
    };
    scanActive?: boolean;
    exposing?: boolean;
    bedPhase?: number;
    waitingForStableBreath?: boolean;
    showScanMarkers?: boolean;
    readOnly?: boolean;
}

const SAMPLES = 240;
const CYCLE_SAMPLES = 48;
const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 120;
const AMPLITUDE_MIN = -1.5;
const AMPLITUDE_MAX = 1.5;

function ampToY(value: number) {
    const clamped = Math.max(AMPLITUDE_MIN, Math.min(AMPLITUDE_MAX, value));
    return ((AMPLITUDE_MAX - clamped) / (AMPLITUDE_MAX - AMPLITUDE_MIN)) * VIEWBOX_HEIGHT;
}

function yToAmp(y: number) {
    return AMPLITUDE_MAX - (y / VIEWBOX_HEIGHT) * (AMPLITUDE_MAX - AMPLITUDE_MIN);
}

function generateRawWaveform(now: number, jitter: number, drift: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const sample = now + i;
        const t = sample / CYCLE_SAMPLES;
        const phaseModulation = 0.045 * Math.sin(t * 0.73) + 0.026 * Math.sin(t * 1.41);
        const amplitude = 1 + 0.09 * Math.sin(t * 0.52) + 0.045 * Math.sin(t * 1.13);
        const baseline = drift * (i / SAMPLES) * 0.18 + 0.08 * Math.sin(t * 0.31);
        const breath = -Math.cos(2 * Math.PI * (t + phaseModulation)) * amplitude;
        const sensorNoise =
            Math.sin(sample * 0.91) * 0.035 +
            Math.sin(sample * 1.83 + 0.8) * 0.022 +
            Math.sin(sample * 3.97) * 0.012;
        const artifactCenter = 36 + ((Math.floor(now / 85) * 53) % 168);
        const artifactWidth = waitingArtifactWidth(jitter);
        const artifact =
            Math.exp(-((i - artifactCenter) ** 2) / (2 * artifactWidth ** 2)) *
            0.16 *
            Math.sin(Math.floor(now / 85) * 1.7);
        out.push(breath + baseline + (sensorNoise + artifact) * jitter);
    }
    return out;
}

function waitingArtifactWidth(jitter: number) {
    return jitter > 1.8 ? 6 : 9;
}

function filterRespirationWaveform(raw: number[]): number[] {
    if (raw.length === 0) return raw;
    const alpha = 0.22;
    const lowPass: number[] = [];
    let value = raw[0];
    for (const sample of raw) {
        value += alpha * (sample - value);
        lowPass.push(value);
    }

    return lowPass.map((_, index) => {
        let sum = 0;
        let weight = 0;
        for (let offset = -3; offset <= 3; offset++) {
            const sampleIndex = Math.max(0, Math.min(lowPass.length - 1, index + offset));
            const w = 4 - Math.abs(offset);
            sum += lowPass[sampleIndex] * w;
            weight += w;
        }
        return sum / weight;
    });
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

/**
 * White-themed respiratory monitor panel for prospective free-breathing gating.
 * Visual structure mirrors the 4D diagnostic confirm screen's bottom panel:
 *   title row + stability badge + SVG waveform with threshold line + bed-strip footer,
 * all inside one unified white container.
 */
export default function GatingMonitorPanel({
    threshold = 1.0,
    direction = "rising",
    onThresholdChange,
    bedStrip,
    scanActive = false,
    exposing = false,
    bedPhase,
    waitingForStableBreath = false,
    showScanMarkers = true,
    readOnly = false,
}: GatingMonitorPanelProps) {
    const { t } = useI18n();
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [tick, setTick] = useState(0);
    const [draggingThreshold, setDraggingThreshold] = useState(false);

    const noisePhase = Math.floor(tick / 600) % 3;
    const jitter = waitingForStableBreath ? 2.1 : noisePhase === 1 ? 1.6 : 0.6;
    const drift = waitingForStableBreath ? 1.8 : noisePhase === 2 ? 1.2 : 0.2;

    useEffect(() => {
        const id = window.setInterval(() => setTick((t) => t + 2), 50);
        return () => window.clearInterval(id);
    }, []);

    const visibleCycles = SAMPLES / CYCLE_SAMPLES;
    const completedBeds = bedStrip?.completed ?? 0;
    const completedIndexSet = useMemo(
        () => new Set(bedStrip?.completedIndices ?? []),
        [bedStrip?.completedIndices]
    );
    const pendingIndexSet = useMemo(
        () => new Set(bedStrip?.pendingIndices ?? []),
        [bedStrip?.pendingIndices]
    );
    const stripHasExplicitState =
        completedIndexSet.size > 0 ||
        pendingIndexSet.size > 0 ||
        bedStrip?.currentIndex !== undefined;
    const activeCycleIndex = stripHasExplicitState && bedStrip?.currentIndex
        ? bedStrip.currentIndex - 1
        : completedBeds;
    const visibleStartCycle = scanActive && bedStrip
        ? Math.max(0, activeCycleIndex - (visibleCycles - 1))
        : tick / CYCLE_SAMPLES;
    const phaseLockedTick = scanActive && bedStrip
        ? Math.round(visibleStartCycle * CYCLE_SAMPLES)
        : tick;
    const rawSamples = useMemo(
        () => generateRawWaveform(phaseLockedTick, jitter, drift),
        [phaseLockedTick, jitter, drift]
    );
    const samples = useMemo(() => filterRespirationWaveform(rawSamples), [rawSamples]);

    const stability: StabilityState = useMemo(() => {
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
        const cv = Math.sqrt(variance) / Math.max(0.05, Math.abs(mean) + 0.5);
        const baselineDrift = Math.abs(samples[samples.length - 1] - samples[0]) * 30;
        if (tick < 80) return "warming_up";
        if (cv > 0.6 || baselineDrift > 5) return "unstable";
        return "stable";
    }, [samples, tick]);

    // SVG: viewBox 800x120; y maps amplitude [-1.5, +1.5] to [0, 120]
    const stepX = VIEWBOX_WIDTH / (SAMPLES - 1);
    const wavePath = useMemo(
        () => samples.map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${ampToY(v).toFixed(1)}`).join(" "),
        [samples, stepX]
    );
    const rawWavePath = useMemo(
        () => rawSamples.map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${ampToY(v).toFixed(1)}`).join(" "),
        [rawSamples, stepX]
    );
    const waveFill = useMemo(
        () => `M 0,${VIEWBOX_HEIGHT} L ${samples.map((v, i) => `${(i * stepX).toFixed(1)},${ampToY(v).toFixed(1)}`).join(" L ")} L ${VIEWBOX_WIDTH},${VIEWBOX_HEIGHT} Z`,
        [samples, stepX]
    );
    const extrema = useMemo(() => findWaveExtrema(samples), [samples]);

    const thresholdY = ampToY(threshold);
    const thresholdForPhase = Math.max(-0.95, Math.min(0.95, threshold));
    const risingPhase = Math.acos(-thresholdForPhase) / (Math.PI * 2);
    const triggerPhase = direction === "rising" ? risingPhase : 1 - risingPhase;
    const currentPhaseX = scanActive && bedStrip
        ? ((activeCycleIndex + (bedPhase ?? 0) - visibleStartCycle) * CYCLE_SAMPLES) * stepX
        : null;

    const handlePointerDown = (e: React.PointerEvent<SVGRectElement>) => {
        if (readOnly || !onThresholdChange) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setDraggingThreshold(true);
    };
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!draggingThreshold || !svgRef.current || !onThresholdChange) return;
        const rect = svgRef.current.getBoundingClientRect();
        const localY = ((e.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;
        const v = yToAmp(localY);
        const rounded = Math.max(-2, Math.min(2, Math.round(v * 10) / 10));
        onThresholdChange(rounded);
    };
    const handlePointerUp = () => setDraggingThreshold(false);

    const stabilityLabel = waitingForStableBreath
        ? t("scanFlow.gating.unstableLong")
        : stability === "stable"
            ? t("scanFlow.gating.stable")
            : stability === "unstable"
                ? t("scanFlow.gating.unstableLong")
                : t("scanFlow.gating.sampling");
    const stabilityOk = !waitingForStableBreath && stability === "stable";

    return (
        <div className="h-full bg-white overflow-hidden flex flex-col">
            <div className="relative flex-1 min-h-[150px] overflow-hidden">
                <div className="pointer-events-none absolute left-3 top-1.5 text-[8px] font-black tracking-[0.18em] text-[#475569] opacity-80 uppercase">
                    RESP SIGNAL MONITORING
                </div>

                <div className="absolute right-2 top-1.5 z-10">
                    <div
                        className={`px-2 py-0.5 rounded border shadow-sm flex items-center gap-1.5 min-w-[86px] ${
                            stabilityOk
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : "bg-amber-50 border-amber-200 text-amber-700"
                        }`}
                    >
                        <span
                            className={`h-2 w-2 rounded-full ${
                                stabilityOk
                                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.65)]"
                                    : "bg-amber-500 animate-pulse"
                            }`}
                        />
                        <span className="text-[9px] font-black leading-none">{stabilityLabel}</span>
                    </div>
                </div>

                <div className="absolute left-0 right-0 top-6 bottom-2 px-3">
                    <svg
                        ref={svgRef}
                        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
                        className="w-full h-full overflow-visible"
                        preserveAspectRatio="none"
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                    >
                        <defs>
                            <linearGradient id="gated-wave-fill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.18" />
                                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.01" />
                            </linearGradient>
                        </defs>

                        {/* threshold line — color reflects trigger direction (rising=red toward inhale, falling=amber toward exhale) */}
                        <line
                            x1="0"
                            y1={thresholdY}
                            x2={VIEWBOX_WIDTH}
                            y2={thresholdY}
                            stroke={direction === "rising" ? "#EF4444" : "#F59E0B"}
                            strokeWidth="1.6"
                            strokeDasharray="8 5"
                            opacity="0.9"
                        />
                        <text
                            x="6"
                            y={thresholdY - 4}
                            fill={direction === "rising" ? "#EF4444" : "#F59E0B"}
                            fontSize="10"
                            fontWeight="800"
                        >
                            {t("scanFlow.gating.thresholdValue", { value: threshold.toFixed(1) })} · {direction === "rising" ? t("scanFlow.gating.upTrigger") : t("scanFlow.gating.downTrigger")}
                        </text>

                        {/* waveform fill + path */}
                        <path d={waveFill} fill="url(#gated-wave-fill)" />
                        <path
                            d={rawWavePath}
                            fill="none"
                            stroke="#94A3B8"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity="0.58"
                        />
                        <path
                            d={wavePath}
                            fill="none"
                            stroke="#2563EB"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />

                        {extrema.map((point) => (
                            <circle
                                key={`${point.type}-${point.index}`}
                                cx={point.index * stepX}
                                cy={ampToY(point.value)}
                                r="4.4"
                                fill={point.type === "peak" ? "#EF4444" : "#2563EB"}
                                stroke="#FFFFFF"
                                strokeWidth="1.5"
                            />
                        ))}

                        {showScanMarkers && scanActive && bedStrip && (stripHasExplicitState
                            ? Array.from(completedIndexSet).filter((bedNumber) => pendingIndexSet.has(bedNumber))
                            : Array.from({ length: completedBeds }, (_, i) => i + 1)
                        ).map((bedNumber) => {
                            const bedIndex = bedNumber - 1;
                            const visibleIndex = (bedIndex + triggerPhase - visibleStartCycle) * CYCLE_SAMPLES;
                            if (visibleIndex < 0 || visibleIndex >= SAMPLES) return null;
                            const x = visibleIndex * stepX;
                            const y = ampToY(threshold);
                            return (
                                <g key={`trigger-${bedNumber}`}>
                                    <line
                                        x1={x}
                                        y1="0"
                                        x2={x}
                                        y2={VIEWBOX_HEIGHT}
                                        stroke="#FACC15"
                                        strokeWidth="1.8"
                                        strokeDasharray="5 4"
                                        opacity="0.95"
                                    />
                                    <circle
                                        cx={x}
                                        cy={y}
                                        r="6"
                                        fill="#FACC15"
                                        stroke="#92400E"
                                        strokeWidth="1.5"
                                    />
                                    <text x={x + 7} y={Math.max(12, y - 8)} fill="#92400E" fontSize="9" fontWeight="800">
                                        EXP {bedNumber}
                                    </text>
                                </g>
                            );
                        })}

                        {showScanMarkers && currentPhaseX !== null && currentPhaseX >= 0 && currentPhaseX <= VIEWBOX_WIDTH && (
                            <g>
                                <line x1={currentPhaseX} y1="0" x2={currentPhaseX} y2={VIEWBOX_HEIGHT} stroke="#06B6D4" strokeWidth="1.8" opacity="0.9" />
                                <circle
                                    cx={currentPhaseX}
                                    cy={ampToY(samples[Math.max(0, Math.min(samples.length - 1, Math.round(currentPhaseX / stepX)))])}
                                    r="5"
                                    fill="#06B6D4"
                                    stroke="#FFFFFF"
                                    strokeWidth="1.4"
                                />
                            </g>
                        )}

                        {/* draggable handle on the threshold line */}
                        {!readOnly && onThresholdChange && (
                            <rect
                                x={0}
                                y={thresholdY - 8}
                                width={VIEWBOX_WIDTH}
                                height={16}
                                fill="transparent"
                                style={{ cursor: "ns-resize" }}
                                onPointerDown={handlePointerDown}
                            />
                        )}
                    </svg>
                </div>
            </div>

            {bedStrip && bedStrip.total > 0 && (
                <div className="border-t border-[#EEF2F9] bg-white px-3 py-1.5 flex items-center gap-2 shrink-0">
                    <span className="text-[8px] font-black uppercase tracking-[0.18em] text-[#475569] opacity-80 shrink-0">
                        {t("scanFlow.gating.bedProgress")}
                    </span>
                    <div className="flex flex-1 gap-1 items-end h-3">
                        {Array.from({ length: bedStrip.total }).map((_, i) => {
                            const bedNumber = i + 1;
                            const done = stripHasExplicitState
                                ? completedIndexSet.has(bedNumber)
                                : i < (bedStrip.completed ?? 0);
                            const current = stripHasExplicitState
                                ? scanActive && bedStrip.currentIndex === bedNumber
                                : scanActive && !done && i === (bedStrip.completed ?? 0);
                            const pendingSupplemental = stripHasExplicitState && pendingIndexSet.has(bedNumber) && !done && !current;
                            const tooltipKey = done
                                ? "scanFlow.gating.bedTooltipDone"
                                : current
                                    ? (waitingForStableBreath ? "scanFlow.gating.bedTooltipWaiting" : "scanFlow.gating.bedTooltipExtra")
                                    : pendingSupplemental
                                        ? "scanFlow.gating.bedTooltipPending"
                                        : "scanFlow.gating.bedTooltip";
                            return (
                                <div
                                    key={i}
                                    className="flex-1 flex flex-col gap-0.5"
                                    title={t(tooltipKey, { bed: bedNumber })}
                                >
                                    <div
                                        className={`h-1.5 w-full rounded-sm ${
                                            done
                                                ? "bg-[#3B82F6]"
                                                : current
                                                    ? exposing
                                                        ? "bg-[#FACC15] shadow-[0_0_8px_rgba(250,204,21,0.85)]"
                                                        : "bg-[#FDBA74] animate-pulse"
                                                    : pendingSupplemental
                                                        ? "bg-[#FDE68A]"
                                                    : "bg-[#E2E8F0]"
                                        }`}
                                    />
                                    {bedStrip.total <= 24 && (
                                        <span className="text-[7px] text-center font-bold font-mono text-[#94A3B8] leading-none">
                                            {i + 1}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="text-[9px] font-mono font-bold text-[#475569] shrink-0 tabular-nums">
                        {stripHasExplicitState ? completedIndexSet.size : bedStrip.completed ?? 0}/{bedStrip.total}
                    </div>
                </div>
            )}
        </div>
    );
}
