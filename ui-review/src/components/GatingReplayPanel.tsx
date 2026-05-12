import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, ChevronUp, ChevronDown, Plus, AlertTriangle, X } from "lucide-react";
import {
    findTriggerForSlice,
    sliceToSampleIndex,
    type GatingResult,
} from "../lib/gatingResult";

const LOW_ACCEPTANCE_THRESHOLD = 0.6;

interface GatingReplayPanelProps {
    result: GatingResult;
    /** Currently viewed slice index in the image viewer. */
    currentSliceIndex: number;
    /** Total slices in the displayed series — kept for parity with viewer state. */
    totalSlices: number;
    /** Called when the user clicks a trigger marker / list row to jump the viewer. */
    onJumpToSlice: (sliceIndex: number) => void;
    /** Called when the user requests 补扫 — host navigates to execute screen scoped to these trigger indices. */
    onSupplementalScan: (triggerIndices: number[]) => void;
}

const PANEL_HEIGHT = 180;
const HEADER_HEIGHT = 30;
const WAVE_HEIGHT = PANEL_HEIGHT - HEADER_HEIGHT; // SVG fills remaining vertical room
const Y_MIN = -1.5;
const Y_MAX = 1.5;

export default function GatingReplayPanel({
    result,
    currentSliceIndex,
    totalSlices,
    onJumpToSlice,
    onSupplementalScan,
}: GatingReplayPanelProps) {
    const [listOpen, setListOpen] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedTriggerIndices, setSelectedTriggerIndices] = useState<Set<number>>(new Set());
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [svgWidth, setSvgWidth] = useState(900);

    const toggleSelect = (index: number) =>
        setSelectedTriggerIndices((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });

    const runSupplementalScan = () => {
        if (selectedTriggerIndices.size === 0) return;
        onSupplementalScan(Array.from(selectedTriggerIndices).sort((a, b) => a - b));
    };

    // Responsive width using the rendered SVG box.
    useEffect(() => {
        if (!svgRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width;
            if (w && Math.abs(w - svgWidth) > 2) setSvgWidth(w);
        });
        observer.observe(svgRef.current);
        return () => observer.disconnect();
    }, [svgWidth]);

    // Playback: walks the cursor through slices at ~ 8 slices/sec.
    useEffect(() => {
        if (!isPlaying) return;
        const id = window.setInterval(() => {
            const next = currentSliceIndex + 1;
            if (next >= totalSlices) {
                setIsPlaying(false);
                return;
            }
            onJumpToSlice(next);
        }, 125);
        return () => window.clearInterval(id);
    }, [isPlaying, currentSliceIndex, totalSlices, onJumpToSlice]);

    const activeTriggers = useMemo(() => result.triggers.filter((t) => !t.supersededBy), [result]);
    const currentTrigger = findTriggerForSlice(result, currentSliceIndex);
    const cursorSample = sliceToSampleIndex(result, currentSliceIndex);
    const showLowAcceptanceBanner =
        result.acceptance < LOW_ACCEPTANCE_THRESHOLD && !bannerDismissed;
    // Rejected triggers default-selectable to make the common 补扫 case one-click.
    const rejectedActiveIndices = activeTriggers.filter((t) => !t.accepted).map((t) => t.index);

    // ── geometry helpers ───────────────────────────────────────────────────
    const totalSamples = Math.max(1, result.waveform.length - 1);
    const xOf = (sampleIndex: number) => (sampleIndex / totalSamples) * svgWidth;
    const yOf = (v: number) => {
        const clamped = Math.max(Y_MIN, Math.min(Y_MAX, v));
        return 8 + ((Y_MAX - clamped) / (Y_MAX - Y_MIN)) * (WAVE_HEIGHT - 16);
    };

    const wavePath = useMemo(() => {
        if (result.waveform.length === 0) return "";
        return result.waveform
            .map(
                (v, i) =>
                    `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`
            )
            .join(" ");
        // svgWidth dependency intentional so path stretches on resize.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result.waveform, svgWidth]);

    // ── window overlay (threshold band or breath-hold plateau rect) ────────
    const windowOverlay = (() => {
        if (result.window.kind === "threshold") {
            const { threshold, direction, toleranceBand } = result.window;
            const yTop =
                direction === "rising"
                    ? yOf(threshold + toleranceBand)
                    : yOf(threshold);
            const yBot =
                direction === "rising"
                    ? yOf(threshold)
                    : yOf(threshold - toleranceBand);
            return (
                <>
                    <rect
                        x={0}
                        y={Math.min(yTop, yBot)}
                        width={svgWidth}
                        height={Math.abs(yBot - yTop)}
                        fill="#22c55e"
                        opacity={0.10}
                    />
                    <line
                        x1={0}
                        x2={svgWidth}
                        y1={yOf(threshold)}
                        y2={yOf(threshold)}
                        stroke="#22c55e"
                        strokeWidth={1.5}
                        strokeDasharray="6 3"
                    />
                    <text
                        x={8}
                        y={yOf(threshold) - 4}
                        fill="#22c55e"
                        fontSize={10}
                        fontWeight={600}
                    >
                        阈值 {threshold.toFixed(2)} · {direction === "rising" ? "上行" : "下行"}
                    </text>
                </>
            );
        }
        const { plateauStart, plateauEnd, plateauTarget, toleranceBand } = result.window;
        const xL = xOf(plateauStart);
        const xR = xOf(plateauEnd);
        const yTop = yOf(plateauTarget + toleranceBand);
        const yBot = yOf(plateauTarget - toleranceBand);
        return (
            <>
                <rect
                    x={xL}
                    y={0}
                    width={Math.max(0, xR - xL)}
                    height={WAVE_HEIGHT}
                    fill="#0ea5e9"
                    opacity={0.08}
                />
                <rect
                    x={xL}
                    y={yTop}
                    width={Math.max(0, xR - xL)}
                    height={Math.abs(yBot - yTop)}
                    fill="#0ea5e9"
                    opacity={0.18}
                />
                <line x1={xL} x2={xL} y1={0} y2={WAVE_HEIGHT} stroke="#0ea5e9" strokeWidth={1} strokeDasharray="4 3" />
                <line x1={xR} x2={xR} y1={0} y2={WAVE_HEIGHT} stroke="#0ea5e9" strokeWidth={1} strokeDasharray="4 3" />
                <text x={xL + 6} y={14} fill="#0ea5e9" fontSize={10} fontWeight={600}>
                    屏息平台
                </text>
            </>
        );
    })();

    // ── chip helpers ───────────────────────────────────────────────────────
    const triggerChipColor = (acc: boolean) => (acc ? "#22c55e" : "#ef4444");
    const fmtSec = (sec: number) => `${sec.toFixed(2)} s`;
    const fmtPct = (frac: number) => `${(frac * 100).toFixed(1)}%`;

    return (
        <div
            className="shrink-0 border-t border-[#1e293b] bg-[#0b1220] text-[#e2e8f0]"
            style={{ height: PANEL_HEIGHT }}
        >
            {/* ── stats row ───────────────────────────────────────────── */}
            <div className="flex items-center gap-1.5 px-3 border-b border-[#1e293b] whitespace-nowrap overflow-hidden" style={{ height: HEADER_HEIGHT }}>
                <span className="text-[11px] font-bold tracking-wide text-[#93c5fd] shrink-0">门控回放</span>
                <span className="text-[10px] text-[#94a3b8] truncate min-w-0">
                    {result.mode === "gated_axial" ? "轴扫" : "螺旋"}
                    {" · "}
                    {result.breathingMode === "free_breathing" ? "自由呼吸·阈值穿越" : "DIBH"}
                </span>
                <div className="flex-1" />
                <button
                    type="button"
                    className="flex items-center gap-1 rounded border border-[#334155] bg-[#0f172a] px-2 py-0.5 text-[11px] hover:border-[#4D94FF] shrink-0"
                    onClick={() => setIsPlaying((p) => !p)}
                    title={isPlaying ? "暂停回放" : "开始回放"}
                >
                    {isPlaying ? <Pause size={11} /> : <Play size={11} />}
                    {isPlaying ? "暂停" : "回放"}
                </button>
                <button
                    type="button"
                    className="flex items-center gap-1 rounded border border-[#334155] bg-[#0f172a] px-2 py-0.5 text-[11px] hover:border-[#4D94FF] shrink-0"
                    onClick={() => setListOpen((v) => !v)}
                >
                    列表 {listOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
                </button>
                {rejectedActiveIndices.length > 0 && (
                    <button
                        type="button"
                        className="flex items-center gap-1 rounded border border-[#f59e0b] bg-[#451a03]/40 px-2 py-0.5 text-[11px] text-[#fbbf24] hover:bg-[#451a03]/70 shrink-0"
                        onClick={() => {
                            setSelectedTriggerIndices(new Set(rejectedActiveIndices));
                            setListOpen(true);
                        }}
                        title="将所有被拒触发加入补扫选择"
                    >
                        <Plus size={11} /> 补扫 ({rejectedActiveIndices.length})
                    </button>
                )}
            </div>

            {/* ── low-acceptance banner ─────────────────────────────── */}
            {showLowAcceptanceBanner && (
                <div className="flex items-center gap-2 bg-[#451a03]/60 border-b border-[#f59e0b]/60 px-3 py-1 text-[11px] text-[#fbbf24]">
                    <AlertTriangle size={12} />
                    <span>
                        接受率 {fmtPct(result.acceptance)} 偏低，建议对被拒触发执行补扫。
                    </span>
                    <div className="flex-1" />
                    <button
                        type="button"
                        className="rounded border border-[#f59e0b]/60 bg-transparent px-2 py-0.5 hover:bg-[#451a03]"
                        onClick={() => setBannerDismissed(true)}
                    >
                        <X size={11} />
                    </button>
                </div>
            )}

            {/* ── waveform + list ─────────────────────────────────────── */}
            <div className="relative" style={{ height: PANEL_HEIGHT - HEADER_HEIGHT }}>
                <svg
                    ref={svgRef}
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${svgWidth} ${WAVE_HEIGHT}`}
                    preserveAspectRatio="none"
                    className="block"
                    onClick={(e) => {
                        // Click on the canvas → snap to nearest trigger.
                        const rect = (e.target as SVGElement).getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const sample = (x / rect.width) * totalSamples;
                        let nearest = result.triggers[0];
                        let bestD = Infinity;
                        for (const tr of result.triggers) {
                            const d = Math.abs(tr.sampleIndex - sample);
                            if (d < bestD) {
                                bestD = d;
                                nearest = tr;
                            }
                        }
                        if (nearest) onJumpToSlice(nearest.sliceStart);
                    }}
                    style={{ cursor: "crosshair" }}
                >
                    {/* gridlines */}
                    <line x1={0} x2={svgWidth} y1={yOf(0)} y2={yOf(0)} stroke="#1e293b" strokeWidth={1} />
                    <line x1={0} x2={svgWidth} y1={yOf(1)} y2={yOf(1)} stroke="#334155" strokeWidth={1} strokeDasharray="3 3" />
                    <line x1={0} x2={svgWidth} y1={yOf(-1)} y2={yOf(-1)} stroke="#334155" strokeWidth={1} strokeDasharray="3 3" />

                    {/* gating window */}
                    {windowOverlay}

                    {/* waveform */}
                    <path d={wavePath} stroke="#38bdf8" strokeWidth={1.5} fill="none" />

                    {/* trigger markers */}
                    {result.triggers.map((tr) => {
                        const x = xOf(tr.sampleIndex);
                        const y = yOf(tr.amplitude);
                        const fill = triggerChipColor(tr.accepted);
                        const isCurrent = currentTrigger?.index === tr.index;
                        return (
                            <g
                                key={tr.index}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onJumpToSlice(tr.sliceStart);
                                }}
                                style={{ cursor: "pointer" }}
                            >
                                <line
                                    x1={x}
                                    x2={x}
                                    y1={0}
                                    y2={WAVE_HEIGHT}
                                    stroke={fill}
                                    strokeWidth={isCurrent ? 2 : 1}
                                    opacity={isCurrent ? 0.8 : 0.45}
                                />
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={isCurrent ? 6 : 4}
                                    fill={fill}
                                    stroke="#0b1220"
                                    strokeWidth={1.5}
                                />
                                <text
                                    x={x + 6}
                                    y={12}
                                    fill={fill}
                                    fontSize={10}
                                    fontWeight={600}
                                >
                                    T{tr.index}
                                </text>
                            </g>
                        );
                    })}

                    {/* current-slice cursor */}
                    <g>
                        <line
                            x1={xOf(cursorSample)}
                            x2={xOf(cursorSample)}
                            y1={0}
                            y2={WAVE_HEIGHT}
                            stroke="#facc15"
                            strokeWidth={2}
                        />
                        <circle
                            cx={xOf(cursorSample)}
                            cy={yOf(result.waveform[cursorSample] ?? 0)}
                            r={5}
                            fill="#facc15"
                            stroke="#78350f"
                            strokeWidth={1}
                        />
                    </g>

                    {/* time axis ticks (every 5s) */}
                    {Array.from({ length: Math.floor(result.durationSec / 5) + 1 }).map((_, i) => {
                        const sec = i * 5;
                        const sample = sec * result.sampleRate;
                        return (
                            <g key={sec}>
                                <line
                                    x1={xOf(sample)}
                                    x2={xOf(sample)}
                                    y1={WAVE_HEIGHT - 6}
                                    y2={WAVE_HEIGHT}
                                    stroke="#475569"
                                    strokeWidth={1}
                                />
                                <text
                                    x={xOf(sample) + 2}
                                    y={WAVE_HEIGHT - 8}
                                    fill="#64748b"
                                    fontSize={9}
                                >
                                    {sec}s
                                </text>
                            </g>
                        );
                    })}
                </svg>

                {/* current-trigger badge */}
                <div className="absolute right-3 top-2 rounded-md bg-[#0f172a]/85 border border-[#334155] px-2 py-1 text-[11px]">
                    <span className="text-[#94a3b8]">当前曝光：</span>
                    {currentTrigger ? (
                        <>
                            <span className="font-bold text-[#facc15]">T{currentTrigger.index}</span>
                            <span className="text-[#94a3b8]"> · 偏差 </span>
                            <span className="font-mono">{currentTrigger.deviation.toFixed(2)}</span>
                            <span className="text-[#94a3b8]"> · 时刻 </span>
                            <span className="font-mono">{fmtSec(currentTrigger.sampleIndex / result.sampleRate)}</span>
                        </>
                    ) : (
                        <span className="text-[#94a3b8]">—</span>
                    )}
                </div>

                {/* trigger list overlay (slides up from bottom) */}
                {listOpen && (
                    <div
                        className="absolute inset-x-0 bottom-0 bg-[#0f172a]/95 border-t border-[#334155] flex flex-col"
                        style={{ maxHeight: PANEL_HEIGHT - HEADER_HEIGHT }}
                    >
                        <div className="overflow-auto flex-1 min-h-0">
                        <table className="w-full text-[11px]">
                            <thead className="sticky top-0 bg-[#0f172a]">
                                <tr className="text-[#94a3b8]">
                                    <th className="px-2 py-1 text-left font-semibold w-[28px]">
                                        <input
                                            type="checkbox"
                                            className="h-3 w-3 accent-[#f59e0b]"
                                            checked={
                                                activeTriggers.length > 0 &&
                                                selectedTriggerIndices.size === activeTriggers.length
                                            }
                                            onChange={(e) => {
                                                if (e.target.checked)
                                                    setSelectedTriggerIndices(new Set(activeTriggers.map((t) => t.index)));
                                                else setSelectedTriggerIndices(new Set());
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </th>
                                    <th className="px-2 py-1 text-left font-semibold">#</th>
                                    <th className="px-2 py-1 text-left font-semibold">时间</th>
                                    <th className="px-2 py-1 text-left font-semibold">距前次</th>
                                    <th className="px-2 py-1 text-left font-semibold">幅度</th>
                                    <th className="px-2 py-1 text-left font-semibold">偏差</th>
                                    <th className="px-2 py-1 text-left font-semibold">切片</th>
                                    <th className="px-2 py-1 text-left font-semibold">状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.triggers.map((tr, i) => {
                                    const prev = result.triggers[i - 1];
                                    const dt = prev
                                        ? (tr.sampleIndex - prev.sampleIndex) / result.sampleRate
                                        : null;
                                    const isCurrent = currentTrigger?.index === tr.index;
                                    const isSuperseded = !!tr.supersededBy;
                                    const isChecked = selectedTriggerIndices.has(tr.index);
                                    return (
                                        <tr
                                            key={tr.index}
                                            onClick={() => onJumpToSlice(tr.sliceStart)}
                                            className={`cursor-pointer hover:bg-[#1e293b] ${
                                                isCurrent ? "bg-[#1e293b]" : ""
                                            } ${isSuperseded ? "opacity-40" : ""}`}
                                        >
                                            <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    className="h-3 w-3 accent-[#f59e0b]"
                                                    disabled={isSuperseded}
                                                    checked={isChecked}
                                                    onChange={() => toggleSelect(tr.index)}
                                                />
                                            </td>
                                            <td className="px-2 py-1 font-mono">
                                                {tr.isSupplemental ? `T${tr.index}*` : `T${tr.index}`}
                                            </td>
                                            <td className="px-2 py-1 font-mono">
                                                {fmtSec(tr.sampleIndex / result.sampleRate)}
                                            </td>
                                            <td className="px-2 py-1 font-mono">{dt ? fmtSec(dt) : "—"}</td>
                                            <td className="px-2 py-1 font-mono">{tr.amplitude.toFixed(2)}</td>
                                            <td className="px-2 py-1 font-mono">{tr.deviation.toFixed(2)}</td>
                                            <td className="px-2 py-1 font-mono">
                                                {tr.sliceStart + 1}–{tr.sliceEnd + 1}
                                            </td>
                                            <td className="px-2 py-1">
                                                {isSuperseded ? (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#1e293b] text-[#94a3b8]">
                                                        被 T{tr.supersededBy} 替换
                                                    </span>
                                                ) : (
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                                                        style={{
                                                            background: tr.accepted ? "#14532d" : "#7f1d1d",
                                                            color: tr.accepted ? "#bbf7d0" : "#fecaca",
                                                        }}
                                                    >
                                                        {tr.isSupplemental ? "补扫·接受" : tr.accepted ? "接受" : "拒绝"}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </div>
                        <div className="flex items-center gap-2 border-t border-[#334155] bg-[#0f172a] px-3 py-1.5 text-[11px]">
                            <span className="text-[#94a3b8]">
                                已选 {selectedTriggerIndices.size} 个触发
                            </span>
                            <div className="flex-1" />
                            <button
                                type="button"
                                className="rounded border border-[#334155] bg-transparent px-2 py-0.5 hover:border-[#4D94FF]"
                                onClick={() => setSelectedTriggerIndices(new Set())}
                                disabled={selectedTriggerIndices.size === 0}
                            >
                                清空选择
                            </button>
                            <button
                                type="button"
                                className="flex items-center gap-1 rounded border border-[#f59e0b] bg-[#451a03]/40 px-2 py-0.5 text-[#fbbf24] hover:bg-[#451a03]/70 disabled:opacity-40"
                                disabled={selectedTriggerIndices.size === 0}
                                onClick={runSupplementalScan}
                                title="返回扫描执行屏，仅采集所选触发对应的 Z 段"
                            >
                                <Plus size={11} /> 补扫所选 ({selectedTriggerIndices.size})
                            </button>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}

