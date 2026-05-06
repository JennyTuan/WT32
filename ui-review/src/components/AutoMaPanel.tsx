import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Zap } from "lucide-react";

export type AutoMaPanelProps = {
    autoMa: boolean;
    maMin: number;
    maMax: number;
    fallbackMa: number;
    scanLength: number;
    sliceInterval: number;
    rotationTime: number;
    stepCount?: number | null;
    onChange: (patch: { auto_ma?: boolean; ma_min?: number; ma_max?: number }) => void;
};

const HARD_MIN = 20;
const HARD_MAX = 800;

const computeStepCount = (scanLength: number, sliceInterval: number, fallback?: number | null) => {
    if (fallback && fallback > 0) return fallback;
    if (!Number.isFinite(scanLength) || !Number.isFinite(sliceInterval) || sliceInterval <= 0) return 1;
    return Math.max(1, Math.round(scanLength / sliceInterval));
};

// 模拟"定位像衰减/体型估计 → 床位 mA"。原型用对称偏中带轻微上下波动的伪曲线，
// 底层语义是"床位位置 → mA"，UI 显示成阶梯。真实算法依赖定位像数据和厂商 AEC 实现。
const generatePositionMaCurve = (
    stepCount: number,
    maMin: number,
    maMax: number,
): number[] => {
    if (stepCount <= 0) return [];
    if (stepCount === 1) return [Math.round((maMin + maMax) / 2)];
    const out: number[] = [];
    const span = Math.max(1, maMax - maMin);
    for (let i = 0; i < stepCount; i += 1) {
        const t = i / (stepCount - 1);
        const bell = Math.sin(t * Math.PI);
        const wobble = 0.08 * Math.sin(t * Math.PI * 4 + 0.7);
        const norm = Math.max(0, Math.min(1, bell + wobble));
        const value = maMin + norm * span;
        out.push(Math.round(value));
    }
    return out;
};

