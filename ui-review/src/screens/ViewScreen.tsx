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
    CircleDot,
    Maximize,
    RefreshCw,
    Play,
    Pause,
    Flame,
    Network,
    Siren,
} from "lucide-react";
import * as dicomParser from "dicom-parser";

type ImageItem = { id: string; name: string };
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
};
type Study = {
    id: string;
    name: string;
    series: Series[];
};
type DrawRect = { x: number; y: number; w: number; h: number };
type ScreenMeasure = {
    id: string;
    slice: number;
    sx1: number;
    sy1: number;
    sx2: number;
    sy2: number;
};
type TextAnnotation = {
    id: string;
    kind: "text";
    slice: number;
    x: number;
    y: number;
    text: string;
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
type ProjectionAxis = "axial" | "coronal" | "sagittal";

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

const applyPseudoColor = (mode: PseudoColorMode, normalized: number) => {
    const t = Math.min(1, Math.max(0, normalized));
    if (mode === "灰阶") {
        const value = Math.round(t * 255);
        return [value, value, value] as const;
    }
    if (mode === "Hot Iron") {
        const r = Math.round(255 * Math.min(1, t * 1.35));
        const g = Math.round(255 * Math.min(1, Math.max(0, (t - 0.28) / 0.55)));
        const b = Math.round(255 * Math.min(1, Math.max(0, (t - 0.72) / 0.28)));
        return [r, g, b] as const;
    }
    if (mode === "PET") {
        const r = Math.round(255 * Math.min(1, Math.max(0, (t - 0.18) / 0.62)));
        const g = Math.round(255 * Math.sin(Math.PI * Math.min(1, t)) ** 1.1);
        const b = Math.round(255 * Math.min(1, Math.max(0, 1.15 - t * 1.55)));
        return [r, g, b] as const;
    }
    if (mode === "Bone") {
        const lifted = t ** 0.72;
        const r = Math.round(255 * Math.min(1, 0.2 + lifted * 0.95));
        const g = Math.round(255 * Math.min(1, 0.18 + lifted * 0.9));
        const b = Math.round(255 * Math.min(1, 0.12 + lifted * 0.78));
        return [r, g, b] as const;
    }
    if (mode === "Rainbow") {
        const hue = (1 - t) * 240;
        const saturation = 0.95;
        const lightness = 0.52;
        const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
        const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
        const m = lightness - c / 2;
        let rPrime = 0;
        let gPrime = 0;
        let bPrime = 0;
        if (hue < 60) {
            rPrime = c;
            gPrime = x;
        } else if (hue < 120) {
            rPrime = x;
            gPrime = c;
        } else if (hue < 180) {
            gPrime = c;
            bPrime = x;
        } else {
            gPrime = x;
            bPrime = c;
        }
        return [
            Math.round((rPrime + m) * 255),
            Math.round((gPrime + m) * 255),
            Math.round((bPrime + m) * 255),
        ] as const;
    }
    if (mode === "Blue-Orange") {
        const cool = [30, 78, 170] as const;
        const warm = [255, 168, 38] as const;
        const mix = t ** 0.9;
        return [
            Math.round(cool[0] + (warm[0] - cool[0]) * mix),
            Math.round(cool[1] + (warm[1] - cool[1]) * mix),
            Math.round(cool[2] + (warm[2] - cool[2]) * mix),
        ] as const;
    }
    const r = Math.round(255 * Math.min(1, Math.max(0, 1.5 * t - 0.15)));
    const g = Math.round(255 * Math.sin(Math.PI * t));
    const b = Math.round(255 * Math.min(1, Math.max(0, 1.25 - 1.45 * t)));
    return [r, g, b] as const;
};

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

const ViewScreen = () => {
    const [selectedSeriesId, setSelectedSeriesId] = useState(REAL_LUNG_SERIES.seriesId);
    const [imageMode, setImageMode] = useState<"2D" | "3D">("2D");
    const [sliceIndex, setSliceIndex] = useState(Math.floor(REAL_LUNG_SERIES.count / 2));
    const [toolMode, setToolMode] = useState<"pan" | "wl" | "measure" | "annotate">("pan");
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState(0);
    const [invert, setInvert] = useState(false);
    const [ww, setWw] = useState(350);
    const [wl, setWl] = useState(45);
    const [isPlaying, setIsPlaying] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewportRef = useRef<HTMLElement | null>(null);
    const coronalCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const coronalViewportRef = useRef<HTMLDivElement | null>(null);
    const sagittalCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const sagittalViewportRef = useRef<HTMLDivElement | null>(null);
    const volumeCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const volumeViewportRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<{ dragging: boolean; x: number; y: number }>({ dragging: false, x: 0, y: 0 });
    const measureStartRef = useRef<{ x: number; y: number } | null>(null);
    const huDataRef = useRef<Float32Array | null>(null);
    const volumeDataRef = useRef<VolumeData | null>(null);
    const imgSizeRef = useRef({ rows: 0, cols: 0 });
    const defaultWindowRef = useRef({ ww: 350, wl: 45 });
    const drawRectRef = useRef<DrawRect>({ x: 0, y: 0, w: 1, h: 1 });
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [measures, setMeasures] = useState<ScreenMeasure[]>([]);
    const [draftMeasure, setDraftMeasure] = useState<{
        sx1: number;
        sy1: number;
        sx2: number;
        sy2: number;
        slice: number;
    } | null>(null);
    const [renderTick, setRenderTick] = useState(0);
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
    const viewerWorkspaceClassName = useMemo(
        () =>
            imageMode === "3D"
                ? currentLayoutSpec.containerClassName.replace(" rounded-lg border border-[#B0C4DE]", "")
                : "flex-1 min-w-0 flex",
        [currentLayoutSpec, imageMode]
    );

    const studyTree = useMemo<Study[]>(
        () => [
            {
                id: REAL_LUNG_SERIES.studyId,
                name: REAL_LUNG_SERIES.studyName,
                series: [
                    {
                        id: REAL_LUNG_SERIES.seriesId,
                        name: REAL_LUNG_SERIES.seriesName,
                        count: REAL_LUNG_SERIES.count,
                        kernel: REAL_LUNG_SERIES.kernel,
                        thickness: REAL_LUNG_SERIES.thickness,
                        kV: REAL_LUNG_SERIES.kV,
                        mAs: REAL_LUNG_SERIES.mAs,
                        fov: REAL_LUNG_SERIES.fov,
                        matrix: REAL_LUNG_SERIES.matrix,
                        images: Array.from({ length: REAL_LUNG_SERIES.count }).map((_, i) => ({
                            id: `img-qin-${i + 1}`,
                            name: `Image ${i + 1}`
                        }))
                    }
                ]
            }
        ],
        []
    );

    const seriesList = studyTree.flatMap((study) => study.series);
    const selectedSeries = seriesList.find((s) => s.id === selectedSeriesId) ?? seriesList[0];
    const totalSlices = selectedSeries.count;
    const pixelSpacingValue = (() => {
        const raw = meta.pixelSpacing.split("/")[0]?.trim() ?? "";
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    })();
    const clampSliceIndex = useCallback((value: number) => Math.max(0, Math.min(totalSlices - 1, value)), [totalSlices]);
    const buildVolumeProjection = (
        volume: VolumeData,
        mode: string,
        currentSlice: number
    ) => {
        const { rows, cols, depth, hu } = volume;
        const output = new Float32Array(rows * cols);
        const centerSlice = Math.max(0, Math.min(depth - 1, currentSlice));
        const slabRadius = mode === "MPR" ? 4 : 0;

        for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
                const pixelIndex = y * cols + x;
                if (mode === "MPR") {
                    let acc = 0;
                    let count = 0;
                    for (let z = Math.max(0, centerSlice - slabRadius); z <= Math.min(depth - 1, centerSlice + slabRadius); z += 1) {
                        acc += hu[z * rows * cols + pixelIndex];
                        count += 1;
                    }
                    output[pixelIndex] = acc / Math.max(count, 1);
                    continue;
                }

                if (mode === "VR") {
                    let composed = -1000;
                    let alpha = 0;
                    for (let z = 0; z < depth; z += 1) {
                        const sample = hu[z * rows * cols + pixelIndex];
                        const normalized = Math.min(1, Math.max(0, (sample + 1000) / 1800));
                        const opacity = Math.pow(normalized, 1.8) * 0.12;
                        composed += (sample - composed) * opacity * (1 - alpha);
                        alpha = Math.min(0.98, alpha + opacity * (1 - alpha));
                        if (alpha >= 0.98) break;
                    }
                    output[pixelIndex] = composed;
                    continue;
                }

                let projected = hu[pixelIndex];
                for (let z = 1; z < depth; z += 1) {
                    const sample = hu[z * rows * cols + pixelIndex];
                    if (mode === "MinIP") {
                        if (sample < projected) projected = sample;
                    } else if (sample > projected) {
                        projected = sample;
                    }
                }
                output[pixelIndex] = projected;
            }
        }

        return output;
    };
    const buildOrthoProjection = useCallback((
        volume: VolumeData,
        axis: ProjectionAxis,
        mode: string,
        currentSlice: number
    ) => {
        const { rows, cols, depth, hu } = volume;

        const centerY = Math.max(0, Math.min(rows - 1, Math.round((currentSlice / Math.max(depth - 1, 1)) * (rows - 1))));
        const centerX = Math.max(0, Math.min(cols - 1, Math.round((currentSlice / Math.max(depth - 1, 1)) * (cols - 1))));
        const slabRadius = mode === "MPR" ? 4 : 0;

        if (axis === "axial") {
            return {
                width: cols,
                height: rows,
                pixels: buildVolumeProjection(volume, mode, currentSlice),
            };
        }

        if (axis === "coronal") {
            const output = new Float32Array(cols * depth);
            for (let z = 0; z < depth; z += 1) {
                for (let x = 0; x < cols; x += 1) {
                    let value = hu[z * rows * cols + centerY * cols + x];
                    if (mode === "MPR") {
                        let acc = 0;
                        let count = 0;
                        for (let y = Math.max(0, centerY - slabRadius); y <= Math.min(rows - 1, centerY + slabRadius); y += 1) {
                            acc += hu[z * rows * cols + y * cols + x];
                            count += 1;
                        }
                        value = acc / Math.max(count, 1);
                    } else {
                        for (let y = 1; y < rows; y += 1) {
                            const sample = hu[z * rows * cols + y * cols + x];
                            if (mode === "MinIP") {
                                if (sample < value) value = sample;
                            } else if (mode === "VR") {
                                const normalized = Math.min(1, Math.max(0, (sample + 1000) / 1800));
                                const opacity = Math.pow(normalized, 1.8) * 0.12;
                                value += (sample - value) * opacity;
                            } else if (sample > value) {
                                value = sample;
                            }
                        }
                    }
                    output[z * cols + x] = value;
                }
            }
            return { width: cols, height: depth, pixels: output };
        }

        const output = new Float32Array(rows * depth);
        for (let z = 0; z < depth; z += 1) {
            for (let y = 0; y < rows; y += 1) {
                let value = hu[z * rows * cols + y * cols + centerX];
                if (mode === "MPR") {
                    let acc = 0;
                    let count = 0;
                    for (let x = Math.max(0, centerX - slabRadius); x <= Math.min(cols - 1, centerX + slabRadius); x += 1) {
                        acc += hu[z * rows * cols + y * cols + x];
                        count += 1;
                    }
                    value = acc / Math.max(count, 1);
                } else {
                    for (let x = 1; x < cols; x += 1) {
                        const sample = hu[z * rows * cols + y * cols + x];
                        if (mode === "MinIP") {
                            if (sample < value) value = sample;
                        } else if (mode === "VR") {
                            const normalized = Math.min(1, Math.max(0, (sample + 1000) / 1800));
                            const opacity = Math.pow(normalized, 1.8) * 0.12;
                            value += (sample - value) * opacity;
                        } else if (sample > value) {
                            value = sample;
                        }
                    }
                }
                output[z * rows + y] = value;
            }
        }
        return { width: rows, height: depth, pixels: output };
    }, []);
    const buildCoronalBodyMask = (volume: VolumeData) => {
        const { rows, cols, depth, hu } = volume;
        const mask = new Uint8Array(cols * depth);
        const threshold = -420;
        const minHits = Math.max(3, Math.round(rows * 0.015));

        for (let z = 0; z < depth; z += 1) {
            let rowStart = cols;
            let rowEnd = -1;
            for (let x = 0; x < cols; x += 1) {
                let hits = 0;
                let peak = -1024;
                for (let y = 0; y < rows; y += 1) {
                    const value = hu[z * rows * cols + y * cols + x];
                    if (value > peak) peak = value;
                    if (value > threshold) hits += 1;
                }
                if (hits >= minHits || peak > -180) {
                    mask[z * cols + x] = 255;
                    rowStart = Math.min(rowStart, x);
                    rowEnd = Math.max(rowEnd, x);
                }
            }

            if (rowEnd >= rowStart) {
                const pad = Math.max(2, Math.round((rowEnd - rowStart) * 0.03));
                const paddedStart = Math.max(0, rowStart - pad);
                const paddedEnd = Math.min(cols - 1, rowEnd + pad);
                for (let x = paddedStart; x <= paddedEnd; x += 1) {
                    mask[z * cols + x] = 255;
                }
            }
        }

        for (let pass = 0; pass < 2; pass += 1) {
            const refined = new Uint8Array(mask);
            for (let z = 1; z < depth - 1; z += 1) {
                for (let x = 1; x < cols - 1; x += 1) {
                    let neighbors = 0;
                    for (let dz = -1; dz <= 1; dz += 1) {
                        for (let dx = -1; dx <= 1; dx += 1) {
                            if (mask[(z + dz) * cols + (x + dx)] > 0) neighbors += 1;
                        }
                    }
                    if (neighbors >= 4) refined[z * cols + x] = 255;
                    if (neighbors <= 2) refined[z * cols + x] = 0;
                }
            }
            mask.set(refined);
        }

        return { width: cols, height: depth, mask };
    };
    const handleResetAll = () => {
        setRotation(0);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setInvert(false);
        setWw(defaultWindowRef.current.ww);
        setWl(defaultWindowRef.current.wl);
        setToolMode("pan");
        setMeasures([]);
        setAnnotations([]);
        setDraftMeasure(null);
        measureStartRef.current = null;
        dragRef.current = { dragging: false, x: 0, y: 0 };
    };

    const createColorizedCanvas = useCallback((
        width: number,
        height: number,
        pixels: Float32Array,
        options?: {
            pseudoColorMode?: PseudoColorMode;
            invertOverride?: boolean;
        }
    ) => {
        const offscreen = document.createElement("canvas");
        offscreen.width = width;
        offscreen.height = height;
        const offCtx = offscreen.getContext("2d");
        if (!offCtx) return null;

        const imageData = offCtx.createImageData(width, height);
        const out = imageData.data;
        const minVal = wl - ww / 2;
        const maxVal = wl + ww / 2;
        const range = Math.max(maxVal - minVal, 1);
        const pseudoColorMode = options?.pseudoColorMode ?? "灰阶";
        const invertState = options?.invertOverride ?? invert;

        for (let i = 0; i < pixels.length; i += 1) {
            const normalized = Math.min(1, Math.max(0, (pixels[i] - minVal) / range));
            const adjusted = invertState ? 1 - normalized : normalized;
            const [red, green, blue] = applyPseudoColor(pseudoColorMode, adjusted);
            const j = i * 4;
            out[j] = red;
            out[j + 1] = green;
            out[j + 2] = blue;
            out[j + 3] = 255;
        }

        offCtx.putImageData(imageData, 0, 0);
        return offscreen;
    }, [wl, ww, invert]);
    const createMaskCanvas = (width: number, height: number, mask: Uint8Array) => {
        const offscreen = document.createElement("canvas");
        offscreen.width = width;
        offscreen.height = height;
        const offCtx = offscreen.getContext("2d");
        if (!offCtx) return null;

        const imageData = offCtx.createImageData(width, height);
        const out = imageData.data;
        for (let i = 0; i < mask.length; i += 1) {
            const alpha = mask[i];
            const j = i * 4;
            out[j] = 255;
            out[j + 1] = 255;
            out[j + 2] = 255;
            out[j + 3] = alpha;
        }
        offCtx.putImageData(imageData, 0, 0);
        return offscreen;
    };

    const renderGrayscaleToCanvas = useCallback((
        canvas: HTMLCanvasElement | null,
        viewport: HTMLElement | null,
        width: number,
        height: number,
        pixels: Float32Array,
        options?: {
            overlayTitle?: string;
            overlayDetail?: string;
            fitMode?: "contain" | "cover";
            pseudoColorMode?: PseudoColorMode;
            physicalWidth?: number;
            physicalHeight?: number;
            corners?: {
                topLeft?: string[];
                topRight?: string[];
                bottomLeft?: string[];
                bottomRight?: string[];
            };
        }
    ) => {
        if (!canvas || !viewport || width <= 0 || height <= 0 || pixels.length === 0) return;
        const viewW = Math.max(1, Math.floor(viewport.clientWidth));
        const viewH = Math.max(1, Math.floor(viewport.clientHeight));
        if (canvas.width !== viewW || canvas.height !== viewH) {
            canvas.width = viewW;
            canvas.height = viewH;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const offscreen = createColorizedCanvas(width, height, pixels, {
            pseudoColorMode: options?.pseudoColorMode,
        });
        if (!offscreen) return;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, viewW, viewH);

        const physicalWidth = Math.max(options?.physicalWidth ?? width, 0.001);
        const physicalHeight = Math.max(options?.physicalHeight ?? height, 0.001);
        const scale = options?.fitMode === "cover"
            ? Math.max(viewW / physicalWidth, viewH / physicalHeight)
            : Math.min(viewW / physicalWidth, viewH / physicalHeight);
        const drawW = physicalWidth * scale;
        const drawH = physicalHeight * scale;
        const x = (viewW - drawW) / 2;
        const y = (viewH - drawH) / 2;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(offscreen, x, y, drawW, drawH);

        if (options?.overlayTitle || options?.overlayDetail) {
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(8, 8, 112, options.overlayDetail ? 34 : 20);
            ctx.fillStyle = "#E2E8F0";
            ctx.font = "700 10px monospace";
            if (options.overlayTitle) ctx.fillText(options.overlayTitle, 14, 21);
            if (options.overlayDetail) {
                ctx.font = "400 10px monospace";
                ctx.fillText(options.overlayDetail, 14, 34);
            }
        }

        const drawCornerBlock = (lines: string[] | undefined, x: number, y: number, align: CanvasTextAlign) => {
            if (!lines || lines.length === 0) return;
            ctx.fillStyle = "#CFD8DC";
            ctx.font = "10px monospace";
            ctx.textAlign = align;
            lines.forEach((line, index) => {
                ctx.fillText(line, x, y + index * 13);
            });
        };

        drawCornerBlock(options?.corners?.topLeft, 10, 18, "left");
        drawCornerBlock(options?.corners?.topRight, viewW - 10, 18, "right");
        drawCornerBlock(options?.corners?.bottomLeft, 10, viewH - 30, "left");
        drawCornerBlock(options?.corners?.bottomRight, viewW - 10, viewH - 30, "right");
    }, [createColorizedCanvas]);

    const screenToImage = (clientX: number, clientY: number) => {
        const viewport = viewportRef.current;
        const { rows, cols } = imgSizeRef.current;
        if (!viewport || rows === 0 || cols === 0) return null;
        const drawRect = drawRectRef.current;
        const rect = viewport.getBoundingClientRect();
        const sx = clientX - rect.left;
        const sy = clientY - rect.top;
        const rectW = Math.max(drawRect.w, 1);
        const rectH = Math.max(drawRect.h, 1);
        const nx = Math.min(1, Math.max(0, (sx - drawRect.x) / rectW));
        const ny = Math.min(1, Math.max(0, (sy - drawRect.y) / rectH));
        return {
            x: nx * cols,
            y: ny * rows,
        };
    };

    const imageToScreen = (x: number, y: number) => {
        const { rows, cols } = imgSizeRef.current;
        if (rows === 0 || cols === 0) return { x: 0, y: 0 };
        const drawRect = drawRectRef.current;
        return {
            x: drawRect.x + (x / cols) * drawRect.w,
            y: drawRect.y + (y / rows) * drawRect.h,
        };
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
                setRenderTick((n) => n + 1);
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
                const bitsAllocated = dataSet.uint16("x00280100") ?? 16;
                const pixelRepresentation = dataSet.uint16("x00280103") ?? 0;
                const intercept = Number(dataSet.string("x00281052") ?? "0");
                const slope = Number(dataSet.string("x00281053") ?? "1");
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

                const pixelDataElement = dataSet.elements.x7fe00010;
                if (!pixelDataElement || !canvasRef.current || rows === 0 || cols === 0) return;

                const pixelDataOffset = pixelDataElement.dataOffset;
                const pixelDataLength = pixelDataElement.length;
                const pixelData = byteArray.slice(pixelDataOffset, pixelDataOffset + pixelDataLength);
                const pixelBuffer = pixelData.buffer.slice(
                    pixelData.byteOffset,
                    pixelData.byteOffset + pixelData.byteLength
                );

                let values: Int16Array | Uint16Array;
                if (bitsAllocated === 16) {
                    values = pixelRepresentation === 1 ? new Int16Array(pixelBuffer) : new Uint16Array(pixelBuffer);
                } else {
                    values = new Uint16Array(pixelBuffer);
                }

                const parsedWw = Number.isFinite(wwFromTag) && wwFromTag > 1 ? wwFromTag : 350;
                const parsedWl = Number.isFinite(wcFromTag) ? wcFromTag : 45;
                defaultWindowRef.current = { ww: parsedWw, wl: parsedWl };
                if (sliceIndex === Math.floor(REAL_LUNG_SERIES.count / 2)) {
                    setWw(parsedWw);
                    setWl(parsedWl);
                }

                const huValues = new Float32Array(values.length);
                for (let i = 0; i < values.length; i += 1) {
                    huValues[i] = values[i] * slope + intercept;
                }
                huDataRef.current = huValues;
                imgSizeRef.current = { rows, cols };
                setRenderTick((n) => n + 1);

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
                    count: REAL_LUNG_SERIES.count,
                });
            } catch (error) {
                // Keep UI alive if one slice fails.
                console.error(error);
            }
        };

        loadSlice();
    }, [sliceIndex, selectedSeriesId, selectedSeries.name, clampSliceIndex]);

    useEffect(() => {
        const renderCurrentSlice = () => {
            const canvas = canvasRef.current;
            const viewport = viewportRef.current;
            const huValues = huDataRef.current;
            const { rows, cols } = imgSizeRef.current;
            if (!canvas || !viewport || !huValues || rows === 0 || cols === 0) return;

            const viewW = Math.max(1, Math.floor(viewport.clientWidth));
            const viewH = Math.max(1, Math.floor(viewport.clientHeight));
            if (canvas.width !== viewW || canvas.height !== viewH) {
                canvas.width = viewW;
                canvas.height = viewH;
            }
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            const offscreen = document.createElement("canvas");
            offscreen.width = cols;
            offscreen.height = rows;
            const offCtx = offscreen.getContext("2d");
            if (!offCtx) return;

            const imageData = offCtx.createImageData(cols, rows);
            const out = imageData.data;
            const minVal = wl - ww / 2;
            const maxVal = wl + ww / 2;
            const range = Math.max(maxVal - minVal, 1);

            for (let i = 0; i < huValues.length; i += 1) {
                const normalized = Math.min(1, Math.max(0, (huValues[i] - minVal) / range));
                const gray = Math.round(normalized * 255);
                const pixel = invert ? 255 - gray : gray;
                const j = i * 4;
                out[j] = pixel;
                out[j + 1] = pixel;
                out[j + 2] = pixel;
                out[j + 3] = 255;
            }
            offCtx.putImageData(imageData, 0, 0);

            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, viewW, viewH);

            const fitScale = Math.min(viewW / cols, viewH / rows);
            const drawScale = fitScale * zoom;
            const drawW = cols * drawScale;
            const drawH = rows * drawScale;
            const x = (viewW - drawW) / 2 + pan.x;
            const y = (viewH - drawH) / 2 + pan.y;
            drawRectRef.current = { x, y, w: drawW, h: drawH };

            ctx.imageSmoothingEnabled = true;
            ctx.save();
            if (rotation !== 0) {
                const cx = x + drawW / 2;
                const cy = y + drawH / 2;
                ctx.translate(cx, cy);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.translate(-cx, -cy);
            }
            ctx.drawImage(offscreen, x, y, drawW, drawH);
            ctx.restore();
        };

        renderCurrentSlice();
    }, [renderTick, ww, wl, zoom, pan, invert, rotation]);

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
            const distPx = Math.hypot(draftMeasure.sx2 - draftMeasure.sx1, draftMeasure.sy2 - draftMeasure.sy1);
            const pxPerImagePixel = Math.max(drawRectRef.current.w / Math.max(imgSizeRef.current.cols, 1), 0.0001);
            const dist = (distPx / pxPerImagePixel) * pixelSpacingValue;
            if (dist > 1) {
                setMeasures((prev) => [
                    ...prev,
                    {
                        id: `measure-${Date.now()}-${Math.random()}`,
                        slice: draftMeasure.slice,
                        sx1: draftMeasure.sx1,
                        sy1: draftMeasure.sy1,
                        sx2: draftMeasure.sx2,
                        sy2: draftMeasure.sy2,
                    },
                ]);
            }
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
    }, [toolMode, draftMeasure, pixelSpacingValue]);

    useEffect(() => {
        const volume = volumeDataRef.current;
        if (!volume) return;

        const { rows, cols, depth, hu } = volume;
        const coronalSlice = new Float32Array(cols * depth);
        const sagittalSlice = new Float32Array(rows * depth);
        const yIndex = Math.max(0, Math.min(rows - 1, Math.round((sliceIndex / Math.max(depth - 1, 1)) * (rows - 1))));
        const xIndex = Math.max(0, Math.min(cols - 1, Math.round((sliceIndex / Math.max(depth - 1, 1)) * (cols - 1))));

        for (let z = 0; z < depth; z += 1) {
            for (let x = 0; x < cols; x += 1) {
                coronalSlice[z * cols + x] = hu[z * rows * cols + yIndex * cols + x];
            }
            for (let y = 0; y < rows; y += 1) {
                sagittalSlice[z * rows + y] = hu[z * rows * cols + y * cols + xIndex];
            }
        }

        renderGrayscaleToCanvas(
            coronalCanvasRef.current,
            coronalViewportRef.current,
            cols,
            depth,
            coronalSlice,
            {
                overlayTitle: "Coronal",
                overlayDetail: `Y ${yIndex + 1}/${rows}`,
                physicalWidth: cols * volume.pixelSpacingX,
                physicalHeight: depth * volume.sliceSpacing,
                corners: {
                    topLeft: [
                        meta.patientName,
                        `${meta.patientSex} ${meta.patientAge}`,
                        `${meta.modality} | ${meta.studyDate} ${meta.studyTime}`,
                    ],
                    topRight: [
                        "Coronal MPR",
                        meta.seriesDescription,
                        `Y ${yIndex + 1}/${rows}`,
                    ],
                    bottomLeft: [
                        `WW/WL ${Math.round(ww)} / ${Math.round(wl)}`,
                        `Spacing ${volume.pixelSpacingX.toFixed(3)} / ${volume.sliceSpacing.toFixed(3)}`,
                        `${cols} x ${depth}`,
                    ],
                    bottomRight: [
                        `Source Slice ${sliceIndex + 1}/${depth}`,
                        `Thick ${meta.thickness}`,
                        `${meta.institution} | ${meta.manufacturer}`,
                    ],
                },
            }
        );
        renderGrayscaleToCanvas(
            sagittalCanvasRef.current,
            sagittalViewportRef.current,
            rows,
            depth,
            sagittalSlice,
            {
                overlayTitle: "Sagittal",
                overlayDetail: `X ${xIndex + 1}/${cols}`,
                physicalWidth: rows * volume.pixelSpacingY,
                physicalHeight: depth * volume.sliceSpacing,
                corners: {
                    topLeft: [
                        meta.patientName,
                        `${meta.patientSex} ${meta.patientAge}`,
                        `${meta.modality} | ${meta.studyDate} ${meta.studyTime}`,
                    ],
                    topRight: [
                        "Sagittal MPR",
                        meta.seriesDescription,
                        `X ${xIndex + 1}/${cols}`,
                    ],
                    bottomLeft: [
                        `WW/WL ${Math.round(ww)} / ${Math.round(wl)}`,
                        `Spacing ${volume.pixelSpacingY.toFixed(3)} / ${volume.sliceSpacing.toFixed(3)}`,
                        `${rows} x ${depth}`,
                    ],
                    bottomRight: [
                        `Source Slice ${sliceIndex + 1}/${depth}`,
                        `Thick ${meta.thickness}`,
                        `${meta.institution} | ${meta.manufacturer}`,
                    ],
                },
            }
        );
    }, [sliceIndex, renderTick, ww, wl, invert, meta, renderGrayscaleToCanvas]);

    useEffect(() => {
        const volume = volumeDataRef.current;
        if (!volume) return;

        const canvas = volumeCanvasRef.current;
        const viewport = volumeViewportRef.current;
        if (!canvas || !viewport) return;

        const projection = buildOrthoProjection(volume, "coronal", selectedRenderMode, sliceIndex);
        const physicalW = volume.cols * volume.pixelSpacingX;
        const physicalH = volume.depth * volume.sliceSpacing;

        const viewW = Math.max(1, Math.floor(viewport.clientWidth));
        const viewH = Math.max(1, Math.floor(viewport.clientHeight));
        if (canvas.width !== viewW || canvas.height !== viewH) {
            canvas.width = viewW;
            canvas.height = viewH;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const scale = Math.min((viewW - 40) / physicalW, (viewH - 40) / physicalH);
        const drawW = physicalW * scale;
        const drawH = physicalH * scale;
        const x = (viewW - drawW) / 2;
        const y = (viewH - drawH) / 2;

        ctx.fillStyle = "#020617";
        ctx.fillRect(0, 0, viewW, viewH);

        const colorized = createColorizedCanvas(projection.width, projection.height, projection.pixels, {
            pseudoColorMode: selectedPseudoColor
        });

        if (colorized) {
            ctx.imageSmoothingEnabled = true;

            if (selectedRenderMode === "VR" || selectedRenderMode === "MIP") {
                const overlayCanvas = document.createElement("canvas");
                overlayCanvas.width = projection.width;
                overlayCanvas.height = projection.height;
                const overlayCtx = overlayCanvas.getContext("2d");
                if (overlayCtx) {
                    overlayCtx.drawImage(colorized, 0, 0);

                    const mask = buildCoronalBodyMask(volume);
                    const maskCanvas = createMaskCanvas(mask.width, mask.height, mask.mask);
                    if (maskCanvas) {
                        overlayCtx.globalCompositeOperation = "destination-in";
                        overlayCtx.drawImage(maskCanvas, 0, 0);
                        overlayCtx.globalCompositeOperation = "source-over";
                    }

                    ctx.shadowBlur = 25;
                    ctx.shadowColor = "rgba(0,0,0,0.8)";
                    ctx.drawImage(overlayCanvas, x, y, drawW, drawH);
                    ctx.shadowBlur = 0;

                    const gradient = ctx.createLinearGradient(x, y, x + drawW, y + drawH);
                    gradient.addColorStop(0, "rgba(255,255,255,0.06)");
                    gradient.addColorStop(0.5, "rgba(255,255,255,0)");
                    gradient.addColorStop(1, "rgba(0,0,0,0.1)");
                    ctx.fillStyle = gradient;
                    ctx.globalCompositeOperation = "source-atop";
                    ctx.fillRect(x, y, drawW, drawH);
                    ctx.globalCompositeOperation = "source-over";
                }
            } else {
                ctx.drawImage(colorized, x, y, drawW, drawH);
            }
        }

        const title = selectedRenderMode === "VR" ? "Volume" : selectedRenderMode;
        const detail = `${volume.depth} slices composited | ${selectedPseudoColor}`;

        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(10, 10, 180, 40);
        ctx.fillStyle = "#F8FAFC";
        ctx.font = "bold 12px Inter, system-ui, sans-serif";
        ctx.fillText(title, 20, 26);
        ctx.font = "400 11px Inter, system-ui, sans-serif";
        ctx.fillStyle = "#94A3B8";
        ctx.fillText(detail, 20, 41);

        const drawCornerBlock = (lines: string[], x: number, y: number, align: CanvasTextAlign) => {
            ctx.fillStyle = "#94A3B8";
            ctx.font = "11px monospace";
            ctx.textAlign = align;
            lines.forEach((line, index) => {
                ctx.fillText(line, x, y + index * 15);
            });
        };

        drawCornerBlock([
            meta.patientName,
            `${meta.patientSex} ${meta.patientAge}`,
            `${meta.modality} | ${meta.studyDate}`,
        ], 12, 65, "left");

        drawCornerBlock([
            `WW/WL ${Math.round(ww)}/${Math.round(wl)}`,
            `FOV ${physicalW.toFixed(0)}mm x ${physicalH.toFixed(0)}mm`,
        ], 12, viewH - 45, "left");

        drawCornerBlock([
            `Slice ${sliceIndex + 1}/${volume.depth}`,
            `${meta.institution}`,
        ], viewW - 12, viewH - 45, "right");
    }, [sliceIndex, selectedRenderMode, selectedLayout, selectedPseudoColor, renderTick, ww, wl, invert, meta, buildOrthoProjection, createColorizedCanvas]);

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl">
            <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                        <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
                            <User size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold text-[#37474F]">Roky Zhang</span>
                            <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5">ID: 67890</span>
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
                    <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">13:52</div>
                    <div className="text-[12px] text-[#546E7A] font-medium mt-1 uppercase opacity-80">2月26日 周四</div>
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
                            <div key={study.id} className="mb-2">
                                <div className="px-2 py-1.5 text-[11px] font-black text-[#546E7A] uppercase tracking-wide">
                                    {study.name}
                                </div>
                                <div className="pl-2 border-l border-[#DCE6F2] ml-2">
                                    {study.series.map((series) => {
                                        const active = series.id === selectedSeriesId;
                                        return (
                                            <button
                                                key={series.id}
                                                onClick={() => {
                                                    setSelectedSeriesId(series.id);
                                                }}
                                                className={`w-full text-left mb-1.5 rounded-md border px-3 py-2 transition-all ${active
                                                    ? "bg-[#E3F2FD] border-[#90CAF9]"
                                                    : "bg-white border-[#DCE6F2] hover:bg-[#F8FAFC]"
                                                    }`}
                                            >
                                                <div className={`text-[12px] font-bold ${active ? "text-[#1565C0]" : "text-[#37474F]"}`}>{series.name}</div>
                                                <div className="text-[10px] text-[#78909C] mt-0.5">{series.count} images</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="h-[44px] bg-[#F8FAFC] border-b border-t border-[#EEF2F9] px-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <SlidersHorizontal size={14} className="text-[#4D94FF]" />
                            <span className="text-[11px] font-black uppercase tracking-wider text-[#37474F]">PARAMS</span>
                        </div>
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
                    </div>

                    <div className="flex-1 bg-[#F8FAFC] overflow-hidden flex flex-col">
                        <div className="flex-1 p-3 grid grid-cols-2 gap-2 overflow-y-auto">
                            {imageMode === "2D" ? (
                                <>
                                    <Param label="Kernel" value={selectedSeries.kernel} />
                                    <Param label="Slice" value={selectedSeries.thickness} />
                                    <Param label="kV" value={selectedSeries.kV} />
                                    <Param label="mAs" value={selectedSeries.mAs} />
                                    <Param label="FOV" value={selectedSeries.fov} />
                                    <Param label="Matrix" value={selectedSeries.matrix} />
                                </>
                            ) : (
                                <div className="col-span-2 flex flex-col gap-5 pt-1">
                                    {/* Layout Dropdown */}
                                    <div className="flex flex-col gap-2 relative">
                                        <span className="text-[12px] font-bold text-[#546E7A]">屏幕布局 (Layouts):</span>
                                        <div
                                            onClick={() => setIsLayoutOpen(!isLayoutOpen)}
                                            className={`h-[40px] w-full bg-white border-2 rounded-lg px-3 flex items-center justify-between shadow-[0_2px_8px_rgba(77,148,255,0.1)] cursor-pointer transition-all ${isLayoutOpen ? 'border-[#4D94FF]' : 'border-[#4D94FF]'}`}
                                        >
                                            <span className="text-[14px] font-bold text-[#37474F]">{selectedLayout}</span>
                                            <ChevronDown size={16} className={`text-[#4D94FF] transition-transform ${isLayoutOpen ? 'rotate-180' : ''}`} />
                                        </div>

                                        {isLayoutOpen && (
                                            <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
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
                                                        onClick={() => {
                                                            setSelectedLayout(opt);
                                                            setIsLayoutOpen(false);
                                                        }}
                                                        className={`px-3 py-2.5 text-[14px] font-medium cursor-pointer transition-colors ${selectedLayout === opt ? 'bg-[#E0E0E0] text-[#37474F]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                    >
                                                        {opt}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="h-[1px] bg-[#EEF2F9] mx-1" />

                                    {/* Render Mode Dropdown */}
                                    <div className="flex flex-col gap-2 relative">
                                        <span className="text-[12px] font-bold text-[#546E7A]">渲染模式 (Render Mode):</span>
                                        <div
                                            onClick={() => setIsRenderModeOpen(!isRenderModeOpen)}
                                            className={`h-[40px] w-full bg-white border rounded-lg px-3 flex items-center justify-between shadow-sm cursor-pointer transition-all ${isRenderModeOpen ? 'border-[#4D94FF] ring-2 ring-[#4D94FF]/10' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                        >
                                            <span className="text-[14px] font-bold text-[#37474F]">{selectedRenderMode}</span>
                                            <ChevronDown size={16} className={`text-[#94A3B8] transition-transform ${isRenderModeOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                        </div>

                                        {isRenderModeOpen && (
                                            <div className="absolute bottom-[calc(100%+4px)] left-0 right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                                                {[
                                                    "MIP",
                                                    "MPR",
                                                    "VR",
                                                    "MinIP"
                                                ].map((opt) => (
                                                    <div
                                                        key={opt}
                                                        onClick={() => {
                                                            setSelectedRenderMode(opt);
                                                            setIsRenderModeOpen(false);
                                                        }}
                                                        className={`px-3 py-2.5 text-[14px] font-medium cursor-pointer transition-colors ${selectedRenderMode === opt ? 'bg-[#E0E0E0] text-[#37474F]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
                                                    >
                                                        {opt}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="h-[1px] bg-[#EEF2F9] mx-1" />

                                    <div className="flex flex-col gap-2 relative">
                                        <span className="text-[12px] font-bold text-[#546E7A]">伪彩方案 (Pseudo Color):</span>
                                        <div
                                            onClick={() => setIsPseudoColorOpen(!isPseudoColorOpen)}
                                            className={`h-[40px] w-full bg-white border rounded-lg px-3 flex items-center justify-between shadow-sm cursor-pointer transition-all ${isPseudoColorOpen ? 'border-[#4D94FF] ring-2 ring-[#4D94FF]/10' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}
                                        >
                                            <span className="text-[14px] font-bold text-[#37474F]">{selectedPseudoColor}</span>
                                            <ChevronDown size={16} className={`text-[#94A3B8] transition-transform ${isPseudoColorOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                        </div>

                                        {isPseudoColorOpen && (
                                            <div className="absolute bottom-[calc(100%+4px)] left-0 right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                                                {PSEUDO_COLOR_OPTIONS.map((opt) => (
                                                    <div
                                                        key={opt}
                                                        onClick={() => {
                                                            setSelectedPseudoColor(opt);
                                                            setIsPseudoColorOpen(false);
                                                        }}
                                                        className={`px-3 py-2.5 text-[14px] font-medium cursor-pointer transition-colors ${selectedPseudoColor === opt ? 'bg-[#E0E0E0] text-[#37474F]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}
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
                        <div className="px-3 pb-3">
                            <button className="h-[32px] w-full bg-white border border-[#B0C4DE] rounded-md text-[10px] font-bold text-[#4D94FF] hover:bg-blue-50 transition-all shadow-sm">
                                详情
                            </button>
                        </div>
                    </div>
                </aside>

                <div className="flex-1 flex min-w-0 rounded-lg border border-[#B0C4DE] bg-[#0F172A] shadow-sm overflow-hidden">
                    <div className={viewerWorkspaceClassName}>
                        <section
                            ref={viewportRef}
                            className={`${imageMode === "3D" ? currentLayoutSpec.panels.axial : "flex-1 min-w-0 bg-black overflow-hidden relative"} ${toolMode === "measure" ? "cursor-crosshair" : toolMode === "annotate" ? "cursor-cell" : toolMode === "pan" ? "cursor-grab" : "cursor-default"}`}
                            onWheel={(e) => {
                                e.preventDefault();
                                if (e.ctrlKey) {
                                    setZoom((prev) => Math.min(4, Math.max(0.3, prev + (e.deltaY > 0 ? -0.05 : 0.05))));
                                } else {
                                    setSliceIndex((prev) => {
                                        const next = e.deltaY > 0 ? prev + 1 : prev - 1;
                                        return Math.max(0, Math.min(totalSlices - 1, next));
                                    });
                                }
                            }}
                        >
                            <canvas
                                ref={canvasRef}
                                className="absolute inset-0 w-full h-full"
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    if (e.button !== 0) return;
                                    if (toolMode === "measure") {
                                        const point = screenPointInViewport(e.clientX, e.clientY);
                                        if (!point) return;
                                        measureStartRef.current = point;
                                        setDraftMeasure({
                                            sx1: point.x,
                                            sy1: point.y,
                                            sx2: point.x,
                                            sy2: point.y,
                                            slice: sliceIndex,
                                        });
                                        return;
                                    }
                                    if (toolMode === "annotate") {
                                        const point = screenToImage(e.clientX, e.clientY);
                                        if (!point) return;
                                        const noteCount = annotations.filter((a) => a.slice === sliceIndex && a.kind === "text").length;
                                        setAnnotations((prev) => [
                                            ...prev,
                                            {
                                                id: `anno-text-${Date.now()}-${Math.random()}`,
                                                kind: "text",
                                                slice: sliceIndex,
                                                x: point.x,
                                                y: point.y,
                                                text: `Note ${noteCount + 1}`,
                                            },
                                        ]);
                                        return;
                                    }
                                    dragRef.current = { dragging: true, x: e.clientX, y: e.clientY };
                                }}
                                onMouseMove={(e) => {
                                    e.stopPropagation();
                                    if (toolMode === "measure" && measureStartRef.current) {
                                        const point = screenPointInViewport(e.clientX, e.clientY);
                                        if (!point) return;
                                        setDraftMeasure((prev) => (prev ? { ...prev, sx2: point.x, sy2: point.y } : null));
                                        return;
                                    }
                                    if (!dragRef.current.dragging) return;
                                    const dx = e.clientX - dragRef.current.x;
                                    const dy = e.clientY - dragRef.current.y;
                                    dragRef.current = { dragging: true, x: e.clientX, y: e.clientY };
                                    if (toolMode === "pan") {
                                        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
                                    } else if (toolMode === "wl") {
                                        setWl((prev) => prev + dx * 0.8);
                                        setWw((prev) => Math.max(1, prev + dy * 1.2));
                                    }
                                }}
                                onMouseUp={(e) => {
                                    e.stopPropagation();
                                    if (toolMode === "measure" && draftMeasure) {
                                        const distPx = Math.hypot(draftMeasure.sx2 - draftMeasure.sx1, draftMeasure.sy2 - draftMeasure.sy1);
                                        const pxPerImagePixel = Math.max(drawRectRef.current.w / Math.max(imgSizeRef.current.cols, 1), 0.0001);
                                        const dist = (distPx / pxPerImagePixel) * pixelSpacingValue;
                                        if (dist > 1) {
                                            setMeasures((prev) => [
                                                ...prev,
                                                {
                                                    id: `measure-${Date.now()}-${Math.random()}`,
                                                    slice: draftMeasure.slice,
                                                    sx1: draftMeasure.sx1,
                                                    sy1: draftMeasure.sy1,
                                                    sx2: draftMeasure.sx2,
                                                    sy2: draftMeasure.sy2,
                                                },
                                            ]);
                                        }
                                        setDraftMeasure(null);
                                        measureStartRef.current = null;
                                        return;
                                    }
                                    dragRef.current.dragging = false;
                                }}
                                onMouseLeave={(e) => {
                                    e.stopPropagation();
                                    if (toolMode === "measure" && draftMeasure) {
                                        const distPx = Math.hypot(draftMeasure.sx2 - draftMeasure.sx1, draftMeasure.sy2 - draftMeasure.sy1);
                                        const pxPerImagePixel = Math.max(drawRectRef.current.w / Math.max(imgSizeRef.current.cols, 1), 0.0001);
                                        const dist = (distPx / pxPerImagePixel) * pixelSpacingValue;
                                        if (dist > 1) {
                                            setMeasures((prev) => [
                                                ...prev,
                                                {
                                                    id: `measure-${Date.now()}-${Math.random()}`,
                                                    slice: draftMeasure.slice,
                                                    sx1: draftMeasure.sx1,
                                                    sy1: draftMeasure.sy1,
                                                    sx2: draftMeasure.sx2,
                                                    sy2: draftMeasure.sy2,
                                                },
                                            ]);
                                        }
                                        setDraftMeasure(null);
                                        measureStartRef.current = null;
                                    }
                                    dragRef.current.dragging = false;
                                }}
                            />
                            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                                {measures
                                    .filter((a) => a.slice === sliceIndex)
                                    .map((a) => {
                                        const mx = (a.sx1 + a.sx2) / 2;
                                        const my = (a.sy1 + a.sy2) / 2;
                                        const distPx = Math.hypot(a.sx2 - a.sx1, a.sy2 - a.sy1);
                                        const pxPerImagePixel = Math.max(drawRectRef.current.w / Math.max(imgSizeRef.current.cols, 1), 0.0001);
                                        const mm = (distPx / pxPerImagePixel) * pixelSpacingValue;
                                        return (
                                            <g key={a.id}>
                                                <line x1={a.sx1} y1={a.sy1} x2={a.sx2} y2={a.sy2} stroke="#FF4D4F" strokeWidth="2" />
                                                <circle cx={a.sx1} cy={a.sy1} r="2.8" fill="#FF4D4F" />
                                                <circle cx={a.sx2} cy={a.sy2} r="2.8" fill="#FF4D4F" />
                                                <rect x={mx - 26} y={my - 13} width="52" height="15" rx="3" fill="rgba(0,0,0,0.72)" />
                                                <text x={mx} y={my - 2} fill="#FFEAEA" fontSize="10" fontFamily="monospace" textAnchor="middle">
                                                    {mm.toFixed(1)} mm
                                                </text>
                                            </g>
                                        );
                                    })}
                                {annotations
                                    .filter((a): a is TextAnnotation => a.slice === sliceIndex && a.kind === "text")
                                    .map((a) => {
                                        const p = imageToScreen(a.x, a.y);
                                        return (
                                            <g key={a.id}>
                                                <circle cx={p.x} cy={p.y} r="3" fill="#FFD54F" />
                                                <rect x={p.x + 6} y={p.y - 12} width="58" height="16" rx="3" fill="rgba(0,0,0,0.75)" />
                                                <text x={p.x + 35} y={p.y - 1} fill="#FFF8E1" fontSize="10" fontFamily="monospace" textAnchor="middle">
                                                    {a.text}
                                                </text>
                                            </g>
                                        );
                                    })}
                                {draftMeasure && (() => {
                                    const distPx = Math.hypot(draftMeasure.sx2 - draftMeasure.sx1, draftMeasure.sy2 - draftMeasure.sy1);
                                    const pxPerImagePixel = Math.max(drawRectRef.current.w / Math.max(imgSizeRef.current.cols, 1), 0.0001);
                                    const mm = (distPx / pxPerImagePixel) * pixelSpacingValue;
                                    return (
                                        <g>
                                            <line x1={draftMeasure.sx1} y1={draftMeasure.sy1} x2={draftMeasure.sx2} y2={draftMeasure.sy2} stroke="#FF4D4F" strokeWidth="2" strokeDasharray="4 3" />
                                            <text x={(draftMeasure.sx1 + draftMeasure.sx2) / 2} y={(draftMeasure.sy1 + draftMeasure.sy2) / 2 - 6} fill="#FFEAEA" fontSize="10" fontFamily="monospace" textAnchor="middle">
                                                {mm.toFixed(1)} mm
                                            </text>
                                        </g>
                                    );
                                })()}
                            </svg>
                            <div className="absolute top-2 left-2 text-[10px] text-[#CFD8DC] font-mono leading-[1.35] pointer-events-none">
                                {imageMode === "3D" && (
                                    <div className="mb-2 inline-flex h-[18px] items-center rounded-full border border-white/10 bg-black/55 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#93C5FD]">
                                        Axial
                                    </div>
                                )}
                                <div className="font-bold">{meta.patientName}</div>
                                <div>ID {meta.patientId} | {meta.patientSex} {meta.patientAge}</div>
                                <div>{meta.modality} | {meta.studyDate} {meta.studyTime}</div>
                            </div>
                            <div className="absolute top-2 right-2 text-[10px] text-[#CFD8DC] font-mono text-right leading-[1.35] pointer-events-none">
                                <div className="font-bold">{meta.seriesDescription}</div>
                                <div>Image {sliceIndex + 1}/{meta.count}</div>
                                <div>KV {meta.kvp} | mAs {meta.mas}</div>
                            </div>
                            <div className="absolute bottom-2 left-2 text-[10px] text-[#CFD8DC] font-mono leading-[1.35] pointer-events-none">
                                <div>WW/WL {Math.round(ww)} / {Math.round(wl)}</div>
                                <div>Spacing {meta.pixelSpacing}</div>
                                <div>{meta.rows} x {meta.cols} | Zoom {zoom.toFixed(2)}x</div>
                            </div>
                            <div className="absolute bottom-2 right-2 text-[10px] text-[#CFD8DC] font-mono text-right leading-[1.35] pointer-events-none">
                                <div>Slice {sliceIndex + 1}/{meta.count} | Thick {meta.thickness}</div>
                                <div>Location {meta.sliceLocation}</div>
                                <div>{meta.institution} | {meta.manufacturer}</div>
                            </div>
                        </section>
                        {imageMode === "3D" && (
                            <>
                                <div ref={coronalViewportRef} className={currentLayoutSpec.panels.coronal}>
                                    <canvas ref={coronalCanvasRef} className="absolute inset-0 h-full w-full" />
                                </div>
                                <div ref={sagittalViewportRef} className={currentLayoutSpec.panels.sagittal}>
                                    <canvas ref={sagittalCanvasRef} className="absolute inset-0 h-full w-full" />
                                </div>
                                <div ref={volumeViewportRef} className={currentLayoutSpec.panels.volume}>
                                    <canvas ref={volumeCanvasRef} className="absolute inset-0 h-full w-full" />
                                    <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
                                    <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center rounded-full border border-emerald-300/25 bg-black/45 px-2 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-[#86EFAC]">
                                        {selectedRenderMode === "VR" ? "3D Volume" : selectedRenderMode}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    <aside className="w-[72px] bg-[#111827] border-l border-white/10 overflow-hidden shrink-0 flex flex-col">
                        <div className="flex-1 flex flex-col gap-1 p-2 pt-3" onPointerDown={(e) => e.stopPropagation()}>
                            {(["pan", "wl", "measure", "annotate"] as const).map((mode, i) => {
                                const icons = [
                                    <Hand size={20} strokeWidth={1.5} key="hand" />,
                                    <CircleDot size={20} strokeWidth={1.5} key="circle" />,
                                    <Ruler size={20} strokeWidth={1.5} key="ruler" />,
                                    <Pencil size={20} strokeWidth={1.5} key="pencil" />,
                                ];
                                const titles = ["Pan", "WW/WL", "Measure", "Annotate"];
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
                                { title: "Zoom In", icon: <ZoomIn size={20} strokeWidth={1.5} />, action: () => setZoom((z) => Math.min(4, z + 0.1)) },
                                { title: "Zoom Out", icon: <ZoomOut size={20} strokeWidth={1.5} />, action: () => setZoom((z) => Math.max(0.3, z - 0.1)) },
                                {
                                    title: "Fit to Screen", icon: <Maximize size={20} strokeWidth={1.5} />, action: () => {
                                        setZoom(1);
                                        setPan({ x: 0, y: 0 });
                                    }
                                },
                                {
                                    title: "Reset", icon: <RefreshCw size={20} strokeWidth={1.5} />, action: () => {
                                        handleResetAll();
                                    }
                                },
                                {
                                    title: isPlaying ? "Pause" : "Play",
                                    icon: isPlaying ? <Pause size={20} strokeWidth={1.5} /> : <Play size={20} strokeWidth={1.5} />,
                                    action: () => {
                                        setIsPlaying((prev) => !prev);
                                    },
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
                        </div>
                    </aside>
                </div>
            </main>

            <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10">
                <div className="flex-1">
                    <button className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-solid shadow-sm transition-all uppercase text-[13px] active:scale-95">
                        <ChevronLeft size={20} /> 高级处理
                    </button>
                </div>
                <div className="flex-1 flex justify-end">
                    <button className="flex items-center gap-2 px-10 h-[52px] bg-[#4D94FF] text-white font-bold rounded-md shadow-lg hover:bg-blue-600 transition-all uppercase text-[13px] active:scale-95">
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

export default ViewScreen;
