import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    User,
    Settings,
    Sun,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Layers3,
    SlidersHorizontal,
    ZoomIn,
    ZoomOut,
    Move,
    Ruler,
    Pencil,
    Maximize,
    RefreshCw,
    Play,
    Pause,
    Flame,
    Network,
    Siren,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import * as dicomParser from "dicom-parser";
import { hasPhaseConflicts, type FourDPostScanState } from "../lib/fourDTypes";
import DicomViewer, { type DicomViewerHandle } from "../components/DicomViewer";
import CornerstoneMPRViewport, { type CornerstoneMPRHandle } from "../components/CornerstoneMPRViewport";
import FourDMprGrid, { type FourDMprGridHandle } from "../components/FourDMprGrid";
import {
    getFourDImageUrl,
    loadFourDManifest,
    type FourDManifest,
} from "../lib/fourDImageSource";
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
type VolumeData = {
    rows: number;
    cols: number;
    depth: number;
    hu: Float32Array;
    pixelSpacingX: number;
    pixelSpacingY: number;
    sliceSpacing: number;
};
type PanelId = "axial" | "coronal" | "sagittal" | "volume";
type LayoutSpec = {
    containerClassName: string;
    panels: Record<PanelId, string>;
};
type FourDBrowseMode = "phase" | "slice";
type PhaseCineSpeed = 0.5 | 1 | 2;
type PhaseCineMode = "forward" | "bounce";
const PHASE_CINE_SPEED_OPTIONS: readonly PhaseCineSpeed[] = [0.5, 1, 2] as const;

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

const getSeriesDicomUrl = (sliceIndex: number, seriesType?: SeriesType) => {
    if (seriesType === "topogram") {
        const imageNumber = REALISTIC_SCOUT_SERIES.firstImageNumber + sliceIndex;
        return `${REALISTIC_SCOUT_SERIES.basePath}/image-${String(imageNumber).padStart(6, "0")}.dcm`;
    }
    return `${REAL_LUNG_SERIES.basePath}/1-${String(sliceIndex + 1).padStart(3, "0")}.dcm`;
};

type ViewerToolMode = "pan" | "wl" | "measure" | "annotate" | "eraser";

const mapCornerstoneTool = (toolMode: ViewerToolMode) => {
    if (toolMode === "pan") return "pan";
    if (toolMode === "wl") return "window";
    if (toolMode === "measure") return "ruler";
    if (toolMode === "eraser") return "eraser";
    if (toolMode === "annotate") return "annotate";
    return "window";
};