export default function AutoMaPanel({
    autoMa,
    maMin,
    maMax,
    fallbackMa,
    scanLength,
    sliceInterval,
    rotationTime,
    stepCount,
    onChange,
}: AutoMaPanelProps) {
    const [draftMin, setDraftMin] = useState(maMin);
    const [draftMax, setDraftMax] = useState(maMax);
    const debounceRef = useRef<number | null>(null);

    useEffect(() => setDraftMin(maMin), [maMin]);
    useEffect(() => setDraftMax(maMax), [maMax]);

    const flush = (patch: { ma_min?: number; ma_max?: number }) => {
        if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => onChange(patch), 200);
    };

    const effectiveSteps = computeStepCount(scanLength, sliceInterval, stepCount);
    const positions = useMemo(
        () => Array.from({ length: effectiveSteps }, (_, i) => i * sliceInterval),
        [effectiveSteps, sliceInterval],
    );
    const curve = useMemo(
        () => (autoMa ? generatePositionMaCurve(effectiveSteps, draftMin, draftMax) : positions.map(() => fallbackMa)),
        [autoMa, effectiveSteps, draftMin, draftMax, fallbackMa, positions],
    );

    const meanMa = curve.length ? curve.reduce((a, b) => a + b, 0) / curve.length : fallbackMa;
    // 原型级 CTDIvol 估算：mean(mA) × 旋转时间 × 经验系数。仅用于 UI 反馈，非真实剂量。
    const estCtdi = (meanMa * rotationTime * 0.05).toFixed(2);
    const estDlp = (Number(estCtdi) * (scanLength / 10)).toFixed(2);

    const yMaxView = Math.max(maMax, fallbackMa) * 1.15;
    const VIEW_W = 100;
    const VIEW_H = 100;

    const stepPath = useMemo(() => {
        if (!curve.length) return "";
        const dx = VIEW_W / curve.length;
        let d = "";
        curve.forEach((ma, i) => {
            const x0 = i * dx;
            const x1 = (i + 1) * dx;
            const y = VIEW_H - (ma / yMaxView) * VIEW_H;
            d += i === 0 ? `M ${x0.toFixed(2)} ${y.toFixed(2)}` : ` L ${x0.toFixed(2)} ${y.toFixed(2)}`;
            d += ` L ${x1.toFixed(2)} ${y.toFixed(2)}`;
        });
        return d;
    }, [curve, yMaxView]);

    const yLineMin = VIEW_H - (draftMin / yMaxView) * VIEW_H;
    const yLineMax = VIEW_H - (draftMax / yMaxView) * VIEW_H;

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
                {/* 曲线 */}
                <div className="flex-1 min-w-0 pr-4">
                    <div className="relative h-[120px] overflow-hidden">
                        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                            {/* 网格 */}
                            {[0.25, 0.5, 0.75].map((r) => (
                                <line key={r} x1={0} x2={VIEW_W} y1={VIEW_H * r} y2={VIEW_H * r} stroke="#1E293B" strokeWidth={0.2} />
                            ))}
                            {/* min/max 红虚线 */}
                            <line x1={0} x2={VIEW_W} y1={yLineMax} y2={yLineMax} stroke="#F87171" strokeWidth={0.4} strokeDasharray="1.5,1" opacity={autoMa ? 1 : 0.3} />
                            <line x1={0} x2={VIEW_W} y1={yLineMin} y2={yLineMin} stroke="#F87171" strokeWidth={0.4} strokeDasharray="1.5,1" opacity={autoMa ? 1 : 0.3} />
                            {/* 阶梯曲线 */}
                            {stepPath && (
                                <path d={stepPath} fill="none" stroke={autoMa ? "#60A5FA" : "#475569"} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                            )}
                        </svg>
                        {/* 轴标签 */}
                        <div className="absolute top-1 left-2 text-[9px] font-mono text-[#94A3B8] leading-tight">
                            mA
                            <span className="ml-1 text-[#475569]">↑</span>
                        </div>
                        <div className="absolute bottom-1 right-2 text-[9px] font-mono text-[#94A3B8]">
                            床位位置 →
                        </div>
                        <div className="absolute top-1 right-2 text-[9px] font-mono text-[#F87171]">
                            max {Math.round(draftMax)}
                        </div>
                        <div className="absolute bottom-3 right-2 text-[9px] font-mono text-[#F87171]">
                            min {Math.round(draftMin)}
                        </div>
                        {effectiveSteps > 0 && (
                            <div className="absolute bottom-1 left-2 text-[9px] font-mono text-[#94A3B8]">
                                {effectiveSteps} 床位 · 间隔 {sliceInterval.toFixed(1)} mm
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

                {/* 控制：mA 上下限滑块 */}
                <div className="w-[200px] shrink-0 flex flex-col justify-center gap-3 px-4">
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
                </div>

                {/* 预计剂量 */}
                <div className="w-[170px] shrink-0 pl-4 flex flex-col justify-center">
                    <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter text-[#FCD34D]">
                        <Zap size={10} /> 预计剂量（参考）
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between">
                        <span className="text-[9px] text-[#FCD34D]/70">CTDIvol</span>
                        <span className="text-[14px] font-black text-[#FDE68A]">
                            {estCtdi}
                            <span className="ml-0.5 text-[9px] font-bold text-[#FCD34D]/70">mGy</span>
                        </span>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between">
                        <span className="text-[9px] text-[#FCD34D]/70">DLP</span>
                        <span className="text-[14px] font-black text-[#FDE68A]">
                            {estDlp}
                            <span className="ml-0.5 text-[9px] font-bold text-[#FCD34D]/70">mGy·cm</span>
                        </span>
                    </div>
                    <div className="mt-1 text-[9px] text-[#FCD34D]/50 leading-tight">
                        非设备实测值，最终以扫描后报告为准
                    </div>
                </div>
            </div>
        </div>
    );
}
