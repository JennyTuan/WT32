import { useCallback, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { useI18n } from "../lib/i18nContext";

// Opaque "noise level" used by the auto-mA slider. Concrete physical meaning
// (target image noise σ, vendor-specific noise index, etc.) is still pending
// from R&D — the slider just transports a number for now.
export type NoiseLevel = number;

// === Noise-level slider tunables ============================================
// These four constants define the noise slider's range, granularity and
// default. They are intentionally kept here at module scope so they can be
// swapped to real product values without touching anything else in the panel
// or its callers.
export const NOISE_SLIDER_MIN = 1;
export const NOISE_SLIDER_MAX = 10;
export const NOISE_SLIDER_STEP = 1;
export const NOISE_SLIDER_DEFAULT = 5;

// PLACEHOLDER noise → mA scale-factor mapping. Higher slider value ⇒ more
// noise tolerated ⇒ less mA. Replace the formula once we have real units.
const computeNoiseFactor = (value: number) => {
    const v = Math.min(NOISE_SLIDER_MAX, Math.max(NOISE_SLIDER_MIN, value));
    return NOISE_SLIDER_DEFAULT / v;
};

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
    // Real physics-derived mA(z) curve from the scout topogram (length need
    // not match `effectiveSteps`; it is resampled by linear interpolation).
    // When omitted, the panel falls back to a synthetic sinusoidal curve.
    realMaCurve?: number[] | null;
};

const HARD_MIN = 20;
const HARD_MAX = 800;
const HELICAL_SAMPLE_COUNT = 80;
const HELICAL_TIME_SAMPLES = 480;
const AXIAL_SAMPLES_PER_BED = 48;
const HELICAL_BEAM_WIDTH_MM = 40;
const VIEW_W = 100;
const VIEW_H = 100;
// One detector bed coverage. The waveform view window snaps to integer
// multiples of this in z (both axial bed steps and helical pan/zoom).
const BED_MM = 19.2;
const ZOOM_FACTOR = 1.4;
const PAN_DRAG_THRESHOLD_PX = 4;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const snapBed = (mm: number) => Math.max(0, Math.round(mm / BED_MM) * BED_MM);
const snapBedUp = (mm: number) => Math.max(BED_MM, Math.ceil(mm / BED_MM) * BED_MM);

const computeStepCount = (scanLength: number, sliceInterval: number, fallback?: number | null) => {
    if (fallback && fallback > 0) return fallback;
    if (!Number.isFinite(scanLength) || !Number.isFinite(sliceInterval) || sliceInterval <= 0) return 1;
    return Math.max(1, Math.round(scanLength / sliceInterval));
};

