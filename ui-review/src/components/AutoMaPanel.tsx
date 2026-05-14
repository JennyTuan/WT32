import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Activity } from "lucide-react";

export type AutoMaPanelProps = {
    mode?: "axial" | "helical";
    autoMa: boolean;
    maMin: number;
    maMax: number;
    fallbackMa: number;
    scanLength: number;
    rotationTime: number;
    // axial 专用：床位间隔与步数
    sliceInterval?: number;
    stepCount?: number | null;
    // helical 专用：螺距
    pitch?: number;
    onChange: (patch: { auto_ma?: boolean; ma_min?: number; ma_max?: number; noise_level?: NoiseLevel }) => void;
    noiseLevel?: NoiseLevel;
};

export type NoiseLevel = "low" | "standard" | "medium" | "high";
const NOISE_OPTIONS: { value: NoiseLevel; label: string; desc: string }[] = [
    { value: "low", label: "低噪声", desc: "高 mA · 高剂量" },
    { value: "standard", label: "标准", desc: "默认" },
    { value: "medium", label: "较高", desc: "低 mA" },
    { value: "high", label: "高噪声", desc: "最低剂量" },
];
// 噪声等级 → mA 整体偏置倍数（噪声越低，mA 越高）
const NOISE_FACTOR: Record<NoiseLevel, number> = {
    low: 1.2,
    standard: 1.0,
    medium: 0.85,
    high: 0.7,
};

const HARD_MIN = 20;
const HARD_MAX = 800;
const HELICAL_SAMPLE_COUNT = 80;
const HELICAL_TIME_SAMPLES = 480; // 时间波形采样点数，密一点保证振荡可见
const HELICAL_BEAM_WIDTH_MM = 40; // 假设的总束宽（mm/rot），用于由 pitch × beam → 床速

const computeStepCount = (scanLength: number, sliceInterval: number, fallback?: number | null) => {
    if (fallback && fallback > 0) return fallback;
    if (!Number.isFinite(scanLength) || !Number.isFinite(sliceInterval) || sliceInterval <= 0) return 1;
    return Math.max(1, Math.round(scanLength / sliceInterval));
};

// 模拟"定位像衰减/体型估计 → 床位 mA"。原型用对称偏中带轻微上下波动的伪曲线，
// 底层语义是"床位位置 → mA"。真实算法依赖定位像数据和厂商 AEC 实现。
const generatePositionMaCurve = (
    sampleCount: number,
    maMin: number,
    maMax: number,
): number[] => {
    if (sampleCount <= 0) return [];
    if (sampleCount === 1) return [Math.round((maMin + maMax) / 2)];
    const out: number[] = [];
    const span = Math.max(1, maMax - maMin);
    for (let i = 0; i < sampleCount; i += 1) {
        const t = i / (sampleCount - 1);
        const bell = Math.sin(t * Math.PI);
        const wobble = 0.08 * Math.sin(t * Math.PI * 4 + 0.7);
        const norm = Math.max(0, Math.min(1, bell + wobble));
        const value = maMin + norm * span;
        out.push(Math.round(value));
    }
    return out;
};

// 在每个 Z 位置上，因横截面接近椭圆（AP 薄、LAT 厚），角度调制会在 mA 中线上下波动。
// 调制振幅本身也随 Z 变化：肩部/上腹部 AP-LAT 差大，振幅大；薄部位（如颈、肺中段）振幅小。
// 这里返回每个 Z 采样点的 (lateral mA, ap mA)，画图时用作包络带。
const generateEnvelope = (
    centerCurve: number[],
    maMin: number,
    maMax: number,
): { lat: number[]; ap: number[] } => {
    const span = Math.max(1, maMax - maMin);
    const lat: number[] = [];
    const ap: number[] = [];
    centerCurve.forEach((c, i) => {
        const t = centerCurve.length > 1 ? i / (centerCurve.length - 1) : 0.5;
        // 随 Z 变化的振幅：两端（肩/盆）大，中段小，再叠一点波动
        const radiusFactor = 0.5 + 0.4 * Math.cos(t * Math.PI * 2 - Math.PI) + 0.1 * Math.sin(t * Math.PI * 5);
        const amp = (span / 2) * 0.55 * Math.max(0.15, Math.min(1, radiusFactor));
        lat.push(Math.round(Math.min(maMax, c + amp)));
        ap.push(Math.round(Math.max(maMin, c - amp)));
    });
    return { lat, ap };
};

