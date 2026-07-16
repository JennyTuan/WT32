import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ChevronRight,
    ChevronUp,
    ChevronDown,
    Layers3,
    SlidersHorizontal,
    ZoomIn,
    ZoomOut,
    Move,
    Ruler,
    Pencil,
    Crosshair,
    Maximize,
    RefreshCw,
    Play,
    Pause,
    PanelLeftClose,
    PanelLeftOpen,
    RotateCw,
    Orbit,
    ScanLine,
    Eye,
    EyeOff,
    LayoutGrid,
    Focus,
    X,
    Check,
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import * as dicomParser from "dicom-parser";
import type { FourDPostScanState } from "../lib/fourDTypes";
import {
    loadLimbsDicomDemoManifest,
    type LimbsDicomDemoManifest,
    type LimbsDicomDemoSeries,
} from "../lib/limbsDicomDemo";
import {
    getHeadDualScoutSeries,
    loadHeadDualScoutManifest,
    type HeadDualScoutManifest,
    type HeadDualScoutSeries,
} from "../lib/headDualScoutDemo";
import DicomViewer, { type DicomViewerHandle } from "../components/DicomViewer";
import AppHeader from "../components/AppHeader";
import { FeedbackNotice } from "../components/FeedbackNotice";
import CornerstoneMPRViewport, {
    type CornerstoneMPRHandle,
    type MprActivePanelId,
} from "../components/CornerstoneMPRViewport";
import {
    getSelectedEngineerVolume,
    loadFourDEngineerManifest,
    type FourDEngineerManifest,
} from "../lib/fourDEngineerImageSource";
import { toFourDPostScanState } from "../lib/fourDResult";
import {
    loadAuthoritativeFourDRecovery,
    resolveLoadedFourDRecoveryDestination,
} from "../lib/fourDRecovery";
import { loadSelectedPatient } from "../lib/patientSession";
import {
    clearSelectedScanSessionId,
    fetchSelectedScanSession,
    loadSelectedScanSessionId,
    type ApiScanSeriesImageSourceId,
    type ApiScanSeriesImageSourceVersion,
    type ApiScanSessionDetail,
} from "../lib/scanSession";
import { hasVerifiedSeriesImageSource } from "../lib/scanSeriesImageSource";
import { useI18n } from "../lib/i18nContext";
import type { TranslationKey } from "../lib/i18n";
import { buildViewerBindingKey, isViewerBindingKeyVerified } from "../lib/viewerBinding";
import {
    createReconstructionJob,
    listReconstructionJobs,
    waitForReconstructionJob,
    type ReconstructionOutputSeries,
} from "../lib/reconstructionApi";

type ImageItem = { id: string; name: string };
type SeriesType = "topogram" | "helical" | "axial" | "4d" | "static";
/** A single selectable image series in the viewer sidebar */
type Series = {
    id: string;
    name: string;
    count: number;
    kernel: string;
    thickness: string;
    kV: string;
    mAs: string;
    fov: string;
    matrix: string;
    images: ImageItem[];
    seriesType: SeriesType;
    sourceSeriesId?: number;
    imageSourceId?: ApiScanSeriesImageSourceId | null;
    imageSourceVersion?: ApiScanSeriesImageSourceVersion | null;
    /** WW/WL preset applied when this series is selected */
    defaultWw?: number;
    defaultWl?: number;
    dicomBasePath?: string;
    dicomFilePrefix?: "image" | "lung";
    dicomUrls?: string[];
};
/** A scan acquisition group (topogram/helical/axial) — may contain multiple recon series */
type ScanGroup = {
    id: string;
    label: string;
    type: SeriesType;
    series: Series[];
};
type Study = {
    id: string;
    name: string;
    scanGroups: ScanGroup[];
};
// (DrawRect removed — unused)
// (ScreenMeasure removed — unused)
type TextAnnotation = {
    id: string;
    seriesId: string;
    kind: "text";
    slice: number;
    /** image-pixel coords in 3D mode; viewport-% (0-100) in 2D mode */
    x: number;
    y: number;
    text: string;
    /** "2d" = created in Cornerstone viewer; "3d" / undefined = created on canvas */
    mode?: "2d" | "3d";
};
type Annotation = TextAnnotation;
type PanelId = "axial" | "coronal" | "sagittal" | "volume";
type LayoutSpec = {
    containerClassName: string;
    panels: Record<PanelId, string>;
};
type LayoutKey = "mpr" | "four-up" | "top-main" | "axial-main" | "volume-only" | "right-main";
type FourDBrowseMode = "phase" | "slice";
type PhaseCineSpeed = 0.5 | 1 | 2;
type PhaseCineMode = "forward" | "bounce";
const PHASE_CINE_SPEED_OPTIONS: readonly PhaseCineSpeed[] = [0.5, 1, 2] as const;
const FOUR_D_LUNG_DEFAULT_WINDOW = { ww: 1600, wl: -600 } as const;
const FOUR_D_ENGINEER_DEFAULT_WINDOW = { ww: 1600, wl: -600 } as const;
const HEAD_BRAIN_DEFAULT_WINDOW = { ww: 100, wl: 35 } as const;
type WindowPreset = {
    key: string;
    label: string;
    ww: number;
    wl: number;
};
type GeneratedReconSeries = { scanGroupId: string; series: Series };
const WINDOW_PRESETS = [
    { key: "lung", label: "Lung", ww: 1500, wl: -600 },
    { key: "bone", label: "Bone", ww: 2000, wl: 300 },
    { key: "tissue", label: "Tissue", ww: 400, wl: 40 },
    { key: "mediastinum", label: "Mediastinum", ww: 350, wl: 50 },
    { key: "brain", label: "Brain", ww: 80, wl: 40 },
] as const satisfies readonly WindowPreset[];
const HEAD_WINDOW_PRESETS = [
    { key: "head-brain", label: "脑窗", ww: HEAD_BRAIN_DEFAULT_WINDOW.ww, wl: HEAD_BRAIN_DEFAULT_WINDOW.wl },
    { key: "head-brain-standard", label: "脑实质窗", ww: 80, wl: 40 },
    { key: "head-subdural", label: "硬膜下窗", ww: 200, wl: 80 },
    { key: "head-bone", label: "骨窗", ww: 2800, wl: 600 },
    { key: "head-narrow", label: "窄脑窗", ww: 40, wl: 40 },
] as const satisfies readonly WindowPreset[];

const VOLUME_PRESETS = [
    "CT-AAA",
    "CT-AAA2",
    "CT-Bone",
    "CT-Bones",
    "CT-Cardiac",
    "CT-Cardiac2",
    "CT-Cardiac3",
    "CT-Chest-Contrast-Enhanced",
    "CT-Chest-Vessels",
    "CT-Coronary-Arteries",
    "CT-Coronary-Arteries-2",
    "CT-Coronary-Arteries-3",
    "CT-Cropped-Volume-Bone",
    "CT-Fat",
    "CT-Liver-Vasculature",
    "CT-Lung",
    "CT-MIP",
    "CT-Muscle",
    "CT-Pulmonary-Arteries",
    "CT-Soft-Tissue",
    "CT-Air",
] as const;

type VolumePreset = typeof VOLUME_PRESETS[number];

/**
 * Smart 3D volume preset defaults by body part. Control-end use case is
 * "quick coverage / sanity check", so we pick the preset whose opacity
 * transfer function makes the *primary tissue of that body part* visible
 * in volume rendering without manual tweaking.
 *
 * Falls back to "CT-Lung" (the initial default) for unknown body parts.
 */
const PRESET_BY_BODY_PART: Record<string, VolumePreset> = {
    HEAD: "CT-Bone",            // skull bone surface; brain itself isn't VR-friendly
    NECK: "CT-Soft-Tissue",     // soft-tissue dominant; carotids only show with contrast
    CHEST: "CT-Lung",           // lung parenchyma + airways
    SPINE: "CT-Bone",           // vertebral cortex
    ABDOMEN: "CT-Soft-Tissue",  // organ silhouette; CT-Liver-Vasculature only on enhanced
    PELVIS: "CT-Bone",          // pelvic bone + sacrum
    EXTREMITY: "CT-Bone",       // bones
};
const resolveDefaultVolumePreset = (bodyPart?: string | null): VolumePreset => {
    if (!bodyPart) return "CT-Lung";
    const key = bodyPart.trim().toUpperCase();
    return PRESET_BY_BODY_PART[key] ?? "CT-Lung";
};

const formatPersonName = (value?: string) => (value ? value.replace(/\^/g, " ").trim() : "N/A");

const formatDicomDate = (value?: string) => {
    if (!value || value.length < 8) return "N/A";
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
};

const formatDicomTime = (value?: string) => {
    if (!value || value.length < 6) return "N/A";
    return `${value.slice(0, 2)}:${value.slice(2, 4)}:${value.slice(4, 6)}`;
};

const cleanOverlayText = (value?: string) => {
    if (!value) return "N/A";
    const normalized = value
        .replace(/[^\x20-\x7E\u4E00-\u9FFF]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return normalized || "N/A";
};

const DEFAULT_PANEL_CLASS = "relative overflow-hidden bg-black";
const HIDDEN_PANEL_CLASS = "hidden";
const FOUR_D_PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];

const VIEW_LAYOUT_OPTIONS: readonly LayoutKey[] = ["mpr", "four-up", "top-main", "axial-main", "volume-only", "right-main"];

const LAYOUT_SPECS: Record<LayoutKey, LayoutSpec> = {
    mpr: {
        containerClassName: "flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A]",
        panels: {
            axial: DEFAULT_PANEL_CLASS,
            coronal: DEFAULT_PANEL_CLASS,
            sagittal: DEFAULT_PANEL_CLASS,
            volume: DEFAULT_PANEL_CLASS,
        },
    },
    "four-up": {
        containerClassName: "flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A]",
        panels: {
            axial: DEFAULT_PANEL_CLASS,
            coronal: DEFAULT_PANEL_CLASS,
            sagittal: DEFAULT_PANEL_CLASS,
            volume: DEFAULT_PANEL_CLASS,
        },
    },
    "top-main": {
        containerClassName: "flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A]",
        panels: {
            axial: `${DEFAULT_PANEL_CLASS} hidden`,
            coronal: DEFAULT_PANEL_CLASS,
            sagittal: DEFAULT_PANEL_CLASS,
            volume: `${DEFAULT_PANEL_CLASS} col-span-2`,
        },
    },
    "axial-main": {
        containerClassName: "flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A]",
        panels: {
            axial: `${DEFAULT_PANEL_CLASS} row-span-2`,
            coronal: DEFAULT_PANEL_CLASS,
            sagittal: DEFAULT_PANEL_CLASS,
            volume: HIDDEN_PANEL_CLASS,
        },
    },
    "volume-only": {
        containerClassName: "flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A]",
        panels: {
            axial: HIDDEN_PANEL_CLASS,
            coronal: HIDDEN_PANEL_CLASS,
            sagittal: HIDDEN_PANEL_CLASS,
            volume: `${DEFAULT_PANEL_CLASS} col-span-2 row-span-2`,
        },
    },
    "right-main": {
        containerClassName: "flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A]",
        panels: {
            axial: DEFAULT_PANEL_CLASS,
            coronal: DEFAULT_PANEL_CLASS,
            sagittal: HIDDEN_PANEL_CLASS,
            volume: `${DEFAULT_PANEL_CLASS} row-span-2 col-start-2 row-start-1`,
        },
    },
};

const REAL_LUNG_SERIES = {
    studyName: "QIN LUNG CT",
    studyId: "study-qin-lung",
    seriesId: "series-qin-lung-soft",
    seriesName: "THORAX W 3.0 B41 Soft Tissue",
    count: 118,
    rows: 512,
    cols: 512,
    thickness: "3.0 mm",
    kV: "120",
    mAs: "Auto",
    fov: "402.0 mm",
    matrix: "512",
    kernel: "B41 Soft Tissue",
    basePath: "/dicom/QIN LUNG CT/QIN-LUNG-01-0007/01-12-2000-1-CT Thorax wContrast-47252/2.000000-THORAX W  3.0 B41 Soft Tissue-52055",
};

const REALISTIC_SCOUT_SERIES = {
    seriesName: "scout",
    count: 1,
    firstImageNumber: 2,
    rows: 1595,
    cols: 888,
    thickness: "870.0 mm",
    kV: "120",
    mAs: "N/A",
    fov: "529.5 mm",
    matrix: "888",
    kernel: "LOCALIZER",
    basePath: "/daae3df7f522b56724aed7e3e544c0fe/series-000002",
};

// Brain-helical demo dataset (脑部螺旋). Mirrors the REAL_LUNG_SERIES / REALISTIC_SCOUT_SERIES
// shape but points at the JPEG Lossless head data under /dicom-out/HeadStrokeDemo/.
// Selected only when the active protocol ID matches the brain-helical demo.
const BRAIN_HELICAL_VIEW_SERIES = {
    studyName: "Head Stroke Demo",
    studyId: "study-head-stroke-demo",
    seriesId: "series-head-stroke-thick",
    seriesName: "Thick Brain 5.0 Head Brain FC21",
    count: 36,
    rows: 512,
    cols: 512,
    thickness: "5.0 mm",
    kV: "120",
    mAs: "Auto",
    fov: "240.0 mm",
    matrix: "512",
    kernel: "FC21",
    basePath: "/dicom-out/HeadStrokeDemo/ThickBrain",
};
const BRAIN_HELICAL_RECON_SERIES = [
    {
        ...BRAIN_HELICAL_VIEW_SERIES,
        defaultWw: HEAD_BRAIN_DEFAULT_WINDOW.ww,
        defaultWl: HEAD_BRAIN_DEFAULT_WINDOW.wl,
    },
    {
        studyName: "Head Stroke Demo",
        studyId: "study-head-stroke-demo",
        seriesId: "series-head-stroke-thin",
        seriesName: "Thin Brain 1.0 Head Brain FC21",
        count: 219,
        rows: 512,
        cols: 512,
        thickness: "1.0 mm",
        kV: "120",
        mAs: "Auto",
        fov: "240.0 mm",
        matrix: "512",
        kernel: "FC21",
        basePath: "/dicom-out/HeadStrokeDemo/ThinBrain",
        defaultWw: HEAD_BRAIN_DEFAULT_WINDOW.ww,
        defaultWl: HEAD_BRAIN_DEFAULT_WINDOW.wl,
    },
] as const;
const HEAD_STROKE_TOPOGRAM_URL = "/dicom-head-stroke-plain/Series%20001%20%5BTopogram%5D/1.3.6.1.4.1.5962.99.1.4162874669.1997118507.1498811526445.6.0.dcm";
const FOUR_D_SCOUT_URL = "/daae3df7f522b56724aed7e3e544c0fe/series-000002/image-000002.dcm";

const getSeriesDicomUrl = (
    sliceIndex: number,
    series?: Pick<Series, "dicomBasePath" | "dicomFilePrefix" | "dicomUrls">,
) => {
    if (series?.dicomUrls?.length) {
        return series.dicomUrls[Math.min(sliceIndex, series.dicomUrls.length - 1)];
    }
    if (series?.dicomBasePath) {
        const prefix = series.dicomFilePrefix === "lung" ? "1-" : "image-";
        return `${series.dicomBasePath}/${prefix}${String(sliceIndex + 1).padStart(3, "0")}.dcm`;
    }
    return null;
};

type ViewerToolMode = "browse" | "pan" | "wl" | "measure" | "annotate" | "eraser" | "crosshairs" | "imageRotate" | "planeRotate" | "rotate3d";
type ThreeDDisplayMode = "MPR" | "MIP" | "MinIP" | "Avg" | "VR";
type SeriesBrowserState = {
    sliceIndex: number;
    imageMode: "2D" | "3D";
    toolMode: ViewerToolMode;
    lastTools: Record<"2D" | "3D", ViewerToolMode>;
    ww: number;
    wl: number;
    displayWw: number;
    displayWl: number;
    voiLutMode: "LINEAR" | "LINEAR_EXACT" | "SIGMOID";
    interpolationMode: "LINEAR" | "NEAREST" | "FAST_LINEAR";
    inverted: boolean;
    smoothing: number;
    sharpening: number;
    layout: LayoutKey;
    displayMode3D: ThreeDDisplayMode;
    activeMprPanel: MprActivePanelId;
};
const mapCornerstoneTool = (toolMode: ViewerToolMode) => {
    if (toolMode === "browse") return "stackScroll";
    if (toolMode === "pan") return "pan";
    if (toolMode === "wl") return "window";
    if (toolMode === "measure") return "ruler";
    if (toolMode === "eraser") return "eraser";
    if (toolMode === "annotate") return "annotate";
    if (toolMode === "crosshairs" || toolMode === "planeRotate") return "crosshairs";
    if (toolMode === "imageRotate") return "planarRotate";
    if (toolMode === "rotate3d") return "trackballRotate";
    return "window";
};

const getSeriesMidSliceIndex = (count: number) => Math.max(0, Math.floor(count / 2));

const buildGeneratedReconSeries = (
    output: ReconstructionOutputSeries,
    sourceSeries: Series,
    fallbackWw: number,
    fallbackWl: number,
): Series => ({
    id: `generated-${output.series_id}`,
    name: output.series_description,
    count: output.image_count,
    kernel: output.kernel,
    thickness: `${output.slice_thickness} mm`,
    kV: sourceSeries.kV,
    mAs: sourceSeries.mAs,
    fov: `${output.fov} mm`,
    matrix: String(output.matrix),
    images: output.image_urls.map((_, index) => ({
        id: `${output.series_id}-image-${index + 1}`,
        name: `Image ${index + 1}`,
    })),
    seriesType: sourceSeries.seriesType,
    sourceSeriesId: sourceSeries.sourceSeriesId,
    imageSourceId: sourceSeries.imageSourceId,
    imageSourceVersion: sourceSeries.imageSourceVersion,
    defaultWw: output.window_width ?? fallbackWw,
    defaultWl: output.window_level ?? fallbackWl,
    dicomUrls: output.image_urls,
});

const parseDicomNumber = (value: string | undefined, fallback: number) => {
    if (!value) return fallback;
    const firstValue = value.split("\\")[0]?.trim();
    const parsed = Number(firstValue);
    return Number.isFinite(parsed) ? parsed : fallback;
};


