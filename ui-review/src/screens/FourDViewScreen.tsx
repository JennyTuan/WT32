import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    SlidersHorizontal,
    Hand,
    Ruler,
    Pencil,
    Eraser,
    Waves,
    Flame,
    Siren,
    Network,
    Sun,
    Settings,
    ZoomIn,
    ZoomOut,
    Maximize,
    RefreshCw,
    Play,
    Pause,
    Trash2,
    ChevronDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as dicomParser from "dicom-parser";
import DicomViewer, { type DicomViewerHandle } from "../components/DicomViewer";
import CornerstoneMPRViewport, { type CornerstoneMPRHandle } from "../components/CornerstoneMPRViewport";
import {
    fetchSelectedScanSession,
    type ApiScanSessionDetail,
} from "../lib/scanSession";

type ImageItem = { id: string; name: string };
type SeriesType = "topogram" | "helical" | "axial" | "4d" | "static";
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
    defaultWw?: number;
    defaultWl?: number;
};
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
type VolumeData = {
    rows: number;
    cols: number;
    depth: number;
    hu: Float32Array;
    pixelSpacingX: number;
    pixelSpacingY: number;
    sliceSpacing: number;
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


const WINDOW_PRESETS: Record<string, { ww: number, wl: number }> = {
    "纵隔": { ww: 350, wl: 50 },
    "肺窗": { ww: 1500, wl: -600 },
    "骨窗": { ww: 2000, wl: 500 },
    "血管": { ww: 600, wl: 150 },
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

const GatingViewScreen = () => {
    const navigate = useNavigate();
    const [selectedSeriesId, setSelectedSeriesId] = useState(REAL_LUNG_SERIES.seriesId);
    const [imageMode, setImageMode] = useState<"2D" | "3D">("2D");
    const [sliceIndex, setSliceIndex] = useState(Math.floor(REAL_LUNG_SERIES.count / 2));
    const [toolMode, setToolMode] = useState<"pan" | "wl" | "measure" | "annotate" | "eraser">("pan");
    const [displayWw, setDisplayWw] = useState(350);
    const [displayWl, setDisplayWl] = useState(45);
    const [isPlaying, setIsPlaying] = useState(false);
    const [windowSyncKey, setWindowSyncKey] = useState(0); 
    const [scanSession, setScanSession] = useState<ApiScanSessionDetail | null>(null);
    const dicomViewerRef = useRef<DicomViewerHandle>(null);
    const mprRef = useRef<CornerstoneMPRHandle>(null);
    const isSuppressingFeedbackRef = useRef(false);
    const feedbackTimerRef = useRef<number | null>(null);
    const hasInitializedSessionRef = useRef(false);

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

    const viewportRef = useRef<HTMLElement | null>(null);
    const dragRef = useRef<{ dragging: boolean; x: number; y: number }>({ dragging: false, x: 0, y: 0 });
    const measureStartRef = useRef<{ x: number; y: number } | null>(null);
    const volumeDataRef = useRef<VolumeData | null>(null);
    const defaultWindowRef = useRef({ ww: 350, wl: 45 });
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

    const [selectedRenderMode, setSelectedRenderMode] = useState("Average CT");
    const [selectedWindowPreset, setSelectedWindowPreset] = useState("纵隔");
    const [isRenderModeOpen, setIsRenderModeOpen] = useState(false);
    const [isWindowPresetOpen, setIsWindowPresetOpen] = useState(false);
    const [selectedPhase, setSelectedPhase] = useState(0);

    const studyTree = useMemo<Study[]>(() => {
        const makeImages = (count: number, prefix: string): ImageItem[] =>
            Array.from({ length: count }, (_, i) => ({ id: `${prefix}-img-${i + 1}`, name: `Image ${i + 1}` }));

        const getTissuePreset = (type: string) => {
            if (type === "lung") return WINDOW_PRESETS["肺窗"];
            if (type === "bone") return WINDOW_PRESETS["骨窗"];
            if (type === "vascular") return WINDOW_PRESETS["血管"];
            return WINDOW_PRESETS["纵隔"];
        };

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
                const p = s.helical_param ?? s.axial_param;
                const leafSeries: Series[] = s.recon_series.map((r) => {
                    const preset = getTissuePreset(r.recon_type);
                    return {
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
                        defaultWw: r.window_width || preset.ww,
                        defaultWl: r.window_level || preset.wl,
                        reconType: r.recon_type,
                    };
                });

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

        return [{
            id: `session-${scanSession.id}`,
            name: scanSession.name || "门控扫描序列",
            scanGroups,
        }];
    }, [scanSession]);

    const safeSeriesList = useMemo(() => {
        const list = studyTree.flatMap((study) => study.scanGroups.flatMap((g) => g.series));
        return list.length > 0 ? list : [{
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
    }, [studyTree]);
    
    const selectedSeries = safeSeriesList.find((s) => s.id === selectedSeriesId) ?? safeSeriesList[0];
    const totalSlices = selectedSeries.count;

    const clampSliceIndex = useCallback((value: number) => Math.max(0, Math.min(totalSlices - 1, value)), [totalSlices]);
    
    const handleWindowLevelChange = useCallback((wc: number, ww: number) => {
        if (!isSuppressingFeedbackRef.current) {
            setDisplayWl(wc);
            setDisplayWw(ww);
        }
    }, []);

    useEffect(() => {
        const first = safeSeriesList[0];
        if (!first) return;
        
        setSelectedSeriesId((prev) => {
            if (prev === REAL_LUNG_SERIES.seriesId && scanSession && !hasInitializedSessionRef.current) {
                return first.id;
            }
            if (!safeSeriesList.find((s) => s.id === prev)) return first.id;
            return prev;
        });

        if (scanSession && !hasInitializedSessionRef.current) {
            hasInitializedSessionRef.current = true;
            if (first.defaultWw != null && first.defaultWl != null) {
                setDisplayWw(first.defaultWw);
                setDisplayWl(first.defaultWl);
                setWindowSyncKey(k => k + 1);
                defaultWindowRef.current = { ww: first.defaultWw, wl: first.defaultWl };
                const foundPreset = Object.entries(WINDOW_PRESETS).find(
                    ([_, val]) => val.ww === first.defaultWw && val.wl === first.defaultWl
                );
                if (foundPreset) setSelectedWindowPreset(foundPreset[0]);
            }
        }
    }, [scanSession, safeSeriesList]);

    const seriesImageUrls = useMemo(
        () => Array.from({ length: totalSlices }, (_, index) => getSeriesDicomUrl(index)),
        [totalSlices]
    );

    const handleSeriesSelect = useCallback((seriesId: string) => {
        const nextSeries = safeSeriesList.find((series) => series.id === seriesId);
        setSelectedSeriesId(seriesId);
        setSliceIndex(getSeriesMidSliceIndex(nextSeries?.count ?? REAL_LUNG_SERIES.count));
        measureStartRef.current = null;
        dragRef.current = { dragging: false, x: 0, y: 0 };
        if (nextSeries?.defaultWw != null && nextSeries?.defaultWl != null) {
            setDisplayWw(nextSeries.defaultWw);
            setDisplayWl(nextSeries.defaultWl);
            setWindowSyncKey(k => k + 1);
            defaultWindowRef.current = { ww: nextSeries.defaultWw, wl: nextSeries.defaultWl };
            const foundPreset = Object.entries(WINDOW_PRESETS).find(
                ([_, val]) => val.ww === nextSeries.defaultWw && val.wl === nextSeries.defaultWl
            );
            if (foundPreset) setSelectedWindowPreset(foundPreset[0]);
        }
    }, [safeSeriesList]);

    const handleClearAllAnnotations = useCallback(() => {}, []);

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
            .catch(() => {});
    }, []);

    useEffect(() => {
        const loadVolume = async () => {
            try {
                const slices: Array<any> = [];
                for (let i = 1; i <= REAL_LUNG_SERIES.count; i += 1) {
                    const fileName = `1-${String(i).padStart(3, "0")}.dcm`;
                    const response = await fetch(`${REAL_LUNG_SERIES.basePath}/${fileName}`);
                    if (!response.ok) continue;
                    const arrayBuffer = await response.arrayBuffer();
                    const byteArray = new Uint8Array(arrayBuffer);
                    const dataSet = dicomParser.parseDicom(byteArray);
                    const rows = dataSet.uint16("x00280010") ?? 0;
                    const cols = dataSet.uint16("x00280011") ?? 0;
                    const intercept = Number(dataSet.string("x00281052") ?? "0");
                    const slope = Number(dataSet.string("x00281053") ?? "1");
                    const positionZ = Number((dataSet.string("x00200032") ?? "0\\0\\0").split("\\")[2] ?? 0);
                    const pixelSpacing = (dataSet.string("x00280030") ?? "1\\1").split("\\").map(Number);
                    const sliceThickness = Number(dataSet.string("x00180050") ?? "1");
                    const pixelDataElement = dataSet.elements.x7fe00010;
                    if (!pixelDataElement || rows === 0 || cols === 0) continue;
                    const pixelData = byteArray.slice(pixelDataElement.dataOffset, pixelDataElement.dataOffset + pixelDataElement.length);
                    const values = new Int16Array(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength / 2);
                    const hu = new Float32Array(values.length);
                    for (let j = 0; j < values.length; j += 1) hu[j] = values[j] * slope + intercept;
                    slices.push({ positionZ, hu, rows, cols, pixelSpacingX: pixelSpacing[1] || 1, pixelSpacingY: pixelSpacing[0] || 1, sliceThickness });
                }
                if (slices.length === 0) return;
                slices.sort((a, b) => b.positionZ - a.positionZ);
                const rows = slices[0].rows;
                const cols = slices[0].cols;
                const depth = slices.length;
                const hu = new Float32Array(rows * cols * depth);
                slices.forEach((s, idx) => hu.set(s.hu, idx * rows * cols));
                volumeDataRef.current = {
                    rows, cols, depth, hu,
                    pixelSpacingX: slices[0].pixelSpacingX,
                    pixelSpacingY: slices[0].pixelSpacingY,
                    sliceSpacing: depth > 1 ? Math.abs(slices[0].positionZ - slices[1].positionZ) : slices[0].sliceThickness,
                };
            } catch (e) { console.error(e); }
        };
        loadVolume();
    }, []);

    useEffect(() => {
        const loadSlice = async () => {
            try {
                const fileName = `1-${String(clampSliceIndex(sliceIndex) + 1).padStart(3, "0")}.dcm`;
                const url = `${REAL_LUNG_SERIES.basePath}/${fileName}`;
                const response = await fetch(url);
                if (!response.ok) return;
                const arrayBuffer = await response.arrayBuffer();
                const byteArray = new Uint8Array(arrayBuffer);
                const dataSet = dicomParser.parseDicom(byteArray);
                setMeta({
                    patientName: cleanOverlayText(formatPersonName(dataSet.string("x00100010"))),
                    patientId: cleanOverlayText(dataSet.string("x00100020")),
                    patientSex: cleanOverlayText(dataSet.string("x00100040")),
                    patientAge: cleanOverlayText(dataSet.string("x00101010")),
                    modality: "CT",
                    studyDate: formatDicomDate(dataSet.string("x00080020")),
                    studyTime: formatDicomTime(dataSet.string("x00080030")),
                    institution: cleanOverlayText(dataSet.string("x00080080")),
                    manufacturer: cleanOverlayText(dataSet.string("x00080070")),
                    seriesDescription: cleanOverlayText(dataSet.string("x0008103e") ?? selectedSeries.name),
                    seriesNumber: cleanOverlayText(dataSet.string("x00200011")),
                    instanceNumber: cleanOverlayText(dataSet.string("x00200013") ?? String(sliceIndex + 1)),
                    pixelSpacing: cleanOverlayText((dataSet.string("x00280030") ?? "N/A").replace("\\", " / ")),
                    sliceLocation: cleanOverlayText(dataSet.string("x00201041")),
                    kvp: cleanOverlayText(dataSet.string("x00180060")),
                    mas: cleanOverlayText(dataSet.string("x00181152")),
                    ww: Number(dataSet.string("x00281051") ?? 350),
                    wl: Number(dataSet.string("x00281050") ?? 45),
                    thickness: `${dataSet.string("x00180050") ?? "N/A"} mm`,
                    rows: dataSet.uint16("x00280010") ?? 0,
                    cols: dataSet.uint16("x00280011") ?? 0,
                    count: selectedSeries.count,
                });
            } catch (e) { console.error(e); }
        };
        loadSlice();
    }, [sliceIndex, selectedSeriesId, safeSeriesList]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowUp") setSliceIndex((p) => Math.min(totalSlices - 1, p + 1));
            if (e.key === "ArrowDown") setSliceIndex((p) => Math.max(0, p - 1));
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [totalSlices]);

    useEffect(() => {
        if (!isPlaying) return;
        const timer = window.setInterval(() => {
            setSliceIndex((p) => (p >= totalSlices - 1 ? 0 : p + 1));
        }, 200);
        return () => window.clearInterval(timer);
    }, [isPlaying, totalSlices]);

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl">
            <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                        <div className="w-10 h-10 rounded-sm bg-[#1A6EE0] flex items-center justify-center text-white">
                            <Waves size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold text-[#37474F]">{meta.patientName !== "N/A" ? meta.patientName : "门控患者"}</span>
                            <span className="text-[12px] text-[#1A6EE0] font-bold leading-none mt-0.5 uppercase tracking-wider">Gating Review Mode</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
                        <div className="text-[9px] font-bold italic">⊥ 0</div>
                        <div className="text-[9px] font-bold">∠ 0</div>
                        <div className="flex items-center gap-1 text-[11px] font-bold"><Flame size={14} /><span>0%</span></div>
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">{clockStr}</div>
                    <div className="text-[12px] text-[#546E7A] font-medium mt-1 uppercase opacity-80">{dateStr}</div>
                </div>
                <div className="flex items-center gap-5 pr-2">
                    <div className="p-1 text-[#D32F2F] cursor-pointer hover:opacity-70"><Siren size={30} strokeWidth={1.8} /></div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70"><Network size={24} /><span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">5</span></div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70"><Sun size={24} /></div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70"><Settings size={24} /><span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">10</span></div>
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden p-2 gap-2">
                <aside className="w-[240px] bg-white rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden shrink-0">
                    <div className="h-[44px] bg-[#F3F8FF] border-b border-[#DCE6F2] px-3 flex items-center gap-2">
                        <Waves size={14} className="text-[#1A6EE0]" /><span className="text-[11px] font-black uppercase tracking-wider text-[#1A6EE0]">门控图像序列</span>
                    </div>
                    <div className="h-[220px] overflow-y-auto p-2 border-b border-[#EEF2F9]">
                        {studyTree.map((study) => (
                            <div key={study.id} className="mb-1">
                                <div className="px-2 py-1.5 flex items-center gap-1.5"><span className="text-[10px] font-black text-[#546E7A] uppercase tracking-wide">{study.name}</span></div>
                                {study.scanGroups.map((group) => (
                                    <div key={group.id} className="mb-1.5">
                                        <div className="flex items-center gap-1.5 px-2 py-1"><span className="shrink-0 rounded px-1 py-0.5 text-[8px] font-black uppercase bg-orange-100 text-orange-700">门控</span><span className="text-[11px] font-bold text-[#37474F] truncate">{group.label}</span></div>
                                        <div className="ml-3 pl-2 border-l-2 border-[#DCE6F2] flex flex-col gap-1">
                                            {group.series.map((s) => (
                                                <button key={s.id} onClick={() => handleSeriesSelect(s.id)} className={`w-full text-left rounded-md border px-2.5 py-1.5 transition-all ${s.id === selectedSeriesId ? "bg-[#E3F2FD] border-[#90CAF9]" : "bg-white border-[#DCE6F2] hover:bg-[#F8FAFC]"}`}>
                                                    <div className={`text-[11px] font-bold ${s.id === selectedSeriesId ? "text-[#1565C0]" : "text-[#37474F]"}`}>{s.name}</div>
                                                    <div className="text-[9px] text-[#78909C] mt-0.5">{s.thickness}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                    <div className="h-[44px] bg-[#F8FAFC] border-b border-t border-[#EEF2F9] px-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2"><SlidersHorizontal size={14} className="text-[#4D94FF]" /><span className="text-[11px] font-black uppercase tracking-wider text-[#37474F]">PARAMS</span></div>
                        <div className="flex items-center gap-1 rounded-full border border-[#DCE6F2] bg-[#F1F5F9] p-[3px]">
                            {(["2D", "3D"] as const).map((mode) => (
                                <button key={mode} onClick={() => setImageMode(mode)} className={`min-w-[40px] h-[24px] px-2 rounded-full text-[10px] font-black ${imageMode === mode ? "bg-white text-[#4D94FF] shadow-sm border border-[#DCE6F2]/50" : "text-[#94A3B8]"}`}>{mode}</button>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 bg-[#F8FAFC] p-3 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-2">
                            {imageMode === "2D" ? (
                                <>
                                    <Param label="Kernel" value={selectedSeries.kernel} /><Param label="Thick" value={selectedSeries.thickness} />
                                    <Param label="FOV" value={selectedSeries.fov} /><Param label="Matrix" value={selectedSeries.matrix} />
                                </>
                            ) : (
                                <div className="col-span-2 flex flex-col gap-2">
                                    <div className="flex items-center gap-2 relative">
                                        <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[64px] shrink-0">三维重建</span>
                                        <div onClick={() => { setIsRenderModeOpen(!isRenderModeOpen); setIsWindowPresetOpen(false); }} className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between cursor-pointer transition-all ${isRenderModeOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}>
                                            <span className="text-[12px] font-medium text-[#37474F]">{selectedRenderMode}</span>
                                            <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isRenderModeOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                        </div>
                                        {isRenderModeOpen && (
                                            <div className="absolute top-[calc(100%+3px)] left-[48px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                                                {["Average CT", "MIP", "MinIP"].map((opt) => (
                                                    <div key={opt} onClick={() => { setSelectedRenderMode(opt); setIsRenderModeOpen(false); }} className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedRenderMode === opt ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}>{opt}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Always visible: Window Template & WW/WL Readout */}
                        <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-[#EEF2F9]">
                            <div className="flex items-center gap-2 relative z-40">
                                <span className="text-[11px] font-semibold text-[#546E7A] whitespace-nowrap w-[64px] shrink-0">窗模板</span>
                                <div onClick={() => { setIsWindowPresetOpen(!isWindowPresetOpen); setIsRenderModeOpen(false); }} className={`h-[30px] flex-1 bg-white border rounded-md px-2.5 flex items-center justify-between cursor-pointer transition-all ${isWindowPresetOpen ? 'border-[#4D94FF] ring-1 ring-[#4D94FF]/20' : 'border-[#DCE6F2] hover:border-[#4D94FF]/50'}`}>
                                    <span className="text-[12px] font-medium text-[#37474F]">{selectedWindowPreset}</span>
                                    <ChevronDown size={13} className={`text-[#94A3B8] transition-transform shrink-0 ml-1 ${isWindowPresetOpen ? 'rotate-180 text-[#4D94FF]' : ''}`} />
                                </div>
                                {isWindowPresetOpen && (
                                    <div className="absolute top-[calc(100%+3px)] left-[48px] right-0 bg-white border border-[#DCE6F2] rounded-lg shadow-xl py-1 overflow-hidden">
                                        {Object.entries(WINDOW_PRESETS).map(([name, val]) => (
                                            <div key={name} onClick={() => { 
                                                // SET SUPPRESSION FIRST to block any synchronous events
                                                if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
                                                isSuppressingFeedbackRef.current = true;
                                                feedbackTimerRef.current = window.setTimeout(() => {
                                                    isSuppressingFeedbackRef.current = false;
                                                }, 1000);

                                                setSelectedWindowPreset(name); 
                                                setIsWindowPresetOpen(false); 
                                                setDisplayWw(val.ww); 
                                                setDisplayWl(val.wl); 
                                                setWindowSyncKey(k => k + 1);
                                                
                                                // Force hammer the values into both viewports
                                                if (dicomViewerRef.current) dicomViewerRef.current.reset?.();
                                                if (mprRef.current) mprRef.current.forceWindowLevel?.(val.wl, val.ww);
                                            }} className={`px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors ${selectedWindowPreset === name ? 'bg-[#EBF3FF] text-[#4D94FF]' : 'text-[#37474F] hover:bg-[#F5F5F5]'}`}>{name}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                                <Param label="WW" value={String(Math.round(displayWw))} />
                                <Param label="WL" value={String(Math.round(displayWl))} />
                            </div>
                        </div>
                        <div className="mt-4 p-2 bg-blue-50/50 rounded border border-blue-100/50">
                            <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2">门控呼吸相位</div>
                            <div className="grid grid-cols-5 gap-1.5">
                                {Array.from({ length: 10 }, (_, i) => {
                                    const phasePercent = i * 10;
                                    const isSelected = selectedPhase === i;
                                    return (
                                        <button key={i} onClick={() => {
                                            setSelectedPhase(i);
                                            const phaseOffset = Math.floor((totalSlices / 10) * i);
                                            const newSlice = Math.min(phaseOffset + Math.floor(totalSlices / 20), totalSlices - 1);
                                            setSliceIndex(newSlice);
                                        }} className={`h-[32px] rounded-md text-[10px] font-bold transition-all ${isSelected ? 'bg-[#4D94FF] text-white shadow-md scale-105' : 'bg-white border border-[#DCE6F2] text-[#546E7A] hover:border-[#4D94FF] hover:text-[#4D94FF]'}`}>{phasePercent}%</button>
                                    );
                                })}
                            </div>
                            <div className="mt-2 text-center text-[9px] text-[#90A4AE]">当前相位: <span className="font-bold text-[#4D94FF]">{selectedPhase * 10}%</span></div>
                        </div>
                    </div>
                </aside>

                <div className="flex-1 min-w-0 flex overflow-hidden rounded-lg border border-[#B0C4DE]">
                    {imageMode === "3D" ? (
                        <div className="flex-1 min-w-0 relative">
                            <CornerstoneMPRViewport ref={mprRef} imageUrls={seriesImageUrls} windowCenter={displayWl} windowWidth={displayWw} activeTool={mapCornerstoneTool(toolMode)} renderMode={selectedRenderMode as any} currentSliceIndex={clampSliceIndex(sliceIndex)} windowSyncKey={windowSyncKey} onWindowLevelChange={handleWindowLevelChange} className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-[#0F172A]" />
                            <div className="absolute top-2 right-2 text-[10px] text-[#CFD8DC] font-mono pointer-events-none text-right"><div>WW: {Math.round(displayWw)}</div><div>WL: {Math.round(displayWl)}</div></div>
                        </div>
                    ) : (
                        <section ref={viewportRef} className="flex-1 min-w-0 bg-black relative">
                            <DicomViewer ref={dicomViewerRef} imageUrls={seriesImageUrls} currentImageIndex={clampSliceIndex(sliceIndex)} onImageIndexChange={setSliceIndex} activeTool={mapCornerstoneTool(toolMode)} windowCenter={displayWl} windowWidth={displayWw} windowSyncKey={windowSyncKey} onWindowLevelChange={handleWindowLevelChange} />
                            <div className="absolute top-2 left-2 text-[10px] text-[#CFD8DC] font-mono pointer-events-none"><div className="font-bold">{meta.patientName} (门控)</div><div>Image {sliceIndex + 1}/{selectedSeries.count}</div></div>
                            <div className="absolute bottom-2 right-2 text-[10px] text-[#CFD8DC] font-mono pointer-events-none text-right"><div>{meta.institution}</div><div>GATING MODE ENABLED</div></div>
                        </section>
                    )}
                    <aside className="w-[72px] bg-[#111827] border-l border-white/10 overflow-hidden shrink-0 flex flex-col">
                        <div className="flex-1 flex flex-col gap-1 p-2 pt-3">
                            {(["pan", "wl", "measure", "annotate", "eraser"] as const).map((mode) => (
                                <button key={mode} onClick={() => setToolMode(mode)} className={`w-11 h-11 rounded-lg flex items-center justify-center transition-all ${toolMode === mode ? "bg-[#3B82F6] text-white shadow-lg" : "text-[#94A3B8] hover:bg-white/5"}`}>
                                    {mode === "pan" && <Hand size={20} />}
                                    {mode === "wl" && <SlidersHorizontal size={20} />}
                                    {mode === "measure" && <Ruler size={20} />}
                                    {mode === "annotate" && <Pencil size={20} />}
                                    {mode === "eraser" && <Eraser size={20} />}
                                </button>
                            ))}
                            <div className="h-px bg-white/10 my-1 mx-2" />
                            {[
                                { title: "Zoom In", icon: <ZoomIn size={20} />, action: () => dicomViewerRef.current?.zoomIn() },
                                { title: "Zoom Out", icon: <ZoomOut size={20} />, action: () => dicomViewerRef.current?.zoomOut() },
                                { title: "Fit", icon: <Maximize size={20} />, action: () => dicomViewerRef.current?.fit() },
                                { title: "Reset", icon: <RefreshCw size={20} />, action: () => { dicomViewerRef.current?.reset(); setDisplayWw(defaultWindowRef.current.ww); setDisplayWl(defaultWindowRef.current.wl); } },
                                { title: isPlaying ? "Pause" : "Play", icon: isPlaying ? <Pause size={20} /> : <Play size={20} />, action: () => setIsPlaying(!isPlaying), active: isPlaying },
                            ].map((tool) => (
                                <button key={tool.title} title={tool.title} onClick={tool.action} className={`w-11 h-11 rounded-lg flex items-center justify-center transition-all ${tool.active ? "bg-[#3B82F6] text-white" : "text-[#94A3B8] hover:bg-white/5"}`}>{tool.icon}</button>
                            ))}
                            <div className="h-px bg-white/10 my-1 mx-2" />
                            <button title="Clear All" onClick={handleClearAllAnnotations} className="w-11 h-11 rounded-lg flex items-center justify-center text-[#FCA5A5] hover:bg-red-500/10 transition-all"><Trash2 size={20} /></button>
                        </div>
                    </aside>
                </div>
            </main>
            <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8">
                <div className="flex-1"><button onClick={() => navigate("/gating-signal-processing")} className="px-10 h-13 bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] text-[13px]">门控处理</button></div>
                <div className="flex-1 flex justify-end"><button onClick={() => navigate("/patients")} className="px-10 h-13 bg-[#4D94FF] text-white font-bold rounded-md shadow-lg text-[13px]">结束门控检查 </button></div>
            </footer>
        </div>
    );
};

const Param = ({ label, value }: { label: string; value: string }) => (
    <div className="p-2 bg-white border border-[#B0C4DE]/30 rounded-md flex flex-col items-center justify-center min-h-[56px]">
        <span className="text-[8px] font-black uppercase text-[#90A4AE]">{label}</span>
        <span className="text-[13px] font-black text-[#37474F] mt-1">{value}</span>
    </div>
);

export default GatingViewScreen;