// 螺旋时间波形：以时间 t 为横轴，mA(t) = Z 包络 × 角度调制
// Z(t) = scanLength × (t/T)（线性床进），θ(t) = 2π × t / rotationTime
// 返回每个采样点的 { t, ma, z, theta }
type TimeSample = { t: number; ma: number; z: number; theta: number };
const generateHelicalTimeWaveform = (
    totalTime: number,
    rotationTime: number,
    scanLength: number,
    maMin: number,
    maMax: number,
): TimeSample[] => {
    if (!(totalTime > 0) || !(rotationTime > 0)) return [];
    const out: TimeSample[] = [];
    const span = Math.max(1, maMax - maMin);
    for (let i = 0; i < HELICAL_TIME_SAMPLES; i += 1) {
        const t = (i / (HELICAL_TIME_SAMPLES - 1)) * totalTime;
        const u = t / totalTime; // 0..1 沿扫描长度
        // Z 方向衰减/体型包络（钟形 + 轻微波动）
        const bell = Math.sin(u * Math.PI);
        const wobble = 0.08 * Math.sin(u * Math.PI * 4 + 0.7);
        const norm = Math.max(0, Math.min(1, bell + wobble));
        const center = maMin + norm * span;
        // 角度调制：周期 = rotationTime，AP 谷、LAT 峰；振幅随体型变化
        const theta = (t / rotationTime) * Math.PI * 2;
        const radiusFactor = 0.5 + 0.4 * Math.cos(u * Math.PI * 2 - Math.PI) + 0.1 * Math.sin(u * Math.PI * 5);
        const amp = (span / 2) * 0.55 * Math.max(0.15, Math.min(1, radiusFactor));
        const ma = center + amp * (-Math.cos(2 * theta));
        out.push({
            t,
            ma: Math.max(maMin, Math.min(maMax, ma)),
            z: u * scanLength,
            theta: ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
        });
    }
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
    onChange,
    noiseLevel = "standard",
}: AutoMaPanelProps) {
    const [draftMin, setDraftMin] = useState(maMin);
    const [draftMax, setDraftMax] = useState(maMax);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const debounceRef = useRef<number | null>(null);

    useEffect(() => setDraftMin(maMin), [maMin]);
    useEffect(() => setDraftMax(maMax), [maMax]);

    const flush = (patch: { ma_min?: number; ma_max?: number }) => {
        if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => onChange(patch), 200);
    };

    const isHelical = mode === "helical";
    const effectiveSliceInterval = sliceInterval ?? 0;
    const effectiveSteps = isHelical
        ? HELICAL_SAMPLE_COUNT
        : computeStepCount(scanLength, effectiveSliceInterval, stepCount);
    const noiseFactor = NOISE_FACTOR[noiseLevel];
    const curve = useMemo(() => {
        const base = autoMa
            ? generatePositionMaCurve(effectiveSteps, draftMin, draftMax)
            : Array.from({ length: effectiveSteps }, () => fallbackMa);
        return base.map((v) => Math.round(Math.max(HARD_MIN, Math.min(HARD_MAX, v * noiseFactor))));
    }, [autoMa, effectiveSteps, draftMin, draftMax, fallbackMa, noiseFactor]);

    const envelope = useMemo(
        () => (autoMa ? generateEnvelope(curve, draftMin, draftMax) : { lat: curve, ap: curve }),
        [autoMa, curve, draftMin, draftMax],
    );

    // 螺旋扫描的时间波形（X 轴 = 时间）
    const helicalTiming = useMemo(() => {
        if (!isHelical) return null;
        const pitchValue = pitch && pitch > 0 ? pitch : 1;
        const tableSpeed = (pitchValue * HELICAL_BEAM_WIDTH_MM) / Math.max(0.1, rotationTime); // mm/s
        const totalTime = tableSpeed > 0 && scanLength > 0 ? scanLength / tableSpeed : 0;
        const rotations = totalTime > 0 ? totalTime / rotationTime : 0;
        return { totalTime, rotations, tableSpeed };
    }, [isHelical, pitch, rotationTime, scanLength]);

    const timeWaveform = useMemo<TimeSample[]>(() => {
        if (!isHelical || !helicalTiming || !autoMa) return [];
        const raw = generateHelicalTimeWaveform(
            helicalTiming.totalTime,
            rotationTime,
            scanLength,
            draftMin,
            draftMax,
        );
        // 应用噪声等级偏置（同 Z 曲线一致）
        return raw.map((s) => ({
            ...s,
            ma: Math.max(HARD_MIN, Math.min(HARD_MAX, s.ma * noiseFactor)),
        }));
    }, [isHelical, helicalTiming, autoMa, rotationTime, scanLength, draftMin, draftMax, noiseFactor]);

    // Y 轴视图范围：在 min/max 上下留一点边距，让波形占满高度
    const yViewMin = Math.max(0, draftMin - (draftMax - draftMin) * 0.05);
    const yViewMax = draftMax + (draftMax - draftMin) * 0.05;
    const yViewSpan = Math.max(1, yViewMax - yViewMin);
    const yOf = (ma: number) => VIEW_H - ((ma - yViewMin) / yViewSpan) * VIEW_H;
    const yMaxView = yViewMax; // 兼容旧引用
    const VIEW_W = 100;
    const VIEW_H = 100;

    const polyline = (values: number[]): string => {
        if (!values.length) return "";
        if (isHelical) {
            const dx = VIEW_W / Math.max(1, values.length - 1);
            return values
                .map((ma, i) => {
                    const x = i * dx;
                    const y = yOf(ma);
                    return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
                })
                .join(" ");
        }
        const dx = VIEW_W / values.length;
        let d = "";
        values.forEach((ma, i) => {
            const x0 = i * dx;
            const x1 = (i + 1) * dx;
            const y = yOf(ma);
            d += i === 0 ? `M ${x0.toFixed(2)} ${y.toFixed(2)}` : ` L ${x0.toFixed(2)} ${y.toFixed(2)}`;
            d += ` L ${x1.toFixed(2)} ${y.toFixed(2)}`;
        });
        return d;
    };

    const centerPath = useMemo(() => polyline(curve), [curve, yMaxView, isHelical]);
    const latPath = useMemo(() => polyline(envelope.lat), [envelope.lat, yMaxView, isHelical]);
    const apPath = useMemo(() => polyline(envelope.ap), [envelope.ap, yMaxView, isHelical]);
    // 带状填充：LAT 上沿 → 反向 AP 下沿 → 闭合
    const bandPath = useMemo(() => {
        if (!envelope.lat.length) return "";
        if (isHelical) {
            const dx = VIEW_W / Math.max(1, envelope.lat.length - 1);
            const top = envelope.lat.map((ma, i) => `${i === 0 ? "M" : "L"} ${(i * dx).toFixed(2)} ${yOf(ma).toFixed(2)}`).join(" ");
            const bot = [...envelope.ap].reverse().map((ma, idx) => {
                const i = envelope.ap.length - 1 - idx;
                return `L ${(i * dx).toFixed(2)} ${yOf(ma).toFixed(2)}`;
            }).join(" ");
            return `${top} ${bot} Z`;
        }
        // 断层：每个床位是一个矩形带，LAT 上沿 / AP 下沿都按阶梯
        const dx = VIEW_W / envelope.lat.length;
        const topSegs: string[] = [];
        envelope.lat.forEach((ma, i) => {
            const x0 = i * dx;
            const x1 = (i + 1) * dx;
            const y = yOf(ma);
            topSegs.push(i === 0 ? `M ${x0.toFixed(2)} ${y.toFixed(2)}` : `L ${x0.toFixed(2)} ${y.toFixed(2)}`);
            topSegs.push(`L ${x1.toFixed(2)} ${y.toFixed(2)}`);
        });
        const botSegs: string[] = [];
        for (let i = envelope.ap.length - 1; i >= 0; i -= 1) {
            const ma = envelope.ap[i];
            const x0 = i * dx;
            const x1 = (i + 1) * dx;
            const y = yOf(ma);
            botSegs.push(`L ${x1.toFixed(2)} ${y.toFixed(2)}`);
            botSegs.push(`L ${x0.toFixed(2)} ${y.toFixed(2)}`);
        }
        return `${topSegs.join(" ")} ${botSegs.join(" ")} Z`;
    }, [envelope, yMaxView, isHelical]);

    const yLineMin = yOf(draftMin);
    const yLineMax = yOf(draftMax);

    const timeWavePath = useMemo(() => {
        if (!timeWaveform.length) return "";
        const total = timeWaveform[timeWaveform.length - 1].t || 1;
        return timeWaveform
            .map((s, i) => {
                const x = (s.t / total) * VIEW_W;
                const y = yOf(s.ma);
                return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join(" ");
    }, [timeWaveform, yViewMin, yViewSpan]);

    // 触摸 / 鼠标 scrubber：默认指向波形中点，用户拖动/点击改变位置
    const defaultIdx = timeWaveform.length > 0 ? Math.floor(timeWaveform.length / 2) : null;
    const cursorIdx = hoverIdx !== null ? hoverIdx : defaultIdx;
    const cursorSample = cursorIdx !== null ? timeWaveform[cursorIdx] : null;
    const scrubbingRef = useRef(false);
    const updateCursor = (clientX: number, target: SVGSVGElement) => {
        if (!timeWaveform.length) return;
        const rect = target.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        setHoverIdx(Math.round(ratio * (timeWaveform.length - 1)));
    };
    const handleSvgPointerDown = (e: MouseEvent<SVGSVGElement>) => {
        scrubbingRef.current = true;
        try { e.currentTarget.setPointerCapture((e as unknown as { pointerId: number }).pointerId); } catch {}
        updateCursor(e.clientX, e.currentTarget);
    };
    const handleSvgPointerMove = (e: MouseEvent<SVGSVGElement>) => {
        if (!scrubbingRef.current) return;
        updateCursor(e.clientX, e.currentTarget);
    };
    const handleSvgPointerUp = () => {
        scrubbingRef.current = false;
    };

    const handleMinChange = (raw: string) => {
        const v = Number(raw);
        if (!Number.isFinite(v)) return;
        const clamped = Math.max(HARD_MIN, Math.min(draftMax - 5, v));
        setDraftMin(clamped);
        flush({ ma_min: clamped });
    };
    const handleMaxChange = (raw: string) => {
        const v = Number(raw);
        if (!Number.isFinite(v)) return;
        const clamped = Math.min(HARD_MAX, Math.max(draftMin + 5, v));
        setDraftMax(clamped);
        flush({ ma_max: clamped });
    };

    return (
        <div className="shrink-0 border-t border-white/10 bg-[#0F172A] text-[#CBD5E1]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-[36px] border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <Activity size={13} className="text-[#60A5FA]" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#E2E8F0]">
                        智能剂量调节
                    </span>

                </div>
            </div>

            <div className="flex px-4 py-3 divide-x divide-white/10">
                {/* 主图：螺旋用时间波形，断层用 LAT/AP 包络带 */}
                <div className="flex-1 min-w-0 pr-4">
                    {!isHelical && (
                        <div className="mb-1 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[#94A3B8]">
                            <span>Z 轴调制 · 床位 → mA</span>
                            <span className="ml-2 inline-flex items-center gap-1 text-[#34D399] normal-case tracking-normal">
                                <span className="inline-block h-[2px] w-3 bg-[#34D399]" />LAT
                            </span>
                            <span className="inline-flex items-center gap-1 text-[#F472B6] normal-case tracking-normal">
                                <span className="inline-block h-[2px] w-3 bg-[#F472B6]" />AP
                            </span>
                            <span className="inline-flex items-center gap-1 text-[#60A5FA] normal-case tracking-normal">
                                <span className="inline-block h-[2px] w-3 bg-[#60A5FA]" />中线
                            </span>
                        </div>
                    )}
                    {isHelical && (
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono">
                            {cursorSample && autoMa ? (
                                <>
                                    <span className="inline-flex items-baseline gap-1 rounded bg-[#1E293B] px-2 py-1">
                                        <span className="text-[#64748B] text-[9px]">t</span>
                                        <span className="text-[#E2E8F0] font-bold">{cursorSample.t.toFixed(2)}</span>
                                        <span className="text-[#64748B] text-[9px]">s</span>
                                    </span>
                                    <span className="inline-flex items-baseline gap-1 rounded bg-[#1E293B] px-2 py-1">
                                        <span className="text-[#64748B] text-[9px]">Z</span>
                                        <span className="text-[#E2E8F0] font-bold">{cursorSample.z.toFixed(1)}</span>
                                        <span className="text-[#64748B] text-[9px]">mm</span>
                                    </span>
                                    <span className="inline-flex items-baseline gap-1 rounded bg-[#1E293B] px-2 py-1">
                                        <span className="text-[#64748B] text-[9px]">θ</span>
                                        <span className="text-[#E2E8F0] font-bold">{((cursorSample.theta * 180) / Math.PI).toFixed(0)}</span>
                                        <span className="text-[#64748B] text-[9px]">°</span>
                                    </span>
                                    <span className="inline-flex items-baseline gap-1 rounded bg-[#FBBF24]/15 ring-1 ring-[#FBBF24]/40 px-2 py-1">
                                        <span className="text-[#FBBF24]/80 text-[9px]">mA</span>
                                        <span className="text-[#FBBF24] font-bold">{Math.round(cursorSample.ma)}</span>
                                    </span>
                                    <span className="ml-auto text-[9px] text-[#64748B]">← 拖动游标查看任意时刻</span>
                                </>
                            ) : (
                                <span className="text-[9px] text-[#64748B]">启用 Auto mA 后，点击/拖动波形查看任意时刻的 t / Z / θ / mA</span>
                            )}
                        </div>
                    )}
                    <div className={`relative ${isHelical ? "h-[150px]" : "h-[120px]"} overflow-hidden`}>
                        <svg
                            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                            preserveAspectRatio="none"
                            className={`absolute inset-0 h-full w-full ${isHelical ? "cursor-ew-resize touch-none" : ""}`}
                            onPointerDown={isHelical ? handleSvgPointerDown : undefined}
                            onPointerMove={isHelical ? handleSvgPointerMove : undefined}
                            onPointerUp={isHelical ? handleSvgPointerUp : undefined}
                            onPointerCancel={isHelical ? handleSvgPointerUp : undefined}
                        >
                            {/* 坐标轴 */}
                            <line x1={0} x2={0} y1={0} y2={VIEW_H} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            <line x1={0} x2={VIEW_W} y1={VIEW_H} y2={VIEW_H} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            {/* 坐标轴刻度 */}
                            {[0.25, 0.5, 0.75].map((r) => (
                                <line key={`xt${r}`} x1={VIEW_W * r} x2={VIEW_W * r} y1={VIEW_H} y2={VIEW_H - 2} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            ))}
                            {[0.25, 0.5, 0.75].map((r) => (
                                <line key={`yt${r}`} x1={0} x2={2} y1={VIEW_H * r} y2={VIEW_H * r} stroke="#94A3B8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            ))}
                            {/* min/max 红虚线 */}
                            <line x1={0} x2={VIEW_W} y1={yLineMax} y2={yLineMax} stroke="#F87171" strokeWidth={0.4} strokeDasharray="1.5,1" opacity={autoMa ? 1 : 0.3} />
                            <line x1={0} x2={VIEW_W} y1={yLineMin} y2={yLineMin} stroke="#F87171" strokeWidth={0.4} strokeDasharray="1.5,1" opacity={autoMa ? 1 : 0.3} />
                            {isHelical ? (
                                <>
                                    {timeWavePath && (
                                        <path d={timeWavePath} fill="none" stroke={autoMa ? "#60A5FA" : "#475569"} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                                    )}
                                    {cursorSample && timeWaveform.length > 0 && (() => {
                                        const lastT = timeWaveform[timeWaveform.length - 1].t || 1;
                                        const x = (cursorSample.t / lastT) * VIEW_W;
                                        return (
                                            <>
                                                <line x1={x} x2={x} y1={0} y2={VIEW_H} stroke="#FBBF24" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                                                <circle cx={x} cy={yOf(cursorSample.ma)} r={1.5} fill="#FBBF24" vectorEffect="non-scaling-stroke" />
                                            </>
                                        );
                                    })()}
                                </>
                            ) : (
                                <>
                                    {bandPath && (
                                        <path d={bandPath} fill={autoMa ? "#60A5FA" : "#475569"} opacity={autoMa ? 0.18 : 0.1} vectorEffect="non-scaling-stroke" />
                                    )}
                                    {latPath && (
                                        <path d={latPath} fill="none" stroke={autoMa ? "#34D399" : "#475569"} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                                    )}
                                    {apPath && (
                                        <path d={apPath} fill="none" stroke={autoMa ? "#F472B6" : "#475569"} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                                    )}
                                    {centerPath && (
                                        <path d={centerPath} fill="none" stroke={autoMa ? "#60A5FA" : "#475569"} strokeWidth={0.6} strokeDasharray="2,1" vectorEffect="non-scaling-stroke" />
                                    )}
                                </>
                            )}
                        </svg>
                        {/* 轴标签 */}
                        <div className="absolute top-1 left-2 text-[9px] font-mono text-[#94A3B8] leading-tight">
                            mA<span className="ml-1 text-[#475569]">↑</span>
                        </div>
                        <div className="absolute bottom-1 right-2 text-[9px] font-mono text-[#94A3B8]">
                            {isHelical ? "时间 t →" : "床位位置 →"}
                        </div>
                        {/* Y 轴 max/min 标签：紧贴左轴、贴近红虚线 */}
                        <div
                            className="absolute left-2 text-[9px] font-mono text-[#F87171] leading-none -translate-y-1/2"
                            style={{ top: `${(yLineMax / VIEW_H) * 100}%` }}
                        >
                            max {Math.round(draftMax)}
                        </div>
                        <div
                            className="absolute left-2 text-[9px] font-mono text-[#F87171] leading-none -translate-y-1/2"
                            style={{ top: `${(yLineMin / VIEW_H) * 100}%` }}
                        >
                            min {Math.round(draftMin)}
                        </div>
                        {!isHelical && effectiveSteps > 0 && (
                            <div className="absolute bottom-1 left-2 text-[9px] font-mono text-[#94A3B8]">
                                {effectiveSteps} 床位 · 间隔 {effectiveSliceInterval.toFixed(1)} mm
                            </div>
                        )}
                        {!autoMa && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <span className="text-[11px] font-bold text-[#94A3B8]">
                                    Auto mA 未启用 · 使用固定 mA = {fallbackMa}
                                </span>
                            </div>
                        )}
                    </div>

                </div>

                {/* 控制：mA 上下限滑块 + 噪声等级 */}
                <div className="w-[240px] shrink-0 flex flex-col justify-center gap-3 px-4">
                    <div>
                        <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-tighter text-[#94A3B8]">
                            <span>mA 上限（max）</span>
                            <span className="font-mono text-[12px] font-bold text-[#E2E8F0]">{Math.round(draftMax)} <span className="text-[9px] text-[#64748B] font-normal">mA</span></span>
                        </div>
                        <input
                            type="range"
                            min={HARD_MIN}
                            max={HARD_MAX}
                            step={1}
                            value={Math.round(draftMax)}
                            onChange={(e) => handleMaxChange(e.target.value)}
                            disabled={!autoMa}
                            className="auto-ma-slider mt-1.5 w-full disabled:opacity-40"
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-tighter text-[#94A3B8]">
                            <span>mA 下限（min）</span>
                            <span className="font-mono text-[12px] font-bold text-[#E2E8F0]">{Math.round(draftMin)} <span className="text-[9px] text-[#64748B] font-normal">mA</span></span>
                        </div>
                        <input
                            type="range"
                            min={HARD_MIN}
                            max={HARD_MAX}
                            step={1}
                            value={Math.round(draftMin)}
                            onChange={(e) => handleMinChange(e.target.value)}
                            disabled={!autoMa}
                            className="auto-ma-slider mt-1.5 w-full disabled:opacity-40"
                        />
                    </div>

                    {/* 噪声等级 */}
                    <div>
                        <div className="text-[9px] font-black uppercase tracking-tighter text-[#94A3B8]">
                            噪声等级
                        </div>
                        <div className="mt-1.5 grid grid-cols-4 gap-1">
                            {NOISE_OPTIONS.map((opt) => {
                                const active = opt.value === noiseLevel;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        title={opt.desc}
                                        disabled={!autoMa}
                                        onClick={() => onChange({ noise_level: opt.value })}
                                        className={`h-[26px] rounded text-[10px] font-bold transition-colors disabled:opacity-40 ${
                                            active
                                                ? "bg-[#2563EB] text-white"
                                                : "bg-[#1E293B] text-[#CBD5E1] hover:bg-[#334155]"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
