import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as dicomParser from "dicom-parser";
import { classifyDicomFetchFailure, translateDicomLoadFailure, type DicomLoadFailure } from "../lib/dicomFetchError";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsUp,
    FilePlus,
    Trash2,
    Check,
    Info,
    Hand,
    ZoomIn,
    ZoomOut,
    RotateCcw,
} from "lucide-react";
import { fetchSelectedScanSession, updateScanSessionSeriesExecution, updateSelectedScanSessionHelicalParam } from "../lib/scanSession";
import type { ApiScanSessionDetail, ApiScanSessionHelicalParam } from "../lib/scanSession";

import { loadSelectedPatient } from "../lib/patientSession";
import { loadSelectedScanWorkflowPlans, type WorkflowSequenceType } from "../lib/scanWorkflowSession";
import { useDoseThresholdGuard } from "../lib/useDoseThresholdGuard";
import { estimateDose } from "../lib/doseEstimate";
import { buildApiUrl } from "../lib/apiClient";
import ScanConfirmScreen, { PatientConfirmationModal } from "./ScanConfirmScreen";
import AppHeader from "../components/AppHeader";
import { FeedbackViewportOverlay } from "../components/FeedbackNotice";
import PhysicalTriggerGuide, { type PhysicalTriggerStep } from "../components/PhysicalTriggerGuide";
import ThresholdGuardModal from "../components/ThresholdGuardModal";
import DicomViewer from "../components/DicomViewer";
import { TomographicScoutViewport, type TomographicScoutSeriesOverride } from "./SequenceScanConfirmScreen";
import { useI18n } from "../lib/i18nContext";
import { DEFAULT_SCOUT_CROP_BOX, applyMeasurementsToCropBox, loadScoutPositioningRange, mapScoutRangeToCropBox } from "../lib/scoutPositioningSession";
import {
    getLimbsDicomSeries,
    loadLimbsDicomDemoManifest,
    type LimbsDicomDemoManifest,
} from "../lib/limbsDicomDemo";
import {
    getHeadDualScoutSeries,
    loadHeadDualScoutManifest,
    type HeadDualScoutManifest,
    type HeadDualScoutSeries,
} from "../lib/headDualScoutDemo";
import { buildScanSessionExecutionContext, isTerminalScanSessionStatus, resolveTopogramImageSource } from "../lib/scanSeriesPrerequisites";
import { ScanParamWriteCoordinator } from "../lib/scanParamWriteCoordinator";

type ProtocolSeedHelicalParam = {
    ma?: number | null;
    kv?: number | null;
    rotation_time?: number | null;
    pitch?: number | null;
    scan_length?: number | null;
    ctdi_vol?: number | null;
    dlp?: number | null;
};

// Demo dataset for the "脑部螺旋" (brain helical, non-gating) protocol — JPEG Lossless
// DICOM served from backend/data/Head Stroke Demo [Plain]/Series 001 [Topogram]/.
// Other protocols and the gating/4D path do NOT use this override and keep their
// legacy loader unchanged.
const BRAIN_HELICAL_SCOUT_OVERRIDE: TomographicScoutSeriesOverride = {
    kind: "topogram",
    url: "/dicom-head-stroke-plain/scout/scout.dcm",
    fallbackWindowWidth: 130,
    fallbackWindowLevel: 130,
};
import AutoMaPanel, { NOISE_SLIDER_DEFAULT, type NoiseLevel } from "../components/AutoMaPanel";
import { computeDoseModulation, type ScoutHuData } from "../lib/doseModulation";

const HELICAL_DOSE_CURVE_STEPS = 80; // matches HELICAL_SAMPLE_COUNT in AutoMaPanel

// ---------------------------------------------------------------------------
// Constants for gating waveform / bed positions / DICOM
// ---------------------------------------------------------------------------
const BREATHING_BED_POSITION_COUNT = 10;
const FOUR_D_SCOUT_SERIES = {
    basePath: "/daae3df7f522b56724aed7e3e544c0fe/series-000002",
    count: 1,
    firstImageNumber: 2,
    fallbackWindowWidth: 500,
    fallbackWindowLevel: 50,
};

function WindowLevelIcon({ size = 14 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
            <path d="M12 6.25v11.5" />
            <path d="M12 6.25a5.75 5.75 0 0 0 0 11.5" fill="currentColor" stroke="none" opacity="0.32" />
            <path d="M12 6.25a5.75 5.75 0 0 1 0 11.5" />
        </svg>
    );
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
    return Math.min(1, Math.max(0, value));
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------
interface Sequence {
    id: string;
    name: string;
    type: WorkflowSequenceType;
    steps?: string[];
}

type ScanStage = "idle" | "arming" | "positioning" | "positioned" | "enabled" | "exposing" | "completed";
type PhysicalTriggerAction = "position" | "exposure";
const HOLD_DURATION_MS = 3000;
const POSITIONING_DURATION_MS = 1000;

interface ProtocolGroup {
    id: string;
    name: string;
    sequences: Sequence[];
}

interface FourDLoadedSlice {
    instanceNumber: number;
    positionZ: number;
    rows: number;
    cols: number;
    hu: Float32Array;
    ww: number;
    wl: number;
    kvp: string;
    mas: string;
    thickness: string;
}

type FourDDragHandle = "move" | "top" | "bottom" | "left" | "right";

type HeadDualScoutView = "ap" | "lat";
type HeadDualScoutDragHandle = "move" | "top" | "bottom" | "left" | "right";
type HeadDualScoutCropBox = { x: number; y: number; width: number; height: number };
type HeadDualScoutXRange = { x: number; width: number };
type HeadDualScoutZRange = { y: number; height: number };
type HeadDualScoutMeta = {
    width: number;
    height: number;
    pixelSpacingX: number;
    pixelSpacingY: number;
    windowWidth: number;
    windowCenter: number;
    rowDirection: [number, number, number];
    columnDirection: [number, number, number];
    imagePosition: [number, number, number];
};

const parseFiniteNumber = (value: unknown): number | null => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const parseDicomVector3 = (
    values: Array<string | number | null | undefined> | undefined,
    start: number,
    fallback: [number, number, number],
): [number, number, number] => {
    const parsed = [0, 1, 2].map((offset) => parseFiniteNumber(values?.[start + offset]));
    return parsed.every((value): value is number => value !== null)
        ? [parsed[0], parsed[1], parsed[2]]
        : fallback;
};

const sameXRange = (a: HeadDualScoutXRange, b: HeadDualScoutXRange) =>
    Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.width - b.width) < 1e-4;

// sharedZ is stored as physical millimeters along the patient Z axis so that
// AP (vertical) and LAT (horizontal) coupling stays correct even if the two
// scouts have different pixel scales. Tolerance below is in mm.
const sameZRange = (a: HeadDualScoutZRange, b: HeadDualScoutZRange) =>
    Math.abs(a.y - b.y) < 1e-2 && Math.abs(a.height - b.height) < 1e-2;

const buildHeadDualScoutMeta = (
    series: HeadDualScoutSeries,
    defaultWindowWidth: number,
    defaultWindowLevel: number,
): HeadDualScoutMeta => {
    const rows = series.rows > 0 ? series.rows : 512;
    const cols = series.cols > 0 ? series.cols : 512;
    const fov = parseFiniteNumber(series.fov);
    const rowSpacing = parseFiniteNumber(series.pixelSpacing[0]);
    const colSpacing = parseFiniteNumber(series.pixelSpacing[1]);

    return {
        width: cols,
        height: rows,
        pixelSpacingX: colSpacing ?? (fov && cols > 0 ? fov / cols : 1),
        pixelSpacingY: rowSpacing ?? 1,
        windowWidth: series.windowWidth ?? defaultWindowWidth,
        windowCenter: series.windowCenter ?? defaultWindowLevel,
        rowDirection: parseDicomVector3(series.imageOrientationPatient, 0, [1, 0, 0]),
        columnDirection: parseDicomVector3(series.imageOrientationPatient, 3, [0, 1, 0]),
        imagePosition: parseDicomVector3(series.imagePositionPatient, 0, [0, 0, 0]),
    };
};

const mapHeadDualImagePointToLps = (
    meta: HeadDualScoutMeta,
    normalizedX: number,
    normalizedY: number,
) => {
    const column = clamp01(normalizedX) * Math.max(0, meta.width - 1);
    const row = clamp01(normalizedY) * Math.max(0, meta.height - 1);
    const columnOffset = column * meta.pixelSpacingX;
    const rowOffset = row * meta.pixelSpacingY;

    return {
        x: meta.imagePosition[0] + meta.rowDirection[0] * columnOffset + meta.columnDirection[0] * rowOffset,
        y: meta.imagePosition[1] + meta.rowDirection[1] * columnOffset + meta.columnDirection[1] * rowOffset,
        z: meta.imagePosition[2] + meta.rowDirection[2] * columnOffset + meta.columnDirection[2] * rowOffset,
    };
};

const getHeadDualHandleCursor = (handle: HeadDualScoutDragHandle) => {
    if (handle === "top" || handle === "bottom") return "ns-resize";
    if (handle === "left" || handle === "right") return "ew-resize";
    return "move";
};

/**
 * Aspect-locked stage that sizes itself to the largest rect of the given aspect
 * that fits inside the outer panel. Refs/overlay coordinates can then use the
 * stage as their reference, so a "20% of stage width" overlay actually lines up
 * with "20% of the rendered DICOM image" — the DicomViewer fits-to-contain
 * inside the same stage, so they share the exact same rect.
 */
function ScoutPanelStage({
    view,
    aspect,
    stageRef,
    rounded,
    label,
    paneOverlay,
    children,
}: {
    view: HeadDualScoutView;
    aspect: number;
    stageRef: React.MutableRefObject<HTMLDivElement | null>;
    rounded: string;
    label: string;
    paneOverlay?: React.ReactNode;
    children: React.ReactNode;
}) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

    useEffect(() => {
        const el = panelRef.current;
        if (!el) return;
        const compute = () => {
            const w = el.clientWidth;
            const h = el.clientHeight;
            if (w <= 0 || h <= 0) return;
            const safeAspect = aspect > 0 ? aspect : 1;
            // Largest rect of `safeAspect` (= width/height) that fits in w×h.
            let stageW = w;
            let stageH = w / safeAspect;
            if (stageH > h) {
                stageH = h;
                stageW = h * safeAspect;
            }
            setStageSize((prev) =>
                prev && Math.abs(prev.width - stageW) < 0.5 && Math.abs(prev.height - stageH) < 0.5
                    ? prev
                    : { width: stageW, height: stageH },
            );
        };
        compute();
        const ro = new ResizeObserver(compute);
        ro.observe(el);
        return () => ro.disconnect();
    }, [aspect]);

    return (
        <div
            ref={panelRef}
            className={`relative h-full min-w-0 overflow-hidden bg-black flex items-center justify-center ${rounded}`}
            data-scout-view={view}
        >
            <div
                ref={stageRef}
                className="relative"
                style={stageSize ? { width: stageSize.width, height: stageSize.height } : { visibility: "hidden", width: 0, height: 0 }}
            >
                {children}
                <div className="pointer-events-none absolute bottom-3 left-3 z-30 rounded border border-[#4D94FF]/40 bg-[#08111f]/85 px-2 py-1 text-[10px] font-black tracking-[0.12em] text-[#DBEAFE]">
                    {label}
                </div>
            </div>
            {paneOverlay ? <div className="pointer-events-none absolute right-3 top-3 z-40">{paneOverlay}</div> : null}
        </div>
    );
}

