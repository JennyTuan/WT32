import { useState, useEffect, useRef } from "react";
import * as dicomParser from "dicom-parser";
import { useCallback, useMemo } from "react";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsUp,
    FilePlus,
    Trash2,
    ArrowUpDown,
    AlertTriangle,
    Check,
    CheckCircle,
    Info,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { loadSelectedPatient } from "../lib/patientSession";
import { saveScoutPositioningRange } from "../lib/scoutPositioningSession";
import { fetchSelectedScanSession, updateSelectedScanSessionTopogramParam } from "../lib/scanSession";
import { loadSelectedScanWorkflowPlans, type WorkflowSequenceType } from "../lib/scanWorkflowSession";
import { clearSelectedExamWorkflowState } from "../lib/workflowNavigationState";
import { mergeDualScoutPlanSequences } from "../lib/headDualScoutDemo";
import { DETAIL_TARGET_STORAGE_KEY } from "../features/protocolDetail/constants";
import AppHeader from "../components/AppHeader";
import { useI18n } from "../lib/i18nContext";
import { useRespiraScopeBreathing } from "../lib/respiraScopeBreathing";

interface Sequence {
    id: string;
    name: string;
    type: WorkflowSequenceType;
    steps?: string[];
}

interface ProtocolGroup {
    id: string;
    name: string;
    sequences: Sequence[];
}

const BREATHING_SCOUT_SERIES = {
    basePath: "/dicom/cap/soft",
    count: 120,
    fallbackWindowWidth: 350,
    fallbackWindowLevel: 45,
};

const BREATHING_HELICAL_PARAM_PREVIEW = {
    bedMode: "OUT",
    position: "HFS",
    scanLength: "165.0",
    mA: "215",
    kV: "120",
    rotationTime: "1.0",
    collimation: "32×0.6",
    pitch: "0.500",
    scoutFov: "500",
    angle: "0",
};

const BREATHING_BED_POSITION_COUNT = 10;
const BED_POSITION_MIN = 320;
const BED_POSITION_MAX = 780;
const EMPTY_BREATHING_WAVE_DATA = Array.from({ length: 500 }, () => 100);
const RESPIRASCOPE_STALE_MS = 5000;

type RespiraScopeUiSeverity = "ready" | "pending" | "warning" | "error";

type BreathingProjectionMeta = {
    width: number;
    height: number;
    ww: number;
    wl: number;
    kvp: string;
    mas: string;
    thickness: string;
};

type BreathingLoadedSlice = {
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
};

type BreathingCropBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type BreathingDragHandle = "move" | "top" | "bottom" | "left" | "right";

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
    return Math.min(1, Math.max(0, value));
}

function padWaveData(values: number[], length = 500, fallback = 100) {
    if (values.length >= length) return values.slice(-length);
    return [...new Array(length - values.length).fill(fallback), ...values];
}

function estimatePeakCvPercent(values: number[]) {
    const extremaWindow = 6;
    const recent = values.slice(-360);
    const peaks: number[] = [];
    if (recent.length < extremaWindow * 2 + 1) return null;

    const maxValue = Math.max(...recent);
    const minValue = Math.min(...recent);
    const threshold = minValue + (maxValue - minValue) * 0.68;

    for (let index = extremaWindow; index < recent.length - extremaWindow; index += 1) {
        const value = recent[index];
        const neighbors = [
            ...recent.slice(index - extremaWindow, index),
            ...recent.slice(index + 1, index + extremaWindow + 1),
        ];
        if (value > threshold && neighbors.every((neighbor) => value > neighbor)) {
            peaks.push(value);
        }
    }

    const latestPeaks = peaks.slice(-6);
    if (latestPeaks.length < 3) return null;

    const mean = latestPeaks.reduce((sum, value) => sum + value, 0) / latestPeaks.length;
    if (mean <= 0) return null;

    const variance = latestPeaks.reduce((sum, value) => sum + (value - mean) ** 2, 0) / latestPeaks.length;
    return Math.sqrt(variance) / mean * 100;
}

function clampBedPosition(value: number) {
    return Math.min(BED_POSITION_MAX, Math.max(BED_POSITION_MIN, value));
}

const BreathingHelicalParamCard = ({ label, value }: { label: string; value: string }) => (
    <div className="px-1.5 py-1 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{label}</span>
        <span className="mt-px text-[12px] font-black text-[#37474F]">{value}</span>
    </div>
);

type FourDScoutParams = {
    bedMode: string;
    position: string;
    scanLength: string;
    mA: string;
    kV: string;
    scoutAngle: string;
    ctdiVol: string;
    dlp: string;
};

function FourDScoutParamPanel({
    params,
    onChange,
    readOnly,
}: {
    params: FourDScoutParams;
    onChange: (key: keyof FourDScoutParams, value: string) => void;
    readOnly: boolean;
}) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const editableCardCls = `p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${
        readOnly ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"
    }`;
    const staticCardCls =
        "p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm";
    const doseCardCls =
        "p-1.5 bg-[#FFFBEB] border border-[#FDE68A]/80 rounded-md flex flex-col items-center justify-center shadow-sm";
    const labelCls = "text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter";
    const valueCls = "text-[13px] font-black text-[#37474F]";
    const doseLabelCls = "text-[9px] font-black text-[#B45309] uppercase tracking-tighter";
    const doseValueCls = "text-[13px] font-black text-[#B45309]";
    const chevronCls = `text-[#90A4AE] ${readOnly ? "" : "group-hover:text-[#4D94FF]"}`;

    return (
        <div className="flex-1 border-t border-[#EEF2F9] bg-[#F8FAFC] flex flex-col overflow-hidden">
            <div className="flex-1 p-2 pt-2 flex flex-col gap-2 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                        <span className={labelCls}>{t("scanFlow.inOutTable")}</span>
                        <div className="relative w-full">
                            <select
                                value={params.bedMode}
                                onChange={(e) => onChange("bedMode", e.target.value)}
                                disabled={readOnly}
                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                            >
                                <option value="in">{t("scanFlow.tableIn")}</option>
                                <option value="out">{t("scanFlow.tableOut")}</option>
                            </select>
                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                        </div>
                    </label>

                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                        <span className={labelCls}>{t("scanFlow.patientPosition")}</span>
                        <div className="relative w-full">
                            <select
                                value={params.position}
                                onChange={(e) => onChange("position", e.target.value)}
                                disabled={readOnly}
                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                            >
                                <option value="HFS">HFS</option>
                                <option value="FFS">FFS</option>
                                <option value="HFP">HFP</option>
                                <option value="FFP">FFP</option>
                                <option value="HFDR">HFDR</option>
                                <option value="FFDR">FFDR</option>
                                <option value="HFDL">HFDL</option>
                                <option value="FFDL">FFDL</option>
                            </select>
                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                        </div>
                    </label>

                    <div className={staticCardCls}>
                        <span className={labelCls}>{t("scanFlow.scanLength")}</span>
                        <span className={`${valueCls} mt-[1px]`}>{params.scanLength}</span>
                    </div>

                    <div className={editableCardCls}>
                        <span className={labelCls}>mA</span>
                        <div className="flex items-center gap-1 mt-[1px]">
                            <span className={valueCls}>{params.mA}</span>
                            <ChevronDown size={9} className={chevronCls} />
                        </div>
                    </div>

                    <div className={editableCardCls}>
                        <span className={labelCls}>KV</span>
                        <div className="flex items-center gap-1 mt-[1px]">
                            <span className={valueCls}>{params.kV}</span>
                            <ChevronDown size={9} className={chevronCls} />
                        </div>
                    </div>

                    <div className={editableCardCls}>
                        <span className={labelCls}>{t("scanFlow.flatScanAngle")}</span>
                        <div className="flex items-center gap-1 mt-[1px]">
                            <span className={valueCls}>{params.scoutAngle}</span>
                            <ChevronDown size={9} className={chevronCls} />
                        </div>
                    </div>

                    <div className={doseCardCls}>
                        <span className={doseLabelCls}>CTDIvol</span>
                        <span className={`${doseValueCls} mt-[1px]`}>{params.ctdiVol}</span>
                    </div>

                    <div className={doseCardCls}>
                        <span className={doseLabelCls}>DLP</span>
                        <span className={`${doseValueCls} mt-[1px]`}>{params.dlp}</span>
                    </div>
                </div>
            </div>

            <div className="p-2 flex justify-center shrink-0">
                <button
                    onClick={() => {
                        localStorage.setItem(DETAIL_TARGET_STORAGE_KEY, "topogram");
                        navigate("/protocol-detail");
                    }}
                    disabled={readOnly}
                    className={`h-[32px] w-full rounded-md text-[10px] font-bold flex items-center justify-center gap-1 border shadow-sm transition-all ${
                        readOnly
                            ? "cursor-not-allowed border-[#CBD5E1] bg-[#F1F5F9] text-[#94A3B8]"
                            : "border-[#B0C4DE] bg-white text-[#4D94FF] hover:bg-blue-50 active:scale-95"
                    }`}
                >
                    <Info size={14} /> {t("scanFlow.parameterDetails")}
                </button>
            </div>
        </div>
    );
}

