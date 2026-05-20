import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Sun,
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
    Rotate3D,
    Maximize,
    RefreshCw,
    Play,
    Pause,
    Flame,
    Siren,
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import * as dicomParser from "dicom-parser";
import type { FourDPostScanState } from "../lib/fourDTypes";
import { loadSelectedScanWorkflowPlans } from "../lib/scanWorkflowSession";
import DicomViewer, { type DicomViewerHandle } from "../components/DicomViewer";
import NetworkStatusButton from "../components/NetworkStatusButton";
import PatientHeaderCard from "../components/PatientHeaderCard";
import SystemMenuButton from "../components/SystemMenuButton";
import CornerstoneMPRViewport, {
    type CornerstoneMPRHandle,
    type ObliqueAxis,
    type ObliqueConfig,
} from "../components/CornerstoneMPRViewport";
import {
    loadFourDManifest,
    type FourDManifest,
} from "../lib/fourDImageSource";
import {
    FOUR_D_DICOM_PHASE_COUNT,
    getFourDDicomSeriesUrls,
    type FourDDicomMpId,
} from "../lib/fourDDicomSource";
import {
    fetchSelectedScanSession,
    type ApiScanSessionDetail,
} from "../lib/scanSession";

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
    /** WW/WL preset applied when this series is selected */
    defaultWw?: number;
    defaultWl?: number;
    dicomBasePath?: string;
    dicomFilePrefix?: "image" | "lung";
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
type FourDBrowseMode = "phase" | "slice";
type PhaseCineSpeed = 0.5 | 1 | 2;
type PhaseCineMode = "forward" | "bounce";
const PHASE_CINE_SPEED_OPTIONS: readonly PhaseCineSpeed[] = [0.5, 1, 2] as const;
const FOUR_D_LUNG_DEFAULT_WINDOW = { ww: 1600, wl: -600 } as const;
const WINDOW_PRESETS = [
    { key: "lung", label: "Lung", ww: 1500, wl: -600 },
    { key: "bone", label: "Bone", ww: 2000, wl: 300 },
    { key: "tissue", label: "Tissue", ww: 400, wl: 40 },
    { key: "mediastinum", label: "Mediastinum", ww: 350, wl: 50 },
    { key: "brain", label: "Brain", ww: 80, wl: 40 },
] as const;

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

const LAYOUT_SPECS: Record<string, LayoutSpec> = {
    "多平面重建": {
        containerClassName: "flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A]",
        panels: {
            axial: DEFAULT_PANEL_CLASS,
            coronal: DEFAULT_PANEL_CLASS,
            sagittal: DEFAULT_PANEL_CLASS,
            volume: DEFAULT_PANEL_CLASS,
        },
    },
    "三维四窗": {
        containerClassName: "flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A]",
        panels: {
            axial: DEFAULT_PANEL_CLASS,
            coronal: DEFAULT_PANEL_CLASS,
            sagittal: DEFAULT_PANEL_CLASS,
            volume: DEFAULT_PANEL_CLASS,
        },
    },
    "三维主视图 (顶)": {
        containerClassName: "flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A]",
        panels: {
            axial: `${DEFAULT_PANEL_CLASS} hidden`,
            coronal: DEFAULT_PANEL_CLASS,
            sagittal: DEFAULT_PANEL_CLASS,
            volume: `${DEFAULT_PANEL_CLASS} col-span-2`,
        },
    },
    "轴状面主视图": {
        containerClassName: "flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A]",
        panels: {
            axial: `${DEFAULT_PANEL_CLASS} row-span-2`,
            coronal: DEFAULT_PANEL_CLASS,
            sagittal: DEFAULT_PANEL_CLASS,
            volume: HIDDEN_PANEL_CLASS,
        },
    },
    "仅三维视图": {
        containerClassName: "flex-1 min-w-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A]",
        panels: {
            axial: HIDDEN_PANEL_CLASS,
            coronal: HIDDEN_PANEL_CLASS,
            sagittal: HIDDEN_PANEL_CLASS,
            volume: `${DEFAULT_PANEL_CLASS} col-span-2 row-span-2`,
        },
    },
    "三维主视图 (右)": {
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
// Selected only when an active workflow plan has title "脑部螺旋" — see useIsBrainHelicalDemo.
const BRAIN_HELICAL_PROTOCOL_TITLE = "脑部螺旋";
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
        defaultWw: 100,
        defaultWl: 35,
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
        defaultWw: 100,
        defaultWl: 35,
    },
] as const;
const BRAIN_HELICAL_VIEW_TOPOGRAM = {
    seriesName: "topogram",
    count: 1,
    thickness: "2.0 mm",
    kV: "120",
    mAs: "50",
    fov: "500.0 mm",
    matrix: "512",
    kernel: "FL03",
    basePath: "/dicom-out/HeadStrokeDemo/Topogram",
};

const getSeriesDicomUrl = (
    sliceIndex: number,
    seriesType?: SeriesType,
    brainHelical?: boolean,
    series?: Pick<Series, "dicomBasePath" | "dicomFilePrefix">,
) => {
    if (series?.dicomBasePath) {
        const prefix = series.dicomFilePrefix === "lung" ? "1-" : "image-";
        return `${series.dicomBasePath}/${prefix}${String(sliceIndex + 1).padStart(3, "0")}.dcm`;
    }
    if (seriesType === "topogram") {
        if (brainHelical) {
            return `${BRAIN_HELICAL_VIEW_TOPOGRAM.basePath}/image-${String(sliceIndex + 1).padStart(3, "0")}.dcm`;
        }
        const imageNumber = REALISTIC_SCOUT_SERIES.firstImageNumber + sliceIndex;
        return `${REALISTIC_SCOUT_SERIES.basePath}/image-${String(imageNumber).padStart(6, "0")}.dcm`;
    }
    if (brainHelical) {
        return `${BRAIN_HELICAL_VIEW_SERIES.basePath}/image-${String(sliceIndex + 1).padStart(3, "0")}.dcm`;
    }
    return `${REAL_LUNG_SERIES.basePath}/1-${String(sliceIndex + 1).padStart(3, "0")}.dcm`;
};

type ViewerToolMode = "pan" | "wl" | "measure" | "annotate" | "eraser" | "rotate";

const mapCornerstoneTool = (toolMode: ViewerToolMode) => {
    if (toolMode === "pan") return "pan";
    if (toolMode === "wl") return "window";
    if (toolMode === "measure") return "ruler";
    if (toolMode === "eraser") return "eraser";
    if (toolMode === "annotate") return "annotate";
    if (toolMode === "rotate") return "rotate";
    return "window";
};

const getSeriesMidSliceIndex = (count: number) => Math.max(0, Math.floor(count / 2));