function WindowLevelIcon({ size = 20 }: { size?: number }) {
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

const ViewScreen = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { locale, t } = useI18n();

    // ─── 4D 后处理状态 ────────────────────────────────────────────────────────
    const routeFourDState = location.state as (FourDPostScanState & { initialBrowseMode?: FourDBrowseMode; offlineRecon?: boolean }) | null;
    const selectedPatientId = loadSelectedPatient()?.id ?? null;
    const selectedScanSessionId = loadSelectedScanSessionId();
    const isFourDEntry = !!routeFourDState?.scanResult;
    const viewerBindingKey = buildViewerBindingKey({
        kind: isFourDEntry ? "4d" : "standard",
        patientId: selectedPatientId,
        scanSessionId: isFourDEntry ? routeFourDState?.scanSessionId : selectedScanSessionId,
        targetSeriesId: isFourDEntry ? routeFourDState?.targetSeriesId : undefined,
        resultVersion: isFourDEntry ? routeFourDState?.resultVersion : undefined,
    });
    const [loadedAuthoritativeFourDState, setLoadedAuthoritativeFourDState] = useState<typeof routeFourDState>(null);
    // ─── 离线重建模式 (从已完成患者列表进入) ────────────────────────────────────
    const isOfflineRecon = !!routeFourDState?.offlineRecon;

    // Scan session loaded from localStorage — MUST be declared before studyTree useMemo
    const [loadedScanSession, setLoadedScanSession] = useState<ApiScanSessionDetail | null>(null);
    const [verifiedViewerBindingKey, setVerifiedViewerBindingKey] = useState<string | null>(null);
    const isViewerBindingVerified = isViewerBindingKeyVerified(verifiedViewerBindingKey, viewerBindingKey);
    const authoritativeFourDState = isViewerBindingVerified ? loadedAuthoritativeFourDState : null;
    const scanSession = isViewerBindingVerified ? loadedScanSession : null;
    const fourDState = authoritativeFourDState ?? routeFourDState;
    const isFourDVerified = !!authoritativeFourDState;
    const [generatedReconSeries, setGeneratedReconSeries] = useState<GeneratedReconSeries[]>([]);
    const isBrainHelicalDemo = !isFourDEntry && Boolean(scanSession?.series.some(
        (series) => hasVerifiedSeriesImageSource(series)
            && (series.image_source_id === "head-stroke-topogram" || series.image_source_id === "brain-helical-demo"),
    ));
    const isLimbsDicomDemo = !isFourDEntry && Boolean(scanSession?.series.some(
        (series) => hasVerifiedSeriesImageSource(series) && series.image_source_id === "limbs-helical-demo",
    ));
    const isHeadDualScoutDemo = !isFourDEntry && Boolean(scanSession?.series.some(
        (series) => hasVerifiedSeriesImageSource(series) && series.image_source_id === "head-dual-scout-demo",
    ));
    const effectiveLungSeries = isBrainHelicalDemo ? BRAIN_HELICAL_VIEW_SERIES : REAL_LUNG_SERIES;
    /** "idle" → 非4D入口；"done" → 4D入口（相位筛选已在 PhaseFilterScreen 完成） */
    const fourDStage: "idle" | "done" = isFourDEntry ? "done" : "idle";
    const [viewerLoadStatus, setViewerLoadStatus] = useState<"loading" | "ready" | "error">("ready");

    // Will be updated to the first session series when session loads
    const [selectedSeriesId, setSelectedSeriesId] = useState(isFourDEntry ? "4d-preview-recon" : effectiveLungSeries.seriesId);
    const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
    const [fourDBrowseMode, setFourDBrowseMode] = useState<FourDBrowseMode>("phase");
    const [phaseCineSpeed, setPhaseCineSpeed] = useState<PhaseCineSpeed>(1); // multiplier; 1× = 500 ms/phase
    const phaseCineMode: PhaseCineMode = "forward";
    const cyclePhaseCineSpeed = useCallback(() => {
        const currentIndex = PHASE_CINE_SPEED_OPTIONS.indexOf(phaseCineSpeed);
        const nextIndex = (currentIndex + 1) % PHASE_CINE_SPEED_OPTIONS.length;
        setPhaseCineSpeed(PHASE_CINE_SPEED_OPTIONS[nextIndex]);
    }, [phaseCineSpeed]);
    const phaseCineDirectionRef = useRef<1 | -1>(1);
    // Across-phase aggregation for the MPR 4th panel (ITV visualisation)
    const [phaseMipMode, setPhaseMipMode] = useState<"MIP" | "MinIP" | "Avg">("MIP");
    const [slabThickness, setSlabThickness] = useState(5);
    const [imageMode, setImageMode] = useState<"2D" | "3D">(isFourDEntry ? "3D" : "2D");
    const [hasMounted3D, setHasMounted3D] = useState(isFourDEntry);
    // Currently-selected MPR panel for cine / paging. Defaults to axial — the
    // clinical primary view. Clicking another panel updates this.
    const [activeMprOrientation, setActiveMprOrientation] = useState<MprActivePanelId>("axial");
    const [sliceIndex, setSliceIndex] = useState(Math.floor(effectiveLungSeries.count / 2));
    const [toolMode, setToolMode] = useState<ViewerToolMode>("wl");
    const lastToolByModeRef = useRef<Record<"2D" | "3D", ViewerToolMode>>({ "2D": "wl", "3D": "pan" });
    const [ww, setWw] = useState(350);
    const [wl, setWl] = useState(45);
    const [isPlaying, setIsPlaying] = useState(false);
    // Displayed WW/WL — updated both from DICOM tags and from Cornerstone WL tool feedback
    const [displayWw, setDisplayWw] = useState(350);
    const [displayWl, setDisplayWl] = useState(45);
    // Scan session loaded from localStorage — MUST be declared before studyTree useMemo
    // Ref for imperative control of the Cornerstone viewport (zoom/fit/reset in 2D mode)
    const dicomViewerRef = useRef<DicomViewerHandle>(null);
    // Ref for the 3D MPR Cornerstone viewport
    const mprRef = useRef<CornerstoneMPRHandle>(null);

    useEffect(() => {
        if (imageMode === "3D") setHasMounted3D(true);
    }, [imageMode]);

    // ─── 4D manifest (pre-rendered WebP dataset) ───────────────────────────
    const [fourDEngineerManifest, setFourDEngineerManifest] = useState<FourDEngineerManifest | null>(null);
    const [limbsDicomManifest, setLimbsDicomManifest] = useState<LimbsDicomDemoManifest | null>(null);
    const [limbsDicomManifestError, setLimbsDicomManifestError] = useState<string | null>(null);
    const [headDualScoutManifest, setHeadDualScoutManifest] = useState<HeadDualScoutManifest | null>(null);
    const [headDualScoutManifestError, setHeadDualScoutManifestError] = useState<string | null>(null);

    // ─── Live clock ───────────────────────────────────────────────────────────
    const buildClock = useCallback(() => {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
    }, []);
    const buildDate = useCallback(() => {
        const now = new Date();
        return new Intl.DateTimeFormat(locale, {
            month: "numeric",
            day: "numeric",
            weekday: "short",
        }).format(now);
    }, [locale]);
    const [clockStr, setClockStr] = useState(buildClock);
    const [dateStr, setDateStr] = useState(buildDate);

    // The main axial viewport container (used for 2D mode event handling + overlays)
    const viewportRef = useRef<HTMLElement | null>(null);
    const dragRef = useRef<{ dragging: boolean; x: number; y: number }>({ dragging: false, x: 0, y: 0 });
    const measureStartRef = useRef<{ x: number; y: number } | null>(null);
    const defaultWindowRef = useRef({ ww: 350, wl: 45 });
    const dicomWindowAppliedSeriesRef = useRef<string | null>(null);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [draftMeasure, setDraftMeasure] = useState<{
        sx1: number;
        sy1: number;
        sx2: number;
        sy2: number;
        slice: number;
    } | null>(null);
    const [meta, setMeta] = useState({
        patientName: "N/A",
        patientId: "N/A",
        patientSex: "N/A",
        patientAge: "N/A",
        modality: "CT",
        studyDate: "N/A",
        studyTime: "N/A",
        institution: "N/A",
        manufacturer: "N/A",
        seriesDescription: "N/A",
        seriesNumber: "N/A",
        instanceNumber: "N/A",
        pixelSpacing: "N/A",
        sliceLocation: "N/A",
        kvp: "N/A",
        mas: "N/A",
        ww: 350,
        wl: 45,
        thickness: "N/A",
        rows: 0,
        cols: 0,
        count: 320,
    });

    const [selectedLayout, setSelectedLayout] = useState<LayoutKey>("four-up");
    const [selectedVolumePreset, setSelectedVolumePreset] = useState<VolumePreset>("CT-Lung");
    // Apply the body-part-derived default volume preset exactly once per scan
    // session load. After this, the user is free to switch presets; we don't
    // fight them on later series changes within the same session.
    const appliedDefaultPresetRef = useRef(false);
    useEffect(() => {
        if (appliedDefaultPresetRef.current) return;
        if (!scanSession) return;
        const preset = resolveDefaultVolumePreset(scanSession.body_part);
        setSelectedVolumePreset(preset);
        appliedDefaultPresetRef.current = true;
    }, [scanSession]);
    const [selectedRenderMode, setSelectedRenderMode] = useState<"MIP" | "MinIP">("MIP");
    const [selectedVoiLutMode, setSelectedVoiLutMode] = useState<"LINEAR" | "LINEAR_EXACT" | "SIGMOID">("LINEAR");
    const [selectedInterpolationMode, setSelectedInterpolationMode] = useState<"LINEAR" | "NEAREST" | "FAST_LINEAR">("LINEAR");
    const [isImageInverted, setIsImageInverted] = useState(false);
    const [imageSmoothing, setImageSmoothing] = useState(0);
    const [imageSharpening, setImageSharpening] = useState(0);
    const [readerMode, setReaderMode] = useState(false);
    const [threeDDisplayMode, setThreeDDisplayMode] = useState<ThreeDDisplayMode>("VR");
    const [focusedMprPanel, setFocusedMprPanel] = useState<MprActivePanelId | null>(null);
    const [showAnnotations, setShowAnnotations] = useState(true);
    const seriesBrowserStateRef = useRef<Map<string, SeriesBrowserState>>(new Map());
    const [isResetSheetOpen, setIsResetSheetOpen] = useState(false);
    const [pendingReset, setPendingReset] = useState<"planes" | "all" | null>(null);
    const [viewerNotice, setViewerNotice] = useState<string | null>(null);
    const [volumeQuality, setVolumeQuality] = useState<"performance" | "standard" | "fine">("standard");
    const [isBrowseModeOpen, setIsBrowseModeOpen] = useState(false);
    const [isLayoutOpen, setIsLayoutOpen] = useState(false);
    const [isVolumePresetOpen, setIsVolumePresetOpen] = useState(false);
    const [isRenderModeOpen, setIsRenderModeOpen] = useState(false);
    const [isWindowPresetOpen, setIsWindowPresetOpen] = useState(false);
    const [isVolumeQualityOpen, setIsVolumeQualityOpen] = useState(false);
    // ─── 离线重建参数状态 (仅 isOfflineRecon 模式使用) ──────────────────────────
    type ReconParams = {
        thickness: string;
        spacing: string;
        kernel: string;
        fov: string;
        centerX: string;
        centerY: string;
        zStart: string;
        zEnd: string;
        matrix: "512" | "1024";
        metalArtifact: boolean;
        reconMode: string;
    };
    const [reconParams, setReconParams] = useState<ReconParams>({
        thickness: "",
        spacing: "",
        kernel: "",
        fov: "",
        centerX: "0",
        centerY: "0",
        zStart: "",
        zEnd: "",
        matrix: "512",
        metalArtifact: false,
        reconMode: "",
    });
    type ReconStatus = "idle" | "submitting" | "queued" | "running" | "done" | "failed";
    const [reconStatus, setReconStatus] = useState<ReconStatus>("idle");
    const [reconProgress, setReconProgress] = useState(0);
    const [reconMessage, setReconMessage] = useState<string | null>(null);
    const reconAbortRef = useRef<AbortController | null>(null);
    const [isReconMatrixOpen, setIsReconMatrixOpen] = useState(false);

    const currentLayoutSpec = useMemo(
        () => LAYOUT_SPECS[selectedLayout] ?? LAYOUT_SPECS["four-up"],
        [selectedLayout]
    );
    const getLayoutLabel = useCallback((layout: LayoutKey) => {
        switch (layout) {
            case "mpr":
                return t("view.layout.mpr");
            case "four-up":
                return t("view.layout.fourUp");
            case "top-main":
                return t("view.layout.topMain");
            case "axial-main":
                return t("view.layout.axialMain");
            case "volume-only":
                return t("view.layout.volumeOnly");
            case "right-main":
                return t("view.layout.rightMain");
            default:
                return t("view.layout.fourUp");
        }
    }, [t]);
    const volumeSampleDistanceMultiplier =
        volumeQuality === "performance" ? 1.25 : volumeQuality === "fine" ? 0.45 : 0.75;
    const applyWindowPreset = useCallback((preset: WindowPreset) => {
        setWw(preset.ww);
        setWl(preset.wl);
        setDisplayWw(preset.ww);
        setDisplayWl(preset.wl);
        defaultWindowRef.current = { ww: preset.ww, wl: preset.wl };
    }, []);
    // ─── Build study tree from scan session (falls back to static DICOM data) ──
    const studyTree = useMemo<Study[]>(() => {
        // ── Helper: build an ImageItem array using the static DICOM dataset ──────
        const makeImages = (count: number, prefix: string): ImageItem[] =>
            Array.from({ length: count }, (_, i) => ({ id: `${prefix}-img-${i + 1}`, name: `Image ${i + 1}` }));
        const makeBrainHelicalSeries = (
            seriesType: SeriesType,
            sessionSeries?: ApiScanSessionDetail["series"][number],
        ): Series[] =>
            BRAIN_HELICAL_RECON_SERIES.map((series) => ({
                id: series.seriesId,
                name: series.seriesName,
                count: series.count,
                kernel: series.kernel,
                thickness: series.thickness,
                kV: series.kV,
                mAs: series.mAs,
                fov: series.fov,
                matrix: series.matrix,
                seriesType,
                sourceSeriesId: sessionSeries?.id,
                imageSourceId: sessionSeries?.image_source_id,
                imageSourceVersion: sessionSeries?.image_source_version,
                images: makeImages(series.count, series.seriesId),
                defaultWw: series.defaultWw,
                defaultWl: series.defaultWl,
                dicomBasePath: series.basePath,
                dicomFilePrefix: "image",
            }));

        // ── Static fallback (no scan session in localStorage) ────────────────────
        const makeLimbsDicomSeries = (
            series: LimbsDicomDemoSeries,
            seriesType: SeriesType,
            sessionSeries?: ApiScanSessionDetail["series"][number],
        ): Series => {
            const windowWidth = series.windowWidth ?? limbsDicomManifest?.defaultWindowWidth;
            const windowLevel = series.windowCenter ?? limbsDicomManifest?.defaultWindowLevel;
            const thickness = series.sliceThickness && series.sliceThickness !== "N/A"
                ? `${series.sliceThickness} mm`
                : "N/A";
            return {
                id: `limbs-${series.key}`,
                name: `${series.seriesDescription}${series.kernel && series.kernel !== "N/A" ? ` ${series.kernel}` : ""}`,
                count: series.count,
                kernel: series.kernel || "N/A",
                thickness,
                kV: series.kv,
                mAs: series.mAs,
                fov: series.fov,
                matrix: series.matrix,
                seriesType,
                sourceSeriesId: sessionSeries?.id,
                imageSourceId: sessionSeries?.image_source_id,
                imageSourceVersion: sessionSeries?.image_source_version,
                images: makeImages(series.count, `limbs-${series.key}`),
                defaultWw: windowWidth ?? undefined,
                defaultWl: windowLevel ?? undefined,
                dicomUrls: series.urls,
            };
        };
        const resolveHeadDualScoutKey = (series: ApiScanSessionDetail["series"][number]) => {
            const tubeAngle = Number(series.topogram_param?.tube_angle);
            const label = (series.series_label ?? "").toLowerCase();
            if (
                (Number.isFinite(tubeAngle) && Math.abs(tubeAngle - 90) < 1) ||
                label.includes("lat") ||
                label.includes("侧")
            ) {
                return "scout-lat" as const;
            }
            return "scout-ap" as const;
        };
        const makeHeadDualScoutViewSeries = (
            series: HeadDualScoutSeries,
            sessionSeries: ApiScanSessionDetail["series"][number],
            seriesType: SeriesType,
            prefix: string,
        ): Series => {
            const p = sessionSeries.topogram_param;
            const windowWidth = series.windowWidth ?? headDualScoutManifest?.defaultWindowWidth;
            const windowLevel = series.windowCenter ?? headDualScoutManifest?.defaultWindowLevel;
            const fovLabel = p
                ? `${p.fov} mm`
                : series.fov
                    ? `${series.fov} mm`
                    : "N/A";
            return {
                id: `${prefix}-${series.key}`,
                name: sessionSeries.series_label || `定位像 ${series.view}`,
                count: 1,
                kernel: "LOCALIZER",
                thickness: series.sliceThickness ? `${series.sliceThickness} mm` : "N/A",
                kV: p ? String(p.kv) : series.kv,
                mAs: p ? String(p.ma) : series.mAs,
                fov: fovLabel,
                matrix: `${series.cols || 512}`,
                seriesType,
                sourceSeriesId: sessionSeries.id,
                imageSourceId: sessionSeries.image_source_id,
                imageSourceVersion: sessionSeries.image_source_version,
                images: makeImages(1, `${prefix}-${series.key}`),
                defaultWw: windowWidth ?? undefined,
                defaultWl: windowLevel ?? undefined,
                dicomUrls: [series.url],
            };
        };

        if (!scanSession) {
            if (isFourDEntry) {
                const fourDCount = fourDEngineerManifest
                    ? fourDEngineerManifest.bedCount * fourDEngineerManifest.sliceCountPerVolume
                    : REAL_LUNG_SERIES.count;
                return [{
                    id: "study-4d-preview",
                    name: "4D CT",
                    scanGroups: [{
                        id: "4d-preview-group",
                        label: "4D Reconstruction",
                        type: "4d" as SeriesType,
                        series: [{
                            id: "4d-preview-recon",
                            name: fourDEngineerManifest ? "4D Respiratory Reconstruction" : "4D Lung Reconstruction",
                            count: fourDCount,
                            kernel: fourDEngineerManifest ? "4D Reference" : "B41 Soft Tissue",
                            thickness: fourDEngineerManifest ? "0.6 mm" : "3.0 mm",
                            kV: "120",
                            mAs: "Auto",
                            fov: fourDEngineerManifest ? "500.0 mm" : "402.0 mm",
                            matrix: "512",
                            seriesType: "4d" as SeriesType,
                            images: makeImages(fourDCount, "4d-preview"),
                            defaultWw: fourDEngineerManifest ? FOUR_D_ENGINEER_DEFAULT_WINDOW.ww : 400,
                            defaultWl: fourDEngineerManifest ? FOUR_D_ENGINEER_DEFAULT_WINDOW.wl : 40,
                        }],
                    }],
                }];
            }
            if (isBrainHelicalDemo) {
                return [{
                    id: BRAIN_HELICAL_VIEW_SERIES.studyId,
                    name: BRAIN_HELICAL_VIEW_SERIES.studyName,
                    scanGroups: [{
                        id: "brain-helical-group",
                        label: "Brain Reconstruction",
                        type: "static" as SeriesType,
                        series: makeBrainHelicalSeries("static"),
                    }],
                }];
            }
            return [{
                id: effectiveLungSeries.studyId,
                name: effectiveLungSeries.studyName,
                scanGroups: [{
                    id: "static-group",
                    label: effectiveLungSeries.seriesName,
                    type: "static" as SeriesType,
                    series: [{
                        id: effectiveLungSeries.seriesId,
                        name: effectiveLungSeries.seriesName,
                        count: effectiveLungSeries.count,
                        kernel: effectiveLungSeries.kernel,
                        thickness: effectiveLungSeries.thickness,
                        kV: effectiveLungSeries.kV,
                        mAs: effectiveLungSeries.mAs,
                        fov: effectiveLungSeries.fov,
                        matrix: effectiveLungSeries.matrix,
                        seriesType: "static" as SeriesType,
                        images: makeImages(effectiveLungSeries.count, isBrainHelicalDemo ? "brain" : "qin"),
                    }],
                }],
            }];
        }

        // ── Build from scan session data ─────────────────────────────────────────
        const scanGroups: ScanGroup[] = [];
        const sorted = [...scanSession.series].sort((a, b) => a.series_order - b.series_order);

        for (const s of sorted) {
            const type = s.series_type as SeriesType;
            const prefix = `sess${scanSession.id}-ser${s.id}`;

            if (s.series_type === "topogram") {
                const p = s.topogram_param;
                const sourceVerified = s.execution_status === "image_ready" && hasVerifiedSeriesImageSource(s);
                const headDualSeries = sourceVerified
                    && s.image_source_id === "head-dual-scout-demo"
                    && headDualScoutManifest
                    ? getHeadDualScoutSeries(headDualScoutManifest, resolveHeadDualScoutKey(s))
                    : null;
                const limbsTopogram = sourceVerified
                    && s.image_source_id === "limbs-helical-demo"
                    && limbsDicomManifest
                    ? limbsDicomManifest.series.find((series) => series.key === "topogram") ?? null
                    : null;
                const baseTopogramSeries: Series = {
                    id: `${prefix}-topo`,
                    name: s.series_label || t("view.fallback.topogram"),
                    count: 1,
                    kernel: REALISTIC_SCOUT_SERIES.kernel,
                    thickness: REALISTIC_SCOUT_SERIES.thickness,
                    kV: p ? String(p.kv) : "—",
                    mAs: p ? String(p.ma) : "—",
                    fov: p ? `${p.fov} mm` : "—",
                    matrix: REALISTIC_SCOUT_SERIES.matrix,
                    seriesType: type,
                    sourceSeriesId: s.id,
                    imageSourceId: s.image_source_id,
                    imageSourceVersion: s.image_source_version,
                    images: makeImages(1, `${prefix}-topo`),
                    defaultWw: 500,
                    defaultWl: 50,
                    ...(sourceVerified && s.image_source_id === "head-stroke-topogram"
                        ? { dicomUrls: [HEAD_STROKE_TOPOGRAM_URL], defaultWw: 130, defaultWl: 130 }
                        : {}),
                    ...(sourceVerified && s.image_source_id === "fourd-scout-demo"
                        ? { dicomUrls: [FOUR_D_SCOUT_URL] }
                        : {}),
                };
                scanGroups.push({
                    id: `group-${s.id}`,
                    label: s.series_label || t("view.fallback.topogram"),
                    type,
                    series: [headDualSeries
                        ? makeHeadDualScoutViewSeries(headDualSeries, s, type, prefix)
                        : limbsTopogram
                            ? makeLimbsDicomSeries(limbsTopogram, type, s)
                            : baseTopogramSeries],
                });
            } else {
                // helical / axial / 4d — leaf items are the recon series
                const p = s.helical_param ?? s.axial_param;
                const sourceVerified = s.execution_status === "image_ready" && hasVerifiedSeriesImageSource(s);
                const seriesCount = type === "4d" && fourDEngineerManifest
                    ? fourDEngineerManifest.bedCount * fourDEngineerManifest.sliceCountPerVolume
                    : sourceVerified && s.image_source_id === "qin-lung-helical-demo"
                        ? REAL_LUNG_SERIES.count
                        : effectiveLungSeries.count;
                const limbsResultSeries = sourceVerified
                    && s.image_source_id === "limbs-helical-demo"
                    && limbsDicomManifest
                    ? (["thin-soft", "thin-bone"] as const)
                        .map((key) => limbsDicomManifest.series.find((series) => series.key === key))
                        .filter((series): series is LimbsDicomDemoSeries => Boolean(series))
                        .map((series) => makeLimbsDicomSeries(series, type, s))
                    : null;
                const leafSeries: Series[] = sourceVerified
                    && s.image_source_id === "brain-helical-demo"
                    && type !== "4d"
                    ? makeBrainHelicalSeries(type, s)
                    : limbsResultSeries?.length
                        ? limbsResultSeries
                    : s.recon_series.map((r) => ({
                    id: `${prefix}-recon${r.id}`,
                    name: r.recon_name,
                    count: seriesCount,
                    kernel: r.kernel,
                    thickness: `${r.slice_thickness} mm`,
                    kV: p ? String(p.kv) : "—",
                    mAs: p ? ((p as { auto_ma?: boolean }).auto_ma ? "Auto" : String(p.ma)) : "—",
                    fov: p ? `${p.fov} mm` : "—",
                    matrix: String(r.matrix),
                    seriesType: type,
                    sourceSeriesId: s.id,
                    imageSourceId: s.image_source_id,
                    imageSourceVersion: s.image_source_version,
                    images: makeImages(seriesCount, `${prefix}-recon${r.id}`),
                    defaultWw: type === "4d" && fourDEngineerManifest ? FOUR_D_ENGINEER_DEFAULT_WINDOW.ww : r.window_width,
                    defaultWl: type === "4d" && fourDEngineerManifest ? FOUR_D_ENGINEER_DEFAULT_WINDOW.wl : r.window_level,
                    ...(sourceVerified && s.image_source_id === "qin-lung-helical-demo"
                        ? { dicomBasePath: REAL_LUNG_SERIES.basePath, dicomFilePrefix: "lung" as const }
                        : {}),
                    }));

                // Fallback if protocol has no recon series configured
                if (leafSeries.length === 0) {
                    leafSeries.push({
                        id: `${prefix}-scan`,
                        name: s.series_label,
                        count: seriesCount,
                        kernel: "—",
                        thickness: p ? `${(p as { slice_thickness?: number }).slice_thickness ?? "—"} mm` : "—",
                        kV: p ? String(p.kv) : "—",
                        mAs: p ? ((p as { auto_ma?: boolean }).auto_ma ? "Auto" : String(p.ma)) : "—",
                        fov: p ? `${p.fov} mm` : "—",
                        matrix: "512",
                        seriesType: type,
                        sourceSeriesId: s.id,
                        imageSourceId: s.image_source_id,
                        imageSourceVersion: s.image_source_version,
                        images: makeImages(seriesCount, `${prefix}-scan`),
                        defaultWw: type === "4d" && fourDEngineerManifest ? FOUR_D_ENGINEER_DEFAULT_WINDOW.ww : undefined,
                        defaultWl: type === "4d" && fourDEngineerManifest ? FOUR_D_ENGINEER_DEFAULT_WINDOW.wl : undefined,
                        ...(sourceVerified && s.image_source_id === "qin-lung-helical-demo"
                            ? { dicomBasePath: REAL_LUNG_SERIES.basePath, dicomFilePrefix: "lung" as const }
                            : {}),
                    });
                }

                scanGroups.push({
                    id: `group-${s.id}`,
                    label: s.series_label,
                    type,
                    series: leafSeries,
                });
            }
        }

        // If the session has no series at all (e.g. just created), add the static fallback so the viewer never crashes
        if (scanGroups.length === 0) {
            if (isBrainHelicalDemo) {
                scanGroups.push({
                    id: "brain-helical-group",
                    label: "Brain Reconstruction",
                    type: "static" as SeriesType,
                    series: makeBrainHelicalSeries("static"),
                });
            } else {
            scanGroups.push({
                id: "static-group",
                label: effectiveLungSeries.seriesName,
                type: "static" as SeriesType,
                series: [{
                    id: effectiveLungSeries.seriesId,
                    name: effectiveLungSeries.seriesName,
                    count: effectiveLungSeries.count,
                    kernel: effectiveLungSeries.kernel,
                    thickness: effectiveLungSeries.thickness,
                    kV: effectiveLungSeries.kV,
                    mAs: effectiveLungSeries.mAs,
                    fov: effectiveLungSeries.fov,
                    matrix: effectiveLungSeries.matrix,
                    seriesType: "static" as SeriesType,
                    images: Array.from({ length: effectiveLungSeries.count }, (_, i) => ({ id: `${isBrainHelicalDemo ? "brain" : "qin"}-img-${i + 1}`, name: `Image ${i + 1}` })),
                }],
            });
            }
        }

        return [{
            id: `session-${scanSession.id}`,
            name: scanSession.name || t("view.fallback.scanSequence"),
            scanGroups,
        }];
    }, [
        scanSession,
        isFourDEntry,
        fourDEngineerManifest,
        isBrainHelicalDemo,
        effectiveLungSeries,
        limbsDicomManifest,
        headDualScoutManifest,
        t,
    ]);

    const displayStudyTree = useMemo(() => {
        if (generatedReconSeries.length === 0) return studyTree;
        return studyTree.map((study) => ({
            ...study,
            scanGroups: study.scanGroups.map((group) => {
                const generatedForGroup = generatedReconSeries
                    .filter(({ scanGroupId }) => group.id === scanGroupId)
                    .map(({ series }) => series);
                return generatedForGroup.length > 0
                    ? { ...group, series: [...group.series, ...generatedForGroup] }
                    : group;
            }),
        }));
    }, [generatedReconSeries, studyTree]);
    useEffect(() => {
        if (!scanSession?.id) return;
        const controller = new AbortController();
        void listReconstructionJobs(scanSession.id, controller.signal)
            .then((jobs) => {
                const seriesById = new Map<string, Series>();
                const groupBySeriesId = new Map<string, string>();
                studyTree.forEach((study) => study.scanGroups.forEach((group) => group.series.forEach((series) => {
                    seriesById.set(series.id, series);
                    groupBySeriesId.set(series.id, group.id);
                })));

                const restored: GeneratedReconSeries[] = [];
                [...jobs].reverse().forEach((job) => {
                    if (job.status !== "completed" || !job.output_series) return;
                    const sourceId = job.request.source_series.series_id;
                    const sourceSeries = seriesById.get(sourceId);
                    const scanGroupId = groupBySeriesId.get(sourceId);
                    if (!sourceSeries || !scanGroupId) return;
                    const generated = buildGeneratedReconSeries(
                        job.output_series,
                        sourceSeries,
                        job.request.parameters.window_width,
                        job.request.parameters.window_level,
                    );
                    restored.push({ scanGroupId, series: generated });
                    seriesById.set(generated.id, generated);
                    groupBySeriesId.set(generated.id, scanGroupId);
                });
                setGeneratedReconSeries(restored);
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    console.info("Reconstruction history is unavailable.", error);
                }
            });
        return () => controller.abort();
    }, [scanSession?.id, studyTree]);
    // Guard: if the session tree is empty, keep a stable static fallback series.
    const safeSeriesList = useMemo<Series[]>(() => {
        const seriesList = displayStudyTree.flatMap((study) => study.scanGroups.flatMap((group) => group.series));
        if (seriesList.length > 0) return seriesList;
        return [{
            id: effectiveLungSeries.seriesId,
            name: effectiveLungSeries.seriesName,
            count: effectiveLungSeries.count,
            kernel: effectiveLungSeries.kernel,
            thickness: effectiveLungSeries.thickness,
            kV: effectiveLungSeries.kV,
            mAs: effectiveLungSeries.mAs,
            fov: effectiveLungSeries.fov,
            matrix: effectiveLungSeries.matrix,
            seriesType: "static",
            images: Array.from({ length: effectiveLungSeries.count }, (_, index) => ({
                id: `${isBrainHelicalDemo ? "brain" : "qin"}-img-${index + 1}`,
                name: `Image ${index + 1}`,
            })),
        }];
    }, [displayStudyTree, effectiveLungSeries, isBrainHelicalDemo]);
    const selectedSeries =
        safeSeriesList.find((s) => s.id === selectedSeriesId) ??
        (isFourDEntry
            ? safeSeriesList.find((series) => series.seriesType === "4d") ??
              safeSeriesList.find((series) => series.seriesType !== "topogram")
            : undefined) ??
        safeSeriesList[0];
    const isTopogramSeries = selectedSeries.seriesType === "topogram";
    const isFourDLungReconSeries = selectedSeries.seriesType === "4d";
    const selectedApiSeries = selectedSeries.sourceSeriesId == null
        ? null
        : scanSession?.series.find((series) => series.id === selectedSeries.sourceSeriesId) ?? null;
    const hasVerifiedNonFourDImageSource = Boolean(
        selectedApiSeries
        && selectedApiSeries.execution_status === "image_ready"
        && hasVerifiedSeriesImageSource(selectedApiSeries)
        && selectedSeries.imageSourceId === selectedApiSeries.image_source_id
        && selectedSeries.imageSourceVersion === selectedApiSeries.image_source_version
        && (selectedSeries.dicomUrls?.length || selectedSeries.dicomBasePath),
    );
    const hasLinkedImageSource = Boolean(
        isViewerBindingVerified
        && scanSession
        && (
            hasVerifiedNonFourDImageSource
            || (
                isFourDEntry
                && isFourDVerified
                && isFourDLungReconSeries
                && fourDState?.scanSessionId === scanSession.id
                && fourDState.targetSeriesId === selectedSeries.sourceSeriesId
                && fourDState.workflowStage === "ready"
                && fourDState.imageSourceId === "fourd-engineer"
                && fourDState.imageSourceVersion === 1
                && Number.isFinite(fourDState.resultVersion)
                && !!fourDEngineerManifest
            )
        ),
    );
    const windowPresetsForSelectedSeries = selectedSeries.imageSourceId === "brain-helical-demo" && !isTopogramSeries
        ? HEAD_WINDOW_PRESETS
        : WINDOW_PRESETS;
    const activeWindowPreset = useMemo(
        () =>
            windowPresetsForSelectedSeries.find(
                (preset) =>
                    Math.round(displayWw) === preset.ww &&
                    Math.round(displayWl) === preset.wl
            ),
        [displayWw, displayWl, windowPresetsForSelectedSeries]
    );
    const totalSlices = selectedSeries.count;
    // Single flex container for both 2D and 3D; CornerstoneMPRViewport does its own 2×2 panel grid internally.
    // (`currentLayoutSpec` retained for backward-compatible dropdown but no longer drives the outer layout —
    //  the Cornerstone MPR implementation doesn't honor per-panel spans anyway.)
    void currentLayoutSpec;
    const viewportContainerClassName =
        "flex-1 min-w-0 flex overflow-hidden bg-[#0F172A]";
    const isMprViewActive = !isTopogramSeries && imageMode === "3D";
    const isReaderModeSupported = imageMode === "2D" || isTopogramSeries;
    const isReaderModeActive = readerMode && isReaderModeSupported;
    const isFourDPlaybackBlockedByReview = isFourDLungReconSeries && isFourDEntry && fourDStage !== "done";
    const getFourDEngineerMhaUrlsForPhase = useCallback(
        (phaseIndex: number) => {
            if (!fourDEngineerManifest) return null;
            const urls: string[] = [];
            for (let bedIndex = 0; bedIndex < fourDEngineerManifest.bedCount; bedIndex += 1) {
                const volume = getSelectedEngineerVolume(
                    fourDEngineerManifest,
                    bedIndex,
                    phaseIndex,
                    fourDState?.phaseSelections,
                );
                if (volume) urls.push(volume.urls.mha);
            }
            return urls.length > 0 ? urls : null;
        },
        [fourDEngineerManifest, fourDState?.phaseSelections],
    );
    const fourDDicomImageUrls = useMemo(
        () => (
            isFourDLungReconSeries
                ? getFourDEngineerMhaUrlsForPhase(selectedPhaseIndex) ?? []
                : []
        ),
        [getFourDEngineerMhaUrlsForPhase, isFourDLungReconSeries, selectedPhaseIndex]
    );
    // Full list of DICOM URL-sets (one per phase) so the MPR viewport can
    // warm every phase's cornerstone volume in the background — makes the
    // first phase-cine loop cache-hot instead of cold-fetching 99 slices
    // on every tick.
    const fourDAllPhaseDicomUrls = useMemo(
        () => (
            isFourDLungReconSeries
                ? fourDEngineerManifest
                    ? Array.from(
                        { length: fourDEngineerManifest.phaseCount },
                        (_, phase) => getFourDEngineerMhaUrlsForPhase(phase) ?? [],
                    )
                    : undefined
                : undefined
        ),
        [fourDEngineerManifest, getFourDEngineerMhaUrlsForPhase, isFourDLungReconSeries],
    );
    const fourDPhaseOptions = useMemo(
        () => FOUR_D_PHASE_LABELS.map((label, index) => ({
            index,
            value: Number.parseInt(label, 10),
        })),
        []
    );
    const fourDPhaseBadgeLabel = `Phase ${FOUR_D_PHASE_LABELS[selectedPhaseIndex] ?? `${selectedPhaseIndex * 10}%`}`;
    const hasMultipleSlices = totalSlices > 1;
    const canUse3D = !isTopogramSeries && hasMultipleSlices;
    const isProjectionViewportActive = isMprViewActive && activeMprOrientation === "volume" && threeDDisplayMode !== "VR";
    const isVolumeViewportActive = isMprViewActive && activeMprOrientation === "volume" && threeDDisplayMode === "VR";
    const canBrowseSlicesInActiveViewport = imageMode === "2D" || activeMprOrientation !== "volume";
    const isPlaybackEnabled = !isFourDPlaybackBlockedByReview && hasMultipleSlices && canBrowseSlicesInActiveViewport;
    const isToolSupportedInCurrentView = useCallback((mode: ViewerToolMode) => {
        if (!isMprViewActive) {
            return mode === "browse" || mode === "pan" || mode === "wl" || mode === "measure" || mode === "annotate" || mode === "eraser" || mode === "imageRotate";
        }
        if (isVolumeViewportActive) {
            return mode === "pan" || mode === "rotate3d";
        }
        if (isProjectionViewportActive) {
            return mode === "pan" || mode === "wl" || mode === "measure" || mode === "annotate" || mode === "eraser" || mode === "imageRotate" || mode === "rotate3d";
        }
        return mode === "browse" || mode === "pan" || mode === "wl" || mode === "measure" || mode === "annotate" || mode === "eraser" || mode === "imageRotate" || mode === "crosshairs" || mode === "planeRotate";
    }, [isMprViewActive, isProjectionViewportActive, isVolumeViewportActive]);

    const showViewerNotice = useCallback((message: string) => {
        setViewerNotice(message);
    }, []);

    const handleImageModeChange = useCallback((nextMode: "2D" | "3D") => {
        if (nextMode === imageMode) return;
        if (isFourDLungReconSeries && nextMode === "2D") {
            showViewerNotice("当前 4D 工程模拟来源仅支持已验证的 3D/MPR 浏览");
            return;
        }
        if (nextMode === "3D" && !canUse3D) {
            showViewerNotice(isTopogramSeries ? "定位像仅支持 2D 浏览" : "图像层数不足，无法进入 3D");
            return;
        }
        lastToolByModeRef.current[imageMode] = toolMode;
        setIsPlaying(false);
        setFocusedMprPanel(null);
        setImageMode(nextMode);
        setToolMode(lastToolByModeRef.current[nextMode]);
        if (nextMode === "3D" && activeMprOrientation === "volume" && threeDDisplayMode === "MPR") {
            setActiveMprOrientation("axial");
        }
    }, [activeMprOrientation, canUse3D, imageMode, isFourDLungReconSeries, isTopogramSeries, showViewerNotice, threeDDisplayMode, toolMode]);

    const handleThreeDDisplayModeChange = useCallback((nextMode: ThreeDDisplayMode) => {
        setThreeDDisplayMode(nextMode);
        setFocusedMprPanel(null);
        if (nextMode === "MPR") {
            setSelectedLayout("mpr");
            setActiveMprOrientation((current) => current === "volume" ? "axial" : current);
            return;
        }
        setSelectedLayout("four-up");
        setActiveMprOrientation("volume");
        if (nextMode === "MIP" || nextMode === "MinIP") {
            setSelectedRenderMode(nextMode);
        }
    }, []);

    const handleViewerStatusChange = useCallback((status: "loading" | "ready" | "error") => {
        setViewerLoadStatus(status);
        if (status === "error" && imageMode === "3D") {
            if (isFourDLungReconSeries) {
                showViewerNotice("4D 3D/MPR 模拟影像加载失败；未回退到其他数据源");
                return;
            }
            setImageMode("2D");
            setToolMode(lastToolByModeRef.current["2D"]);
            setFocusedMprPanel(null);
            showViewerNotice("3D 加载失败，已保留并返回 2D 浏览");
        }
    }, [imageMode, isFourDLungReconSeries, showViewerNotice]);

    const handleFitActiveViewport = useCallback(() => {
        if (imageMode === "2D") dicomViewerRef.current?.fit();
        else mprRef.current?.fitActive();
        showViewerNotice("已适合当前视口");
    }, [imageMode, showViewerNotice]);

    const restoreDisplayParameters = useCallback(() => {
        const defaults = defaultWindowRef.current;
        setWw(defaults.ww);
        setWl(defaults.wl);
        setDisplayWw(defaults.ww);
        setDisplayWl(defaults.wl);
        setSelectedVoiLutMode("LINEAR");
        setSelectedInterpolationMode("LINEAR");
        setIsImageInverted(false);
        setImageSmoothing(0);
        setImageSharpening(0);
        setSlabThickness(5);
        setVolumeQuality("standard");
        setSelectedVolumePreset(resolveDefaultVolumePreset(scanSession?.body_part));
        if (imageMode === "3D") mprRef.current?.forceWindowLevel(defaults.wl, defaults.ww);
    }, [imageMode, scanSession?.body_part]);

    const handleResetCurrentView = useCallback(() => {
        if (imageMode === "2D") dicomViewerRef.current?.resetView();
        else mprRef.current?.resetActiveView();
        setIsResetSheetOpen(false);
        showViewerNotice("已复位当前视图");
    }, [imageMode, showViewerNotice]);

    const handleRestoreDisplay = useCallback(() => {
        restoreDisplayParameters();
        setIsResetSheetOpen(false);
        showViewerNotice("已恢复显示参数");
    }, [restoreDisplayParameters, showViewerNotice]);

    const confirmReset = useCallback((kind: "planes" | "all") => {
        if (kind === "planes") {
            mprRef.current?.resetPlanes();
            setActiveMprOrientation("axial");
            showViewerNotice("已复位三维切面");
        } else {
            if (imageMode === "2D") dicomViewerRef.current?.resetView();
            else {
                mprRef.current?.resetPlanes();
                mprRef.current?.resetAllViews();
                setSelectedLayout(threeDDisplayMode === "MPR" ? "mpr" : "four-up");
                setActiveMprOrientation(threeDDisplayMode === "MPR" ? "axial" : "volume");
            }
            restoreDisplayParameters();
            setFocusedMprPanel(null);
            showViewerNotice("已完成全部复位");
        }
        setPendingReset(null);
        setIsResetSheetOpen(false);
    }, [imageMode, restoreDisplayParameters, showViewerNotice, threeDDisplayMode]);

    const clampSliceIndex = useCallback((value: number) => Math.max(0, Math.min(totalSlices - 1, value)), [totalSlices]);
    const currentSliceIndex = clampSliceIndex(sliceIndex);
    const sliceProgressPercent = totalSlices > 1 ? (currentSliceIndex / (totalSlices - 1)) * 100 : 0;
    const canPageBackward = currentSliceIndex > 0;
    const canPageForward = currentSliceIndex < totalSlices - 1;
    const handleSliceStep = useCallback((delta: number) => {
        if (imageMode === "3D") {
            if (activeMprOrientation !== "volume") {
                mprRef.current?.advanceSlice(activeMprOrientation, delta);
            }
            return;
        }
        setSliceIndex((prev) => clampSliceIndex(prev + delta));
    }, [clampSliceIndex, imageMode, activeMprOrientation]);
    const handleSliceSliderChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        setSliceIndex(clampSliceIndex(Number(event.target.value)));
    }, [clampSliceIndex]);

    useEffect(() => {
        const frameId = window.requestAnimationFrame(() => {
            dicomViewerRef.current?.fit();
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [selectedSeriesId]);

    // ─── 重建参数同步：当选中序列变化时,用该序列当前值回填表单 ──────────
    // 同时服务于「离线重建」入口和「扫描后浏览」入口，两条路径展示一致的参数面板。
    useEffect(() => {
        if (!selectedSeries) return;
        const stripMm = (v?: string) => (v ? v.replace(/\s*mm\s*$/i, "").trim() : "");
        setReconParams({
            thickness: stripMm(selectedSeries.thickness),
            spacing: selectedSeries.seriesType === "helical" ? stripMm(selectedSeries.thickness) : "—",
            kernel: selectedSeries.kernel && selectedSeries.kernel !== "—" ? selectedSeries.kernel : "",
            fov: stripMm(selectedSeries.fov),
            centerX: "0",
            centerY: "0",
            zStart: "",
            zEnd: "",
            matrix: selectedSeries.matrix === "1024" ? "1024" : "512",
            metalArtifact: false,
            reconMode: "",
        });
        setReconStatus("idle");
    }, [selectedSeriesId, selectedSeries]);

    useEffect(() => {
        setSelectedPhaseIndex(0);
        setIsPlaying(false);
        setFourDBrowseMode("phase");
        phaseCineDirectionRef.current = 1;
    }, [fourDState?.initialBrowseMode, selectedSeriesId]);

    // When a 4D series is active, auto-switch to 3D MPR layout; leave non-4D workflows untouched.
    useEffect(() => {
        if (!isFourDLungReconSeries) return;
        setImageMode("3D");
        setSelectedLayout("mpr");
        setPhaseMipMode("Avg");
    }, [isFourDLungReconSeries]);

    useEffect(() => {
        if (!isTopogramSeries) return;
        setImageMode("2D");
    }, [isTopogramSeries]);

    useEffect(() => {
        if (!isFourDLungReconSeries) return;
        const defaultWindow = fourDEngineerManifest ? FOUR_D_ENGINEER_DEFAULT_WINDOW : FOUR_D_LUNG_DEFAULT_WINDOW;
        setSelectedLayout("mpr");
        setPhaseMipMode("Avg");
        setWw(defaultWindow.ww);
        setWl(defaultWindow.wl);
        setDisplayWw(defaultWindow.ww);
        setDisplayWl(defaultWindow.wl);
        defaultWindowRef.current = defaultWindow;
    }, [fourDEngineerManifest, isFourDLungReconSeries]);

    useEffect(() => {
        if (!isFourDEntry || !isFourDVerified || !fourDState?.scanResult) return;
        let cancelled = false;
        loadFourDEngineerManifest().then((manifest) => {
            if (cancelled) return;
            const result = fourDState.scanResult;
            const matchesResult = fourDState.imageSourceId === "fourd-engineer"
                && fourDState.imageSourceVersion === 1
                && !!manifest
                && manifest.version === fourDState.imageSourceVersion
                && manifest.bedCount === result.bedCount
                && manifest.phaseCount === result.phaseCount
                && result.phaseMatrix.every((row, bedIndex) =>
                    row.every((cell, phaseIndex) => (
                        manifest.volumes.filter(
                            (volume) => volume.bedIndex === bedIndex && volume.phaseIndex === phaseIndex,
                        ).length === cell.frameCount
                    )),
                );
            if (matchesResult) {
                setFourDEngineerManifest(manifest);
            } else {
                setFourDEngineerManifest(null);
                setViewerLoadStatus("error");
            }
        });
        return () => {
            cancelled = true;
        };
    }, [fourDState, isFourDEntry, isFourDVerified]);

    useEffect(() => {
        if (!isLimbsDicomDemo || !limbsDicomManifest) return;
        setImageMode("3D");
        setSelectedVolumePreset(limbsDicomManifest.defaultVolumePreset as VolumePreset);
        setVolumeQuality("fine");
        setWw(limbsDicomManifest.defaultWindowWidth);
        setWl(limbsDicomManifest.defaultWindowLevel);
        setDisplayWw(limbsDicomManifest.defaultWindowWidth);
        setDisplayWl(limbsDicomManifest.defaultWindowLevel);
        defaultWindowRef.current = {
            ww: limbsDicomManifest.defaultWindowWidth,
            wl: limbsDicomManifest.defaultWindowLevel,
        };
    }, [isLimbsDicomDemo, limbsDicomManifest]);

    useEffect(() => {
        if (isToolSupportedInCurrentView(toolMode)) return;
        const fallback: ViewerToolMode = imageMode === "2D" ? "wl" : "pan";
        setToolMode(fallback);
        lastToolByModeRef.current[imageMode] = fallback;
        showViewerNotice(`当前视口不支持该工具，已切换为${fallback === "wl" ? "窗宽/窗位" : "平移"}`);
    }, [imageMode, isToolSupportedInCurrentView, showViewerNotice, toolMode]);

    useEffect(() => {
        if (!viewerNotice) return;
        const timer = window.setTimeout(() => setViewerNotice(null), 2400);
        return () => window.clearTimeout(timer);
    }, [viewerNotice]);

    useEffect(() => {
        if (!isLimbsDicomDemo) return;
        if (limbsDicomManifest || limbsDicomManifestError) return;
        let cancelled = false;
        loadLimbsDicomDemoManifest()
            .then((manifest) => {
                if (cancelled) return;
                setLimbsDicomManifest(manifest);
            })
            .catch((err: Error) => {
                if (!cancelled) setLimbsDicomManifestError(err.message);
            });
        return () => {
            cancelled = true;
        };
    }, [isLimbsDicomDemo, limbsDicomManifest, limbsDicomManifestError]);

    useEffect(() => {
        if (!isHeadDualScoutDemo) return;
        if (headDualScoutManifest || headDualScoutManifestError) return;
        let cancelled = false;
        loadHeadDualScoutManifest()
            .then((manifest) => {
                if (cancelled) return;
                setHeadDualScoutManifest(manifest);
            })
            .catch((err: Error) => {
                if (!cancelled) setHeadDualScoutManifestError(err.message);
            });
        return () => {
            cancelled = true;
        };
    }, [isHeadDualScoutDemo, headDualScoutManifest, headDualScoutManifestError]);

    // Phase cine: advances selectedPhaseIndex while playing. Slice position is intentionally NOT touched
    // (clinical convention: cine cycles phases at a locked anatomical slice).
    useEffect(() => {
        if (!isFourDLungReconSeries || !isPlaying || fourDBrowseMode !== "phase") return;
        const total = FOUR_D_PHASE_LABELS.length;
        const intervalMs = 500 / phaseCineSpeed; // 1× ≈ 2 Hz phase rate
        const timer = window.setInterval(() => {
            setSelectedPhaseIndex((prev) => {
                if (phaseCineMode === "forward") {
                    return (prev + 1) % total;
                }
                // bounce
                let next = prev + phaseCineDirectionRef.current;
                if (next >= total) {
                    phaseCineDirectionRef.current = -1;
                    next = total - 2;
                } else if (next < 0) {
                    phaseCineDirectionRef.current = 1;
                    next = 1;
                }
                return next;
            });
        }, intervalMs);
        return () => window.clearInterval(timer);
    }, [isFourDLungReconSeries, isPlaying, phaseCineSpeed, phaseCineMode, fourDBrowseMode]);

    const preferredSeriesForFourDEntry = useMemo(() => {
        if (!isFourDEntry) return null;
        return (
            safeSeriesList.find((series) => series.seriesType === "4d" && /肺/.test(series.name)) ??
            safeSeriesList.find((series) => series.seriesType === "4d") ??
            safeSeriesList.find((series) => series.seriesType !== "topogram") ??
            safeSeriesList[0] ??
            null
        );
    }, [isFourDEntry, safeSeriesList]);
    // Auto-select first series when session data loads (or series list changes)
    useEffect(() => {
        const first = safeSeriesList[0];
        const preferred = isFourDEntry ? preferredSeriesForFourDEntry : null;
        const target = preferred ?? first;
        if (!first) return;
        setSelectedSeriesId((prev) => {
            // 4D 图像重建入口：优先切到 4D 重建序列，而不是默认 Topogram
            if (isFourDEntry && preferred && prev !== preferred.id) {
                return preferred.id;
            }
            if (isBrainHelicalDemo && !safeSeriesList.find((s) => s.id === prev && s.dicomBasePath)) {
                setSliceIndex(getSeriesMidSliceIndex(first.count));
                dicomWindowAppliedSeriesRef.current = null;
                return first.id;
            }
            // If current ID is still the static placeholder and we now have session data, switch to first session series
            if (prev === REAL_LUNG_SERIES.seriesId && scanSession) return first.id;
            // If selected ID is no longer in the list (series was removed), fall back to first
            if (!safeSeriesList.find((s) => s.id === prev)) return first.id;
            return prev;
        });
        // Apply target series WW/WL preset on session load (4D入口优先使用4D重建序列预设)
        if (target?.defaultWw != null && target.defaultWl != null) {
            setWw(target.defaultWw);
            setWl(target.defaultWl);
            setDisplayWw(target.defaultWw);
            setDisplayWl(target.defaultWl);
            defaultWindowRef.current = { ww: target.defaultWw, wl: target.defaultWl };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        scanSession,
        isFourDEntry,
        isBrainHelicalDemo,
        preferredSeriesForFourDEntry,
        isLimbsDicomDemo,
        limbsDicomManifest,
        isHeadDualScoutDemo,
        headDualScoutManifest,
    ]);

    const seriesImageUrls = useMemo(() => {
        if (!hasLinkedImageSource) return [];
        if (isFourDLungReconSeries) return fourDDicomImageUrls;
        return Array.from({ length: totalSlices }, (_, index) => getSeriesDicomUrl(index, selectedSeries))
            .filter((url): url is string => Boolean(url));
    }, [fourDDicomImageUrls, hasLinkedImageSource, isFourDLungReconSeries, selectedSeries, totalSlices]);
    const handleOfflineReconstruction = useCallback(async () => {
        if (["submitting", "queued", "running"].includes(reconStatus)) return;

        const toRequiredNumber = (value: string, label: string) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label}必须为大于 0 的有效数值。`);
            return parsed;
        };
        const toOptionalNumber = (value: string) => {
            if (!value.trim()) return undefined;
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) throw new Error("重建范围必须为有效数值。");
            return parsed;
        };
        reconAbortRef.current?.abort();
        const controller = new AbortController();
        reconAbortRef.current = controller;
        setReconStatus("submitting");
        setReconProgress(0);
        setReconMessage(null);

        try {
            const scanGroupId = displayStudyTree
                .flatMap((study) => study.scanGroups)
                .find((group) => group.series.some((series) => series.id === selectedSeries.id))?.id;
            if (!scanGroupId) throw new Error("未找到当前序列所属的扫描分组。");

            const created = await createReconstructionJob({
                scan_session_id: scanSession?.id,
                source_series: {
                    series_id: selectedSeries.id,
                    image_urls: seriesImageUrls,
                },
                parameters: {
                    slice_thickness: toRequiredNumber(reconParams.thickness, "层厚"),
                    slice_spacing: selectedSeries.seriesType === "helical"
                        ? toRequiredNumber(reconParams.spacing, "层间隔")
                        : toRequiredNumber(reconParams.thickness, "层厚"),
                    kernel: reconParams.kernel.trim() || selectedSeries.kernel,
                    fov: toRequiredNumber(reconParams.fov, "重建 FOV"),
                    center_x: Number(reconParams.centerX) || 0,
                    center_y: Number(reconParams.centerY) || 0,
                    z_start: toOptionalNumber(reconParams.zStart),
                    z_end: toOptionalNumber(reconParams.zEnd),
                    matrix: Number(reconParams.matrix) as 512 | 1024,
                    metal_artifact_reduction: reconParams.metalArtifact,
                    reconstruction_mode: reconParams.reconMode.trim() || undefined,
                    window_width: displayWw,
                    window_level: displayWl,
                },
                requested_series_description: `${selectedSeries.name}${reconParams.metalArtifact ? " MAR" : " Recon"}`,
            }, controller.signal);
            setReconStatus(created.status === "running" ? "running" : "queued");
            setReconProgress(created.progress);

            const completed = await waitForReconstructionJob(created.job_id, controller.signal, (job) => {
                if (job.status === "queued" || job.status === "running") setReconStatus(job.status);
                setReconProgress(job.progress);
            });
            if (completed.status !== "completed" || !completed.output_series) {
                throw new Error(completed.error_message || "重建任务未生成可用的新序列。");
            }

            const generatedSeries = buildGeneratedReconSeries(
                completed.output_series,
                selectedSeries,
                displayWw,
                displayWl,
            );
            setGeneratedReconSeries((current) => [
                ...current.filter(({ series }) => series.id !== generatedSeries.id),
                { scanGroupId, series: generatedSeries },
            ]);
            setSelectedSeriesId(generatedSeries.id);
            setSliceIndex(getSeriesMidSliceIndex(generatedSeries.count));
            setImageMode("2D");
            if (generatedSeries.defaultWw != null && generatedSeries.defaultWl != null) {
                applyWindowPreset({
                    key: generatedSeries.id,
                    label: generatedSeries.name,
                    ww: generatedSeries.defaultWw,
                    wl: generatedSeries.defaultWl,
                });
            }
            setReconProgress(100);
            setReconStatus("done");
            setReconMessage(`已生成并选中新序列：${generatedSeries.name}`);
        } catch (error) {
            if (controller.signal.aborted) return;
            setReconStatus("failed");
            setReconMessage(error instanceof Error ? error.message : "重建任务失败。" );
        } finally {
            if (reconAbortRef.current === controller) reconAbortRef.current = null;
        }
    }, [applyWindowPreset, displayStudyTree, displayWl, displayWw, reconParams, reconStatus, scanSession?.id, selectedSeries, seriesImageUrls]);

    useEffect(() => () => reconAbortRef.current?.abort(), []);
    const handleSeriesSelect = useCallback((seriesId: string) => {
        const nextSeries = safeSeriesList.find((series) => series.id === seriesId);
        seriesBrowserStateRef.current.set(selectedSeriesId, {
            sliceIndex,
            imageMode,
            toolMode,
            lastTools: { ...lastToolByModeRef.current },
            ww,
            wl,
            displayWw,
            displayWl,
            voiLutMode: selectedVoiLutMode,
            interpolationMode: selectedInterpolationMode,
            inverted: isImageInverted,
            smoothing: imageSmoothing,
            sharpening: imageSharpening,
            layout: selectedLayout,
            displayMode3D: threeDDisplayMode,
            activeMprPanel: activeMprOrientation,
        });
        setSelectedSeriesId(seriesId);
        dicomWindowAppliedSeriesRef.current = null;
        setDraftMeasure(null);
        measureStartRef.current = null;
        dragRef.current = { dragging: false, x: 0, y: 0 };
        const savedState = seriesBrowserStateRef.current.get(seriesId);
        if (savedState) {
            setSliceIndex(savedState.sliceIndex);
            setImageMode(savedState.imageMode);
            setToolMode(savedState.toolMode);
            lastToolByModeRef.current = { ...savedState.lastTools };
            setWw(savedState.ww);
            setWl(savedState.wl);
            setDisplayWw(savedState.displayWw);
            setDisplayWl(savedState.displayWl);
            setSelectedVoiLutMode(savedState.voiLutMode);
            setSelectedInterpolationMode(savedState.interpolationMode);
            setIsImageInverted(savedState.inverted);
            setImageSmoothing(savedState.smoothing);
            setImageSharpening(savedState.sharpening);
            setSelectedLayout(savedState.layout);
            setThreeDDisplayMode(savedState.displayMode3D);
            setActiveMprOrientation(savedState.activeMprPanel);
        } else {
            setSliceIndex(getSeriesMidSliceIndex(nextSeries?.count ?? effectiveLungSeries.count));
        }
        // 默认显示参数只用于首次进入；再次进入时恢复该序列的临时浏览状态。
        if (!savedState && nextSeries?.defaultWw != null && nextSeries?.defaultWl != null) {
            setWw(nextSeries.defaultWw);
            setWl(nextSeries.defaultWl);
            setDisplayWw(nextSeries.defaultWw);
            setDisplayWl(nextSeries.defaultWl);
        }
        if (nextSeries?.defaultWw != null && nextSeries?.defaultWl != null) {
            defaultWindowRef.current = { ww: nextSeries.defaultWw, wl: nextSeries.defaultWl };
        }
    }, [activeMprOrientation, displayWl, displayWw, effectiveLungSeries.count, imageMode, imageSharpening, imageSmoothing, isImageInverted, safeSeriesList, selectedInterpolationMode, selectedLayout, selectedSeriesId, selectedVoiLutMode, sliceIndex, threeDDisplayMode, toolMode, wl, ww]);
    const screenPointInViewport = (clientX: number, clientY: number) => {
        const viewport = viewportRef.current;
        if (!viewport) return null;
        const rect = viewport.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
        };
    };

    useEffect(() => {
        const tick = () => {
            setClockStr(buildClock());
            setDateStr(buildDate());
        };
        const id = window.setInterval(tick, 30_000);
        tick();
        return () => window.clearInterval(id);
    }, [buildClock, buildDate]);

    useEffect(() => {
        let cancelled = false;
        setVerifiedViewerBindingKey(null);
        setLoadedAuthoritativeFourDState(null);
        setLoadedScanSession(null);
        setViewerLoadStatus("loading");
        if (isFourDEntry) {
            const expectedSessionId = routeFourDState?.scanSessionId;
            const expectedTargetSeriesId = routeFourDState?.targetSeriesId;
            const expectedResultVersion = routeFourDState?.resultVersion;
            if (
                selectedPatientId === null
                || !Number.isFinite(expectedSessionId)
                || !Number.isFinite(expectedTargetSeriesId)
                || !Number.isFinite(expectedResultVersion)
            ) {
                setViewerLoadStatus("error");
                return;
            }
            loadAuthoritativeFourDRecovery(selectedPatientId)
                .then((recovery) => {
                    if (cancelled) return;
                    if (resolveLoadedFourDRecoveryDestination(recovery) !== "viewer") {
                        throw new Error("The 4D result is not finalized for viewing.");
                    }
                    if (
                        recovery.session.id !== expectedSessionId
                        || recovery.target.id !== expectedTargetSeriesId
                        || recovery.result.version !== expectedResultVersion
                    ) {
                        throw new Error("The recovered 4D result does not match the requested viewer binding.");
                    }
                    setLoadedScanSession(recovery.session);
                    setLoadedAuthoritativeFourDState({
                        ...toFourDPostScanState(recovery.result),
                        initialBrowseMode: routeFourDState?.initialBrowseMode,
                        offlineRecon: routeFourDState?.offlineRecon,
                    });
                    setVerifiedViewerBindingKey(viewerBindingKey);
                    setViewerLoadStatus("ready");
                })
                .catch(() => {
                    if (!cancelled) {
                        setVerifiedViewerBindingKey(null);
                        setLoadedAuthoritativeFourDState(null);
                        setLoadedScanSession(null);
                        setViewerLoadStatus("error");
                    }
                });
        } else {
            fetchSelectedScanSession({ preferCache: false })
                .then((session) => {
                    if (cancelled) return;
                    if (!session) throw new Error("No selected scan session is available.");
                    if (
                        selectedPatientId === null
                        || session.patient_id !== selectedPatientId
                        || session.id !== selectedScanSessionId
                        || session.status !== "completed"
                    ) {
                        throw new Error("The scan session is not finalized for the selected patient.");
                    }
                    setLoadedScanSession(session);
                    setVerifiedViewerBindingKey(viewerBindingKey);
                    setViewerLoadStatus("ready");
                })
                .catch(() => {
                    if (!cancelled) {
                        setVerifiedViewerBindingKey(null);
                        setLoadedAuthoritativeFourDState(null);
                        setLoadedScanSession(null);
                        setViewerLoadStatus("error");
                    }
                });
        }
        return () => {
            cancelled = true;
        };
    }, [
        isFourDEntry,
        routeFourDState?.initialBrowseMode,
        routeFourDState?.offlineRecon,
        routeFourDState?.resultVersion,
        routeFourDState?.scanSessionId,
        routeFourDState?.targetSeriesId,
        selectedPatientId,
        selectedScanSessionId,
        viewerBindingKey,
    ]);

    useEffect(() => {
        if (!hasLinkedImageSource) {
            setViewerLoadStatus("error");
            return;
        }
        if (isFourDLungReconSeries) {
            setViewerLoadStatus(fourDDicomImageUrls.length > 0 ? "ready" : "error");
            return;
        }
        const controller = new AbortController();
        const loadSlice = async () => {
            try {
                const url = getSeriesDicomUrl(clampSliceIndex(sliceIndex), selectedSeries);
                if (!url) throw new Error("Selected series has no verified DICOM URL.");
                const response = await fetch(url, { signal: controller.signal });
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${url}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const byteArray = new Uint8Array(arrayBuffer);
                const dataSet = dicomParser.parseDicom(byteArray);

                const rows = dataSet.uint16("x00280010") ?? 0;
                const cols = dataSet.uint16("x00280011") ?? 0;
                const wcFromTag = parseDicomNumber(dataSet.string("x00281050"), 45);
                const wwFromTag = parseDicomNumber(dataSet.string("x00281051"), 350);
                const patientName = cleanOverlayText(formatPersonName(dataSet.string("x00100010")));
                const patientId = cleanOverlayText(dataSet.string("x00100020"));
                const patientSex = cleanOverlayText(dataSet.string("x00100040"));
                const patientAge = cleanOverlayText(dataSet.string("x00101010"));
                const modality = cleanOverlayText(dataSet.string("x00080060") ?? "CT");
                const studyDate = formatDicomDate(dataSet.string("x00080020"));
                const studyTime = formatDicomTime(dataSet.string("x00080030"));
                const institution = cleanOverlayText(dataSet.string("x00080080"));
                const manufacturer = cleanOverlayText(dataSet.string("x00080070"));
                const seriesDescription = cleanOverlayText(dataSet.string("x0008103e") ?? selectedSeries.name);
                const seriesNumber = cleanOverlayText(dataSet.string("x00200011"));
                const instanceNumber = cleanOverlayText(dataSet.string("x00200013") ?? String(sliceIndex + 1));
                const pixelSpacing = cleanOverlayText((dataSet.string("x00280030") ?? "N/A").replace("\\", " / "));
                const sliceLocation = cleanOverlayText(dataSet.string("x00201041"));
                const kvp = cleanOverlayText(dataSet.string("x00180060"));
                const mas = cleanOverlayText(dataSet.string("x00181152"));
                const thickness = dataSet.string("x00180050") ?? "N/A";

                // ── Compute WW/WL defaults (always, before any canvas check) ────────
                const parsedWw = Number.isFinite(wwFromTag) && wwFromTag > 1 ? wwFromTag : 350;
                const parsedWl = Number.isFinite(wcFromTag) ? wcFromTag : 45;
                defaultWindowRef.current = { ww: parsedWw, wl: parsedWl };
                if (dicomWindowAppliedSeriesRef.current !== selectedSeries.id) {
                    dicomWindowAppliedSeriesRef.current = selectedSeries.id;
                    setWw(parsedWw);
                    setWl(parsedWl);
                    setDisplayWw(parsedWw);
                    setDisplayWl(parsedWl);
                }

                // ── Update overlay metadata (always — works in both 2D and 3D mode) ──
                setMeta({
                    patientName,
                    patientId,
                    patientSex,
                    patientAge,
                    modality,
                    studyDate,
                    studyTime,
                    institution,
                    manufacturer,
                    seriesDescription,
                    seriesNumber,
                    instanceNumber,
                    pixelSpacing,
                    sliceLocation,
                    kvp,
                    mas,
                    ww: parsedWw,
                    wl: parsedWl,
                    thickness: thickness === "N/A" ? thickness : `${thickness} mm`,
                    rows,
                    cols,
                    count: selectedSeries.count,
                });

                // Cornerstone handles pixel rendering; we only needed metadata above.
            } catch (error) {
                if (controller.signal.aborted) return;
                // Keep UI alive if one slice fails.
                console.error(error);
            }
        };

        void loadSlice();
        return () => controller.abort();
    }, [clampSliceIndex, fourDDicomImageUrls.length, hasLinkedImageSource, isFourDLungReconSeries, selectedSeries, selectedSeriesId, sliceIndex]);

    // (3D canvas renderCurrentSlice removed — now handled by CornerstoneMPRViewport)

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowUp" || e.key === "ArrowRight") {
                setSliceIndex((prev) => Math.min(totalSlices - 1, prev + 1));
            }
            if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
                setSliceIndex((prev) => Math.max(0, prev - 1));
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [totalSlices]);

    useEffect(() => {
        if (!isPlaying || isFourDLungReconSeries) return;
        const timer = window.setInterval(() => {
            if (imageMode === "3D") {
                // 3D MPR: advance the active panel's slice via the volume
                // viewport API. Cornerstone's crosshairs tool keeps the
                // reference lines in the other two panels in sync.
                if (activeMprOrientation !== "volume") {
                    mprRef.current?.advanceSlice(activeMprOrientation, 1);
                }
            } else {
                setSliceIndex((prev) => (prev >= totalSlices - 1 ? 0 : prev + 1));
            }
        }, 250);
        return () => window.clearInterval(timer);
    }, [isPlaying, totalSlices, isFourDLungReconSeries, imageMode, activeMprOrientation]);

    useEffect(() => {
        if (isPlaybackEnabled) return;
        setIsPlaying(false);
    }, [isPlaybackEnabled]);

    useEffect(() => {
        if (isReaderModeSupported) return;
        setReaderMode(false);
    }, [isReaderModeSupported]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (toolMode !== "measure" || !measureStartRef.current) return;
            const point = screenPointInViewport(e.clientX, e.clientY);
            if (!point) return;
            setDraftMeasure((prev) => (prev ? { ...prev, sx2: point.x, sy2: point.y } : null));
        };
        const onUp = () => {
            if (toolMode !== "measure" || !draftMeasure) return;
            // Native measurement logic removed in favor of Cornerstone tool, 
            // but we keep the handler to clear the draft state.
            setDraftMeasure(null);
            measureStartRef.current = null;
            dragRef.current.dragging = false;
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [toolMode, draftMeasure]);

    // (Canvas-based coronal/sagittal/volume render effects removed — now Cornerstone MPR handles all 3D panels)

    return (
        <div className="relative flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden">
            <AppHeader
                patientName={meta.patientName !== "N/A" ? meta.patientName : null}
                patientId={meta.patientId !== "N/A" ? meta.patientId : null}
                clockOverride={{ time: clockStr, date: dateStr }}
            />

            <main className={`flex-1 flex overflow-hidden p-2 ${isReaderModeActive ? "gap-0" : "gap-2"}`}>
                <aside
                    aria-hidden={isReaderModeActive}
                    className={`bg-white rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden shrink-0 transition-all duration-200 ${
                        isReaderModeActive ? "w-0 border-0 opacity-0 pointer-events-none" : "w-[240px] opacity-100"
                    }`}
                >
                    <div className="h-[44px] bg-[#F8FAFC] border-b border-[#EEF2F9] px-3 flex items-center gap-2">
                        <Layers3 size={14} className="text-[#4D94FF]" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-[#37474F]">{t("view.series.title")}</span>
                    </div>

                    <div className="h-[220px] overflow-y-auto p-2 border-b border-[#EEF2F9]">
                        {displayStudyTree.map((study) => (
                            <div key={study.id} className="mb-1">
                                {/* ── Protocol / Session name ── */}
                                <div className="px-2 py-1.5 flex items-center gap-1.5">
                                    <span className="text-[10px] font-black text-[#546E7A] uppercase tracking-wide">{study.name}</span>
                                </div>

                                {/* ── Scan acquisition groups ── */}
                                {study.scanGroups.map((group) => {
                                    const typeLabel: Record<SeriesType, string> = {
                                        topogram: t("view.seriesType.topogram"),
                                        helical: t("view.seriesType.helical"),
                                        axial: t("view.seriesType.axial"),
                                        "4d": t("view.seriesType.4d"),
                                        static: t("view.seriesType.static"),
                                    };
                                    const typeBadgeColor: Record<SeriesType, string> = {
                                        topogram: "bg-emerald-100 text-emerald-700",
                                        helical:  "bg-blue-100 text-blue-700",
                                        axial:    "bg-violet-100 text-violet-700",
                                        "4d":     "bg-orange-100 text-orange-700",
                                        static:   "bg-slate-100 text-slate-600",
                                    };

                                    // Topogram: single leaf — render as a direct button (no sub-indent)
                                    if (group.type === "topogram" && group.series.length === 1) {
                                        const s = group.series[0];
                                        const active = s.id === selectedSeriesId;
                                        return (
                                            <button
                                                key={group.id}
                                                onClick={() => handleSeriesSelect(s.id)}
                                                className={`w-full text-left mb-1.5 rounded-md border px-3 py-2 transition-all flex items-start gap-2 ${active ? "bg-[#E3F2FD] border-[#90CAF9]" : "bg-white border-[#DCE6F2] hover:bg-[#F8FAFC]"}`}
                                            >
                                                <span className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[8px] font-black uppercase ${typeBadgeColor[group.type]}`}>
                                                    {typeLabel[group.type]}
                                                </span>
                                                <div className="min-w-0">
                                                    <div className={`text-[12px] font-bold truncate ${active ? "text-[#1565C0]" : "text-[#37474F]"}`}>{s.name}</div>
                                                    <div className="text-[10px] text-[#78909C] mt-0.5">{t("view.series.images", { count: s.count })}</div>
                                                </div>
                                            </button>
                                        );
                                    }

                                    // Helical / Axial / 4D: group header + recon series as indented items
                                    return (
                                        <div key={group.id} className="mb-1.5">
                                            {/* Group header — non-clickable */}
                                            <div className="flex items-center gap-1.5 px-2 py-1">
                                                <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-black uppercase ${typeBadgeColor[group.type]}`}>
                                                    {typeLabel[group.type]}
                                                </span>
                                                <span className="text-[11px] font-bold text-[#37474F] truncate">{group.label}</span>
                                            </div>

                                            {/* Recon series — selectable, indented */}
                                            <div className="ml-3 pl-2 border-l-2 border-[#DCE6F2] flex flex-col gap-1">
                                                {group.series.map((s) => {
                                                    const active = s.id === selectedSeriesId;
                                                    return (
                                                        <button
                                                            key={s.id}
                                                            onClick={() => handleSeriesSelect(s.id)}
                                                            className={`w-full text-left rounded-md border px-2.5 py-1.5 transition-all ${active ? "bg-[#E3F2FD] border-[#90CAF9]" : "bg-white border-[#DCE6F2] hover:bg-[#F8FAFC]"}`}
                                                        >
                                                            <div className={`text-[11px] font-bold ${active ? "text-[#1565C0]" : "text-[#37474F]"}`}>{s.name}</div>
                                                            <div className="text-[9px] text-[#78909C] mt-0.5">{s.kernel !== "—" ? s.kernel : ""} {s.thickness}</div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    <div className="h-[44px] bg-[#F8FAFC] border-b border-t border-[#EEF2F9] px-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <SlidersHorizontal size={14} className="text-[#4D94FF]" />
                            <span className="text-[11px] font-black uppercase tracking-wider text-[#37474F]">
                                {(isOfflineRecon || !isTopogramSeries) ? t("view.offlineRecon.title") : t("view.params")}
                            </span>
                        </div>
                        {!isFourDLungReconSeries ? (
                            <div className="flex items-center gap-px overflow-hidden rounded-md border border-[#B7D5FF] bg-[#EAF2FF] p-0.5 shadow-sm">
                                {(["2D", "3D"] as const).map((mode) => {
                                    const active = imageMode === mode;
                                    const disabled = mode === "3D" && !canUse3D;
                                    return (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => handleImageModeChange(mode)}
                                            disabled={disabled}
                                            aria-pressed={active}
                                            title={disabled ? (isTopogramSeries ? "定位像仅支持 2D 浏览" : "图像层数不足，无法进入 3D") : `${mode} 模式`}
                                            className={`h-7 min-w-10 rounded px-1.5 text-[10px] font-black transition-all ${active
                                                ? "bg-[#2563EB] text-white shadow-[0_2px_5px_rgba(37,99,235,0.22)]"
                                                : disabled ? "cursor-not-allowed text-[#94A3B8]/55" : "bg-white text-[#475569] active:bg-[#DBEAFE]"
                                                }`}
                                        >
                                            {mode}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>

                    <div className="flex-1 bg-[#F8FAFC] overflow-hidden flex flex-col">
                        <div className="flex-1 p-3 grid grid-cols-2 gap-2 overflow-y-auto">
                            {imageMode === "2D" || isTopogramSeries ? (
                                !isTopogramSeries ? (
                                    <div className="col-span-2 flex flex-col gap-2">
                                        {/* 顶部窗值 + 窗模板 — 平板设备使用频率最高，置顶便于一键调整 */}
                                        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)] gap-1.5 rounded-md border border-[#B7D5FF] bg-[linear-gradient(135deg,#F0F7FF_0%,#F4FFFB_100%)] px-2 py-2 shadow-[0_8px_18px_-16px_rgba(37,99,235,0.75)]">
                                            <WindowValueStrip ww={Math.round(displayWw)} wl={Math.round(displayWl)} inline />
                                            <div className="relative">
                                                <div
                                                    onClick={() => {
                                                        setIsWindowPresetOpen(!isWindowPresetOpen);
                                                        setIsVolumePresetOpen(false);
                                                        setIsRenderModeOpen(false);
                                                        setIsVolumeQualityOpen(false);
                                                    }}
                                                    className={`flex h-full min-h-[44px] w-full cursor-pointer items-center justify-between rounded-md border bg-white/90 px-1.5 transition-all ${isWindowPresetOpen ? 'border-[#2563EB] ring-2 ring-[#60A5FA]/20' : 'border-[#BFDBFE] hover:border-[#60A5FA]'}`}
                                                >
                                                    <span className="truncate text-[10px] font-semibold text-[#1E3A8A]">
                                                        {activeWindowPreset ? activeWindowPreset.label : t("view.controls.windowPreset")}
                                                    </span>
                                                    <ChevronDown size={13} className={`text-[#60A5FA] transition-transform shrink-0 ml-1 ${isWindowPresetOpen ? 'rotate-180 text-[#2563EB]' : ''}`} />
                                                </div>
                                                {isWindowPresetOpen && (
                                                    <div className="absolute top-[calc(100%+3px)] left-0 right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                        {windowPresetsForSelectedSeries.map((preset) => {
                                                            const active = activeWindowPreset?.key === preset.key;
                                                            return (
                                                                <div
                                                                    key={preset.key}
                                                                    onClick={() => {
                                                                        applyWindowPreset(preset);
                                                                        setIsWindowPresetOpen(false);
                                                                    }}
                                                                    className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${active ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                                >
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <span>{preset.label}</span>
                                                                        <span className="text-[10px] font-black tabular-nums opacity-60">
                                                                            {preset.ww}/{preset.wl}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <OfflineReconPanel
                                            params={reconParams}
                                            setParams={setReconParams}
                                            isHelical={selectedSeries.seriesType === "helical"}
                                            ww={Math.round(displayWw)}
                                            wl={Math.round(displayWl)}
                                            status={reconStatus}
                                            progress={reconProgress}
                                            message={reconMessage}
                                            isMatrixOpen={isReconMatrixOpen}
                                            setIsMatrixOpen={setIsReconMatrixOpen}
                                            onApply={handleOfflineReconstruction}
                                            t={t}
                                            hideWindowValue
                                        />
                                    </div>
                                ) : (
                                <div className="col-span-2 flex flex-col gap-2">
                                    <PanelSection title={t("view.display")}>
                                    <div className="rounded-md border border-[#B7D5FF] bg-[linear-gradient(135deg,#F0F7FF_0%,#F4FFFB_100%)] px-2.5 py-2 shadow-[0_8px_18px_-16px_rgba(37,99,235,0.75)]">
                                        <WindowValueStrip ww={Math.round(displayWw)} wl={Math.round(displayWl)} />
                                    </div>
                                    </PanelSection>
                                </div>
                                )
                            ) : (
                                <div className="col-span-2 flex flex-col gap-2">
                                    {!isFourDLungReconSeries && (
                                        <PanelSection title="三维显示">
                                            <div className="grid grid-cols-5 gap-1.5">
                                                {(["MPR", "MIP", "MinIP", "Avg", "VR"] as const).map((mode) => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => handleThreeDDisplayModeChange(mode)}
                                                        aria-pressed={threeDDisplayMode === mode}
                                                        className={`h-[44px] rounded-lg border text-[10px] font-black transition-colors ${threeDDisplayMode === mode
                                                            ? "border-[#2563EB] bg-[#2563EB] text-white"
                                                            : "border-[#DCE6F2] bg-white text-[#475569] active:bg-[#DBEAFE]"
                                                            }`}
                                                    >
                                                        {mode}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-4 gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => { setSelectedLayout("four-up"); setFocusedMprPanel(null); }}
                                                    className={`flex h-[44px] flex-col items-center justify-center rounded-lg border text-[9px] font-bold ${selectedLayout === "four-up" && !focusedMprPanel ? "border-[#2563EB] bg-[#EBF3FF] text-[#2563EB]" : "border-[#DCE6F2] bg-white text-[#546E7A]"}`}
                                                >
                                                    <LayoutGrid size={16} />
                                                    <span className="mt-0.5">四窗</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setSelectedLayout("mpr"); setFocusedMprPanel(null); setActiveMprOrientation((current) => current === "volume" ? "axial" : current); }}
                                                    className={`flex h-[44px] flex-col items-center justify-center rounded-lg border text-[9px] font-bold ${selectedLayout === "mpr" && !focusedMprPanel ? "border-[#2563EB] bg-[#EBF3FF] text-[#2563EB]" : "border-[#DCE6F2] bg-white text-[#546E7A]"}`}
                                                >
                                                    <Layers3 size={16} />
                                                    <span className="mt-0.5">MPR</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFocusedMprPanel((current) => current ? null : activeMprOrientation)}
                                                    className={`flex h-[44px] flex-col items-center justify-center rounded-lg border text-[9px] font-bold ${focusedMprPanel ? "border-[#2563EB] bg-[#EBF3FF] text-[#2563EB]" : "border-[#DCE6F2] bg-white text-[#546E7A]"}`}
                                                >
                                                    <Focus size={16} />
                                                    <span className="mt-0.5">{focusedMprPanel ? "恢复布局" : "当前视口"}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { handleThreeDDisplayModeChange("VR"); setFocusedMprPanel("volume"); }}
                                                    className={`flex h-[44px] flex-col items-center justify-center rounded-lg border text-[9px] font-bold ${focusedMprPanel === "volume" ? "border-[#2563EB] bg-[#EBF3FF] text-[#2563EB]" : "border-[#DCE6F2] bg-white text-[#546E7A]"}`}
                                                >
                                                    <Orbit size={16} />
                                                    <span className="mt-0.5">三维主视图</span>
                                                </button>
                                            </div>
                                        </PanelSection>
                                    )}
                                    {/* Layout Dropdown */}
                                    <div className="hidden items-center gap-2 relative">
                                        <span className={VIEW_CONTROL_LABEL_CLASS}>{t("view.controls.layout")}</span>
                                        {isFourDLungReconSeries ? (
                                            <div
                                                onClick={() => setIsLayoutOpen(!isLayoutOpen)}
                                                className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between cursor-pointer transition-all ${isLayoutOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                            >
                                                <span className="text-[12px] font-medium text-[#37474F] truncate">{phaseMipMode}</span>
                                                <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isLayoutOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                            </div>
                                        ) : (
                                            <div
                                                onClick={() => setIsLayoutOpen(!isLayoutOpen)}
                                                className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isLayoutOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                            >
                                                <span className="text-[12px] font-medium text-[#37474F] truncate">
                                                    {getLayoutLabel(selectedLayout)}
                                                </span>
                                                <ChevronDown size={13} className={`text-[#4D94FF] transition-transform shrink-0 ml-1 ${isLayoutOpen ? 'rotate-180' : ''}`} />
                                            </div>
                                        )}
                                        {isLayoutOpen && isFourDLungReconSeries && (
                                            <div className="absolute top-[calc(100%+3px)] left-[80px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                {(["MIP", "MinIP", "Avg"] as const).map((opt) => (
                                                    <div
                                                        key={opt}
                                                        onClick={() => {
                                                            setPhaseMipMode(opt);
                                                            setIsLayoutOpen(false);
                                                        }}
                                                        className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${phaseMipMode === opt ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                        title={opt === "MIP" ? t("view.mip.mipTitle") : opt === "MinIP" ? t("view.mip.minipTitle") : t("view.mip.avgTitle")}
                                                    >
                                                        {opt}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {isLayoutOpen && !isFourDLungReconSeries && (
                                            <div className="absolute top-[calc(100%+3px)] left-[80px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                {VIEW_LAYOUT_OPTIONS.map((opt) => (
                                                    <div
                                                        key={opt}
                                                        onClick={() => { setSelectedLayout(opt); setIsLayoutOpen(false); }}
                                                        className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedLayout === opt ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                    >
                                                        {getLayoutLabel(opt)}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Volume Rendering Preset Dropdown */}
                                    {!isFourDLungReconSeries && (
                                        <>
                                             <PanelSection title={t("view.display")}>
                                                 <div className="grid grid-cols-2 gap-2">
                                                     <Param label="WW" value={String(Math.round(displayWw))} />
                                                     <Param label="WL" value={String(Math.round(displayWl))} />
                                                 </div>
                                                 <div className="flex items-center gap-2 relative">
                                                     <span className={VIEW_CONTROL_LABEL_CLASS}>{t("view.controls.windowPreset")}</span>
                                                     <div
                                                         onClick={() => {
                                                             setIsWindowPresetOpen(!isWindowPresetOpen);
                                                             setIsVolumePresetOpen(false);
                                                             setIsRenderModeOpen(false);
                                                             setIsVolumeQualityOpen(false);
                                                         }}
                                                         className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isWindowPresetOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                                     >
                                                         <span className="text-[12px] font-medium text-[#37474F] truncate">
                                                             {activeWindowPreset ? activeWindowPreset.label : t("view.controls.windowPreset")}
                                                         </span>
                                                         <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isWindowPresetOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                                     </div>
                                                     {isWindowPresetOpen && (
                                                         <div className="absolute top-[calc(100%+3px)] left-[80px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                             {windowPresetsForSelectedSeries.map((preset) => {
                                                                 const active = activeWindowPreset?.key === preset.key;
                                                                 return (
                                                                     <div
                                                                         key={preset.key}
                                                                         onClick={() => {
                                                                             applyWindowPreset(preset);
                                                                             setIsWindowPresetOpen(false);
                                                                         }}
                                                                         className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${active ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                                     >
                                                                         <div className="flex items-center justify-between gap-2">
                                                                             <span>{preset.label}</span>
                                                                             <span className="text-[10px] font-black tabular-nums opacity-60">
                                                                                 {preset.ww}/{preset.wl}
                                                                             </span>
                                                                         </div>
                                                                     </div>
                                                                 );
                                                             })}
                                                         </div>
                                                     )}
                                                 </div>
                                                <div className="flex items-center justify-between rounded-md border border-[#DCE6F2] bg-white px-2 py-1.5">
                                                    <span className="text-[11px] font-semibold text-[#546E7A]">{t("view.controls.invert")}</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={isImageInverted}
                                                        onChange={(event) => setIsImageInverted(event.target.checked)}
                                                        className="h-4 w-4 accent-[#4D94FF]"
                                                    />
                                                </div>
                                            </PanelSection>

                                            <PanelSection title={t("view.controls.volumeRendering")}>
                                            <div className="flex items-center gap-2 relative">
                                                <span className={VIEW_CONTROL_LABEL_CLASS}>{t("view.controls.volumePreset")}</span>
                                                <div
                                                    onClick={() => {
                                                        setIsVolumePresetOpen(!isVolumePresetOpen);
                                                        setIsWindowPresetOpen(false);
                                                        setIsRenderModeOpen(false);
                                                        setIsVolumeQualityOpen(false);
                                                    }}
                                                    className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isVolumePresetOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                                >
                                                    <span className="text-[12px] font-medium text-[#37474F] truncate">
                                                        {selectedVolumePreset}
                                                    </span>
                                                    <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isVolumePresetOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                                </div>
                                                {isVolumePresetOpen && (
                                                    <div className="absolute top-[calc(100%+3px)] left-[80px] right-0 max-h-[260px] overflow-y-auto bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1">
                                                        {VOLUME_PRESETS.map((preset) => (
                                                            <div
                                                                key={preset}
                                                                onClick={() => { setSelectedVolumePreset(preset); setIsVolumePresetOpen(false); }}
                                                                className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedVolumePreset === preset ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                            >
                                                                {preset}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 relative">
                                                <span className={VIEW_CONTROL_LABEL_CLASS}>{t("view.controls.sampleQuality")}</span>
                                                <div
                                                    onClick={() => {
                                                        setIsVolumeQualityOpen(!isVolumeQualityOpen);
                                                        setIsWindowPresetOpen(false);
                                                        setIsVolumePresetOpen(false);
                                                        setIsRenderModeOpen(false);
                                                    }}
                                                    className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isVolumeQualityOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                                >
                                                    <span className="text-[12px] font-medium text-[#37474F] truncate">
                                                        {volumeQuality === "performance" ? t("view.quality.performance") : volumeQuality === "fine" ? t("view.quality.fine") : t("view.quality.standard")}
                                                    </span>
                                                    <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isVolumeQualityOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                                </div>
                                                {isVolumeQualityOpen && (
                                                    <div className="absolute top-[calc(100%+3px)] left-[80px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                        {([
                                                            { value: "performance" as const, label: t("view.quality.performance") },
                                                            { value: "standard" as const, label: t("view.quality.standard") },
                                                            { value: "fine" as const, label: t("view.quality.fine") },
                                                        ]).map((opt) => (
                                                            <div
                                                                key={opt.value}
                                                                onClick={() => { setVolumeQuality(opt.value); setIsVolumeQualityOpen(false); }}
                                                                className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${volumeQuality === opt.value ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                            >
                                                                {opt.label}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            </PanelSection>

                                            <PanelSection title={t("view.controls.projection")}>

                                            <div className="flex items-center gap-2 relative">
                                                <span className={VIEW_CONTROL_LABEL_CLASS}>{t("view.controls.projectionMode")}</span>
                                                <div
                                                    onClick={() => {
                                                        setIsRenderModeOpen(!isRenderModeOpen);
                                                        setIsWindowPresetOpen(false);
                                                        setIsVolumePresetOpen(false);
                                                        setIsVolumeQualityOpen(false);
                                                    }}
                                                    className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isRenderModeOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                                >
                                                    <span className="text-[12px] font-medium text-[#37474F]">
                                                        {selectedRenderMode}
                                                    </span>
                                                    <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isRenderModeOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                                </div>
                                                {isRenderModeOpen && (
                                                    <div className="absolute top-[calc(100%+3px)] left-[80px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                        {(["MIP", "MinIP"] as const).map((opt) => (
                                                            <div
                                                                key={opt}
                                                                onClick={() => { setSelectedRenderMode(opt); handleThreeDDisplayModeChange(opt); setIsRenderModeOpen(false); }}
                                                                className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedRenderMode === opt ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                            >
                                                                {opt}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-start gap-2">
                                                <span className={`${VIEW_CONTROL_LABEL_CLASS} pt-1`}>{t("view.controls.thickness")}</span>
                                                <div className="flex-1 rounded-md border border-[#DCE6F2] bg-white px-2 py-1.5">
                                                    <div className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2">
                                                        <input
                                                            type="range"
                                                            min={1}
                                                            max={100}
                                                            step={1}
                                                            value={slabThickness}
                                                            onChange={(event) => setSlabThickness(Number(event.target.value))}
                                                            className="h-[18px] w-full max-w-[120px] accent-[#4D94FF]"
                                                        />
                                                        <span className="text-right text-[10px] font-black tabular-nums text-[#37474F]">
                                                            {slabThickness} mm
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            </PanelSection>

                                        </>
                                    )}

                                    {isFourDLungReconSeries && (
                                        <>
                                            <div className="flex items-center gap-2 relative">
                                                <span className={VIEW_CONTROL_LABEL_CLASS}>{t("view.controls.mode")}</span>
                                                <div
                                                    onClick={() => setIsBrowseModeOpen(!isBrowseModeOpen)}
                                                    className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between cursor-pointer transition-all ${isBrowseModeOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                                >
                                                    <span className="text-[12px] font-medium text-[#37474F] truncate">
                                                        {fourDBrowseMode === "phase" ? "4D Cine" : t("view.browse.normal")}
                                                    </span>
                                                    <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isBrowseModeOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                                </div>
                                                {isBrowseModeOpen && (
                                                    <div className="absolute top-[calc(100%+3px)] left-[80px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                        {([
                                                            { k: "phase" as const, l: "4D Cine" },
                                                        ].map(({ k, l }) => (
                                                            <div
                                                                key={k}
                                                                onClick={() => {
                                                                    if (fourDBrowseMode !== k) {
                                                                        setIsPlaying(false);
                                                                    }
                                                                    setFourDBrowseMode(k);
                                                                    if (k === "phase") {
                                                                        phaseCineDirectionRef.current = 1;
                                                                    }
                                                                    setIsBrowseModeOpen(false);
                                                                }}
                                                                className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${fourDBrowseMode === k ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                            >
                                                                {l}
                                                            </div>
                                                        )))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 relative">
                                                <span className={VIEW_CONTROL_LABEL_CLASS}>{t("view.controls.volumeRendering")}</span>
                                                <div
                                                    onClick={() => setIsLayoutOpen(!isLayoutOpen)}
                                                    className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between cursor-pointer transition-all ${isLayoutOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                                >
                                                    <span className="text-[12px] font-medium text-[#37474F] truncate">{phaseMipMode}</span>
                                                    <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isLayoutOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                                </div>
                                                {isLayoutOpen && (
                                                    <div className="absolute top-[calc(100%+3px)] left-[80px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                        {(["MIP", "MinIP", "Avg"] as const).map((opt) => (
                                                            <div
                                                                key={opt}
                                                                onClick={() => {
                                                                    setPhaseMipMode(opt);
                                                                    setIsLayoutOpen(false);
                                                                }}
                                                                className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${phaseMipMode === opt ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                                title={opt === "MIP" ? t("view.mip.mipTitle") : opt === "MinIP" ? t("view.mip.minipTitle") : t("view.mip.avgTitle")}
                                                            >
                                                                {opt}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-start gap-2">
                                                <span className={`${VIEW_CONTROL_LABEL_CLASS} pt-1`}>{t("view.controls.thickness")}</span>
                                                <div className="flex-1 rounded-md border border-[#DCE6F2] bg-white px-2 py-1.5">
                                                    <div className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2">
                                                        <input
                                                            type="range"
                                                            min={0}
                                                            max={100}
                                                            step={1}
                                                            value={slabThickness}
                                                            onChange={(event) => setSlabThickness(Number(event.target.value))}
                                                            className="h-[18px] w-full max-w-[120px] accent-[#4D94FF]"
                                                        />
                                                        <span className="text-right text-[10px] font-black tabular-nums text-[#37474F]">
                                                            {slabThickness} mm
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </aside>

                <div className="flex-1 min-w-0 flex flex-col overflow-hidden rounded-lg border border-[#B0C4DE]">
                <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className={`${viewportContainerClassName} relative`}>
                    {!hasLinkedImageSource && (
                        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#020617] px-10 text-center">
                            <div className="max-w-[460px] rounded-xl border border-slate-700 bg-slate-900/90 px-8 py-7 shadow-2xl">
                                <div className="text-[15px] font-black text-slate-100">{t("view.imageUnavailable.title")}</div>
                                <div className="mt-3 text-[12px] leading-relaxed text-slate-400">{t("view.imageUnavailable.body")}</div>
                                <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">{t("scanFlow.physicalGuide.referenceSimulated")}</div>
                            </div>
                        </div>
                    )}
                    {/* ── 3D MPR mode: full Cornerstone multi-planar viewport ── */}
                    {hasLinkedImageSource && !isTopogramSeries && hasMounted3D && (
                        <div className={`absolute inset-0 min-w-0 overflow-hidden ${imageMode === "3D" ? "visible pointer-events-auto" : "invisible pointer-events-none"}`}>
                            {isFourDLungReconSeries ? (
                                <CornerstoneMPRViewport
                                    ref={mprRef}
                                    imageUrls={fourDDicomImageUrls}
                                    preloadImageUrlsList={fourDAllPhaseDicomUrls}
                                    onStatusChange={handleViewerStatusChange}
                                    windowCenter={wl}
                                    windowWidth={ww}
                                    activeTool={mapCornerstoneTool(toolMode)}
                                    renderMode={phaseMipMode}
                                    layoutMode="three-up"
                                    slabThickness={slabThickness}
                                    showPhaseBadge={true}
                                    phaseBadgeLabel={fourDPhaseBadgeLabel}
                                    phaseOptions={fourDPhaseOptions}
                                    selectedPhaseIndex={selectedPhaseIndex}
                                    onPhaseChange={setSelectedPhaseIndex}
                                    activeOrientation={activeMprOrientation === "volume" ? "axial" : activeMprOrientation}
                                    onActiveOrientationChange={setActiveMprOrientation}
                                    showAnnotations={showAnnotations}
                                    stateKey={selectedSeriesId}
                                    onWindowLevelChange={(wc, wwidth) => {
                                        setDisplayWl(Math.round(wc));
                                        setDisplayWw(Math.round(wwidth));
                                        setWl(Math.round(wc));
                                        setWw(Math.round(wwidth));
                                    }}
                                    className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden"
                                />
                            ) : (
                                <CornerstoneMPRViewport
                                    ref={mprRef}
                                    imageUrls={seriesImageUrls}
                                    onStatusChange={handleViewerStatusChange}
                                    windowCenter={wl}
                                    windowWidth={ww}
                                    activeTool={mapCornerstoneTool(toolMode)}
                                    renderMode={threeDDisplayMode}
                                    layoutMode={selectedLayout === "mpr" ? "three-up" : "four-up"}
                                    volumePanelMode="volume3d"
                                    activeOrientation={activeMprOrientation}
                                    onActiveOrientationChange={setActiveMprOrientation}
                                    focusedPanel={focusedMprPanel}
                                    volumePreset={selectedVolumePreset}
                                    volumeSampleDistanceMultiplier={volumeSampleDistanceMultiplier}
                                    slabThickness={slabThickness}
                                    invert={isImageInverted}
                                    interpolationMode={selectedInterpolationMode}
                                    voiLutMode={selectedVoiLutMode}
                                    smoothing={imageSmoothing}
                                    sharpening={imageSharpening}
                                    showAnnotations={showAnnotations}
                                    stateKey={selectedSeriesId}
                                    onWindowLevelChange={(wc, wwidth) => {
                                        setDisplayWl(Math.round(wc));
                                        setDisplayWw(Math.round(wwidth));
                                        setWl(Math.round(wc));
                                        setWw(Math.round(wwidth));
                                    }}
                                    className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden"
                                />
                            )}
                        </div>
                    )}
                    {/* ── 2D mode: single Cornerstone stack viewport ── */}
                        <section
                            ref={viewportRef}
                            className={`absolute inset-0 min-w-0 bg-black overflow-hidden ${imageMode === "2D" || isTopogramSeries ? "visible pointer-events-auto" : "invisible pointer-events-none"} ${toolMode === "measure" ? "cursor-crosshair" : toolMode === "annotate" ? "cursor-cell" : "cursor-default"}`}
                        >
                            {/* Cornerstone DICOM viewer */}
                            {hasLinkedImageSource && <DicomViewer
                                ref={dicomViewerRef}
                                imageUrls={seriesImageUrls}
                                onStatusChange={handleViewerStatusChange}
                                currentImageIndex={currentSliceIndex}
                                onImageIndexChange={setSliceIndex}
                                activeTool={mapCornerstoneTool(toolMode)}
                                windowCenter={wl}
                                windowWidth={ww}
                                invert={isImageInverted}
                                interpolationMode={selectedInterpolationMode}
                                voiLutMode={selectedVoiLutMode}
                                smoothing={imageSmoothing}
                                sharpening={imageSharpening}
                                showAnnotations={showAnnotations}
                                stateKey={selectedSeriesId}
                                onWindowLevelChange={(wc, wwidth) => {
                                    setDisplayWl(Math.round(wc));
                                    setDisplayWw(Math.round(wwidth));
                                    setWl(Math.round(wc));
                                    setWw(Math.round(wwidth));
                                }}
                            />}
                            {hasLinkedImageSource && hasMultipleSlices && (
                            <div
                                className="absolute bottom-6 left-1/2 z-20 w-[320px] max-w-[36%] -translate-x-1/2 rounded-full border border-white/10 bg-[#0B1120]/75 px-3 py-2 shadow-2xl backdrop-blur"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <input
                                    type="range"
                                    min={0}
                                    max={Math.max(0, totalSlices - 1)}
                                    step={1}
                                    value={currentSliceIndex}
                                    onChange={handleSliceSliderChange}
                                    aria-label={t("view.sliceProgress", { current: currentSliceIndex + 1, total: totalSlices })}
                                    className="h-2 w-full cursor-pointer appearance-none rounded-full accent-[#4D94FF] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
                                    style={{
                                        background: `linear-gradient(to right, #4D94FF ${sliceProgressPercent}%, rgba(148,163,184,0.32) ${sliceProgressPercent}%)`,
                                    }}
                                />
                            </div>
                            )}
                            {/* ── Annotate click-intercept overlay ── */}
                            {toolMode === "annotate" && (
                                <div
                                    className="absolute inset-0 z-10 cursor-cell"
                                    onClick={(e) => {
                                        const rect = viewportRef.current?.getBoundingClientRect();
                                        if (!rect) return;
                                        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
                                        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
                                        const noteCount = annotations.filter(
                                            (a) => a.seriesId === selectedSeriesId && a.slice === sliceIndex && a.kind === "text" && a.mode === "2d"
                                        ).length;
                                        const text = window.prompt("请输入标注文字", `标注 ${noteCount + 1}`)?.trim();
                                        if (!text) return;
                                        setAnnotations((prev) => [
                                            ...prev,
                                            {
                                                id: `anno-text-${Date.now()}-${Math.random()}`,
                                                seriesId: selectedSeriesId,
                                                kind: "text" as const,
                                                slice: sliceIndex,
                                                x: xPct,
                                                y: yPct,
                                                text,
                                                mode: "2d" as const,
                                            },
                                        ]);
                                    }}
                                />
                            )}
                            {/* ── Text annotation label overlays ── */}
                            {showAnnotations && annotations
                                .filter((a): a is TextAnnotation => a.seriesId === selectedSeriesId && a.slice === sliceIndex && a.kind === "text" && a.mode === "2d")
                                .map((a) => (
                                    <div
                                        key={a.id}
                                        className={`absolute z-10 flex items-center gap-1 ${toolMode === "eraser" || toolMode === "annotate" ? "cursor-pointer" : "pointer-events-none"}`}
                                        style={{ left: `${a.x}%`, top: `${a.y}%`, transform: "translate(-50%, -50%)" }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (toolMode === "eraser") {
                                                setAnnotations((prev) => prev.filter((item) => item.id !== a.id));
                                                return;
                                            }
                                            if (toolMode === "annotate") {
                                                const text = window.prompt("请输入标注文字", a.text)?.trim();
                                                if (text) setAnnotations((prev) => prev.map((item) => item.id === a.id ? { ...item, text } : item));
                                            }
                                        }}
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#FFD54F] shrink-0" />
                                        <div className="bg-black/75 text-[#FFF8E1] text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap">
                                            {a.text}
                                        </div>
                                    </div>
                                ))}
                            {/* ── Corner DICOM overlays ── */}
                            <div className="absolute top-2 left-2 text-[10px] text-[#CFD8DC] font-mono leading-[1.35] pointer-events-none">
                                <div className="font-bold">{meta.patientName}</div>
                                <div>ID {meta.patientId} | {meta.patientSex} {meta.patientAge}</div>
                                <div>{meta.modality} | {meta.studyDate} {meta.studyTime}</div>
                            </div>
                            <div className="absolute top-2 right-2 text-[10px] text-[#CFD8DC] font-mono text-right leading-[1.35] pointer-events-none">
                                <div className="font-bold">{meta.seriesDescription}</div>
                                <div>
                                    Image {sliceIndex + 1}/{selectedSeries.count}
                                </div>
                                <div>KV {meta.kvp} | mAs {meta.mas}</div>
                            </div>
                            <div className="absolute bottom-2 left-2 text-[10px] text-[#CFD8DC] font-mono leading-[1.35] pointer-events-none">
                                <div>WW/WL {Math.round(displayWw)} / {Math.round(displayWl)}</div>
                                <div>Spacing {meta.pixelSpacing}</div>
                                <div>{meta.rows > 0 ? `${meta.rows} × ${meta.cols}` : "—"}</div>
                            </div>
                            <div className="absolute bottom-2 right-2 text-[10px] text-[#CFD8DC] font-mono text-right leading-[1.35] pointer-events-none">
                                <div>
                                    Slice {sliceIndex + 1}/{selectedSeries.count} | Thick {meta.thickness}
                                </div>
                                <div>Location {meta.sliceLocation}</div>
                                <div>{meta.institution} | {meta.manufacturer}</div>
                            </div>
                        </section>
                </div>
                <aside className="flex w-[96px] shrink-0 flex-col overflow-hidden border-l border-white/10 bg-[#0F172A]">
                    <div className="border-b border-white/10 px-2 py-2 text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[#60A5FA]">
                            {imageMode === "2D" ? "2D" : activeMprOrientation === "volume" ? threeDDisplayMode : activeMprOrientation}
                        </div>
                        <div className="mt-0.5 truncate text-[9px] font-bold text-white">
                            {([
                                ["browse", "层面浏览"], ["pan", "平移"], ["wl", "窗宽/窗位"], ["measure", "长度测量"],
                                ["annotate", "文字标注"], ["eraser", "删除标注"], ["crosshairs", "三平面定位"],
                                ["imageRotate", "图像旋转"], ["planeRotate", "切面旋转"], ["rotate3d", "三维旋转"],
                            ] as const).find(([mode]) => mode === toolMode)?.[1]}
                        </div>
                        <div className={`mx-auto mt-1 h-1.5 w-1.5 rounded-full ${viewerLoadStatus === "ready" ? "bg-emerald-400" : viewerLoadStatus === "loading" ? "animate-pulse bg-amber-400" : "bg-red-400"}`} />
                    </div>

                    <div
                        className="flex-1 touch-pan-y overflow-y-auto overscroll-contain px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <div className="flex flex-col items-center gap-1.5">
                            {([
                                { mode: "browse" as const, label: "层面浏览", icon: <ScanLine size={18} /> },
                                { mode: "pan" as const, label: "平移", icon: <Move size={18} /> },
                                { mode: "wl" as const, label: "窗宽/窗位", icon: <WindowLevelIcon size={18} /> },
                                { mode: "measure" as const, label: "长度测量", icon: <Ruler size={18} /> },
                                { mode: "annotate" as const, label: "文字标注", icon: <Pencil size={18} /> },
                                { mode: "eraser" as const, label: "删除标注", icon: <X size={18} /> },
                                { mode: "imageRotate" as const, label: "图像旋转", icon: <RotateCw size={18} /> },
                                { mode: "crosshairs" as const, label: "三平面定位", icon: <Crosshair size={18} /> },
                                { mode: "planeRotate" as const, label: "切面旋转", icon: <Orbit size={18} /> },
                                { mode: "rotate3d" as const, label: "三维旋转", icon: <Orbit size={18} /> },
                            ]).filter(({ mode }) => isToolSupportedInCurrentView(mode)).map(({ mode, label, icon }) => {
                                const active = toolMode === mode;
                                return (
                                    <button
                                        key={mode}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => {
                                            setToolMode(mode);
                                            lastToolByModeRef.current[imageMode] = mode;
                                            if (mode === "measure" || mode === "annotate") setShowAnnotations(true);
                                            if (mode === "planeRotate") showViewerNotice("拖动彩色参考线旋转 MPR 切面");
                                            if (mode === "imageRotate") showViewerNotice("仅旋转当前画面，不改变切面");
                                            if (mode === "rotate3d") showViewerNotice("拖动当前三维视口改变观察方向");
                                        }}
                                        className={`flex h-[50px] w-[72px] flex-col items-center justify-center rounded-[10px] border text-[9px] font-bold transition-colors ${active
                                            ? "border-[#60A5FA] bg-[#2563EB] text-white shadow-[0_0_12px_rgba(59,130,246,0.45)]"
                                            : "border-white/10 bg-white/5 text-[#CBD5E1] active:bg-white/15"
                                            }`}
                                    >
                                        {icon}
                                        <span className="mt-1 leading-none">{label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="my-2 h-px bg-white/10" />

                        <div className="grid grid-cols-2 gap-1">
                            <button
                                type="button"
                                aria-label="放大"
                                onClick={() => imageMode === "2D" ? dicomViewerRef.current?.zoomIn() : mprRef.current?.zoomIn()}
                                className="flex h-[44px] items-center justify-center rounded-lg bg-white/5 text-[#CBD5E1] ring-1 ring-white/10 active:bg-white/15"
                            ><ZoomIn size={18} /></button>
                            <button
                                type="button"
                                aria-label="缩小"
                                onClick={() => imageMode === "2D" ? dicomViewerRef.current?.zoomOut() : mprRef.current?.zoomOut()}
                                className="flex h-[44px] items-center justify-center rounded-lg bg-white/5 text-[#CBD5E1] ring-1 ring-white/10 active:bg-white/15"
                            ><ZoomOut size={18} /></button>
                            <button
                                type="button"
                                aria-label="上一层"
                                disabled={!canBrowseSlicesInActiveViewport || (imageMode === "2D" && !canPageBackward)}
                                onClick={() => handleSliceStep(-1)}
                                className="flex h-[44px] items-center justify-center rounded-lg bg-white/5 text-[#CBD5E1] ring-1 ring-white/10 active:bg-white/15 disabled:opacity-30"
                            ><ChevronUp size={18} /></button>
                            <button
                                type="button"
                                aria-label="下一层"
                                disabled={!canBrowseSlicesInActiveViewport || (imageMode === "2D" && !canPageForward)}
                                onClick={() => handleSliceStep(1)}
                                className="flex h-[44px] items-center justify-center rounded-lg bg-white/5 text-[#CBD5E1] ring-1 ring-white/10 active:bg-white/15 disabled:opacity-30"
                            ><ChevronDown size={18} /></button>
                        </div>

                        <div className="mt-1.5 flex flex-col gap-1.5">
                            <button
                                type="button"
                                onClick={handleFitActiveViewport}
                                className="flex h-[44px] items-center justify-center gap-1.5 rounded-lg bg-white/5 px-1 text-[9px] font-bold text-[#CBD5E1] ring-1 ring-white/10 active:bg-white/15"
                            ><Maximize size={16} /><span>适合窗口</span></button>
                            <button
                                type="button"
                                onClick={() => setShowAnnotations((current) => !current)}
                                className={`flex h-[44px] items-center justify-center gap-1.5 rounded-lg px-1 text-[9px] font-bold ring-1 ${showAnnotations ? "bg-white/5 text-[#CBD5E1] ring-white/10" : "bg-[#1E3A8A] text-[#93C5FD] ring-[#3B82F6]"}`}
                            >{showAnnotations ? <Eye size={16} /> : <EyeOff size={16} />}<span>{showAnnotations ? "隐藏标注" : "显示标注"}</span></button>
                            {isReaderModeSupported && (
                                <button
                                    type="button"
                                    onClick={() => setReaderMode((current) => !current)}
                                    className={`flex h-[44px] items-center justify-center gap-1.5 rounded-lg px-1 text-[9px] font-bold ring-1 ${isReaderModeActive ? "bg-[#2563EB] text-white ring-[#60A5FA]" : "bg-white/5 text-[#CBD5E1] ring-white/10"}`}
                                >{isReaderModeActive ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}<span>{isReaderModeActive ? "退出阅片" : "阅片模式"}</span></button>
                            )}
                            <button
                                type="button"
                                disabled={!isPlaybackEnabled}
                                onClick={() => setIsPlaying((current) => !current)}
                                className={`flex h-[44px] items-center justify-center gap-1.5 rounded-lg px-1 text-[9px] font-bold ring-1 disabled:opacity-30 ${isPlaying ? "bg-[#2563EB] text-white ring-[#60A5FA]" : "bg-white/5 text-[#CBD5E1] ring-white/10"}`}
                            >{isPlaying ? <Pause size={16} /> : <Play size={16} />}<span>{isPlaying ? "暂停" : isFourDLungReconSeries ? "播放时相" : "连续播放"}</span></button>
                            <button
                                type="button"
                                onClick={() => setIsResetSheetOpen(true)}
                                className="flex h-[44px] items-center justify-center gap-1.5 rounded-lg bg-white/5 px-1 text-[9px] font-bold text-[#CBD5E1] ring-1 ring-white/10 active:bg-white/15"
                            ><RefreshCw size={16} /><span>复位</span></button>
                        </div>

                        {isFourDLungReconSeries && (
                            <button
                                type="button"
                                onClick={cyclePhaseCineSpeed}
                                className="mt-1.5 flex h-[44px] w-full items-center justify-center rounded-lg bg-white/5 text-[10px] font-black text-white ring-1 ring-white/10"
                            >速度 {phaseCineSpeed}×</button>
                        )}
                    </div>
                </aside>

                <aside className="hidden w-[72px] bg-[#0F172A] border-l border-white/10 overflow-hidden shrink-0 flex-col">
                        <div className="flex-1 flex flex-col gap-1 p-2 pt-3" onPointerDown={(e) => e.stopPropagation()}>
                            {(["pan", "wl", "measure", "annotate", "crosshairs"] as const).map((mode, i) => {
                                const icons = [
                                    <Move size={20} strokeWidth={1.5} key="pan" />,
                                    <WindowLevelIcon size={20} key="window-level" />,
                                    <Ruler size={20} strokeWidth={1.5} key="ruler" />,
                                    <Pencil size={20} strokeWidth={1.5} key="pencil" />,
                                    <Crosshair size={20} strokeWidth={1.5} key="crosshairs" />,
                                ];
                                const titles = [
                                    t("view.tool.pan"),
                                    t("view.tool.windowLevel"),
                                    t("view.tool.measure"),
                                    t("view.tool.annotate"),
                                    t("view.tool.crosshairs"),
                                ];
                                const active = toolMode === mode;
                                const supported = isToolSupportedInCurrentView(mode);
                                return (
                                    <button
                                        key={mode}
                                        title={titles[i]}
                                        onClick={() => {
                                            if (!supported) return;
                                            setToolMode(mode);
                                        }}
                                        disabled={!supported}
                                        style={{
                                            width: "44px",
                                            height: "44px",
                                            borderRadius: "10px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            border: "none",
                                            cursor: supported ? "pointer" : "not-allowed",
                                            transition: "all 0.15s ease",
                                            background: active ? "#3B82F6" : "transparent",
                                            color: active ? "#ffffff" : supported ? "#94A3B8" : "#475569",
                                            boxShadow: active ? "0 0 15px rgba(59,130,246,0.55)" : "none",
                                            opacity: supported ? 1 : 0.45,
                                        }}
                                    >
                                        {icons[i]}
                                    </button>
                                );
                            })}

                            <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "4px 4px" }} />

                            {[
                                {
                                    key: "reader",
                                    title: isReaderModeActive ? t("view.tool.exitReaderMode") : t("view.tool.readerMode"),
                                    icon: isReaderModeActive ? <PanelLeftOpen size={20} strokeWidth={1.5} /> : <PanelLeftClose size={20} strokeWidth={1.5} />,
                                    action: () => setReaderMode((prev) => !prev),
                                    active: isReaderModeActive,
                                    disabled: !isReaderModeSupported,
                                },
                                {
                                    key: "zoom-in",
                                    title: t("view.tool.zoomIn"),
                                    icon: <ZoomIn size={20} strokeWidth={1.5} />,
                                    action: () => {
                                        if (imageMode === "2D") {
                                            dicomViewerRef.current?.zoomIn();
                                        } else {
                                            mprRef.current?.zoomIn();
                                        }
                                    },
                                },
                                {
                                    key: "zoom-out",
                                    title: t("view.tool.zoomOut"),
                                    icon: <ZoomOut size={20} strokeWidth={1.5} />,
                                    action: () => {
                                        if (imageMode === "2D") {
                                            dicomViewerRef.current?.zoomOut();
                                        } else {
                                            mprRef.current?.zoomOut();
                                        }
                                    },
                                },
                                {
                                    key: "fit",
                                    title: t("view.tool.fit"),
                                    icon: <Maximize size={20} strokeWidth={1.5} />,
                                    action: () => {
                                        if (imageMode === "2D") {
                                            dicomViewerRef.current?.fit();
                                        } else {
                                            mprRef.current?.resetAll();
                                        }
                                    },
                                },
                                {
                                    key: "reset",
                                    title: t("view.tool.reset"),
                                    icon: <RefreshCw size={20} strokeWidth={1.5} />,
                                    action: () => {
                                        if (imageMode === "2D") {
                                            dicomViewerRef.current?.reset();
                                            setWw(defaultWindowRef.current.ww);
                                            setWl(defaultWindowRef.current.wl);
                                            setDisplayWw(defaultWindowRef.current.ww);
                                            setDisplayWl(defaultWindowRef.current.wl);
                                        } else {
                                            mprRef.current?.resetAll();
                                            setWw(defaultWindowRef.current.ww);
                                            setWl(defaultWindowRef.current.wl);
                                            setDisplayWw(defaultWindowRef.current.ww);
                                            setDisplayWl(defaultWindowRef.current.wl);
                                        }
                                    },
                                },
                                {
                                    key: "play",
                                    title: !isPlaybackEnabled
                                        ? t("view.tool.playDisabled")
                                        : isPlaying
                                            ? isFourDLungReconSeries && fourDBrowseMode === "slice"
                                                ? t("view.tool.pauseSlice")
                                                : t("view.tool.pause")
                                            : isFourDLungReconSeries && fourDBrowseMode === "slice"
                                                ? t("view.tool.playSlice")
                                                : t("view.tool.play"),
                                    icon: isPlaying ? <Pause size={20} strokeWidth={1.5} /> : <Play size={20} strokeWidth={1.5} />,
                                    action: () => setIsPlaying((prev) => !prev),
                                    active: isPlaying,
                                },
                            ].map(({ key, title, icon, action, active, disabled: toolDisabled }) => {
                                const disabled = Boolean(toolDisabled) || (key === "play" && !isPlaybackEnabled);
                                return (
                                <button
                                    key={key}
                                    title={title}
                                    onClick={action}
                                    disabled={disabled}
                                    style={{
                                        width: "44px",
                                        height: "44px",
                                        borderRadius: "10px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        border: "none",
                                        cursor: disabled ? "not-allowed" : "pointer",
                                        transition: "all 0.15s ease",
                                        background: active ? "#3B82F6" : "transparent",
                                        color: active ? "#ffffff" : disabled ? "#475569" : "#94A3B8",
                                        boxShadow: active ? "0 0 15px rgba(59,130,246,0.55)" : "none",
                                        opacity: disabled ? 0.45 : 1,
                                    }}
                                >
                                    {icon}
                                </button>
                                );
                            })}

                            {!isFourDLungReconSeries && (
                                <div className="mt-auto flex flex-col items-center gap-[2px]">
                                    <button
                                        type="button"
                                        title={t("view.tool.previous")}
                                        aria-label={t("view.tool.previous")}
                                        disabled={isMprViewActive ? false : !canPageBackward}
                                        onClick={() => handleSliceStep(-1)}
                                        className="flex h-6 w-7 items-center justify-center rounded-md bg-white/5 text-[#94A3B8] ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[#475569] disabled:ring-white/5"
                                    >
                                        <ChevronUp size={13} strokeWidth={1.8} />
                                    </button>
                                    <button
                                        type="button"
                                        title={t("view.tool.next")}
                                        aria-label={t("view.tool.next")}
                                        disabled={isMprViewActive ? false : !canPageForward}
                                        onClick={() => handleSliceStep(1)}
                                        className="flex h-6 w-7 items-center justify-center rounded-md bg-white/5 text-[#94A3B8] ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[#475569] disabled:ring-white/5"
                                    >
                                        <ChevronDown size={13} strokeWidth={1.8} />
                                    </button>
                                </div>
                            )}

                            <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "4px 4px" }} />

                            {isFourDLungReconSeries && (
                                <button
                                    type="button"
                                    title={fourDBrowseMode === "phase" ? t("view.tool.speedPhase") : t("view.tool.speedBrowse")}
                                    onClick={cyclePhaseCineSpeed}
                                    className="flex h-[44px] w-[44px] flex-col items-center justify-center rounded-[10px] bg-white/5 text-[#94A3B8] ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white"
                                >
                                    <span className="text-[8px] leading-none uppercase tracking-[0.08em]">speed</span>
                                    <span className="mt-1 text-[13px] font-black leading-none text-white">{phaseCineSpeed}×</span>
                                </button>
                            )}
                        </div>
                    </aside>
                </div>
                </div>
            </main>

            {viewerNotice && (
                <div className="pointer-events-none absolute left-1/2 top-[82px] z-[90] -translate-x-1/2 rounded-full border border-[#93C5FD] bg-[#0F172A]/95 px-4 py-2 text-[11px] font-bold text-white shadow-xl">
                    {viewerNotice}
                </div>
            )}

            {isResetSheetOpen && !pendingReset && (
                <div className="absolute inset-0 z-[70] flex items-end justify-center bg-[#0F172A]/40 p-4" onPointerDown={() => setIsResetSheetOpen(false)}>
                    <div className="w-[620px] rounded-2xl border border-[#B7D5FF] bg-white p-4 shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <div className="text-[15px] font-black text-[#1E293B]">复位</div>
                                <div className="mt-0.5 text-[10px] text-[#64748B]">选择复位范围；任何复位都不会删除标注或切换序列。</div>
                            </div>
                            <button type="button" aria-label="关闭" onClick={() => setIsResetSheetOpen(false)} className="flex h-[44px] w-[44px] items-center justify-center rounded-xl bg-[#F1F5F9] text-[#475569]"><X size={20} /></button>
                        </div>
                        <div className={`grid gap-2 ${imageMode === "3D" ? "grid-cols-4" : "grid-cols-3"}`}>
                            <button type="button" onClick={handleResetCurrentView} className="min-h-[66px] rounded-xl border border-[#DCE6F2] bg-[#F8FAFC] px-3 text-left active:bg-[#DBEAFE]">
                                <div className="text-[11px] font-black text-[#1E293B]">复位当前视图</div>
                                <div className="mt-1 text-[9px] leading-[1.35] text-[#64748B]">恢复当前视口的位置、缩放和画面旋转</div>
                            </button>
                            <button type="button" onClick={handleRestoreDisplay} className="min-h-[66px] rounded-xl border border-[#DCE6F2] bg-[#F8FAFC] px-3 text-left active:bg-[#DBEAFE]">
                                <div className="text-[11px] font-black text-[#1E293B]">恢复显示参数</div>
                                <div className="mt-1 text-[9px] leading-[1.35] text-[#64748B]">恢复窗值、反色、平滑、锐化等设置</div>
                            </button>
                            {imageMode === "3D" && (
                                <button type="button" onClick={() => setPendingReset("planes")} className="min-h-[66px] rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 text-left active:bg-[#FEF3C7]">
                                    <div className="text-[11px] font-black text-[#92400E]">复位三维切面</div>
                                    <div className="mt-1 text-[9px] leading-[1.35] text-[#A16207]">恢复正交切面与中心定位</div>
                                </button>
                            )}
                            <button type="button" onClick={() => setPendingReset("all")} className="min-h-[66px] rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-3 text-left active:bg-[#FEE2E2]">
                                <div className="text-[11px] font-black text-[#991B1B]">全部复位</div>
                                <div className="mt-1 text-[9px] leading-[1.35] text-[#B91C1C]">恢复当前模式的布局、视图与显示参数</div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {pendingReset && (
                <div className="absolute inset-0 z-[80] flex items-center justify-center bg-[#0F172A]/55 p-4">
                    <div className="w-[420px] rounded-2xl border border-[#FCD34D] bg-white p-5 shadow-2xl">
                        <div className="text-[16px] font-black text-[#1E293B]">确认{pendingReset === "planes" ? "复位三维切面" : "全部复位"}？</div>
                        <div className="mt-2 text-[11px] leading-relaxed text-[#64748B]">
                            {pendingReset === "planes"
                                ? "轴状面、冠状面和矢状面将恢复默认正交关系，定位点回到初始位置。窗宽/窗位和标注保持不变。"
                                : "当前模式下的布局、视图、显示参数和空间位置将恢复默认。标注、选中序列和原始数据不会改变。"}
                        </div>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setPendingReset(null)} className="flex h-[52px] items-center justify-center gap-2 rounded-xl border border-[#CBD5E1] bg-white text-[12px] font-black text-[#475569]"><X size={18} />取消</button>
                            <button type="button" onClick={() => confirmReset(pendingReset)} className="flex h-[52px] items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-[12px] font-black text-white shadow-lg"><Check size={18} />确认复位</button>
                        </div>
                    </div>
                </div>
            )}

            {!isReaderModeActive && (
                <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10">
                    <div className="flex-1" />
                    <div className="flex-1" />
                    <div className="flex-1 flex justify-end">
                        <button
                            onClick={() => {
                                if (loadSelectedScanSessionId()) clearSelectedScanSessionId();
                                navigate("/patients", { replace: true, state: { backRoute: "/" } });
                            }}
                            className="flex items-center gap-2 px-10 h-[52px] bg-[#4D94FF] text-white font-bold rounded-md shadow-lg hover:bg-blue-600 transition-all uppercase text-[13px] active:scale-95"
                        >
                            {t("view.endExam")} <ChevronRight size={20} />
                        </button>
                    </div>
                </footer>
            )}

        </div>
    );
};


const Param = ({ label, value }: { label: string; value: string }) => (
    <div className="p-2 bg-white border border-[#B0C4DE]/30 rounded-md flex flex-col items-center justify-center shadow-sm min-h-[56px]">
        <span className="text-[8px] font-black uppercase text-[#90A4AE] tracking-tighter">{label}</span>
        <span className="text-[13px] font-black text-[#37474F] mt-1">{value}</span>
    </div>
);

const WindowValueStrip = ({ ww, wl, inline = false }: { ww: number | string; wl: number | string; inline?: boolean }) => (
    <div className={inline ? "contents" : "grid grid-cols-2 gap-2"}>
        <div className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <div className="text-[8px] font-black uppercase tracking-[0.12em] text-[#2563EB]">WW</div>
            <div className="mt-0.5 text-[14px] font-black tabular-nums text-[#1E3A8A]">{ww}</div>
        </div>
        <div className="rounded-md border border-[#A7F3D0] bg-[#ECFDF5] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <div className="text-[8px] font-black uppercase tracking-[0.12em] text-[#059669]">WL</div>
            <div className="mt-0.5 text-[14px] font-black tabular-nums text-[#064E3B]">{wl}</div>
        </div>
    </div>
);

const PanelSection = ({ title, children }: { title?: string; children: ReactNode }) => (
    <div className="flex flex-col gap-2 border-t border-[#DCE6F2] pt-2 first:border-t-0 first:pt-0">
        {title ? <div className="text-[10px] font-black uppercase tracking-wide text-[#78909C]">{title}</div> : null}
        {children}
    </div>
);

type OfflineReconParams = {
    thickness: string;
    spacing: string;
    kernel: string;
    fov: string;
    centerX: string;
    centerY: string;
    zStart: string;
    zEnd: string;
    matrix: "512" | "1024";
    metalArtifact: boolean;
    reconMode: string;
};

type OfflineReconPanelProps = {
    params: OfflineReconParams;
    setParams: (updater: (prev: OfflineReconParams) => OfflineReconParams) => void;
    isHelical: boolean;
    ww: number;
    wl: number;
    status: "idle" | "submitting" | "queued" | "running" | "done" | "failed";
    progress: number;
    message: string | null;
    isMatrixOpen: boolean;
    setIsMatrixOpen: (value: boolean) => void;
    onApply: () => void;
    t: (key: TranslationKey, values?: Record<string, string | number>) => string;
    hideWindowValue?: boolean;
};

const RECON_INPUT_CLASS =
    "h-[28px] w-full bg-white border border-[#DCE6F2] rounded-md px-2 text-[12px] font-medium text-[#37474F] focus:outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/20 disabled:bg-[#F1F5F9] disabled:text-[#94A3B8] disabled:cursor-not-allowed";
const RECON_FIELD_LABEL_CLASS = "text-[10px] font-bold text-[#546E7A]";

const OfflineReconField = ({
    label,
    children,
    hint,
}: {
    label: string;
    children: ReactNode;
    hint?: string;
}) => (
    <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
            <span className={RECON_FIELD_LABEL_CLASS}>{label}</span>
            {hint ? <span className="text-[9px] text-[#94A3B8] italic">{hint}</span> : null}
        </div>
        {children}
    </div>
);

const OfflineReconPanel = ({
    params,
    setParams,
    isHelical,
    ww,
    wl,
    status,
    progress,
    message,
    isMatrixOpen,
    setIsMatrixOpen,
    onApply,
    t,
    hideWindowValue = false,
}: OfflineReconPanelProps) => {
    const update = <K extends keyof OfflineReconParams>(key: K, value: OfflineReconParams[K]) =>
        setParams((prev) => ({ ...prev, [key]: value }));

    return (
        <div className="col-span-2 flex flex-col gap-2">
            <PanelSection>
                <div className="grid grid-cols-2 gap-2">
                    <OfflineReconField label={t("view.offlineRecon.thickness")}>
                        <input
                            type="text"
                            value={params.thickness}
                            onChange={(e) => update("thickness", e.target.value)}
                            className={RECON_INPUT_CLASS}
                        />
                    </OfflineReconField>

                    <OfflineReconField
                        label={t("view.offlineRecon.spacing")}
                        hint={isHelical ? undefined : t("view.offlineRecon.spacingHelicalOnly")}
                    >
                        <input
                            type="text"
                            value={params.spacing}
                            onChange={(e) => update("spacing", e.target.value)}
                            disabled={!isHelical}
                            className={RECON_INPUT_CLASS}
                        />
                    </OfflineReconField>

                    <OfflineReconField label={t("view.offlineRecon.kernel")}>
                        <input
                            type="text"
                            value={params.kernel}
                            onChange={(e) => update("kernel", e.target.value)}
                            className={RECON_INPUT_CLASS}
                        />
                    </OfflineReconField>

                    <OfflineReconField label={t("view.offlineRecon.fov")}>
                        <input
                            type="text"
                            value={params.fov}
                            onChange={(e) => update("fov", e.target.value)}
                            className={RECON_INPUT_CLASS}
                        />
                    </OfflineReconField>
                </div>

                <OfflineReconField label={t("view.offlineRecon.center")}>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="text"
                            value={params.centerX}
                            onChange={(e) => update("centerX", e.target.value)}
                            placeholder="X"
                            className={RECON_INPUT_CLASS}
                        />
                        <input
                            type="text"
                            value={params.centerY}
                            onChange={(e) => update("centerY", e.target.value)}
                            placeholder="Y"
                            className={RECON_INPUT_CLASS}
                        />
                    </div>
                </OfflineReconField>

                <div className="grid grid-cols-2 gap-2">
                    <OfflineReconField label={t("view.offlineRecon.zStart")}>
                        <input
                            type="text"
                            value={params.zStart}
                            onChange={(e) => update("zStart", e.target.value)}
                            className={RECON_INPUT_CLASS}
                        />
                    </OfflineReconField>
                    <OfflineReconField label={t("view.offlineRecon.zEnd")}>
                        <input
                            type="text"
                            value={params.zEnd}
                            onChange={(e) => update("zEnd", e.target.value)}
                            className={RECON_INPUT_CLASS}
                        />
                    </OfflineReconField>
                </div>

                <OfflineReconField label={t("view.offlineRecon.matrix")}>
                    <div className="relative">
                        <div
                            onClick={() => setIsMatrixOpen(!isMatrixOpen)}
                            className={`${RECON_INPUT_CLASS} flex items-center justify-between cursor-pointer`}
                        >
                            <span>{params.matrix}</span>
                            <ChevronDown
                                size={13}
                                className={`text-[#94A3B8] transition-transform ${isMatrixOpen ? "rotate-180 text-[#4D94FF]" : ""}`}
                            />
                        </div>
                        {isMatrixOpen && (
                            <div className="absolute top-[calc(100%+3px)] left-0 right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                {(["512", "1024"] as const).map((opt) => (
                                    <div
                                        key={opt}
                                        onClick={() => {
                                            update("matrix", opt);
                                            setIsMatrixOpen(false);
                                        }}
                                        className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${
                                            params.matrix === opt
                                                ? "bg-[#EBF3FF] text-[#4D94FF]"
                                                : "text-[#37474F] hover:bg-[#F5F5F5]"
                                        }`}
                                    >
                                        {opt}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </OfflineReconField>

                <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
                    <span className={RECON_FIELD_LABEL_CLASS}>{t("view.offlineRecon.metalArtifact")}</span>
                    <input
                        type="checkbox"
                        checked={params.metalArtifact}
                        onChange={(e) => update("metalArtifact", e.target.checked)}
                        className="h-4 w-4 accent-[#4D94FF]"
                    />
                </label>

                {!hideWindowValue && (
                    <OfflineReconField label={t("view.offlineRecon.windowValue")}>
                        <div className="rounded-md border border-[#B7D5FF] bg-[linear-gradient(135deg,#F0F7FF_0%,#F4FFFB_100%)] px-2.5 py-2 shadow-[0_8px_18px_-16px_rgba(37,99,235,0.75)]">
                            <WindowValueStrip ww={ww} wl={wl} />
                        </div>
                    </OfflineReconField>
                )}

                <button
                    type="button"
                    onClick={onApply}
                    disabled={["submitting", "queued", "running"].includes(status)}
                    className={`mt-2 h-[36px] rounded-md font-bold text-[12px] uppercase tracking-wider transition-all shadow-sm active:scale-[0.98] ${
                        ["submitting", "queued", "running"].includes(status)
                            ? "bg-[#CBD5E1] text-white cursor-not-allowed"
                            : status === "done"
                            ? "bg-[#43A047] text-white hover:bg-[#388E3C]"
                            : status === "failed"
                            ? "bg-[#EF5350] text-white hover:bg-[#E53935]"
                            : "bg-[#4D94FF] text-white hover:bg-blue-600"
                    }`}
                    title={t("view.offlineRecon.applyHint")}
                >
                    {status === "submitting"
                        ? t("view.offlineRecon.applySubmitting")
                        : status === "queued"
                        ? t("view.offlineRecon.applyQueued")
                        : status === "running"
                        ? t("view.offlineRecon.applyRunning")
                        : status === "done"
                        ? t("view.offlineRecon.applyDone")
                        : status === "failed"
                        ? t("view.offlineRecon.applyFailed")
                        : t("view.offlineRecon.apply")}
                </button>
                {(["submitting", "queued", "running"].includes(status) || message) && (
                    <FeedbackNotice
                        compact
                        tone={status === "failed" ? "error" : status === "done" ? "success" : "info"}
                        className="text-[10px]"
                    >
                        {["submitting", "queued", "running"].includes(status)
                            ? `${t("view.offlineRecon.progress")} ${Math.round(progress)}%`
                            : message}
                    </FeedbackNotice>
                )}
            </PanelSection>
        </div>
    );
};

const VIEW_CONTROL_LABEL_CLASS = "w-[72px] shrink-0 text-[10px] font-semibold leading-[1.1] text-[#546E7A]";

export default ViewScreen;
