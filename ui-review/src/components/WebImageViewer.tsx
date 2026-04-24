/**
 * WebImageViewer - a lightweight viewport for pre-rendered WebP stacks.
 *
 * Used by the 4D image viewer where phase images are pre-processed into
 * WebP (see `lib/fourDImageSource.ts`). API-compatible with DicomViewer so
 * it can be dropped in under the same ref type.
 *
 * Supports: pan, zoom, slice scrub, window/level approximation, plus
 * lightweight measurement / text annotation overlays for the 4D demo.
 */
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";

import type { DicomViewerHandle } from "./DicomViewer";

interface WebImageViewerProps {
    imageUrls: string[];
    currentImageIndex?: number;
    onImageIndexChange?: (index: number) => void;
    onStatusChange?: (status: "loading" | "ready" | "error") => void;
    activeTool?: string;
    baselineWindowCenter?: number;
    baselineWindowWidth?: number;
    windowCenter?: number;
    windowWidth?: number;
    onWindowLevelChange?: (windowCenter: number, windowWidth: number) => void;
    showWindowLevelOverlay?: boolean;
    className?: string;
}

interface ViewerTextAnnotation {
    id: string;
    type: "text";
    imageIndex: number;
    x: number;
    y: number;
    text: string;
}

interface ViewerMeasureAnnotation {
    id: string;
    type: "measure";
    imageIndex: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

type ViewerAnnotation = ViewerTextAnnotation | ViewerMeasureAnnotation;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const toPercentPoint = (container: HTMLDivElement, clientX: number, clientY: number) => {
    const rect = container.getBoundingClientRect();
    return {
        x: clamp(((clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100),
        y: clamp(((clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100),
    };
};

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const WebImageViewer = forwardRef<DicomViewerHandle, WebImageViewerProps>(
    function WebImageViewer(
        {
            imageUrls,
            currentImageIndex = 0,
            onImageIndexChange,
            onStatusChange,
            activeTool = "pan",
            baselineWindowCenter = -600,
            baselineWindowWidth = 1500,
            windowCenter = -600,
            windowWidth = 1500,
            onWindowLevelChange,
            showWindowLevelOverlay = true,
            className = "w-full h-full relative overflow-hidden select-none",
        },
        ref,
    ) {
        const containerRef = useRef<HTMLDivElement | null>(null);
        const imgRef = useRef<HTMLImageElement | null>(null);
        const [annotations, setAnnotations] = useState<ViewerAnnotation[]>([]);
        const [draftMeasure, setDraftMeasure] = useState<ViewerMeasureAnnotation | null>(null);

        const [tx, setTx] = useState(0);
        const [ty, setTy] = useState(0);
        const [scale, setScale] = useState(1);

        const dragRef = useRef<{
            mode: "pan" | "wl" | null;
            startX: number;
            startY: number;
            baseTx: number;
            baseTy: number;
            baseWC: number;
            baseWW: number;
        } | null>(null);
        const measureDragRef = useRef<boolean>(false);

        useEffect(() => {
            queueMicrotask(() => {
                setTx(0);
                setTy(0);
                setScale(1);
            });
        }, [imageUrls]);

        const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
        useEffect(() => {
            onStatusChange?.(status);
        }, [status, onStatusChange]);

        const hasLoadedOnceRef = useRef(false);
        useEffect(() => {
            if (!hasLoadedOnceRef.current) {
                queueMicrotask(() => setStatus("loading"));
            }
        }, [imageUrls]);

        const currentUrl = imageUrls[clamp(currentImageIndex, 0, imageUrls.length - 1)] ?? "";

        const onImgLoad = () => {
            hasLoadedOnceRef.current = true;
            setStatus("ready");
        };

        const onImgError = () => {
            setStatus("error");
        };

        const onWheel = useCallback(
            (e: React.WheelEvent) => {
                if (!imageUrls.length) return;
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
                    setScale((s) => clamp(s * factor, 0.25, 8));
                    return;
                }

                const step = e.deltaY > 0 ? 1 : -1;
                const next = clamp(currentImageIndex + step, 0, imageUrls.length - 1);
                if (next !== currentImageIndex) onImageIndexChange?.(next);
            },
            [currentImageIndex, imageUrls.length, onImageIndexChange],
        );

        const isWindowTool = activeTool === "wl" || activeTool === "window";
        const isMeasureTool = activeTool === "measure" || activeTool === "ruler";
        const isAnnotateTool = activeTool === "annotate";
        const isEraserTool = activeTool === "eraser";

        const onMouseDown = (e: React.MouseEvent) => {
            if (e.button !== 0 || !containerRef.current) return;

            if (isMeasureTool) {
                e.preventDefault();
                const start = toPercentPoint(containerRef.current, e.clientX, e.clientY);
                measureDragRef.current = true;
                setDraftMeasure({
                    id: makeId("measure"),
                    type: "measure",
                    imageIndex: currentImageIndex,
                    x1: start.x,
                    y1: start.y,
                    x2: start.x,
                    y2: start.y,
                });
                return;
            }

            const mode: "pan" | "wl" | null =
                activeTool === "pan" ? "pan" : isWindowTool ? "wl" : null;
            if (!mode) return;

            e.preventDefault();
            dragRef.current = {
                mode,
                startX: e.clientX,
                startY: e.clientY,
                baseTx: tx,
                baseTy: ty,
                baseWC: windowCenter,
                baseWW: windowWidth,
            };
        };

        useEffect(() => {
            const onMove = (e: MouseEvent) => {
                const drag = dragRef.current;
                if (drag) {
                    const dx = e.clientX - drag.startX;
                    const dy = e.clientY - drag.startY;
                    if (drag.mode === "pan") {
                        setTx(drag.baseTx + dx);
                        setTy(drag.baseTy + dy);
                    } else if (drag.mode === "wl") {
                        const nextWW = Math.max(50, drag.baseWW + dx * 4);
                        const nextWC = drag.baseWC - dy * 4;
                        onWindowLevelChange?.(nextWC, nextWW);
                    }
                }

                if (measureDragRef.current && containerRef.current) {
                    const point = toPercentPoint(containerRef.current, e.clientX, e.clientY);
                    setDraftMeasure((prev) => (
                        prev
                            ? {
                                ...prev,
                                x2: point.x,
                                y2: point.y,
                            }
                            : null
                    ));
                }
            };

            const onUp = () => {
                dragRef.current = null;
                if (measureDragRef.current) {
                    measureDragRef.current = false;
                    setDraftMeasure((prev) => {
                        if (!prev) return null;
                        const length = Math.hypot(prev.x2 - prev.x1, prev.y2 - prev.y1);
                        if (length >= 0.5) {
                            setAnnotations((existing) => [...existing, prev]);
                        }
                        return null;
                    });
                }
            };

            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
            return () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
            };
        }, [onWindowLevelChange]);

        useImperativeHandle(ref, () => ({
            zoomIn: () => setScale((s) => clamp(s * 1.2, 0.25, 8)),
            zoomOut: () => setScale((s) => clamp(s / 1.2, 0.25, 8)),
            fit: () => {
                setTx(0);
                setTy(0);
                setScale(1);
            },
            reset: () => {
                setTx(0);
                setTy(0);
                setScale(1);
                setAnnotations([]);
                setDraftMeasure(null);
                onWindowLevelChange?.(baselineWindowCenter, baselineWindowWidth);
            },
            clearAnnotations: () => {
                setAnnotations([]);
                setDraftMeasure(null);
            },
        }));

        const contrast = clamp(baselineWindowWidth / Math.max(50, windowWidth), 0.3, 3);
        const brightness = clamp(
            1 + (baselineWindowCenter - windowCenter) / baselineWindowWidth,
            0.3,
            2.5,
        );
        const filter = `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)})`;
        const visibleAnnotations = annotations.filter((item) => item.imageIndex === currentImageIndex);

        return (
            <div
                ref={containerRef}
                className={className}
                onWheel={onWheel}
                onMouseDown={onMouseDown}
                onClick={(e) => {
                    if (!isAnnotateTool || !containerRef.current) return;
                    const point = toPercentPoint(containerRef.current, e.clientX, e.clientY);
                    const noteCount = annotations.filter(
                        (item) => item.type === "text" && item.imageIndex === currentImageIndex,
                    ).length;
                    setAnnotations((existing) => [
                        ...existing,
                        {
                            id: makeId("text"),
                            type: "text",
                            imageIndex: currentImageIndex,
                            x: point.x,
                            y: point.y,
                            text: `Note ${noteCount + 1}`,
                        },
                    ]);
                }}
                style={{
                    cursor:
                        activeTool === "pan"
                            ? "grab"
                            : isWindowTool || isMeasureTool
                                ? "crosshair"
                                : isAnnotateTool
                                    ? "cell"
                                    : isEraserTool
                                        ? "not-allowed"
                                        : "default",
                    background: "#000",
                }}
            >
                {currentUrl && (
                    <img
                        ref={imgRef}
                        src={currentUrl}
                        alt=""
                        draggable={false}
                        onLoad={onImgLoad}
                        onError={onImgError}
                        style={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`,
                            transformOrigin: "center center",
                            maxWidth: "100%",
                            maxHeight: "100%",
                            imageRendering: "auto",
                            filter,
                            userSelect: "none",
                            pointerEvents: "none",
                        }}
                    />
                )}
                {status === "loading" && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60 pointer-events-none">
                        Loading...
                    </div>
                )}
                {status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-red-400 pointer-events-none">
                        Image load failed
                    </div>
                )}
                {visibleAnnotations.map((annotation) => {
                    if (annotation.type === "text") {
                        return (
                            <div
                                key={annotation.id}
                                className={`absolute z-[3] flex items-center gap-1 ${isEraserTool ? "cursor-pointer" : "pointer-events-none"}`}
                                style={{
                                    left: `${annotation.x}%`,
                                    top: `${annotation.y}%`,
                                    transform: "translate(-50%, -50%)",
                                }}
                                onClick={(e) => {
                                    if (!isEraserTool) return;
                                    e.stopPropagation();
                                    setAnnotations((existing) => existing.filter((item) => item.id !== annotation.id));
                                }}
                            >
                                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFD54F]" />
                                <div className="rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-[#FFF8E1] whitespace-nowrap">
                                    {annotation.text}
                                </div>
                            </div>
                        );
                    }

                    const dx = annotation.x2 - annotation.x1;
                    const dy = annotation.y2 - annotation.y1;
                    const length = Math.hypot(dx, dy);
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    const labelX = (annotation.x1 + annotation.x2) / 2;
                    const labelY = Math.min(annotation.y1, annotation.y2) - 2;

                    return (
                        <div
                            key={annotation.id}
                            className={`absolute inset-0 z-[3] ${isEraserTool ? "cursor-pointer" : "pointer-events-none"}`}
                            onClick={(e) => {
                                if (!isEraserTool) return;
                                e.stopPropagation();
                                setAnnotations((existing) => existing.filter((item) => item.id !== annotation.id));
                            }}
                        >
                            <div
                                className="absolute origin-left border-t border-cyan-300"
                                style={{
                                    left: `${annotation.x1}%`,
                                    top: `${annotation.y1}%`,
                                    width: `${length}%`,
                                    transform: `rotate(${angle}deg)`,
                                }}
                            />
                            <div className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200 bg-cyan-400/70" style={{ left: `${annotation.x1}%`, top: `${annotation.y1}%` }} />
                            <div className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200 bg-cyan-400/70" style={{ left: `${annotation.x2}%`, top: `${annotation.y2}%` }} />
                            <div
                                className="absolute rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-cyan-100"
                                style={{
                                    left: `${labelX}%`,
                                    top: `${Math.max(0, labelY)}%`,
                                    transform: "translate(-50%, -100%)",
                                }}
                            >
                                {length.toFixed(1)}
                            </div>
                        </div>
                    );
                })}
                {draftMeasure && draftMeasure.imageIndex === currentImageIndex && (
                    <div className="absolute inset-0 z-[3] pointer-events-none">
                        <div
                            className="absolute origin-left border-t border-cyan-300/90"
                            style={{
                                left: `${draftMeasure.x1}%`,
                                top: `${draftMeasure.y1}%`,
                                width: `${Math.hypot(draftMeasure.x2 - draftMeasure.x1, draftMeasure.y2 - draftMeasure.y1)}%`,
                                transform: `rotate(${Math.atan2(draftMeasure.y2 - draftMeasure.y1, draftMeasure.x2 - draftMeasure.x1) * 180 / Math.PI}deg)`,
                            }}
                        />
                    </div>
                )}
                {showWindowLevelOverlay && isWindowTool && (
                    <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 font-mono text-[10px] font-bold leading-tight text-white/85">
                        <div>WW {Math.round(windowWidth)}</div>
                        <div>WL {Math.round(windowCenter)}</div>
                    </div>
                )}
            </div>
        );
    },
);

export default WebImageViewer;
