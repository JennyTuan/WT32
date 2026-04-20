/**
 * FourDMprGrid — 2×2 MPR display backed by pre-rendered 4D WebP stacks.
 *
 * Replaces CornerstoneMPRViewport for the 4D image viewer demo. Each quadrant
 * is an independent WebImageViewer showing axial / coronal / sagittal of the
 * currently selected phase, plus the cross-phase MIP (ITV) in the 4th cell.
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

interface FourDMprGridProps {
    manifest: FourDManifest;
    phase: number;                    // 0..9
    sliceCineTick?: number;
    mipMode?: FourDAggregateMode;
    activeTool?: string;
    windowCenter?: number;
    windowWidth?: number;
    onWindowLevelChange?: (wc: number, ww: number) => void;
    onStatusChange?: (status: "loading" | "ready" | "error") => void;
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
        sliceCineTick = 0,
        mipMode = "MIP",
        activeTool = "pan",
        windowCenter,
        windowWidth,
        onWindowLevelChange,
        onStatusChange,
        className = "absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden",
    },
    ref,
) {
    const axialRef    = useRef<DicomViewerHandle>(null);
    const coronalRef  = useRef<DicomViewerHandle>(null);
    const sagittalRef = useRef<DicomViewerHandle>(null);
    const mipRef      = useRef<DicomViewerHandle>(null);
    const axialPanelRef = useRef<HTMLDivElement>(null);
    const coronalPanelRef = useRef<HTMLDivElement>(null);
    const sagittalPanelRef = useRef<HTMLDivElement>(null);

    // Per-plane slice indices (independent scrubbing)
    const [axialIdx, setAxialIdx] = useState(() => Math.floor(manifest.views.axial.slices / 2));
    const [coronalIdx, setCoronalIdx] = useState(() => Math.floor(manifest.views.coronal.slices / 2));
    const [sagittalIdx, setSagittalIdx] = useState(() => Math.floor(manifest.views.sagittal.slices / 2));
    const [mipIdx, setMipIdx] = useState(() => Math.floor(manifest.mip.coronal.slices / 2));

    // Rebuild URL lists when phase or manifest changes. buildFourDImageUrls is
    // cheap (just string concat) so we don't aggressively memo-key.
    const axialUrls    = useMemo(() => buildFourDImageUrls(manifest, phase, "axial"),    [manifest, phase]);
    const coronalUrls  = useMemo(() => buildFourDImageUrls(manifest, phase, "coronal"),  [manifest, phase]);
    const sagittalUrls = useMemo(() => buildFourDImageUrls(manifest, phase, "sagittal"), [manifest, phase]);
    // Cross-phase aggregate so phase doesn't affect it. Show coronal by default.
    const mipUrls      = useMemo<string[]>(
        () => buildFourDMipUrls(manifest, "coronal", mipMode),
        [manifest, mipMode]
    );

    // Slice-cine: whenever parent bumps tick, advance spatial slices (phase remains locked).
    useEffect(() => {
        if (sliceCineTick <= 0) return;
        setAxialIdx((prev) => (prev + 1) % Math.max(1, axialUrls.length));
        setCoronalIdx((prev) => (prev + 1) % Math.max(1, coronalUrls.length));
        setSagittalIdx((prev) => (prev + 1) % Math.max(1, sagittalUrls.length));
    }, [sliceCineTick, axialUrls.length, coronalUrls.length, sagittalUrls.length]);

    // Bubble status: ready once axial plane has loaded at least one frame.
    const [axialStatus, setAxialStatus] = useState<"loading" | "ready" | "error">("loading");
    useEffect(() => {
        onStatusChange?.(axialStatus);
    }, [axialStatus, onStatusChange]);

    useImperativeHandle(ref, () => ({
        zoomIn:  () => { axialRef.current?.zoomIn(); coronalRef.current?.zoomIn(); sagittalRef.current?.zoomIn(); mipRef.current?.zoomIn(); },
        zoomOut: () => { axialRef.current?.zoomOut(); coronalRef.current?.zoomOut(); sagittalRef.current?.zoomOut(); mipRef.current?.zoomOut(); },
        fit:     () => { axialRef.current?.fit(); coronalRef.current?.fit(); sagittalRef.current?.fit(); mipRef.current?.fit(); },
        reset:   () => { axialRef.current?.reset(); coronalRef.current?.reset(); sagittalRef.current?.reset(); mipRef.current?.reset(); },
        clearAnnotations: () => { /* no-op */ },
    }));

    const baselineWC = manifest.defaults.wl;
    const baselineWW = manifest.defaults.ww;

    const viewerCommon = {
        activeTool,
        baselineWindowCenter: baselineWC,
        baselineWindowWidth: baselineWW,
        windowCenter: windowCenter ?? baselineWC,
        windowWidth: windowWidth ?? baselineWW,
        onWindowLevelChange,
    };

    const panelBase =
        "relative bg-black overflow-hidden border border-[#0F172A]";

    const updateCrosshairFromPointer = useCallback((
        panel: "axial" | "coronal" | "sagittal",
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

    const dragPanelRef = useRef<"axial" | "coronal" | "sagittal" | null>(null);
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
        (panel: "axial" | "coronal" | "sagittal") => ({
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

    return (
        <div className={className}>
            {/* AXIAL */}
            <div
                ref={axialPanelRef}
                className={panelBase}
                {...bindCrosshairDrag("axial")}
            >
                <WebImageViewer
                    ref={axialRef}
                    imageUrls={axialUrls}
                    currentImageIndex={axialIdx}
                    onImageIndexChange={setAxialIdx}
                    onStatusChange={setAxialStatus}
                    {...viewerCommon}
                />
                <CrosshairOverlay
                    {...axialCrosshair}
                    horizontalColor={CORONAL_COLOR}
                    verticalColor={SAGITTAL_COLOR}
                />
                <div className={PANEL_LABEL_STYLE}>AXIAL</div>
            </div>

            {/* CORONAL */}
            <div
                ref={coronalPanelRef}
                className={panelBase}
                {...bindCrosshairDrag("coronal")}
            >
                <WebImageViewer
                    ref={coronalRef}
                    imageUrls={coronalUrls}
                    currentImageIndex={coronalIdx}
                    onImageIndexChange={setCoronalIdx}
                    {...viewerCommon}
                />
                <CrosshairOverlay
                    {...coronalCrosshair}
                    horizontalColor={AXIAL_COLOR}
                    verticalColor={SAGITTAL_COLOR}
                />
                <div className={PANEL_LABEL_STYLE}>CORONAL</div>
            </div>

            {/* SAGITTAL */}
            <div
                ref={sagittalPanelRef}
                className={panelBase}
                {...bindCrosshairDrag("sagittal")}
            >
                <WebImageViewer
                    ref={sagittalRef}
                    imageUrls={sagittalUrls}
                    currentImageIndex={sagittalIdx}
                    onImageIndexChange={setSagittalIdx}
                    {...viewerCommon}
                />
                <CrosshairOverlay
                    {...sagittalCrosshair}
                    horizontalColor={AXIAL_COLOR}
                    verticalColor={CORONAL_COLOR}
                />
                <div className={PANEL_LABEL_STYLE}>SAGITTAL</div>
            </div>

            {/* MIP (cross-phase) */}
            <div className={panelBase}>
                <WebImageViewer
                    ref={mipRef}
                    imageUrls={mipUrls}
                    currentImageIndex={mipIdx}
                    onImageIndexChange={setMipIdx}
                    {...viewerCommon}
                />
                <div className={PANEL_LABEL_STYLE}>{mipMode}</div>
            </div>
        </div>
    );
});

export default FourDMprGrid;