const parseDicomNumber = (value: string | undefined, fallback: number) => {
    if (!value) return fallback;
    const firstValue = value.split("\\")[0]?.trim();
    const parsed = Number(firstValue);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const isBrainHelicalName = (value: string | null | undefined) =>
    typeof value === "string" && value.includes(BRAIN_HELICAL_PROTOCOL_TITLE);

const isBrainHelicalScanSession = (session: ApiScanSessionDetail | null) => {
    if (!session) return false;
    return (
        session.acquisition_type === "regular" &&
        session.body_part.toLowerCase() === "head" &&
        (session.protocol_id === 1 || isBrainHelicalName(session.name) || isBrainHelicalName(session.session_name))
    );
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

    // ─── 4D 后处理状态 ────────────────────────────────────────────────────────
    const fourDState = location.state as (FourDPostScanState & { initialBrowseMode?: FourDBrowseMode }) | null;
    const isFourDEntry = !!fourDState?.scanResult;

    // ─── 脑部螺旋 demo 数据切换 ───────────────────────────────────────────────
    // Active only when the workflow plan title matches AND this is NOT a 4D entry,
    // so 4D 浏览路径完全不受影响。
    const isBrainHelicalWorkflow = useMemo(() => {
        if (isFourDEntry) return false;
        return loadSelectedScanWorkflowPlans().some((plan) => isBrainHelicalName(plan.title));
    }, [isFourDEntry]);
    // Scan session loaded from localStorage — MUST be declared before studyTree useMemo
    const [scanSession, setScanSession] = useState<ApiScanSessionDetail | null>(null);
    const isBrainHelicalDemo = isBrainHelicalWorkflow || (!isFourDEntry && isBrainHelicalScanSession(scanSession));
    const effectiveLungSeries = isBrainHelicalDemo ? BRAIN_HELICAL_VIEW_SERIES : REAL_LUNG_SERIES;
    /** "idle" → 非4D入口；"done" → 4D入口（相位筛选已在 PhaseFilterScreen 完成） */
    const fourDStage: "idle" | "done" = isFourDEntry ? "done" : "idle";
    const [, setViewerLoadStatus] = useState<"loading" | "ready" | "error">("ready");

    // Will be updated to the first session series when session loads
    const [selectedSeriesId, setSelectedSeriesId] = useState(isFourDEntry ? "4d-preview-recon" : effectiveLungSeries.seriesId);
    const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
    const [selectedFourDMpId, setSelectedFourDMpId] = useState<FourDDicomMpId>("MP1");
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
    // Currently-selected MPR panel for cine / paging. Defaults to axial — the
    // clinical primary view. Clicking another panel updates this.
    const [activeMprOrientation, setActiveMprOrientation] = useState<"axial" | "coronal" | "sagittal">("axial");
    const [sliceIndex, setSliceIndex] = useState(Math.floor(effectiveLungSeries.count / 2));
    const [toolMode, setToolMode] = useState<ViewerToolMode>("wl");
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

    // ─── 4D manifest (pre-rendered WebP dataset) ───────────────────────────
    const [fourDManifest, setFourDManifest] = useState<FourDManifest | null>(null);
    const [fourDManifestError, setFourDManifestError] = useState<string | null>(null);

    // ─── Live clock ───────────────────────────────────────────────────────────
    const buildClock = () => {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
    };
    const buildDate = () => {
        const now = new Date();
        const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        return `${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
    };
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

    const [selectedLayout, setSelectedLayout] = useState("三维四窗");
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
    const [volumeQuality, setVolumeQuality] = useState<"performance" | "standard" | "fine">("standard");
    const [obliqueEnabled, setObliqueEnabled] = useState(false);
    const [obliquePanel, setObliquePanel] = useState<ObliqueConfig["panel"]>("axial");
    const [obliqueAxis, setObliqueAxis] = useState<ObliqueAxis>("horizontal");
    const [obliqueAngleDeg, setObliqueAngleDeg] = useState(0);
    const [isBrowseModeOpen, setIsBrowseModeOpen] = useState(false);
    const [isLayoutOpen, setIsLayoutOpen] = useState(false);
    const [isVolumePresetOpen, setIsVolumePresetOpen] = useState(false);
    const [isRenderModeOpen, setIsRenderModeOpen] = useState(false);
    const [isWindowPresetOpen, setIsWindowPresetOpen] = useState(false);
    const [isVoiLutOpen, setIsVoiLutOpen] = useState(false);
    const [isInterpolationOpen, setIsInterpolationOpen] = useState(false);
    const [isVolumeQualityOpen, setIsVolumeQualityOpen] = useState(false);
    const currentLayoutSpec = useMemo(
        () => LAYOUT_SPECS[selectedLayout] ?? LAYOUT_SPECS["三维四窗"],
        [selectedLayout]
    );
    const volumeSampleDistanceMultiplier =
        volumeQuality === "performance" ? 1.25 : volumeQuality === "fine" ? 0.45 : 0.75;
    const obliqueConfig = useMemo<ObliqueConfig>(
        () => ({
            enabled: obliqueEnabled,
            panel: obliquePanel,
            axis: obliqueAxis,
            angleDeg: obliqueAngleDeg,
        }),
        [obliqueAngleDeg, obliqueAxis, obliqueEnabled, obliquePanel]
    );
    const applyWindowPreset = useCallback((preset: typeof WINDOW_PRESETS[number]) => {
        setWw(preset.ww);
        setWl(preset.wl);
        setDisplayWw(preset.ww);
        setDisplayWl(preset.wl);
        defaultWindowRef.current = { ww: preset.ww, wl: preset.wl };
    }, []);
    const activeWindowPreset = useMemo(
        () =>
            WINDOW_PRESETS.find(
                (preset) =>
                    Math.round(displayWw) === preset.ww &&
                    Math.round(displayWl) === preset.wl
            ),
        [displayWw, displayWl]
    );

    // ─── Build study tree from scan session (falls back to static DICOM data) ──
    const studyTree = useMemo<Study[]>(() => {
        // ── Helper: build an ImageItem array using the static DICOM dataset ──────
        const makeImages = (count: number, prefix: string): ImageItem[] =>
            Array.from({ length: count }, (_, i) => ({ id: `${prefix}-img-${i + 1}`, name: `Image ${i + 1}` }));
        const makeBrainHelicalSeries = (seriesType: SeriesType): Series[] =>
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
                images: makeImages(series.count, series.seriesId),
                defaultWw: series.defaultWw,
                defaultWl: series.defaultWl,
                dicomBasePath: series.basePath,
                dicomFilePrefix: "image",
            }));

        // ── Static fallback (no scan session in localStorage) ────────────────────
        if (!scanSession) {
            if (isFourDEntry) {
                return [{
                    id: "study-4d-preview",
                    name: "4D CT",
                    scanGroups: [{
                        id: "4d-preview-group",
                        label: "4D Reconstruction",
                        type: "4d" as SeriesType,
                        series: [{
                            id: "4d-preview-recon",
                            name: "4D Lung Reconstruction",
                            count: REAL_LUNG_SERIES.count,
                            kernel: "B41 Soft Tissue",
                            thickness: "3.0 mm",
                            kV: "120",
                            mAs: "Auto",
                            fov: "402.0 mm",
                            matrix: "512",
                            seriesType: "4d" as SeriesType,
                            images: makeImages(REAL_LUNG_SERIES.count, "4d-preview"),
                            defaultWw: 400,
                            defaultWl: 40,
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
                scanGroups.push({
                    id: `group-${s.id}`,
                    label: s.series_label || "定位像",
                    type,
                    series: [{
                        id: `${prefix}-topo`,
                        name: s.series_label || "定位像",
                        count: REALISTIC_SCOUT_SERIES.count,
                        kernel: REALISTIC_SCOUT_SERIES.kernel,
                        thickness: REALISTIC_SCOUT_SERIES.thickness,
                        kV: p ? String(p.kv) : "—",
                        mAs: p ? String(p.ma) : "—",
                        fov: p ? `${p.fov} mm` : "—",
                        matrix: REALISTIC_SCOUT_SERIES.matrix,
                        seriesType: type,
                        images: makeImages(REALISTIC_SCOUT_SERIES.count, `${prefix}-topo`),
                        defaultWw: 500,
                        defaultWl: 50,
                    }],
                });
            } else {
                // helical / axial / 4d — leaf items are the recon series
                const p = s.helical_param ?? s.axial_param;
                const leafSeries: Series[] = isBrainHelicalDemo && type !== "4d"
                    ? makeBrainHelicalSeries(type)
                    : s.recon_series.map((r) => ({
                    id: `${prefix}-recon${r.id}`,
                    name: r.recon_name,
                    count: effectiveLungSeries.count,
                    kernel: r.kernel,
                    thickness: `${r.slice_thickness} mm`,
                    kV: p ? String(p.kv) : "—",
                    mAs: p ? ((p as { auto_ma?: boolean }).auto_ma ? "Auto" : String(p.ma)) : "—",
                    fov: p ? `${p.fov} mm` : "—",
                    matrix: String(r.matrix),
                    seriesType: type,
                    images: makeImages(effectiveLungSeries.count, `${prefix}-recon${r.id}`),
                    defaultWw: r.window_width,
                    defaultWl: r.window_level,
                    }));

                // Fallback if protocol has no recon series configured
                if (leafSeries.length === 0) {
                    leafSeries.push({
                        id: `${prefix}-scan`,
                        name: s.series_label,
                        count: effectiveLungSeries.count,
                        kernel: "—",
                        thickness: p ? `${(p as { slice_thickness?: number }).slice_thickness ?? "—"} mm` : "—",
                        kV: p ? String(p.kv) : "—",
                        mAs: p ? ((p as { auto_ma?: boolean }).auto_ma ? "Auto" : String(p.ma)) : "—",
                        fov: p ? `${p.fov} mm` : "—",
                        matrix: "512",
                        seriesType: type,
                        images: makeImages(effectiveLungSeries.count, `${prefix}-scan`),
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
            name: scanSession.name || "扫描序列",
            scanGroups,
        }];
    }, [scanSession, isFourDEntry, isBrainHelicalDemo, effectiveLungSeries]);

    const seriesList = studyTree.flatMap((study) => study.scanGroups.flatMap((g) => g.series));
    // Guard: if seriesList is somehow still empty, always fall back to the static series
    const safeSeriesList = seriesList.length > 0 ? seriesList : [{
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
    }];
    const selectedSeries =
        safeSeriesList.find((s) => s.id === selectedSeriesId) ??
        (isFourDEntry
            ? safeSeriesList.find((series) => series.seriesType === "4d") ??
              safeSeriesList.find((series) => series.seriesType !== "topogram")
            : undefined) ??
        safeSeriesList[0];
    const isTopogramSeries = selectedSeries.seriesType === "topogram";
    const isFourDLungReconSeries = selectedSeries.seriesType === "4d";
    const totalSlices = selectedSeries.count;
    // Single flex container for both 2D and 3D; CornerstoneMPRViewport does its own 2×2 panel grid internally.
    // (`currentLayoutSpec` retained for backward-compatible dropdown but no longer drives the outer layout —
    //  the Cornerstone MPR implementation doesn't honor per-panel spans anyway.)
    void currentLayoutSpec;
    const viewportContainerClassName =
        "flex-1 min-w-0 flex overflow-hidden bg-[#0F172A]";
    const isMprViewActive = !isTopogramSeries && imageMode === "3D";
    const isFourDMprViewActive = isMprViewActive && isFourDLungReconSeries;
    const isFourDPlaybackBlockedByReview = isFourDLungReconSeries && isFourDEntry && fourDStage !== "done";
    const fourDDicomImageUrls = useMemo(
        () => (
            isFourDLungReconSeries
                ? getFourDDicomSeriesUrls(selectedPhaseIndex, selectedFourDMpId)
                : []
        ),
        [isFourDLungReconSeries, selectedFourDMpId, selectedPhaseIndex]
    );
    // Full list of DICOM URL-sets (one per phase) so the MPR viewport can
    // warm every phase's cornerstone volume in the background — makes the
    // first phase-cine loop cache-hot instead of cold-fetching 99 slices
    // on every tick.
    const fourDAllPhaseDicomUrls = useMemo(
        () => (
            isFourDLungReconSeries
                ? Array.from(
                    { length: FOUR_D_DICOM_PHASE_COUNT },
                    (_, phase) => getFourDDicomSeriesUrls(phase, selectedFourDMpId),
                )
                : undefined
        ),
        [isFourDLungReconSeries, selectedFourDMpId],
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
    const isPlaybackEnabled = !isFourDPlaybackBlockedByReview && hasMultipleSlices;
    const isToolSupportedInCurrentView = (mode: ViewerToolMode) => {
        if (!isMprViewActive) return mode !== "rotate";
        if (isFourDMprViewActive) {
            return mode === "pan" || mode === "wl" || mode === "measure" || mode === "annotate";
        }
        return mode === "pan" || mode === "wl" || mode === "measure" || mode === "annotate" || mode === "eraser" || mode === "rotate";
    };



    const clampSliceIndex = useCallback((value: number) => Math.max(0, Math.min(totalSlices - 1, value)), [totalSlices]);
    const currentSliceIndex = clampSliceIndex(sliceIndex);
    const sliceProgressPercent = totalSlices > 1 ? (currentSliceIndex / (totalSlices - 1)) * 100 : 0;
    const canPageBackward = currentSliceIndex > 0;
    const canPageForward = currentSliceIndex < totalSlices - 1;
    const handleSliceStep = useCallback((delta: number) => {
        if (imageMode === "3D") {
            mprRef.current?.advanceSlice(activeMprOrientation, delta);
            return;
        }
        setSliceIndex((prev) => clampSliceIndex(prev + delta));
    }, [clampSliceIndex, imageMode, activeMprOrientation]);
    const handleSliceSliderChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        setSliceIndex(clampSliceIndex(Number(event.target.value)));
    }, [clampSliceIndex]);

    useEffect(() => {
        if (imageMode !== "2D") return;

        const frameId = window.requestAnimationFrame(() => {
            dicomViewerRef.current?.fit();
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [imageMode, selectedSeriesId]);

    useEffect(() => {
        setSelectedPhaseIndex(0);
        setSelectedFourDMpId("MP1");
        setIsPlaying(false);
        setFourDBrowseMode("phase");
        phaseCineDirectionRef.current = 1;
    }, [fourDState?.initialBrowseMode, selectedSeriesId]);

    // When a 4D series is active, auto-switch to 3D MPR layout; leave non-4D workflows untouched.
    useEffect(() => {
        if (!isFourDLungReconSeries) return;
        setImageMode("3D");
        setSelectedLayout("多平面重建");
        setPhaseMipMode("Avg");
    }, [isFourDLungReconSeries]);

    useEffect(() => {
        if (!isTopogramSeries) return;
        setImageMode("2D");
    }, [isTopogramSeries]);

    useEffect(() => {
        if (!isFourDLungReconSeries) return;
        setSelectedLayout("多平面重建");
        setPhaseMipMode("Avg");
        setWw(FOUR_D_LUNG_DEFAULT_WINDOW.ww);
        setWl(FOUR_D_LUNG_DEFAULT_WINDOW.wl);
        setDisplayWw(FOUR_D_LUNG_DEFAULT_WINDOW.ww);
        setDisplayWl(FOUR_D_LUNG_DEFAULT_WINDOW.wl);
        defaultWindowRef.current = FOUR_D_LUNG_DEFAULT_WINDOW;
    }, [isFourDLungReconSeries]);

    useEffect(() => {
        if (isToolSupportedInCurrentView(toolMode)) return;
        setToolMode("wl");
    }, [toolMode, isMprViewActive, isFourDMprViewActive]);

    // Load 4D manifest + preload each phase's first frame (mid axial) so
    // phase switches are instant after the initial warm.
    useEffect(() => {
        if (!isFourDLungReconSeries) return;
        if (fourDManifest || fourDManifestError) return;
        let cancelled = false;
        loadFourDManifest()
            .then((m) => {
                if (cancelled) return;
                setFourDManifest(m);
                // Apply baseline lung window from manifest
                setWw(m.defaults.ww);
                setWl(m.defaults.wl);
                setDisplayWw(m.defaults.ww);
                setDisplayWl(m.defaults.wl);
            })
            .catch((err: Error) => {
                if (!cancelled) setFourDManifestError(err.message);
            });
        return () => {
            cancelled = true;
        };
    }, [isFourDLungReconSeries, fourDManifest, fourDManifestError]);

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
    }, [scanSession, isFourDEntry, isBrainHelicalDemo, preferredSeriesForFourDEntry]);

    const seriesImageUrls = useMemo(
        () => Array.from({ length: totalSlices }, (_, index) => getSeriesDicomUrl(index, selectedSeries.seriesType, isBrainHelicalDemo, selectedSeries)),
        [selectedSeries, totalSlices, isBrainHelicalDemo]
    );
    const handleSeriesSelect = useCallback((seriesId: string) => {
        const nextSeries = safeSeriesList.find((series) => series.id === seriesId);
        setSelectedSeriesId(seriesId);
        setSliceIndex(getSeriesMidSliceIndex(nextSeries?.count ?? effectiveLungSeries.count));
        dicomWindowAppliedSeriesRef.current = null;
        setAnnotations([]);
        setDraftMeasure(null);
        measureStartRef.current = null;
        dragRef.current = { dragging: false, x: 0, y: 0 };
        // Apply WW/WL preset defined by the series/recon
        if (nextSeries?.defaultWw != null && nextSeries?.defaultWl != null) {
            setWw(nextSeries.defaultWw);
            setWl(nextSeries.defaultWl);
            setDisplayWw(nextSeries.defaultWw);
            setDisplayWl(nextSeries.defaultWl);
            defaultWindowRef.current = { ww: nextSeries.defaultWw, wl: nextSeries.defaultWl };
        }
    }, [effectiveLungSeries.count, safeSeriesList]);
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
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        fetchSelectedScanSession({ preferCache: true })
            .then((session) => {
                if (!session) return;
                setScanSession(session);
            })
            .catch(() => { /* fall back to static data */ });
    }, []);

    useEffect(() => {
        const loadSlice = async () => {
            try {
                const url = getSeriesDicomUrl(clampSliceIndex(sliceIndex), selectedSeries.seriesType, isBrainHelicalDemo, selectedSeries);
                const response = await fetch(url);
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
                // Keep UI alive if one slice fails.
                console.error(error);
            }
        };

        loadSlice();
    }, [sliceIndex, selectedSeriesId, selectedSeries.id, selectedSeries.name, selectedSeries.seriesType, selectedSeries.count, clampSliceIndex, isBrainHelicalDemo]);

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
                mprRef.current?.advanceSlice(activeMprOrientation, 1);
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
        <div className="relative flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl">
            <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <PatientHeaderCard
                        name={meta.patientName !== "N/A" ? meta.patientName : null}
                        patientId={meta.patientId !== "N/A" ? meta.patientId : null}
                    />
                    <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
                        <div className="flex items-center gap-1 text-[11px] font-bold"><img src="/机床.svg" alt="机床" className="w-3.5 h-3.5" /><span>0</span></div>
                        <div className="flex items-center gap-1 text-[11px] font-bold"><img src="/机架角度.svg" alt="机架角度" className="w-3.5 h-3.5" /><span>0</span></div>
                        <div className="flex items-center gap-1 text-[11px] font-bold"><img src="/球管.svg" alt="球管" className="w-3.5 h-3.5" /><span>0%</span></div>
                    </div>
                </div>

                <div className="text-center">
                    <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">{clockStr}</div>
                    <div className="text-[12px] text-[#546E7A] font-medium mt-1 uppercase opacity-80">{dateStr}</div>
                </div>

                <div className="flex items-center gap-5 pr-2">
                    <div className="p-1 text-[#D32F2F] cursor-pointer hover:opacity-70"><Siren size={30} strokeWidth={1.8} /></div>
                    <NetworkStatusButton />
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Sun size={24} />
                    </div>
                    <SystemMenuButton iconSize={24} badgeCount={10} />
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden p-2 gap-2">
                <aside className="w-[240px] bg-white rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden shrink-0">
                    <div className="h-[44px] bg-[#F8FAFC] border-b border-[#EEF2F9] px-3 flex items-center gap-2">
                        <Layers3 size={14} className="text-[#4D94FF]" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-[#37474F]">图像序列</span>
                    </div>

                    <div className="h-[220px] overflow-y-auto p-2 border-b border-[#EEF2F9]">
                        {studyTree.map((study) => (
                            <div key={study.id} className="mb-1">
                                {/* ── Protocol / Session name ── */}
                                <div className="px-2 py-1.5 flex items-center gap-1.5">
                                    <span className="text-[10px] font-black text-[#546E7A] uppercase tracking-wide">{study.name}</span>
                                </div>

                                {/* ── Scan acquisition groups ── */}
                                {study.scanGroups.map((group) => {
                                    const typeLabel: Record<SeriesType, string> = {
                                        topogram: "定位", helical: "螺旋", axial: "轴扫", "4d": "4D", static: "序列",
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
                                                    <div className="text-[10px] text-[#78909C] mt-0.5">{s.count} images</div>
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
                            <span className="text-[11px] font-black uppercase tracking-wider text-[#37474F]">PARAMS</span>
                        </div>
                        {!isFourDLungReconSeries && !isTopogramSeries ? (
                            <div className="flex items-center gap-1 rounded-full border border-[#DCE6F2] bg-[#F1F5F9] p-[3px] shadow-sm overflow-hidden">
                                {(["2D", "3D"] as const).map((mode) => {
                                    const active = imageMode === mode;
                                    return (
                                        <button
                                            key={mode}
                                            onClick={() => setImageMode(mode)}
                                            className={`min-w-[40px] h-[24px] px-2 rounded-full text-[10px] font-black transition-all ${active
                                                ? "bg-white text-[#4D94FF] shadow-[0_2px_4px_rgba(0,0,0,0.05)] border border-[#DCE6F2]/50"
                                                : "text-[#94A3B8] hover:text-[#4D94FF]"
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
                                <div className="col-span-2 flex flex-col gap-2">
                                    <PanelSection title="显示">
                                    <div className="rounded-md border border-[#DCE6F2] bg-white px-2.5 py-2 shadow-sm">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-[9px] font-black uppercase text-[#90A4AE]">WW</span>
                                                <span className="text-[13px] font-black tabular-nums text-[#37474F]">{Math.round(displayWw)}</span>
                                            </div>
                                            <div className="h-5 w-px bg-[#E2E8F0]" />
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-[9px] font-black uppercase text-[#90A4AE]">WL</span>
                                                <span className="text-[13px] font-black tabular-nums text-[#37474F]">{Math.round(displayWl)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 relative">
                                        <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">窗模板</span>
                                        <div
                                            onClick={() => {
                                                setIsWindowPresetOpen(!isWindowPresetOpen);
                                                setIsVoiLutOpen(false);
                                                setIsInterpolationOpen(false);
                                                setIsVolumePresetOpen(false);
                                                setIsRenderModeOpen(false);
                                                setIsVolumeQualityOpen(false);
                                            }}
                                            className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isWindowPresetOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                        >
                                            <span className="text-[12px] font-medium text-[#37474F] truncate">
                                                {activeWindowPreset ? activeWindowPreset.label : "Custom"}
                                            </span>
                                            <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isWindowPresetOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                        </div>
                                        {isWindowPresetOpen && (
                                            <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                {WINDOW_PRESETS.map((preset) => {
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
                                    <DisplayControls
                                        selectedVoiLutMode={selectedVoiLutMode}
                                        setSelectedVoiLutMode={setSelectedVoiLutMode}
                                        selectedInterpolationMode={selectedInterpolationMode}
                                        setSelectedInterpolationMode={setSelectedInterpolationMode}
                                        isImageInverted={isImageInverted}
                                        setIsImageInverted={setIsImageInverted}
                                        imageSmoothing={imageSmoothing}
                                        setImageSmoothing={setImageSmoothing}
                                        imageSharpening={imageSharpening}
                                        setImageSharpening={setImageSharpening}
                                        isVoiLutOpen={isVoiLutOpen}
                                        setIsVoiLutOpen={setIsVoiLutOpen}
                                        isInterpolationOpen={isInterpolationOpen}
                                        setIsInterpolationOpen={setIsInterpolationOpen}
                                        closeOtherMenus={() => {
                                            setIsWindowPresetOpen(false);
                                            setIsVolumePresetOpen(false);
                                            setIsRenderModeOpen(false);
                                            setIsVolumeQualityOpen(false);
                                        }}
                                    />
                                    </PanelSection>
                                </div>
                            ) : (
                                <div className="col-span-2 flex flex-col gap-2">
                                    {/* Layout Dropdown */}
                                    <div className="hidden items-center gap-2 relative">
                                        <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">布局</span>
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
                                                    {selectedLayout}
                                                </span>
                                                <ChevronDown size={13} className={`text-[#4D94FF] transition-transform shrink-0 ml-1 ${isLayoutOpen ? 'rotate-180' : ''}`} />
                                            </div>
                                        )}
                                        {isLayoutOpen && isFourDLungReconSeries && (
                                            <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                {(["MIP", "MinIP", "Avg"] as const).map((opt) => (
                                                    <div
                                                        key={opt}
                                                        onClick={() => {
                                                            setPhaseMipMode(opt);
                                                            setIsLayoutOpen(false);
                                                        }}
                                                        className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${phaseMipMode === opt ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                        title={opt === "MIP" ? "最大密度投影 - 肿瘤包络 / ITV" : opt === "MinIP" ? "最小密度投影 - 气道 / 低密度结构" : "10 相位平均"}
                                                    >
                                                        {opt}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {isLayoutOpen && !isFourDLungReconSeries && (
                                            <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                {[
                                                    "多平面重建",
                                                    "三维四窗",
                                                    "三维主视图 (顶)",
                                                    "轴状面主视图",
                                                    "仅三维视图",
                                                    "三维主视图 (右)"
                                                ].map((opt) => (
                                                    <div
                                                        key={opt}
                                                        onClick={() => { setSelectedLayout(opt); setIsLayoutOpen(false); }}
                                                        className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedLayout === opt ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                    >
                                                        {opt}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Volume Rendering Preset Dropdown */}
                                    {!isFourDLungReconSeries && (
                                        <>
                                            <PanelSection title="显示">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <Param label="WW" value={String(Math.round(displayWw))} />
                                                    <Param label="WL" value={String(Math.round(displayWl))} />
                                                </div>
                                                <div className="flex items-center gap-2 relative">
                                                    <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">窗值曲线</span>
                                                    <div
                                                        onClick={() => {
                                                            setIsVoiLutOpen(!isVoiLutOpen);
                                                            setIsInterpolationOpen(false);
                                                            setIsVolumePresetOpen(false);
                                                            setIsRenderModeOpen(false);
                                                            setIsVolumeQualityOpen(false);
                                                        }}
                                                        className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isVoiLutOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                                    >
                                                        <span className="text-[12px] font-medium text-[#37474F] truncate">
                                                            {selectedVoiLutMode === "SIGMOID" ? "Sigmoid" : selectedVoiLutMode === "LINEAR_EXACT" ? "Linear Exact" : "Linear"}
                                                        </span>
                                                        <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isVoiLutOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                                    </div>
                                                    {isVoiLutOpen && (
                                                        <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                            {([
                                                                { value: "LINEAR" as const, label: "Linear" },
                                                                { value: "LINEAR_EXACT" as const, label: "Linear Exact" },
                                                                { value: "SIGMOID" as const, label: "Sigmoid" },
                                                            ]).map((opt) => (
                                                                <div
                                                                    key={opt.value}
                                                                    onClick={() => { setSelectedVoiLutMode(opt.value); setIsVoiLutOpen(false); }}
                                                                    className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedVoiLutMode === opt.value ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                                >
                                                                    {opt.label}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 relative">
                                                    <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">插值</span>
                                                    <div
                                                        onClick={() => {
                                                            setIsInterpolationOpen(!isInterpolationOpen);
                                                            setIsVoiLutOpen(false);
                                                            setIsVolumePresetOpen(false);
                                                            setIsRenderModeOpen(false);
                                                            setIsVolumeQualityOpen(false);
                                                        }}
                                                        className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isInterpolationOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                                    >
                                                        <span className="text-[12px] font-medium text-[#37474F] truncate">
                                                            {selectedInterpolationMode === "FAST_LINEAR" ? "Fast Linear" : selectedInterpolationMode === "NEAREST" ? "Nearest" : "Linear"}
                                                        </span>
                                                        <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isInterpolationOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                                    </div>
                                                    {isInterpolationOpen && (
                                                        <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                            {([
                                                                { value: "LINEAR" as const, label: "Linear" },
                                                                { value: "NEAREST" as const, label: "Nearest" },
                                                                { value: "FAST_LINEAR" as const, label: "Fast Linear" },
                                                            ]).map((opt) => (
                                                                <div
                                                                    key={opt.value}
                                                                    onClick={() => { setSelectedInterpolationMode(opt.value); setIsInterpolationOpen(false); }}
                                                                    className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedInterpolationMode === opt.value ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                                >
                                                                    {opt.label}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between rounded-md border border-[#DCE6F2] bg-white px-2 py-1.5">
                                                    <span className="text-[11px] font-semibold text-[#546E7A]">反相</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={isImageInverted}
                                                        onChange={(event) => setIsImageInverted(event.target.checked)}
                                                        className="h-4 w-4 accent-[#4D94FF]"
                                                    />
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0 pt-1">平滑</span>
                                                    <div className="flex-1 rounded-md border border-[#DCE6F2] bg-white px-2 py-1.5">
                                                        <div className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-2">
                                                            <input type="range" min={0} max={1} step={0.05} value={imageSmoothing} onChange={(event) => setImageSmoothing(Number(event.target.value))} className="h-[18px] w-full max-w-[120px] accent-[#4D94FF]" />
                                                            <span className="text-right text-[10px] font-black tabular-nums text-[#37474F]">{imageSmoothing.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0 pt-1">锐化</span>
                                                    <div className="flex-1 rounded-md border border-[#DCE6F2] bg-white px-2 py-1.5">
                                                        <div className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-2">
                                                            <input type="range" min={0} max={1} step={0.05} value={imageSharpening} onChange={(event) => setImageSharpening(Number(event.target.value))} className="h-[18px] w-full max-w-[120px] accent-[#4D94FF]" />
                                                            <span className="text-right text-[10px] font-black tabular-nums text-[#37474F]">{imageSharpening.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </PanelSection>

                                            <PanelSection title="体绘制">
                                            <div className="flex items-center gap-2 relative">
                                                <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">体绘制</span>
                                                <div
                                                    onClick={() => {
                                                        setIsVolumePresetOpen(!isVolumePresetOpen);
                                                        setIsRenderModeOpen(false);
                                                        setIsVoiLutOpen(false);
                                                        setIsInterpolationOpen(false);
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
                                                    <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 max-h-[260px] overflow-y-auto bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1">
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
                                                <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">采样质量</span>
                                                <div
                                                    onClick={() => {
                                                        setIsVolumeQualityOpen(!isVolumeQualityOpen);
                                                        setIsVolumePresetOpen(false);
                                                        setIsRenderModeOpen(false);
                                                        setIsVoiLutOpen(false);
                                                        setIsInterpolationOpen(false);
                                                    }}
                                                    className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isVolumeQualityOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                                >
                                                    <span className="text-[12px] font-medium text-[#37474F] truncate">
                                                        {volumeQuality === "performance" ? "性能" : volumeQuality === "fine" ? "精细" : "标准"}
                                                    </span>
                                                    <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isVolumeQualityOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                                </div>
                                                {isVolumeQualityOpen && (
                                                    <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                        {([
                                                            { value: "performance" as const, label: "性能" },
                                                            { value: "standard" as const, label: "标准" },
                                                            { value: "fine" as const, label: "精细" },
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

                                            <PanelSection title="投影">

                                            <div className="flex items-center gap-2 relative">
                                                <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">投影模式</span>
                                                <div
                                                    onClick={() => {
                                                        setIsRenderModeOpen(!isRenderModeOpen);
                                                        setIsVolumePresetOpen(false);
                                                        setIsVoiLutOpen(false);
                                                        setIsInterpolationOpen(false);
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
                                                    <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                        {(["MIP", "MinIP"] as const).map((opt) => (
                                                            <div
                                                                key={opt}
                                                                onClick={() => { setSelectedRenderMode(opt); setIsRenderModeOpen(false); }}
                                                                className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedRenderMode === opt ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                            >
                                                                {opt}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-start gap-2">
                                                <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0 pt-1">厚度</span>
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

                                            <PanelSection title="斜切">
                                                <div className="flex items-center justify-between rounded-md border border-[#DCE6F2] bg-white px-2 py-1.5">
                                                    <span className="text-[11px] font-semibold text-[#546E7A]">启用斜切</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={obliqueEnabled}
                                                        onChange={(event) => setObliqueEnabled(event.target.checked)}
                                                        className="h-4 w-4 accent-[#FB923C]"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-3 gap-1">
                                                    {([
                                                        { value: "axial" as const, label: "Ax" },
                                                        { value: "coronal" as const, label: "Co" },
                                                        { value: "sagittal" as const, label: "Sa" },
                                                    ]).map((opt) => (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            onClick={() => setObliquePanel(opt.value)}
                                                            className={`h-[30px] rounded-md border text-[11px] font-black transition-colors ${
                                                                obliquePanel === opt.value
                                                                    ? "border-[#FB923C] bg-[#FFF7ED] text-[#C2410C]"
                                                                    : "border-[#DCE6F2] bg-white text-[#546E7A] hover:border-[#FB923C]/50"
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="grid grid-cols-2 gap-1">
                                                    {([
                                                        { value: "horizontal" as const, label: "水平轴" },
                                                        { value: "vertical" as const, label: "垂直轴" },
                                                    ]).map((opt) => (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            onClick={() => setObliqueAxis(opt.value)}
                                                            className={`h-[30px] rounded-md border text-[11px] font-bold transition-colors ${
                                                                obliqueAxis === opt.value
                                                                    ? "border-[#FB923C] bg-[#FFF7ED] text-[#C2410C]"
                                                                    : "border-[#DCE6F2] bg-white text-[#546E7A] hover:border-[#FB923C]/50"
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0 pt-1">角度</span>
                                                    <div className="flex-1 rounded-md border border-[#DCE6F2] bg-white px-2 py-1.5">
                                                        <div className="grid grid-cols-[minmax(0,1fr)_46px] items-center gap-2">
                                                            <input
                                                                type="range"
                                                                min={-45}
                                                                max={45}
                                                                step={1}
                                                                value={obliqueAngleDeg}
                                                                onChange={(event) => setObliqueAngleDeg(Number(event.target.value))}
                                                                className="h-[18px] w-full max-w-[120px] accent-[#FB923C]"
                                                            />
                                                            <span className="text-right text-[10px] font-black tabular-nums text-[#37474F]">
                                                                {obliqueAngleDeg}°
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setObliqueEnabled(false);
                                                        setObliqueAngleDeg(0);
                                                    }}
                                                    className="h-[30px] rounded-md border border-[#DCE6F2] bg-white text-[11px] font-bold text-[#546E7A] transition-colors hover:border-[#FB923C]/50 hover:text-[#C2410C]"
                                                >
                                                    复位
                                                </button>
                                            </PanelSection>
                                        </>
                                    )}

                                    {isFourDLungReconSeries && (
                                        <>
                                            <div className="flex items-center gap-2 relative">
                                                <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">模式</span>
                                                <div
                                                    onClick={() => setIsBrowseModeOpen(!isBrowseModeOpen)}
                                                    className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between cursor-pointer transition-all ${isBrowseModeOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                                >
                                                    <span className="text-[12px] font-medium text-[#37474F] truncate">
                                                        {fourDBrowseMode === "phase" ? "4D Cine" : "常规浏览"}
                                                    </span>
                                                    <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isBrowseModeOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                                </div>
                                                {isBrowseModeOpen && (
                                                    <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
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
                                                <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">体绘制</span>
                                                <div
                                                    onClick={() => setIsLayoutOpen(!isLayoutOpen)}
                                                    className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between cursor-pointer transition-all ${isLayoutOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                                >
                                                    <span className="text-[12px] font-medium text-[#37474F] truncate">{phaseMipMode}</span>
                                                    <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isLayoutOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                                </div>
                                                {isLayoutOpen && (
                                                    <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                        {(["MIP", "MinIP", "Avg"] as const).map((opt) => (
                                                            <div
                                                                key={opt}
                                                                onClick={() => {
                                                                    setPhaseMipMode(opt);
                                                                    setIsLayoutOpen(false);
                                                                }}
                                                                className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${phaseMipMode === opt ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                                title={opt === "MIP" ? "最大密度投影 - 肿瘤包络 / ITV" : opt === "MinIP" ? "最小密度投影 - 气道 / 低密度结构" : "10 相位平均"}
                                                            >
                                                                {opt}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-start gap-2">
                                                <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0 pt-1">厚度</span>
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
                <div className={viewportContainerClassName}>
                    {/* ── 3D MPR mode: full Cornerstone multi-planar viewport ── */}
                    {!isTopogramSeries && imageMode === "3D" && (
                        <div className="relative flex-1 min-w-0 overflow-hidden">
                            {isFourDLungReconSeries ? (
                                <CornerstoneMPRViewport
                                    ref={mprRef}
                                    imageUrls={fourDDicomImageUrls}
                                    preloadImageUrlsList={fourDAllPhaseDicomUrls}
                                    onStatusChange={setViewerLoadStatus}
                                    windowCenter={wl}
                                    windowWidth={ww}
                                    activeTool={mapCornerstoneTool(toolMode)}
                                    renderMode={(phaseMipMode === "Avg" ? "MPR" : phaseMipMode) as 'MPR' | 'MIP' | 'VR' | 'MinIP'}
                                    layoutMode="three-up"
                                    slabThickness={slabThickness}
                                    showPhaseBadge={true}
                                    phaseBadgeLabel={fourDPhaseBadgeLabel}
                                    phaseOptions={fourDPhaseOptions}
                                    selectedPhaseIndex={selectedPhaseIndex}
                                    onPhaseChange={setSelectedPhaseIndex}
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
                                    onStatusChange={setViewerLoadStatus}
                                    windowCenter={wl}
                                    windowWidth={ww}
                                    activeTool={mapCornerstoneTool(toolMode)}
                                    renderMode={selectedRenderMode}
                                    layoutMode="four-up"
                                    volumePanelMode="volume3d"
                                    activeOrientation={activeMprOrientation}
                                    onActiveOrientationChange={setActiveMprOrientation}
                                    volumePreset={selectedVolumePreset}
                                    volumeSampleDistanceMultiplier={volumeSampleDistanceMultiplier}
                                    slabThickness={slabThickness}
                                    oblique={obliqueConfig}
                                    onObliquePanelChange={setObliquePanel}
                                    onObliqueAngleChange={setObliqueAngleDeg}
                                    invert={isImageInverted}
                                    interpolationMode={selectedInterpolationMode}
                                    voiLutMode={selectedVoiLutMode}
                                    smoothing={imageSmoothing}
                                    sharpening={imageSharpening}
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
                    {(imageMode === "2D" || isTopogramSeries) && (
                        <section
                            ref={viewportRef}
                            className={`flex-1 min-w-0 bg-black overflow-hidden relative ${toolMode === "measure" ? "cursor-crosshair" : toolMode === "annotate" ? "cursor-cell" : "cursor-default"}`}
                        >
                            {/* Cornerstone DICOM viewer */}
                            <DicomViewer
                                ref={dicomViewerRef}
                                imageUrls={seriesImageUrls}
                                onStatusChange={setViewerLoadStatus}
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
                                onWindowLevelChange={(wc, wwidth) => {
                                    setDisplayWl(Math.round(wc));
                                    setDisplayWw(Math.round(wwidth));
                                    setWl(Math.round(wc));
                                    setWw(Math.round(wwidth));
                                }}
                            />
                            {hasMultipleSlices && (
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
                                    aria-label={`切片进度 ${currentSliceIndex + 1}/${totalSlices}`}
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
                                            (a) => a.slice === sliceIndex && a.kind === "text" && a.mode === "2d"
                                        ).length;
                                        setAnnotations((prev) => [
                                            ...prev,
                                            {
                                                id: `anno-text-${Date.now()}-${Math.random()}`,
                                                kind: "text" as const,
                                                slice: sliceIndex,
                                                x: xPct,
                                                y: yPct,
                                                text: `Note ${noteCount + 1}`,
                                                mode: "2d" as const,
                                            },
                                        ]);
                                    }}
                                />
                            )}
                            {/* ── Text annotation label overlays ── */}
                            {annotations
                                .filter((a): a is TextAnnotation => a.slice === sliceIndex && a.kind === "text" && a.mode === "2d")
                                .map((a) => (
                                    <div
                                        key={a.id}
                                        className={`absolute z-10 flex items-center gap-1 ${toolMode === "eraser" ? "cursor-pointer" : "pointer-events-none"}`}
                                        style={{ left: `${a.x}%`, top: `${a.y}%`, transform: "translate(-50%, -50%)" }}
                                        onClick={(e) => {
                                            if (toolMode !== "eraser") return;
                                            e.stopPropagation();
                                            setAnnotations((prev) => prev.filter((item) => item.id !== a.id));
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
                    )}
                </div>
                <aside className="w-[72px] bg-[#0F172A] border-l border-white/10 overflow-hidden shrink-0 flex flex-col">
                        <div className="flex-1 flex flex-col gap-1 p-2 pt-3" onPointerDown={(e) => e.stopPropagation()}>
                            {(["pan", "wl", "measure", "annotate", "rotate"] as const).map((mode, i) => {
                                const icons = [
                                    <Move size={20} strokeWidth={1.5} key="pan" />,
                                    <WindowLevelIcon size={20} key="window-level" />,
                                    <Ruler size={20} strokeWidth={1.5} key="ruler" />,
                                    <Pencil size={20} strokeWidth={1.5} key="pencil" />,
                                    <Rotate3D size={20} strokeWidth={1.5} key="rotate-3d" />,
                                ];
                                const titles = ["移动", "窗宽/窗位", "测量", "标注", "3D旋转"];
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
                                    key: "zoom-in",
                                    title: "Zoom In",
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
                                    title: "Zoom Out",
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
                                    title: "Fit to Screen",
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
                                    title: "Reset",
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
                                        ? "Play (available after phase review)"
                                        : isPlaying
                                            ? isFourDLungReconSeries && fourDBrowseMode === "slice"
                                                ? "暂停切片浏览"
                                                : "Pause"
                                            : isFourDLungReconSeries && fourDBrowseMode === "slice"
                                                ? "播放切片浏览"
                                                : "Play",
                                    icon: isPlaying ? <Pause size={20} strokeWidth={1.5} /> : <Play size={20} strokeWidth={1.5} />,
                                    action: () => setIsPlaying((prev) => !prev),
                                    active: isPlaying,
                                },
                            ].map(({ key, title, icon, action, active }) => {
                                const disabled = key === "play" && !isPlaybackEnabled;
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

                            <div className="mt-auto flex flex-col items-center gap-[2px]">
                                <button
                                    type="button"
                                    title="上一张"
                                    aria-label="上一张"
                                    disabled={isMprViewActive ? false : !canPageBackward}
                                    onClick={() => handleSliceStep(-1)}
                                    className="flex h-6 w-7 items-center justify-center rounded-md bg-white/5 text-[#94A3B8] ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[#475569] disabled:ring-white/5"
                                >
                                    <ChevronUp size={13} strokeWidth={1.8} />
                                </button>
                                <button
                                    type="button"
                                    title="下一张"
                                    aria-label="下一张"
                                    disabled={isMprViewActive ? false : !canPageForward}
                                    onClick={() => handleSliceStep(1)}
                                    className="flex h-6 w-7 items-center justify-center rounded-md bg-white/5 text-[#94A3B8] ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[#475569] disabled:ring-white/5"
                                >
                                    <ChevronDown size={13} strokeWidth={1.8} />
                                </button>
                            </div>

                            <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "4px 4px" }} />

                            {isFourDLungReconSeries && (
                                <button
                                    type="button"
                                    title={`${fourDBrowseMode === "phase" ? "相位速度" : "浏览速度"}（点击切换）`}
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

            <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10">
                <div className="flex-1" />
                <div className="flex-1" />
                <div className="flex-1 flex justify-end">
                    <button
                        onClick={() => navigate("/patients", { replace: true, state: { backRoute: "/" } })}
                        className="flex items-center gap-2 px-10 h-[52px] bg-[#4D94FF] text-white font-bold rounded-md shadow-lg hover:bg-blue-600 transition-all uppercase text-[13px] active:scale-95"
                    >
                        结束检查 <ChevronRight size={20} />
                    </button>
                </div>
            </footer>
        </div>
    );
};

const Param = ({ label, value }: { label: string; value: string }) => (
    <div className="p-2 bg-white border border-[#B0C4DE]/30 rounded-md flex flex-col items-center justify-center shadow-sm min-h-[56px]">
        <span className="text-[8px] font-black uppercase text-[#90A4AE] tracking-tighter">{label}</span>
        <span className="text-[13px] font-black text-[#37474F] mt-1">{value}</span>
    </div>
);

const PanelSection = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="flex flex-col gap-2 border-t border-[#DCE6F2] pt-2 first:border-t-0 first:pt-0">
        <div className="text-[10px] font-black uppercase tracking-wide text-[#78909C]">{title}</div>
        {children}
    </div>
);

type DisplayControlsProps = {
    selectedVoiLutMode: "LINEAR" | "LINEAR_EXACT" | "SIGMOID";
    setSelectedVoiLutMode: (value: "LINEAR" | "LINEAR_EXACT" | "SIGMOID") => void;
    selectedInterpolationMode: "LINEAR" | "NEAREST" | "FAST_LINEAR";
    setSelectedInterpolationMode: (value: "LINEAR" | "NEAREST" | "FAST_LINEAR") => void;
    isImageInverted: boolean;
    setIsImageInverted: (value: boolean) => void;
    imageSmoothing: number;
    setImageSmoothing: (value: number) => void;
    imageSharpening: number;
    setImageSharpening: (value: number) => void;
    isVoiLutOpen: boolean;
    setIsVoiLutOpen: (value: boolean) => void;
    isInterpolationOpen: boolean;
    setIsInterpolationOpen: (value: boolean) => void;
    closeOtherMenus: () => void;
};

const DisplayControls = ({
    selectedVoiLutMode,
    setSelectedVoiLutMode,
    selectedInterpolationMode,
    setSelectedInterpolationMode,
    isImageInverted,
    setIsImageInverted,
    imageSmoothing,
    setImageSmoothing,
    imageSharpening,
    setImageSharpening,
    isVoiLutOpen,
    setIsVoiLutOpen,
    isInterpolationOpen,
    setIsInterpolationOpen,
    closeOtherMenus,
}: DisplayControlsProps) => (
    <>
        <div className="flex items-center gap-2 relative">
            <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">窗值曲线</span>
            <div
                onClick={() => {
                    setIsVoiLutOpen(!isVoiLutOpen);
                    setIsInterpolationOpen(false);
                    closeOtherMenus();
                }}
                className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isVoiLutOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
            >
                <span className="text-[12px] font-medium text-[#37474F] truncate">
                    {selectedVoiLutMode === "SIGMOID" ? "Sigmoid" : selectedVoiLutMode === "LINEAR_EXACT" ? "Linear Exact" : "Linear"}
                </span>
                <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isVoiLutOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
            </div>
            {isVoiLutOpen && (
                <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                    {([
                        { value: "LINEAR" as const, label: "Linear" },
                        { value: "LINEAR_EXACT" as const, label: "Linear Exact" },
                        { value: "SIGMOID" as const, label: "Sigmoid" },
                    ]).map((opt) => (
                        <div key={opt.value} onClick={() => { setSelectedVoiLutMode(opt.value); setIsVoiLutOpen(false); }} className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedVoiLutMode === opt.value ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}>
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
        <div className="flex items-center gap-2 relative">
            <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">插值</span>
            <div
                onClick={() => {
                    setIsInterpolationOpen(!isInterpolationOpen);
                    setIsVoiLutOpen(false);
                    closeOtherMenus();
                }}
                className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isInterpolationOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
            >
                <span className="text-[12px] font-medium text-[#37474F] truncate">
                    {selectedInterpolationMode === "FAST_LINEAR" ? "Fast Linear" : selectedInterpolationMode === "NEAREST" ? "Nearest" : "Linear"}
                </span>
                <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isInterpolationOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
            </div>
            {isInterpolationOpen && (
                <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                    {([
                        { value: "LINEAR" as const, label: "Linear" },
                        { value: "NEAREST" as const, label: "Nearest" },
                        { value: "FAST_LINEAR" as const, label: "Fast Linear" },
                    ]).map((opt) => (
                        <div key={opt.value} onClick={() => { setSelectedInterpolationMode(opt.value); setIsInterpolationOpen(false); }} className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedInterpolationMode === opt.value ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}>
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
        <div className="flex items-center justify-between rounded-md border border-[#DCE6F2] bg-white px-2 py-1.5">
            <span className="text-[11px] font-semibold text-[#546E7A]">反相</span>
            <input type="checkbox" checked={isImageInverted} onChange={(event) => setIsImageInverted(event.target.checked)} className="h-4 w-4 accent-[#4D94FF]" />
        </div>
        <div className="flex items-start gap-2">
            <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0 pt-1">平滑</span>
            <div className="flex-1 rounded-md border border-[#DCE6F2] bg-white px-2 py-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-2">
                    <input type="range" min={0} max={1} step={0.05} value={imageSmoothing} onChange={(event) => setImageSmoothing(Number(event.target.value))} className="h-[18px] w-full max-w-[120px] accent-[#4D94FF]" />
                    <span className="text-right text-[10px] font-black tabular-nums text-[#37474F]">{imageSmoothing.toFixed(2)}</span>
                </div>
            </div>
        </div>
        <div className="flex items-start gap-2">
            <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0 pt-1">锐化</span>
            <div className="flex-1 rounded-md border border-[#DCE6F2] bg-white px-2 py-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-2">
                    <input type="range" min={0} max={1} step={0.05} value={imageSharpening} onChange={(event) => setImageSharpening(Number(event.target.value))} className="h-[18px] w-full max-w-[120px] accent-[#4D94FF]" />
                    <span className="text-right text-[10px] font-black tabular-nums text-[#37474F]">{imageSharpening.toFixed(2)}</span>
                </div>
            </div>
        </div>
    </>
);

export default ViewScreen;
