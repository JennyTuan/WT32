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
    Hand,
    Ruler,
    Pencil,
    Eraser,
    Trash2,
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
import { FourDPhaseReviewModal } from "./FourDPhaseReviewModal";
import { hasPhaseConflicts, type FourDPostScanState } from "../lib/fourDTypes";
import DicomViewer, { type DicomViewerHandle } from "../components/DicomViewer";
import CornerstoneMPRViewport, { type CornerstoneMPRHandle } from "../components/CornerstoneMPRViewport";
import FourDMprGrid, { type FourDMprGridHandle } from "../components/FourDMprGrid";
import {
    loadFourDManifest,
    preloadPhaseFirstFrames,
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
type PseudoColorMode = "灰阶" | "Hot Iron" | "PET" | "Spectrum" | "Bone" | "Rainbow" | "Blue-Orange";
type FourDBrowseMode = "phase" | "slice";

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
const PSEUDO_COLOR_OPTIONS: PseudoColorMode[] = ["灰阶", "Hot Iron", "PET", "Spectrum", "Bone", "Rainbow", "Blue-Orange"];
const FOUR_D_PHASE_LABELS = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];

// (Pseudo-color logic removed)

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

const getSeriesDicomUrl = (sliceIndex: number) =>
    `${REAL_LUNG_SERIES.basePath}/1-${String(sliceIndex + 1).padStart(3, "0")}.dcm`;

const mapCornerstoneTool = (toolMode: "pan" | "wl" | "measure" | "annotate" | "eraser") => {
    if (toolMode === "wl") return "window";
    if (toolMode === "measure") return "ruler";
    if (toolMode === "eraser") return "eraser";
    if (toolMode === "annotate") return "annotate";
    return "pan";
};

const getSeriesMidSliceIndex = (count: number) => Math.max(0, Math.floor(count / 2));