const resampleCurve = (input: number[], outLen: number): number[] => {
    if (outLen <= 0) return [];
    if (input.length === 0) return Array.from({ length: outLen }, () => 0);
    if (input.length === outLen) return input.slice();
    if (input.length === 1) return Array.from({ length: outLen }, () => input[0]);
    const out = new Array<number>(outLen);
    const lastIn = input.length - 1;
    for (let i = 0; i < outLen; i += 1) {
        const f = outLen === 1 ? 0 : (i / (outLen - 1)) * lastIn;
        const lo = Math.floor(f);
        const hi = Math.min(lastIn, lo + 1);
        const t = f - lo;
        out[i] = input[lo] * (1 - t) + input[hi] * t;
    }
    return out;
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
    noiseLevel = NOISE_SLIDER_DEFAULT,
    realMaCurve,
}: AutoMaPanelProps) {
    const { t } = useI18n();
    const [draftRange, setDraftRange] = useState(() => ({
        sourceMin: maMin,
        sourceMax: maMax,
        min: maMin,
        max: maMax,
    }));
    const [internalPositionRatio, setInternalPositionRatio] = useState(0.5);
    const [viewStartMm, setViewStartMm] = useState(0);
    // 0 means "auto: full scan range". Any positive value is a user-chosen
    // window width (already snapped to BED_MM).
    const [viewWidthMm, setViewWidthMm] = useState(0);
    const debounceRef = useRef<number | null>(null);
    const pointerStateRef = useRef<{
        pointerId: number;
        startClientX: number;
        startViewStartMm: number;
        mode: "idle" | "pan";
    } | null>(null);

    const syncedDraftRange =
        draftRange.sourceMin === maMin && draftRange.sourceMax === maMax
            ? draftRange
            : {
                sourceMin: maMin,
                sourceMax: maMax,
                min: draftRange.sourceMin === maMin ? draftRange.min : maMin,
                max: draftRange.sourceMax === maMax ? draftRange.max : maMax,
            };
    if (syncedDraftRange !== draftRange) {
        setDraftRange(syncedDraftRange);
    }
    const draftMin = syncedDraftRange.min;
    const draftMax = syncedDraftRange.max;

    const isHelical = mode === "helical";
    const effectiveSliceInterval = sliceInterval ?? 0;
    const effectiveSteps = isHelical ? HELICAL_SAMPLE_COUNT : computeStepCount(scanLength, effectiveSliceInterval, stepCount);
    const noiseFactor = computeNoiseFactor(noiseLevel);
    const activePositionRatio = clamp01(scanPositionRatio ?? internalPositionRatio);

    const curve = useMemo(() => {
        let base: number[];
        if (autoMa && realMaCurve && realMaCurve.length > 0) {
            // Resample the physics curve to `effectiveSteps` by linear
            // interpolation so axial bed count / helical sample count both work.
            base = resampleCurve(realMaCurve, effectiveSteps);
        } else if (autoMa) {
            base = generatePositionMaCurve(effectiveSteps, draftMin, draftMax);
        } else {
            base = Array.from({ length: effectiveSteps }, () => fallbackMa);
        }
        return base.map((value) => Math.round(clamp(value * noiseFactor, HARD_MIN, HARD_MAX)));
    }, [autoMa, draftMax, draftMin, effectiveSteps, fallbackMa, noiseFactor, realMaCurve]);

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
        if (realMaCurve && realMaCurve.length > 0) {
            // Drive the time-domain helical waveform's slow-varying centre with
            // the physics-derived mA(z) curve, keep the θ (tube-angle) ripple
            // from the synthetic generator.
            const totalTime = helicalTiming.totalTime;
            const span = Math.max(1, draftMax - draftMin);
            const lastIdx = realMaCurve.length - 1;
            return Array.from({ length: 480 }, (_, i) => {
                const u = i / 479;
                const t = u * totalTime;
                const f = u * lastIdx;
                const lo = Math.floor(f);
                const hi = Math.min(lastIdx, lo + 1);
                const center = realMaCurve[lo] * (1 - (f - lo)) + realMaCurve[hi] * (f - lo);
                const theta = (t / rotationTime) * Math.PI * 2;
                const radiusFactor = 0.5 + 0.4 * Math.cos(u * Math.PI * 2 - Math.PI) + 0.1 * Math.sin(u * Math.PI * 5);
                const amp = (span / 2) * 0.55 * clamp(radiusFactor, 0.15, 1);
                const ma = clamp((center + amp * -Math.cos(2 * theta)) * noiseFactor, HARD_MIN, HARD_MAX);
                return {
                    t,
                    ma,
                    z: u * scanLength,
                    theta: ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
                };
            });
        }
        return generateHelicalTimeWaveform(helicalTiming.totalTime, rotationTime, scanLength, draftMin, draftMax).map((sample) => ({
            ...sample,
            ma: clamp(sample.ma * noiseFactor, HARD_MIN, HARD_MAX),
        }));
    }, [autoMa, draftMax, draftMin, helicalTiming, isHelical, noiseFactor, rotationTime, scanLength, realMaCurve]);

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
    const yOf = useCallback((ma: number) => VIEW_H - ((ma - yViewMin) / yViewSpan) * VIEW_H, [yViewMin, yViewSpan]);
    const yLineMin = yOf(draftMin);
    const yLineMax = yOf(draftMax);

    // Z-axis viewport (in mm). totalSnapped rounds the scan length up to the
    // next bed boundary so the rightmost gridline always lands on a bed edge.
    const totalSnapped = scanLength > 0 ? snapBedUp(scanLength) : BED_MM;
    const requestedWidth = viewWidthMm > 0 ? snapBed(viewWidthMm) : totalSnapped;
    const effViewWidthMm = clamp(requestedWidth, BED_MM, totalSnapped);
    const maxStart = Math.max(0, totalSnapped - effViewWidthMm);
    const effViewStartMm = clamp(snapBed(viewStartMm), 0, maxStart);
    const effViewEndMm = effViewStartMm + effViewWidthMm;
    const totalBedCount = Math.max(1, Math.round(totalSnapped / BED_MM));
    const zToX = useCallback((zMm: number) => ((zMm - effViewStartMm) / effViewWidthMm) * VIEW_W, [effViewStartMm, effViewWidthMm]);
    const isZoomedOrPanned = effViewWidthMm < totalSnapped - 1e-6 || effViewStartMm > 1e-6;

    const timeWavePath = useMemo(() => {
        if (!timeWaveform.length) return "";
        return timeWaveform
            .map((sample, i) => {
                const x = zToX(sample.z);
                return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${yOf(sample.ma).toFixed(2)}`;
            })
            .join(" ");
    }, [timeWaveform, yOf, zToX]);

    const axialBedWidthMm = effectiveSteps > 0 && scanLength > 0 ? scanLength / effectiveSteps : BED_MM;
    const axialTimePaths = useMemo(() => {
        const bedCount = Math.max(1, effectiveSteps);
        if (!axialTimeWaveform.length || bedCount <= 0) return [];
        return Array.from({ length: bedCount }, (_, bedIndex) => {
            const samples = axialTimeWaveform.filter((sample) => sample.bedIndex === bedIndex);
            return samples
                .map((sample, index) => {
                    const localRatio = rotationTime > 0 ? (sample.t - bedIndex * rotationTime) / rotationTime : 0;
                    const zMm = (bedIndex + localRatio) * axialBedWidthMm;
                    const x = zToX(zMm);
                    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${yOf(sample.ma).toFixed(2)}`;
                })
                .join(" ");
        });
    }, [axialTimeWaveform, axialBedWidthMm, effectiveSteps, rotationTime, yOf, zToX]);

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

    const scrubAtClientX = (clientX: number, target: SVGSVGElement) => {
        if (isHelical && !timeWaveform.length) return;
        if (!isHelical && !curve.length) return;
        if (!(scanLength > 0)) return;
        const rect = target.getBoundingClientRect();
        const localRatio = clamp01((clientX - rect.left) / Math.max(1, rect.width));
        const zMm = effViewStartMm + localRatio * effViewWidthMm;
        updatePositionRatio(clamp01(zMm / scanLength));
    };

    const handleSvgPointerDown = (event: PointerEvent<SVGSVGElement>) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        pointerStateRef.current = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startViewStartMm: effViewStartMm,
            mode: "idle",
        };
    };

    const handleSvgPointerMove = (event: PointerEvent<SVGSVGElement>) => {
        const state = pointerStateRef.current;
        if (!state || state.pointerId !== event.pointerId) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const dx = event.clientX - state.startClientX;
        if (state.mode === "idle" && Math.abs(dx) > PAN_DRAG_THRESHOLD_PX) {
            state.mode = "pan";
        }
        if (state.mode === "pan") {
            const dmm = -(dx / Math.max(1, rect.width)) * effViewWidthMm;
            const next = clamp(snapBed(state.startViewStartMm + dmm), 0, maxStart);
            setViewStartMm(next);
        }
    };

    const handleSvgPointerUp = (event: PointerEvent<SVGSVGElement>) => {
        const state = pointerStateRef.current;
        if (state && state.pointerId === event.pointerId && state.mode === "idle") {
            scrubAtClientX(event.clientX, event.currentTarget);
        }
        pointerStateRef.current = null;
    };

    const handleSvgWheel = (event: WheelEvent<SVGSVGElement>) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const localRatio = clamp01((event.clientX - rect.left) / Math.max(1, rect.width));
        const focusMm = effViewStartMm + localRatio * effViewWidthMm;
        const factor = event.deltaY < 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
        const nextWidth = clamp(snapBed(effViewWidthMm * factor), BED_MM, totalSnapped);
        const nextMaxStart = Math.max(0, totalSnapped - nextWidth);
        const nextStart = clamp(snapBed(focusMm - localRatio * nextWidth), 0, nextMaxStart);
        setViewWidthMm(nextWidth >= totalSnapped - 1e-6 ? 0 : nextWidth);
        setViewStartMm(nextStart);
    };

    const handleSvgDoubleClick = () => {
        setViewWidthMm(0);
        setViewStartMm(0);
    };

    const flush = (patch: { ma_min?: number; ma_max?: number }) => {
        if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => onChange(patch), 200);
    };

    const handleMinChange = (raw: string) => {
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        const clamped = clamp(value, HARD_MIN, draftMax - 5);
        setDraftRange((current) => ({ ...current, min: clamped }));
        flush({ ma_min: clamped });
    };

    const handleMaxChange = (raw: string) => {
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        const clamped = clamp(value, draftMin + 5, HARD_MAX);
        setDraftRange((current) => ({ ...current, max: clamped }));
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
                            </>
                        ) : !isHelical && axialCursorMa !== null && autoMa ? (
                            <>
                                <Metric label="bed" value={`${axialBedNumber}/${axialBedCount}`} />
                                <Metric label="t" value={axialCursorTime.toFixed(2)} unit="s" />
                                <Metric label="Z" value={axialCursorZ.toFixed(1)} unit="mm" />
                                <Metric label="mA" value={`${Math.round(axialCursorMa)}`} accent />
                            </>
                        ) : (
                            <span className="text-[9px] text-[#64748B]">滚轮/按钮缩放 · 拖拽平移 · 单击定位 · 双击重置</span>
                        )}
                    </div>

                    <div className="relative h-[120px] overflow-hidden">
                        <svg
                            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                            preserveAspectRatio="none"
                            className={`absolute inset-0 h-full w-full touch-none ${isZoomedOrPanned ? "cursor-grab" : "cursor-crosshair"}`}
                            onPointerDown={handleSvgPointerDown}
                            onPointerMove={handleSvgPointerMove}
                            onPointerUp={handleSvgPointerUp}
                            onPointerCancel={handleSvgPointerUp}
                            onWheel={handleSvgWheel}
                            onDoubleClick={handleSvgDoubleClick}
                        >
                            <line x1={0} x2={0} y1={0} y2={VIEW_H} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            <line x1={0} x2={VIEW_W} y1={VIEW_H} y2={VIEW_H} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            {[0.25, 0.5, 0.75].map((ratio) => (
                                <line key={`x-${ratio}`} x1={VIEW_W * ratio} x2={VIEW_W * ratio} y1={VIEW_H} y2={VIEW_H - 2} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            ))}
                            {[0.25, 0.5, 0.75].map((ratio) => (
                                <line key={`y-${ratio}`} x1={0} x2={2} y1={VIEW_H * ratio} y2={VIEW_H * ratio} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            ))}
                            {Array.from({ length: totalBedCount + 1 }, (_, index) => {
                                const zMm = index * BED_MM;
                                if (zMm < effViewStartMm - 1e-6 || zMm > effViewEndMm + 1e-6) return null;
                                const x = zToX(zMm);
                                // Major tick on every 5th bed when fully zoomed out so it stays readable.
                                const isMajor = totalBedCount > 12 ? index % 5 === 0 : true;
                                return (
                                    <line
                                        key={`bed-${index}`}
                                        x1={x}
                                        x2={x}
                                        y1={VIEW_H - (isMajor ? 4 : 2)}
                                        y2={VIEW_H}
                                        stroke={isMajor ? "#475569" : "#334155"}
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
                                    {cursorSample && timeWaveform.length > 0 && (() => {
                                        const cx = zToX(activePositionRatio * scanLength);
                                        if (cx < -0.5 || cx > VIEW_W + 0.5) return null;
                                        return (
                                            <>
                                                <line x1={cx} x2={cx} y1={0} y2={VIEW_H} stroke="#FBBF24" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                                                <circle cx={cx} cy={yOf(cursorSample.ma)} r={1.5} fill="#FBBF24" vectorEffect="non-scaling-stroke" />
                                            </>
                                        );
                                    })()}
                                </>
                            ) : (
                                <>
                                    {cursorIdx !== null && axialBedCount > 0 && (() => {
                                        const xLeft = zToX(cursorIdx * axialBedWidthMm);
                                        const xRight = zToX((cursorIdx + 1) * axialBedWidthMm);
                                        if (xRight < 0 || xLeft > VIEW_W) return null;
                                        return (
                                            <rect
                                                x={Math.max(0, xLeft)}
                                                y={0}
                                                width={Math.max(0, Math.min(VIEW_W, xRight) - Math.max(0, xLeft))}
                                                height={VIEW_H}
                                                fill="#FBBF24"
                                                opacity={0.08}
                                            />
                                        );
                                    })()}
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
                                    {axialCursorMa !== null && (() => {
                                        const cx = cursorIdx !== null && axialBedCount > 0
                                            ? zToX((cursorIdx + 0.5) * axialBedWidthMm)
                                            : zToX(activePositionRatio * scanLength);
                                        if (cx < -0.5 || cx > VIEW_W + 0.5) return null;
                                        return (
                                            <>
                                                <line x1={cx} x2={cx} y1={0} y2={VIEW_H} stroke="#FBBF24" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                                                <circle cx={cx} cy={yOf(axialCursorMa)} r={1.5} fill="#FBBF24" vectorEffect="non-scaling-stroke" />
                                            </>
                                        );
                                    })()}
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
                    <RangeControl label={t("scanFlow.autoMa.max")} value={draftMax} min={HARD_MIN} max={HARD_MAX} disabled={!autoMa} onChange={handleMaxChange} />
                    <RangeControl label={t("scanFlow.autoMa.min")} value={draftMin} min={HARD_MIN} max={HARD_MAX} disabled={!autoMa} onChange={handleMinChange} />

                    <RangeControl
                        label={t("scanFlow.autoMa.noiseLevel")}
                        value={noiseLevel}
                        min={NOISE_SLIDER_MIN}
                        max={NOISE_SLIDER_MAX}
                        step={NOISE_SLIDER_STEP}
                        unit=""
                        disabled={!autoMa}
                        onChange={(raw) => {
                            const v = Number(raw);
                            if (!Number.isFinite(v)) return;
                            onChange({ noise_level: Math.min(NOISE_SLIDER_MAX, Math.max(NOISE_SLIDER_MIN, v)) });
                        }}
                    />
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
    unit = "mA",
    step = 1,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    disabled: boolean;
    onChange: (value: string) => void;
    unit?: string;
    step?: number;
}) {
    const display = step >= 1 ? String(Math.round(value)) : value.toFixed(1);
    const sliderValue = step >= 1 ? Math.round(value) : value;
    return (
        <div>
            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-tighter text-[#94A3B8]">
                <span>{label}</span>
                <span className="font-mono text-[12px] font-bold text-[#E2E8F0]">
                    {display}
                    {unit && <span className="ml-1 text-[9px] font-normal text-[#64748B]">{unit}</span>}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={sliderValue}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                className="auto-ma-slider mt-1.5 w-full disabled:opacity-40"
            />
        </div>
    );
}
