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
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import {
    buildFourDImageUrls,
    buildFourDMipUrls,
    type FourDManifest,
    type FourDView,
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
    mipMode?: "MIP" | "MinIP" | "Avg"; // label only; we only pre-render MIP
    activeTool?: string;
    windowCenter?: number;
    windowWidth?: number;
    onWindowLevelChange?: (wc: number, ww: number) => void;
    onStatusChange?: (status: "loading" | "ready" | "error") => void;
    className?: string;
}

const PANEL_LABEL_STYLE =
    "absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.18em] text-white/90 bg-black/40 rounded pointer-events-none";

const FourDMprGrid = forwardRef<FourDMprGridHandle, FourDMprGridProps>(function FourDMprGrid(
    {
        manifest,
        phase,
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
    // MIP is cross-phase so phase doesn't affect it. Show coronal by default (most common ITV view).
    const mipUrls      = useMemo<string[]>(() => buildFourDMipUrls(manifest, "coronal"), [manifest]);

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

    return (
        <div className={className}>
            {/* AXIAL */}
            <div className={panelBase}>
                <WebImageViewer
                    ref={axialRef}
                    imageUrls={axialUrls}
                    currentImageIndex={axialIdx}
                    onImageIndexChange={setAxialIdx}
                    onStatusChange={setAxialStatus}
                    {...viewerCommon}
                />
                <div className={PANEL_LABEL_STYLE}>AXIAL</div>
            </div>

            {/* CORONAL */}
            <div className={panelBase}>
                <WebImageViewer
                    ref={coronalRef}
                    imageUrls={coronalUrls}
                    currentImageIndex={coronalIdx}
                    onImageIndexChange={setCoronalIdx}
                    {...viewerCommon}
                />
                <div className={PANEL_LABEL_STYLE}>CORONAL</div>
            </div>

            {/* SAGITTAL */}
            <div className={panelBase}>
                <WebImageViewer
                    ref={sagittalRef}
                    imageUrls={sagittalUrls}
                    currentImageIndex={sagittalIdx}
                    onImageIndexChange={setSagittalIdx}
                    {...viewerCommon}
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
