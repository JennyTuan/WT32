import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

export type NoiseLevel = "low" | "standard" | "medium" | "high";

export type AutoMaPanelProps = {
    mode?: "axial" | "helical";
    autoMa: boolean;
    maMin: number;
    maMax: number;
    fallbackMa: number;
    scanLength: number;
    rotationTime: number;
    sliceInterval?: number;
    stepCount?: number | null;
    pitch?: number;
    scanPositionRatio?: number;
    onScanPositionRatioChange?: (ratio: number) => void;
    onChange: (patch: { auto_ma?: boolean; ma_min?: number; ma_max?: number; noise_level?: NoiseLevel }) => void;
    noiseLevel?: NoiseLevel;
};

const NOISE_OPTIONS: { value: NoiseLevel; label: string; desc: string }[] = [
    { value: "low", label: "低噪声", desc: "较高 mA / 较低噪声" },
    { value: "standard", label: "标准", desc: "默认" },
    { value: "medium", label: "较高", desc: "较低 mA" },
    { value: "high", label: "高噪声", desc: "最低剂量" },
];

const NOISE_FACTOR: Record<NoiseLevel, number> = {
    low: 1.2,
    standard: 1,
    medium: 0.85,
    high: 0.7,
};

const HARD_MIN = 20;
const HARD_MAX = 800;
const HELICAL_SAMPLE_COUNT = 80;
const HELICAL_TIME_SAMPLES = 480;
const AXIAL_SAMPLES_PER_BED = 48;
const HELICAL_BEAM_WIDTH_MM = 40;
const VIEW_W = 100;
const VIEW_H = 100;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

const computeStepCount = (scanLength: number, sliceInterval: number, fallback?: number | null) => {
    if (fallback && fallback > 0) return fallback;
    if (!Number.isFinite(scanLength) || !Number.isFinite(sliceInterval) || sliceInterval <= 0) return 1;
    return Math.max(1, Math.round(scanLength / sliceInterval));
};

const generatePositionMaCurve = (sampleCount: number, maMin: number, maMax: number): number[] => {
    if (sampleCount <= 0) return [];
    if (sampleCount === 1) return [Math.round((maMin + maMax) / 2)];
    const span = Math.max(1, maMax - maMin);
    return Array.from({ length: sampleCount }, (_, i) => {
        const u = i / (sampleCount - 1);
        const bell = Math.sin(u * Math.PI);
        const wobble = 0.08 * Math.sin(u * Math.PI * 4 + 0.7);
        return Math.round(maMin + clamp01(bell + wobble) * span);
    });
};

const generateEnvelope = (centerCurve: number[], maMin: number, maMax: number) => {
    const span = Math.max(1, maMax - maMin);
    const lat: number[] = [];
    const ap: number[] = [];
    centerCurve.forEach((center, i) => {
        const u = centerCurve.length > 1 ? i / (centerCurve.length - 1) : 0.5;
        const radiusFactor = 0.5 + 0.4 * Math.cos(u * Math.PI * 2 - Math.PI) + 0.1 * Math.sin(u * Math.PI * 5);
        const amp = (span / 2) * 0.55 * clamp(radiusFactor, 0.15, 1);
        lat.push(Math.round(Math.min(maMax, center + amp)));
        ap.push(Math.round(Math.max(maMin, center - amp)));
    });
    return { lat, ap };
};

type TimeSample = { t: number; ma: number; z: number; theta: number };
type AxialTimeSample = TimeSample & { bedIndex: number };

const generateHelicalTimeWaveform = (
    totalTime: number,
    rotationTime: number,
    scanLength: number,
    maMin: number,
    maMax: number,
): TimeSample[] => {
    if (!(totalTime > 0) || !(rotationTime > 0)) return [];
    const span = Math.max(1, maMax - maMin);
    return Array.from({ length: HELICAL_TIME_SAMPLES }, (_, i) => {
        const t = (i / (HELICAL_TIME_SAMPLES - 1)) * totalTime;
        const u = t / totalTime;
        const bell = Math.sin(u * Math.PI);
        const wobble = 0.08 * Math.sin(u * Math.PI * 4 + 0.7);
        const center = maMin + clamp01(bell + wobble) * span;
        const theta = (t / rotationTime) * Math.PI * 2;
        const radiusFactor = 0.5 + 0.4 * Math.cos(u * Math.PI * 2 - Math.PI) + 0.1 * Math.sin(u * Math.PI * 5);
        const amp = (span / 2) * 0.55 * clamp(radiusFactor, 0.15, 1);
        return {
            t,
            ma: clamp(center + amp * -Math.cos(2 * theta), maMin, maMax),
            z: u * scanLength,
            theta: ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
        };
    });
};

