import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as dicomParser from "dicom-parser";
import {
    User,
    Settings,
    Sun,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsUp,
    FilePlus,
    Trash2,
    Check,
    Info,
    Flame,
    Network,
    Siren,
    Zap,
} from "lucide-react";
import { fetchSelectedScanSession, updateSelectedScanSessionHelicalParam } from "../lib/scanSession";
import type { ApiScanSessionDetail } from "../lib/scanSession";

import { formatPatientCardSubtitle, loadSelectedPatient } from "../lib/patientSession";
import { loadSelectedScanWorkflowPlans, type WorkflowSequenceType } from "../lib/scanWorkflowSession";
import ScanConfirmScreen, { PatientConfirmationModal } from "./ScanConfirmScreen";
import { TomographicScoutViewport } from "./SequenceScanConfirmScreen";

// ---------------------------------------------------------------------------
// Constants for gating waveform / bed positions / DICOM
// ---------------------------------------------------------------------------
const BREATHING_BED_POSITION_COUNT = 10;
const FOUR_D_SCOUT_SERIES = {
    basePath: "/dicom/QIN LUNG CT/QIN-LUNG-01-0007/01-12-2000-1-CT Thorax wContrast-47252/2.000000-THORAX W  3.0 B41 Soft Tissue-52055",
    count: 118,
    fallbackWindowWidth: 350,
    fallbackWindowLevel: 45,
};

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

type ScanStage = "idle" | "arming" | "enabled" | "exposing" | "completed";
const HOLD_DURATION_MS = 3000;

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

// ---------------------------------------------------------------------------
// Gating Scout Viewport (Robust implementation copied from ScoutScanScreen)
// ---------------------------------------------------------------------------
export interface FourDScoutViewportProps {
    onCropBoxChange?: (box: { width: number; height: number }) => void;
    onRectChange?: (rect: { x: number; y: number; width: number; height: number }) => void;
    isScanning?: boolean;
    revealY?: number; // 0 to 1
}

