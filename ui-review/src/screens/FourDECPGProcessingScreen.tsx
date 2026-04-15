import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Network, Sun, Settings, RotateCcw } from "lucide-react";
import { formatPatientCardSubtitle, loadSelectedPatient } from "../lib/patientSession";

const WAVE_WIDTH = 1000;
const WAVE_HEIGHT = 150;
const WAVE_BASELINE = WAVE_HEIGHT / 2;
const BREATHING_AMPLITUDES = [46, 52, 48, 55, 50];
const CYCLE_LENGTHS = [185, 205, 195, 210, 180];
const CYCLE_START_X = 30;
const MIN_WAVE_ZOOM = 1;
const MAX_WAVE_ZOOM = 4;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

type ECPGPoint = {
    id: string;
    x: number;
    type: "peak" | "trough";
};

type TouchLike = {
    clientX: number;
    clientY: number;
};

type WaveGestureState = {
    anchorDomainX: number;
    initialDistance: number;
    initialZoom: number;
};

const getTouchDistance = (firstTouch: TouchLike, secondTouch: TouchLike) =>
    Math.hypot(secondTouch.clientX - firstTouch.clientX, secondTouch.clientY - firstTouch.clientY);

const getTouchMidpointX = (firstTouch: TouchLike, secondTouch: TouchLike) =>
    (firstTouch.clientX + secondTouch.clientX) / 2;

