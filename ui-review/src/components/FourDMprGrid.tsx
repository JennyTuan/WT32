/**
 * FourDMprGrid — 3-view MPR display backed by pre-rendered 4D WebP stacks.
 *
 * Replaces CornerstoneMPRViewport for the 4D image viewer demo. Each panel
 * is an independent WebImageViewer showing axial / coronal / sagittal of the
 * currently selected phase.
 *
 * Slice indices per plane are managed locally (one mid-slice per plane on
 * mount); the phase index is controlled externally via the bottom phase bar.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import {
    buildFourDImageUrls,
    buildFourDMipUrls,
    type FourDAggregateMode,
    type FourDManifest,
} from "../lib/fourDImageSource";
import WebImageViewer from "./WebImageViewer";
import type { DicomViewerHandle } from "./DicomViewer";

export interface FourDMprGridHandle {
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    reset: () => void;
    clearAnnotations: () => void;
}

type MprPanel = "axial" | "coronal" | "sagittal";
type InitialLayout = "mpr" | "axial-single";

interface FourDCornerInfo {
    patientName?: string;
    patientId?: string;
    patientSex?: string;
    patientAge?: string;
    modality?: string;
    studyDate?: string;
    studyTime?: string;
    seriesDescription?: string;
    kvp?: string;
    mas?: string;
    pixelSpacing?: string;
    thickness?: string;
    institution?: string;
    manufacturer?: string;
    rows?: number;
    cols?: number;
    ww?: number;
    wl?: number;
}

interface FourDMprGridProps {
    manifest: FourDManifest;
    phase: number;                    // 0..9
    onPhaseChange?: (phase: number) => void;
    showPhaseBadge?: boolean;
    showCornerInfo?: boolean;
    cornerInfo?: FourDCornerInfo;
    initialLayout?: InitialLayout;
    sliceCineTick?: number;
    mipMode?: FourDAggregateMode;
    activeTool?: string;
    windowCenter?: number;
    windowWidth?: number;
    onWindowLevelChange?: (wc: number, ww: number) => void;
    onStatusChange?: (status: "loading" | "ready" | "error") => void;
    progressiveSliceLoad?: boolean;
    onProgressiveSliceLoadComplete?: () => void;
    className?: string;
}

const PANEL_LABEL_STYLE =
    "absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.18em] text-white/90 bg-black/40 rounded pointer-events-none";

const AXIAL_COLOR = "#EF4444";
const CORONAL_COLOR = "#22C55E";
const SAGITTAL_COLOR = "#FACC15";

function toPercent(index: number, count: number) {
    if (count <= 1) return 50;
    return (index / (count - 1)) * 100;
}

function CrosshairOverlay({
    horizontalColor,
    verticalColor,
    xPercent,
    yPercent,
}: {
    horizontalColor: string;
    verticalColor: string;
    xPercent: number;
    yPercent: number;
}) {
    return (
        <div
            className="pointer-events-none absolute inset-0 z-[2]"
        >
            <div
                className="absolute top-0 bottom-0 w-px shadow-[0_0_10px_rgba(255,255,255,0.18)]"
                style={{ left: `${xPercent}%`, backgroundColor: verticalColor }}
            />
            <div
                className="absolute left-0 right-0 h-px shadow-[0_0_10px_rgba(255,255,255,0.18)]"
                style={{ top: `${yPercent}%`, backgroundColor: horizontalColor }}
            />
            <div
                className="absolute h-2.5 w-2.5 rounded-full border border-white/80 bg-white/20 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${xPercent}%`, top: `${yPercent}%` }}
            />
        </div>
    );
}

const FourDMprGrid = forwardRef<FourDMprGridHandle, FourDMprGridProps>(function FourDMprGrid(
    {
        manifest,
        phase,
        onPhaseChange,
        showPhaseBadge = true,
        showCornerInfo = false,
        cornerInfo,
        initialLayout = "mpr",
        sliceCineTick = 0,
        mipMode = "MIP",
        activeTool = "pan",
        windowCenter,
        windowWidth,
        onWindowLevelChange,
        onStatusChange,
        progressiveSliceLoad = false,
        onProgressiveSliceLoadComplete,
        className = "absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden",
    },
    ref,
) {
    const axialRef    = useRef<DicomViewerHandle>(null);
    const coronalRef  = useRef<DicomViewerHandle>(null);
    const sagittalRef = useRef<DicomViewerHandle>(null);
    const axialPanelRef = useRef<HTMLDivElement>(null);
    const coronalPanelRef = useRef<HTMLDivElement>(null);
    const sagittalPanelRef = useRef<HTMLDivElement>(null);

    // Single-view (maximized) panel — double-click a panel to enter single-view
    // mode and double-click again to return to the MPR layout.
    const [maximizedPanel, setMaximizedPanel] = useState<MprPanel | null>(initialLayout === "axial-single" ? "axial" : null);
    useEffect(() => {
        queueMicrotask(() => {
            setMaximizedPanel(initialLayout === "axial-single" ? "axial" : null);
        });
    }, [initialLayout]);

    const toggleMaximize = useCallback((panel: MprPanel) => {
        setMaximizedPanel((prev) => (prev === panel ? null : panel));
    }, []);

    // Per-plane slice indices (independent scrubbing)
    const [axialIdx, setAxialIdx] = useState(() => Math.floor(manifest.views.axial.slices / 2));
    const [coronalIdx, setCoronalIdx] = useState(() => Math.floor(manifest.views.coronal.slices / 2));
    const [sagittalIdx, setSagittalIdx] = useState(() => Math.floor(manifest.views.sagittal.slices / 2));

    const usePhaseStacks = showPhaseBadge;
    const axialUrls = useMemo(
        () => usePhaseStacks ? buildFourDImageUrls(manifest, phase, "axial") : buildFourDMipUrls(manifest, "axial", mipMode),
        [manifest, mipMode, phase, usePhaseStacks],
    );
    const coronalUrls = useMemo(
        () => usePhaseStacks ? buildFourDImageUrls(manifest, phase, "coronal") : buildFourDMipUrls(manifest, "coronal", mipMode),
        [manifest, mipMode, phase, usePhaseStacks],
    );
    const sagittalUrls = useMemo(
        () => usePhaseStacks ? buildFourDImageUrls(manifest, phase, "sagittal") : buildFourDMipUrls(manifest, "sagittal", mipMode),
        [manifest, mipMode, phase, usePhaseStacks],
    );
    const [progressiveAxialCount, setProgressiveAxialCount] = useState(() => progressiveSliceLoad ? 0 : axialUrls.length);
    const visibleAxialUrls = useMemo(
        () => progressiveSliceLoad ? axialUrls.slice(0, progressiveAxialCount) : axialUrls,
        [axialUrls, progressiveAxialCount, progressiveSliceLoad],
    );

    useEffect(() => {
        queueMicrotask(() => {
            setAxialIdx((prev) => Math.min(prev, Math.max(0, visibleAxialUrls.length - 1)));
            setCoronalIdx((prev) => Math.min(prev, Math.max(0, coronalUrls.length - 1)));
            setSagittalIdx((prev) => Math.min(prev, Math.max(0, sagittalUrls.length - 1)));
        });
    }, [visibleAxialUrls.length, coronalUrls.length, sagittalUrls.length]);

    useEffect(() => {
        if (!progressiveSliceLoad) {
            queueMicrotask(() => {
                setProgressiveAxialCount(axialUrls.length);
            });
            return;
        }

        let cancelled = false;
        let nextIndex = 0;
        queueMicrotask(() => {
            setProgressiveAxialCount(0);
            setAxialIdx(0);
        });

        const loadNext = () => {
            if (cancelled) return;
            if (nextIndex >= axialUrls.length) {
                onProgressiveSliceLoadComplete?.();
                return;
            }

            const indexToLoad = nextIndex;
            const img = new Image();
            const done = () => {
                if (cancelled) return;
                nextIndex = indexToLoad + 1;
                setProgressiveAxialCount(nextIndex);
                setAxialIdx(Math.max(0, nextIndex - 1));
                window.setTimeout(loadNext, 22);
            };
            img.onload = done;
            img.onerror = done;
            img.src = axialUrls[indexToLoad];
        };

        const startTimer = window.setTimeout(loadNext, 80);
        return () => {
            cancelled = true;
            window.clearTimeout(startTimer);
        };
    }, [axialUrls, onProgressiveSliceLoadComplete, progressiveSliceLoad]);

    // Slice-cine: whenever parent bumps tick, advance spatial slices (phase remains locked).
    useEffect(() => {
        if (sliceCineTick <= 0) return;
        queueMicrotask(() => {
            setAxialIdx((prev) => (prev + 1) % Math.max(1, visibleAxialUrls.length));
            setCoronalIdx((prev) => (prev + 1) % Math.max(1, coronalUrls.length));
            setSagittalIdx((prev) => (prev + 1) % Math.max(1, sagittalUrls.length));
        });
    }, [sliceCineTick, visibleAxialUrls.length, coronalUrls.length, sagittalUrls.length]);

    // Bubble status: ready once axial plane has loaded at least one frame.
    const [axialStatus, setAxialStatus] = useState<"loading" | "ready" | "error">("loading");
    useEffect(() => {
        onStatusChange?.(axialStatus);
    }, [axialStatus, onStatusChange]);

    useImperativeHandle(ref, () => ({
        zoomIn:  () => { axialRef.current?.zoomIn(); coronalRef.current?.zoomIn(); sagittalRef.current?.zoomIn(); },
        zoomOut: () => { axialRef.current?.zoomOut(); coronalRef.current?.zoomOut(); sagittalRef.current?.zoomOut(); },
        fit:     () => { axialRef.current?.fit(); coronalRef.current?.fit(); sagittalRef.current?.fit(); },
        reset:   () => { axialRef.current?.reset(); coronalRef.current?.reset(); sagittalRef.current?.reset(); },
        clearAnnotations: () => { /* no-op */ },
    }));

    const phaseValueLabel = useMemo(() => {
        const v = manifest.phase_values?.[phase];
        const num = typeof v === "number" ? v : phase * 10;
        return `Phase ${Math.round(num)}%`;
    }, [manifest.phase_values, phase]);

    const phaseOptions = useMemo(() => {
        const count = manifest.phases ?? manifest.phase_values?.length ?? 10;
        return Array.from({ length: count }, (_, i) => ({
            index: i,
            value: Math.round(manifest.phase_values?.[i] ?? i * 10),
        }));
    }, [manifest.phases, manifest.phase_values]);

    const [phasePickerPanel, setPhasePickerPanel] = useState<MprPanel | null>(null);
    const phasePickerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!showPhaseBadge) {
            queueMicrotask(() => setPhasePickerPanel(null));
        }
    }, [showPhaseBadge]);

    useEffect(() => {
        if (!phasePickerPanel) return;
        const handle = (e: MouseEvent) => {
            if (!phasePickerRef.current?.contains(e.target as Node)) {
                setPhasePickerPanel(null);
            }
        };
        window.addEventListener("pointerdown", handle);
        return () => window.removeEventListener("pointerdown", handle);
    }, [phasePickerPanel]);

    const renderPhaseBadge = (panel: MprPanel) => {
        if (!showPhaseBadge) return null;

        const open = phasePickerPanel === panel;
        return (
            <div ref={open ? phasePickerRef : undefined} className="absolute top-2 right-2 z-[3]">
                <button
                    type="button"
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold tracking-wide backdrop-blur-sm transition-colors ${
                        open
                            ? "border-[#4D94FF] bg-[#1E3A8A]/90 text-white shadow-[0_0_0_2px_rgba(77,148,255,0.25)]"
                            : "border-white/15 bg-black/55 text-[#60A5FA] hover:border-[#4D94FF]/60 hover:bg-[#1E3A8A]/70 hover:text-white"
                    }`}
                    onClick={(e) => {
                        e.stopPropagation();
                        setPhasePickerPanel((prev) => (prev === panel ? null : panel));
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                >
                    <span>{phaseValueLabel}</span>
                    <svg
                        width="9"
                        height="9"
                        viewBox="0 0 8 8"
                        fill="currentColor"
                        className={`transition-transform ${open ? "rotate-180" : ""}`}
                    >
                        <path d="M0 2l4 4 4-4z" />
                    </svg>
                </button>
                {open && (
                    <div
                        className="absolute right-0 top-full mt-1.5 w-[180px] overflow-hidden rounded-lg border border-white/15 bg-[#0B1220]/95 shadow-xl backdrop-blur-md"
                        onDoubleClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                            <span>选择相位</span>
                            <span className="text-[#60A5FA]">{phaseValueLabel}</span>
                        </div>
                        <div className="grid grid-cols-5 gap-1 p-2">
                            {phaseOptions.map((opt) => {
                                const active = opt.index === phase;
                                return (
                                    <button
                                        key={opt.index}
                                        type="button"
                                        onClick={() => {
                                            onPhaseChange?.(opt.index);
                                            setPhasePickerPanel(null);
                                        }}
                                        className={`rounded-md py-1.5 text-[11px] font-bold tabular-nums transition-colors ${
                                            active
                                                ? "bg-[#4D94FF] text-white shadow-[0_0_8px_rgba(77,148,255,0.5)]"
                                                : "bg-white/5 text-slate-200 hover:bg-white/15 hover:text-white"
                                        }`}
                                    >
                                        {opt.value}%
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const textOrDash = (value: unknown) => {
        if (value === null || value === undefined || value === "" || value === "N/A") return "-";
        return String(value);
    };

    const getPanelSliceInfo = (panel: MprPanel) => {
        if (panel === "axial") {
            return {
                label: "AXIAL",
                index: axialIdx,
                count: Math.max(visibleAxialUrls.length, axialUrls.length),
                viewMeta: manifest.views.axial,
            };
        }
        if (panel === "coronal") {
            return {
                label: "CORONAL",
                index: coronalIdx,
                count: coronalUrls.length,
                viewMeta: manifest.views.coronal,
            };
        }
        return {
            label: "SAGITTAL",
            index: sagittalIdx,
            count: sagittalUrls.length,
            viewMeta: manifest.views.sagittal,
        };
    };

    const renderCornerInfo = (panel: MprPanel) => {
        if (!showCornerInfo || maximizedPanel !== panel) return null;

        const slice = getPanelSliceInfo(panel);
        const rows = cornerInfo?.rows && cornerInfo.rows > 0 ? cornerInfo.rows : slice.viewMeta.height;
        const cols = cornerInfo?.cols && cornerInfo.cols > 0 ? cornerInfo.cols : slice.viewMeta.width;
        const spacing = cornerInfo?.pixelSpacing && cornerInfo.pixelSpacing !== "N/A"
            ? cornerInfo.pixelSpacing
            : `${manifest.spacing.x.toFixed(2)}\\${manifest.spacing.y.toFixed(2)} mm`;
        const thickness = cornerInfo?.thickness && cornerInfo.thickness !== "N/A"
            ? cornerInfo.thickness
            : `${manifest.spacing.z.toFixed(2)} mm`;

        const commonClass = "pointer-events-none absolute z-[4] font-mono text-[10px] leading-[1.35] text-[#CFD8DC] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]";

        return (
            <>
                <div className={`${commonClass} left-2 top-2`}>
                    <div className="font-bold">{textOrDash(cornerInfo?.patientName)}</div>
                    <div>ID {textOrDash(cornerInfo?.patientId)} | {textOrDash(cornerInfo?.patientSex)} {textOrDash(cornerInfo?.patientAge)}</div>
                    <div>{textOrDash(cornerInfo?.modality ?? "CT")} | {textOrDash(cornerInfo?.studyDate)} {textOrDash(cornerInfo?.studyTime)}</div>
                </div>
                <div className={`${commonClass} right-2 top-2 text-right`}>
                    <div className="font-bold">{textOrDash(cornerInfo?.seriesDescription ?? manifest.study)}</div>
                    <div>Image {slice.index + 1}/{Math.max(1, slice.count)}</div>
                    <div>KV {textOrDash(cornerInfo?.kvp)} | mAs {textOrDash(cornerInfo?.mas)}</div>
                </div>
                <div className={`${commonClass} bottom-2 left-2`}>
                    <div>WW/WL {Math.round(cornerInfo?.ww ?? windowWidth ?? baselineWW)} / {Math.round(cornerInfo?.wl ?? windowCenter ?? baselineWC)}</div>
                    <div>Spacing {spacing}</div>
                    <div>{rows} x {cols}</div>
                </div>
                <div className={`${commonClass} bottom-2 right-2 text-right`}>
                    <div>Slice {slice.index + 1}/{Math.max(1, slice.count)} | Thick {thickness}</div>
                    <div>{manifest.case}</div>
                    <div>{textOrDash(cornerInfo?.institution)} | {textOrDash(cornerInfo?.manufacturer)}</div>
                </div>
            </>
        );
    };

    const baselineWC = manifest.defaults.wl;
    const baselineWW = manifest.defaults.ww;

    const viewerCommon = {
        activeTool,
        baselineWindowCenter: baselineWC,
        baselineWindowWidth: baselineWW,
        windowCenter: windowCenter ?? baselineWC,
        windowWidth: windowWidth ?? baselineWW,
        onWindowLevelChange,
        showWindowLevelOverlay: !showCornerInfo,
    };

    const panelBase =
        "relative bg-black overflow-hidden border border-[#0F172A]";

    const updateCrosshairFromPointer = useCallback((
        panel: MprPanel,
        clientX: number,
        clientY: number,
    ) => {
        const panelRef =
            panel === "axial" ? axialPanelRef.current :
            panel === "coronal" ? coronalPanelRef.current :
            sagittalPanelRef.current;
        if (!panelRef) return;
        const rect = panelRef.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const xRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const yRatio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

        const toIndex = (ratio: number, count: number) =>
            Math.max(0, Math.min(count - 1, Math.round(ratio * Math.max(count - 1, 0))));

        if (panel === "axial") {
            setSagittalIdx(toIndex(xRatio, manifest.views.sagittal.slices));
            setCoronalIdx(toIndex(yRatio, manifest.views.coronal.slices));
            return;
        }

        if (panel === "coronal") {
            setSagittalIdx(toIndex(xRatio, manifest.views.sagittal.slices));
            setAxialIdx(toIndex(yRatio, manifest.views.axial.slices));
            return;
        }

        setCoronalIdx(toIndex(xRatio, manifest.views.coronal.slices));
        setAxialIdx(toIndex(yRatio, manifest.views.axial.slices));
    }, [manifest.views.axial.slices, manifest.views.coronal.slices, manifest.views.sagittal.slices]);

    const dragPanelRef = useRef<MprPanel | null>(null);
    useEffect(() => {
        const handleMove = (event: PointerEvent) => {
            if (!dragPanelRef.current) return;
            updateCrosshairFromPointer(dragPanelRef.current, event.clientX, event.clientY);
        };
        const handleUp = () => {
            dragPanelRef.current = null;
        };
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
        return () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", handleUp);
        };
    }, [updateCrosshairFromPointer]);

    const axialCrosshair = {
        xPercent: toPercent(sagittalIdx, manifest.views.sagittal.slices),
        yPercent: toPercent(coronalIdx, manifest.views.coronal.slices),
    };
    const coronalCrosshair = {
        xPercent: toPercent(sagittalIdx, manifest.views.sagittal.slices),
        yPercent: toPercent(axialIdx, manifest.views.axial.slices),
    };
    const sagittalCrosshair = {
        xPercent: toPercent(coronalIdx, manifest.views.coronal.slices),
        yPercent: toPercent(axialIdx, manifest.views.axial.slices),
    };

    const bindCrosshairDrag = useCallback(
        (panel: MprPanel) => ({
            onPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => {
                // Keep regular pan/WL mouse gestures available; use Shift+drag
                // when the operator wants to reposition MPR crosshairs.
                if (!event.shiftKey) return;
                dragPanelRef.current = panel;
                updateCrosshairFromPointer(panel, event.clientX, event.clientY);
                event.preventDefault();
                event.stopPropagation();
            },
        }),
        [updateCrosshairFromPointer],
    );

    const panelLayoutClass = (panel: MprPanel) => {
        if (maximizedPanel === panel) return "col-span-2 row-span-2 col-start-1 row-start-1";
        if (maximizedPanel !== null) return "hidden";
        if (panel === "axial") return "col-start-1 row-start-1";
        if (panel === "sagittal") return "col-start-1 row-start-2";
        return "col-start-2 row-start-1 row-span-2";
    };

    const showCrosshair = maximizedPanel === null;
    const showPanelLabels = maximizedPanel === null || !showCornerInfo;

    return (
        <div className={className}>
            {/* AXIAL */}
            <div
                ref={axialPanelRef}
                className={`${panelBase} ${panelLayoutClass("axial")}`}
                onDoubleClick={() => toggleMaximize("axial")}
                {...bindCrosshairDrag("axial")}
            >
                <WebImageViewer
                    ref={axialRef}
                    imageUrls={visibleAxialUrls}
                    currentImageIndex={axialIdx}
                    onImageIndexChange={setAxialIdx}
                    onStatusChange={setAxialStatus}
                    {...viewerCommon}
                />
                {showCrosshair && (
                    <CrosshairOverlay
                        {...axialCrosshair}
                        horizontalColor={CORONAL_COLOR}
                        verticalColor={SAGITTAL_COLOR}
                    />
                )}
                {showPanelLabels && <div className={PANEL_LABEL_STYLE}>AXIAL</div>}
                {renderPhaseBadge("axial")}
                {renderCornerInfo("axial")}
            </div>

            {/* SAGITTAL */}
            <div
                ref={sagittalPanelRef}
                className={`${panelBase} ${panelLayoutClass("sagittal")}`}
                onDoubleClick={() => toggleMaximize("sagittal")}
                {...bindCrosshairDrag("sagittal")}
            >
                <WebImageViewer
                    ref={sagittalRef}
                    imageUrls={sagittalUrls}
                    currentImageIndex={sagittalIdx}
                    onImageIndexChange={setSagittalIdx}
                    {...viewerCommon}
                />
                {showCrosshair && (
                    <CrosshairOverlay
                        {...sagittalCrosshair}
                        horizontalColor={AXIAL_COLOR}
                        verticalColor={CORONAL_COLOR}
                    />
                )}
                {showPanelLabels && <div className={PANEL_LABEL_STYLE}>SAGITTAL</div>}
                {renderPhaseBadge("sagittal")}
                {renderCornerInfo("sagittal")}
            </div>

            {/* CORONAL */}
            <div
                ref={coronalPanelRef}
                className={`${panelBase} ${panelLayoutClass("coronal")}`}
                onDoubleClick={() => toggleMaximize("coronal")}
                {...bindCrosshairDrag("coronal")}
            >
                <WebImageViewer
                    ref={coronalRef}
                    imageUrls={coronalUrls}
                    currentImageIndex={coronalIdx}
                    onImageIndexChange={setCoronalIdx}
                    {...viewerCommon}
                />
                {showCrosshair && (
                    <CrosshairOverlay
                        {...coronalCrosshair}
                        horizontalColor={AXIAL_COLOR}
                        verticalColor={SAGITTAL_COLOR}
                    />
                )}
                {showPanelLabels && <div className={PANEL_LABEL_STYLE}>CORONAL</div>}
                {renderPhaseBadge("coronal")}
                {renderCornerInfo("coronal")}
            </div>
        </div>
    );
});

export default FourDMprGrid;