function BreathingScoutViewport() {
    const { t } = useI18n();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const projectionRef = useRef<Float32Array | null>(null);
    const projectionSizeRef = useRef<{ width: number; height: number } | null>(null);
    const metaRef = useRef<BreathingProjectionMeta | null>(null);
    const dragStateRef = useRef<{ startX: number; startY: number; startWw: number; startWl: number } | null>(null);
    const cropDragStateRef = useRef<{
        handle: BreathingDragHandle;
        startX: number;
        startY: number;
        initialBox: BreathingCropBox;
    } | null>(null);
    const [meta, setMeta] = useState<BreathingProjectionMeta | null>(null);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [windowWidth, setWindowWidth] = useState(BREATHING_SCOUT_SERIES.fallbackWindowWidth);
    const [windowLevel, setWindowLevel] = useState(BREATHING_SCOUT_SERIES.fallbackWindowLevel);
    const [isAdjustingWindow, setIsAdjustingWindow] = useState(false);
    const [cropBox, setCropBox] = useState<BreathingCropBox>({
        x: 0.2,
        y: 0.18,
        width: 0.56,
        height: 0.48,
    });

    useEffect(() => {
        let cancelled = false;

        const loadSlices = async () => {
            try {
                const sliceNumbers = Array.from({ length: BREATHING_SCOUT_SERIES.count }, (_, index) => index + 1);
                const slices: BreathingLoadedSlice[] = [];
                const concurrency = 8;

                for (let start = 0; start < sliceNumbers.length; start += concurrency) {
                    const batch = sliceNumbers.slice(start, start + concurrency);
                    const loadedBatch = await Promise.all(
                        batch.map(async (sliceNumber) => {
                            const fileName = `1-${String(sliceNumber).padStart(3, "0")}.dcm`;
                            const response = await fetch(`${BREATHING_SCOUT_SERIES.basePath}/${fileName}`);
                            if (!response.ok) throw new Error(`Failed to fetch ${fileName}`);

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
                            const pixelDataElement = dataSet.elements.x7fe00010;
                            if (!pixelDataElement || rows === 0 || cols === 0) {
                                throw new Error(`Missing pixel data for ${fileName}`);
                            }

                            const pixelData = byteArray.slice(
                                pixelDataElement.dataOffset,
                                pixelDataElement.dataOffset + pixelDataElement.length
                            );
                            const pixelBuffer = pixelData.buffer.slice(
                                pixelData.byteOffset,
                                pixelData.byteOffset + pixelData.byteLength
                            );

                            const values =
                                bitsAllocated === 16
                                    ? pixelRepresentation === 1
                                        ? new Int16Array(pixelBuffer)
                                        : new Uint16Array(pixelBuffer)
                                    : new Uint16Array(pixelBuffer);

                            const hu = new Float32Array(values.length);
                            for (let i = 0; i < values.length; i += 1) {
                                hu[i] = values[i] * slope + intercept;
                            }

                            return {
                                instanceNumber: Number(dataSet.string("x00200013") ?? sliceNumber),
                                positionZ,
                                rows,
                                cols,
                                hu,
                                ww: Number(dataSet.string("x00281051") ?? `${BREATHING_SCOUT_SERIES.fallbackWindowWidth}`),
                                wl: Number(dataSet.string("x00281050") ?? `${BREATHING_SCOUT_SERIES.fallbackWindowLevel}`),
                                kvp: dataSet.string("x00180060") ?? "120",
                                mas: dataSet.string("x00181152") ?? "Auto",
                                thickness: dataSet.string("x00180050") ?? "3.0 mm",
                            };
                        })
                    );

                    loadedBatch.forEach((slice) => {
                        slices.push(slice);
                        if (!metaRef.current) {
                            metaRef.current = {
                                width: slice.cols,
                                height: BREATHING_SCOUT_SERIES.count,
                                ww: Number.isFinite(slice.ww) && slice.ww > 1 ? slice.ww : BREATHING_SCOUT_SERIES.fallbackWindowWidth,
                                wl: Number.isFinite(slice.wl) ? slice.wl : BREATHING_SCOUT_SERIES.fallbackWindowLevel,
                                kvp: slice.kvp,
                                mas: slice.mas,
                                thickness: slice.thickness,
                            };
                        }
                    });
                }

                slices.sort((a, b) => b.positionZ - a.positionZ || a.instanceNumber - b.instanceNumber);
                if (slices.length === 0) throw new Error("No DICOM slices loaded.");

                const rows = slices[0].rows;
                const cols = slices[0].cols;
                const depthCenter = Math.floor(slices.length / 2);
                const depthHalfBand = Math.max(4, Math.floor(slices.length * 0.06));
                const depthStart = Math.max(0, depthCenter - depthHalfBand);
                const depthEnd = Math.min(slices.length, depthCenter + depthHalfBand + 1);
                const ww = metaRef.current?.ww ?? BREATHING_SCOUT_SERIES.fallbackWindowWidth;
                const wl = metaRef.current?.wl ?? BREATHING_SCOUT_SERIES.fallbackWindowLevel;
                const output = new Float32Array(cols * rows);

                for (let y = 0; y < rows; y += 1) {
                    for (let x = 0; x < cols; x += 1) {
                        let accum = 0;
                        let samples = 0;
                        for (let z = depthStart; z < depthEnd; z += 1) {
                            accum += slices[z].hu[y * cols + x];
                            samples += 1;
                        }
                        output[y * cols + x] = accum / Math.max(samples, 1);
                    }
                }

                if (cancelled) return;
                projectionRef.current = output;
                projectionSizeRef.current = { width: cols, height: rows };
                setMeta({
                    width: cols,
                    height: rows,
                    ww,
                    wl,
                    kvp: metaRef.current?.kvp ?? "120",
                    mas: metaRef.current?.mas ?? "Auto",
                    thickness: metaRef.current?.thickness ?? "3.0 mm",
                });
                setWindowWidth(ww);
                setWindowLevel(wl);
                setLoadState("ready");
            } catch (error) {
                console.error("Failed to load breathing scout projection.", error);
                if (!cancelled) setLoadState("error");
            }
        };

        void loadSlices();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const viewport = viewportRef.current;
        const projectedHu = projectionRef.current;
        const size = projectionSizeRef.current;
        if (!canvas || !viewport || !projectedHu || !size) return;

        const viewW = Math.max(1, Math.floor(viewport.clientWidth));
        const viewH = Math.max(1, Math.floor(viewport.clientHeight));
        if (canvas.width !== viewW || canvas.height !== viewH) {
            canvas.width = viewW;
            canvas.height = viewH;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const offscreen = document.createElement("canvas");
        offscreen.width = size.width;
        offscreen.height = size.height;
        const offCtx = offscreen.getContext("2d");
        if (!offCtx) return;

        const imageData = offCtx.createImageData(size.width, size.height);
        const out = imageData.data;
        const minVal = windowLevel - windowWidth / 2;
        const maxVal = windowLevel + windowWidth / 2;
        const range = Math.max(maxVal - minVal, 1);
        for (let i = 0; i < projectedHu.length; i += 1) {
            const j = i * 4;
            const normalized = clamp01((projectedHu[i] - minVal) / range);
            const value = 255 - Math.round(normalized * 255);
            out[j] = value;
            out[j + 1] = value;
            out[j + 2] = value;
            out[j + 3] = 255;
        }
        offCtx.putImageData(imageData, 0, 0);

        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, viewW, viewH);

        const fitScale = Math.min(viewW / size.width, viewH / size.height);
        const drawScale = fitScale * 0.98;
        const drawW = size.width * drawScale;
        const drawH = size.height * drawScale;
        const x = (viewW - drawW) / 2;
        const y = (viewH - drawH) / 2;

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.filter = "contrast(1.12) brightness(0.94)";
        ctx.drawImage(offscreen, x, y, drawW, drawH);
        ctx.restore();
    }, [loadState, windowLevel, windowWidth]);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const cropDragState = cropDragStateRef.current;
            const viewport = viewportRef.current;
            if (cropDragState && viewport) {
                const rect = viewport.getBoundingClientRect();
                const dx = (event.clientX - cropDragState.startX) / rect.width;
                const dy = (event.clientY - cropDragState.startY) / rect.height;
                const minSize = 0.08;
                const next = { ...cropDragState.initialBox };

                switch (cropDragState.handle) {
                    case "move":
                        next.x = clamp(cropDragState.initialBox.x + dx, 0, 1 - cropDragState.initialBox.width);
                        next.y = clamp(cropDragState.initialBox.y + dy, 0, 1 - cropDragState.initialBox.height);
                        break;
                    case "top": {
                        const nextY = clamp(cropDragState.initialBox.y + dy, 0, cropDragState.initialBox.y + cropDragState.initialBox.height - minSize);
                        next.height = cropDragState.initialBox.height + (cropDragState.initialBox.y - nextY);
                        next.y = nextY;
                        break;
                    }
                    case "bottom":
                        next.height = clamp(cropDragState.initialBox.height + dy, minSize, 1 - cropDragState.initialBox.y);
                        break;
                    case "left": {
                        const nextX = clamp(cropDragState.initialBox.x + dx, 0, cropDragState.initialBox.x + cropDragState.initialBox.width - minSize);
                        next.width = cropDragState.initialBox.width + (cropDragState.initialBox.x - nextX);
                        next.x = nextX;
                        break;
                    }
                    case "right":
                        next.width = clamp(cropDragState.initialBox.width + dx, minSize, 1 - cropDragState.initialBox.x);
                        break;
                }

                setCropBox(next);
                return;
            }

            if (!isAdjustingWindow) return;
            const dragState = dragStateRef.current;
            if (!dragState) return;

            const deltaX = event.clientX - dragState.startX;
            const deltaY = event.clientY - dragState.startY;
            const nextWw = Math.min(1800, Math.max(80, dragState.startWw + deltaX * 4));
            const nextWl = Math.min(300, Math.max(-300, dragState.startWl - deltaY * 2));
            setWindowWidth(nextWw);
            setWindowLevel(nextWl);
        };

        const handleMouseUp = () => {
            cropDragStateRef.current = null;
            dragStateRef.current = null;
            setIsAdjustingWindow(false);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isAdjustingWindow]);

    const handleViewportMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (loadState !== "ready") return;

        dragStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            startWw: windowWidth,
            startWl: windowLevel,
        };
        setIsAdjustingWindow(true);
    };

    const startCropDrag = (handle: BreathingDragHandle) => (event: React.MouseEvent<HTMLDivElement>) => {
        if (loadState !== "ready") return;
        event.preventDefault();
        event.stopPropagation();
        cropDragStateRef.current = {
            handle,
            startX: event.clientX,
            startY: event.clientY,
            initialBox: cropBox,
        };
        dragStateRef.current = null;
        setIsAdjustingWindow(false);
    };

    return (
        <div
            ref={viewportRef}
            onMouseDown={handleViewportMouseDown}
            className={`absolute inset-0 overflow-hidden bg-black ${loadState === "ready" ? (isAdjustingWindow ? "cursor-grabbing" : "cursor-crosshair") : ""}`}
        >
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />

            {loadState === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium tracking-[0.12em] text-[#9FB2C5]">
                    {t("scanFlow.realDicomLoading")}
                </div>
            )}

            {loadState === "error" && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium tracking-[0.08em] text-[#D1D9E1]">
                    {t("scanFlow.realImageLoadError")}
                </div>
            )}

            {meta && (
                <>
                    <div className="pointer-events-none absolute left-3 top-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div className="font-bold">Scout Projection</div>
                        <div>{meta.width} x {meta.height}</div>
                    </div>
                    <div className="pointer-events-none absolute right-3 top-3 text-right text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div className="font-bold">C/A/P CT Demo</div>
                        <div>KV {meta.kvp} | mAs {meta.mas}</div>
                    </div>
                    <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div>WW/WL {Math.round(windowWidth)} / {Math.round(windowLevel)}</div>
                        <div>Thick {meta.thickness}</div>
                    </div>
                    <div className="pointer-events-none absolute bottom-3 right-3 text-right text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div>左右拖动: WW</div>
                        <div>上下拖动: WL</div>
                    </div>
                    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[11px] font-bold tracking-[0.12em] text-[#DCE5ED]">
                        R
                    </div>
                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold tracking-[0.12em] text-[#DCE5ED]">
                        L
                    </div>

                    <div
                        className="absolute border-2 border-[#4D94FF] bg-[#4D94FF]/8 shadow-[0_0_0_1px_rgba(77,148,255,0.24),0_0_24px_rgba(77,148,255,0.18)] cursor-move"
                        style={{
                            left: `${cropBox.x * 100}%`,
                            top: `${cropBox.y * 100}%`,
                            width: `${cropBox.width * 100}%`,
                            height: `${cropBox.height * 100}%`,
                        }}
                        onMouseDown={startCropDrag("move")}
                    >
                        <div className="absolute inset-0 border border-white/20">
                            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/20" />
                            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/20" />
                        </div>
                        <div className="pointer-events-none absolute left-2 top-2 rounded border border-[#93C5FD]/40 bg-[#08111f]/90 px-2 py-1 text-[10px] font-black tracking-[0.08em] text-[#DBEAFE]">
                            {t("scanFlow.scanRange")}
                        </div>

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

function BreathingScanPreviewViewport() {
    return (
        <div className="absolute inset-0 overflow-hidden bg-black">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />

            <div className="pointer-events-none absolute inset-0 opacity-[0.08]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(126,170,255,0.35),_transparent_62%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:28px_28px]" />
            </div>

            <div className="pointer-events-none absolute left-3 top-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                <div className="font-bold">Scan Preview</div>
                <div>Helical Acquisition</div>
            </div>
            <div className="pointer-events-none absolute right-3 top-3 text-right text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                <div className="font-bold">Pending</div>
                <div>Waiting for scan start</div>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                <div>Image buffer not started</div>
                <div>Preview pane reserved</div>
            </div>

          
        </div>
    );
}

interface ScoutScanScreenProps {
    firstStepLabel?: string;
    bottomPanelMode?: "positioning" | "breathing";
    viewportBgClassName?: string;
    breathingWorkflowVariant?: "training" | "acquisition";
}

const ScoutScanScreen = ({
    firstStepLabel,
    bottomPanelMode = "positioning",
    viewportBgClassName = "bg-[#1A222B]",
    breathingWorkflowVariant = "training",
}: ScoutScanScreenProps) => {
    const { t } = useI18n();
    const selectedPatient = useMemo(() => loadSelectedPatient(), []);
    const workflowPlans = useMemo(() => loadSelectedScanWorkflowPlans(), []);
    const location = useLocation();
    const navigate = useNavigate();
    const resolvedFirstStepLabel = firstStepLabel ?? t("scanFlow.step.laserPosition");
    const [workflowGuardStatus, setWorkflowGuardStatus] = useState<"checking" | "ready">("checking");

    // 4D workflow detection - driven by scan session acquisition_type
    const [is4DWorkflow, setIs4DWorkflow] = useState(false);
    const returnState = location.state as { activeStepIdx?: number } | null;
    const [activeStepIdx, setActiveStepIdx] = useState(() => {
        const requestedStep = returnState?.activeStepIdx;
        return typeof requestedStep === "number" && requestedStep >= 0 && requestedStep <= 3
            ? requestedStep
            : 0;
    });
    const isBreathingAcquisitionStep = is4DWorkflow && activeStepIdx === 0;
    const is4DParamConfirmStep = is4DWorkflow && activeStepIdx === 2;
    const is4DScoutExecuteStep = is4DWorkflow && activeStepIdx === 3;

    useEffect(() => {
        let cancelled = false;

        const redirectToWorkflowEntry = (route: "/patients" | "/protocol-select") => {
            clearSelectedExamWorkflowState();
            navigate(route, { replace: true });
        };

        const validateWorkflowSession = async () => {
            if (!selectedPatient) {
                redirectToWorkflowEntry("/patients");
                return;
            }

            if (workflowPlans.length === 0) {
                redirectToWorkflowEntry("/protocol-select");
                return;
            }

            try {
                const session = await fetchSelectedScanSession();
                if (cancelled) return;

                if (!session || session.patient_id !== selectedPatient.id) {
                    redirectToWorkflowEntry("/protocol-select");
                    return;
                }

                // Gating shares the 4-step flow with 4D: 呼吸训练 -> 定位像 -> 参数确认 -> 执行扫描。
                // 扫描后的去向由 ScoutExecuteScanScreen 根据协议类型处理。
                setIs4DWorkflow(session.acquisition_type === "four_d" || session.acquisition_type === "gating");
                setWorkflowGuardStatus("ready");
            } catch {
                if (!cancelled) {
                    redirectToWorkflowEntry("/protocol-select");
                }
            }
        };

        void validateWorkflowSession();

        return () => {
            cancelled = true;
        };
    }, [navigate, selectedPatient, workflowPlans.length]);

    const isBreathingTraining = bottomPanelMode === "breathing" && breathingWorkflowVariant === "training";
    const isBreathingAcquisition = bottomPanelMode === "breathing" && breathingWorkflowVariant === "acquisition";
    const [startPos, setStartPos] = useState("472.95");
    const [endPos, setEndPos] = useState("595.17");
    const isBreathingSignalEnabled = true;
    const isRespiraScopeActive = isBreathingSignalEnabled && (isBreathingAcquisitionStep || bottomPanelMode === "breathing");
    const [respiraScopeNowMs, setRespiraScopeNowMs] = useState(() => Date.now());
    const respiraScopeBreathing = useRespiraScopeBreathing({
        enabled: isRespiraScopeActive,
        maxPoints: 500,
    });

    useEffect(() => {
        if (!isRespiraScopeActive) return;

        setRespiraScopeNowMs(Date.now());
        const timer = window.setInterval(() => setRespiraScopeNowMs(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [isRespiraScopeActive]);
    const [breathingAcquisitionParams, setBreathingAcquisitionParams] = useState({
        minSpacing: 2.0,
        filterThreshold: 0.45,
        peakThreshold: 1.2,
        valleyThreshold: 0.35,
        gain: 1.5,
        triggerDelay: 0.0,
    });
    const [breathingParamsExpanded, setBreathingParamsExpanded] = useState(false);
    const [fourDScoutParams, setFourDScoutParams] = useState<FourDScoutParams>({
        bedMode: "in",
        position: "HFS",
        scanLength: "80.00",
        mA: "30",
        kV: "120",
        scoutAngle: "270",
        ctdiVol: "59.40",
        dlp: "1168.50",
    });

    const [breathingPhase, setBreathingPhase] = useState<"training" | "stable">("training");
    const [breathingReadyCountdown, setBreathingReadyCountdown] = useState(10);
    // Rolling peak tracker for stability detection
    const peakHistoryRef = useRef<{ value: number; time: number }[]>([]);
    // eslint-disable-next-line react-hooks/purity
    const trainingStartRef = useRef<number>(Date.now());
    const demoStableTimerRef = useRef<number | null>(null);
    const demoCountdownTimerRef = useRef<number | null>(null);
    const MIN_TRAINING_MS = 10000; // demo: stabilize after 10 seconds
    const MIN_PEAKS_REQUIRED = 6;

    // Stability check: CV of peak amplitudes < 12% AND CV of intervals < 15%
    const checkBreathingStability = (peaks: { value: number; time: number }[]) => {
        if (peaks.length < MIN_PEAKS_REQUIRED) return false;
        if (Date.now() - trainingStartRef.current < MIN_TRAINING_MS) return false;
        const recent = peaks.slice(-MIN_PEAKS_REQUIRED);
        const vals = recent.map(p => p.value);
        const vMean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const vCv = Math.sqrt(vals.reduce((a, b) => a + (b - vMean) ** 2, 0) / vals.length) / vMean;
        const intervals = recent.slice(1).map((p, i) => p.time - recent[i].time);
        const iMean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const iCv = Math.sqrt(intervals.reduce((a, b) => a + (b - iMean) ** 2, 0) / intervals.length) / iMean;
        return vCv < 0.12 && iCv < 0.15;
    };

    const handleSwap = () => {
        setStartPos(endPos);
        setEndPos(startPos);
    };

    // Waveform simulation state (increased buffer for longer period)
    const [rawWaveData, setRawWaveData] = useState<number[]>(new Array(500).fill(100));
    const [filteredWaveData, setFilteredWaveData] = useState<number[]>(new Array(500).fill(100));
    const [metrics, setMetrics] = useState({ rawMainFreq: "0.25", bpm: "14.8", peakErr: "1.7", freqErr: "1.9" });
    const timerRef = useRef<number | null>(null);
    const tRef = useRef(0); // Persistent time counter to prevent resets on re-render
    const hasRespiraScopeSamples = respiraScopeBreathing.hasSamples;
    const isRespiraScopeStale = isRespiraScopeActive &&
        hasRespiraScopeSamples &&
        respiraScopeBreathing.lastMessageAt !== null &&
        respiraScopeNowMs - respiraScopeBreathing.lastMessageAt > RESPIRASCOPE_STALE_MS;
    const respiraScopeUiState = useMemo<{
        severity: RespiraScopeUiSeverity;
        badgeLabel: string;
        title: string;
        detail: string;
    }>(() => {
        if (!isRespiraScopeActive) {
            return {
                severity: "ready",
                badgeLabel: "实时波形",
                title: "",
                detail: "",
            };
        }

        if (isRespiraScopeStale) {
            return {
                severity: "error",
                badgeLabel: "呼吸信号中断",
                title: "呼吸信号已中断",
                detail: `超过 ${Math.round(RESPIRASCOPE_STALE_MS / 1000)} 秒未收到新样本，请检查呼吸设备、采集服务和网络连接。`,
            };
        }

        if (hasRespiraScopeSamples) {
            return {
                severity: "ready",
                badgeLabel: "RespiraScope",
                title: "",
                detail: "",
            };
        }

        if (respiraScopeBreathing.status === "unavailable") {
            return {
                severity: "error",
                badgeLabel: "呼吸系统未连接",
                title: "呼吸系统连接失败",
                detail: respiraScopeBreathing.errorMessage ?? `无法访问 ${respiraScopeBreathing.apiBase}/health 或 /startReceive。`,
            };
        }

        if (respiraScopeBreathing.status === "error") {
            return {
                severity: "error",
                badgeLabel: "呼吸连接异常",
                title: "呼吸 WebSocket 异常",
                detail: respiraScopeBreathing.errorMessage ?? `请检查 ${respiraScopeBreathing.apiBase}/socket.io/ 是否可用。`,
            };
        }

        if (respiraScopeBreathing.status === "waiting" || respiraScopeBreathing.status === "receiving") {
            return {
                severity: "warning",
                badgeLabel: "等待呼吸数据",
                title: "已连接，未收到波形样本",
                detail: "请检查呼吸采集是否已启动，确认 raw/filtered 样本正在发送。",
            };
        }

        return {
            severity: "pending",
            badgeLabel: "连接呼吸系统中",
            title: "正在连接呼吸系统",
            detail: `目标服务：${respiraScopeBreathing.apiBase}`,
        };
    }, [
        hasRespiraScopeSamples,
        isRespiraScopeActive,
        isRespiraScopeStale,
        respiraScopeBreathing.apiBase,
        respiraScopeBreathing.errorMessage,
        respiraScopeBreathing.status,
    ]);
    const liveFilteredValues = respiraScopeBreathing.filteredValues.length > 0
        ? respiraScopeBreathing.filteredValues
        : respiraScopeBreathing.rawValues;
    // 生产联调时不能用模拟波形掩盖呼吸系统未连接。
    const shouldUseDemoBreathingWave = !isRespiraScopeActive;
    const displayRawWaveData = hasRespiraScopeSamples
        ? padWaveData(respiraScopeBreathing.rawValues)
        : shouldUseDemoBreathingWave ? rawWaveData : EMPTY_BREATHING_WAVE_DATA;
    const displayFilteredWaveData = hasRespiraScopeSamples
        ? padWaveData(liveFilteredValues)
        : shouldUseDemoBreathingWave ? filteredWaveData : EMPTY_BREATHING_WAVE_DATA;
    const liveBpm = respiraScopeBreathing.metrics.bpm;
    const livePeakErr = estimatePeakCvPercent(displayFilteredWaveData);
    const displayMetrics = hasRespiraScopeSamples
        ? {
            rawMainFreq: liveBpm !== null ? (liveBpm / 60).toFixed(2) : metrics.rawMainFreq,
            bpm: liveBpm !== null ? liveBpm.toFixed(1) : metrics.bpm,
            peakErr: livePeakErr !== null ? livePeakErr.toFixed(1) : metrics.peakErr,
            freqErr: respiraScopeBreathing.metrics.intervalCv !== null
                ? (respiraScopeBreathing.metrics.intervalCv * 100).toFixed(1)
                : metrics.freqErr,
        }
        : shouldUseDemoBreathingWave ? metrics : {
            rawMainFreq: "--",
            bpm: "--",
            peakErr: "--",
            freqErr: "--",
        };
    const isRespiraScopeReady = !isRespiraScopeActive || respiraScopeUiState.severity === "ready";
    const isBreathingStatusReady = breathingPhase === "stable" && isRespiraScopeReady;
    const liveWaveBadgeLabel = respiraScopeUiState.badgeLabel;
    const breathingPhaseLabel = isRespiraScopeActive && !isRespiraScopeReady
        ? respiraScopeUiState.badgeLabel
        : hasRespiraScopeSamples
        ? (breathingPhase === "stable" ? t("scanFlow.breathingStable") : t("scanFlow.fourD.breathingAcquiring"))
        : (breathingPhase === "stable" ? t("scanFlow.breathingStable") : t("scanFlow.breathingSimulating", { seconds: breathingReadyCountdown }));
    const latestSignalValue = displayFilteredWaveData[displayFilteredWaveData.length - 1] ?? 0;
    const latestSignalDisplay = hasRespiraScopeSamples ? latestSignalValue.toFixed(1) : "--";
    const normalizedSignal = clamp01(latestSignalValue / 1100);
    const breathingBedIndex = Math.min(
        BREATHING_BED_POSITION_COUNT - 1,
        Math.max(0, Math.floor(normalizedSignal * BREATHING_BED_POSITION_COUNT))
    );
    const canContinueBreathingAcquisition = breathingPhase === "stable" && isRespiraScopeReady;
    const shouldShowRespiraScopeConnectionOverlay = isRespiraScopeActive && !isRespiraScopeReady;
    const respiraScopeBadgeClassName = respiraScopeUiState.severity === "ready"
        ? "border-[#C8E6C9] bg-[#E8F5E9] text-[#2E7D32]"
        : respiraScopeUiState.severity === "error"
            ? "border-[#FFCDD2] bg-[#FFEBEE] text-[#B71C1C]"
            : "border-[#FFE0B2] bg-[#FFF8E1] text-[#E65100]";
    const respiraScopeDotClassName = respiraScopeUiState.severity === "ready"
        ? "bg-[#4CAF50] animate-pulse"
        : respiraScopeUiState.severity === "error"
            ? "bg-[#D32F2F]"
            : "bg-[#FFA726] animate-pulse";
    const renderRespiraScopeConnectionOverlay = (compact = false) => {
        if (!shouldShowRespiraScopeConnectionOverlay) return null;

        const isError = respiraScopeUiState.severity === "error";
        const isPending = respiraScopeUiState.severity === "pending";

        return (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/82 px-5 backdrop-blur-[2px]">
                <div className={`w-full ${compact ? "max-w-[360px] px-4 py-3" : "max-w-[460px] px-5 py-4"} rounded-lg border bg-white shadow-xl ${
                    isError ? "border-[#FFCDD2]" : "border-[#FFE0B2]"
                }`}>
                    <div className="flex items-start gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                            isError ? "bg-[#FFEBEE] text-[#D32F2F]" : "bg-[#FFF8E1] text-[#F57C00]"
                        }`}>
                            {isPending ? (
                                <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            ) : (
                                <AlertTriangle size={18} />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className={`text-[14px] font-black ${isError ? "text-[#B71C1C]" : "text-[#E65100]"}`}>
                                {respiraScopeUiState.title}
                            </div>
                            <div className="mt-1 text-[12px] font-semibold leading-snug text-[#546E7A]">
                                {respiraScopeUiState.detail}
                            </div>
                            <div className="mt-2 truncate rounded border border-[#E3EAF3] bg-[#F8FAFC] px-2 py-1 text-[10px] font-mono text-[#78909C]">
                                {respiraScopeBreathing.apiBase}
                            </div>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-[10px] font-bold text-[#90A4AE]">未收到真实呼吸波形时已暂停继续</span>
                        <button
                            type="button"
                            onClick={respiraScopeBreathing.retry}
                            className="h-[32px] shrink-0 rounded-md border border-[#4D94FF] bg-white px-3 text-[11px] font-black text-[#1565C0] shadow-sm transition-colors hover:bg-[#EEF6FF] active:scale-95"
                        >
                            重新连接
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    useEffect(() => {
        if (!isBreathingAcquisitionStep && bottomPanelMode !== 'breathing') return;
        if (isRespiraScopeActive) return;

        const update = () => {
            tRef.current += 0.05; // Standard speed for ~15 bpm breaths
            const t = tRef.current;

            // Simulate a more realistic respiratory signal
            const cycle = Math.sin(t);
            const filteredVal = 500 + cycle * 200 + Math.sin(t * 0.3) * 30 + (Math.random() - 0.5) * 5;

            // Raw signal: very sharp high frequency spikes aligned with the cycle
            const pulse = Math.pow(Math.max(0, Math.sin(t * 1.0 + 0.1)), 24) * 400;
            const rawVal = 480 + cycle * 80 + pulse + (Math.random() - 0.5) * 15;

            setRawWaveData(prev => [...prev.slice(1), rawVal]);
            setFilteredWaveData(prev => [...prev.slice(1), filteredVal]);

            // Peak detection for stability tracking (every ~2s)
            if (Math.random() > 0.96) {
                setFilteredWaveData(currentData => {
                    let peakCount = 0;
                    let latestPeakVal = 0;
                    for (let i = 4; i < currentData.length - 4; i++) {
                        if (currentData[i] > currentData[i - 1] && currentData[i] > currentData[i + 1] &&
                            currentData[i] > currentData[i - 2] && currentData[i] > currentData[i + 2] &&
                            currentData[i] > 650) {
                            peakCount++;
                            latestPeakVal = currentData[i];
                        }
                    }
                    const baseBpm = (peakCount / 500) * 1200;
                    const bpm = Math.max(14.2, Math.min(15.8, baseBpm + (Math.random() - 0.5) * 0.2));
                    const rawMainFreq = (bpm / 60).toFixed(2);
                    const peakErr = (1.2 + Math.random() * 0.6).toFixed(1);
                    const freqErr = (1.5 + Math.random() * 0.5).toFixed(1);
                    setMetrics(() => ({ rawMainFreq, bpm: bpm.toFixed(1), peakErr, freqErr }));

                    // Track peaks for stability check
                    if (latestPeakVal > 0 && isBreathingAcquisitionStep) {
                        peakHistoryRef.current = [
                            ...peakHistoryRef.current.slice(-20),
                            { value: latestPeakVal, time: Date.now() },
                        ];
                        if (breathingPhase === 'training' && checkBreathingStability(peakHistoryRef.current)) {
                            setBreathingPhase('stable');
                        }
                    }
                    return currentData;
                });
            }

            timerRef.current = requestAnimationFrame(update);
        };

        timerRef.current = requestAnimationFrame(update);
        return () => {
            if (timerRef.current !== null) cancelAnimationFrame(timerRef.current);
        };
    }, [bottomPanelMode, breathingPhase, isBreathingAcquisitionStep, isRespiraScopeActive]);

    useEffect(() => {
        if (!isBreathingAcquisitionStep) {
            if (demoStableTimerRef.current !== null) {
                window.clearTimeout(demoStableTimerRef.current);
                demoStableTimerRef.current = null;
            }
            if (demoCountdownTimerRef.current !== null) {
                window.clearInterval(demoCountdownTimerRef.current);
                demoCountdownTimerRef.current = null;
            }
            setBreathingPhase("training");
            setBreathingReadyCountdown(10);
            peakHistoryRef.current = [];
            trainingStartRef.current = Date.now();
            return;
        }

        setBreathingPhase("training");
        setBreathingReadyCountdown(10);
        peakHistoryRef.current = [];
        trainingStartRef.current = Date.now();

        demoStableTimerRef.current = window.setTimeout(() => {
            setBreathingPhase("stable");
            setBreathingReadyCountdown(0);
        }, MIN_TRAINING_MS);

        demoCountdownTimerRef.current = window.setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - trainingStartRef.current) / 1000);
            setBreathingReadyCountdown(Math.max(0, 10 - elapsedSeconds));
        }, 250);

        return () => {
            if (demoStableTimerRef.current !== null) {
                window.clearTimeout(demoStableTimerRef.current);
                demoStableTimerRef.current = null;
            }
            if (demoCountdownTimerRef.current !== null) {
                window.clearInterval(demoCountdownTimerRef.current);
                demoCountdownTimerRef.current = null;
            }
        };
    }, [isBreathingAcquisitionStep, MIN_TRAINING_MS]);

    useEffect(() => {
        if (bottomPanelMode !== "breathing") return;

        setRawWaveData(new Array(500).fill(100));
        setFilteredWaveData(new Array(500).fill(100));
        setMetrics({ rawMainFreq: "0.25", bpm: "14.8", peakErr: "1.7", freqErr: "1.9" });
        tRef.current = 0;
    }, [bottomPanelMode]);

    const buildSequenceSteps = useCallback((type: WorkflowSequenceType) => {
        // 4D workflows get their own 4-step sequence
        if (is4DWorkflow) {
            if (type === 'scout') return [
                t("scanFlow.step.breathingAcquisition"),
                t("scanFlow.step.laserPosition"),
                t("scanFlow.step.parameterConfirm"),
                t("scanFlow.step.executeScan"),
            ];
            return [t("scanFlow.step.parameterConfirm"), t("scanFlow.step.executeScan")];
        }
        // Regular scan: existing logic unchanged
        if (type === "scout") {
            return isBreathingAcquisition
                ? [resolvedFirstStepLabel, t("scanFlow.step.laserPosition"), t("scanFlow.step.parameterConfirm"), t("scanFlow.step.executeScan")]
                : [resolvedFirstStepLabel, t("scanFlow.step.parameterConfirm"), t("scanFlow.step.executeScan")];
        }
        if (type === "helical" || type === "axial" || type === "4d") {
            return bottomPanelMode === "breathing"
                ? [t("scanFlow.breathingTraining"), t("scanFlow.step.parameterConfirm"), t("scanFlow.step.executeScan")]
                : [t("scanFlow.step.parameterConfirm"), t("scanFlow.step.executeScan")];
        }
        return [t("scanFlow.step.parameterConfirm"), t("scanFlow.step.executeScan")];
    }, [bottomPanelMode, isBreathingAcquisition, is4DWorkflow, resolvedFirstStepLabel, t]);

    const buildGroupsFromWorkflowPlans = useCallback((): ProtocolGroup[] => {
        if (workflowPlans.length === 0) {
            return [
                {
                    id: "g1",
                    name: "Head_FacialBoneVolume",
                    sequences: [
                        { id: "s1", name: "Scout", type: "scout", steps: buildSequenceSteps("scout") },
                        { id: "s2", name: "Helical Scan", type: "helical", steps: buildSequenceSteps("helical") },
                    ],
                },
            ];
        }

        return workflowPlans.map((plan) => {
            const effectivePlan = mergeDualScoutPlanSequences(plan);
            return {
                id: `group-${plan.id}`,
                name: plan.title,
                sequences: effectivePlan.sequences.map((sequence) => ({
                    id: `group-${plan.id}-seq-${sequence.id}`,
                    name: sequence.name,
                    type: sequence.type,
                    steps: buildSequenceSteps(sequence.type),
                })),
            };
        });
    }, [buildSequenceSteps, workflowPlans]);

    const [groups, setGroups] = useState<ProtocolGroup[]>(() => buildGroupsFromWorkflowPlans());

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAbortConfirm, setShowAbortConfirm] = useState(false);
    const [laserActive, setLaserActive] = useState(false);
    const [selectedPosition, setSelectedPosition] = useState<"start" | "end" | null>(null);
    const [expandedSeqId, setExpandedSeqId] = useState<string | null>(() => buildGroupsFromWorkflowPlans()[0]?.sequences[0]?.id ?? null);

    useEffect(() => {
        const timer = setTimeout(() => {
            const nextGroups = buildGroupsFromWorkflowPlans();
            setGroups(nextGroups);
            setExpandedSeqId((current) => {
                if (current && nextGroups.some((group: ProtocolGroup) => group.sequences.some((seq: Sequence) => seq.id === current))) {
                    return current;
                }
                return nextGroups[0]?.sequences[0]?.id ?? null;
            });
            setActiveStepIdx(0);
        }, 0);

        return () => clearTimeout(timer);
    }, [buildGroupsFromWorkflowPlans]);

    useEffect(() => {
        if (bottomPanelMode !== "positioning") return;

        if (laserActive || selectedPosition) {
            const positioningStepIdx = is4DWorkflow ? 1 : 0;
            setActiveStepIdx((prev) => (prev === 0 ? positioningStepIdx : prev));
        }
    }, [bottomPanelMode, is4DWorkflow, laserActive, selectedPosition]);

    useEffect(() => {
        if (!laserActive || !selectedPosition) return;

        let currentValue = Number(selectedPosition === "start" ? startPos : endPos);
        if (!Number.isFinite(currentValue)) {
            currentValue = selectedPosition === "start" ? 472.95 : 595.17;
        }

        let direction = selectedPosition === "start" ? -1 : 1;
        const interval = window.setInterval(() => {
            const delta = 0.85 + Math.random() * 1.8;
            currentValue = clampBedPosition(currentValue + direction * delta);

            if (currentValue <= BED_POSITION_MIN + 8) {
                direction = 1;
            } else if (currentValue >= BED_POSITION_MAX - 8) {
                direction = -1;
            }

            const formatted = currentValue.toFixed(2);
            if (selectedPosition === "start") {
                setStartPos(formatted);
            } else {
                setEndPos(formatted);
            }
        }, 180);

        return () => window.clearInterval(interval);
    }, [laserActive, selectedPosition, startPos, endPos]);

    const positioningHint = !laserActive
        ? t("scanFlow.positioningHint.openLaser")
        : selectedPosition === "start"
            ? t("scanFlow.positioningHint.start")
            : selectedPosition === "end"
                ? t("scanFlow.positioningHint.end")
                : t("scanFlow.positioningHint.choosePoint");

    const persistPositioningToSession = useCallback(async () => {
        const scanSession = await fetchSelectedScanSession();
        const topogramParamId = scanSession?.series.find((series) => series.series_type === "topogram")?.topogram_param?.id;
        if (!topogramParamId) return;

        const start = Number(startPos);
        const end = Number(endPos);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return;

        saveScoutPositioningRange({ start, end });

        await updateSelectedScanSessionTopogramParam(topogramParamId, {
            scan_length: Number(Math.abs(end - start).toFixed(2)),
        });
    }, [endPos, startPos]);

    const handlePreviousStep = useCallback(() => {
        if (is4DWorkflow) {
            if (activeStepIdx > 0) {
                setActiveStepIdx((idx) => Math.max(0, idx - 1));
                return;
            }

            navigate("/protocol-select");
            return;
        }

        navigate("/protocol-select");
    }, [activeStepIdx, is4DWorkflow, navigate]);

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);

            // 1. Handle Group Selection (Find by id)
            const group = groups.find(item => item.id === id);
            if (group) {
                const childIds = group.sequences.map(seq => seq.id);
                const allRelatedIds = [group.id, ...childIds];

                // If anything in this group is NOT selected, select all. Otherwise, deselect all.
                const shouldSelectAll = !allRelatedIds.every(itemId => next.has(itemId));

                allRelatedIds.forEach(itemId => {
                    if (shouldSelectAll) next.add(itemId);
                    else next.delete(itemId);
                });
                return Array.from(next);
            }

            // 2. Handle Sequence Selection
            const parentGroup = groups.find(g => g.sequences.some(seq => seq.id === id));
            if (parentGroup) {
                if (next.has(id)) next.delete(id);
                else next.add(id);

                // Sync parent group status
                const sequenceIds = parentGroup.sequences.map(seq => seq.id);
                const allSequencesSelected = sequenceIds.every(seqId => next.has(seqId));

                if (allSequencesSelected) next.add(parentGroup.id);
                else next.delete(parentGroup.id);
            }

            return Array.from(next);
        });
    };

    const handleDeleteClick = () => {
        if (selectedIds.length === 0) return;
        setShowDeleteConfirm(true);
    };

    const handleConfirmDelete = () => {
        setGroups(prev => prev
            .filter(g => !selectedIds.includes(g.id))
            .map(g => ({
                ...g,
                sequences: g.sequences.filter(s => !selectedIds.includes(s.id))
            }))
            .filter(g => g.sequences.length > 0)
        );
        setSelectedIds([]);
        setShowDeleteConfirm(false);
    };

    if (workflowGuardStatus === "checking") {
        return (
            <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative text-[#37474F] font-sans select-none">
                <AppHeader
                    patientName={selectedPatient?.name ?? null}
                    patientId={selectedPatient?.patientId ?? null}
                />
                <main className="flex-1 flex items-center justify-center text-[13px] font-bold text-[#78909C]">
                    正在确认检查流程...
                </main>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative text-[#37474F] font-sans select-none">

            {/* 1. Header (System Info) */}
            <AppHeader
                patientName={selectedPatient?.name ?? null}
                patientId={selectedPatient?.patientId ?? null}
                laserActive={laserActive}
                onLaserToggle={() => setLaserActive((prev) => !prev)}
            />

            {/* 2. Main Content Area - Card Partitioning */}
            <main className="flex-1 flex overflow-hidden p-2 gap-1">

                {/* Left Sidebar Card */}
                <aside className="w-[240px] bg-white rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden shrink-0">
                    {/* Sidebar Toolbar - Card Header Style */}
                    <div className="h-[48px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-3 shrink-0">
                        <div className="flex items-center gap-2">
                            <button className="p-1.5 text-[#546E7A] hover:bg-[#EEF2F9] rounded transition-all"><FilePlus size={18} /></button>
                            <button
                                disabled={selectedIds.length === 0}
                                onClick={handleDeleteClick}
                                className={`p-1.5 transition-all rounded relative ${selectedIds.length > 0 ? 'text-red-500 hover:bg-red-50' : 'text-[#546E7A]/40 cursor-not-allowed'}`}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                        <button
                            onClick={() => setIsTreeCollapsed(!isTreeCollapsed)}
                            className="p-1.5 text-[#4D94FF] hover:bg-[#EEF2F9] rounded transition-all"
                        >
                            {isTreeCollapsed ? <ChevronDown size={20} /> : <ChevronsUp size={20} />}
                        </button>
                    </div>

                    {/* Protocol Tree Area - Match ScanConfirm implementation */}
                    <div className={`overflow-y-auto p-2 flex flex-col gap-0 transition-all duration-300 ${isTreeCollapsed ? 'h-[48px] opacity-40 grayscale overflow-hidden' : 'flex-1 min-h-0'}`}>
                        {groups.map(group => (
                            <div key={group.id} className="flex flex-col">
                                <div
                                    onClick={() => toggleSelection(group.id)}
                                    className="flex items-center gap-2 px-2 py-1.5 text-[#37474F] cursor-pointer hover:bg-[#EEF2F9] rounded-md transition-all"
                                >
                                    <ChevronDown size={14} className="opacity-40" />
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleSelection(group.id);
                                        }}
                                        className={`w-3.5 h-3.5 rounded border-2 cursor-pointer flex items-center justify-center shrink-0 transition-all ${group.sequences.every(s => selectedIds.includes(s.id))
                                            ? 'bg-[#4D94FF] border-[#4D94FF]'
                                            : 'bg-white border-[#B0C4DE]'
                                            }`}
                                    >
                                        {group.sequences.every(s => selectedIds.includes(s.id)) && <Check size={9} className="text-white stroke-[3]" />}
                                    </div>
                                    <span className={`text-[13px] font-bold truncate transition-all ${group.sequences.every(s => selectedIds.includes(s.id)) ? 'text-[#4D94FF]' : 'text-[#37474F]'}`}>{group.name}</span>
                                </div>

                                <div className="flex flex-col">
                                    {group.sequences.map(seq => (
                                        <div key={seq.id}>
                                            {(() => {
                                                const isExpanded = expandedSeqId === seq.id;
                                                const isScoutType = seq.type === 'scout';
                                                const isHelicalType = seq.type === 'helical';
                                                const isBreathingScoutSequence = bottomPanelMode === 'breathing' && isScoutType;
                                                const isBreathingHelicalSequence = bottomPanelMode === 'breathing' && isHelicalType;
                                                const resolvedActiveSequence = bottomPanelMode === 'breathing'
                                                    ? (breathingWorkflowVariant === 'training' ? isBreathingHelicalSequence : isBreathingScoutSequence)
                                                    : isScoutType;
                                                const isCompletedSequence = bottomPanelMode === 'breathing'
                                                    && breathingWorkflowVariant === 'training'
                                                    && isScoutType;
                                                const isUnifiedActiveSequence = bottomPanelMode === 'breathing' ? resolvedActiveSequence : isScoutType;
                                                const shouldShowSteps = !!seq.steps?.length && isExpanded;

                                                return (
                                                    <>
                                                        {/* Sequence Row - Simplified to matched refined WT32 aesthetic */}
                                                        <div
                                                            onClick={() => setExpandedSeqId(isExpanded ? null : seq.id)}
                                                            className={`flex items-center gap-2 px-3 rounded-lg mb-1 transition-all relative cursor-pointer border ${seq.name === 'Scout' || seq.name === 'Helical Scan' ? 'h-[28px]' : 'py-2.5'} ${isUnifiedActiveSequence
                                                                ? 'bg-[#4D94FF] border-[#4D94FF] text-white shadow-md'
                                                                : isCompletedSequence
                                                                    ? 'bg-[#E8F5E9] border-[#A5D6A7] text-[#2E7D32]'
                                                                    : (selectedIds.includes(seq.id) ? 'bg-[#E3F2FD] border-[#4D94FF]/30 text-[#4D94FF]' : 'bg-transparent border-transparent text-[#546E7A] hover:bg-[#EEF2F9]')
                                                                }`}
                                                        >
                                                            {isExpanded ? <ChevronDown size={14} className={selectedIds.includes(seq.id) ? 'text-[#4D94FF]/60' : isUnifiedActiveSequence ? "text-white/70" : isCompletedSequence ? "text-[#2E7D32]/70" : "text-gray-400"} /> : <ChevronRight size={14} className={selectedIds.includes(seq.id) ? 'text-[#4D94FF]/60' : isUnifiedActiveSequence ? "text-white/70" : isCompletedSequence ? "text-[#2E7D32]/70" : "text-gray-400"} />}
                                                            <div
                                                                onClick={(e) => { e.stopPropagation(); toggleSelection(seq.id); }}
                                                                className={`w-3.5 h-3.5 rounded border-2 cursor-pointer flex items-center justify-center shrink-0 transition-all ${isCompletedSequence
                                                                    ? 'bg-[#66BB6A] border-[#66BB6A]'
                                                                    : selectedIds.includes(seq.id)
                                                                    ? (isUnifiedActiveSequence ? 'bg-white border-white/30' : 'bg-[#4D94FF] border-[#4D94FF]')
                                                                    : (isUnifiedActiveSequence ? 'bg-white/20 border-white/30' : 'bg-white border-[#B0C4DE]')
                                                                    }`}
                                                            >
                                                                {(selectedIds.includes(seq.id) || isCompletedSequence) && (
                                                                    <Check size={9} className={`${isUnifiedActiveSequence ? 'text-[#4D94FF]' : 'text-white'} stroke-[3]`} />
                                                                )}
                                                            </div>
                                                            <span className="text-[13px] font-bold">{seq.name}</span>


                                                        </div>

                                                        {/* Workflow Steps */}
                                                        {shouldShowSteps && (
                                                            <div className="flex flex-col ml-12 mt-2 gap-4 relative pb-4">
                                                                <div className="absolute left-[7px] top-2 bottom-6 w-[1px] bg-[#B0C4DE]"></div>
                                                                {seq.steps?.map((step, idx) => {
                                                                    const isCompleted = isCompletedSequence || (isUnifiedActiveSequence && idx < activeStepIdx);
                                                                    const isActive = !isCompletedSequence && isUnifiedActiveSequence && idx === activeStepIdx;

                                                                    return (
                                                                        <div
                                                                            key={`${seq.id}-step-${idx}`}
                                                                            onClick={() => isUnifiedActiveSequence && setActiveStepIdx(idx)}
                                                                            className="flex items-center gap-3 z-10"
                                                                        >
                                                                            {isCompleted ? (
                                                                                <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                                                                                    <CheckCircle size={16} className="text-[#66BB6A]" />
                                                                                </div>
                                                                            ) : isActive ? (
                                                                                <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-[#4D94FF] translate-x-[1px] shadow-[0_0_8px_rgba(77,148,255,0.3)]"></div>
                                                                            ) : (
                                                                                <div className="w-3.5 h-3.5 rounded-full bg-white border border-[#B0C4DE] translate-x-[1px]"></div>
                                                                            )}
                                                                            <span className={`text-[12px] font-bold ${isActive ? 'text-[#37474F]' : 'text-[#37474F]/60'}`}>
                                                                                {step}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Bottom Controls / Params - Sidebar Detection Section */}
                    {isBreathingTraining ? (
                        <div className="border-t border-[#EEF2F9] bg-[#F8FAFC] px-3 pt-3 pb-2 flex-1 flex flex-col gap-2 overflow-hidden">
                            <button className="h-[28px] w-full rounded-md text-[10px] font-bold flex items-center justify-center border border-[#B0C4DE] bg-white text-[#4D94FF] hover:bg-blue-50 active:scale-95 shadow-sm transition-all">
                                {t("scanFlow.breathingTraining")}
                            </button>
                            <div className="grid grid-cols-2 gap-1.5">
                                <BreathingHelicalParamCard label="进出床" value={BREATHING_HELICAL_PARAM_PREVIEW.bedMode} />
                                <BreathingHelicalParamCard label="体位" value={BREATHING_HELICAL_PARAM_PREVIEW.position} />
                                <BreathingHelicalParamCard label="扫描长度" value={BREATHING_HELICAL_PARAM_PREVIEW.scanLength} />
                                <BreathingHelicalParamCard label="mA" value={BREATHING_HELICAL_PARAM_PREVIEW.mA} />
                                <BreathingHelicalParamCard label="kV" value={BREATHING_HELICAL_PARAM_PREVIEW.kV} />
                                <BreathingHelicalParamCard label="旋转时间" value={BREATHING_HELICAL_PARAM_PREVIEW.rotationTime} />
                                <BreathingHelicalParamCard label="准直器" value={BREATHING_HELICAL_PARAM_PREVIEW.collimation} />
                                <BreathingHelicalParamCard label="Pitch" value={BREATHING_HELICAL_PARAM_PREVIEW.pitch} />
                            </div>
                            <div className="mt-auto pt-0.5">
                                <button className="h-[28px] w-full rounded-md text-[10px] font-bold flex items-center justify-center gap-1 border border-[#B0C4DE] bg-white text-[#4D94FF] hover:bg-blue-50 active:scale-95 shadow-sm transition-all">
                                    <Info size={14} /> {t("scanFlow.parameterDetails")}
                                </button>
                            </div>
                        </div>
                    ) : isBreathingAcquisitionStep ? (
                        <div className="border-t border-[#EEF2F9] bg-[#F8FAFC] px-3 pt-3 pb-2 flex-1 flex flex-col gap-2 overflow-hidden">
                            {/* Read-only 呼吸参数 */}
                            <div className="text-[10px] font-black text-[#90A4AE] uppercase tracking-wider px-0.5">呼吸参数</div>
                            <div className="grid grid-cols-2 gap-1.5 overflow-y-auto">
                                {[
                                    { label: "原始数据主频率", value: `${displayMetrics.rawMainFreq} Hz` },
                                    { label: "峰值误差", value: `${displayMetrics.peakErr}%` },
                                    { label: "呼吸频率", value: `${displayMetrics.bpm} BPM` },
                                    { label: "频率误差", value: `${displayMetrics.freqErr}%` },
                                ].map(({ label, value }) => (
                                    <div key={label} className="px-1.5 py-1 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{label}</span>
                                        <span className="mt-px text-[12px] font-black text-[#37474F]">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : is4DParamConfirmStep || is4DScoutExecuteStep ? (
                        <FourDScoutParamPanel
                            params={fourDScoutParams}
                            onChange={(key, value) => setFourDScoutParams((prev) => ({ ...prev, [key]: value }))}
                            readOnly={is4DScoutExecuteStep}
                        />
                    ) : (
                        <div className={`mt-auto border-t border-[#EEF2F9] bg-[#F8FAFC] px-4 py-3 shrink-0 transition-all duration-300 ${isTreeCollapsed ? 'flex-1 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]' : 'h-[168px]'}`}>
                            <div className="mb-3 text-[12px] font-bold text-[#546E7A]">{positioningHint}</div>
                            <div className="flex items-stretch gap-3 h-[calc(100%-28px)]">
                                <div className="flex flex-col items-center self-stretch justify-center py-2 shrink-0">
                                    <button
                                        onClick={() => setSelectedPosition('start')}
                                        className={`w-3 h-3 rounded-full border-2 flex items-center justify-center p-[2px] shrink-0 transition-all ${selectedPosition === 'start' ? 'bg-[#4D94FF] border-white shadow-sm' : 'bg-white border-[#B0C4DE]'}`}
                                    >
                                        {selectedPosition === 'start' && <div className="w-full h-full bg-white rounded-full" />}
                                    </button>
                                    <div className="w-px flex-1 bg-[#C5D5E8] my-1" />
                                    <button
                                        onClick={handleSwap}
                                        title={t("scanFlow.positioning.swapRange")}
                                        className="w-[20px] h-[20px] rounded-full bg-white border border-[#B0C4DE] flex items-center justify-center text-[#78A0BF] hover:text-[#4D94FF] hover:border-[#4D94FF] hover:bg-[#EEF6FF] transition-all active:scale-90 shadow-sm shrink-0"
                                    >
                                        <ArrowUpDown size={10} />
                                    </button>
                                    <div className="w-px flex-1 bg-[#C5D5E8] my-1" />
                                    <button
                                        onClick={() => setSelectedPosition('end')}
                                        className={`w-3 h-3 rounded-full border-2 flex items-center justify-center p-[2px] shrink-0 transition-all ${selectedPosition === 'end' ? 'bg-[#66BB6A] border-white shadow-sm' : 'bg-white border-[#B0C4DE]'}`}
                                    >
                                        {selectedPosition === 'end' && <div className="w-full h-full bg-white rounded-full" />}
                                    </button>
                                </div>

                                <div className="flex flex-col flex-1 min-w-0 self-stretch justify-between py-4">
                                    <div
                                        onClick={() => setSelectedPosition('start')}
                                        className="flex items-center gap-2 h-[32px] min-w-0 cursor-pointer"
                                    >
                                        <span className={`text-[11px] font-bold w-[72px] shrink-0 transition-colors ${selectedPosition === 'start' ? 'text-[#4D94FF]' : 'text-[#90A4AE]'}`}>{t("scanFlow.positioning.startPosition")}</span>
                                        <input
                                            type="text"
                                            value={startPos}
                                            onChange={(e) => {
                                                setSelectedPosition('start');
                                                setStartPos(e.target.value);
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedPosition('start');
                                            }}
                                            className={`flex-1 min-w-0 h-[32px] bg-white border rounded px-2 text-[13px] font-bold outline-none transition-colors ${selectedPosition === 'start' ? 'border-[#4D94FF] text-[#4D94FF]' : 'border-[#B0C4DE] text-[#90A4AE]'} focus:border-[#4D94FF]`}
                                        />
                                    </div>
                                    <div
                                        onClick={() => setSelectedPosition('end')}
                                        className="flex items-center gap-2 h-[32px] min-w-0 cursor-pointer"
                                    >
                                        <span className={`text-[11px] font-bold w-[72px] shrink-0 transition-colors ${selectedPosition === 'end' ? 'text-[#66BB6A]' : 'text-[#90A4AE]'}`}>{t("scanFlow.positioning.endPosition")}</span>
                                        <input
                                            type="text"
                                            value={endPos}
                                            onChange={(e) => {
                                                setSelectedPosition('end');
                                                setEndPos(e.target.value);
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedPosition('end');
                                            }}
                                            className={`flex-1 min-w-0 h-[32px] bg-white border rounded px-2 text-[13px] font-bold outline-none transition-colors ${selectedPosition === 'end' ? 'border-[#66BB6A] text-[#66BB6A]' : 'border-[#B0C4DE] text-[#90A4AE]'} focus:border-[#4D94FF]`}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </aside>

                {/* Right Viewport Area */}
                <section className={`flex-1 ${isBreathingAcquisitionStep ? 'bg-transparent border-0 shadow-none' : `${viewportBgClassName} rounded-lg border border-[#B0C4DE] shadow-sm`} flex flex-col overflow-hidden relative`}>
                    {isBreathingAcquisitionStep ? (
                        <div className="flex-1 flex flex-col bg-transparent relative gap-2">
                            {/* Full-bleed waveform as the hero */}
                            <div className="min-h-0 flex-1 bg-gradient-to-b from-white to-[#F6FAFE] rounded-lg border border-[#B0C4DE]/50 shadow-sm relative overflow-hidden">
                                {/* Top-left: status cluster */}
                                <div className="absolute left-4 top-4 flex items-center gap-2 z-10">
                                    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-sm ${respiraScopeBadgeClassName}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${respiraScopeDotClassName}`}></div>
                                        <span className="text-[11px] font-bold">{liveWaveBadgeLabel}</span>
                                    </div>
                                    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-sm ${isBreathingStatusReady ? 'border-[#C8E6C9] bg-[#E8F5E9]' : 'border-[#FFE0B2] bg-[#FFF8E1]'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${isBreathingStatusReady ? 'bg-[#4CAF50]' : 'bg-[#FFA726] animate-pulse'}`}></div>
                                        <span className={`text-[11px] font-bold ${isBreathingStatusReady ? 'text-[#2E7D32]' : 'text-[#E65100]'}`}>
                                            {breathingPhaseLabel}
                                        </span>
                                    </div>
                                </div>

                                {/* Top-right: sample value + 参数 toggle */}
                                <div className="absolute right-4 top-4 flex items-center gap-2 z-10">
                                    <div className="bg-white/90 backdrop-blur border border-[#E3EAF3] rounded-lg px-3 py-1.5 shadow-sm">
                                        <div className="text-[8px] font-black text-[#90A4AE] uppercase tracking-wider leading-none">实时采样</div>
                                        <div className="flex items-baseline gap-1 mt-0.5">
                                            <span className="text-[20px] font-black text-[#2F80FF] tabular-nums leading-none">{latestSignalDisplay}</span>
                                            <span className="text-[10px] font-bold text-[#90A4AE]">a.u.</span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setBreathingParamsExpanded(v => !v)}
                                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold shadow-sm transition-colors ${breathingParamsExpanded ? 'border-[#4D94FF] bg-[#E3F2FD] text-[#1565C0]' : 'border-[#B0C4DE] bg-white text-[#546E7A] hover:border-[#4D94FF] hover:text-[#1565C0]'}`}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                        {t("scanFlow.acquisitionParams")}
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${breathingParamsExpanded ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
                                    </button>
                                </div>

                                {/* Gridlines */}
                                <div className="absolute inset-x-10 top-20 bottom-10 flex flex-col justify-between pointer-events-none opacity-25">
                                    {[1100, 1000, 800, 600, 400, 200, 0].map(val => (
                                        <div key={val} className="flex items-center gap-2">
                                            <span className="text-[10px] w-8 text-right font-mono text-[#90A4AE]">{val}</span>
                                            <div className="flex-1 h-[1px] bg-[#B0C4DE]"></div>
                                        </div>
                                    ))}
                                </div>
                                {/* Vertical gridlines */}
                                <div className="absolute inset-x-14 top-20 bottom-10 bg-[linear-gradient(to_right,rgba(77,148,255,0.08)_1px,transparent_1px)] bg-[size:80px_100%] pointer-events-none" />

                                {/* Waveform SVG, expanded to fill viewport */}
                                <div className="absolute inset-x-0 top-18 bottom-8 flex flex-col justify-end px-16" style={{ top: '4.5rem' }}>
                                    <svg viewBox="0 0 800 320" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                        <defs>
                                            <linearGradient id="acq-wave-fill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#7EAAFF" stopOpacity="0.28" />
                                                <stop offset="100%" stopColor="#7EAAFF" stopOpacity="0.02" />
                                            </linearGradient>
                                        </defs>
                                        <line x1="0" y1="160" x2="800" y2="160" stroke="#7FA1C5" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.5" />
                                        <path d={`M ${displayRawWaveData.map((v,i)=>`${(i/(displayRawWaveData.length-1))*800},${320-(v/1100)*320}`).join(' L ')}`} fill="none" stroke="#8FA3B8" strokeWidth="1.4" className="opacity-50" />
                                        <path d={`M 0,320 L ${displayFilteredWaveData.map((v,i)=>`${(i/(displayFilteredWaveData.length-1))*800},${320-(v/1100)*320}`).join(' L ')} L 800,320 Z`} fill="url(#acq-wave-fill)" />
                                        <path d={`M ${displayFilteredWaveData.map((v,i)=>`${(i/(displayFilteredWaveData.length-1))*800},${320-(v/1100)*320}`).join(' L ')}`} fill="none" stroke="#2F80FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 5px rgba(77,148,255,0.32))" }} />
                                        {displayFilteredWaveData.map((v, i) => {
                                            if (i < 10 || i > displayFilteredWaveData.length - 10) return null;
                                            const mx = v > displayFilteredWaveData[i-1] && v > displayFilteredWaveData[i+1] && v > displayFilteredWaveData[i-2] && v > displayFilteredWaveData[i+2] && v > displayFilteredWaveData[i-3] && v > displayFilteredWaveData[i+3];
                                            const mn = v < displayFilteredWaveData[i-1] && v < displayFilteredWaveData[i+1] && v < displayFilteredWaveData[i-2] && v < displayFilteredWaveData[i+2] && v < displayFilteredWaveData[i-3] && v < displayFilteredWaveData[i+3];
                                            if (mx && v >= 650) return <circle key={`pk-${i}`} cx={(i/(displayFilteredWaveData.length-1))*800} cy={320-(v/1100)*320} r="5" fill="#FF1744" stroke="#FFF" strokeWidth="1.5" />;
                                            if (mn && v <= 380) return <circle key={`vl-${i}`} cx={(i/(displayFilteredWaveData.length-1))*800} cy={320-(v/1100)*320} r="4.5" fill="#FFD600" stroke="#FFF" strokeWidth="1.2" />;
                                            return null;
                                        })}
                                    </svg>
                                </div>

                                {/* Bottom legend */}
                                <div className="absolute left-4 bottom-3 flex items-center gap-3 text-[10px] text-[#78909C] pointer-events-none">
                                    <div className="flex items-center gap-1"><span className="w-3 h-[2px] bg-[#2F80FF] rounded"></span><span>滤波信号</span></div>
                                    <div className="flex items-center gap-1"><span className="w-3 h-[1px] bg-[#8FA3B8] opacity-60"></span><span>原始信号</span></div>
                                    <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#FF1744]"></span><span>峰值</span></div>
                                    <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#FFD600]"></span><span>谷值</span></div>
                                </div>

                                {renderRespiraScopeConnectionOverlay()}
                            </div>

                            {/* Collapsible params sheet — in-flow so it compresses the waveform instead of overlaying */}
                            {breathingParamsExpanded && (
                                <div className="shrink-0 rounded-lg border border-[#B0C4DE]/60 bg-white shadow-sm">
                                    <div className="px-4 pt-3 pb-4">
                                        <div className="mb-2 flex items-center justify-between">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-[13px] font-black text-[#37474F]">{t("scanFlow.acquisitionParams")}</span>
                                                <span className="text-[10px] font-mono text-[#90A4AE]">Acquisition Controls</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setBreathingParamsExpanded(false)}
                                                className="text-[11px] font-bold text-[#90A4AE] hover:text-[#546E7A] px-2 py-1"
                                            >收起 ▾</button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-x-5 gap-y-2">
                                            <SliderField label="最小间距" min={0.5} max={5} step={0.1} value={breathingAcquisitionParams.minSpacing} onChange={(v) => setBreathingAcquisitionParams(p => ({ ...p, minSpacing: v }))} />
                                            <SliderField label="滤波范围" min={0.1} max={1} step={0.01} value={breathingAcquisitionParams.filterThreshold} onChange={(v) => setBreathingAcquisitionParams(p => ({ ...p, filterThreshold: v }))} />
                                            <SliderField label="峰值阈值" min={0.5} max={2.5} step={0.05} value={breathingAcquisitionParams.peakThreshold} onChange={(v) => setBreathingAcquisitionParams(p => ({ ...p, peakThreshold: v }))} />
                                            <SliderField label="谷值阈值" min={0.1} max={1} step={0.01} value={breathingAcquisitionParams.valleyThreshold} onChange={(v) => setBreathingAcquisitionParams(p => ({ ...p, valleyThreshold: v }))} />
                                            <SliderField label="增益" min={0.5} max={3} step={0.1} value={breathingAcquisitionParams.gain} onChange={(v) => setBreathingAcquisitionParams(p => ({ ...p, gain: v }))} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : isBreathingTraining ? (
                        <div className="flex-1 flex flex-col gap-2 bg-transparent">
                            <div className="min-h-0 flex-[1.2] overflow-hidden rounded-md border border-[#B0C4DE]/30 bg-[#16202B]">
                                <div className="grid h-full grid-cols-2 gap-[2px] bg-[#16202B]">
                                    <div className="relative overflow-hidden bg-black">
                                        
                                        <BreathingScoutViewport />
                                    </div>
                                    <div className="relative overflow-hidden bg-black">
                                       
                                        <BreathingScanPreviewViewport />
                                    </div>
                                </div>
                            </div>

                            <div className="h-[190px] shrink-0 rounded-md border border-[#B0C4DE]/50 bg-[linear-gradient(180deg,#FFFFFF_0%,#F6FAFE_100%)] shadow-inner px-1 pt-2 pb-0 relative overflow-hidden">
                                <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#EAF3FF]/70 to-transparent" />
                               
                                <div className="absolute inset-x-2 top-6 bottom-10 pointer-events-none">
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(77,148,255,0.1)_1px,transparent_1px)] bg-[size:64px_100%] opacity-60" />
                                </div>
                                <div className="absolute inset-x-2 top-6 bottom-10 flex flex-col justify-between pointer-events-none opacity-35">
                                    {[1100, 1000, 800, 600, 400, 200, 0].map(val => (
                                        <div key={val} className="flex items-center gap-2">
                                            <span className="text-[10px] w-7 text-right font-mono font-bold text-[#70859A]">{val}</span>
                                            <div className="flex-1 h-[1px] bg-[#9DB7D3]"></div>
                                        </div>
                                    ))}
                                </div>

                                <div className="absolute left-0 right-0 top-4 bottom-9 flex flex-col justify-end px-3">
                                    <svg viewBox="0 0 800 160" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                        <defs>
                                            <linearGradient id="breathing-wave-fill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#7EAAFF" stopOpacity="0.22" />
                                                <stop offset="100%" stopColor="#7EAAFF" stopOpacity="0.02" />
                                            </linearGradient>
                                        </defs>
                                        <line x1="0" y1="80" x2="800" y2="80" stroke="#7FA1C5" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.55" />
                                        <path
                                            d={`M ${displayRawWaveData.map((val, i) => `${(i / (displayRawWaveData.length - 1)) * 800},${160 - (val / 1100) * 160}`).join(' L ')}`}
                                            fill="none"
                                            stroke="#8FA3B8"
                                            strokeWidth="1.4"
                                            className="opacity-55"
                                        />
                                        <path
                                            d={`M 0,160 L ${displayFilteredWaveData.map((val, i) => `${(i / (displayFilteredWaveData.length - 1)) * 800},${160 - (val / 1100) * 160}`).join(' L ')} L 800,160 Z`}
                                            fill="url(#breathing-wave-fill)"
                                        />
                                        <path
                                            d={`M ${displayFilteredWaveData.map((val, i) => `${(i / (displayFilteredWaveData.length - 1)) * 800},${160 - (val / 1100) * 160}`).join(' L ')}`}
                                            fill="none"
                                            stroke="#2F80FF"
                                            strokeWidth="2.8"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            style={{ filter: "drop-shadow(0 0 4px rgba(77,148,255,0.28))" }}
                                        />
                                        {displayFilteredWaveData.map((val, i) => {
                                            if (i < 10 || i > displayFilteredWaveData.length - 10) return null;

                                            const isLocalMax = val > displayFilteredWaveData[i - 1] && val > displayFilteredWaveData[i + 1] &&
                                                val > displayFilteredWaveData[i - 2] && val > displayFilteredWaveData[i + 2] &&
                                                val > displayFilteredWaveData[i - 3] && val > displayFilteredWaveData[i + 3];
                                            const isLocalMin = val < displayFilteredWaveData[i - 1] && val < displayFilteredWaveData[i + 1] &&
                                                val < displayFilteredWaveData[i - 2] && val < displayFilteredWaveData[i + 2] &&
                                                val < displayFilteredWaveData[i - 3] && val < displayFilteredWaveData[i + 3];

                                            if (isLocalMax && val >= 650) {
                                                return (
                                                    <circle
                                                        key={`pk-${i}`}
                                                        cx={(i / (displayFilteredWaveData.length - 1)) * 800}
                                                        cy={160 - (val / 1100) * 160}
                                                        r="4.5"
                                                        fill="#FF1744"
                                                        stroke="#FFF"
                                                        strokeWidth="1.5"
                                                    />
                                                );
                                            }

                                            if (isLocalMin && val <= 380) {
                                                return (
                                                    <circle
                                                        key={`vl-${i}`}
                                                        cx={(i / (displayFilteredWaveData.length - 1)) * 800}
                                                        cy={160 - (val / 1100) * 160}
                                                        r="4"
                                                        fill="#FFD600"
                                                        stroke="#FFF"
                                                        strokeWidth="1.2"
                                                    />
                                                );
                                            }

                                            return null;
                                        })}
                                    </svg>
                                </div>

                                <div className="absolute right-4 top-8 rounded border border-[#B0C4DE]/50 bg-white p-2 shadow-xl z-10 scale-90">
                                    <div className="text-[10px] font-bold text-[#546E7A]">呼吸频率</div>
                                    <div className="text-[10px] text-[#90A4AE]">{displayMetrics.bpm} BPM</div>
                                    <div className="mt-1 text-[10px] font-bold text-[#546E7A]">频率误差</div>
                                    <div className="text-[10px] text-[#90A4AE]">{displayMetrics.freqErr}%</div>
                                </div>

                                <div className="pointer-events-none absolute left-12 top-2 text-[9px] font-mono font-bold tracking-[0.08em] text-[#8AA1B8]">
                                    RESP SIGNAL
                                </div>

                                <div className="pointer-events-none absolute inset-x-3 bottom-1 flex items-end gap-2">
                                    <div className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5">
                                        <span className="shrink-0 text-[8px] font-black tracking-[0.18em] text-[#6E88A2]">床位</span>
                                        {Array.from({ length: BREATHING_BED_POSITION_COUNT }, (_, index) => (
                                            <div key={`bed-position-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                                                <div
                                                    className={`h-3 w-full rounded-sm border transition-colors ${
                                                        index < breathingBedIndex
                                                            ? "border-[#5A9CFF] bg-gradient-to-b from-[#9DC4FF] to-[#5A9CFF]"
                                                            : index === breathingBedIndex
                                                                ? "border-[#2F80FF] bg-gradient-to-b from-[#D9E9FF] to-[#87B4FF]"
                                                                : "border-[#9DB7D3] bg-gradient-to-b from-[#EAF2FB] to-[#D7E6F7]"
                                                    }`}
                                                />
                                                <span className={`text-[8px] leading-none font-mono ${index === breathingBedIndex ? "text-[#2F80FF]" : "text-[#7A8DA1]"}`}>{index + 1}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="px-1 py-0.5 text-[9px] font-mono text-[#5F7892]">
                                        当前: #{breathingBedIndex + 1}
                                    </div>
                                </div>

                                {renderRespiraScopeConnectionOverlay(true)}
                            </div>
                        </div>
                    ) : bottomPanelMode === 'breathing' ? (
                        <div className="flex-1 flex flex-col gap-2 bg-transparent">
                            <div className="shrink-0 rounded-md border border-[#B0C4DE]/40 bg-white p-4 shadow-sm">
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="text-[14px] font-black text-[#37474F]">{t("scanFlow.acquisitionParams")}</div>
                                    <div className="text-[10px] font-mono text-[#90A4AE]">Acquisition Controls</div>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                    <SliderField
                                        label="最小间距"
                                        min={0.5}
                                        max={5}
                                        step={0.1}
                                        value={breathingAcquisitionParams.minSpacing}
                                        onChange={(value) => setBreathingAcquisitionParams((prev) => ({ ...prev, minSpacing: value }))}
                                    />
                                    <SliderField
                                        label="滤波阈值"
                                        min={0.1}
                                        max={1}
                                        step={0.01}
                                        value={breathingAcquisitionParams.filterThreshold}
                                        onChange={(value) => setBreathingAcquisitionParams((prev) => ({ ...prev, filterThreshold: value }))}
                                    />
                                    <SliderField
                                        label="峰值阈值"
                                        min={0.5}
                                        max={2.5}
                                        step={0.05}
                                        value={breathingAcquisitionParams.peakThreshold}
                                        onChange={(value) => setBreathingAcquisitionParams((prev) => ({ ...prev, peakThreshold: value }))}
                                    />
                                    <SliderField
                                        label="谷值阈值"
                                        min={0.1}
                                        max={1}
                                        step={0.01}
                                        value={breathingAcquisitionParams.valleyThreshold}
                                        onChange={(value) => setBreathingAcquisitionParams((prev) => ({ ...prev, valleyThreshold: value }))}
                                    />
                                    <div className="col-span-2">
                                        <SliderField
                                            label="增益"
                                            min={0.5}
                                            max={3}
                                            step={0.1}
                                            value={breathingAcquisitionParams.gain}
                                            onChange={(value) => setBreathingAcquisitionParams((prev) => ({ ...prev, gain: value }))}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 bg-white rounded-md border border-[#B0C4DE]/40 shadow-inner p-3 relative overflow-hidden">
                                <div className={`absolute left-3 top-3 flex items-center gap-1.5 rounded border px-2 py-1 ${respiraScopeBadgeClassName}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${respiraScopeDotClassName}`}></div>
                                    <span className="text-[10px] font-bold">{liveWaveBadgeLabel}</span>
                                </div>

                                <div className="absolute inset-x-8 top-7 bottom-7 flex flex-col justify-between pointer-events-none opacity-20">
                                    {[1100, 1000, 800, 600, 400, 200, 0].map(val => (
                                        <div key={val} className="flex items-center gap-2">
                                            <span className="text-[10px] w-6 text-right font-mono text-[#90A4AE]">{val}</span>
                                            <div className="flex-1 h-[1px] bg-[#B0C4DE]"></div>
                                        </div>
                                    ))}
                                </div>

                                <div className="absolute inset-x-0 inset-y-5 flex flex-col justify-end px-14">
                                    <svg viewBox="0 0 800 160" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                        <path
                                            d={`M ${displayRawWaveData.map((val, i) => `${(i / (displayRawWaveData.length - 1)) * 800},${160 - (val / 1100) * 160}`).join(' L ')}`}
                                            fill="none"
                                            stroke="#B0BEC5"
                                            strokeWidth="1.2"
                                            className="opacity-40"
                                        />
                                        <path
                                            d={`M ${displayFilteredWaveData.map((val, i) => `${(i / (displayFilteredWaveData.length - 1)) * 800},${160 - (val / 1100) * 160}`).join(' L ')}`}
                                            fill="none"
                                            stroke="#4D94FF"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                        {displayFilteredWaveData.map((val, i) => {
                                            if (i < 10 || i > displayFilteredWaveData.length - 10) return null;

                                            const isLocalMax = val > displayFilteredWaveData[i - 1] && val > displayFilteredWaveData[i + 1] &&
                                                val > displayFilteredWaveData[i - 2] && val > displayFilteredWaveData[i + 2] &&
                                                val > displayFilteredWaveData[i - 3] && val > displayFilteredWaveData[i + 3];
                                            const isLocalMin = val < displayFilteredWaveData[i - 1] && val < displayFilteredWaveData[i + 1] &&
                                                val < displayFilteredWaveData[i - 2] && val < displayFilteredWaveData[i + 2] &&
                                                val < displayFilteredWaveData[i - 3] && val < displayFilteredWaveData[i + 3];

                                            if (isLocalMax && val >= 650) {
                                                return (
                                                    <circle
                                                        key={`pk-${i}`}
                                                        cx={(i / (displayFilteredWaveData.length - 1)) * 800}
                                                        cy={160 - (val / 1100) * 160}
                                                        r="4"
                                                        fill="#FF1744"
                                                        stroke="#FFF"
                                                        strokeWidth="1.5"
                                                    />
                                                );
                                            }

                                            if (isLocalMin && val <= 380) {
                                                return (
                                                    <circle
                                                        key={`vl-${i}`}
                                                        cx={(i / (displayFilteredWaveData.length - 1)) * 800}
                                                        cy={160 - (val / 1100) * 160}
                                                        r="3.5"
                                                        fill="#FFD600"
                                                        stroke="#FFF"
                                                        strokeWidth="1"
                                                    />
                                                );
                                            }

                                            return null;
                                        })}
                                    </svg>
                                </div>

                                {renderRespiraScopeConnectionOverlay(true)}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center overflow-hidden">
                            <div className="w-full h-full opacity-10 bg-gradient-to-br from-blue-900/40 to-transparent flex items-center justify-center text-[#546E7A] uppercase font-thin text-[52px] tracking-[16px]">
                                Viewport
                            </div>
                        </div>
                    )}
                </section>
            </main>

            {/* 3. Footer (Nav Buttons) */}
            <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10">
                <div className="flex-1">
                    <button
                        onClick={handlePreviousStep}
                        className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-solid shadow-sm transition-all uppercase text-[13px] active:scale-95"
                    >
                        <ChevronLeft size={20} /> {t("common.previousStep")}
                    </button>
                </div>

                {isBreathingAcquisitionStep ? (
                    <div className="flex-1" />
                ) : bottomPanelMode === 'breathing' ? (
                    <div className="flex-1 flex justify-center items-center gap-2" />
                ) : (
                    <div className="flex-1 flex justify-center">
                        <button
                            onClick={() => setShowAbortConfirm(true)}
                            className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#F57C00] font-bold rounded-md border-2 border-[#F57C00] hover:bg-orange-50 transition-all uppercase text-[13px] shadow-sm active:scale-95">
                            <AlertTriangle size={20} /> {t("scanFlow.abortExam")}
                        </button>
                    </div>
                )}

                <div className="flex-1 flex justify-end">
                    <button
                        disabled={isBreathingAcquisitionStep && !canContinueBreathingAcquisition}
                        onClick={async () => {
                            if (isBreathingAcquisitionStep) {
                                if (!canContinueBreathingAcquisition) return;
                                setActiveStepIdx(idx => idx + 1);
                                return;
                            }
                            if (is4DWorkflow && activeStepIdx === 2) {
                                try { await persistPositioningToSession(); } catch (error) { console.error(error); }
                                navigate('/scout-execute', {
                                    state: {
                                        showCombinedPatientConfirm: true,
                                        returnRoute: "/scout-scan",
                                        returnStep: activeStepIdx,
                                    },
                                });
                                return;
                            }
                            // 4D scout 共4步(0-3)，步骤0-2推进，步骤3才导航
                            if (is4DWorkflow && activeStepIdx < 3) {
                                setActiveStepIdx(idx => idx + 1);
                                return;
                            }
                            if (bottomPanelMode !== 'breathing') {
                                try { await persistPositioningToSession(); } catch (error) { console.error(error); }
                                navigate('/scan-confirm');
                            }
                        }}
                        className={`flex items-center gap-2 px-10 h-[52px] font-bold rounded-md shadow-lg transition-all uppercase text-[13px] active:scale-95 ${
                            (isBreathingAcquisitionStep && !canContinueBreathingAcquisition)
                                ? 'bg-gray-300 text-white cursor-not-allowed shadow-none active:scale-100'
                                : (isBreathingAcquisitionStep ? 'bg-[#4D94FF] text-white hover:bg-blue-600' : (bottomPanelMode === 'breathing' ? 'bg-[#7EAAFF] text-white hover:bg-[#6FA0FF]' : 'bg-[#4D94FF] text-white hover:bg-blue-600'))
                        }`}
                    >
                        {isBreathingAcquisitionStep ? t("scanFlow.scout") : (is4DWorkflow && activeStepIdx === 2 ? t("scanFlow.executeScan") : (bottomPanelMode === 'breathing' ? t("scanFlow.postScout.axial") : t("common.nextStep")))} <ChevronRight size={20} />
                    </button>
                </div>
            </footer>

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl border border-[#B0C4DE] w-[340px] overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 bg-[#FFF8E1] border-b border-[#FFE082]">
                            <div className="w-9 h-9 rounded-full bg-[#F57C00]/10 flex items-center justify-center shrink-0">
                                <Trash2 size={16} className="text-[#F57C00]" />
                            </div>
                            <div>
                                <div className="text-[14px] font-black text-[#37474F]">{t("scanFlow.confirmDelete")}</div>
                                <div className="text-[11px] text-[#78909C] mt-0.5">{t("scanFlow.selectedCannotUndo", { count: selectedIds.length })}</div>
                            </div>
                        </div>
                        <div className="flex gap-2 px-5 py-4">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 h-[40px] bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg text-[13px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                {t("common.cancel")}
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="flex-1 h-[40px] bg-[#D32F2F] text-white font-bold rounded-lg text-[13px] hover:bg-red-700 shadow-md transition-all active:scale-95"
                            >
                                {t("scanFlow.confirmDelete")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Abort Confirmation Dialog */}
            {showAbortConfirm && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl border border-[#FFE082] w-[360px] overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 bg-[#FFF8E1] border-b border-[#FFE082]">
                            <div className="w-10 h-10 rounded-full bg-[#F57C00]/15 flex items-center justify-center shrink-0">
                                <AlertTriangle size={20} className="text-[#F57C00]" />
                            </div>
                            <div>
                                <div className="text-[15px] font-black text-[#37474F]">{t("scanFlow.abortExam")}</div>
                                <div className="text-[12px] text-[#78909C] mt-0.5">{t("scanFlow.abortQuestion")}</div>
                            </div>
                        </div>
                        <div className="px-5 py-3">
                            <p className="text-[13px] text-[#546E7A] leading-relaxed">
                                {t("scanFlow.abortBodyStart")}<span className="font-bold text-[#37474F]">{t("scanFlow.abortBodyStrong")}</span>{t("scanFlow.abortBodyEnd")}
                            </p>
                        </div>
                        <div className="flex gap-2 px-5 pb-5">
                            <button
                                onClick={() => setShowAbortConfirm(false)}
                                className="flex-1 h-[40px] bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg text-[13px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                {t("scanFlow.continueExam")}
                            </button>
                            <button
                                onClick={() => {
                                    setShowAbortConfirm(false);
                                    navigate('/patients');
                                }}
                                className="flex-1 h-[40px] bg-[#F57C00] text-white font-bold rounded-lg text-[13px] hover:bg-orange-600 shadow-md transition-all active:scale-95"
                            >
                                {t("scanFlow.confirmAbort")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// MetricRow removed


const SliderField = ({ label, value, min, max, step, onChange }: {
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
}) => {
    return (
        <label className="block">
            <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-[#546E7A]">
                <span>{label}</span>
                <span className="font-mono text-[#37474F]">{value.toFixed(step < 0.1 ? 2 : 1)}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="w-full accent-[#4D94FF]"
            />
        </label>
    );
};

export default ScoutScanScreen;