export default function GatingSignalProcessingScreen() {
    const navigate = useNavigate();
    const selectedPatient = useMemo(() => loadSelectedPatient(), []);
    const [autoRecalc, setAutoRecalc] = useState(true);
    const [points, setPoints] = useState<ECPGPoint[]>([]);
    const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
    const [waveZoom, setWaveZoom] = useState(1);
    const [viewportStart, setViewportStart] = useState(0);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const waveGestureRef = useRef<WaveGestureState | null>(null);

    const cycleAnchors = useMemo(() => {
        let cursor = CYCLE_START_X;
        return CYCLE_LENGTHS.map((length, index) => {
            const startX = cursor;
            const endX = startX + length;
            cursor = endX;

            return {
                id: `cycle-${index}`,
                startX,
                endX,
                length,
                amplitude: BREATHING_AMPLITUDES[index] ?? 50,
            };
        });
    }, []);

    useEffect(() => {
        const initialPoints: ECPGPoint[] = [];

        cycleAnchors.forEach((cycle, index) => {
            initialPoints.push({
                id: `trough-${index}`,
                x: cycle.startX,
                type: "trough",
            });
            initialPoints.push({
                id: `peak-${index}`,
                x: cycle.startX + cycle.length / 2,
                type: "peak",
            });
        });

        initialPoints.push({
            id: `trough-${cycleAnchors.length}`,
            x: cycleAnchors[cycleAnchors.length - 1]?.endX ?? WAVE_WIDTH - CYCLE_START_X,
            type: "trough",
        });

        setPoints(initialPoints);
    }, [cycleAnchors]);

    const wavePath = useMemo(() => {
        let d = `M 0 ${WAVE_HEIGHT / 2}`;

        for (let x = 0; x < cycleAnchors[0].startX; x += 5) {
            d += ` L ${x} ${WAVE_BASELINE + 42}`;
        }

        cycleAnchors.forEach((cycle) => {
            for (let x = cycle.startX; x <= cycle.endX; x += 4) {
                const progress = (x - cycle.startX) / cycle.length;
                const envelope =
                    Math.cos(progress * Math.PI * 2)
                    - 0.14 * Math.cos(progress * Math.PI * 4)
                    + 0.04 * Math.cos(progress * Math.PI * 6);
                const drift = Math.sin(progress * Math.PI) * 4;
                const y = WAVE_BASELINE + envelope * cycle.amplitude + drift;
                d += ` L ${x} ${y}`;
            }
        });

        const lastEndX = cycleAnchors[cycleAnchors.length - 1]?.endX ?? WAVE_WIDTH;
        for (let x = lastEndX; x <= WAVE_WIDTH; x += 5) {
            d += ` L ${x} ${WAVE_BASELINE + 42}`;
        }

        return d;
    }, [cycleAnchors]);

    const viewportWidth = useMemo(() => WAVE_WIDTH / waveZoom, [waveZoom]);

    const getSvgCoordinates = useCallback((clientX: number, clientY: number) => {
        if (!svgRef.current) return null;
        const svgRect = svgRef.current.getBoundingClientRect();
        const normalizedX = clamp((clientX - svgRect.left) / svgRect.width, 0, 1);
        const normalizedY = clamp((clientY - svgRect.top) / svgRect.height, 0, 1);

        return {
            x: viewportStart + normalizedX * viewportWidth,
            y: normalizedY * WAVE_HEIGHT,
        };
    }, [viewportStart, viewportWidth]);

    const handlePointMouseDown = (id: string, event: React.MouseEvent) => {
        event.stopPropagation();
        setDraggingPointId(id);
    };

    const handlePointTouchStart = (id: string, event: React.TouchEvent) => {
        if (event.touches.length !== 1) return;
        event.stopPropagation();
        setDraggingPointId(id);
    };

    const handleSvgMouseMove = useCallback((event: React.MouseEvent | MouseEvent) => {
        if (!draggingPointId) return;
        const coords = getSvgCoordinates(event.clientX, event.clientY);
        if (!coords) return;

        setPoints((prev) =>
            prev.map((point) =>
                point.id === draggingPointId
                    ? { ...point, x: clamp(coords.x, 0, WAVE_WIDTH) }
                    : point,
            ),
        );
    }, [draggingPointId, getSvgCoordinates]);

    const handleWindowTouchMove = useCallback((event: TouchEvent) => {
        if (!draggingPointId || event.touches.length !== 1) return;
        const coords = getSvgCoordinates(event.touches[0].clientX, event.touches[0].clientY);
        if (!coords) return;
        event.preventDefault();

        setPoints((prev) =>
            prev.map((point) =>
                point.id === draggingPointId
                    ? { ...point, x: clamp(coords.x, 0, WAVE_WIDTH) }
                    : point,
            ),
        );
    }, [draggingPointId, getSvgCoordinates]);

    const handleSvgMouseUp = useCallback(() => {
        setDraggingPointId(null);
    }, []);

    const handleWindowTouchEnd = useCallback(() => {
        setDraggingPointId(null);
    }, []);

    useEffect(() => {
        if (draggingPointId) {
            window.addEventListener("mousemove", handleSvgMouseMove);
            window.addEventListener("mouseup", handleSvgMouseUp);
            window.addEventListener("touchmove", handleWindowTouchMove, { passive: false });
            window.addEventListener("touchend", handleWindowTouchEnd);
            window.addEventListener("touchcancel", handleWindowTouchEnd);
        } else {
            window.removeEventListener("mousemove", handleSvgMouseMove);
            window.removeEventListener("mouseup", handleSvgMouseUp);
            window.removeEventListener("touchmove", handleWindowTouchMove);
            window.removeEventListener("touchend", handleWindowTouchEnd);
            window.removeEventListener("touchcancel", handleWindowTouchEnd);
        }

        return () => {
            window.removeEventListener("mousemove", handleSvgMouseMove);
            window.removeEventListener("mouseup", handleSvgMouseUp);
            window.removeEventListener("touchmove", handleWindowTouchMove);
            window.removeEventListener("touchend", handleWindowTouchEnd);
            window.removeEventListener("touchcancel", handleWindowTouchEnd);
        };
    }, [draggingPointId, handleSvgMouseMove, handleSvgMouseUp, handleWindowTouchEnd, handleWindowTouchMove]);

    const handleSvgDoubleClick = (event: React.MouseEvent) => {
        const coords = getSvgCoordinates(event.clientX, event.clientY);
        if (!coords) return;
        const type: ECPGPoint["type"] = coords.y <= WAVE_HEIGHT / 2 ? "peak" : "trough";

        setPoints((prev) =>
            [...prev, { id: `manual-${type}-${Date.now()}`, x: coords.x, type }].sort(
                (a, b) => a.x - b.x,
            ),
        );
    };

    const handlePointContextMenu = (id: string, event: React.MouseEvent) => {
        event.preventDefault();
        setPoints((prev) => prev.filter((point) => point.id !== id));
    };

    const sortedTroughs = useMemo(
        () => points.filter((point) => point.type === "trough").sort((a, b) => a.x - b.x),
        [points],
    );

    const resetViewport = useCallback(() => {
        setWaveZoom(1);
        setViewportStart(0);
    }, []);

    const handleWaveTouchStart = useCallback((event: React.TouchEvent<SVGSVGElement>) => {
        if (!svgRef.current || event.touches.length !== 2) {
            waveGestureRef.current = null;
            return;
        }

        const [firstTouch, secondTouch] = [event.touches[0], event.touches[1]];
        const svgRect = svgRef.current.getBoundingClientRect();
        const midpointX = getTouchMidpointX(firstTouch, secondTouch);
        const normalizedX = clamp((midpointX - svgRect.left) / svgRect.width, 0, 1);

        waveGestureRef.current = {
            anchorDomainX: viewportStart + normalizedX * viewportWidth,
            initialDistance: getTouchDistance(firstTouch, secondTouch),
            initialZoom: waveZoom,
        };
        setDraggingPointId(null);
        event.preventDefault();
    }, [viewportStart, viewportWidth, waveZoom]);

    const handleWaveTouchMove = useCallback((event: React.TouchEvent<SVGSVGElement>) => {
        if (!svgRef.current || event.touches.length !== 2 || !waveGestureRef.current) return;

        const [firstTouch, secondTouch] = [event.touches[0], event.touches[1]];
        const svgRect = svgRef.current.getBoundingClientRect();
        const midpointX = getTouchMidpointX(firstTouch, secondTouch);
        const normalizedX = clamp((midpointX - svgRect.left) / svgRect.width, 0, 1);
        const nextZoom = clamp(
            waveGestureRef.current.initialZoom
                * (getTouchDistance(firstTouch, secondTouch) / waveGestureRef.current.initialDistance),
            MIN_WAVE_ZOOM,
            MAX_WAVE_ZOOM,
        );
        const nextViewportWidth = WAVE_WIDTH / nextZoom;
        const nextViewportStart = clamp(
            waveGestureRef.current.anchorDomainX - normalizedX * nextViewportWidth,
            0,
            WAVE_WIDTH - nextViewportWidth,
        );

        setWaveZoom(nextZoom);
        setViewportStart(nextViewportStart);
        event.preventDefault();
    }, []);

    const handleWaveTouchEnd = useCallback((event: React.TouchEvent<SVGSVGElement>) => {
        if (event.touches.length < 2) {
            waveGestureRef.current = null;
        }
    }, []);

    return (
        <div className="relative flex h-[768px] w-[1024px] select-none flex-col overflow-hidden rounded-md border border-[#B0C4DE] bg-[#EEF2F9] font-sans text-[#37474F] shadow-2xl">
            <header className="z-10 flex h-[80px] shrink-0 items-center justify-between border-b border-[#B0C4DE] bg-[#E8EAF1] px-4">
                <div className="flex items-center gap-3">
                    <div className="flex min-w-[210px] items-center gap-3 rounded-sm border border-[#B0C4DE] bg-[#DCE6F2] px-4 py-1.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#4A6982] text-white opacity-90">
                            <User size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold text-[#37474F]">
                                {selectedPatient?.name ?? "未选择患者"}
                            </span>
                            <span className="mt-0.5 text-[12px] font-medium leading-none text-[#546E7A]">
                                {formatPatientCardSubtitle(selectedPatient)}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex-1" />
                <div className="pointer-events-none flex items-center gap-5 pr-2 opacity-50">
                    <Network size={24} />
                    <Sun size={24} />
                    <Settings size={24} />
                </div>
            </header>

            <main className="flex flex-1 gap-2 overflow-hidden p-2">
                <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto rounded-lg border border-[#B0C4DE] bg-white p-4 shadow-sm">
                    <div className="mb-4 border-b border-slate-200 pb-2 text-[14px] font-bold text-[#37474F]">
                        处理参数 (Parameters)
                    </div>

                    <div className="flex flex-col gap-6">
                        <div className="flex items-center justify-between rounded-md border border-[#CBD5E1] bg-[#FAFAFA] p-3">
                            <div className="flex flex-col">
                                <span className="text-[13px] font-bold text-[#37474F]">自动重新计算相位</span>
                                <span className="text-[10px] text-slate-400">Automatic Phase Recalc</span>
                            </div>
                            <div className="relative mr-2 inline-block w-10 select-none align-middle transition duration-200 ease-in">
                                <input
                                    id="toggle"
                                    type="checkbox"
                                    name="toggle"
                                    checked={autoRecalc}
                                    onChange={(event) => setAutoRecalc(event.target.checked)}
                                    className={`toggle-checkbox absolute block h-5 w-5 cursor-pointer appearance-none rounded-full border-4 bg-white transition-transform duration-200 ${
                                        autoRecalc ? "translate-x-5 border-[#4D94FF]" : "border-gray-300"
                                    }`}
                                />
                                <label
                                    htmlFor="toggle"
                                    className={`toggle-label block h-5 cursor-pointer overflow-hidden rounded-full ${
                                        autoRecalc ? "bg-[#4D94FF]" : "bg-gray-300"
                                    }`}
                                />
                            </div>
                        </div>
                    </div>
                </aside>

                <div className="flex flex-1 flex-col gap-2 overflow-hidden">
                    <div className="relative flex-[3] overflow-hidden rounded-lg border border-[#334155] bg-black">
                        <div
                            className="pointer-events-none absolute inset-0 opacity-20"
                            style={{ backgroundImage: "radial-gradient(circle at center, #334155 0%, #000 70%)" }}
                        />
                        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 text-center text-white/50">
                            <span className="rounded bg-white/10 px-3 py-1 font-mono text-[12px] tracking-widest">
                                REFERENCE IMAGE PREVIEW
                            </span>
                            <span className="text-[10px] opacity-70">
                                此区域将根据左侧选择的相位实时展示参考图像预览。
                            </span>
                        </div>
                    </div>

                    <div className="relative flex flex-[2] flex-col rounded-lg border border-[#B0C4DE] bg-white">
                        <div className="flex h-[46px] shrink-0 items-center justify-between rounded-t-lg border-b border-[#EEF2F9] bg-[#F8FAFC] px-3">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#546E7A]">
                                ECPG Respiratory Signal Monitoring
                            </span>
                            <div className="flex items-center gap-3">
                                <div className="rounded-full border border-[#D7E3F1] bg-white px-3 py-1 text-[11px] font-bold text-[#4A6982]">
                                    {waveZoom.toFixed(1)}x
                                </div>
                                <div className="text-[11px] font-medium text-[#6B7C93]">
                                    双指缩放，双指左右平移
                                </div>
                                <button
                                    type="button"
                                    onClick={resetViewport}
                                    disabled={waveZoom === 1 && viewportStart === 0}
                                    className="flex h-9 min-w-[68px] items-center justify-center gap-1 rounded-lg border border-[#BFD0E3] bg-white px-3 text-[11px] font-bold text-[#4D94FF] shadow-sm transition enabled:hover:bg-[#EEF5FF] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <RotateCcw size={16} />
                                    复位
                                </button>
                            </div>
                        </div>

                        <div className="relative flex-1 overflow-hidden p-4">
                            <svg
                                ref={svgRef}
                                className="h-full w-full cursor-crosshair border border-dashed border-slate-200"
                                style={{ touchAction: "none" }}
                                viewBox={`${viewportStart} 0 ${viewportWidth} ${WAVE_HEIGHT}`}
                                preserveAspectRatio="none"
                                onDoubleClick={handleSvgDoubleClick}
                                onMouseMove={handleSvgMouseMove}
                                onMouseUp={handleSvgMouseUp}
                                onMouseLeave={handleSvgMouseUp}
                                onTouchStart={handleWaveTouchStart}
                                onTouchMove={handleWaveTouchMove}
                                onTouchEnd={handleWaveTouchEnd}
                                onTouchCancel={handleWaveTouchEnd}
                            >
                                <line
                                    x1="0"
                                    y1={WAVE_HEIGHT / 2}
                                    x2={WAVE_WIDTH}
                                    y2={WAVE_HEIGHT / 2}
                                    stroke="#E2E8F0"
                                    strokeWidth="1"
                                    strokeDasharray="4 4"
                                />

                                {autoRecalc &&
                                    sortedTroughs.map((trough, index) => {
                                        if (index === sortedTroughs.length - 1) return null;
                                        const nextTrough = sortedTroughs[index + 1];
                                        const distance = nextTrough.x - trough.x;
                                        if (distance <= 0) return null;

                                        return (
                                            <g key={`cycle-${index}`}>
                                                {Array.from({ length: 10 }, (_, segmentIndex) => (
                                                    <g key={`phase-${index}-${segmentIndex}`}>
                                                        <rect
                                                            x={trough.x + distance * (segmentIndex / 10)}
                                                            y={0}
                                                            width={distance / 10}
                                                            height={WAVE_HEIGHT}
                                                            fill={
                                                                segmentIndex % 2 === 0
                                                                    ? "rgba(77, 148, 255, 0.03)"
                                                                    : "rgba(77, 148, 255, 0.08)"
                                                            }
                                                        />
                                                        <line
                                                            x1={trough.x + distance * (segmentIndex / 10)}
                                                            y1={0}
                                                            x2={trough.x + distance * (segmentIndex / 10)}
                                                            y2={WAVE_HEIGHT}
                                                            stroke="rgba(77, 148, 255, 0.18)"
                                                            strokeWidth="1"
                                                            strokeDasharray="3 3"
                                                        />
                                                        {segmentIndex === 0 ? (
                                                            <text
                                                                x={trough.x}
                                                                y={18}
                                                                fill="#64748B"
                                                                fontSize="9"
                                                                fontWeight="600"
                                                                textAnchor="middle"
                                                                pointerEvents="none"
                                                            >
                                                                0%
                                                            </text>
                                                        ) : null}
                                                        {segmentIndex === 5 ? (
                                                            <text
                                                                x={trough.x + distance * 0.5}
                                                                y={18}
                                                                fill="#1565C0"
                                                                fontSize="9"
                                                                fontWeight="700"
                                                                textAnchor="middle"
                                                                pointerEvents="none"
                                                            >
                                                                50%
                                                            </text>
                                                        ) : null}
                                                    </g>
                                                ))}
                                                <line
                                                    x1={nextTrough.x}
                                                    y1={0}
                                                    x2={nextTrough.x}
                                                    y2={WAVE_HEIGHT}
                                                    stroke="rgba(77, 148, 255, 0.18)"
                                                    strokeWidth="1"
                                                    strokeDasharray="3 3"
                                                />
                                                <text
                                                    x={nextTrough.x}
                                                    y={18}
                                                    fill="#64748B"
                                                    fontSize="9"
                                                    fontWeight="500"
                                                    textAnchor="middle"
                                                    pointerEvents="none"
                                                >
                                                    100%
                                                </text>
                                            </g>
                                        );
                                    })}

                                <path
                                    d={wavePath}
                                    fill="none"
                                    stroke="#1565C0"
                                    strokeWidth="2"
                                    style={{ pointerEvents: "none" }}
                                />

                                {points.map((point) => (
                                    <g
                                        key={point.id}
                                        transform={`translate(${point.x}, ${
                                            point.type === "peak" ? WAVE_HEIGHT / 2 - 50 : WAVE_HEIGHT / 2 + 50
                                        })`}
                                        className="cursor-ew-resize"
                                        onMouseDown={(event) => handlePointMouseDown(point.id, event)}
                                        onTouchStart={(event) => handlePointTouchStart(point.id, event)}
                                        onContextMenu={(event) => handlePointContextMenu(point.id, event)}
                                    >
                                        <line
                                            x1="0"
                                            y1={point.type === "peak" ? 10 : -12}
                                            x2="0"
                                            y2={point.type === "peak" ? 52 : -52}
                                            stroke={point.type === "peak" ? "#EF4444" : "#3B82F6"}
                                            strokeWidth="1"
                                            strokeDasharray="2 2"
                                            style={{ pointerEvents: "none" }}
                                        />
                                        <circle
                                            cx="0"
                                            cy="0"
                                            r="6"
                                            fill={point.type === "peak" ? "#EF4444" : "#3B82F6"}
                                            stroke="white"
                                            strokeWidth="2"
                                            className="transition-all hover:stroke-[#1E293B]"
                                        />
                                        <text
                                            x="0"
                                            y={point.type === "peak" ? -10 : 20}
                                            fill={point.type === "peak" ? "#DC2626" : "#2563EB"}
                                            fontSize="8"
                                            fontWeight="700"
                                            textAnchor="middle"
                                            pointerEvents="none"
                                        >
                                            {point.type === "peak" ? "Peak" : "Trough"}
                                        </text>
                                    </g>
                                ))}
                            </svg>
                        </div>
                    </div>
                </div>
            </main>

            <footer className="z-10 flex h-[72px] shrink-0 items-center justify-between border-t border-[#B0C4DE] bg-white px-6 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
                <button
                    onClick={() => navigate("/helical-execute")}
                    className="h-10 rounded-md border border-[#CBD5E1] bg-white px-6 text-[14px] font-bold text-[#546E7A] shadow-sm transition-colors hover:bg-[#F8FAFC]"
                >
                    返回扫描 (Back)
                </button>

                <button
                    onClick={() => navigate("/image-viewer-gating")}
                    className="h-10 rounded-md bg-[radial-gradient(ellipse_at_top,#22C55E_0%,#16A34A_100%)] px-8 text-[14px] font-bold tracking-wider text-white shadow-[0_4px_12px_rgba(34,197,94,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                    确认并进入门控浏览
                </button>
            </footer>
        </div>
    );
}
