import { useEffect, useMemo, useRef, useState } from "react";

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
    readOnly?: boolean;
}

const SAMPLES = 240;
const CYCLE_SAMPLES = 48;

function generateWaveform(now: number, jitter: number, drift: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const t = (now + i) / CYCLE_SAMPLES;
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
    readOnly = false,
}: GatingMonitorPanelProps) {
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
    const samples = useMemo(() => generateWaveform(phaseLockedTick, jitter, drift), [phaseLockedTick, jitter, drift]);

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
    const VBW = 800;
    const VBH = 120;
    const yMin = -1.5;
    const yMax = 1.5;
    const ampToY = (v: number) => {
        const clamped = Math.max(yMin, Math.min(yMax, v));
        return ((yMax - clamped) / (yMax - yMin)) * VBH;
    };
    const yToAmp = (y: number) => yMax - (y / VBH) * (yMax - yMin);

    const stepX = VBW / (SAMPLES - 1);
    const wavePath = useMemo(
        () => samples.map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${ampToY(v).toFixed(1)}`).join(" "),
        [samples, stepX]
    );
    const waveFill = useMemo(
        () => `M 0,${VBH} L ${samples.map((v, i) => `${(i * stepX).toFixed(1)},${ampToY(v).toFixed(1)}`).join(" L ")} L ${VBW},${VBH} Z`,
        [samples, stepX]
    );
    const extrema = useMemo(() => findWaveExtrema(samples), [samples]);

    const thresholdY = ampToY(threshold);
    const yPlus1 = ampToY(1);
    const yMinus1 = ampToY(-1);
    const yZero = ampToY(0);
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
        const localY = ((e.clientY - rect.top) / rect.height) * VBH;
        const v = yToAmp(localY);
        const rounded = Math.max(-2, Math.min(2, Math.round(v * 10) / 10));
        onThresholdChange(rounded);
    };
    const handlePointerUp = () => setDraggingThreshold(false);

    const stabilityLabel = waitingForStableBreath
        ? "呼吸不稳"
        : stability === "stable"
            ? "稳定"
            : stability === "unstable"
                ? "呼吸不稳"
                : "采样中…";
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

                {/* gridlines at +1 / 0 / -1 with light labels */}
                <div className="absolute inset-x-2 top-6 bottom-2 flex flex-col justify-between pointer-events-none opacity-20">
                    {["+1 平均最大吸气", "0", "−1 平均最大呼气"].map((label) => (
                        <div key={label} className="flex items-center gap-2">
                            <span className="text-[8px] w-28 text-right font-mono font-black text-[#64748B]">{label}</span>
                            <div className="flex-1 h-[0.5px] bg-[#94A3B8]" />
                        </div>
                    ))}
                </div>

                <div className="absolute left-0 right-0 top-6 bottom-2 px-3">
                    <svg
                        ref={svgRef}
                        viewBox={`0 0 ${VBW} ${VBH}`}
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

                        {/* mid (0), +1 and -1 baselines as dotted greys */}
                        <line x1="0" y1={yZero} x2={VBW} y2={yZero} stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
                        <line x1="0" y1={yPlus1} x2={VBW} y2={yPlus1} stroke="#CBD5E1" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
                        <line x1="0" y1={yMinus1} x2={VBW} y2={yMinus1} stroke="#CBD5E1" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />

                        {scanActive && bedStrip && Array.from({ length: visibleCycles + 1 }).map((_, i) => {
                            const x = i * CYCLE_SAMPLES * stepX;
                            const bedNumber = Math.floor(visibleStartCycle + i) + 1;
                            return (
                                <g key={`cycle-${i}`}>
                                    <line x1={x} y1="0" x2={x} y2={VBH} stroke="#CBD5E1" strokeWidth="1" opacity="0.45" />
                                    {i < visibleCycles && (
                                        <text x={x + 5} y={VBH - 6} fill="#64748B" fontSize="8" fontWeight="800">
                                            BED {bedNumber}
                                        </text>
                                    )}
                                </g>
                            );
                        })}

                        {/* threshold line — color reflects trigger direction (rising=red toward inhale, falling=amber toward exhale) */}
                        <line
                            x1="0"
                            y1={thresholdY}
                            x2={VBW}
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
                            阈值 {threshold.toFixed(1)} · {direction === "rising" ? "↑ 上行触发" : "↓ 下行触发"}
                        </text>

                        {/* waveform fill + path */}
                        <path d={waveFill} fill="url(#gated-wave-fill)" />
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

                        {scanActive && bedStrip && (stripHasExplicitState
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
                                        y2={VBH}
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

                        {currentPhaseX !== null && currentPhaseX >= 0 && currentPhaseX <= VBW && (
                            <g>
                                <line x1={currentPhaseX} y1="0" x2={currentPhaseX} y2={VBH} stroke="#06B6D4" strokeWidth="1.8" opacity="0.9" />
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
                                width={VBW}
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
                        床位进度
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
                            const currentTitle = waitingForStableBreath ? " · 等待呼吸稳定" : " · 补采中";
                            return (
                                <div
                                    key={i}
                                    className="flex-1 flex flex-col gap-0.5"
                                    title={`床位 ${bedNumber}${done ? " · 已扫" : current ? currentTitle : pendingSupplemental ? " · 待补采" : ""}`}
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