const ViewScreen = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const FOUR_D_RECON_MIN_LOADING_MS = 20000;

    // ─── 4D 后处理状态 ────────────────────────────────────────────────────────
    const fourDState = location.state as FourDPostScanState | null;
    const isFourDEntry = !!fourDState?.scanResult;

    /** "idle" → 非4D入口；"loading" → 模拟重建加载中；"review" → 相位审核弹窗；"done" → 审核完成 */
    const [fourDStage, setFourDStage] = useState<"idle" | "loading" | "review" | "done">(
        isFourDEntry ? "loading" : "idle"
    );
    const [viewerLoadStatus, setViewerLoadStatus] = useState<"loading" | "ready" | "error">(
        isFourDEntry ? "loading" : "ready"
    );
    const fourDReviewTriggeredRef = useRef(false);
    const fourDLoadingStartedAtRef = useRef<number>(Date.now());

    // 4D 入口下，等图像浏览界面的真实加载完成后，再决定是否弹出相位审核
    useEffect(() => {
        if (!isFourDEntry) return;
        if (fourDReviewTriggeredRef.current) return;
        if (viewerLoadStatus !== "ready") return;

        const elapsed = Date.now() - fourDLoadingStartedAtRef.current;
        const remaining = Math.max(0, FOUR_D_RECON_MIN_LOADING_MS - elapsed);

        const timer = window.setTimeout(() => {
            if (fourDReviewTriggeredRef.current) return;
            fourDReviewTriggeredRef.current = true;
            const scanResult = fourDState!.scanResult;
            if (hasPhaseConflicts(scanResult)) {
                setFourDStage("review");
            } else {
                setFourDStage("done");
            }
        }, remaining);

        return () => window.clearTimeout(timer);
    }, [FOUR_D_RECON_MIN_LOADING_MS, fourDState, isFourDEntry, viewerLoadStatus]);

    // Will be updated to the first session series when session loads
    const [selectedSeriesId, setSelectedSeriesId] = useState(REAL_LUNG_SERIES.seriesId);
    const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
    // 4D browsing cine (separate from slice-playback isPlaying)
    const [isFourDBrowsePlaying, setIsFourDBrowsePlaying] = useState(false);
    const [fourDBrowseMode, setFourDBrowseMode] = useState<FourDBrowseMode>("phase");
    const [sliceCineTick, setSliceCineTick] = useState(0);
    const [phaseCineSpeed, setPhaseCineSpeed] = useState<0.5 | 1 | 2>(1); // multiplier; 1× = 500 ms/phase
    const [phaseCineMode, setPhaseCineMode] = useState<"forward" | "bounce">("forward");
    const phaseCineDirectionRef = useRef<1 | -1>(1);
    // Across-phase aggregation for the MPR 4th panel (ITV visualisation)
    const [phaseMipMode, setPhaseMipMode] = useState<"MIP" | "MinIP" | "Avg">("MIP");
    const [imageMode, setImageMode] = useState<"2D" | "3D">("2D");
    const [sliceIndex, setSliceIndex] = useState(Math.floor(REAL_LUNG_SERIES.count / 2));
    const [toolMode, setToolMode] = useState<"pan" | "wl" | "measure" | "annotate" | "eraser">("pan");
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
    const [selectedPseudoColor, setSelectedPseudoColor] = useState<PseudoColorMode>("灰阶");
    const [isLayoutOpen, setIsLayoutOpen] = useState(false);
    const [isRenderModeOpen, setIsRenderModeOpen] = useState(false);
    const [isPseudoColorOpen, setIsPseudoColorOpen] = useState(false);
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
                        count: REAL_LUNG_SERIES.count,
                        kernel: "—",
                        thickness: p ? `${p.scan_length} mm` : "—",
                        kV: p ? String(p.kv) : "—",
                        mAs: p ? String(p.ma) : "—",
                        fov: p ? `${p.fov} mm` : "—",
                        matrix: "512",
                        seriesType: type,
                        images: makeImages(REAL_LUNG_SERIES.count, `${prefix}-topo`),
                        defaultWw: 1500,
                        defaultWl: -600,
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
    }, [scanSession]);

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
    const selectedSeries = safeSeriesList.find((s) => s.id === selectedSeriesId) ?? safeSeriesList[0];
    const isFourDLungReconSeries =
        selectedSeries.seriesType === "4d" &&
        /肺/.test(selectedSeries.name);
    const totalSlices = selectedSeries.count;
    // Single flex container for both 2D and 3D; CornerstoneMPRViewport does its own 2×2 panel grid internally.
    // (`currentLayoutSpec` retained for backward-compatible dropdown but no longer drives the outer layout —
    //  the Cornerstone MPR implementation doesn't honor per-panel spans anyway.)
    void currentLayoutSpec;
    const viewportContainerClassName =
        "flex-1 min-w-0 flex overflow-hidden bg-[#0F172A]";



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
        setIsFourDBrowsePlaying(false);
        setFourDBrowseMode("phase");
        setSliceCineTick(0);
        phaseCineDirectionRef.current = 1;
    }, [selectedSeriesId]);

    // When a 4D series is active, auto-switch to 3D MPR layout; leave non-4D workflows untouched.
    useEffect(() => {
        if (!isFourDLungReconSeries) return;
        setImageMode("3D");
        setSelectedLayout("多平面重建");
        setSelectedRenderMode("MPR");
    }, [isFourDLungReconSeries]);

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
                // Best-effort warm; ignore failure
                preloadPhaseFirstFrames(m, "axial").catch(() => {});
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
        if (!isFourDLungReconSeries || !isFourDBrowsePlaying || fourDBrowseMode !== "phase") return;
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
    }, [isFourDLungReconSeries, isFourDBrowsePlaying, phaseCineSpeed, phaseCineMode, fourDBrowseMode]);

    // Slice cine: lock current phase, cycle spatial slices in all MPR planes.
    useEffect(() => {
        if (!isFourDLungReconSeries || !isFourDBrowsePlaying || fourDBrowseMode !== "slice") return;
        const intervalMs = 220 / phaseCineSpeed;
        const timer = window.setInterval(() => {
            setSliceCineTick((prev) => prev + 1);
        }, intervalMs);
        return () => window.clearInterval(timer);
    }, [isFourDLungReconSeries, isFourDBrowsePlaying, phaseCineSpeed, fourDBrowseMode]);

    // Auto-select first series when session data loads (or series list changes)
    useEffect(() => {
        const first = safeSeriesList[0];
        if (!first) return;
        setSelectedSeriesId((prev) => {
            // If current ID is still the static placeholder and we now have session data, switch to first session series
            if (prev === REAL_LUNG_SERIES.seriesId && scanSession) return first.id;
            // If selected ID is no longer in the list (series was removed), fall back to first
            if (!safeSeriesList.find((s) => s.id === prev)) return first.id;
            return prev;
        });
        // Apply first series WW/WL preset on session load
        if (scanSession && first.defaultWw != null && first.defaultWl != null) {
            setWw(first.defaultWw);
            setWl(first.defaultWl);
            setDisplayWw(first.defaultWw);
            setDisplayWl(first.defaultWl);
            defaultWindowRef.current = { ww: first.defaultWw, wl: first.defaultWl };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scanSession]);

    const seriesImageUrls = useMemo(
        () => Array.from({ length: totalSlices }, (_, index) => getSeriesDicomUrl(index)),
        [totalSlices]
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
    const handleClearAllAnnotations = () => {
        dicomViewerRef.current?.clearAnnotations();
        setAnnotations([]);
        setDraftMeasure(null);
        measureStartRef.current = null;
    };

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
                const fileName = `1-${String(clampSliceIndex(sliceIndex) + 1).padStart(3, "0")}.dcm`;
                const url = `${REAL_LUNG_SERIES.basePath}/${fileName}`;
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${fileName}`);
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
    }, [sliceIndex, selectedSeriesId, selectedSeries.name, clampSliceIndex]);

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
        if (!isPlaying) return;
        const timer = window.setInterval(() => {
            setSliceIndex((prev) => (prev >= totalSlices - 1 ? 0 : prev + 1));
        }, 250);
        return () => window.clearInterval(timer);
    }, [isPlaying, totalSlices]);
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
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl">
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
                        {isFourDLungReconSeries ? (
                            <div className="flex items-center gap-1 rounded-md border border-[#DCE6F2] bg-white overflow-hidden shadow-sm">
                                {([
                                    { k: "phase" as const, l: "4D Cine" },
                                    { k: "slice" as const, l: "Slice Cine" },
                                ]).map(({ k, l }) => {
                                    const active = fourDBrowseMode === k;
                                    return (
                                        <button
                                            key={k}
                                            onClick={() => setFourDBrowseMode(k)}
                                            className={`px-2 h-[24px] text-[10px] font-black transition-all ${
                                                active ? "bg-[#4D94FF] text-white" : "text-[#546E7A] hover:text-[#37474F]"
                                            }`}
                                        >
                                            {l}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
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
                        )}
                    </div>

                    <div className="flex-1 bg-[#F8FAFC] overflow-hidden flex flex-col">
                        <div className="flex-1 p-3 grid grid-cols-2 gap-2 overflow-y-auto">
                            {imageMode === "2D" ? (
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
                                    <div className="flex items-center gap-2 relative">
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

                                    {/* Pseudo Color Dropdown */}
                                    <div className="flex items-center gap-2 relative">
                                        <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[60px] shrink-0">伪彩</span>
                                        <div
                                            onClick={() => setIsPseudoColorOpen(!isPseudoColorOpen)}
                                            className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between cursor-pointer transition-all ${isPseudoColorOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                        >
                                            <span className="text-[12px] font-medium text-[#37474F] truncate">{selectedPseudoColor}</span>
                                            <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isPseudoColorOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                        </div>
                                        {isPseudoColorOpen && (
                                            <div className="absolute top-[calc(100%+3px)] left-[68px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden max-h-[160px] overflow-y-auto">
                                                {PSEUDO_COLOR_OPTIONS.map((opt) => (
                                                    <div
                                                        key={opt}
                                                        onClick={() => { setSelectedPseudoColor(opt); setIsPseudoColorOpen(false); }}
                                                        className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedPseudoColor === opt ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                    >
                                                        {opt}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        {imageMode === "2D" && (
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
                    {imageMode === "3D" && (
                        <div className="relative flex-1 min-w-0 overflow-hidden">
                            {/* 4D entry: drive the grid from pre-rendered WebP stacks so
                                the phase slider actually changes the image. */}
                            {isFourDLungReconSeries && fourDManifest ? (
                                <FourDMprGrid
                                    ref={fourDGridRef}
                                    manifest={fourDManifest}
                                    phase={selectedPhaseIndex}
                                    sliceCineTick={sliceCineTick}
                                    mipMode={phaseMipMode}
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
                            {isFourDLungReconSeries && (
                                <>
                                    {/* 右下第 4 窗：跨相位 MIP/MinIP/Avg —— ITV 可视化 */}
                                    <div className="pointer-events-none absolute right-3 bottom-3 z-20 rounded-md border border-[#F59E0B]/50 bg-[#0F172A]/90 px-2.5 py-1.5 shadow-lg backdrop-blur-sm">
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="text-[8px] font-black uppercase tracking-[0.16em] text-[#FBBF24]">跨相位</span>
                                            <span className="text-[13px] font-black leading-none text-white tabular-nums">{phaseMipMode}</span>
                                        </div>
                                        <div className="text-[8px] font-bold text-[#FBBF24]/80 mt-0.5">10 相位聚合 · ITV</div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    {/* ── 2D mode: single Cornerstone stack viewport ── */}
                    {imageMode === "2D" && (
                        <section
                            ref={viewportRef}
                            className={`flex-1 min-w-0 bg-black overflow-hidden relative ${toolMode === "measure" ? "cursor-crosshair" : toolMode === "annotate" ? "cursor-cell" : toolMode === "pan" ? "cursor-grab" : "cursor-default"}`}
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
                                <div>Image {sliceIndex + 1}/{selectedSeries.count}</div>
                                <div>KV {meta.kvp} | mAs {meta.mas}</div>
                            </div>
                            <div className="absolute bottom-2 left-2 text-[10px] text-[#CFD8DC] font-mono leading-[1.35] pointer-events-none">
                                <div>WW/WL {Math.round(displayWw)} / {Math.round(displayWl)}</div>
                                <div>Spacing {meta.pixelSpacing}</div>
                                <div>{meta.rows > 0 ? `${meta.rows} × ${meta.cols}` : "—"}</div>
                            </div>
                            <div className="absolute bottom-2 right-2 text-[10px] text-[#CFD8DC] font-mono text-right leading-[1.35] pointer-events-none">
                                <div>Slice {sliceIndex + 1}/{selectedSeries.count} | Thick {meta.thickness}</div>
                                <div>Location {meta.sliceLocation}</div>
                                <div>{meta.institution} | {meta.manufacturer}</div>
                            </div>
                        </section>
                    )}
                </div>
                <aside className="w-[72px] bg-[#0F172A] border-l border-white/10 overflow-hidden shrink-0 flex flex-col">
                        <div className="flex-1 flex flex-col gap-1 p-2 pt-3" onPointerDown={(e) => e.stopPropagation()}>
                            {(["pan", "wl", "measure", "annotate", "eraser"] as const).map((mode, i) => {
                                const icons = [
                                    <Hand size={20} strokeWidth={1.5} key="hand" />,
                                    <SlidersHorizontal size={20} strokeWidth={1.5} key="sliders" />,
                                    <Ruler size={20} strokeWidth={1.5} key="ruler" />,
                                    <Pencil size={20} strokeWidth={1.5} key="pencil" />,
                                    <Eraser size={20} strokeWidth={1.5} key="eraser" />,
                                ];
                                const titles = ["Pan", "WW/WL", "Measure", "Annotate", "Eraser"];
                                const active = toolMode === mode;
                                return (
                                    <button
                                        key={mode}
                                        title={titles[i]}
                                        onClick={() => setToolMode(mode)}
                                        style={{
                                            width: "44px",
                                            height: "44px",
                                            borderRadius: "10px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            border: "none",
                                            cursor: "pointer",
                                            transition: "all 0.15s ease",
                                            background: active ? "#3B82F6" : "transparent",
                                            color: active ? "#ffffff" : "#94A3B8",
                                            boxShadow: active ? "0 0 15px rgba(59,130,246,0.55)" : "none",
                                        }}
                                    >
                                        {icons[i]}
                                    </button>
                                );
                            })}

                            <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "4px 4px" }} />

                            {[
                                {
                                    title: "Zoom In",
                                    icon: <ZoomIn size={20} strokeWidth={1.5} />,
                                    action: () => {
                                        dicomViewerRef.current?.zoomIn();
                                        // MPR: Cornerstone handles zoom via scroll/pinch internally
                                    },
                                },
                                {
                                    title: "Zoom Out",
                                    icon: <ZoomOut size={20} strokeWidth={1.5} />,
                                    action: () => {
                                        dicomViewerRef.current?.zoomOut();
                                    },
                                },
                                {
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
                                    title: "Reset",
                                    icon: <RefreshCw size={20} strokeWidth={1.5} />,
                                    action: () => {
                                        if (imageMode === "2D") {
                                            dicomViewerRef.current?.reset();
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
                                    title: isPlaying ? "Pause" : "Play",
                                    icon: isPlaying ? <Pause size={20} strokeWidth={1.5} /> : <Play size={20} strokeWidth={1.5} />,
                                    action: () => setIsPlaying((prev) => !prev),
                                    active: isPlaying,
                                },
                            ].map(({ title, icon, action, active }) => (
                                <button
                                    key={title}
                                    title={title}
                                    onClick={action}
                                    style={{
                                        width: "44px",
                                        height: "44px",
                                        borderRadius: "10px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        border: "none",
                                        cursor: "pointer",
                                        transition: "all 0.15s ease",
                                        background: active ? "#3B82F6" : "transparent",
                                        color: active ? "#ffffff" : "#94A3B8",
                                        boxShadow: active ? "0 0 15px rgba(59,130,246,0.55)" : "none",
                                    }}
                                >
                                    {icon}
                                </button>
                            ))}

                            <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "4px 4px" }} />

                            <button
                                title="Clear All"
                                onClick={handleClearAllAnnotations}
                                style={{
                                    width: "44px",
                                    height: "44px",
                                    borderRadius: "10px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border: "none",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                    background: "transparent",
                                    color: "#FCA5A5",
                                }}
                            >
                                <Trash2 size={20} strokeWidth={1.5} />
                            </button>
                        </div>
                    </aside>
                </div>
            </main>

            {isFourDLungReconSeries && (
                <PhaseTimelineBar
                    phaseLabels={FOUR_D_PHASE_LABELS}
                    currentPhaseIndex={selectedPhaseIndex}
                    onPhaseChange={(idx) => { setSelectedPhaseIndex(idx); }}
                    browseMode={fourDBrowseMode}
                    onBrowseModeChange={setFourDBrowseMode}
                    isPlaying={isFourDBrowsePlaying}
                    onTogglePlay={() => setIsFourDBrowsePlaying((v) => !v)}
                    speed={phaseCineSpeed}
                    onSpeedChange={setPhaseCineSpeed}
                    loopMode={phaseCineMode}
                    onLoopModeChange={setPhaseCineMode}
                />
            )}

            <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10">
                <div className="flex-1">
                    <button className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-solid shadow-sm transition-all uppercase text-[13px] active:scale-95">
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

            {/* ── 4D 图像重建加载中 overlay ── */}
            {fourDStage === "loading" && (
                <FourDLoadingOverlay
                    bedCount={fourDState!.scanResult.bedCount}
                    phaseCount={fourDState!.scanResult.phaseCount}
                />
            )}

            {/* ── 4D 相位审核弹窗 ── */}
            {fourDStage === "review" && fourDState?.scanResult && (
                <FourDPhaseReviewModal
                    scanResult={fourDState.scanResult}
                    onComplete={() => {
                        setFourDStage("done");
                    }}
                />
            )}
        </div>
    );
};

// ─── 4D 相位时间轴（底部控制条） ────────────────────────────────────────────
type PhaseCineSpeed = 0.5 | 1 | 2;
type PhaseCineMode = "forward" | "bounce";

function PhaseTimelineBar(props: {
    phaseLabels: string[];
    currentPhaseIndex: number;
    onPhaseChange: (idx: number) => void;
    browseMode: FourDBrowseMode;
    onBrowseModeChange: (m: FourDBrowseMode) => void;
    isPlaying: boolean;
    onTogglePlay: () => void;
    speed: PhaseCineSpeed;
    onSpeedChange: (s: PhaseCineSpeed) => void;
    loopMode: PhaseCineMode;
    onLoopModeChange: (m: PhaseCineMode) => void;
}) {
    const {
        phaseLabels, currentPhaseIndex, onPhaseChange,
        browseMode, onBrowseModeChange,
        isPlaying, onTogglePlay,
        speed, onSpeedChange,
        loopMode, onLoopModeChange,
    } = props;

    const speeds: PhaseCineSpeed[] = [0.5, 1, 2];

    return (
        <div className="h-[64px] shrink-0 border-t border-[#B0C4DE] bg-[#F8FAFC] px-4 flex items-center gap-4 z-10">
            {/* ── 左：模式 + 播放 + 速度 + 循环 ── */}
            <div className="flex items-center gap-2 shrink-0">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-black uppercase tracking-[0.14em] text-[#4D94FF]">Mode</span>
                    <div className="flex items-center rounded-md border border-[#DCE6F2] bg-white overflow-hidden">
                        {([
                            { k: "phase" as const, l: "4D Cine" },
                            { k: "slice" as const, l: "Slice Cine" },
                        ]).map(({ k, l }) => {
                            const active = browseMode === k;
                            return (
                                <button
                                    key={k}
                                    onClick={() => onBrowseModeChange(k)}
                                    className={`px-2 h-[22px] text-[10px] font-black transition-all ${
                                        active ? "bg-[#4D94FF] text-white" : "text-[#546E7A] hover:text-[#37474F]"
                                    }`}
                                >
                                    {l}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <button
                    onClick={onTogglePlay}
                    title={isPlaying ? "暂停浏览动画" : "播放浏览动画"}
                    className={`h-[36px] w-[36px] rounded-full flex items-center justify-center transition-all ${
                        isPlaying
                            ? "bg-[#10B981] text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                            : "bg-[#4D94FF] text-white hover:bg-[#3B82F6]"
                    }`}
                >
                    {isPlaying ? <Pause size={18} strokeWidth={2.5} /> : <Play size={18} strokeWidth={2.5} />}
                </button>
                <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-black uppercase tracking-[0.14em] text-[#4D94FF]">Speed</span>
                    <div className="flex items-center rounded-md border border-[#DCE6F2] bg-white overflow-hidden">
                        {speeds.map((s) => {
                            const active = s === speed;
                            return (
                                <button
                                    key={s}
                                    onClick={() => onSpeedChange(s)}
                                    className={`px-2 h-[22px] text-[10px] font-black transition-all ${
                                        active ? "bg-[#4D94FF] text-white" : "text-[#546E7A] hover:text-[#37474F]"
                                    }`}
                                >
                                    {s}×
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-black uppercase tracking-[0.14em] text-[#4D94FF]">Loop</span>
                    <div className="flex items-center rounded-md border border-[#DCE6F2] bg-white overflow-hidden">
                        {([
                            { k: "forward" as const, l: "正向" },
                            { k: "bounce" as const, l: "往返" },
                        ]).map(({ k, l }) => {
                            const active = loopMode === k;
                            return (
                                <button
                                    key={k}
                                    onClick={() => onLoopModeChange(k)}
                                    disabled={browseMode === "slice"}
                                    className={`px-2 h-[22px] text-[10px] font-black transition-all ${
                                        active ? "bg-[#4D94FF] text-white" : "text-[#546E7A] hover:text-[#37474F]"
                                    } ${browseMode === "slice" ? "opacity-40 cursor-not-allowed" : ""}`}
                                >
                                    {l}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="text-[10px] text-[#64748B] font-semibold whitespace-nowrap">
                    {browseMode === "phase" ? "时间维度循环（多相位）" : "空间维度循环（单相位）"}
                </div>
            </div>

            {/* ── 中：相位 scrubber ── */}
            <div className="flex-1 min-w-0 flex items-center gap-3">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[#4D94FF] shrink-0">
                    {browseMode === "phase" ? "相位" : "固定相位"}
                </span>
                <div className="relative flex-1 h-[36px] flex items-center">
                    {/* 刻度背景线 */}
                    <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-[#DCE6F2] rounded-full" />
                    {/* 已播过的进度条 */}
                    <div
                        className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 bg-gradient-to-r from-[#4D94FF] to-[#60A5FA] rounded-full transition-all"
                        style={{ width: `${(currentPhaseIndex / Math.max(phaseLabels.length - 1, 1)) * 100}%` }}
                    />
                    {/* 10 个相位刻度 */}
                    <div className="relative flex-1 flex justify-between">
                        {phaseLabels.map((label, idx) => {
                            const active = idx === currentPhaseIndex;
                            return (
                                <button
                                    key={label}
                                    onClick={() => onPhaseChange(idx)}
                                    className="group relative flex flex-col items-center gap-0.5"
                                    title={`相位 ${label}`}
                                >
                                    <div
                                        className={`h-3 w-3 rounded-full border-2 transition-all ${
                                            active
                                                ? "bg-[#4D94FF] border-white shadow-[0_0_8px_rgba(77,148,255,0.6)] scale-125"
                                                : "bg-white border-[#B0C4DE] group-hover:border-[#4D94FF]"
                                        }`}
                                    />
                                    <span className={`text-[8px] font-black tabular-nums ${active ? "text-[#4D94FF]" : "text-[#94A3B8] group-hover:text-[#4D94FF]"}`}>
                                        {label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── 4D 重建加载动画（内部组件） ────────────────────────────────────────────
function FourDLoadingOverlay({ bedCount, phaseCount }: { bedCount: number; phaseCount: number }) {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const start = performance.now();
        const duration = 19500; // 与外层最短 20s 基本一致，保留少量收尾余量

        const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            // Ease-out curve
            setProgress(1 - Math.pow(1 - p, 3));
            if (p < 1) requestAnimationFrame(tick);
        };
        const rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, []);

    const stages = [
        { label: "床位数据读取", done: progress > 0.25 },
        { label: "呼吸相位分拣", done: progress > 0.55 },
        { label: "回顾式图像重建", done: progress > 0.85 },
    ];

    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0a1520]/85 backdrop-blur-[4px]">
            <div className="flex flex-col items-center gap-6 rounded-2xl bg-[#0F1E30] border border-[#1E3A5F] px-12 py-10 shadow-2xl w-[420px]">
                {/* 标题 */}
                <div className="flex flex-col items-center gap-1">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-blue-400">4D CT</div>
                    <div className="text-[20px] font-black text-white">图像重建中</div>
                    <div className="text-[11px] text-slate-400">
                        {bedCount} 个床位 · {phaseCount} 个呼吸相位
                    </div>
                </div>

                {/* 进度条 */}
                <div className="w-full">
                    <div className="h-2 w-full rounded-full bg-[#1E3A5F] overflow-hidden">
                        <div
                            className="h-full rounded-full bg-[#4D94FF] transition-none"
                            style={{ width: `${progress * 100}%` }}
                        />
                    </div>
                    <div className="mt-2 text-right text-[11px] font-bold text-blue-300">
                        {Math.round(progress * 100)}%
                    </div>
                </div>

                {/* 阶段指示 */}
                <div className="flex flex-col gap-2 w-full">
                    {stages.map((s) => (
                        <div key={s.label} className="flex items-center gap-3">
                            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.done ? "bg-green-400" : "bg-[#1E3A5F]"}`} />
                            <span className={`text-[11px] font-bold ${s.done ? "text-green-400" : "text-slate-500"}`}>
                                {s.label}
                            </span>
                        </div>
                    ))}
                </div>
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