export function FourDScoutViewport({ onCropBoxChange, onRectChange, isScanning, revealY = 1 }: FourDScoutViewportProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const projectionRef = useRef<Float32Array | null>(null);
    const projectionSizeRef = useRef<{ width: number; height: number } | null>(null);
    const metaRef = useRef<{ ww: number; wl: number; kvp: string; mas: string; thickness: string } | null>(null);

    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [meta, setMeta] = useState<{ width: number; height: number; ww: number; wl: number; kvp: string; mas: string; thickness: string } | null>(null);
    const [windowWidth, setWindowWidth] = useState(FOUR_D_SCOUT_SERIES.fallbackWindowWidth);
    const [windowLevel, setWindowLevel] = useState(FOUR_D_SCOUT_SERIES.fallbackWindowLevel);
    const [isAdjustingWindow, setIsAdjustingWindow] = useState(false);
    const [cropBox, setCropBox] = useState({ x: 0.2, y: 0.18, width: 0.56, height: 0.48 });

    const dragStateRef = useRef<{ startX: number; startY: number; startWw: number; startWl: number } | null>(null);
    const cropDragStateRef = useRef<{ handle: FourDDragHandle; startX: number; startY: number; initialBox: { x: number; y: number; width: number; height: number } } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const loadSlices = async () => {
            try {
                const sliceNumbers = Array.from({ length: FOUR_D_SCOUT_SERIES.count }, (_, index) => index + 1);
                const slices: FourDLoadedSlice[] = [];
                const concurrency = 8;

                for (let start = 0; start < sliceNumbers.length; start += concurrency) {
                    const batch = sliceNumbers.slice(start, start + concurrency);
                    const loadedBatch = await Promise.all(
                        batch.map(async (sliceNumber) => {
                            const fileName = `1-${String(sliceNumber).padStart(3, "0")}.dcm`;
                            const response = await fetch(`${FOUR_D_SCOUT_SERIES.basePath}/${fileName}`);
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
            } catch (err) { console.error(err); if (!cancelled) setLoadState("error"); }
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
        const fitScale = Math.min(viewW / size.width, viewH / size.height), drawScale = fitScale * 0.98, drawW = size.width * drawScale, drawH = size.height * drawScale, x = (viewW - drawW) / 2, y = (viewH - drawH) / 2;
        
        ctx.drawImage(offscreen, x, y, drawW, drawH);
        
        ctx.restore();
    }, [loadState, windowLevel, windowWidth, isScanning, revealY]);

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
                if (onCropBoxChange) onCropBoxChange({ width: next.width, height: next.height });
                if (onRectChange) onRectChange(next);
                return;
            }
            if (!isAdjustingWindow || !dragStateRef.current) return;
            const deltaX = e.clientX - dragStateRef.current.startX, deltaY = e.clientY - dragStateRef.current.startY;
            setWindowWidth(Math.min(1800, Math.max(80, dragStateRef.current.startWw + deltaX * 4)));
            setWindowLevel(Math.min(300, Math.max(-300, dragStateRef.current.startWl - deltaY * 2)));
        };
        const handleMouseUp = () => { cropDragStateRef.current = null; dragStateRef.current = null; setIsAdjustingWindow(false); };
        window.addEventListener("mousemove", handleMouseMove); window.addEventListener("mouseup", handleMouseUp);
        return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
    }, [isAdjustingWindow]);

    const startCropDrag = (handle: FourDDragHandle) => (e: React.MouseEvent) => {
        if (loadState !== "ready") return; e.preventDefault(); e.stopPropagation();
        cropDragStateRef.current = { handle, startX: e.clientX, startY: e.clientY, initialBox: cropBox };
    };

    return (
        <div ref={viewportRef} onMouseDown={(e) => { if (loadState === "ready") { dragStateRef.current = { startX: e.clientX, startY: e.clientY, startWw: windowWidth, startWl: windowLevel }; setIsAdjustingWindow(true); } }} className="absolute inset-0 bg-black cursor-crosshair">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            {loadState === "loading" && <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#9FB2C5]">载入 DICOM 影像...</div>}
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

export function HelicalScanPreviewViewport({ isScanning, active, revealY = 1 }: HelicalScanPreviewViewportProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const slicesRef = useRef<FourDLoadedSlice[]>([]);
    const coronalProjectionRef = useRef<HTMLCanvasElement | null>(null);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [windowWidth] = useState(FOUR_D_SCOUT_SERIES.fallbackWindowWidth);
    const [windowLevel] = useState(FOUR_D_SCOUT_SERIES.fallbackWindowLevel);
    const [forceRender, setForceRender] = useState(0);

    // Load slices once
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const sliceNumbers = Array.from({ length: FOUR_D_SCOUT_SERIES.count }, (_, i) => i + 1);
                const loadedSlices: FourDLoadedSlice[] = [];
                const concurrency = 8;
                for (let start = 0; start < sliceNumbers.length; start += concurrency) {
                    const batch = sliceNumbers.slice(start, start + concurrency);
                    const batchResults = await Promise.all(batch.map(async (n) => {
                        const fileName = `1-${String(n).padStart(3, "0")}.dcm`;
                        const res = await fetch(`${FOUR_D_SCOUT_SERIES.basePath}/${fileName}`);
                        if (!res.ok) throw new Error("Fetch failed");
                        const ab = await res.arrayBuffer();
                        const ba = new Uint8Array(ab);
                        const ds = dicomParser.parseDicom(ba);
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
                setLoadState("ready");
            } catch (err) { console.error(err); if (!cancelled) setLoadState("error"); }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    // Determine current slice index for metadata overlay based on revealY
    const currentSliceIdx = useMemo(() => {
        if (loadState !== "ready" || slicesRef.current.length === 0) return 0;
        const total = slicesRef.current.length;
        return Math.min(Math.floor(revealY * total), total - 1);
    }, [revealY, loadState]);

    // Build Coronal projection once slices ready
    useEffect(() => {
        if (loadState !== "ready" || slicesRef.current.length === 0) return;
        
        const slices = slicesRef.current;
        const totalSlices = slices.length;
        const rows = slices[0].rows;
        const cols = slices[0].cols;

        // Generate a Coronal projection (using a middle row across all slices)
        const projectionCanvas = document.createElement("canvas");
        projectionCanvas.width = cols;
        projectionCanvas.height = totalSlices;
        const pCtx = projectionCanvas.getContext("2d")!;
        const pImgData = pCtx.createImageData(cols, totalSlices);
        const pData = pImgData.data;

        const minVal = windowLevel - windowWidth / 2, maxVal = windowLevel + windowWidth / 2, range = maxVal - minVal;
        
        // Take a middle Coronal slice (Y=256) across the volume
        const yCoord = Math.floor(rows / 2);
        
        for (let z = 0; z < totalSlices; z++) {
            const slice = slices[z];
            for (let x = 0; x < cols; x++) {
                const hu = slice.hu[yCoord * cols + x];
                const val = clamp01((hu - minVal) / range) * 255;
                const offset = (z * cols + x) * 4;
                pData[offset] = val; pData[offset+1] = val; pData[offset+2] = val; pData[offset+3] = 255;
            }
        }
        pCtx.putImageData(pImgData, 0, 0);
        coronalProjectionRef.current = projectionCanvas;
        setForceRender(f => f + 1);
    }, [loadState, windowWidth, windowLevel]);

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
    }, [forceRender, active, isScanning, revealY]);

    const currentSliceInfo = loadState === "ready" && slicesRef.current.length > 0
        ? slicesRef.current[currentSliceIdx]
        : null;

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

                    {loadState === "ready" && (
                        <>
                            <div className="pointer-events-none absolute right-3 top-3 text-right text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                                <div className={`font-bold uppercase ${isScanning ? "text-[#34D399]" : "text-[#F59E0B]"}`}>
                                    {isScanning ? "SCANNING..." : "READY"}
                                </div>
                            </div>
                            {isScanning && currentSliceInfo && (
                                <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-0.5">
                                    <div className="px-1.5 py-0.5 bg-[#34D399]/20 border border-[#34D399]/40 rounded text-[9px] font-black text-[#34D399] uppercase tracking-widest">
                                        Real-time Reconstruction
                                    </div>
                                    <div className="text-[10px] font-mono text-white/50">
                                        Pos: {currentSliceInfo.positionZ.toFixed(1)} mm
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
    const [holdProgress, setHoldProgress] = useState(0);
    const [scanProgress, setScanProgress] = useState(1); // 1 when idle/complete, 0-1 when scanning

    const rafRef = useRef<number | null>(null);
    const holdStartRef = useRef<number | null>(null);

    const clearHoldRaf = () => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };

    const triggerScanSequence = () => {
        clearHoldRaf();
        setHoldProgress(1);
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
    }, [scanStarted]);

    const startHold = () => {
        if (scanStage === "exposing" || scanStage === "completed") return;

        clearHoldRaf();
        holdStartRef.current = performance.now();
        setScanStage("arming");

        const tick = (timestamp: number) => {
            const startedAt = holdStartRef.current ?? timestamp;
            const nextProgress = Math.min((timestamp - startedAt) / HOLD_DURATION_MS, 1);
            setHoldProgress(nextProgress);

            if (nextProgress >= 1) {
                triggerScanSequence();
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
        setHoldProgress(0);
        setScanStage("idle");
    };

    const statusText =
        scanStage === "arming"
            ? `长按触发 ${Math.max(0, ((1 - holdProgress) * 3)).toFixed(1)}s`
            : scanStage === "enabled"
                ? "使能已建立"
                : scanStage === "exposing"
                    ? "正在扫描..."
                    : scanStage === "completed"
                        ? "扫描完成"
                        : "按住触发";

    const guideTitle =
        scanStage === "arming"
            ? "持续按住绿色按钮"
            : scanStage === "enabled"
                ? "系统已使能"
                : scanStage === "exposing"
                    ? "正在曝光"
                    : "按住绿色按钮";

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

    const handleScanComplete = useCallback(() => {
        setScanStarted(false);
        setScanCompleted(true);
        setBreathingBedIndex(BREATHING_BED_POSITION_COUNT);
    }, []);

    // Bed progress is now driven by HelicalScanPreviewViewport via onBedProgress callback
    useEffect(() => {
        if (!scanStarted) setBreathingBedIndex(0);
    }, [scanStarted]);

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
            <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                        <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
                            <User size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold text-[#37474F]">{selectedPatient?.name ?? "未选择患者"}</span>
                            <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5">{formatPatientCardSubtitle(selectedPatient)}</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
                        <div className="text-[9px] font-bold italic">♂ 0</div>
                        <div className="text-[9px] font-bold">♀ 0</div>
                        <div className="flex items-center gap-1 text-[11px] font-bold"><Flame size={14} /><span>0%</span></div>
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
                    <button onClick={() => setLaserActive((prev) => !prev)} className={`relative p-1 transition-all ${laserActive ? "text-[#F59E0B]" : "text-[#546E7A] hover:opacity-70"}`}>
                        <Sun size={24} />
                    </button>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Settings size={24} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">10</span>
                    </div>
                </div>
            </header>

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
                <div className="pointer-events-auto flex h-full w-[235px] flex-col overflow-hidden rounded-l-2xl border border-r-0 border-[#CBD5E1] bg-[#EDF1F7] shadow-[-24px_0_48px_rgba(15,23,42,0.22)]">
                    <div className="border-b border-slate-200 px-5 py-4">
                        <div className="text-[14px] font-black text-slate-700">实体按键操作引导</div>
                        <div className="mt-1 text-[11px] font-medium text-slate-400">长按三秒后触发曝光，并在左侧进行断层扫描。</div>
                    </div>

                    <div className="flex flex-1 flex-col">
                        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-6">
                            <div className="flex flex-col items-center gap-2">
                                <div className="rounded-full border border-[#B9C7D6] bg-white/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                                    Physical Trigger
                                </div>
                                <div className="text-center">
                                    <div className="text-[16px] font-black text-slate-700">{guideTitle}</div>
                                    <div className="mt-1 text-[11px] font-medium text-slate-400">{statusText}</div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onMouseDown={startHold}
                                onMouseUp={stopHold}
                                onMouseLeave={stopHold}
                                onTouchStart={startHold}
                                onTouchEnd={stopHold}
                                className={`group flex h-[132px] w-[132px] items-center justify-center rounded-full border-[10px] shadow-[0_22px_40px_rgba(15,23,42,0.28)] transition-all duration-200 ${scanStage === "arming" || scanStage === "enabled" || scanStage === "exposing"
                                    ? "border-[#14532D] bg-[radial-gradient(circle_at_35%_30%,#7EF29C_0%,#22C55E_45%,#15803D_100%)] scale-[0.97]"
                                    : "border-[#1F6E44] bg-[radial-gradient(circle_at_35%_30%,#90F8AE_0%,#22C55E_40%,#166534_100%)] hover:scale-[1.02]"
                                    }`}
                            >
                                <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full border border-white/35 bg-white/10 shadow-[inset_0_10px_18px_rgba(255,255,255,0.2)]">
                                    <Zap size={30} className="text-white drop-shadow-[0_4px_10px_rgba(255,255,255,0.2)]" />
                                </div>
                            </button>

                            <div className="w-full rounded-2xl border border-[#D6E0EA] bg-white/70 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                                    <span>长按进度</span>
                                    <span>{Math.round(holdProgress * 100)}%</span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#DCE6F1]">
                                    <div
                                        className="h-full rounded-full bg-[linear-gradient(90deg,#22C55E,#86EFAC)] transition-[width] duration-75"
                                        style={{ width: `${holdProgress * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex shrink-0 justify-end px-6 pb-5 pt-2">
                            <div className="min-w-[108px] rounded-full border border-slate-300/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(233,239,247,0.96)_100%)] px-6 py-2.5 text-center text-[11px] font-black uppercase tracking-[0.22em] text-slate-400 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.3),inset_0_1px_0_rgba(255,255,255,0.95)]">
                                {statusText}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* High-Fidelity Patient Confirmation Modal */}
            <PatientConfirmationModal
                isOpen={showPatientConfirm}
                onClose={() => setShowPatientConfirm(false)}
                onConfirm={() => {
                    setShowPatientConfirm(false);
                    setShowPhysicalButton(true);
                    setScanStage("idle");
                    setHoldProgress(0);
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
    const isGatingWorkflow = false;

    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });
    const [helicalParamId, setHelicalParamId] = useState<number | null>(null);
    const updateTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (isGatingWorkflow) return;
        let cancelled = false;

        const loadSessionDefaults = async () => {
            try {
                const scanSession = await fetchSelectedScanSession();
                const helicalParam = scanSession?.series.find((series) => series.series_type === "helical")?.helical_param;
                if (!helicalParam || cancelled) return;

                setHelicalParamId(helicalParam.id);
                setMeasurements({
                    scanLength: String(helicalParam.scan_length),
                    scoutFov: String(helicalParam.fov),
                });
            } catch (error) {
                console.error("Failed to load helical scan session defaults.", error);
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

        if (updateTimerRef.current !== null) window.clearTimeout(updateTimerRef.current);

        updateTimerRef.current = window.setTimeout(() => {
            void updateSelectedScanSessionHelicalParam(helicalParamId, {
                scan_length: Number(scanLength.toFixed(1)),
                fov: Number(scoutFov.toFixed(1)),
            }).catch((error) => {
                console.error("Failed to persist helical crop measurements.", error);
            });
        }, 180);

        return () => { if (updateTimerRef.current !== null) window.clearTimeout(updateTimerRef.current); };
    }, [isGatingWorkflow, helicalParamId, measurements.scanLength, measurements.scoutFov]);

    useEffect(() => {
        const preventBackNavigation = () => {
            window.history.pushState(null, "", window.location.href);
        };
        preventBackNavigation();
        window.addEventListener("popstate", preventBackNavigation);
        return () => { window.removeEventListener("popstate", preventBackNavigation); };
    }, []);

    // 4D gets a completely different layout
    if (isGatingWorkflow) {
        return <GatingHelicalConfirmScreen />;
    }

    // Regular helical scan — unchanged
    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="helicalScan"
            helicalParamOverrides={measurements}
            rightViewportContent={<TomographicScoutViewport onMeasurementChange={setMeasurements} initialMeasurements={measurements} />}
            nextRoute="/helical-execute"
            allowBackNavigation={false}
        />
    );
};

export default HelicalScanConfirmScreen;