const generateAxialTimeWaveform = (
    centerCurve: number[],
    envelopeValues: { lat: number[]; ap: number[] },
    rotationTime: number,
    sliceInterval: number,
): AxialTimeSample[] => {
    if (!centerCurve.length || !(rotationTime > 0)) return [];
    const out: AxialTimeSample[] = [];
    centerCurve.forEach((center, bedIndex) => {
        const lat = envelopeValues.lat[bedIndex] ?? center;
        const ap = envelopeValues.ap[bedIndex] ?? center;
        const amp = Math.max(0, (lat - ap) / 2);
        for (let i = 0; i < AXIAL_SAMPLES_PER_BED; i += 1) {
            const u = i / Math.max(1, AXIAL_SAMPLES_PER_BED - 1);
            const theta = u * Math.PI * 2;
            out.push({
                bedIndex,
                t: (bedIndex + u) * rotationTime,
                ma: center + amp * -Math.cos(2 * theta),
                z: bedIndex * Math.max(0, sliceInterval),
                theta,
            });
        }
    });
    return out;
};

export default function AutoMaPanel({
    mode = "axial",
    autoMa,
    maMin,
    maMax,
    fallbackMa,
    scanLength,
    rotationTime,
    sliceInterval,
    stepCount,
    pitch,
    scanPositionRatio,
    onScanPositionRatioChange,
    onChange,
    noiseLevel = "standard",
}: AutoMaPanelProps) {
    const [draftMin, setDraftMin] = useState(maMin);
    const [draftMax, setDraftMax] = useState(maMax);
    const [internalPositionRatio, setInternalPositionRatio] = useState(0.5);
    const debounceRef = useRef<number | null>(null);
    const scrubbingRef = useRef(false);

    useEffect(() => setDraftMin(maMin), [maMin]);
    useEffect(() => setDraftMax(maMax), [maMax]);

    const isHelical = mode === "helical";
    const effectiveSliceInterval = sliceInterval ?? 0;
    const effectiveSteps = isHelical ? HELICAL_SAMPLE_COUNT : computeStepCount(scanLength, effectiveSliceInterval, stepCount);
    const noiseFactor = NOISE_FACTOR[noiseLevel];
    const activePositionRatio = clamp01(scanPositionRatio ?? internalPositionRatio);

    const curve = useMemo(() => {
        const base = autoMa
            ? generatePositionMaCurve(effectiveSteps, draftMin, draftMax)
            : Array.from({ length: effectiveSteps }, () => fallbackMa);
        return base.map((value) => Math.round(clamp(value * noiseFactor, HARD_MIN, HARD_MAX)));
    }, [autoMa, draftMax, draftMin, effectiveSteps, fallbackMa, noiseFactor]);

    const envelope = useMemo(
        () => (autoMa ? generateEnvelope(curve, draftMin, draftMax) : { lat: curve, ap: curve }),
        [autoMa, curve, draftMax, draftMin],
    );

    const helicalTiming = useMemo(() => {
        if (!isHelical) return null;
        const pitchValue = pitch && pitch > 0 ? pitch : 1;
        const tableSpeed = (pitchValue * HELICAL_BEAM_WIDTH_MM) / Math.max(0.1, rotationTime);
        const totalTime = tableSpeed > 0 && scanLength > 0 ? scanLength / tableSpeed : 0;
        return { totalTime, rotations: totalTime > 0 ? totalTime / rotationTime : 0, tableSpeed };
    }, [isHelical, pitch, rotationTime, scanLength]);

    const timeWaveform = useMemo<TimeSample[]>(() => {
        if (!isHelical || !helicalTiming || !autoMa) return [];
        return generateHelicalTimeWaveform(helicalTiming.totalTime, rotationTime, scanLength, draftMin, draftMax).map((sample) => ({
            ...sample,
            ma: clamp(sample.ma * noiseFactor, HARD_MIN, HARD_MAX),
        }));
    }, [autoMa, draftMax, draftMin, helicalTiming, isHelical, noiseFactor, rotationTime, scanLength]);

    const axialTimeWaveform = useMemo<AxialTimeSample[]>(() => {
        if (isHelical || !autoMa) return [];
        return generateAxialTimeWaveform(curve, envelope, rotationTime, effectiveSliceInterval).map((sample) => ({
            ...sample,
            ma: clamp(sample.ma, HARD_MIN, HARD_MAX),
        }));
    }, [autoMa, curve, effectiveSliceInterval, envelope, isHelical, rotationTime]);

    const yViewMin = Math.max(0, draftMin - (draftMax - draftMin) * 0.05);
    const yViewMax = draftMax + (draftMax - draftMin) * 0.05;
    const yViewSpan = Math.max(1, yViewMax - yViewMin);
    const yOf = (ma: number) => VIEW_H - ((ma - yViewMin) / yViewSpan) * VIEW_H;
    const yLineMin = yOf(draftMin);
    const yLineMax = yOf(draftMax);

    const timeWavePath = useMemo(() => {
        if (!timeWaveform.length) return "";
        const total = timeWaveform[timeWaveform.length - 1].t || 1;
        return timeWaveform
            .map((sample, i) => {
                const x = (sample.t / total) * VIEW_W;
                return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${yOf(sample.ma).toFixed(2)}`;
            })
            .join(" ");
    }, [timeWaveform, yViewMin, yViewSpan]);

    const axialTimePaths = useMemo(() => {
        const bedCount = Math.max(1, effectiveSteps);
        if (!axialTimeWaveform.length || bedCount <= 0) return [];
        return Array.from({ length: bedCount }, (_, bedIndex) => {
            const samples = axialTimeWaveform.filter((sample) => sample.bedIndex === bedIndex);
            return samples
                .map((sample, index) => {
                    const localRatio = rotationTime > 0 ? (sample.t - bedIndex * rotationTime) / rotationTime : 0;
                    const x = ((bedIndex + localRatio) / bedCount) * VIEW_W;
                    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${yOf(sample.ma).toFixed(2)}`;
                })
                .join(" ");
        });
    }, [axialTimeWaveform, effectiveSteps, rotationTime, yViewMin, yViewSpan]);

    const cursorIdx = isHelical
        ? timeWaveform.length > 0
            ? Math.round(activePositionRatio * (timeWaveform.length - 1))
            : null
        : curve.length > 0
            ? Math.round(activePositionRatio * (curve.length - 1))
            : null;
    const cursorSample = isHelical && cursorIdx !== null ? timeWaveform[cursorIdx] : null;
    const axialCursorMa = !isHelical && cursorIdx !== null ? curve[cursorIdx] : null;
    const axialCursorZ = activePositionRatio * Math.max(0, scanLength);
    const axialBedNumber = !isHelical && cursorIdx !== null ? cursorIdx + 1 : null;
    const axialBedCount = !isHelical ? Math.max(1, effectiveSteps) : 0;
    const axialCursorTime = !isHelical && cursorIdx !== null ? (cursorIdx + 0.5) * rotationTime : 0;

    const updatePositionRatio = (ratio: number) => {
        const nextRatio = clamp01(ratio);
        setInternalPositionRatio(nextRatio);
        onScanPositionRatioChange?.(nextRatio);
    };

    const updateCursor = (clientX: number, target: SVGSVGElement) => {
        if (isHelical && !timeWaveform.length) return;
        if (!isHelical && !curve.length) return;
        const rect = target.getBoundingClientRect();
        updatePositionRatio((clientX - rect.left) / Math.max(1, rect.width));
    };

    const handleSvgPointerDown = (event: PointerEvent<SVGSVGElement>) => {
        scrubbingRef.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        updateCursor(event.clientX, event.currentTarget);
    };

    const handleSvgPointerMove = (event: PointerEvent<SVGSVGElement>) => {
        if (!scrubbingRef.current) return;
        updateCursor(event.clientX, event.currentTarget);
    };

    const handleSvgPointerUp = () => {
        scrubbingRef.current = false;
    };

    const flush = (patch: { ma_min?: number; ma_max?: number }) => {
        if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => onChange(patch), 200);
    };

    const handleMinChange = (raw: string) => {
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        const clamped = clamp(value, HARD_MIN, draftMax - 5);
        setDraftMin(clamped);
        flush({ ma_min: clamped });
    };

    const handleMaxChange = (raw: string) => {
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        const clamped = clamp(value, draftMin + 5, HARD_MAX);
        setDraftMax(clamped);
        flush({ ma_max: clamped });
    };

    return (
        <div className="shrink-0 border-t border-white/10 bg-[#0F172A] text-[#CBD5E1]">
            

            <div className="flex divide-x divide-white/10 px-4 py-3">
                <div className="min-w-0 flex-1 pr-4">
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-mono">
                        {isHelical && cursorSample && autoMa ? (
                            <>
                                <Metric label="t" value={cursorSample.t.toFixed(2)} unit="s" />
                                <Metric label="Z" value={cursorSample.z.toFixed(1)} unit="mm" />
                                <Metric label="theta" value={((cursorSample.theta * 180) / Math.PI).toFixed(0)} unit="deg" />
                                <Metric label="mA" value={`${Math.round(cursorSample.ma)}`} accent />
                                <span className="ml-auto text-[9px] text-[#64748B]">拖动曲线或定位像查看扫描位置</span>
                            </>
                        ) : !isHelical && axialCursorMa !== null && autoMa ? (
                            <>
                                <Metric label="bed" value={`${axialBedNumber}/${axialBedCount}`} />
                                <Metric label="t" value={axialCursorTime.toFixed(2)} unit="s" />
                                <Metric label="Z" value={axialCursorZ.toFixed(1)} unit="mm" />
                                <Metric label="mA" value={`${Math.round(axialCursorMa)}`} accent />
                            </>
                        ) : (
                            <span className="text-[9px] text-[#64748B]">启用 Auto mA 后，点击/拖动曲线查看对应位置</span>
                        )}
                    </div>

                    <div className={`relative ${isHelical ? "h-[150px]" : "h-[120px]"} overflow-hidden`}>
                        <svg
                            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                            preserveAspectRatio="none"
                            className="absolute inset-0 h-full w-full cursor-ew-resize touch-none"
                            onPointerDown={handleSvgPointerDown}
                            onPointerMove={handleSvgPointerMove}
                            onPointerUp={handleSvgPointerUp}
                            onPointerCancel={handleSvgPointerUp}
                        >
                            <line x1={0} x2={0} y1={0} y2={VIEW_H} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            <line x1={0} x2={VIEW_W} y1={VIEW_H} y2={VIEW_H} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            {[0.25, 0.5, 0.75].map((ratio) => (
                                <line key={`x-${ratio}`} x1={VIEW_W * ratio} x2={VIEW_W * ratio} y1={VIEW_H} y2={VIEW_H - 2} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            ))}
                            {[0.25, 0.5, 0.75].map((ratio) => (
                                <line key={`y-${ratio}`} x1={0} x2={2} y1={VIEW_H * ratio} y2={VIEW_H * ratio} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            ))}
                            {!isHelical && axialBedCount > 1 && Array.from({ length: axialBedCount - 1 }, (_, index) => {
                                const x = ((index + 1) / axialBedCount) * VIEW_W;
                                return (
                                    <line
                                        key={`bed-${index}`}
                                        x1={x}
                                        x2={x}
                                        y1={VIEW_H - 4}
                                        y2={VIEW_H}
                                        stroke="#475569"
                                        strokeWidth={0.5}
                                        vectorEffect="non-scaling-stroke"
                                    />
                                );
                            })}
                            <line x1={0} x2={VIEW_W} y1={yLineMax} y2={yLineMax} stroke="#F87171" strokeWidth={0.4} strokeDasharray="1.5,1" opacity={autoMa ? 1 : 0.3} />
                            <line x1={0} x2={VIEW_W} y1={yLineMin} y2={yLineMin} stroke="#F87171" strokeWidth={0.4} strokeDasharray="1.5,1" opacity={autoMa ? 1 : 0.3} />

                            {isHelical ? (
                                <>
                                    {timeWavePath && <path d={timeWavePath} fill="none" stroke={autoMa ? "#60A5FA" : "#475569"} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />}
                                    {cursorSample && timeWaveform.length > 0 && (
                                        <>
                                            <line x1={activePositionRatio * VIEW_W} x2={activePositionRatio * VIEW_W} y1={0} y2={VIEW_H} stroke="#FBBF24" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                                            <circle cx={activePositionRatio * VIEW_W} cy={yOf(cursorSample.ma)} r={1.5} fill="#FBBF24" vectorEffect="non-scaling-stroke" />
                                        </>
                                    )}
                                </>
                            ) : (
                                <>
                                    {cursorIdx !== null && axialBedCount > 0 && (
                                        <rect
                                            x={(cursorIdx / axialBedCount) * VIEW_W}
                                            y={0}
                                            width={VIEW_W / axialBedCount}
                                            height={VIEW_H}
                                            fill="#FBBF24"
                                            opacity={0.08}
                                        />
                                    )}
                                    {axialTimePaths.map((path, index) => (
                                        <path
                                            key={`axial-time-${index}`}
                                            d={path}
                                            fill="none"
                                            stroke={autoMa ? "#60A5FA" : "#475569"}
                                            strokeWidth={0.65}
                                            vectorEffect="non-scaling-stroke"
                                        />
                                    ))}
                                    {axialCursorMa !== null && (
                                        <>
                                            <line
                                                x1={cursorIdx !== null && axialBedCount > 0 ? ((cursorIdx + 0.5) / axialBedCount) * VIEW_W : activePositionRatio * VIEW_W}
                                                x2={cursorIdx !== null && axialBedCount > 0 ? ((cursorIdx + 0.5) / axialBedCount) * VIEW_W : activePositionRatio * VIEW_W}
                                                y1={0}
                                                y2={VIEW_H}
                                                stroke="#FBBF24"
                                                strokeWidth={1}
                                                vectorEffect="non-scaling-stroke"
                                            />
                                            <circle
                                                cx={cursorIdx !== null && axialBedCount > 0 ? ((cursorIdx + 0.5) / axialBedCount) * VIEW_W : activePositionRatio * VIEW_W}
                                                cy={yOf(axialCursorMa)}
                                                r={1.5}
                                                fill="#FBBF24"
                                                vectorEffect="non-scaling-stroke"
                                            />
                                        </>
                                    )}
                                </>
                            )}
                        </svg>

                        <div className="absolute left-2 top-1 text-[9px] font-mono leading-tight text-[#94A3B8]">
                            mA <span className="text-[#475569]">↑</span>
                        </div>
                        
                        <div className="absolute left-2 text-[9px] font-mono leading-none text-[#F87171] -translate-y-1/2" style={{ top: `${(yLineMax / VIEW_H) * 100}%` }}>
                            max {Math.round(draftMax)}
                        </div>
                        <div className="absolute left-2 text-[9px] font-mono leading-none text-[#F87171] -translate-y-1/2" style={{ top: `${(yLineMin / VIEW_H) * 100}%` }}>
                            min {Math.round(draftMin)}
                        </div>
                        
                    </div>
                </div>

                <div className="flex w-[240px] shrink-0 flex-col justify-center gap-3 px-4">
                    <RangeControl label="mA 上限 (MAX)" value={draftMax} min={HARD_MIN} max={HARD_MAX} disabled={!autoMa} onChange={handleMaxChange} />
                    <RangeControl label="mA 下限 (MIN)" value={draftMin} min={HARD_MIN} max={HARD_MAX} disabled={!autoMa} onChange={handleMinChange} />

                    <div>
                        <div className="text-[9px] font-black uppercase tracking-tighter text-[#94A3B8]">噪声等级</div>
                        <div className="mt-1.5 grid grid-cols-4 gap-1">
                            {NOISE_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    title={option.desc}
                                    disabled={!autoMa}
                                    onClick={() => onChange({ noise_level: option.value })}
                                    className={`h-[26px] rounded text-[10px] font-bold transition-colors disabled:opacity-40 ${
                                        option.value === noiseLevel
                                            ? "bg-[#2563EB] text-white"
                                            : "bg-[#1E293B] text-[#CBD5E1] hover:bg-[#334155]"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Metric({ label, value, unit, accent = false }: { label: string; value: string; unit?: string; accent?: boolean }) {
    return (
        <span className={`inline-flex items-baseline gap-1 rounded px-2 py-1 ${accent ? "bg-[#FBBF24]/15 ring-1 ring-[#FBBF24]/40" : "bg-[#1E293B]"}`}>
            <span className={`text-[9px] ${accent ? "text-[#FBBF24]/80" : "text-[#64748B]"}`}>{label}</span>
            <span className={`font-bold ${accent ? "text-[#FBBF24]" : "text-[#E2E8F0]"}`}>{value}</span>
            {unit && <span className="text-[9px] text-[#64748B]">{unit}</span>}
        </span>
    );
}

function RangeControl({
    label,
    value,
    min,
    max,
    disabled,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-tighter text-[#94A3B8]">
                <span>{label}</span>
                <span className="font-mono text-[12px] font-bold text-[#E2E8F0]">
                    {Math.round(value)} <span className="text-[9px] font-normal text-[#64748B]">mA</span>
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={1}
                value={Math.round(value)}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                className="auto-ma-slider mt-1.5 w-full disabled:opacity-40"
            />
        </div>
    );
}