function HeadDualScoutConfirmViewport({
    apSeries,
    latSeries,
    defaultWindowWidth,
    defaultWindowLevel,
    initialMeasurements,
    scanPositionRatio,
    showScanPositionGuide,
    onScanPositionRatioChange,
    onMeasurementChange,
    onCropBoxChange,
    onLoadStateChange,
}: {
    apSeries: HeadDualScoutSeries;
    latSeries: HeadDualScoutSeries;
    defaultWindowWidth: number;
    defaultWindowLevel: number;
    initialMeasurements?: { scanLength?: string; scoutFov?: string };
    scanPositionRatio: number;
    showScanPositionGuide: boolean;
    onScanPositionRatioChange: (ratio: number) => void;
    onMeasurementChange: (values: { scanLength: string; scoutFov: string }) => void;
    onCropBoxChange: (cropBox: HeadDualScoutCropBox) => void;
    onLoadStateChange: (state: "loading" | "ready" | "error") => void;
}) {
    const apViewportRef = useRef<HTMLDivElement | null>(null);
    const latViewportRef = useRef<HTMLDivElement | null>(null);
    const cropDragRef = useRef<{
        view: HeadDualScoutView;
        handle: HeadDualScoutDragHandle;
        pointerId: number;
        startX: number;
        startY: number;
        initialX: HeadDualScoutXRange;
        initialZ: HeadDualScoutZRange;
    } | null>(null);
    const positionDragRef = useRef<{ view: HeadDualScoutView; pointerId: number } | null>(null);
    const centerDragRef = useRef<{ view: HeadDualScoutView; pointerId: number } | null>(null);
    const cropBoxRef = useRef<Record<HeadDualScoutView, HeadDualScoutCropBox>>({
        ap: DEFAULT_SCOUT_CROP_BOX,
        lat: DEFAULT_SCOUT_CROP_BOX,
    });
    const [apLoadState, setApLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [latLoadState, setLatLoadState] = useState<"loading" | "ready" | "error">("loading");

    useEffect(() => {
        if (apLoadState === "error" || latLoadState === "error") {
            onLoadStateChange("error");
        } else if (apLoadState === "ready" && latLoadState === "ready") {
            onLoadStateChange("ready");
        } else {
            onLoadStateChange("loading");
        }
    }, [apLoadState, latLoadState, onLoadStateChange]);

    const apMeta = useMemo(
        () => buildHeadDualScoutMeta(apSeries, defaultWindowWidth, defaultWindowLevel),
        [apSeries, defaultWindowLevel, defaultWindowWidth],
    );
    const latMeta = useMemo(
        () => buildHeadDualScoutMeta(latSeries, defaultWindowWidth, defaultWindowLevel),
        [defaultWindowLevel, defaultWindowWidth, latSeries],
    );
    const initialCropBox = useMemo(() => {
        const savedRange = loadScoutPositioningRange();
        const baseCropBox = savedRange ? mapScoutRangeToCropBox(savedRange) : DEFAULT_SCOUT_CROP_BOX;
        const scanLength = initialMeasurements?.scanLength ? Number(initialMeasurements.scanLength) : null;
        const scoutFov = initialMeasurements?.scoutFov ? Number(initialMeasurements.scoutFov) : null;
        return applyMeasurementsToCropBox(baseCropBox, { scanLength, scoutFov }, {
            width: apMeta.width,
            height: apMeta.height,
            pixelSpacingX: apMeta.pixelSpacingX,
            sliceThickness: apMeta.pixelSpacingY,
        });
    }, [apMeta.height, apMeta.pixelSpacingX, apMeta.pixelSpacingY, apMeta.width, initialMeasurements]);

    // Each scout's Z axis maps to a different image axis (AP vertical, LAT
    // horizontal); store Z extent in patient-mm so the two views stay coupled
    // regardless of pixel-scale differences between the DICOMs.
    const apZSpanMm = apMeta.height * apMeta.pixelSpacingY;
    const latZSpanMm = latMeta.width * latMeta.pixelSpacingX;
    const sharedZSpanMm = Math.max(1, Math.min(apZSpanMm, latZSpanMm));
    const minZMm = Math.max(20, sharedZSpanMm * 0.08);

    const [sharedZ, setSharedZ] = useState<HeadDualScoutZRange>(() => ({
        y: initialCropBox.y * apZSpanMm,
        height: initialCropBox.height * apZSpanMm,
    }));
    const [apX, setApX] = useState<HeadDualScoutXRange>(() => ({
        x: initialCropBox.x,
        width: initialCropBox.width,
    }));
    // LAT cross-axis is patient A-P (front-back depth of head), a different
    // anatomical dimension from AP's L-R width — give it its own default
    // centered on the head profile rather than copying AP's L-R range.
    const [latX, setLatX] = useState<HeadDualScoutXRange>(() => ({
        x: 0.18,
        width: 0.62,
    }));
    const [reconCenterRatio, setReconCenterRatio] = useState({ x: 0.5, y: 0.5 });

    const apCropBox = useMemo<HeadDualScoutCropBox>(
        () => ({
            x: apX.x,
            width: apX.width,
            y: sharedZ.y / apZSpanMm,
            height: sharedZ.height / apZSpanMm,
        }),
        [apX, sharedZ, apZSpanMm],
    );
    const latCropBox = useMemo<HeadDualScoutCropBox>(
        () => ({
            x: sharedZ.y / latZSpanMm,
            width: sharedZ.height / latZSpanMm,
            y: latX.x,
            height: latX.width,
        }),
        [latX, sharedZ, latZSpanMm],
    );

    useEffect(() => {
        cropBoxRef.current = { ap: apCropBox, lat: latCropBox };
    }, [apCropBox, latCropBox]);

    const apMeasurements = useMemo(() => ({
        scanLength: sharedZ.height.toFixed(1),
        scoutFov: (apCropBox.width * apMeta.width * apMeta.pixelSpacingX).toFixed(1),
    }), [apCropBox, apMeta, sharedZ.height]);
    const scanPositionMm = Number(apMeasurements.scanLength);
    const zPositionRatio = clamp01(scanPositionRatio);
    const apReconPoint = mapHeadDualImagePointToLps(
        apMeta,
        apCropBox.x + reconCenterRatio.x * apCropBox.width,
        apCropBox.y + zPositionRatio * apCropBox.height,
    );
    const latReconPoint = mapHeadDualImagePointToLps(
        latMeta,
        latCropBox.x + zPositionRatio * latCropBox.width,
        latCropBox.y + reconCenterRatio.y * latCropBox.height,
    );
    const reconCenterXMm = apReconPoint.x;
    const reconCenterYMm = latReconPoint.y;
    const reconCenterLabel = {
        x: Number.isFinite(reconCenterXMm) ? reconCenterXMm.toFixed(1) : "--",
        y: Number.isFinite(reconCenterYMm) ? reconCenterYMm.toFixed(1) : "--",
    };

    useEffect(() => {
        onMeasurementChange(apMeasurements);
        onCropBoxChange(apCropBox);
    }, [apCropBox, apMeasurements, onCropBoxChange, onMeasurementChange]);

    const getViewportElement = (view: HeadDualScoutView) =>
        view === "ap" ? apViewportRef.current : latViewportRef.current;

    const setIndependentRange = useCallback((view: HeadDualScoutView, nextX: HeadDualScoutXRange) => {
        if (view === "ap") {
            setApX((prev) => (sameXRange(prev, nextX) ? prev : nextX));
        } else {
            setLatX((prev) => (sameXRange(prev, nextX) ? prev : nextX));
        }
    }, []);

    const updateScanPositionFromPointer = useCallback((view: HeadDualScoutView, clientX: number, clientY: number) => {
        const viewport = getViewportElement(view);
        if (!viewport) return;
        const rect = viewport.getBoundingClientRect();
        const cropBox = cropBoxRef.current[view];
        const cropLeft = rect.left + cropBox.x * rect.width;
        const cropTop = rect.top + cropBox.y * rect.height;
        const cropWidth = Math.max(1, cropBox.width * rect.width);
        const cropHeight = Math.max(1, cropBox.height * rect.height);
        const ratio = view === "lat"
            ? (clientX - cropLeft) / cropWidth
            : (clientY - cropTop) / cropHeight;
        onScanPositionRatioChange(clamp01(ratio));
    }, [onScanPositionRatioChange]);

    const updateReconCenterFromPointer = useCallback((view: HeadDualScoutView, clientX: number, clientY: number) => {
        const viewport = getViewportElement(view);
        if (!viewport) return;
        const rect = viewport.getBoundingClientRect();
        const cropBox = cropBoxRef.current[view];
        const cropLeft = rect.left + cropBox.x * rect.width;
        const cropTop = rect.top + cropBox.y * rect.height;
        const cropWidth = Math.max(1, cropBox.width * rect.width);
        const cropHeight = Math.max(1, cropBox.height * rect.height);
        const xRatio = clamp01((clientX - cropLeft) / cropWidth);
        const yRatio = clamp01((clientY - cropTop) / cropHeight);

        if (view === "lat") {
            setReconCenterRatio((prev) => (Math.abs(prev.y - yRatio) < 1e-4 ? prev : { ...prev, y: yRatio }));
            onScanPositionRatioChange(xRatio);
            return;
        }

        setReconCenterRatio((prev) => (Math.abs(prev.x - xRatio) < 1e-4 ? prev : { ...prev, x: xRatio }));
        onScanPositionRatioChange(yRatio);
    }, [onScanPositionRatioChange]);

    useEffect(() => {
        const handleMove = (event: PointerEvent) => {
            const centerDrag = centerDragRef.current;
            if (centerDrag && centerDrag.pointerId === event.pointerId) {
                event.preventDefault();
                updateReconCenterFromPointer(centerDrag.view, event.clientX, event.clientY);
                return;
            }

            const positionDrag = positionDragRef.current;
            if (positionDrag && positionDrag.pointerId === event.pointerId) {
                event.preventDefault();
                updateScanPositionFromPointer(positionDrag.view, event.clientX, event.clientY);
                return;
            }

            const cropDrag = cropDragRef.current;
            if (!cropDrag || cropDrag.pointerId !== event.pointerId) return;
            const viewport = getViewportElement(cropDrag.view);
            if (!viewport) return;

            event.preventDefault();
            const rect = viewport.getBoundingClientRect();
            const dx = (event.clientX - cropDrag.startX) / Math.max(1, rect.width);
            const dy = (event.clientY - cropDrag.startY) / Math.max(1, rect.height);
            const minSize = 0.08;
            const isLat = cropDrag.view === "lat";
            // Z axis maps to AP-vertical (dy) or LAT-horizontal (dx); convert
            // the normalized delta of the active viewport into patient mm using
            // that viewport's own Z span so the two views drag at the same
            // physical rate.
            const activeZSpanMm = isLat ? latZSpanMm : apZSpanMm;
            const zDeltaMm = (isLat ? dx : dy) * activeZSpanMm;
            const crossDelta = isLat ? dy : dx;

            if (cropDrag.handle === "move") {
                const nextX = {
                    x: clamp(cropDrag.initialX.x + crossDelta, 0, 1 - cropDrag.initialX.width),
                    width: cropDrag.initialX.width,
                };
                const nextZ = {
                    y: clamp(cropDrag.initialZ.y + zDeltaMm, 0, sharedZSpanMm - cropDrag.initialZ.height),
                    height: cropDrag.initialZ.height,
                };
                setIndependentRange(cropDrag.view, nextX);
                setSharedZ((prev) => (sameZRange(prev, nextZ) ? prev : nextZ));
                return;
            }

            if (cropDrag.handle === "top") {
                if (isLat) {
                    const nextXStart = clamp(
                        cropDrag.initialX.x + dy,
                        0,
                        cropDrag.initialX.x + cropDrag.initialX.width - minSize,
                    );
                    const nextX = {
                        x: nextXStart,
                        width: cropDrag.initialX.width + (cropDrag.initialX.x - nextXStart),
                    };
                    setIndependentRange(cropDrag.view, nextX);
                    return;
                }
                const nextY = clamp(
                    cropDrag.initialZ.y + zDeltaMm,
                    0,
                    cropDrag.initialZ.y + cropDrag.initialZ.height - minZMm,
                );
                const nextZ = {
                    y: nextY,
                    height: cropDrag.initialZ.height + (cropDrag.initialZ.y - nextY),
                };
                setSharedZ((prev) => (sameZRange(prev, nextZ) ? prev : nextZ));
                return;
            }

            if (cropDrag.handle === "bottom") {
                if (isLat) {
                    const nextX = {
                        x: cropDrag.initialX.x,
                        width: clamp(cropDrag.initialX.width + dy, minSize, 1 - cropDrag.initialX.x),
                    };
                    setIndependentRange(cropDrag.view, nextX);
                    return;
                }
                const nextZ = {
                    y: cropDrag.initialZ.y,
                    height: clamp(cropDrag.initialZ.height + zDeltaMm, minZMm, sharedZSpanMm - cropDrag.initialZ.y),
                };
                setSharedZ((prev) => (sameZRange(prev, nextZ) ? prev : nextZ));
                return;
            }

            if (cropDrag.handle === "left") {
                if (isLat) {
                    const nextY = clamp(
                        cropDrag.initialZ.y + zDeltaMm,
                        0,
                        cropDrag.initialZ.y + cropDrag.initialZ.height - minZMm,
                    );
                    const nextZ = {
                        y: nextY,
                        height: cropDrag.initialZ.height + (cropDrag.initialZ.y - nextY),
                    };
                    setSharedZ((prev) => (sameZRange(prev, nextZ) ? prev : nextZ));
                    return;
                }
                const nextXStart = clamp(
                    cropDrag.initialX.x + dx,
                    0,
                    cropDrag.initialX.x + cropDrag.initialX.width - minSize,
                );
                const nextX = {
                    x: nextXStart,
                    width: cropDrag.initialX.width + (cropDrag.initialX.x - nextXStart),
                };
                setIndependentRange(cropDrag.view, nextX);
                return;
            }

            if (isLat) {
                const nextZ = {
                    y: cropDrag.initialZ.y,
                    height: clamp(cropDrag.initialZ.height + zDeltaMm, minZMm, sharedZSpanMm - cropDrag.initialZ.y),
                };
                setSharedZ((prev) => (sameZRange(prev, nextZ) ? prev : nextZ));
                return;
            }

            const nextX = {
                x: cropDrag.initialX.x,
                width: clamp(cropDrag.initialX.width + dx, minSize, 1 - cropDrag.initialX.x),
            };
            setIndependentRange(cropDrag.view, nextX);
        };

        const handleUp = (event: PointerEvent) => {
            if (centerDragRef.current?.pointerId === event.pointerId) {
                centerDragRef.current = null;
            }
            if (positionDragRef.current?.pointerId === event.pointerId) {
                positionDragRef.current = null;
            }
            if (cropDragRef.current?.pointerId === event.pointerId) {
                cropDragRef.current = null;
            }
        };

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
        window.addEventListener("pointercancel", handleUp);
        return () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", handleUp);
            window.removeEventListener("pointercancel", handleUp);
        };
    }, [setIndependentRange, updateReconCenterFromPointer, updateScanPositionFromPointer, apZSpanMm, latZSpanMm, sharedZSpanMm, minZMm]);

    const sharedZRef = useRef(sharedZ);
    useEffect(() => { sharedZRef.current = sharedZ; }, [sharedZ]);

    const startCropDrag = (view: HeadDualScoutView, handle: HeadDualScoutDragHandle) =>
        (event: React.PointerEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            const cropBox = cropBoxRef.current[view];
            const currentZ = sharedZRef.current;
            cropDragRef.current = {
                view,
                handle,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                initialX: view === "lat"
                    ? { x: cropBox.y, width: cropBox.height }
                    : { x: cropBox.x, width: cropBox.width },
                // initialZ is now in patient mm (sharedZ), not normalized.
                initialZ: { y: currentZ.y, height: currentZ.height },
            };
        };

    const startPositionDrag = (view: HeadDualScoutView) =>
        (event: React.PointerEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            positionDragRef.current = { view, pointerId: event.pointerId };
            updateScanPositionFromPointer(view, event.clientX, event.clientY);
        };

    const startCenterDrag = (view: HeadDualScoutView) =>
        (event: React.PointerEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            centerDragRef.current = { view, pointerId: event.pointerId };
            updateReconCenterFromPointer(view, event.clientX, event.clientY);
        };

    const renderReconCenterBadge = () => (
        <div className="min-w-[116px] rounded border border-[#FF2D2D]/55 bg-[#111827]/90 px-2 py-1.5 text-right shadow-[0_0_14px_rgba(255,45,45,0.22)]">
            <div className="mb-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-[#FCA5A5]">重建中心 LPS</div>
            <div className="font-mono text-[10px] font-black leading-tight text-[#FEE2E2]">X(L) {reconCenterLabel.x} mm</div>
            <div className="font-mono text-[10px] font-black leading-tight text-[#FEE2E2]">Y(P) {reconCenterLabel.y} mm</div>
        </div>
    );

    const renderCropOverlay = (view: HeadDualScoutView, cropBox: HeadDualScoutCropBox) => {
        const isLat = view === "lat";
        const positionPercent = clamp01(scanPositionRatio) * 100;
        const positionLabel = `Z ${Number.isFinite(scanPositionMm) ? (clamp01(scanPositionRatio) * scanPositionMm).toFixed(1) : "--"} mm`;
        const centerLeftPercent = isLat ? positionPercent : reconCenterRatio.x * 100;
        const centerTopPercent = isLat ? reconCenterRatio.y * 100 : positionPercent;

        return (
            <div className="pointer-events-none absolute inset-0 z-20">
                <div
                    className="pointer-events-auto absolute border-2 border-[#4D94FF] bg-[#4D94FF]/8 shadow-[0_0_0_1px_rgba(77,148,255,0.22),0_0_24px_rgba(77,148,255,0.18)]"
                    style={{
                        left: `${cropBox.x * 100}%`,
                        top: `${cropBox.y * 100}%`,
                        width: `${cropBox.width * 100}%`,
                        height: `${cropBox.height * 100}%`,
                        cursor: getHeadDualHandleCursor("move"),
                        touchAction: "none",
                    }}
                    onPointerDown={startCropDrag(view, "move")}
                >
                    <div className="absolute inset-0 border border-white/20">
                        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/20" />
                        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/20" />
                    </div>
                    <div
                        className="pointer-events-auto absolute z-40 h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-move touch-none"
                        style={{ left: `${centerLeftPercent}%`, top: `${centerTopPercent}%` }}
                        onPointerDown={startCenterDrag(view)}
                        aria-label="Move reconstruction center"
                        title="Move reconstruction center"
                    >
                        <div className="absolute bottom-1 left-1/2 top-1 w-[2px] -translate-x-1/2 bg-[#FF2D2D] shadow-[0_0_8px_rgba(255,45,45,0.9)]" />
                        <div className="absolute left-1 right-1 top-1/2 h-[2px] -translate-y-1/2 bg-[#FF2D2D] shadow-[0_0_8px_rgba(255,45,45,0.9)]" />
                        <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-[#FF2D2D] shadow-[0_0_10px_rgba(255,45,45,0.95)]" />
                    </div>
                    {showScanPositionGuide && isLat ? (
                        <div
                            className="absolute top-0 bottom-0 z-30 w-10 -translate-x-1/2 cursor-ew-resize touch-none"
                            style={{ left: `${positionPercent}%` }}
                            onPointerDown={startPositionDrag(view)}
                            title="Scan position"
                        >
                            <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-[#FBBF24] shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
                            <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-[#0F172A]/90 px-1.5 py-0.5 text-[9px] font-mono font-bold text-[#FBBF24] ring-1 ring-[#FBBF24]/40">
                                {positionLabel}
                            </div>
                        </div>
                    ) : showScanPositionGuide ? (
                        <div
                            className="absolute left-0 right-0 z-30 h-10 -translate-y-1/2 cursor-ns-resize touch-none"
                            style={{ top: `${positionPercent}%` }}
                            onPointerDown={startPositionDrag(view)}
                            title="Scan position"
                        >
                            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[#FBBF24] shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
                            <div className="absolute left-2 top-1/2 -translate-y-1/2 rounded bg-[#0F172A]/90 px-1.5 py-0.5 text-[9px] font-mono font-bold text-[#FBBF24] ring-1 ring-[#FBBF24]/40">
                                {positionLabel}
                            </div>
                        </div>
                    ) : null}
                    <div
                        className="absolute -top-4 left-1/2 h-8 w-16 -translate-x-1/2 bg-transparent"
                        style={{ cursor: getHeadDualHandleCursor("top"), touchAction: "none" }}
                        onPointerDown={startCropDrag(view, "top")}
                    />
                    <div
                        className="absolute -bottom-4 left-1/2 h-8 w-16 -translate-x-1/2 bg-transparent"
                        style={{ cursor: getHeadDualHandleCursor("bottom"), touchAction: "none" }}
                        onPointerDown={startCropDrag(view, "bottom")}
                    />
                    <div
                        className="absolute left-0 top-1/2 h-16 w-8 -translate-x-1/2 -translate-y-1/2 bg-transparent"
                        style={{ cursor: getHeadDualHandleCursor("left"), touchAction: "none" }}
                        onPointerDown={startCropDrag(view, "left")}
                    />
                    <div
                        className="absolute right-0 top-1/2 h-16 w-8 translate-x-1/2 -translate-y-1/2 bg-transparent"
                        style={{ cursor: getHeadDualHandleCursor("right"), touchAction: "none" }}
                        onPointerDown={startCropDrag(view, "right")}
                    />
                </div>
            </div>
        );
    };

    const renderScoutPanel = (
        view: HeadDualScoutView,
        series: HeadDualScoutSeries,
        meta: HeadDualScoutMeta,
        cropBox: HeadDualScoutCropBox,
    ) => {
        const aspect = meta.width > 0 && meta.height > 0 ? meta.width / meta.height : 1;
        return (
            <ScoutPanelStage
                view={view}
                aspect={aspect}
                stageRef={view === "ap" ? apViewportRef : latViewportRef}
                rounded={view === "ap" ? "rounded-l-md" : "rounded-r-md"}
                label={view === "ap" ? "AP · 正位 0°" : "LAT · 侧位 90°"}
                paneOverlay={renderReconCenterBadge()}
            >
                <DicomViewer
                    key={series.url}
                    imageUrls={[series.url]}
                    currentImageIndex={0}
                    activeTool="pan"
                    windowCenter={meta.windowCenter}
                    windowWidth={meta.windowWidth}
                    interpolationMode="LINEAR"
                    onStatusChange={view === "ap" ? setApLoadState : setLatLoadState}
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-black/60 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-black/65 to-transparent" />
                {renderCropOverlay(view, cropBox)}
            </ScoutPanelStage>
        );
    };

    return (
        <div className="grid h-full flex-1 grid-cols-2 gap-[3px] bg-[#0A0F14]">
            {renderScoutPanel("ap", apSeries, apMeta, apCropBox)}
            {renderScoutPanel("lat", latSeries, latMeta, latCropBox)}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Gating Scout Viewport (Robust implementation copied from ScoutScanScreen)
// ---------------------------------------------------------------------------
export interface FourDScoutViewportProps {
    onCropBoxChange?: (box: { width: number; height: number }) => void;
    onRectChange?: (rect: { x: number; y: number; width: number; height: number }) => void;
    onLoadStateChange?: (state: "loading" | "ready" | "error") => void;
    isScanning?: boolean;
    revealY?: number; // 0 to 1
    enableImageTools?: boolean;
}

export function FourDScoutViewport({
    onCropBoxChange,
    onRectChange,
    onLoadStateChange,
    isScanning,
    revealY = 1,
    enableImageTools = false,
}: FourDScoutViewportProps) {
    const { t } = useI18n();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const projectionRef = useRef<Float32Array | null>(null);
    const projectionSizeRef = useRef<{ width: number; height: number } | null>(null);
    const metaRef = useRef<{ ww: number; wl: number; kvp: string; mas: string; thickness: string } | null>(null);
    const onCropBoxChangeRef = useRef(onCropBoxChange);
    const onRectChangeRef = useRef(onRectChange);

    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [loadError, setLoadError] = useState<DicomLoadFailure | null>(null);
    const [meta, setMeta] = useState<{ width: number; height: number; ww: number; wl: number; kvp: string; mas: string; thickness: string } | null>(null);
    const [windowWidth, setWindowWidth] = useState(FOUR_D_SCOUT_SERIES.fallbackWindowWidth);
    const [windowLevel, setWindowLevel] = useState(FOUR_D_SCOUT_SERIES.fallbackWindowLevel);
    const [isAdjustingWindow, setIsAdjustingWindow] = useState(false);
    const [interactionMode, setInteractionMode] = useState<"wl" | "pan">("wl");
    const [zoomScale, setZoomScale] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [cropBox, setCropBox] = useState({ x: 0.2, y: 0.18, width: 0.56, height: 0.48 });

    useEffect(() => {
        onLoadStateChange?.(loadState);
    }, [loadState, onLoadStateChange]);

    useEffect(() => {
        onCropBoxChangeRef.current = onCropBoxChange;
        onRectChangeRef.current = onRectChange;
    }, [onCropBoxChange, onRectChange]);

    const dragStateRef = useRef<{ startX: number; startY: number; startWw: number; startWl: number } | null>(null);
    const panDragStateRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
    const cropDragStateRef = useRef<{ handle: FourDDragHandle; startX: number; startY: number; initialBox: { x: number; y: number; width: number; height: number } } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const loadSlices = async () => {
            try {
                const sliceNumbers = Array.from(
                    { length: FOUR_D_SCOUT_SERIES.count },
                    (_, index) => FOUR_D_SCOUT_SERIES.firstImageNumber + index
                );
                const slices: FourDLoadedSlice[] = [];
                const concurrency = 8;

                for (let start = 0; start < sliceNumbers.length; start += concurrency) {
                    const batch = sliceNumbers.slice(start, start + concurrency);
                    const loadedBatch = await Promise.all(
                        batch.map(async (sliceNumber) => {
                            const fileName = `image-${String(sliceNumber).padStart(6, "0")}.dcm`;
                            let response: Response;
                            try {
                                response = await fetch(`${FOUR_D_SCOUT_SERIES.basePath}/${fileName}`);
                            } catch (netErr) {
                                throw Object.assign(new Error("network"), { __dicomRes: null, __dicomNetErr: netErr });
                            }
                            if (!response.ok) {
                                throw Object.assign(new Error(`Failed to fetch ${fileName}`), { __dicomRes: response });
                            }
                            let arrayBuffer: ArrayBuffer;
                            try {
                                arrayBuffer = await response.arrayBuffer();
                            } catch (streamErr) {
                                throw Object.assign(new Error("truncated"), { __dicomRes: null, __dicomNetErr: streamErr });
                            }
                            const byteArray = new Uint8Array(arrayBuffer);
                            let dataSet;
                            try {
                                dataSet = dicomParser.parseDicom(byteArray);
                            } catch (parseErr) {
                                throw Object.assign(new Error("DICM parse failed"), { __dicomRes: null, __dicomNetErr: parseErr });
                            }
                            const rows = dataSet.uint16("x00280010") ?? 0;
                            const cols = dataSet.uint16("x00280011") ?? 0;
                            const bitsAllocated = dataSet.uint16("x00280100") ?? 16;
                            const pixelRepresentation = dataSet.uint16("x00280103") ?? 0;
                            const intercept = Number(dataSet.string("x00281052") ?? "0");
                            const slope = Number(dataSet.string("x00281053") ?? "1");
                            const positionZ = Number((dataSet.string("x00200032") ?? "0\\0\\0").split("\\")[2] ?? 0);
                            const pixelDataElement = dataSet.elements.x7fe00010;
                            if (!pixelDataElement || rows === 0 || cols === 0) throw new Error(`Missing pixel data for ${fileName}`);
                            const pixelData = byteArray.slice(pixelDataElement.dataOffset, pixelDataElement.dataOffset + pixelDataElement.length);
                            const pixelBuffer = pixelData.buffer.slice(pixelData.byteOffset, pixelData.byteOffset + pixelData.byteLength);
                            const values = bitsAllocated === 16 ? (pixelRepresentation === 1 ? new Int16Array(pixelBuffer) : new Uint16Array(pixelBuffer)) : new Uint16Array(pixelBuffer);
                            const hu = new Float32Array(values.length);
                            for (let i = 0; i < values.length; i += 1) { hu[i] = values[i] * slope + intercept; }
                            return {
                                instanceNumber: Number(dataSet.string("x00200013") ?? sliceNumber), positionZ, rows, cols, hu,
                                ww: Number(dataSet.string("x00281051") ?? `${FOUR_D_SCOUT_SERIES.fallbackWindowWidth}`),
                                wl: Number(dataSet.string("x00281050") ?? `${FOUR_D_SCOUT_SERIES.fallbackWindowLevel}`),
                                kvp: dataSet.string("x00180060") ?? "120", mas: dataSet.string("x00181152") ?? "Auto", thickness: dataSet.string("x00180050") ?? "3.0 mm",
                            };
                        })
                    );
                    loadedBatch.forEach((slice) => {
                        slices.push(slice);
                        if (!metaRef.current) {
                            metaRef.current = {
                                ww: Number.isFinite(slice.ww) && slice.ww > 1 ? slice.ww : FOUR_D_SCOUT_SERIES.fallbackWindowWidth,
                                wl: Number.isFinite(slice.wl) ? slice.wl : FOUR_D_SCOUT_SERIES.fallbackWindowLevel,
                                kvp: slice.kvp, mas: slice.mas, thickness: slice.thickness,
                            };
                        }
                    });
                }
                slices.sort((a, b) => b.positionZ - a.positionZ || a.instanceNumber - b.instanceNumber);
                if (slices.length === 0) throw new Error("No slices");
                const rows = slices[0].rows;
                const cols = slices[0].cols;
                const depthCenter = Math.floor(slices.length / 2);
                const depthHalfBand = Math.max(4, Math.floor(slices.length * 0.06));
                const depthStart = Math.max(0, depthCenter - depthHalfBand);
                const depthEnd = Math.min(slices.length, depthCenter + depthHalfBand + 1);
                const output = new Float32Array(cols * rows);
                for (let y = 0; y < rows; y += 1) {
                    for (let x = 0; x < cols; x += 1) {
                        let accum = 0, samples = 0;
                        for (let z = depthStart; z < depthEnd; z += 1) { accum += slices[z].hu[y * cols + x]; samples += 1; }
                        output[y * cols + x] = accum / Math.max(samples, 1);
                    }
                }
                if (cancelled) return;
                projectionRef.current = output;
                projectionSizeRef.current = { width: cols, height: rows };
                setMeta({
                    width: cols, height: rows,
                    ww: metaRef.current?.ww ?? FOUR_D_SCOUT_SERIES.fallbackWindowWidth,
                    wl: metaRef.current?.wl ?? FOUR_D_SCOUT_SERIES.fallbackWindowLevel,
                    kvp: metaRef.current?.kvp ?? "120", mas: metaRef.current?.mas ?? "Auto", thickness: metaRef.current?.thickness ?? "3.0 mm",
                });
                setWindowWidth(metaRef.current?.ww ?? FOUR_D_SCOUT_SERIES.fallbackWindowWidth);
                setWindowLevel(metaRef.current?.wl ?? FOUR_D_SCOUT_SERIES.fallbackWindowLevel);
                setLoadState("ready");
            } catch (err) {
                console.error(err);
                if (cancelled) return;
                const tagged = err as { __dicomRes?: Response | null; __dicomNetErr?: unknown };
                const failure = await classifyDicomFetchFailure(tagged.__dicomRes ?? null, tagged.__dicomNetErr ?? err);
                setLoadError(failure);
                setLoadState("error");
            }
        };
        void loadSlices();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current, viewport = viewportRef.current, projectedHu = projectionRef.current, size = projectionSizeRef.current;
        if (!canvas || !viewport || !projectedHu || !size) return;
        const viewW = Math.max(1, Math.floor(viewport.clientWidth)), viewH = Math.max(1, Math.floor(viewport.clientHeight));
        if (canvas.width !== viewW || canvas.height !== viewH) { canvas.width = viewW; canvas.height = viewH; }
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const offscreen = document.createElement("canvas"); offscreen.width = size.width; offscreen.height = size.height;
        const offCtx = offscreen.getContext("2d"); if (!offCtx) return;
        const imageData = offCtx.createImageData(size.width, size.height);
        const out = imageData.data;
        const minVal = windowLevel - windowWidth / 2, maxVal = windowLevel + windowWidth / 2, range = Math.max(maxVal - minVal, 1);
        for (let i = 0; i < projectedHu.length; i += 1) {
            const j = i * 4, normalized = clamp01((projectedHu[i] - minVal) / range), val = 255 - Math.round(normalized * 255);
            out[j] = val; out[j+1] = val; out[j+2] = val; out[j+3] = 255;
        }
        offCtx.putImageData(imageData, 0, 0);
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, viewW, viewH);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.filter = "contrast(1.12) brightness(0.94)";
        const fitScale = Math.min(viewW / size.width, viewH / size.height);
        const drawScale = fitScale * 0.98 * zoomScale;
        const drawW = size.width * drawScale;
        const drawH = size.height * drawScale;
        const x = (viewW - drawW) / 2 + panOffset.x;
        const y = (viewH - drawH) / 2 + panOffset.y;
        
        ctx.drawImage(offscreen, x, y, drawW, drawH);
        
        ctx.restore();
    }, [loadState, windowLevel, windowWidth, isScanning, revealY, panOffset.x, panOffset.y, zoomScale]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const cropDragState = cropDragStateRef.current, viewport = viewportRef.current;
            if (cropDragState && viewport) {
                const rect = viewport.getBoundingClientRect(), dx = (e.clientX - cropDragState.startX) / rect.width, dy = (e.clientY - cropDragState.startY) / rect.height, minSize = 0.08, next = { ...cropDragState.initialBox };
                switch (cropDragState.handle) {
                    case "move": next.x = clamp(cropDragState.initialBox.x + dx, 0, 1 - cropDragState.initialBox.width); next.y = clamp(cropDragState.initialBox.y + dy, 0, 1 - cropDragState.initialBox.height); break;
                    case "top": { const nextY = clamp(cropDragState.initialBox.y + dy, 0, cropDragState.initialBox.y + cropDragState.initialBox.height - minSize); next.height = cropDragState.initialBox.height + (cropDragState.initialBox.y - nextY); next.y = nextY; break; }
                    case "bottom": next.height = clamp(cropDragState.initialBox.height + dy, minSize, 1 - cropDragState.initialBox.y); break;
                    case "left": { const nextX = clamp(cropDragState.initialBox.x + dx, 0, cropDragState.initialBox.x + cropDragState.initialBox.width - minSize); next.width = cropDragState.initialBox.width + (cropDragState.initialBox.x - nextX); next.x = nextX; break; }
                    case "right": next.width = clamp(cropDragState.initialBox.width + dx, minSize, 1 - cropDragState.initialBox.x); break;
                }
                setCropBox(next);
                onCropBoxChangeRef.current?.({ width: next.width, height: next.height });
                onRectChangeRef.current?.(next);
                return;
            }
            if (panDragStateRef.current) {
                const drag = panDragStateRef.current;
                setPanOffset({
                    x: drag.baseX + (e.clientX - drag.startX),
                    y: drag.baseY + (e.clientY - drag.startY),
                });
                return;
            }
            if (!isAdjustingWindow || !dragStateRef.current) return;
            const deltaX = e.clientX - dragStateRef.current.startX, deltaY = e.clientY - dragStateRef.current.startY;
            setWindowWidth(Math.min(1800, Math.max(80, dragStateRef.current.startWw + deltaX * 4)));
            setWindowLevel(Math.min(300, Math.max(-300, dragStateRef.current.startWl - deltaY * 2)));
        };
        const handleMouseUp = () => {
            cropDragStateRef.current = null;
            dragStateRef.current = null;
            panDragStateRef.current = null;
            setIsAdjustingWindow(false);
        };
        window.addEventListener("mousemove", handleMouseMove); window.addEventListener("mouseup", handleMouseUp);
        return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
    }, [isAdjustingWindow]);

    const startCropDrag = (handle: FourDDragHandle) => (e: React.MouseEvent) => {
        if (loadState !== "ready") return; e.preventDefault(); e.stopPropagation();
        cropDragStateRef.current = { handle, startX: e.clientX, startY: e.clientY, initialBox: cropBox };
    };

    const resetImageTools = useCallback(() => {
        setWindowWidth(metaRef.current?.ww ?? FOUR_D_SCOUT_SERIES.fallbackWindowWidth);
        setWindowLevel(metaRef.current?.wl ?? FOUR_D_SCOUT_SERIES.fallbackWindowLevel);
        setZoomScale(1);
        setPanOffset({ x: 0, y: 0 });
    }, []);

    const handleViewportMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (loadState !== "ready") return;
        if (!enableImageTools || interactionMode === "wl") {
            dragStateRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startWw: windowWidth,
                startWl: windowLevel,
            };
            setIsAdjustingWindow(true);
            return;
        }
        panDragStateRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            baseX: panOffset.x,
            baseY: panOffset.y,
        };
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!enableImageTools || loadState !== "ready") return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        setZoomScale((prev) => clamp(prev * factor, 0.5, 3.5));
    };

    return (
        <div
            ref={viewportRef}
            onMouseDown={handleViewportMouseDown}
            onWheel={handleWheel}
            className={`absolute inset-0 bg-black ${enableImageTools && interactionMode === "pan" ? "cursor-grab" : "cursor-crosshair"}`}
        >
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            {loadState === "loading" && <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#9FB2C5]">{t("scanFlow.imageLoading")}</div>}
            {loadState === "error" && (
                <FeedbackViewportOverlay
                    title={t("scanFlow.imageLoadError")}
                    message={loadError ? translateDicomLoadFailure(t as (key: string) => string, loadError) : t("scanFlow.unknownError")}
                />
            )}
            {enableImageTools && (
                <div className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-lg border border-r-0 border-[#334155] bg-[#0F172A]/92 px-1.5 py-2 shadow-md backdrop-blur-sm">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setInteractionMode("pan");
                        }}
                        className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
                            interactionMode === "pan"
                                ? "bg-[#3B82F6] text-white shadow-[0_0_12px_rgba(59,130,246,0.55)]"
                                : "bg-transparent text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#E2E8F0]"
                        }`}
                        title={t("scanFlow.tool.pan")}
                    >
                        <Hand size={14} strokeWidth={1.8} />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setInteractionMode("wl");
                        }}
                        className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
                            interactionMode === "wl"
                                ? "bg-[#3B82F6] text-white shadow-[0_0_12px_rgba(59,130,246,0.55)]"
                                : "bg-transparent text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#E2E8F0]"
                        }`}
                        title={t("scanFlow.tool.windowLevel")}
                    >
                        <WindowLevelIcon size={15} />
                    </button>
                    <div className="my-0.5 h-px w-6 bg-white/10" />
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setZoomScale((prev) => clamp(prev / 1.1, 0.5, 3.5));
                        }}
                        className="h-8 w-8 rounded-md bg-transparent text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#E2E8F0] flex items-center justify-center transition-colors"
                        title={t("scanFlow.tool.zoomOut")}
                    >
                        <ZoomOut size={14} strokeWidth={1.8} />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setZoomScale((prev) => clamp(prev * 1.1, 0.5, 3.5));
                        }}
                        className="h-8 w-8 rounded-md bg-transparent text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#E2E8F0] flex items-center justify-center transition-colors"
                        title={t("scanFlow.tool.zoomIn")}
                    >
                        <ZoomIn size={14} strokeWidth={1.8} />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            resetImageTools();
                        }}
                        className="h-8 w-8 rounded-md bg-transparent text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#E2E8F0] flex items-center justify-center transition-colors"
                        title={t("scanFlow.tool.reset")}
                    >
                        <RotateCcw size={14} strokeWidth={1.8} />
                    </button>
                </div>
            )}
            {loadState === "ready" && meta && (
                <>
                    <div className="absolute border-2 border-[#4D94FF] bg-[#4D94FF]/8 pointer-events-auto" style={{ left: `${cropBox.x*100}%`, top: `${cropBox.y*100}%`, width: `${cropBox.width*100}%`, height: `${cropBox.height*100}%` }} onMouseDown={startCropDrag("move")}>
                        {isScanning && (
                            <>
                                <div
                                    className="absolute inset-x-0 bg-[#F59E0B]/18"
                                    style={{ height: `${Math.min(revealY, 1) * 100}%` }}
                                />
                                <div
                                    className="absolute inset-x-0 h-[2px] bg-[#F59E0B] shadow-[0_0_10px_rgba(245,158,11,0.65)]"
                                    style={{ top: `calc(${Math.min(revealY, 1) * 100}% - 1px)` }}
                                />
                            </>
                        )}
                        <div className="absolute -top-3 left-1/2 h-6 w-12 -translate-x-1/2 cursor-ns-resize" onMouseDown={startCropDrag("top")} />
                        <div className="absolute -bottom-3 left-1/2 h-6 w-12 -translate-x-1/2 cursor-ns-resize" onMouseDown={startCropDrag("bottom")} />
                        <div className="absolute left-0 top-1/2 h-12 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize" onMouseDown={startCropDrag("left")} />
                        <div className="absolute right-0 top-1/2 h-12 w-6 translate-x-1/2 -translate-y-1/2 cursor-ew-resize" onMouseDown={startCropDrag("right")} />
                    </div>
                </>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Helical Scan Preview Viewport (Real-time axial reconstruction simulator)
// ---------------------------------------------------------------------------
export interface HelicalScanPreviewViewportProps {
    isScanning: boolean;
    active: boolean;
    revealY?: number;
}

const buildCoronalProjection = (slices: FourDLoadedSlice[], windowWidth: number, windowLevel: number) => {
    const totalSlices = slices.length;
    const rows = slices[0].rows;
    const cols = slices[0].cols;
    const projectionCanvas = document.createElement("canvas");
    projectionCanvas.width = cols;
    projectionCanvas.height = totalSlices;
    const context = projectionCanvas.getContext("2d");
    if (!context) return null;

    const imageData = context.createImageData(cols, totalSlices);
    const pixels = imageData.data;
    const minValue = windowLevel - windowWidth / 2;
    const range = windowWidth;
    const row = Math.floor(rows / 2);

    for (let z = 0; z < totalSlices; z += 1) {
        const slice = slices[z];
        for (let x = 0; x < cols; x += 1) {
            const value = clamp01((slice.hu[row * cols + x] - minValue) / range) * 255;
            const offset = (z * cols + x) * 4;
            pixels[offset] = value;
            pixels[offset + 1] = value;
            pixels[offset + 2] = value;
            pixels[offset + 3] = 255;
        }
    }

    context.putImageData(imageData, 0, 0);
    return projectionCanvas;
};

export function HelicalScanPreviewViewport({ isScanning, active, revealY = 1 }: HelicalScanPreviewViewportProps) {
    const { t } = useI18n();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const slicesRef = useRef<FourDLoadedSlice[]>([]);
    const coronalProjectionRef = useRef<HTMLCanvasElement | null>(null);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [loadError, setLoadError] = useState<DicomLoadFailure | null>(null);
    const [slicePositions, setSlicePositions] = useState<number[]>([]);

    // Load slices once
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const sliceNumbers = Array.from(
                    { length: FOUR_D_SCOUT_SERIES.count },
                    (_, i) => FOUR_D_SCOUT_SERIES.firstImageNumber + i
                );
                const loadedSlices: FourDLoadedSlice[] = [];
                const concurrency = 8;
                for (let start = 0; start < sliceNumbers.length; start += concurrency) {
                    const batch = sliceNumbers.slice(start, start + concurrency);
                    const batchResults = await Promise.all(batch.map(async (n) => {
                        const fileName = `image-${String(n).padStart(6, "0")}.dcm`;
                        let res: Response;
                        try {
                            res = await fetch(`${FOUR_D_SCOUT_SERIES.basePath}/${fileName}`);
                        } catch (netErr) {
                            throw Object.assign(new Error("network"), { __dicomRes: null, __dicomNetErr: netErr });
                        }
                        if (!res.ok) throw Object.assign(new Error("Fetch failed"), { __dicomRes: res });
                        let ab: ArrayBuffer;
                        try {
                            ab = await res.arrayBuffer();
                        } catch (streamErr) {
                            throw Object.assign(new Error("truncated"), { __dicomRes: null, __dicomNetErr: streamErr });
                        }
                        const ba = new Uint8Array(ab);
                        let ds;
                        try {
                            ds = dicomParser.parseDicom(ba);
                        } catch (parseErr) {
                            throw Object.assign(new Error("DICM parse failed"), { __dicomRes: null, __dicomNetErr: parseErr });
                        }
                        const rows = ds.uint16("x00280010") ?? 0;
                        const cols = ds.uint16("x00280011") ?? 0;
                        const intercept = Number(ds.string("x00281052") ?? "0");
                        const slope = Number(ds.string("x00281053") ?? "1");
                        const posZ = Number((ds.string("x00200032") ?? "0\\0\\0").split("\\")[2] ?? 0);
                        const pixelDataElem = ds.elements.x7fe00010;
                        if (!pixelDataElem) throw new Error("No pixel data");
                        const pixelData = ba.slice(pixelDataElem.dataOffset, pixelDataElem.dataOffset + pixelDataElem.length);
                        const values = new Int16Array(pixelData.buffer, pixelData.byteOffset, pixelData.length / 2);
                        const hu = new Float32Array(values.length);
                        for (let i = 0; i < values.length; i++) hu[i] = values[i] * slope + intercept;
                        return {
                            instanceNumber: n, positionZ: posZ, rows, cols, hu,
                            ww: Number(ds.string("x00281051") ?? "350"),
                            wl: Number(ds.string("x00281050") ?? "40"),
                            kvp: ds.string("x00180060") ?? "120", mas: ds.string("x00181152") ?? "Auto", thickness: ds.string("x00180050") ?? "3.0",
                        };
                    }));
                    loadedSlices.push(...batchResults);
                }
                if (cancelled) return;
                loadedSlices.sort((a, b) => b.positionZ - a.positionZ);
                slicesRef.current = loadedSlices;
                coronalProjectionRef.current = buildCoronalProjection(
                    loadedSlices,
                    FOUR_D_SCOUT_SERIES.fallbackWindowWidth,
                    FOUR_D_SCOUT_SERIES.fallbackWindowLevel,
                );
                setSlicePositions(loadedSlices.map((slice) => slice.positionZ));
                setLoadState("ready");
            } catch (err) {
                console.error(err);
                if (cancelled) return;
                const tagged = err as { __dicomRes?: Response | null; __dicomNetErr?: unknown };
                const failure = await classifyDicomFetchFailure(tagged.__dicomRes ?? null, tagged.__dicomNetErr ?? err);
                setLoadError(failure);
                setLoadState("error");
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    // Determine current slice position for metadata overlay based on revealY.
    const currentSlicePosition = useMemo(() => {
        if (loadState !== "ready" || slicePositions.length === 0) return null;
        const index = Math.min(Math.floor(revealY * slicePositions.length), slicePositions.length - 1);
        return slicePositions[index];
    }, [loadState, revealY, slicePositions]);

    // Draw Coronal Reconstruction with vertical reveal
    useEffect(() => {
        const canvas = canvasRef.current, viewport = viewportRef.current;
        const coronal = coronalProjectionRef.current;
        if (!canvas || !viewport || !active || !coronal) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const viewW = viewport.clientWidth, viewH = viewport.clientHeight;
        if (canvas.width !== viewW || canvas.height !== viewH) { canvas.width = viewW; canvas.height = viewH; }

        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, viewW, viewH);
        
        const cw = coronal.width, ch = coronal.height;
        // Fit keeping aspect ratio (Coronal images are often tall/skinny depending on Z coverage)
        const scale = Math.min(viewW / cw, viewH / ch) * 0.95;
        const dw = cw * scale, dh = ch * scale;
        const dx = (viewW - dw) / 2, dy = (viewH - dh) / 2;

        // "No Scan, No Image": Only reveal up to revealY
        const revealFactor = isScanning ? revealY : 1;
        if (revealFactor > 0) {
            const srcH = ch * revealFactor;
            const destH = dh * revealFactor;
            ctx.drawImage(coronal, 0, 0, cw, srcH, dx, dy, dw, destH);
        }
    }, [active, isScanning, loadState, revealY]);

    return (
        <div ref={viewportRef} className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

            {!active && (
                <div className="pointer-events-none text-[11px] font-mono text-white/20 tracking-widest uppercase">
                    等待扫描启动
                </div>
            )}

            {active && (
                <>
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />

                    <div className="pointer-events-none absolute left-3 top-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div className={`flex items-center gap-1.5 font-bold uppercase tracking-wider ${isScanning ? "text-[#34D399]" : "text-[#7EAAFF]"}`}>
                            {isScanning && <div className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />}
                            Scan Preview
                        </div>
                        <div className="opacity-80">Helical Acquisition</div>
                    </div>

                    {loadState === "loading" && <div className="text-[11px] text-white/40 animate-pulse">Initializing Recon Buffer...</div>}
                    {loadState === "error" && (
                        <FeedbackViewportOverlay
                            title={t("dicomError.unknown")}
                            message={loadError ? translateDicomLoadFailure(t as (key: string) => string, loadError) : t("scanFlow.unknownError")}
                        />
                    )}

                    {loadState === "ready" && (
                        <>
                            <div className="pointer-events-none absolute right-3 top-3 text-right text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                                <div className={`font-bold uppercase ${isScanning ? "text-[#34D399]" : "text-[#F59E0B]"}`}>
                                    {isScanning ? "SCANNING..." : "READY"}
                                </div>
                            </div>
                            {isScanning && currentSlicePosition !== null && (
                                <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-0.5">
                                    <div className="px-1.5 py-0.5 bg-[#34D399]/20 border border-[#34D399]/40 rounded text-[9px] font-black text-[#34D399] uppercase tracking-widest">
                                        Real-time Reconstruction
                                    </div>
                                    <div className="text-[10px] font-mono text-white/50">
                                        Pos: {currentSlicePosition.toFixed(1)} mm
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Gating Helical Param Defaults
// ---------------------------------------------------------------------------
const HELICAL_GATING_PARAMS = {
    bedMode: "OUT",
    position: "HFS",
    scanLength: "220.0",
    mA: "180",
    kV: "120",
    collimation: "0.5",
    fov: "500",
    bedAngle: "0",
};

// ---------------------------------------------------------------------------
// Build steps helper
// ---------------------------------------------------------------------------
const buildSequenceSteps = (type: WorkflowSequenceType, isGatingWorkflow: boolean): string[] => {
    if (isGatingWorkflow && type === "scout") return ["呼吸采集", "激光灯定位", "参数确认", "执行扫描"];
    if (type === "scout") return ["激光灯定位", "参数确认", "执行扫描"];
    return ["参数确认", "执行扫描"];
};

// ---------------------------------------------------------------------------
// Gating Confirm Screen (rendered only for gating protocols)
// ---------------------------------------------------------------------------
const GatingHelicalConfirmScreen = () => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const selectedPatient = useMemo(() => loadSelectedPatient(), []);
    const workflowPlans = useMemo(() => loadSelectedScanWorkflowPlans(), []);

    // Protocol tree
    const buildGroups = (): ProtocolGroup[] => {
        if (workflowPlans.length === 0) {
            return [{
                id: "g1",
                name: "胸腔门控",
                sequences: [
                    { id: "s1", name: "胸腔门控 Topogram", type: "scout", steps: buildSequenceSteps("scout", true) },
                    { id: "s2", name: "胸腔门控 Diagnostic", type: "helical", steps: buildSequenceSteps("helical", true) },
                ],
            }];
        }
        return workflowPlans.map((plan) => ({
            id: `group-${plan.id}`,
            name: plan.title,
            sequences: plan.sequences.map((seq) => ({
                id: `group-${plan.id}-seq-${seq.id}`,
                name: seq.name,
                type: seq.type,
                steps: buildSequenceSteps(seq.type, true),
            })),
        }));
    };

    const [groups] = useState<ProtocolGroup[]>(() => buildGroups());
    const allSequences = useMemo(() => groups.flatMap((g) => g.sequences), [groups]);

    // Find the non-scout sequence to highlight
    const activeSeqId = useMemo(() => {
        const nonScout = allSequences.find((s) => s.type !== "scout");
        return nonScout?.id ?? allSequences[0]?.id ?? null;
    }, [allSequences]);

    const [expandedSeqId, setExpandedSeqId] = useState<string | null>(activeSeqId);
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
    const [laserActive, setLaserActive] = useState(false);

    // Waveform simulation
    const [rawWaveData, setRawWaveData] = useState<number[]>(new Array(500).fill(100));
    const [filteredWaveData, setFilteredWaveData] = useState<number[]>(new Array(500).fill(100));
    const [metrics, setMetrics] = useState({ bpm: "14.2", peakErr: "1.7", freqErr: "1.8" });
    const timerRef = useRef<number | null>(null);
    const tRef = useRef(0);
    const [breathingBedIndex, setBreathingBedIndex] = useState(0);
    const [showPatientConfirm, setShowPatientConfirm] = useState(false);
    const [scanStarted, setScanStarted] = useState(false);
    const [scanCompleted, setScanCompleted] = useState(false);
    const [sessionData, setSessionData] = useState<ApiScanSessionDetail | null>(null);

    // Physical Button states
    const [showPhysicalButton, setShowPhysicalButton] = useState(false);
    const [scanStage, setScanStage] = useState<ScanStage>("idle");
    const [physicalTriggerAction, setPhysicalTriggerAction] = useState<PhysicalTriggerAction>("position");
    const [scanProgress, setScanProgress] = useState(1); // 1 when idle/complete, 0-1 when scanning

    const rafRef = useRef<number | null>(null);
    const holdStartRef = useRef<number | null>(null);
    const positioningTimerRef = useRef<number | null>(null);

    const clearHoldRaf = () => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };

    const triggerPositioningSequence = () => {
        clearHoldRaf();
        holdStartRef.current = null;
        setScanStage("positioning");

        if (positioningTimerRef.current !== null) {
            window.clearTimeout(positioningTimerRef.current);
        }
        positioningTimerRef.current = window.setTimeout(() => {
            positioningTimerRef.current = null;
            setPhysicalTriggerAction("exposure");
            setScanStage("positioned");
        }, POSITIONING_DURATION_MS);
    };

    const triggerScanSequence = () => {
        clearHoldRaf();
        setScanStage("enabled");

        window.setTimeout(() => {
            setScanStage("exposing");
        }, 180);

        window.setTimeout(() => {
            setScanStarted(true);
            setScanCompleted(false);
            setScanStage("completed");
            setShowPhysicalButton(false);
            
            // Start progress timer
            setScanProgress(0);
        }, 1500); // Exposure duration
    };

    const handleScanComplete = useCallback(() => {
        setScanStarted(false);
        setScanCompleted(true);
        setBreathingBedIndex(BREATHING_BED_POSITION_COUNT);
    }, []);

    // Drive scan progress
    useEffect(() => {
        if (!scanStarted) return;
        
        let startTs: number | null = null;
        const duration = 12000; // 12 seconds for the whole scan
        
        const tick = (ts: number) => {
            if (!startTs) startTs = ts;
            const elapsed = ts - startTs;
            const p = Math.min(elapsed / duration, 1);
            setScanProgress(p);
            
            // Sync breathing bed index (0-9)
            setBreathingBedIndex(Math.floor(p * 10));
            
            if (p >= 1) {
                handleScanComplete();
                return;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [handleScanComplete, scanStarted]);

    const startHold = () => {
        if (scanStage === "positioning" || scanStage === "enabled" || scanStage === "exposing" || scanStage === "completed") return;

        if (physicalTriggerAction === "exposure") {
            triggerScanSequence();
            return;
        }

        clearHoldRaf();
        holdStartRef.current = performance.now();
        setScanStage("arming");

        const tick = (timestamp: number) => {
            const startedAt = holdStartRef.current ?? timestamp;
            const nextProgress = Math.min((timestamp - startedAt) / HOLD_DURATION_MS, 1);

            if (nextProgress >= 1) {
                triggerPositioningSequence();
                return;
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
    };

    const stopHold = () => {
        if (scanStage !== "arming") return;
        clearHoldRaf();
        holdStartRef.current = null;
        setScanStage(physicalTriggerAction === "position" ? "idle" : "positioned");
    };

    const guideTitle =
        scanStage === "arming"
            ? t("scanFlow.physicalGuide.keepHoldingPosition")
            : scanStage === "positioning"
                ? t("scanFlow.physicalGuide.moveToStart")
                : scanStage === "positioned"
                    ? t("scanFlow.physicalGuide.pressAgainForExposure")
            : scanStage === "enabled"
                ? t("scanFlow.physicalGuide.enabled")
                : scanStage === "exposing"
                    ? t("scanFlow.physicalGuide.exposing")
                    : t("scanFlow.physicalGuide.holdGreenButton");

    const physicalTriggerSteps: PhysicalTriggerStep[] = [
        {
            id: "position",
            label: t("scanFlow.physicalGuide.stepPosition"),
            detail: t("scanFlow.physicalGuide.stepPositionDetail"),
            state: physicalTriggerAction === "position" && scanStage !== "completed" ? "active" : "done",
        },
        {
            id: "exposure",
            label: t("scanFlow.physicalGuide.stepExposure"),
            detail: t("scanFlow.physicalGuide.stepExposureDetail"),
            state:
                scanStage === "completed"
                    ? "done"
                    : physicalTriggerAction === "exposure" || scanStage === "enabled" || scanStage === "exposing"
                        ? "active"
                        : "pending",
        },
    ];

    // Dynamic scan params linked to crop box
    const [dynamicParams, setDynamicParams] = useState({
        scanLength: Number(HELICAL_GATING_PARAMS.scanLength),
        fov: Number(HELICAL_GATING_PARAMS.fov),
    });

    // Load actual session data for the confirmation modal
    useEffect(() => {
        fetchSelectedScanSession().then(setSessionData);
    }, []);

    // Clean up timers on unmount
    useEffect(() => {
        return () => {
            clearHoldRaf();
            if (positioningTimerRef.current !== null) {
                window.clearTimeout(positioningTimerRef.current);
            }
        };
    }, []);

    const handleCropBoxChange = ({ width, height }: { width: number; height: number }) => {
        // Physical mapping:
        // Height 0.48 -> 220.0mm => 458.33 mm/unit
        // Width 0.56 -> 500.0mm => 892.86 mm/unit
        setDynamicParams({
            scanLength: Number((height * 458.33).toFixed(1)),
            fov: Math.round(width * 892.86),
        });
    };

    // Waveform animation
    useEffect(() => {
        const update = () => {
            tRef.current += 0.05;
            const t = tRef.current;
            const cycle = Math.sin(t);
            const filteredVal = 500 + cycle * 200 + Math.sin(t * 0.3) * 30 + (Math.random() - 0.5) * 5;
            const pulse = Math.pow(Math.max(0, Math.sin(t * 1.0 + 0.1)), 24) * 400;
            const rawVal = 480 + cycle * 80 + pulse + (Math.random() - 0.5) * 15;

            setRawWaveData((prev) => [...prev.slice(1), rawVal]);
            setFilteredWaveData((prev) => [...prev.slice(1), filteredVal]);

            if (Math.random() > 0.98) {
                setFilteredWaveData((currentData) => {
                    let peaks = 0;
                    for (let i = 4; i < currentData.length - 4; i++) {
                        if (currentData[i] > currentData[i - 1] && currentData[i] > currentData[i + 1] &&
                            currentData[i] > currentData[i - 2] && currentData[i] > currentData[i + 2] &&
                            currentData[i] > 650) peaks++;
                    }
                    const baseBpm = (peaks / 500) * 1200;
                    const bpm = Math.max(14.0, Math.min(15.0, baseBpm + (Math.random() - 0.5) * 0.2));
                    setMetrics((cur) => ({
                        ...cur,
                        bpm: bpm.toFixed(1),
                        peakErr: (1.2 + Math.random() * 0.6).toFixed(1),
                        freqErr: (1.5 + Math.random() * 0.5).toFixed(1),
                    }));
                    return currentData;
                });
            }

            timerRef.current = requestAnimationFrame(update);
        };
        timerRef.current = requestAnimationFrame(update);
        return () => { if (timerRef.current !== null) cancelAnimationFrame(timerRef.current); };
    }, []);

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative text-[#37474F] font-sans select-none">
            {/* 1. Header */}
            <AppHeader
                patientName={selectedPatient?.name ?? null}
                patientId={selectedPatient?.patientId ?? null}
                laserActive={laserActive}
                onLaserToggle={() => setLaserActive((prev) => !prev)}
            />

            {/* 2. Main Content Area */}
            <main className="flex-1 flex overflow-hidden p-2 gap-1">
                {/* Left Sidebar */}
                <aside className="w-[240px] bg-white rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden shrink-0">
                    {/* Toolbar */}
                    <div className="h-[48px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-3 shrink-0">
                        <div className="flex items-center gap-2">
                            <button className="p-1.5 text-[#546E7A] hover:bg-[#EEF2F9] rounded transition-all"><FilePlus size={18} /></button>
                            <button className="p-1.5 text-[#90A4AE] opacity-40 cursor-not-allowed rounded transition-all"><Trash2 size={18} /></button>
                        </div>
                        <button onClick={() => setIsTreeCollapsed(!isTreeCollapsed)} className="p-1.5 text-[#4D94FF] hover:bg-[#EEF2F9] rounded transition-all">
                            {isTreeCollapsed ? <ChevronDown size={20} /> : <ChevronsUp size={20} />}
                        </button>
                    </div>

                    {/* Protocol Tree */}
                    {!isTreeCollapsed && (
                        <div className="flex-1 overflow-y-auto px-2 py-2 text-[13px]">
                            {groups.map((group) => (
                                <div key={group.id} className="mb-2">
                                    <div className="flex items-center gap-1 py-1 cursor-pointer group">
                                        <ChevronDown size={14} className="text-[#90A4AE]" />
                                        <div className="w-3.5 h-3.5 rounded border border-[#B0C4DE] bg-white flex items-center justify-center" />
                                        <span className="font-bold text-[#37474F] text-[12px]">{group.name}</span>
                                    </div>
                                    <div className="ml-5">
                                        {group.sequences.map((seq) => {
                                            const isActive = seq.id === activeSeqId;
                                            const isExpanded = seq.id === expandedSeqId;
                                            const isScout = seq.type === "scout";
                                            return (
                                                <div key={seq.id}>
                                                    <div
                                                        onClick={() => setExpandedSeqId(isExpanded ? null : seq.id)}
                                                        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-all ${isActive ? "bg-[#4D94FF] text-white shadow-md" : "hover:bg-[#EEF2F9]"}`}
                                                    >
                                                        <ChevronDown size={12} className={isActive ? "text-white/80" : "text-[#90A4AE]"} />
                                                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${(isScout || (isActive && scanCompleted)) ? "border-[#4CAF50] bg-[#E8F5E9]" : "border-[#B0C4DE] bg-white"}`}>
                                                            {(isScout || (isActive && scanCompleted)) && <Check size={10} className="text-[#4CAF50]" />}
                                                        </div>
                                                        <span className={`font-bold text-[12px] truncate ${isActive ? "text-white" : "text-[#37474F]"}`}>{seq.name}</span>
                                                    </div>
                                                    {isExpanded && seq.steps && (
                                                        <div className="ml-7 mt-0.5 mb-1">
                                                            {seq.steps.map((step, idx) => (
                                                                <div key={step} className="flex items-center gap-2 py-0.5">
                                                                    <div className={`w-3 h-3 flex items-center justify-center`}>
                                                                        {isActive && (
                                                                            (() => {
                                                                                const isStep0Completed = scanStarted || scanCompleted;
                                                                                const isStep1Active = scanStarted && !scanCompleted;
                                                                                const isStep1Completed = scanCompleted;

                                                                                if (idx === 0) {
                                                                                    return isStep0Completed ? (
                                                                                        <Check size={12} className="text-[#4CAF50] font-bold" />
                                                                                    ) : (
                                                                                        <div className="w-2.5 h-2.5 rounded-full border border-[#4D94FF] bg-[#4D94FF]" />
                                                                                    );
                                                                                }
                                                                                if (idx === 1) {
                                                                                    if (isStep1Completed) return <Check size={12} className="text-[#4CAF50] font-bold" />;
                                                                                    if (isStep1Active) return <div className="w-2.5 h-2.5 rounded-full border border-[#4D94FF] bg-[#4D94FF]" />;
                                                                                    return <div className="w-2.5 h-2.5 rounded-full border border-[#B0C4DE] bg-white" />;
                                                                                }
                                                                                return <div className="w-2.5 h-2.5 rounded-full border border-[#B0C4DE] bg-white" />;
                                                                            })()
                                                                        )}
                                                                        {!isActive && <div className="w-2.5 h-2.5 rounded-full border border-[#B0C4DE] bg-white" />}
                                                                    </div>
                                                                    <span className={`text-[11px] ${isActive && ((idx === 0 && !scanStarted && !scanCompleted) || (idx === 1 && scanStarted && !scanCompleted)) ? "text-[#4D94FF] font-bold" : "text-[#546E7A]"}`}>
                                                                        {step}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Sidebar Bottom: 呼吸参数 + Helical Params */}
                    <div className="border-t border-[#EEF2F9] bg-[#F8FAFC] px-3 py-2 shrink-0">
                        <button className="w-full h-[30px] mb-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 border border-[#4D94FF]/40 bg-white text-[#4D94FF] hover:bg-blue-50 active:scale-95 shadow-sm transition-all">
                            呼吸参数
                        </button>
                        <div className="grid grid-cols-2 gap-1.5">
                            {[
                                { label: "进出床", value: HELICAL_GATING_PARAMS.bedMode },
                                { label: "体位", value: HELICAL_GATING_PARAMS.position },
                                { label: "扫描长度", value: dynamicParams.scanLength.toFixed(1) },
                                { label: "MA", value: HELICAL_GATING_PARAMS.mA },
                                { label: "KV", value: HELICAL_GATING_PARAMS.kV },
                                { label: "旋转时间", value: HELICAL_GATING_PARAMS.collimation },
                                { label: "FOV", value: dynamicParams.fov.toString() },
                                { label: "床倾角", value: HELICAL_GATING_PARAMS.bedAngle },
                            ].map(({ label, value }) => (
                                <div key={label} className="px-1.5 py-1 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                    <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{label}</span>
                                    <span className="mt-px text-[12px] font-black text-[#37474F]">{value}</span>
                                </div>
                            ))}
                        </div>
                        <button className="w-full h-[28px] mt-2 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 border border-[#B0C4DE] bg-white text-[#4D94FF] hover:bg-blue-50 active:scale-95 shadow-sm transition-all">
                            <Info size={14} /> 参数详情
                        </button>
                    </div>
                </aside>

                {/* Right: Integrated Dual Viewer Window */}
                <section className="flex-1 flex flex-col overflow-hidden bg-white rounded-lg border border-[#B0C4DE] shadow-md">
                    {/* Viewport Row */}
                    <div className="flex-1 flex bg-black relative">
                        {/* Left: Scout Projection */}
                        <div className="flex-1 relative overflow-hidden">
                            <FourDScoutViewport 
                                onCropBoxChange={handleCropBoxChange} 
                                isScanning={scanStarted}
                                revealY={scanProgress}
                            />
                        </div>
                        {/* Middle Divider */}
                        <div className="w-[1px] bg-white/10 z-10" />
                        {/* Right: Scan Preview — black until scan starts */}
                        <div className="flex-1 relative overflow-hidden">
                            <HelicalScanPreviewViewport
                                isScanning={scanStarted}
                                active={scanStarted || scanCompleted}
                                revealY={scanProgress}
                            />
                        </div>
                    </div>

                    {/* Integrated Waveform Monitoring Area */}
                    <div className="h-[200px] shrink-0 bg-[linear-gradient(180deg,#F8FAFC_0%,#EDF2F7_100%)] border-t border-[#B0C4DE]/60 px-1 pt-3 pb-0 relative overflow-hidden">
                        <div className="pointer-events-none absolute left-12 top-2 text-[9px] font-black tracking-[0.2em] text-[#475569] opacity-80 uppercase">
                            RESP SIGNAL MONITORING
                        </div>

                        {/* Y-axis labels */}
                        <div className="absolute inset-x-2 top-7 bottom-10 flex flex-col justify-between pointer-events-none opacity-25">
                            {[1100, 1000, 800, 600, 400, 200, 0].map((val) => (
                                <div key={val} className="flex items-center gap-2">
                                    <span className="text-[9px] w-7 text-right font-mono font-black text-[#64748B]">{val}</span>
                                    <div className="flex-1 h-[0.5px] bg-[#94A3B8]" />
                                </div>
                            ))}
                        </div>

                        {/* Waveform SVG */}
                        <div className="absolute left-0 right-0 top-5 bottom-8 flex flex-col justify-end px-3">
                            <svg viewBox="0 0 800 160" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                <defs>
                                    <linearGradient id="resp-wave-fill-4d" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.18" />
                                        <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.01" />
                                    </linearGradient>
                                </defs>
                                <line x1="0" y1="80" x2="800" y2="80" stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
                                <path
                                    d={`M ${rawWaveData.map((v, i) => `${(i / (rawWaveData.length - 1)) * 800},${160 - (v / 1100) * 160}`).join(" L ")}`}
                                    fill="none" stroke="#64748B" strokeWidth="1.2" className="opacity-30"
                                />
                                <path
                                    d={`M 0,160 L ${filteredWaveData.map((v, i) => `${(i / (filteredWaveData.length - 1)) * 800},${160 - (v / 1100) * 160}`).join(" L ")} L 800,160 Z`}
                                    fill="url(#resp-wave-fill-4d)"
                                />
                                <path
                                    d={`M ${filteredWaveData.map((v, i) => `${(i / (filteredWaveData.length - 1)) * 800},${160 - (v / 1100) * 160}`).join(" L ")}`}
                                    fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                />
                                {filteredWaveData.map((v, i) => {
                                    if (i < 10 || i > filteredWaveData.length - 10) return null;
                                    const mx = v > filteredWaveData[i - 1] && v > filteredWaveData[i + 1] && v > filteredWaveData[i - 2] && v > filteredWaveData[i + 2] && v > filteredWaveData[i - 3] && v > filteredWaveData[i + 3];
                                    const mn = v < filteredWaveData[i - 1] && v < filteredWaveData[i + 1] && v < filteredWaveData[i - 2] && v < filteredWaveData[i + 2] && v < filteredWaveData[i - 3] && v < filteredWaveData[i + 3];
                                    if (mx && v >= 650) return <circle key={`pk-${i}`} cx={(i / (filteredWaveData.length - 1)) * 800} cy={160 - (v / 1100) * 160} r="4" fill="#EF4444" stroke="#FFF" strokeWidth="1.5" />;
                                    if (mn && v <= 380) return <circle key={`vl-${i}`} cx={(i / (filteredWaveData.length - 1)) * 800} cy={160 - (v / 1100) * 160} r="3.5" fill="#FACC15" stroke="#FFF" strokeWidth="1.2" />;
                                    return null;
                                })}
                            </svg>
                        </div>

                        {/* Stats Overlay */}
                        <div className="absolute right-4 top-8 flex gap-2 z-10 scale-90">
                            <div className="px-3 py-1.5 rounded bg-white shadow-sm border border-[#B0C4DE]/50 flex flex-col items-center min-w-[70px]">
                                <span className="text-[8px] font-black text-[#94A3B8] uppercase tracking-wider">BPM</span>
                                <span className="text-[14px] font-bold text-[#1E293B]">{metrics.bpm}</span>
                            </div>
                            <div className="px-3 py-1.5 rounded bg-white shadow-sm border border-[#B0C4DE]/50 flex flex-col items-center min-w-[70px]">
                                <span className="text-[8px] font-black text-[#94A3B8] uppercase tracking-wider">ERROR</span>
                                <span className="text-[14px] font-bold text-[#64748B]">{metrics.freqErr}%</span>
                            </div>
                        </div>

                        {/* Bed position bar */}
                        <div className="pointer-events-none absolute inset-x-3 bottom-1.5 flex items-end gap-3 px-1">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="shrink-0 text-[8px] font-black tracking-[0.2em] text-[#475569] uppercase opacity-70">Table Position</span>
                                <div className="flex-1 flex gap-1 items-end h-5">
                                    {Array.from({ length: BREATHING_BED_POSITION_COUNT }, (_, index) => (
                                        <div key={`bed-pos-${index}`} className="flex-1 flex flex-col gap-0.5">
                                            <div className={`h-2.5 w-full rounded-sm transition-all duration-500 ${
                                                scanCompleted || index < breathingBedIndex
                                                    ? "bg-[#3B82F6]"
                                                    : !scanCompleted && index === breathingBedIndex
                                                        ? "bg-[#93C5FD] animate-pulse"
                                                        : "bg-[#E2E8F0]"
                                            }`} />
                                            <span className={`text-[7px] text-center font-bold font-mono ${!scanCompleted && index === breathingBedIndex ? "text-[#3B82F6]" : "text-[#94A3B8]"}`}>{index + 1}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="px-2 py-0.5 rounded bg-[#F1F5F9] border border-[#E2E8F0] text-[9px] font-mono font-bold text-[#475569]">
                                PROGRESS: {scanCompleted ? BREATHING_BED_POSITION_COUNT : breathingBedIndex}/{BREATHING_BED_POSITION_COUNT}
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* 3. Footer */}
            <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10">
                <div className="flex-1">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-blue-50 shadow-sm transition-all uppercase text-[13px] active:scale-95"
                    >
                        <ChevronLeft size={20} /> 上一步
                    </button>
                </div>

                <div className="flex-1 flex justify-end">
                    <button
                        onClick={() => {
                            if (scanCompleted) {
                                navigate("/image-viewer");
                            } else {
                                setShowPatientConfirm(true);
                            }
                        }}
                        className={`flex items-center gap-2 px-10 h-[52px] font-bold rounded-md shadow-lg transition-all uppercase text-[13px] active:scale-95 ${
                            scanCompleted ? "bg-[#10B981] text-white hover:bg-[#059669]" : 
                            scanStarted ? "bg-[#34D399] text-white" : "bg-[#4D94FF] text-white hover:bg-blue-600"
                        }`}
                    >
                        {scanCompleted ? "图像浏览" : scanStarted ? "正在扫描" : "断层扫描"} <ChevronRight size={20} />
                    </button>
                </div>
            </footer>

            {/* Simulated Physical Button Overlay (Sidebar) */}
            <div className={`absolute bottom-[84px] right-0 top-[88px] z-[200] flex items-stretch transition-all duration-500 ${showPhysicalButton ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
                <PhysicalTriggerGuide
                    title={t("scanFlow.physicalGuide.title")}
                    description={t("scanFlow.physicalGuide.helicalTwoStepDescription")}
                    guideTitle={guideTitle}
                    triggerLabel={t("scanFlow.physicalGuide.triggerLabel")}
                    emergencyLabel={t("scanFlow.physicalGuide.referenceEmergency")}
                    simulatedLabel={t("scanFlow.physicalGuide.referenceSimulated")}
                    steps={physicalTriggerSteps}
                    onHoldStart={startHold}
                    onHoldEnd={stopHold}
                    buttonActive={scanStage === "arming" || scanStage === "positioning" || scanStage === "enabled" || scanStage === "exposing"}
                />
            </div>

            {/* High-Fidelity Patient Confirmation Modal */}
            <PatientConfirmationModal
                isOpen={showPatientConfirm}
                onClose={() => setShowPatientConfirm(false)}
                onConfirm={() => {
                    setShowPatientConfirm(false);
                    setShowPhysicalButton(true);
                    setPhysicalTriggerAction("position");
                    setScanStage("idle");
                }}
                patientData={selectedPatient ? {
                    name: selectedPatient.name,
                    age: selectedPatient.age,
                    gender: selectedPatient.gender,
                    idNumber: "--",
                    patientId: selectedPatient.patientId,
                    checkType: sessionData?.body_part || "CT胸部扫描",
                } : undefined}
                scanData={{
                    ctdi: (sessionData?.series.find(s => s.series_type === "helical")?.helical_param?.ctdi_vol?.toFixed(2)) || "59.40",
                    dlp: (sessionData?.series.find(s => s.series_type === "helical")?.helical_param?.dlp?.toFixed(2)) || "1168.50",
                    protocol: "断层扫描"
                }}
            />
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main HelicalScanConfirmScreen (unchanged for non-4D protocols)
// ---------------------------------------------------------------------------
const HelicalScanConfirmScreen = () => {
    const { t } = useI18n();
    const isGatingWorkflow = false;

    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });
    const [helicalParam, setHelicalParam] = useState<ApiScanSessionHelicalParam | null>(null);
    const [scanSession, setScanSession] = useState<ApiScanSessionDetail | null>(null);
    const topogramTubeAngle = useMemo(() => {
        const topo = scanSession?.series.find((s) => s.series_type === "topogram")?.topogram_param;
        return topo?.tube_angle ?? 180;
    }, [scanSession]);
    const handleScoutAngleChange = useCallback((angle: number) => {
        setScanSession((current) => {
            if (!current) return current;
            return {
                ...current,
                series: current.series.map((series) => {
                    if (series.series_type !== "topogram" || !series.topogram_param) return series;
                    return {
                        ...series,
                        topogram_param: {
                            ...series.topogram_param,
                            tube_angle: angle,
                        },
                    };
                }),
            };
        });
    }, []);
    const [sessionResolved, setSessionResolved] = useState(false);
    const [protocolHelicalSeed, setProtocolHelicalSeed] = useState<ProtocolSeedHelicalParam | null>(null);
    const [noiseLevel, setNoiseLevel] = useState<NoiseLevel>(NOISE_SLIDER_DEFAULT);
    const [scanPositionRatio, setScanPositionRatio] = useState(0.5);
    const [scoutHu, setScoutHu] = useState<ScoutHuData | null>(null);
    const [scoutCropBox, setScoutCropBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [scoutLoadState, setScoutLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [executionError, setExecutionError] = useState<string | null>(null);

    // Keep the parent measurement update idempotent because the scout viewport
    // reports stringified values, and identical values should not re-render the
    // confirmation page.
    const handleMeasurementChangeIdem = useCallback((v: { scanLength: string; scoutFov: string }) => {
        setMeasurements((prev) => (prev.scanLength === v.scanLength && prev.scoutFov === v.scoutFov ? prev : v));
    }, []);
    const [limbsDicomManifest, setLimbsDicomManifest] = useState<LimbsDicomDemoManifest | null>(null);
    const [headDualScoutManifest, setHeadDualScoutManifest] = useState<HeadDualScoutManifest | null>(null);
    const [scoutSourceError, setScoutSourceError] = useState<string | null>(null);
    const helicalSeries = scanSession?.series.find((series) => series.series_type === "helical") ?? null;
    const requiredTopogram = scanSession?.series
        .filter((series) => series.series_type === "topogram" && (!helicalSeries || series.series_order < helicalSeries.series_order))
        .sort((a, b) => b.series_order - a.series_order)[0] ?? null;
    const topogramImageSource = resolveTopogramImageSource(requiredTopogram);
    const isLimbsHelicalSession = topogramImageSource === "limbs-helical-demo";
    const isHeadDualScoutFlow = topogramImageSource === "head-dual-scout-demo";
    const helicalParamId = helicalParam?.id ?? null;
    const [paramWrites] = useState(() => new ScanParamWriteCoordinator());
    const thresholdGuard = useDoseThresholdGuard();
    const navigate = useNavigate();
    const selectedPatient = useMemo(() => loadSelectedPatient(), []);

    const scoutSeriesOverride = useMemo<TomographicScoutSeriesOverride | undefined>(
        () => {
            if (isLimbsHelicalSession && limbsDicomManifest) {
                const topogram = getLimbsDicomSeries(limbsDicomManifest, "topogram");
                const url = topogram?.urls[0];
                if (url) {
                    // Pass the topogram's own WW/WL if the manifest has them;
                    // otherwise the topogram loader falls back to the DICOM
                    // header and ultimately to a data-centred auto window.
                    return {
                        kind: "topogram",
                        url,
                        fallbackWindowWidth: topogram.windowWidth ?? undefined,
                        fallbackWindowLevel: topogram.windowCenter ?? undefined,
                    };
                }
            }
            if (topogramImageSource === "head-stroke-topogram") return BRAIN_HELICAL_SCOUT_OVERRIDE;
            // qin-lung-topogram intentionally uses the built-in QIN projection.
            return undefined;
        },
        [isLimbsHelicalSession, limbsDicomManifest, topogramImageSource],
    );

    useEffect(() => () => paramWrites.dispose(), [paramWrites]);

    useEffect(() => {
        setScoutSourceError(null);
        setScoutLoadState("loading");
    }, [topogramImageSource]);

    useEffect(() => {
        if (!isLimbsHelicalSession) return;
        let cancelled = false;
        loadLimbsDicomDemoManifest()
            .then((manifest) => {
                if (!cancelled) setLimbsDicomManifest(manifest);
            })
            .catch((error) => {
                console.error("Failed to load limbs DICOM demo manifest for scout override.", error);
                if (!cancelled) setScoutSourceError(error instanceof Error ? error.message : "四肢定位像清单加载失败");
            });
        return () => { cancelled = true; };
    }, [isLimbsHelicalSession]);

    useEffect(() => {
        if (!isHeadDualScoutFlow) return;
        let cancelled = false;
        loadHeadDualScoutManifest()
            .then((manifest) => {
                if (!cancelled) setHeadDualScoutManifest(manifest);
            })
            .catch((error) => {
                console.error("Failed to load head dual scout manifest.", error);
                if (!cancelled) setScoutSourceError(error instanceof Error ? error.message : "头部双定位像清单加载失败");
            });
        return () => { cancelled = true; };
    }, [isHeadDualScoutFlow]);

    const headDualApSeries = useMemo<HeadDualScoutSeries | null>(() => {
        if (!isHeadDualScoutFlow || !headDualScoutManifest) return null;
        return getHeadDualScoutSeries(headDualScoutManifest, "scout-ap");
    }, [isHeadDualScoutFlow, headDualScoutManifest]);

    const headDualLatSeries = useMemo<HeadDualScoutSeries | null>(() => {
        if (!isHeadDualScoutFlow || !headDualScoutManifest) return null;
        return getHeadDualScoutSeries(headDualScoutManifest, "scout-lat");
    }, [isHeadDualScoutFlow, headDualScoutManifest]);

    useEffect(() => {
        if (isGatingWorkflow) return;
        let cancelled = false;

        const loadSessionDefaults = async () => {
            try {
                const scanSession = await fetchSelectedScanSession({ preferCache: false });
                if (cancelled) return;
                if (scanSession) {
                    setScanSession(scanSession);

                    // Fetch the source protocol so we can use its seed dose
                    // values as a stable reference for the threshold estimator.
                    // Without this, the session's CTDIvol/DLP would stay frozen
                    // at protocol defaults and never reflect parameter edits.
                    try {
                        const protoRes = await fetch(buildApiUrl(`/api/protocols/${scanSession.protocol_id}`));
                        if (protoRes.ok && !cancelled) {
                            const proto = await protoRes.json() as { series?: Array<{ series_type: string; helical_param?: ProtocolSeedHelicalParam | null }> };
                            const seedHelical = proto.series?.find((s) => s.series_type === "helical")?.helical_param ?? null;
                            if (seedHelical) setProtocolHelicalSeed(seedHelical);
                        }
                    } catch (error) {
                        console.error("Failed to load protocol seed values for dose estimation.", error);
                    }
                }

                const loaded = scanSession?.series.find((series) => series.series_type === "helical")?.helical_param as ApiScanSessionHelicalParam | null | undefined;
                if (!loaded) return;

                setHelicalParam(loaded);
                setMeasurements({
                    scanLength: String(loaded.scan_length),
                    scoutFov: String(loaded.fov),
                });
            } catch (error) {
                console.error("Failed to load helical scan session defaults.", error);
            } finally {
                if (!cancelled) setSessionResolved(true);
            }
        };

        void loadSessionDefaults();
        return () => { cancelled = true; };
    }, [isGatingWorkflow]);

    useEffect(() => {
        if (isGatingWorkflow || !helicalParamId) return;
        const scanLength = Number(measurements.scanLength);
        const scoutFov = Number(measurements.scoutFov);
        if (!Number.isFinite(scanLength) || !Number.isFinite(scoutFov)) return;

        paramWrites.schedule(() => {
            const patch: Record<string, number> = {
                scan_length: Number(scanLength.toFixed(1)),
                fov: Number(scoutFov.toFixed(1)),
            };
            // Keep CTDIvol/DLP in sync with the new scan length so the
            // dose_log entry produced on scan completion reflects the user's
            // crop, not the protocol seed value.
            if (helicalParam && protocolHelicalSeed) {
                const estimated = estimateDose({
                    current: {
                        ma: helicalParam.ma,
                        kv: helicalParam.kv,
                        rotation_time: helicalParam.rotation_time,
                        pitch: helicalParam.pitch,
                        scan_length: Number(scanLength.toFixed(1)),
                    },
                    reference: protocolHelicalSeed,
                });
                patch.ctdi_vol = estimated.ctdi_vol;
                patch.dlp = estimated.dlp;
            }
            return updateSelectedScanSessionHelicalParam(helicalParamId, patch);
        }, 180, (error) => {
                console.error("Failed to persist helical crop measurements.", error);
        });
    }, [helicalParam, helicalParamId, isGatingWorkflow, measurements.scanLength, measurements.scoutFov, paramWrites, protocolHelicalSeed]);

    useEffect(() => {
        const preventBackNavigation = () => {
            window.history.pushState(null, "", window.location.href);
        };
        preventBackNavigation();
        window.addEventListener("popstate", preventBackNavigation);
        return () => { window.removeEventListener("popstate", preventBackNavigation); };
    }, []);

    const handleAutoMaChange = (patch: { auto_ma?: boolean; ma_min?: number; ma_max?: number; noise_level?: NoiseLevel }) => {
        const { noise_level, ...rest } = patch;
        if (noise_level !== undefined) setNoiseLevel(noise_level);
        if (!helicalParam || Object.keys(rest).length === 0) return;
        setHelicalParam((prev) => (prev ? { ...prev, ...rest } : prev));
        void paramWrites.write(() => updateSelectedScanSessionHelicalParam(helicalParam.id, rest)).catch((error) => {
            console.error("Failed to persist Auto mA settings.", error);
        });
    };

    const scanLengthNum = Number(measurements.scanLength);
    const scanLengthForCurve = Number.isFinite(scanLengthNum) ? scanLengthNum : (helicalParam?.scan_length ?? 0);
    const showAutoMaPanel = helicalParam?.auto_ma ?? false;

    const realMaCurve = useMemo(() => {
        if (!showAutoMaPanel || !scoutHu || !scoutCropBox || !helicalParam) return null;
        const maRef = helicalParam.ma ?? 200;
        const maMin = helicalParam.ma_min ?? Math.max(40, Math.round(maRef * 0.5));
        const maMax = helicalParam.ma_max ?? Math.round(maRef * 1.2);
        try {
            const result = computeDoseModulation({
                scoutData: scoutHu,
                cropBox: scoutCropBox,
                kv: helicalParam.kv ?? 120,
                maRef,
                maMin,
                maMax,
                steps: HELICAL_DOSE_CURVE_STEPS,
            });
            return result.maCurve;
        } catch (error) {
            console.error("Failed to compute helical dose modulation curve.", error);
            return null;
        }
    }, [showAutoMaPanel, scoutHu, scoutCropBox, helicalParam]);

    const scoutManifestReady = isLimbsHelicalSession
        ? Boolean(getLimbsDicomSeries(limbsDicomManifest, "topogram")?.urls[0])
        : isHeadDualScoutFlow
            ? Boolean(headDualScoutManifest && headDualApSeries && headDualLatSeries)
            : topogramImageSource !== null;
    const scoutDisplayReady = topogramImageSource !== null
        && scoutManifestReady
        && !scoutSourceError
        && scoutLoadState === "ready";
    const topogramDependencyReady = Boolean(
        sessionResolved
        && requiredTopogram
        && requiredTopogram.execution_status === "image_ready"
        && scoutDisplayReady,
    );

    const handleExecuteScan = useCallback(async () => {
        setExecutionError(null);
        let executeRoute: string;
        try {
            await paramWrites.flush();
            if (!topogramDependencyReady) {
                throw new Error("定位像未成功出图或未登记受支持的影像来源，无法执行后续螺旋扫描");
            }
            const latestScanSession = await fetchSelectedScanSession({ preferCache: false });
            if (!latestScanSession || latestScanSession.acquisition_type !== "regular") {
                throw new Error("当前扫描会话与常规螺旋扫描不匹配，请返回患者列表重新选择");
            }
            if (!selectedPatient || latestScanSession.patient_id !== selectedPatient.id) {
                throw new Error("患者与扫描会话不一致，请返回患者列表重新选择");
            }
            if (isTerminalScanSessionStatus(latestScanSession.status)) {
                throw new Error("当前扫描会话已结束，不能再次执行");
            }
            const helicalTargets = latestScanSession.series.filter((series) => series.series_type === "helical");
            if (helicalTargets.length !== 1) {
                throw new Error("当前版本仅支持单个螺旋扫描目标，请返回协议配置检查序列");
            }
            if (helicalTargets[0].execution_status !== "pending") {
                throw new Error("螺旋扫描序列不是待执行状态；请通过明确的重试或结果查看入口继续");
            }
            const executionContext = buildScanSessionExecutionContext(latestScanSession, "helical");
            if (!executionContext) throw new Error("当前扫描会话缺少待执行的螺旋扫描序列");
            const latestTopogram = executionContext.requiredTopogramId === null
                ? null
                : latestScanSession.series.find((series) => series.id === executionContext.requiredTopogramId) ?? null;
            if (latestTopogram) {
                const latestImageSource = resolveTopogramImageSource(latestTopogram);
                if (
                    latestTopogram.execution_status !== "image_ready"
                    || latestImageSource === null
                    || latestImageSource !== topogramImageSource
                    || !scoutDisplayReady
                ) {
                    throw new Error("定位像未成功出图，无法执行后续螺旋扫描");
                }
                await updateScanSessionSeriesExecution(latestTopogram.id, { range_confirmed: true });
            }
            const query = new URLSearchParams({
                mode: "helical",
                scanSessionId: String(executionContext.scanSessionId),
                targetSeriesId: String(executionContext.targetSeriesId),
                topogramId: executionContext.requiredTopogramId === null
                    ? "none"
                    : String(executionContext.requiredTopogramId),
            });
            executeRoute = `/helical-execute?${query.toString()}`;
        } catch (error) {
            setExecutionError(error instanceof Error ? error.message : "螺旋扫描前置条件校验失败");
            return;
        }
        // Re-estimate CTDIvol/DLP from the current parameters so the guard sees
        // a value that actually tracks user edits (the session's stored
        // ctdi_vol stays at the protocol seed until backend recompute lands).
        const liveScanLength = Number(measurements.scanLength);
        const estimated = helicalParam && protocolHelicalSeed
            ? estimateDose({
                current: {
                    ma: helicalParam.ma,
                    kv: helicalParam.kv,
                    rotation_time: helicalParam.rotation_time,
                    pitch: helicalParam.pitch,
                    scan_length: Number.isFinite(liveScanLength) ? liveScanLength : helicalParam.scan_length,
                },
                reference: protocolHelicalSeed,
            })
            : null;

        thresholdGuard.guard(
            {
                body_part: scanSession?.body_part ?? null,
                age_group: scanSession?.age_group ?? null,
                ctdi_vol: estimated?.ctdi_vol ?? helicalParam?.ctdi_vol ?? null,
                dlp: estimated?.dlp ?? helicalParam?.dlp ?? null,
            },
            // 范围确认完成后直接进入模拟物理按键，不再显示空的执行页中间态。
            () => navigate(executeRoute, { state: { showCombinedPatientConfirm: true } }),
        );
    }, [thresholdGuard, scanSession, helicalParam, protocolHelicalSeed, measurements.scanLength, navigate, paramWrites, scoutDisplayReady, selectedPatient, topogramDependencyReady, topogramImageSource]);

    // 4D gets a completely different layout. Keep this after all hooks so
    // React sees the same hook order for gated and non-gated workflows.
    if (isGatingWorkflow) {
        return <GatingHelicalConfirmScreen />;
    }

    return (
        <>
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="helicalScan"
            helicalParamOverrides={measurements}
            onScoutAngleChange={handleScoutAngleChange}
            autoMaEnabled={showAutoMaPanel}
            onAutoMaEnabledChange={(value) => handleAutoMaChange({ auto_ma: value })}
            onExecuteScan={() => { void handleExecuteScan(); }}
            executeDisabled={!topogramDependencyReady}
            rightViewportContent={
                <>
                    {sessionResolved && topogramImageSource && scoutManifestReady && !scoutSourceError ? (
                        isHeadDualScoutFlow && headDualScoutManifest && headDualApSeries && headDualLatSeries ? (
                            <HeadDualScoutConfirmViewport
                                key={`${headDualApSeries.url}:${headDualLatSeries.url}`}
                                apSeries={headDualApSeries}
                                latSeries={headDualLatSeries}
                                defaultWindowWidth={headDualScoutManifest.defaultWindowWidth}
                                defaultWindowLevel={headDualScoutManifest.defaultWindowLevel}
                                initialMeasurements={measurements}
                                scanPositionRatio={scanPositionRatio}
                                showScanPositionGuide={showAutoMaPanel}
                                onScanPositionRatioChange={setScanPositionRatio}
                                onMeasurementChange={handleMeasurementChangeIdem}
                                onCropBoxChange={setScoutCropBox}
                                onLoadStateChange={setScoutLoadState}
                            />
                        ) : (
                            <TomographicScoutViewport
                                key={topogramImageSource}
                                onMeasurementChange={setMeasurements}
                                initialMeasurements={measurements}
                                scanPositionRatio={scanPositionRatio}
                                showScanPositionGuide={showAutoMaPanel}
                                onScanPositionRatioChange={setScanPositionRatio}
                                seriesOverride={scoutSeriesOverride}
                                onScoutHuChange={setScoutHu}
                                onCropBoxChange={setScoutCropBox}
                                tubeAngle={topogramTubeAngle}
                                onLoadStateChange={setScoutLoadState}
                            />
                        )
                    ) : (
                        <div className="flex flex-1 items-center justify-center rounded-lg bg-[#05080d] px-8 text-center text-[14px] font-bold text-white/70">
                            {!sessionResolved || (topogramImageSource && !scoutManifestReady && !scoutSourceError)
                                ? t("scanFlow.scoutLoading")
                                : scoutSourceError
                                    ? `定位像来源加载失败：${scoutSourceError}`
                                    : requiredTopogram
                                        ? "定位像未登记受支持的 v1 影像来源，无法确认扫描范围"
                                        : "当前扫描序列未配置定位像依赖"}
                        </div>
                    )}
                    {helicalParam && showAutoMaPanel && (
                        <AutoMaPanel
                            mode="helical"
                            autoMa={helicalParam.auto_ma ?? false}
                            maMin={helicalParam.ma_min ?? Math.max(40, Math.round((helicalParam.ma ?? 200) * 0.5))}
                            maMax={helicalParam.ma_max ?? Math.round((helicalParam.ma ?? 200) * 1.2)}
                            fallbackMa={helicalParam.ma}
                            scanLength={scanLengthForCurve}
                            rotationTime={helicalParam.rotation_time}
                            pitch={helicalParam.pitch}
                            noiseLevel={noiseLevel}
                            scanPositionRatio={scanPositionRatio}
                            onScanPositionRatioChange={setScanPositionRatio}
                            onChange={handleAutoMaChange}
                            realMaCurve={realMaCurve}
                        />
                    )}
                    {(executionError || (requiredTopogram && !topogramDependencyReady)) && (
                        <div className="absolute bottom-3 left-3 right-3 z-30 rounded border border-[#EF4444]/60 bg-[#2A1115]/95 px-3 py-2 text-[12px] font-bold text-[#FCA5A5]">
                            {executionError ?? t("scanFlow.localizerPrerequisiteBlocked")}
                        </div>
                    )}
                </>
            }
            nextRoute="/helical-execute"
            allowBackNavigation={false}
        />
        <ThresholdGuardModal
            {...thresholdGuard.modalProps}
            onContinue={thresholdGuard.confirm}
            onCancel={thresholdGuard.cancel}
        />
        </>
    );
};

export default HelicalScanConfirmScreen;
