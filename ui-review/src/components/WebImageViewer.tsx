/**
 * WebImageViewer — a lightweight viewport for pre-rendered WebP stacks.
 *
 * Used by the 4D image viewer where phase images are pre-processed into
 * WebP (see `lib/fourDImageSource.ts`). API-compatible with DicomViewer so
 * it can be dropped in under the same ref type.
 *
 * Supports: pan (drag with pan tool), zoom (wheel with modifier / buttons),
 * slice scrub (plain wheel), window/level approximation via CSS brightness
 * + contrast filter on top of the baked-in lung window.
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
    activeTool?: string; // "pan" | "wl" | "window" | "measure" | "annotate" | "eraser"
    /** Baseline window center the WebPs were rendered with (e.g. lung WL=-600). */
    baselineWindowCenter?: number;
    /** Baseline window width the WebPs were rendered with (e.g. lung WW=1500). */
    baselineWindowWidth?: number;
    /** User-tweaked window center. Diff from baseline drives a CSS brightness shift. */
    windowCenter?: number;
    /** User-tweaked window width. Diff from baseline drives a CSS contrast shift. */
    windowWidth?: number;
    onWindowLevelChange?: (windowCenter: number, windowWidth: number) => void;
    showWindowLevelOverlay?: boolean;
    className?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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

        // view transform: translate in CSS px, zoom as scale factor
        const [tx, setTx] = useState(0);
        const [ty, setTy] = useState(0);
        const [scale, setScale] = useState(1);

        // drag state
        const dragRef = useRef<{
            mode: "pan" | "wl" | null;
            startX: number;
            startY: number;
            baseTx: number;
            baseTy: number;
            baseWC: number;
            baseWW: number;
        } | null>(null);

        // Reset transform whenever the stack changes (different view/phase)
        useEffect(() => {
            queueMicrotask(() => {
                setTx(0);
                setTy(0);
                setScale(1);
            });
        }, [imageUrls]);

        // Fire status to parent. "loading" until first image load, then "ready".
        // If the URL fails (404) we emit "error".
        const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
        useEffect(() => {
            onStatusChange?.(status);
        }, [status, onStatusChange]);

        // When url changes, flip to loading if we haven't seen any image yet. For
        // subsequent images (already warmed) the browser cache usually returns
        // instantly — we keep "ready" to avoid flicker.
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

        // ── Interaction ───────────────────────────────────────────────────────
        const onWheel = useCallback(
            (e: React.WheelEvent) => {
                if (!imageUrls.length) return;
                if (e.ctrlKey || e.metaKey) {
                    // zoom
                    e.preventDefault();
                    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
                    setScale((s) => clamp(s * factor, 0.25, 8));
                    return;
                }
                // slice scrub
                const step = e.deltaY > 0 ? 1 : -1;
                const next = clamp(currentImageIndex + step, 0, imageUrls.length - 1);
                if (next !== currentImageIndex) onImageIndexChange?.(next);
            },
            [currentImageIndex, imageUrls.length, onImageIndexChange],
        );

        const onMouseDown = (e: React.MouseEvent) => {
            if (e.button !== 0) return;
            const isWindowTool = activeTool === "wl" || activeTool === "window";
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
                const d = dragRef.current;
                if (!d) return;
                const dx = e.clientX - d.startX;
                const dy = e.clientY - d.startY;
                if (d.mode === "pan") {
                    setTx(d.baseTx + dx);
                    setTy(d.baseTy + dy);
                } else if (d.mode === "wl") {
                    // horizontal → width, vertical → center (DICOM convention)
                    const newWW = Math.max(50, d.baseWW + dx * 4);
                    const newWC = d.baseWC - dy * 4;
                    onWindowLevelChange?.(newWC, newWW);
                }
            };
            const onUp = () => {
                dragRef.current = null;
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
            return () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
            };
        }, [onWindowLevelChange]);

        // ── Imperative handle ─────────────────────────────────────────────────
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
                onWindowLevelChange?.(baselineWindowCenter, baselineWindowWidth);
            },
            clearAnnotations: () => {
                /* no-op: WebImageViewer doesn't support annotations (demo scope) */
            },
        }));

        // ── WL simulation via CSS filter ──────────────────────────────────────
        // The WebPs were rendered with the baseline window already baked in. When
        // the user tweaks WW/WL we approximate re-windowing with brightness +
        // contrast. Not radiologically accurate but fine for a UI demo.
        const contrast = clamp(baselineWindowWidth / Math.max(50, windowWidth), 0.3, 3);
        // Shift: more negative WL → brighter (more soft tissue visible in lung)
        const brightness = clamp(
            1 + (baselineWindowCenter - windowCenter) / baselineWindowWidth,
            0.3,
            2.5,
        );
        const filter = `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)})`;
        const isWindowTool = activeTool === "wl" || activeTool === "window";

        return (
            <div
                ref={containerRef}
                className={className}
                onWheel={onWheel}
                onMouseDown={onMouseDown}
                style={{
                    cursor:
                        activeTool === "pan" ? "grab" : isWindowTool ? "crosshair" : "default",
                    background: "#000",
                }}
            >
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
                {status === "loading" && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60 pointer-events-none">
                        加载中…
                    </div>
                )}
                {status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-red-400 pointer-events-none">
                        图像加载失败
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