const getSeriesMidSliceIndex = (count: number) => Math.max(0, Math.floor(count / 2));

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
    const shouldShowSliceLoadingBridge = false;

    /** "idle" → 非4D入口/等待图像加载；"review" → 相位审核弹窗；"done" → 审核完成 */
    const [fourDStage, setFourDStage] = useState<"idle" | "phaseLoading" | "reviewReady" | "review" | "done">(
        isFourDEntry ? (fourDState?.initialBrowseMode === "phase" ? "done" : "phaseLoading") : "idle"
    );
    const [, setViewerLoadStatus] = useState<"loading" | "ready" | "error">("ready");
    const handleFourDPhaseGridComplete = useCallback(() => {
        if (!isFourDEntry || !fourDState?.scanResult) return;
        setViewerLoadStatus("ready");
        setFourDStage(hasPhaseConflicts(fourDState.scanResult) ? "reviewReady" : "done");
    }, [fourDState, isFourDEntry]);
    const handleAdvancedProcessing = useCallback(() => {
        navigate("/image-load", { state: fourDState ?? undefined });
    }, [fourDState, navigate]);
    const handleFourDSliceLoadComplete = useCallback(() => {
        if (!isFourDEntry || fourDStage !== "phaseLoading") return;
        navigate("/image-load", { state: fourDState ?? undefined });
    }, [fourDStage, fourDState, isFourDEntry, navigate]);

    // Will be updated to the first session series when session loads
    const [selectedSeriesId, setSelectedSeriesId] = useState(isFourDEntry ? "4d-preview-recon" : REAL_LUNG_SERIES.seriesId);
    const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
    const [fourDBrowseMode, setFourDBrowseMode] = useState<FourDBrowseMode>(fourDState?.initialBrowseMode ?? "slice");
    const [sliceCineTick, setSliceCineTick] = useState(0);
    const [phaseCineSpeed, setPhaseCineSpeed] = useState<PhaseCineSpeed>(1); // multiplier; 1× = 500 ms/phase
    const [phaseCineMode] = useState<PhaseCineMode>("forward");
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
    const [sliceIndex, setSliceIndex] = useState(Math.floor(REAL_LUNG_SERIES.count / 2));
    const [toolMode, setToolMode] = useState<ViewerToolMode>("wl");
    const [ww, setWw] = useState(350);
    const [wl, setWl] = useState(45);
    const [isPlaying, setIsPlaying] = useState(false);
    // Displayed WW/WL — updated both from DICOM tags and from Cornerstone WL tool feedback
    const [displayWw, setDisplayWw] = useState(350);
    const [displayWl, setDisplayWl] = useState(45);
    // Scan session loaded from localStorage — MUST be declared before studyTree useMemo
    const [scanSession, setScanSession] = useState<ApiScanSessionDetail | null>(null);
    // Ref for imperative control of the Cornerstone viewport (zoom/fit/reset in 2D mode)
    const dicomViewerRef = useRef<DicomViewerHandle>(null);
    // Ref for the 3D MPR Cornerstone viewport
    const mprRef = useRef<CornerstoneMPRHandle>(null);
    // Ref for the 4D pre-rendered MPR grid (used when isFourDLungReconSeries)
    const fourDGridRef = useRef<FourDMprGridHandle>(null);

    // ─── 4D manifest (pre-rendered WebP dataset) ───────────────────────────
    const [fourDManifest, setFourDManifest] = useState<FourDManifest | null>(null);
    const [fourDManifestError, setFourDManifestError] = useState<string | null>(null);
    const [sliceLoadingCount, setSliceLoadingCount] = useState(0);
    const [isSliceLoadingInline, setIsSliceLoadingInline] = useState(shouldShowSliceLoadingBridge);

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
    // For 2D canvas-based measures (3D mode canvas removed — now Cornerstone MPR)
    const volumeDataRef = useRef<VolumeData | null>(null);
    const defaultWindowRef = useRef({ ww: 350, wl: 45 });
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
    const [selectedRenderMode, setSelectedRenderMode] = useState("MPR");
    const [isBrowseModeOpen, setIsBrowseModeOpen] = useState(false);
    const [isLayoutOpen, setIsLayoutOpen] = useState(false);
    const [isRenderModeOpen, setIsRenderModeOpen] = useState(false);
    const currentLayoutSpec = useMemo(
        () => LAYOUT_SPECS[selectedLayout] ?? LAYOUT_SPECS["三维四窗"],
        [selectedLayout]
    );

    // ─── Build study tree from scan session (falls back to static DICOM data) ──
    const studyTree = useMemo<Study[]>(() => {
        // ── Helper: build an ImageItem array using the static DICOM dataset ──────
        const makeImages = (count: number, prefix: string): ImageItem[] =>
            Array.from({ length: count }, (_, i) => ({ id: `${prefix}-img-${i + 1}`, name: `Image ${i + 1}` }));

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
            return [{
                id: REAL_LUNG_SERIES.studyId,
                name: REAL_LUNG_SERIES.studyName,
                scanGroups: [{
                    id: "static-group",
                    label: REAL_LUNG_SERIES.seriesName,
                    type: "static" as SeriesType,
                    series: [{
                        id: REAL_LUNG_SERIES.seriesId,
                        name: REAL_LUNG_SERIES.seriesName,
                        count: REAL_LUNG_SERIES.count,
                        kernel: REAL_LUNG_SERIES.kernel,
                        thickness: REAL_LUNG_SERIES.thickness,
                        kV: REAL_LUNG_SERIES.kV,
                        mAs: REAL_LUNG_SERIES.mAs,
                        fov: REAL_LUNG_SERIES.fov,
                        matrix: REAL_LUNG_SERIES.matrix,
                        seriesType: "static" as SeriesType,
                        images: makeImages(REAL_LUNG_SERIES.count, "qin"),
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
                const leafSeries: Series[] = s.recon_series.map((r) => ({
                    id: `${prefix}-recon${r.id}`,
                    name: r.recon_name,
                    count: REAL_LUNG_SERIES.count,
                    kernel: r.kernel,
                    thickness: `${r.slice_thickness} mm`,
                    kV: p ? String(p.kv) : "—",
                    mAs: p ? ((p as { auto_ma?: boolean }).auto_ma ? "Auto" : String(p.ma)) : "—",
                    fov: p ? `${p.fov} mm` : "—",
                    matrix: String(r.matrix),
                    seriesType: type,
                    images: makeImages(REAL_LUNG_SERIES.count, `${prefix}-recon${r.id}`),
                    defaultWw: r.window_width,
                    defaultWl: r.window_level,
                }));

                // Fallback if protocol has no recon series configured
                if (leafSeries.length === 0) {
                    leafSeries.push({
                        id: `${prefix}-scan`,
                        name: s.series_label,
                        count: REAL_LUNG_SERIES.count,
                        kernel: "—",
                        thickness: p ? `${(p as { slice_thickness?: number }).slice_thickness ?? "—"} mm` : "—",
                        kV: p ? String(p.kv) : "—",
                        mAs: p ? ((p as { auto_ma?: boolean }).auto_ma ? "Auto" : String(p.ma)) : "—",
                        fov: p ? `${p.fov} mm` : "—",
                        matrix: "512",
                        seriesType: type,
                        images: makeImages(REAL_LUNG_SERIES.count, `${prefix}-scan`),
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
            scanGroups.push({
                id: "static-group",
                label: REAL_LUNG_SERIES.seriesName,
                type: "static" as SeriesType,
                series: [{
                    id: REAL_LUNG_SERIES.seriesId,
                    name: REAL_LUNG_SERIES.seriesName,
                    count: REAL_LUNG_SERIES.count,
                    kernel: REAL_LUNG_SERIES.kernel,
                    thickness: REAL_LUNG_SERIES.thickness,
                    kV: REAL_LUNG_SERIES.kV,
                    mAs: REAL_LUNG_SERIES.mAs,
                    fov: REAL_LUNG_SERIES.fov,
                    matrix: REAL_LUNG_SERIES.matrix,
                    seriesType: "static" as SeriesType,
                    images: Array.from({ length: REAL_LUNG_SERIES.count }, (_, i) => ({ id: `qin-img-${i + 1}`, name: `Image ${i + 1}` })),
                }],
            });
        }

        return [{
            id: `session-${scanSession.id}`,
            name: scanSession.name || "扫描序列",
            scanGroups,
        }];
    }, [scanSession, isFourDEntry]);

    const seriesList = studyTree.flatMap((study) => study.scanGroups.flatMap((g) => g.series));
    // Guard: if seriesList is somehow still empty, always fall back to the static series
    const safeSeriesList = seriesList.length > 0 ? seriesList : [{
        id: REAL_LUNG_SERIES.seriesId,
        name: REAL_LUNG_SERIES.seriesName,
        count: REAL_LUNG_SERIES.count,
        kernel: REAL_LUNG_SERIES.kernel,
        thickness: REAL_LUNG_SERIES.thickness,
        kV: REAL_LUNG_SERIES.kV,
        mAs: REAL_LUNG_SERIES.mAs,
        fov: REAL_LUNG_SERIES.fov,
        matrix: REAL_LUNG_SERIES.matrix,
        seriesType: "static" as SeriesType,
        images: Array.from({ length: REAL_LUNG_SERIES.count }, (_, i) => ({ id: `qin-img-${i + 1}`, name: `Image ${i + 1}` })),
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
    const isFourDEntryLoadingFlow = false;
    const isPlaybackEnabled = !isFourDPlaybackBlockedByReview;
    const isToolSupportedInCurrentView = (mode: ViewerToolMode) => {
        if (!isMprViewActive) return true;
        if (isFourDMprViewActive) {
            return mode === "pan" || mode === "wl";
        }
        return mode === "pan" || mode === "wl" || mode === "measure" || mode === "eraser";
    };



    const clampSliceIndex = useCallback((value: number) => Math.max(0, Math.min(totalSlices - 1, value)), [totalSlices]);

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
        setIsPlaying(false);
        setFourDBrowseMode(fourDState?.initialBrowseMode ?? "slice");
        setSliceCineTick(0);
        phaseCineDirectionRef.current = 1;
    }, [fourDState?.initialBrowseMode, selectedSeriesId]);

    // When a 4D series is active, auto-switch to 3D MPR layout; leave non-4D workflows untouched.
    useEffect(() => {
        if (!isFourDLungReconSeries) return;
        setImageMode("3D");
        setSelectedLayout("多平面重建");
        setSelectedRenderMode("MPR");
    }, [isFourDLungReconSeries]);

    useEffect(() => {
        if (!isTopogramSeries) return;
        setImageMode("2D");
    }, [isTopogramSeries]);

    useEffect(() => {
        if (isToolSupportedInCurrentView(toolMode)) return;
        setToolMode("wl");
    }, [toolMode, isMprViewActive, isFourDMprViewActive]);

    // Load 4D manifest + preload each phase's first frame (mid axial) so
    // phase switches are instant after the initial warm.
    useEffect(() => {
        if (!isFourDLungReconSeries && !isFourDEntryLoadingFlow) return;
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
    }, [isFourDLungReconSeries, isFourDEntryLoadingFlow, fourDManifest, fourDManifestError]);

    useEffect(() => {
        setIsSliceLoadingInline(shouldShowSliceLoadingBridge);
    }, [shouldShowSliceLoadingBridge]);

    useEffect(() => {
        if (!shouldShowSliceLoadingBridge || !fourDManifest) return;
        const totalSlices = fourDManifest.views.axial.slices;
        setSliceLoadingCount(1);
        setSliceIndex(0);
        let current = 1;
        const timer = window.setInterval(() => {
            if (current >= totalSlices) {
                window.clearInterval(timer);
                setSliceLoadingCount(totalSlices);
                setSliceIndex(clampSliceIndex(totalSlices - 1));
                setIsSliceLoadingInline(false);
                return;
            }
            current += 1;
            setSliceLoadingCount(current);
            setSliceIndex(clampSliceIndex(current - 1));
        }, 28);
        return () => window.clearInterval(timer);
    }, [clampSliceIndex, fourDManifest, shouldShowSliceLoadingBridge]);

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

    // Conventional slice browsing: lock current phase, cycle spatial slices in all MPR planes.
    useEffect(() => {
        if (!isFourDLungReconSeries || !isPlaying || fourDBrowseMode !== "slice") return;
        const intervalMs = 220 / phaseCineSpeed;
        const timer = window.setInterval(() => {
            setSliceCineTick((prev) => prev + 1);
        }, intervalMs);
        return () => window.clearInterval(timer);
    }, [isFourDLungReconSeries, isPlaying, phaseCineSpeed, fourDBrowseMode]);

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
            // If current ID is still the static placeholder and we now have session data, switch to first session series
            if (prev === REAL_LUNG_SERIES.seriesId && scanSession) return first.id;
            // If selected ID is no longer in the list (series was removed), fall back to first
            if (!safeSeriesList.find((s) => s.id === prev)) return first.id;
            return prev;
        });
        // Apply target series WW/WL preset on session load (4D入口优先使用4D重建序列预设)
        if (scanSession && target?.defaultWw != null && target.defaultWl != null) {
            setWw(target.defaultWw);
            setWl(target.defaultWl);
            setDisplayWw(target.defaultWw);
            setDisplayWl(target.defaultWl);
            defaultWindowRef.current = { ww: target.defaultWw, wl: target.defaultWl };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scanSession, isFourDEntry, preferredSeriesForFourDEntry]);

    const seriesImageUrls = useMemo(
        () => Array.from({ length: totalSlices }, (_, index) => getSeriesDicomUrl(index, selectedSeries.seriesType)),
        [selectedSeries.seriesType, totalSlices]
    );
    const handleSeriesSelect = useCallback((seriesId: string) => {
        const nextSeries = safeSeriesList.find((series) => series.id === seriesId);
        setSelectedSeriesId(seriesId);
        setSliceIndex(getSeriesMidSliceIndex(nextSeries?.count ?? REAL_LUNG_SERIES.count));
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
    }, [seriesList]);
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
        const loadVolume = async () => {
            try {
                const slices: Array<{
                    instanceNumber: number;
                    positionZ: number;
                    hu: Float32Array;
                    rows: number;
                    cols: number;
                    pixelSpacingX: number;
                    pixelSpacingY: number;
                    sliceThickness: number;
                }> = [];

                for (let i = 1; i <= REAL_LUNG_SERIES.count; i += 1) {
                    const fileName = `1-${String(i).padStart(3, "0")}.dcm`;
                    const response = await fetch(`${REAL_LUNG_SERIES.basePath}/${fileName}`);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch ${fileName}`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    const byteArray = new Uint8Array(arrayBuffer);
                    const dataSet = dicomParser.parseDicom(byteArray);

                    const rows = dataSet.uint16("x00280010") ?? 0;
                    const cols = dataSet.uint16("x00280011") ?? 0;
                    const bitsAllocated = dataSet.uint16("x00280100") ?? 16;
                    const pixelRepresentation = dataSet.uint16("x00280103") ?? 0;
                    const intercept = Number(dataSet.string("x00281052") ?? "0");
                    const slope = Number(dataSet.string("x00281053") ?? "1");
                    const positionZ = Number((dataSet.string("x00200032") ?? "0\\0\\0").split("\\")[2] ?? 0);
                    const pixelSpacing = (dataSet.string("x00280030") ?? "1\\1").split("\\").map(Number);
                    const sliceThickness = Number(dataSet.string("x00180050") ?? "1");
                    const pixelDataElement = dataSet.elements.x7fe00010;
                    if (!pixelDataElement || rows === 0 || cols === 0) continue;

                    const pixelData = byteArray.slice(pixelDataElement.dataOffset, pixelDataElement.dataOffset + pixelDataElement.length);
                    const pixelBuffer = pixelData.buffer.slice(pixelData.byteOffset, pixelData.byteOffset + pixelData.byteLength);

                    let values: Int16Array | Uint16Array;
                    if (bitsAllocated === 16) {
                        values = pixelRepresentation === 1 ? new Int16Array(pixelBuffer) : new Uint16Array(pixelBuffer);
                    } else {
                        values = new Uint16Array(pixelBuffer);
                    }

                    const hu = new Float32Array(values.length);
                    for (let j = 0; j < values.length; j += 1) {
                        hu[j] = values[j] * slope + intercept;
                    }

                    slices.push({
                        instanceNumber: Number(dataSet.string("x00200013") ?? i),
                        positionZ,
                        hu,
                        rows,
                        cols,
                        pixelSpacingX: pixelSpacing[1] || 1,
                        pixelSpacingY: pixelSpacing[0] || 1,
                        sliceThickness: Number.isFinite(sliceThickness) && sliceThickness > 0 ? sliceThickness : 1,
                    });
                }

                slices.sort((a, b) => b.positionZ - a.positionZ || a.instanceNumber - b.instanceNumber);
                if (slices.length === 0) return;

                const rows = slices[0].rows;
                const cols = slices[0].cols;
                const depth = slices.length;
                const hu = new Float32Array(rows * cols * depth);
                slices.forEach((slice, index) => {
                    hu.set(slice.hu, index * rows * cols);
                });

                const sliceSpacing = depth > 1
                    ? Math.abs(slices[0].positionZ - slices[1].positionZ) || slices[0].sliceThickness
                    : slices[0].sliceThickness;

                volumeDataRef.current = {
                    rows,
                    cols,
                    depth,
                    hu,
                    pixelSpacingX: slices[0].pixelSpacingX,
                    pixelSpacingY: slices[0].pixelSpacingY,
                    sliceSpacing,
                };
                setSliceIndex((prev) => clampSliceIndex(prev));
            } catch (error) {
                console.error(error);
            }
        };

        loadVolume();
    }, [clampSliceIndex]);

    useEffect(() => {
        const loadSlice = async () => {
            try {
                const url = getSeriesDicomUrl(clampSliceIndex(sliceIndex), selectedSeries.seriesType);
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${url}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const byteArray = new Uint8Array(arrayBuffer);
                const dataSet = dicomParser.parseDicom(byteArray);

                const rows = dataSet.uint16("x00280010") ?? 0;
                const cols = dataSet.uint16("x00280011") ?? 0;
                const wcFromTag = Number(dataSet.string("x00281050") ?? "45");
                const wwFromTag = Number(dataSet.string("x00281051") ?? "350");
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
                if (sliceIndex === getSeriesMidSliceIndex(selectedSeries.count)) {
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
    }, [sliceIndex, selectedSeriesId, selectedSeries.name, selectedSeries.seriesType, clampSliceIndex]);

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
            setSliceIndex((prev) => (prev >= totalSlices - 1 ? 0 : prev + 1));
        }, 250);
        return () => window.clearInterval(timer);
    }, [isPlaying, totalSlices, isFourDLungReconSeries]);

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
                    <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                        <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
                            <User size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold text-[#37474F]">
                                {meta.patientName !== "N/A" ? meta.patientName : "—"}
                            </span>
                            <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5">
                                {meta.patientId !== "N/A" ? `ID: ${meta.patientId}` : "加载中…"}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
                        <div className="text-[9px] font-bold italic">⊥ 0</div>
                        <div className="text-[9px] font-bold">∠ 0</div>
                        <div className="flex items-center gap-1 text-[11px] font-bold">
                            <Flame size={14} />
                            <span>0%</span>
                        </div>
                    </div>
                </div>

                <div className="text-center">
                    <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">{clockStr}</div>
                    <div className="text-[12px] text-[#546E7A] font-medium mt-1 uppercase opacity-80">{dateStr}</div>
                </div>

                <div className="flex items-center gap-5 pr-2">
                    <div className="p-1 text-[#D32F2F] cursor-pointer hover:opacity-70"><Siren size={30} strokeWidth={1.8} /></div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Network size={24} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">5</span>
                    </div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Sun size={24} />
                    </div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Settings size={24} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">10</span>
                    </div>
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
                                <>
                                    <Param label="WW" value={String(Math.round(displayWw))} />
                                    <Param label="WL" value={String(Math.round(displayWl))} />
                                    {/* Prefer live DICOM tag values; fall back to scan session / static values */}
                                    <Param label="Kernel" value={selectedSeries.kernel !== "—" ? selectedSeries.kernel : meta.seriesDescription} />
                                    <Param label="Thick" value={meta.thickness !== "N/A" ? meta.thickness : selectedSeries.thickness} />
                                    <Param label="FOV" value={selectedSeries.fov} />
                                    <Param label="Matrix" value={meta.rows > 0 ? `${meta.rows}×${meta.cols}` : selectedSeries.matrix} />
                                </>
                            ) : (
                                <div className="col-span-2 flex flex-col gap-2">
                                    {/* Layout Dropdown */}
                                    <div className={`${isFourDLungReconSeries ? "hidden" : "flex"} items-center gap-2 relative`}>
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
                                                            if (opt === "Avg") setSelectedRenderMode("MPR");
                                                            else setSelectedRenderMode(opt);
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

                                    {/* Render Mode Dropdown */}
                                    {!isFourDLungReconSeries && (
                                        <div className="flex items-center gap-2 relative">
                                            <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">渲染</span>
                                            <div
                                                onClick={() => setIsRenderModeOpen(!isRenderModeOpen)}
                                                className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between transition-all cursor-pointer ${isRenderModeOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                            >
                                                <span className="text-[12px] font-medium text-[#37474F]">
                                                    {selectedRenderMode}
                                                </span>
                                                <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isRenderModeOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                            </div>
                                            {isRenderModeOpen && (
                                                <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                    {["MIP", "MPR", "VR", "MinIP"].map((opt) => (
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
                                                            { k: "slice" as const, l: "常规浏览" },
                                                        ]).map(({ k, l }) => (
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
                                                        ))}
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
                                                                    if (opt === "Avg") setSelectedRenderMode("MPR");
                                                                    else setSelectedRenderMode(opt);
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
                        {!isTopogramSeries && imageMode === "2D" && (
                            <div className="px-3 pb-3">
                                <button className="h-[32px] w-full bg-white border border-[#B0C4DE] rounded-md text-[10px] font-bold text-[#4D94FF] hover:bg-blue-50 transition-all shadow-sm">
                                    详情
                                </button>
                            </div>
                        )}
                    </div>
                </aside>

                <div className="flex-1 min-w-0 flex overflow-hidden rounded-lg border border-[#B0C4DE]">
                <div className={viewportContainerClassName}>
                    {/* ── 3D MPR mode: full Cornerstone multi-planar viewport ── */}
                    {!isFourDEntryLoadingFlow && !isTopogramSeries && imageMode === "3D" && (
                        <div className="relative flex-1 min-w-0 overflow-hidden">
                            {/* 4D entry: drive the grid from pre-rendered WebP stacks so
                                the phase slider actually changes the image. */}
                            {isFourDLungReconSeries && fourDManifest ? (
                                <FourDMprGrid
                                    ref={fourDGridRef}
                                    manifest={fourDManifest}
                                    phase={selectedPhaseIndex}
                                    onPhaseChange={setSelectedPhaseIndex}
                                    showPhaseBadge={fourDBrowseMode === "phase"}
                                    showCornerInfo={fourDBrowseMode === "slice"}
                                    cornerInfo={{
                                        patientName: meta.patientName,
                                        patientId: meta.patientId,
                                        patientSex: meta.patientSex,
                                        patientAge: meta.patientAge,
                                        modality: meta.modality,
                                        studyDate: meta.studyDate,
                                        studyTime: meta.studyTime,
                                        seriesDescription: selectedSeries.name,
                                        kvp: meta.kvp,
                                        mas: meta.mas,
                                        pixelSpacing: meta.pixelSpacing,
                                        thickness: `${slabThickness} mm`,
                                        institution: meta.institution,
                                        manufacturer: meta.manufacturer,
                                        rows: meta.rows,
                                        cols: meta.cols,
                                        ww: displayWw,
                                        wl: displayWl,
                                    }}
                                    initialLayout={fourDBrowseMode === "slice" ? "axial-single" : "mpr"}
                                    sliceCineTick={sliceCineTick}
                                    mipMode={phaseMipMode}
                                    progressiveSliceLoad={isFourDEntry && fourDBrowseMode === "slice" && fourDStage === "phaseLoading"}
                                    onProgressiveSliceLoadComplete={handleFourDSliceLoadComplete}
                                    activeTool={mapCornerstoneTool(toolMode)}
                                    windowCenter={wl}
                                    windowWidth={ww}
                                    onWindowLevelChange={(wc, wwidth) => {
                                        setWl(Math.round(wc));
                                        setWw(Math.round(wwidth));
                                        setDisplayWl(Math.round(wc));
                                        setDisplayWw(Math.round(wwidth));
                                    }}
                                    onStatusChange={setViewerLoadStatus}
                                />
                            ) : isFourDLungReconSeries && !fourDManifest ? (
                                <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70 bg-black">
                                    {fourDManifestError
                                        ? `4D 数据加载失败: ${fourDManifestError}`
                                        : "正在加载 4D 影像数据…"}
                                </div>
                            ) : (
                                <CornerstoneMPRViewport
                                    ref={mprRef}
                                    imageUrls={seriesImageUrls}
                                    onStatusChange={setViewerLoadStatus}
                                    windowCenter={wl}
                                    windowWidth={ww}
                                    activeTool={mapCornerstoneTool(toolMode)}
                                    renderMode={selectedRenderMode as 'MPR' | 'MIP' | 'VR' | 'MinIP'}
                                    onWindowLevelChange={(wc, wwidth) => {
                                        setDisplayWl(Math.round(wc));
                                        setDisplayWw(Math.round(wwidth));
                                    }}
                                    className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden"
                                />
                            )}
                        </div>
                    )}
                    {/* ── 2D mode: single Cornerstone stack viewport ── */}
                    {!isFourDEntryLoadingFlow && (imageMode === "2D" || isTopogramSeries) && (
                        <section
                            ref={viewportRef}
                            className={`flex-1 min-w-0 bg-black overflow-hidden relative ${toolMode === "measure" ? "cursor-crosshair" : toolMode === "annotate" ? "cursor-cell" : "cursor-default"}`}
                        >
                            {/* Cornerstone DICOM viewer */}
                            <DicomViewer
                                ref={dicomViewerRef}
                                imageUrls={seriesImageUrls}
                                onStatusChange={setViewerLoadStatus}
                                currentImageIndex={clampSliceIndex(sliceIndex)}
                                onImageIndexChange={setSliceIndex}
                                activeTool={mapCornerstoneTool(toolMode)}
                                windowCenter={wl}
                                windowWidth={ww}
                                onWindowLevelChange={(wc, wwidth) => {
                                    setDisplayWl(Math.round(wc));
                                    setDisplayWw(Math.round(wwidth));
                                }}
                            />
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
                                    Image {isSliceLoadingInline ? Math.max(1, sliceLoadingCount) : sliceIndex + 1}/{selectedSeries.count}
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
                                    Slice {isSliceLoadingInline ? Math.max(1, sliceLoadingCount) : sliceIndex + 1}/{selectedSeries.count} | Thick {meta.thickness}
                                </div>
                                <div>Location {meta.sliceLocation}</div>
                                <div>{meta.institution} | {meta.manufacturer}</div>
                            </div>
                            {isSliceLoadingInline && (
                                <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-[#4D94FF]/50 bg-[#081220]/85 px-3 py-1 text-[11px] font-bold text-[#BFDBFE] shadow-md">
                                    正在重建图像 {Math.max(1, sliceLoadingCount)} / {selectedSeries.count}
                                </div>
                            )}
                        </section>
                    )}
                </div>
                <aside className="w-[72px] bg-[#0F172A] border-l border-white/10 overflow-hidden shrink-0 flex flex-col">
                        <div className="flex-1 flex flex-col gap-1 p-2 pt-3" onPointerDown={(e) => e.stopPropagation()}>
                            {(["pan", "wl", "measure", "annotate"] as const).map((mode, i) => {
                                const icons = [
                                    <Move size={20} strokeWidth={1.5} key="pan" />,
                                    <WindowLevelIcon size={20} key="window-level" />,
                                    <Ruler size={20} strokeWidth={1.5} key="ruler" />,
                                    <Pencil size={20} strokeWidth={1.5} key="pencil" />,
                                ];
                                const titles = ["移动", "窗宽/窗位", "测量", "标注"];
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
                                        } else if (isFourDLungReconSeries) {
                                            fourDGridRef.current?.zoomIn();
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
                                        } else if (isFourDLungReconSeries) {
                                            fourDGridRef.current?.zoomOut();
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
                                        } else if (isFourDLungReconSeries) {
                                            fourDGridRef.current?.fit();
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
                                            setDisplayWw(defaultWindowRef.current.ww);
                                            setDisplayWl(defaultWindowRef.current.wl);
                                        } else if (isFourDLungReconSeries) {
                                            fourDGridRef.current?.reset();
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
            </main>

            <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10">
                <div className="flex-1">
                    <button
                        onClick={handleAdvancedProcessing}
                        className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-solid shadow-sm transition-all uppercase text-[13px] active:scale-95"
                    >
                        <ChevronLeft size={20} /> 高级处理
                    </button>
                </div>
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

            {isFourDEntryLoadingFlow && fourDManifest && (
                <FourDPhaseLoadingGrid
                    manifest={fourDManifest}
                    onComplete={handleFourDPhaseGridComplete}
                    showReviewButton={fourDStage === "reviewReady"}
                    onReviewClick={() => setFourDStage("review")}
                    className="absolute inset-0 z-50 flex flex-col bg-[#05070B] pointer-events-auto"
                />
            )}
            {isFourDEntryLoadingFlow && !fourDManifest && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#05070B] text-white pointer-events-auto">
                    <div className="h-10 w-10 rounded-full border-2 border-white/20 border-t-[#4D94FF] animate-spin" />
                    <div className="text-[12px] font-black uppercase tracking-[0.18em] text-[#60A5FA]">
                        {fourDManifestError ? "4D Image Data Load Failed" : "Loading 4D Image Data"}
                    </div>
                    {fourDManifestError && (
                        <div className="max-w-[520px] px-6 text-center text-[12px] font-semibold text-red-200">
                            {fourDManifestError}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/*
function FourDPhaseLoadingGridBroken({
    manifest,
    onComplete,
    showReviewButton,
    onReviewClick,
    className = "absolute inset-0 flex flex-col bg-[#05070B]",
}: {
    manifest: FourDManifest;
    onComplete: () => void;
    showReviewButton: boolean;
    onReviewClick: () => void;
    className?: string;
}) {
    const SIMULATED_PHASE_LOAD_DELAY_MS = 650;
    const phaseIndexes = useMemo(
        () => Array.from({ length: Math.min(10, manifest.phases) }, (_, index) => index),
        [manifest.phases]
    );
    const midAxialSlice = useMemo(() => Math.floor(manifest.views.axial.slices / 2) + 1, [manifest.views.axial.slices]);
    const midCoronalSlice = useMemo(() => Math.floor(manifest.views.coronal.slices / 2) + 1, [manifest.views.coronal.slices]);
    const midSagittalSlice = useMemo(() => Math.floor(manifest.views.sagittal.slices / 2) + 1, [manifest.views.sagittal.slices]);

    const [loadedCount, setLoadedCount] = useState(0);
    const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
    const [selectedBedCandidateIndex, setSelectedBedCandidateIndex] = useState(0);
    const [loadedUrls, setLoadedUrls] = useState<Record<number, { axial: string; coronal: string; sagittal: string }>>({});
    const completedRef = useRef(false);

    useEffect(() => {
        completedRef.current = false;
        queueMicrotask(() => {
            setLoadedCount(0);
            setLoadedUrls({});
            setSelectedPhaseIndex(0);
            setSelectedBedCandidateIndex(0);
        });
    }, [manifest]);

    useEffect(() => {
        if (completedRef.current) return;
        if (loadedCount >= phaseIndexes.length) {
            completedRef.current = true;
            onComplete();
            return;
        }

        let cancelled = false;
        const phaseIndex = phaseIndexes[loadedCount];
        const urls = {
            axial: getFourDImageUrl(phaseIndex, "axial", midAxialSlice),
            coronal: getFourDImageUrl(phaseIndex, "coronal", midCoronalSlice),
            sagittal: getFourDImageUrl(phaseIndex, "sagittal", midSagittalSlice),
        };

        const preloadImage = (url: string) =>
            new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => resolve();
                img.src = url;
            });

        Promise.all([preloadImage(urls.axial), preloadImage(urls.coronal), preloadImage(urls.sagittal)]).then(() => {
            if (cancelled) return;
            setLoadedUrls((prev) => ({ ...prev, [phaseIndex]: urls }));
            window.setTimeout(() => {
                if (!cancelled) setLoadedCount((prev) => prev + 1);
            }, SIMULATED_PHASE_LOAD_DELAY_MS);
        });

        return () => {
            cancelled = true;
        };
    }, [loadedCount, midAxialSlice, midCoronalSlice, midSagittalSlice, onComplete, phaseIndexes]);

    const progress = phaseIndexes.length === 0 ? 1 : loadedCount / phaseIndexes.length;
    const duplicateSegments = [
        { id: 1, time: "12:34:56.78", quality: "优秀", color: "text-emerald-400" },
        { id: 2, time: "12:45:12.34", quality: "良好", color: "text-amber-300" },
        { id: 3, time: "12:55:45.67", quality: "一般", color: "text-orange-300" },
    ];
    const selectedPhaseUrls = loadedUrls[selectedPhaseIndex];

    return (
        <div className={className}>
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
                <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#60A5FA]">4D Axial Reconstruction</div>
                   
                </div>

                <div className="grid flex-1 min-h-0 grid-cols-5 grid-rows-2 gap-2 overflow-auto p-3">
                    {phaseIndexes.map((phaseIndex, idx) => {
                        const phaseValue = manifest.phase_values?.[phaseIndex] ?? phaseIndex * 10;
                        const urls = loadedUrls[phaseIndex];
                        const isLoaded = !!urls;
                        const isActiveLoading = idx === loadedCount && !isLoaded;
                        const hasDuplicate = phaseIndex === 0;
                        const selected = selectedPhaseIndex === phaseIndex;
                        return (
                            <button
                                key={phaseIndex}
                                type="button"
                                onClick={() => isLoaded && setSelectedPhaseIndex(phaseIndex)}
                                className={`group relative overflow-hidden rounded-lg border text-left transition-all ${selected ? "border-[#4D94FF] shadow-[0_0_0_2px_rgba(77,148,255,0.3)]" : "border-[#1F2E46]"}`}
                            >
                                <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-black/70 px-2 py-1">
                                    <span className="text-[10px] font-black">Phase {phaseValue}%</span>
                                    <span className={`h-2.5 w-2.5 rounded-full ${isLoaded ? "bg-emerald-400" : isActiveLoading ? "bg-[#4D94FF]" : "bg-slate-500"}`} />
                                </div>
                                <div className="h-full w-full bg-black pt-7">
                                    {isLoaded ? (
                                        <img src={urls.axial} alt={`phase-${phaseValue}`} className="h-full w-full object-cover opacity-90" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center bg-[#0B1220]">
                                            <div className={`h-6 w-6 rounded-full border-2 border-white/20 border-t-[#4D94FF] ${isActiveLoading ? "animate-spin" : ""}`} />
                                        </div>
                                    )}
                                </div>
                                {hasDuplicate && (
                                    <div className="absolute bottom-2 left-2 rounded bg-amber-500/85 px-1.5 py-0.5 text-[10px] font-bold text-black">重复数据: 3 段</div>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="flex h-12 items-center gap-6 border-t border-white/10 px-4 text-[11px] text-slate-300">
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />数据充足</span>
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />存在重复数据</span>
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" />数据缺失</span>
                </div>
            </section>

            <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-[#22344F] bg-gradient-to-b from-[#0B1729] to-[#081220]">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-bold">相位 0% - 存在重复数据，请选择数据段</h3>
                        <span className="rounded-full border border-amber-500/60 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">3 段可用</span>
                    </div>
                    <div className="h-1.5 w-36 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-[#4D94FF]" style={{ width: `${progress * 100}%` }} />
                    </div>
                </div>

                <div className="flex min-h-0 flex-1 gap-2 p-2">
                    <div className="w-[180px] shrink-0 space-y-2">
                        {duplicateSegments.map((seg, idx) => (
                            <button
                                key={seg.id}
                                type="button"
                                onClick={() => setSelectedSegmentIndex(idx)}
                                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${selectedSegmentIndex === idx ? "border-[#4D94FF] bg-[#132944]" : "border-[#24374F] bg-[#0D182B] hover:bg-[#132944]"}`}
                            >
                                <div className="text-[12px] font-bold">数据段 {seg.id}</div>
                                <div className="mt-1 text-[11px] text-slate-300">{seg.time}</div>
                                <div className={`mt-1 text-[11px] font-bold ${seg.color}`}>质量评分: {seg.quality}</div>
                            </button>
                        ))}
                    </div>

                    <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-lg border border-[#24374F] bg-black">
                        {([
                            { key: "axial", label: "Axial" },
                            { key: "coronal", label: "Coronal" },
                            { key: "sagittal", label: "Sagittal" },
                            { key: "preview", label: "3D Preview" },
                        ] as const).map((pane) => (
                            <div key={pane.key} className="relative overflow-hidden border border-white/5">
                                <div className="absolute left-2 top-1 z-10 text-[11px] font-bold text-white/85">{pane.label}</div>
                                {pane.key !== "preview" && selectedPhaseUrls ? (
                                    <img
                                        src={selectedPhaseUrls[pane.key]}
                                        alt={pane.label}
                                        className="h-full w-full object-cover opacity-95"
                                    />
                                ) : pane.key === "preview" ? (
                                    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#1F2937_0%,#020617_70%)] text-[12px] text-slate-300">
                                        3D 预览加载中…
                                    </div>
                                ) : (
                                    <div className="flex h-full items-center justify-center bg-[#0B1220]">
                                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-[#4D94FF]" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/10 px-3 py-2">
                    <p className="text-[11px] text-slate-300">建议：选择图像清晰、运动伪影少的数据段以获得最佳重建效果。</p>
                    {showReviewButton && (
                        <button
                            type="button"
                            onClick={onReviewClick}
                            className="h-8 rounded-md bg-[#4D94FF] px-4 text-[11px] font-black text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 active:scale-95"
                        >
                            相位审核
                        </button>
                    )}
                </div>
            </section>
        </div>
    );
}


*/

function FourDPhaseLoadingGrid({
    manifest,
    onComplete,
    showReviewButton,
    onReviewClick,
    className = "absolute inset-0 flex flex-col bg-[#05070B]",
}: {
    manifest: FourDManifest;
    onComplete: () => void;
    showReviewButton: boolean;
    onReviewClick: () => void;
    className?: string;
}) {
    const SIMULATED_PHASE_LOAD_DELAY_MS = 650;
    const phaseIndexes = useMemo(
        () => Array.from({ length: Math.min(10, manifest.phases) }, (_, index) => index),
        [manifest.phases],
    );
    const midAxialSlice = useMemo(
        () => Math.floor(manifest.views.axial.slices / 2) + 1,
        [manifest.views.axial.slices],
    );
    const midCoronalSlice = useMemo(
        () => Math.floor(manifest.views.coronal.slices / 2) + 1,
        [manifest.views.coronal.slices],
    );
    const midSagittalSlice = useMemo(
        () => Math.floor(manifest.views.sagittal.slices / 2) + 1,
        [manifest.views.sagittal.slices],
    );

    const [loadedCount, setLoadedCount] = useState(0);
    const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
    const [selectedBedCandidateIndex, setSelectedBedCandidateIndex] = useState(0);
    const [loadedUrls, setLoadedUrls] = useState<Record<number, { axial: string; coronal: string; sagittal: string }>>({});
    const completedRef = useRef(false);

    useEffect(() => {
        completedRef.current = false;
        queueMicrotask(() => {
            setLoadedCount(0);
            setLoadedUrls({});
            setSelectedPhaseIndex(0);
            setSelectedBedCandidateIndex(0);
        });
    }, [manifest]);

    useEffect(() => {
        if (completedRef.current) return;
        if (loadedCount >= phaseIndexes.length) {
            completedRef.current = true;
            onComplete();
            return;
        }

        let cancelled = false;
        const phaseIndex = phaseIndexes[loadedCount];
        const urls = {
            axial: getFourDImageUrl(phaseIndex, "axial", midAxialSlice),
            coronal: getFourDImageUrl(phaseIndex, "coronal", midCoronalSlice),
            sagittal: getFourDImageUrl(phaseIndex, "sagittal", midSagittalSlice),
        };

        const preloadImage = (url: string) =>
            new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => resolve();
                img.src = url;
            });

        Promise.all([preloadImage(urls.axial), preloadImage(urls.coronal), preloadImage(urls.sagittal)]).then(() => {
            if (cancelled) return;
            setLoadedUrls((prev) => ({ ...prev, [phaseIndex]: urls }));
            window.setTimeout(() => {
                if (!cancelled) setLoadedCount((prev) => prev + 1);
            }, SIMULATED_PHASE_LOAD_DELAY_MS);
        });

        return () => {
            cancelled = true;
        };
    }, [loadedCount, midAxialSlice, midCoronalSlice, midSagittalSlice, onComplete, phaseIndexes]);

    const progress = phaseIndexes.length === 0 ? 1 : loadedCount / phaseIndexes.length;
    const selectedPhaseUrls = loadedUrls[selectedPhaseIndex];
    const selectedPhaseValue = manifest.phase_values?.[selectedPhaseIndex] ?? selectedPhaseIndex * 10;
    const bedPhaseCandidates = [
        { id: 1, bed: "床位 03", label: "候选 1", time: "12:34:56.78", quality: "推荐", color: "text-emerald-400" },
        { id: 2, bed: "床位 03", label: "候选 2", time: "12:45:12.34", quality: "可用", color: "text-amber-300" },
        { id: 3, bed: "床位 03", label: "候选 3", time: "12:55:45.67", quality: "运动偏大", color: "text-orange-300" },
    ];
    const conflictedBedLabel = bedPhaseCandidates[0]?.bed ?? "床位";

    return (
        <div className={className}>
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
                <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#60A5FA]">4D Axial Reconstruction</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-400">
                        Preparing phase images. Controls outside this loading view are temporarily disabled.
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="h-1.5 w-44 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-[#4D94FF] transition-all duration-200" style={{ width: `${progress * 100}%` }} />
                    </div>
                    <span className="w-12 text-right text-[11px] font-black text-slate-300">{Math.round(progress * 100)}%</span>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 gap-3 p-3">
                <section className="flex w-[58%] min-w-0 flex-col overflow-hidden rounded-xl border border-[#22344F] bg-[#081220]">
                    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                        <h3 className="text-[13px] font-black text-white">Phase Loading</h3>
                        <span className="text-[11px] font-semibold text-slate-400">{loadedCount}/{phaseIndexes.length} phases ready</span>
                    </div>
                    <div className="grid min-h-0 flex-1 grid-cols-5 grid-rows-2 gap-2 overflow-auto p-3">
                        {phaseIndexes.map((phaseIndex, idx) => {
                            const phaseValue = manifest.phase_values?.[phaseIndex] ?? phaseIndex * 10;
                            const urls = loadedUrls[phaseIndex];
                            const isLoaded = !!urls;
                            const isActiveLoading = idx === loadedCount && !isLoaded;
                            const hasDuplicate = phaseIndex === 0;
                            const selected = selectedPhaseIndex === phaseIndex;
                            return (
                                <button
                                    key={phaseIndex}
                                    type="button"
                                    onClick={() => isLoaded && setSelectedPhaseIndex(phaseIndex)}
                                    className={`group relative overflow-hidden rounded-lg border text-left transition-all ${selected ? "border-[#4D94FF] shadow-[0_0_0_2px_rgba(77,148,255,0.3)]" : "border-[#1F2E46]"}`}
                                >
                                    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-black/70 px-2 py-1">
                                        <span className="text-[10px] font-black text-white">Phase {phaseValue}%</span>
                                        <span className={`h-2.5 w-2.5 rounded-full ${isLoaded ? "bg-emerald-400" : isActiveLoading ? "bg-[#4D94FF]" : "bg-slate-500"}`} />
                                    </div>
                                    <div className="h-full w-full bg-black pt-7">
                                        {isLoaded ? (
                                            <img src={urls.axial} alt={`phase-${phaseValue}`} className="h-full w-full object-cover opacity-90" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center bg-[#0B1220]">
                                                <div className={`h-6 w-6 rounded-full border-2 border-white/20 border-t-[#4D94FF] ${isActiveLoading ? "animate-spin" : ""}`} />
                                            </div>
                                        )}
                                    </div>
                                    {hasDuplicate && (
                                        <div className="absolute bottom-2 left-2 rounded bg-amber-500/85 px-1.5 py-0.5 text-[10px] font-bold text-black">
                                            {conflictedBedLabel} 多个0%候选
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex h-10 items-center gap-5 border-t border-white/10 px-3 text-[11px] text-slate-300">
                        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />Ready</span>
                        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />床位相位重复</span>
                        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-500" />Pending</span>
                    </div>
                </section>

                <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-[#22344F] bg-gradient-to-b from-[#0B1729] to-[#081220]">
                    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                        <div className="flex items-center gap-2">
                            <h3 className="text-[14px] font-bold text-white">{selectedPhaseValue}% 相位床位数据选择</h3>
                            <span className="rounded-full border border-amber-500/60 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                                {conflictedBedLabel}: {bedPhaseCandidates.length} 个0%候选
                            </span>
                        </div>
                    </div>
                    <div className="border-b border-white/10 px-3 py-2 text-[11px] leading-relaxed text-slate-300">
                        0% 相位由所有床位的 0% 数据合成。检测到 {conflictedBedLabel} 出现多个 0% 相位数据，请选择该床位用于重建的候选数据。
                    </div>
                    <div className="flex min-h-0 flex-1 gap-2 p-2">
                        <div className="w-[180px] shrink-0 space-y-2">
                            {bedPhaseCandidates.map((candidate, idx) => (
                                <button
                                    key={candidate.id}
                                    type="button"
                                    onClick={() => setSelectedBedCandidateIndex(idx)}
                                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${selectedBedCandidateIndex === idx ? "border-[#4D94FF] bg-[#132944]" : "border-[#24374F] bg-[#0D182B] hover:bg-[#132944]"}`}
                                >
                                    <div className="text-[12px] font-bold text-white">{candidate.bed}</div>
                                    <div className="mt-1 text-[11px] font-semibold text-slate-300">{candidate.label} · 0%相位</div>
                                    <div className="mt-1 text-[11px] text-slate-400">{candidate.time}</div>
                                    <div className={`mt-1 text-[11px] font-bold ${candidate.color}`}>质量: {candidate.quality}</div>
                                </button>
                            ))}
                        </div>
                        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-lg border border-[#24374F] bg-black">
                            {([
                                { key: "axial", label: "Axial" },
                                { key: "coronal", label: "Coronal" },
                                { key: "sagittal", label: "Sagittal" },
                                { key: "preview", label: "3D Preview" },
                            ] as const).map((pane) => (
                                <div key={pane.key} className="relative overflow-hidden border border-white/5">
                                    <div className="absolute left-2 top-1 z-10 text-[11px] font-bold text-white/85">{pane.label}</div>
                                    {pane.key !== "preview" && selectedPhaseUrls ? (
                                        <img
                                            src={selectedPhaseUrls[pane.key]}
                                            alt={pane.label}
                                            className="h-full w-full object-cover opacity-95"
                                        />
                                    ) : pane.key === "preview" ? (
                                        <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#1F2937_0%,#020617_70%)] text-[12px] text-slate-300">
                                            3D preview loading...
                                        </div>
                                    ) : (
                                        <div className="flex h-full items-center justify-center bg-[#0B1220]">
                                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-[#4D94FF]" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/10 px-3 py-2">
                        <p className="text-[11px] text-slate-300">
                            确认后，所选候选将作为 {conflictedBedLabel} 的 0% 数据参与整体 0% 相位重建。
                        </p>
                        {showReviewButton && (
                            <button
                                type="button"
                                onClick={onReviewClick}
                                className="h-8 rounded-md bg-[#4D94FF] px-4 text-[11px] font-black text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 active:scale-95"
                            >
                                确认相位选择
                            </button>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

const Param = ({ label, value }: { label: string; value: string }) => (
    <div className="p-2 bg-white border border-[#B0C4DE]/30 rounded-md flex flex-col items-center justify-center shadow-sm min-h-[56px]">
        <span className="text-[8px] font-black uppercase text-[#90A4AE] tracking-tighter">{label}</span>
        <span className="text-[13px] font-black text-[#37474F] mt-1">{value}</span>
    </div>
);

export default ViewScreen;
