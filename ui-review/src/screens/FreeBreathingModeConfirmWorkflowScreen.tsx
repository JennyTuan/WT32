import { useState, useEffect, useRef } from "react";
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
    ArrowUpDown,
    AlertTriangle,
    Check,
    CheckCircle,
    Flame,
    Info,
    Network,
    Siren
} from "lucide-react";

interface Sequence {
    id: string;
    name: string;
    steps?: string[];
}

interface ProtocolGroup {
    id: string;
    name: string;
    sequences: Sequence[];
}

const BREATHING_SCOUT_SERIES = {
    basePath: "/dicom/QIN LUNG CT/QIN-LUNG-01-0007/01-12-2000-1-CT Thorax wContrast-47252/2.000000-THORAX W  3.0 B41 Soft Tissue-52055",
    count: 118,
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

const BreathingHelicalParamCard = ({ label, value }: { label: string; value: string }) => (
    <div className="px-1.5 py-1 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">{label}</span>
        <span className="mt-px text-[12px] font-black text-[#37474F]">{value}</span>
    </div>
);

function BreathingScoutViewport() {
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
                    正在载入真实 DICOM 影像...
                </div>
            )}

            {loadState === "error" && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium tracking-[0.08em] text-[#D1D9E1]">
                    真实影像加载失败
                </div>
            )}

            {meta && (
                <>
                    <div className="pointer-events-none absolute left-3 top-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div className="font-bold">Scout Projection</div>
                        <div>{meta.width} x {meta.height}</div>
                    </div>
                    <div className="pointer-events-none absolute right-3 top-3 text-right text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div className="font-bold">QIN LUNG CT</div>
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
                        

                        <div className="absolute -top-3 left-1/2 h-6 w-12 -translate-x-1/2 cursor-ns-resize" onMouseDown={startCropDrag("top")} />
                        <div className="absolute -bottom-3 left-1/2 h-6 w-12 -translate-x-1/2 cursor-ns-resize" onMouseDown={startCropDrag("bottom")} />
                        <div className="absolute left-0 top-1/2 h-12 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize" onMouseDown={startCropDrag("left")} />
                        <div className="absolute right-0 top-1/2 h-12 w-6 translate-x-1/2 -translate-y-1/2 cursor-ew-resize" onMouseDown={startCropDrag("right")} />
                    </div>
                </>
            )}

            {false && loadState === "ready" && (
                <div className="absolute bottom-3 right-3 w-[220px] rounded-md border border-white/10 bg-black/45 px-3 py-2 text-[#DCE5ED] backdrop-blur-sm">
                    <div className="mb-2 flex items-center justify-between text-[10px] font-bold tracking-[0.08em]">
                        <span>窗宽 / 窗位</span>
                        <button
                            type="button"
                            onClick={() => {
                                setWindowWidth(metaRef.current?.ww ?? BREATHING_SCOUT_SERIES.fallbackWindowWidth);
                                setWindowLevel(metaRef.current?.wl ?? BREATHING_SCOUT_SERIES.fallbackWindowLevel);
                            }}
                            className="rounded border border-white/15 px-2 py-0.5 text-[9px] text-white/80 hover:bg-white/10"
                        >
                            重置
                        </button>
                    </div>
                    <div className="space-y-2">
                        <label className="block">
                            <div className="mb-1 flex items-center justify-between text-[10px]">
                                <span>WW</span>
                                <span>{Math.round(windowWidth)}</span>
                            </div>
                            <input
                                type="range"
                                min="200"
                                max="1800"
                                step="10"
                                value={windowWidth}
                                onChange={(event) => setWindowWidth(Number(event.target.value))}
                                className="w-full accent-[#7EAAFF]"
                            />
                        </label>
                        <label className="block">
                            <div className="mb-1 flex items-center justify-between text-[10px]">
                                <span>WL</span>
                                <span>{Math.round(windowLevel)}</span>
                            </div>
                            <input
                                type="range"
                                min="-250"
                                max="250"
                                step="5"
                                value={windowLevel}
                                onChange={(event) => setWindowLevel(Number(event.target.value))}
                                className="w-full accent-[#66BB6A]"
                            />
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}

function BreathingScanPreviewViewport() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const imageRef = useRef<Float32Array | null>(null);
    const sizeRef = useRef<{ width: number; height: number } | null>(null);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [windowWidth, setWindowWidth] = useState(380);
    const [windowLevel, setWindowLevel] = useState(50);
    const [meta, setMeta] = useState<{ kvp: string; mas: string; thickness: string } | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadPreviewSlice = async () => {
            try {
                const previewSliceNumber = 60;
                const fileName = `1-${String(previewSliceNumber).padStart(3, "0")}.dcm`;
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

                if (cancelled) return;
                imageRef.current = hu;
                sizeRef.current = { width: cols, height: rows };
                setWindowWidth(Number(dataSet.string("x00281051") ?? "380"));
                setWindowLevel(Number(dataSet.string("x00281050") ?? "50"));
                setMeta({
                    kvp: dataSet.string("x00180060") ?? "120",
                    mas: dataSet.string("x00181152") ?? "Auto",
                    thickness: dataSet.string("x00180050") ?? "3.0 mm",
                });
                setLoadState("ready");
            } catch (error) {
                console.error("Failed to load breathing scan preview slice.", error);
                if (!cancelled) setLoadState("error");
            }
        };

        void loadPreviewSlice();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const viewport = viewportRef.current;
        const image = imageRef.current;
        const size = sizeRef.current;
        if (!canvas || !viewport || !image || !size) return;

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

        for (let i = 0; i < image.length; i += 1) {
            const j = i * 4;
            const normalized = clamp01((image[i] - minVal) / range);
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
        const drawScale = fitScale * 0.94;
        const drawW = size.width * drawScale;
        const drawH = size.height * drawScale;
        const x = (viewW - drawW) / 2;
        const y = (viewH - drawH) / 2;

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.filter = "contrast(1.1) brightness(0.96)";
        ctx.drawImage(offscreen, x, y, drawW, drawH);
        ctx.restore();
    }, [loadState, windowLevel, windowWidth]);

    return (
        <div ref={viewportRef} className="absolute inset-0 overflow-hidden bg-black">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />

            {loadState === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium tracking-[0.12em] text-[#9FB2C5]">
                    正在载入真实 DICOM 预览...
                </div>
            )}

            {loadState === "error" && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium tracking-[0.08em] text-[#FFB4B4]">
                    DICOM 预览载入失败
                </div>
            )}

            <div className="pointer-events-none absolute left-3 top-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                <div className="font-bold">Scan Preview</div>
                <div>Real DICOM Case</div>
            </div>
            <div className="pointer-events-none absolute right-3 top-3 text-right text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                <div className="font-bold">{loadState === "ready" ? "Ready" : "Loading"}</div>
                <div>{meta ? `KV ${meta.kvp} | mAs ${meta.mas}` : "Case preview"}</div>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                <div>Thorax Soft Tissue</div>
                <div>{meta ? `Slice ${meta.thickness}` : "Single slice preview"}</div>
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

const FreeBreathingModeConfirmWorkflowScreen = ({
    firstStepLabel = "激光灯定位",
    bottomPanelMode = "positioning",
    viewportBgClassName = "bg-[#1A222B]",
    breathingWorkflowVariant = "training",
}: ScoutScanScreenProps) => {
    const isBreathingTraining = bottomPanelMode === "breathing" && breathingWorkflowVariant === "training";
    const isBreathingAcquisition = bottomPanelMode === "breathing" && breathingWorkflowVariant === "acquisition";
    const [startPos, setStartPos] = useState("472.95");
    const [endPos, setEndPos] = useState("595.17");
    const isBreathingSignalEnabled = true;
    const [breathingPhase, setBreathingPhase] = useState<"training" | "stable">("training");
    const [trainingTimer, setTrainingTimer] = useState(30);

    useEffect(() => {
        if (bottomPanelMode !== 'breathing' || breathingPhase !== 'training' || trainingTimer <= 0) return;

        const interval = setInterval(() => {
            setTrainingTimer(prev => {
                const next = prev - 1;
                if (next === 0) {
                    // Defer state update to avoid cascading render lint error
                    setTimeout(() => setBreathingPhase('stable'), 0);
                }
                return next;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [bottomPanelMode, breathingPhase, trainingTimer]);

    const handleSwap = () => {
        setStartPos(endPos);
        setEndPos(startPos);
    };

    // Waveform simulation state (increased buffer for longer period)
    const [rawWaveData, setRawWaveData] = useState<number[]>(new Array(500).fill(100));
    const [filteredWaveData, setFilteredWaveData] = useState<number[]>(new Array(500).fill(100));
    const [metrics, setMetrics] = useState({ bpm: "14.8", peakErr: "1.7", freqErr: "1.9" });
    const timerRef = useRef<number | null>(null);
    const tRef = useRef(0); // Persistent time counter to prevent resets on re-render
    const latestSignalValue = filteredWaveData[filteredWaveData.length - 1] ?? 0;
    const normalizedSignal = clamp01(latestSignalValue / 1100);
    const breathingBedIndex = Math.min(
        BREATHING_BED_POSITION_COUNT - 1,
        Math.max(0, Math.floor(normalizedSignal * BREATHING_BED_POSITION_COUNT))
    );

    useEffect(() => {
        if (bottomPanelMode !== 'breathing' || !isBreathingSignalEnabled) return;

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

            if (Math.random() > 0.98) {
                setFilteredWaveData(currentData => {
                    let peaks = 0;
                    for (let i = 4; i < currentData.length - 4; i++) {
                        if (currentData[i] > currentData[i - 1] && currentData[i] > currentData[i + 1] &&
                            currentData[i] > currentData[i - 2] && currentData[i] > currentData[i + 2] &&
                            currentData[i] > 650) {
                            peaks++;
                        }
                    }
                    const baseBpm = (peaks / 500) * 1200;
                    const bpm = Math.max(14.2, Math.min(15.8, baseBpm + (Math.random() - 0.5) * 0.2));
                    setMetrics((current) => ({
                        ...current,
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
        return () => {
            if (timerRef.current !== null) cancelAnimationFrame(timerRef.current);
        };
    }, [bottomPanelMode, isBreathingSignalEnabled]); // Removed wave states from dependencies to stop re-running/resetting

    useEffect(() => {
        if (bottomPanelMode !== "breathing") return;

        setRawWaveData(new Array(500).fill(100));
        setFilteredWaveData(new Array(500).fill(100));
        setMetrics({ bpm: "14.8", peakErr: "1.7", freqErr: "1.9" });
        tRef.current = 0;
    }, [bottomPanelMode]);

    // Initial data
    // Initial data
    const [groups, setGroups] = useState<ProtocolGroup[]>([
        {
            id: "g1",
            name: "Head_FacialBoneVolume",
            sequences: isBreathingAcquisition
                ? [
                    { id: "s1", name: "Scout", steps: [firstStepLabel, "激光灯定位", "参数确认", "执行扫描"] },
                    { id: "s2", name: "Helical Scan", steps: ["呼吸训练", "参数确认", "执行扫描"] }
                ]
                : [
                    { id: "s1", name: "Scout", steps: [firstStepLabel, "参数确认", "执行扫描"] },
                    { id: "s2", name: "Helical Scan", steps: ["呼吸训练", "参数确认", "执行扫描"] }
                ]
        }
    ]);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAbortConfirm, setShowAbortConfirm] = useState(false);
    const [selectedPosition, setSelectedPosition] = useState<"start" | "end" | null>(null);
    const [activeStepIdx, setActiveStepIdx] = useState(0); // Add state for active step tracking
    const [expandedSeqId, setExpandedSeqId] = useState<string | null>(
        bottomPanelMode === "breathing" ? "s2" : "s1"
    );

    useEffect(() => {
        if (bottomPanelMode !== "breathing") return;

        const timer = setTimeout(() => {
            setGroups([
                {
                    id: "g1",
                    name: "Head_FacialBoneVolume",
                    sequences: isBreathingAcquisition
                        ? [
                            { id: "s1", name: "Scout", steps: [firstStepLabel, "激光灯定位", "参数确认", "执行扫描"] },
                            { id: "s2", name: "Helical Scan", steps: ["呼吸训练", "参数确认", "执行扫描"] }
                        ]
                        : [
                            { id: "s1", name: "Scout", steps: [firstStepLabel, "参数确认", "执行扫描"] },
                            { id: "s2", name: "Helical Scan", steps: ["呼吸训练", "参数确认", "执行扫描"] },
                        ],
                },
            ]);
            setExpandedSeqId("s2");
            setActiveStepIdx(1);
        }, 0);

        return () => clearTimeout(timer);
    }, [bottomPanelMode, breathingWorkflowVariant, firstStepLabel, isBreathingAcquisition, isBreathingTraining]);

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

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative text-[#37474F] font-sans select-none">

            {/* 1. Header (System Info) - Refined Parity */}
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
                        <div className="text-[9px] font-bold italic">♂ 0</div>
                        <div className="text-[9px] font-bold">♀ 0</div>
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
                    <div className={`overflow-y-auto p-2 flex flex-col gap-0 transition-all duration-300 ${isTreeCollapsed ? 'h-[48px] opacity-40 grayscale overflow-hidden' : 'h-[240px]'}`}>
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
                                                const isActiveSequence = bottomPanelMode === 'breathing'
                                                    ? seq.name === 'Scout'
                                                    : seq.name === 'Scout';
                                                const isExpanded = expandedSeqId === seq.id;
                                                const isBreathingHelicalSequence = bottomPanelMode === 'breathing' && seq.name === 'Helical Scan';
                                                const resolvedActiveSequence = bottomPanelMode === 'breathing'
                                                    ? isBreathingHelicalSequence
                                                    : seq.name === 'Scout';
                                                const isCompletedSequence = bottomPanelMode === 'breathing'
                                                    && seq.name === 'Scout';
                                                const isUnifiedActiveSequence = bottomPanelMode === 'breathing' ? resolvedActiveSequence : seq.name === 'Scout' || isActiveSequence;
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

                                                        {/* Workflow Steps - Prominent icons & connecting line */}
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
                                呼吸训练
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
                                    <Info size={14} /> 参数详情
                                </button>
                            </div>
                        </div>
                    ) : bottomPanelMode === "breathing" ? (
                        <div className="border-t border-[#EEF2F9] bg-[#F8FAFC] px-3 pt-3 pb-2 flex-1 flex flex-col gap-2 overflow-hidden">
                           
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
                                    <Info size={14} /> 参数详情
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={`mt-auto border-t border-[#EEF2F9] bg-[#F8FAFC] px-4 py-3 shrink-0 transition-all duration-300 ${isTreeCollapsed ? 'flex-1 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]' : 'h-[168px]'}`}>
                            <div className="mb-3 text-[12px] font-bold text-[#546E7A]">请打开激光灯获取定位</div>
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
                                        title="交换起始/结束位置"
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
                                        <span className={`text-[12px] font-bold w-[60px] shrink-0 transition-colors ${selectedPosition === 'start' ? 'text-[#4D94FF]' : 'text-[#90A4AE]'}`}>起始位置 :</span>
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
                                        <span className={`text-[12px] font-bold w-[60px] shrink-0 transition-colors ${selectedPosition === 'end' ? 'text-[#66BB6A]' : 'text-[#90A4AE]'}`}>结束位置 :</span>
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
                <section className={`flex-1 ${bottomPanelMode === 'breathing' ? 'bg-transparent border-0 shadow-none' : `${viewportBgClassName} rounded-lg border border-[#B0C4DE] shadow-sm`} flex flex-col overflow-hidden relative`}>
                    {isBreathingTraining ? (
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

                            <div className="h-[160px] shrink-0 rounded-md border border-[#B0C4DE]/50 bg-[linear-gradient(180deg,#FFFFFF_0%,#F6FAFE_100%)] shadow-inner px-1 pt-2 pb-0 relative overflow-hidden">
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
                                            d={`M ${rawWaveData.map((val, i) => `${(i / (rawWaveData.length - 1)) * 800},${160 - (val / 1100) * 160}`).join(' L ')}`}
                                            fill="none"
                                            stroke="#8FA3B8"
                                            strokeWidth="1.4"
                                            className="opacity-55"
                                        />
                                        <path
                                            d={`M 0,160 L ${filteredWaveData.map((val, i) => `${(i / (filteredWaveData.length - 1)) * 800},${160 - (val / 1100) * 160}`).join(' L ')} L 800,160 Z`}
                                            fill="url(#breathing-wave-fill)"
                                        />
                                        <path
                                            d={`M ${filteredWaveData.map((val, i) => `${(i / (filteredWaveData.length - 1)) * 800},${160 - (val / 1100) * 160}`).join(' L ')}`}
                                            fill="none"
                                            stroke="#2F80FF"
                                            strokeWidth="2.8"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            style={{ filter: "drop-shadow(0 0 4px rgba(77,148,255,0.28))" }}
                                        />
                                        {filteredWaveData.map((val, i) => {
                                            if (i < 10 || i > filteredWaveData.length - 10) return null;

                                            const isLocalMax = val > filteredWaveData[i - 1] && val > filteredWaveData[i + 1] &&
                                                val > filteredWaveData[i - 2] && val > filteredWaveData[i + 2] &&
                                                val > filteredWaveData[i - 3] && val > filteredWaveData[i + 3];
                                            const isLocalMin = val < filteredWaveData[i - 1] && val < filteredWaveData[i + 1] &&
                                                val < filteredWaveData[i - 2] && val < filteredWaveData[i + 2] &&
                                                val < filteredWaveData[i - 3] && val < filteredWaveData[i + 3];

                                            if (isLocalMax && val >= 650) {
                                                return (
                                                    <circle
                                                        key={`pk-${i}`}
                                                        cx={(i / (filteredWaveData.length - 1)) * 800}
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
                                                        cx={(i / (filteredWaveData.length - 1)) * 800}
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
                                    <div className="text-[10px] text-[#90A4AE]">{metrics.bpm} BPM</div>
                                    <div className="mt-1 text-[10px] font-bold text-[#546E7A]">频率误差</div>
                                    <div className="text-[10px] text-[#90A4AE]">{metrics.freqErr}%</div>
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
                            </div>
                        </div>
                    ) : bottomPanelMode === 'breathing' ? (
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
                                            <linearGradient id="free-breathing-wave-fill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#7EAAFF" stopOpacity="0.22" />
                                                <stop offset="100%" stopColor="#7EAAFF" stopOpacity="0.02" />
                                            </linearGradient>
                                        </defs>
                                        <line x1="0" y1="80" x2="800" y2="80" stroke="#7FA1C5" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.55" />
                                        <path
                                            d={`M ${rawWaveData.map((val, i) => `${(i / (rawWaveData.length - 1)) * 800},${160 - (val / 1100) * 160}`).join(' L ')}`}
                                            fill="none"
                                            stroke="#8FA3B8"
                                            strokeWidth="1.4"
                                            className="opacity-55"
                                        />
                                        <path
                                            d={`M 0,160 L ${filteredWaveData.map((val, i) => `${(i / (filteredWaveData.length - 1)) * 800},${160 - (val / 1100) * 160}`).join(' L ')} L 800,160 Z`}
                                            fill="url(#free-breathing-wave-fill)"
                                        />
                                        <path
                                            d={`M ${filteredWaveData.map((val, i) => `${(i / (filteredWaveData.length - 1)) * 800},${160 - (val / 1100) * 160}`).join(' L ')}`}
                                            fill="none"
                                            stroke="#2F80FF"
                                            strokeWidth="2.8"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            style={{ filter: "drop-shadow(0 0 4px rgba(77,148,255,0.28))" }}
                                        />
                                        {filteredWaveData.map((val, i) => {
                                            if (i < 10 || i > filteredWaveData.length - 10) return null;

                                            const isLocalMax = val > filteredWaveData[i - 1] && val > filteredWaveData[i + 1] &&
                                                val > filteredWaveData[i - 2] && val > filteredWaveData[i + 2] &&
                                                val > filteredWaveData[i - 3] && val > filteredWaveData[i + 3];
                                            const isLocalMin = val < filteredWaveData[i - 1] && val < filteredWaveData[i + 1] &&
                                                val < filteredWaveData[i - 2] && val < filteredWaveData[i + 2] &&
                                                val < filteredWaveData[i - 3] && val < filteredWaveData[i + 3];

                                            if (isLocalMax && val >= 650) {
                                                return (
                                                    <circle
                                                        key={`pk-${i}`}
                                                        cx={(i / (filteredWaveData.length - 1)) * 800}
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
                                                        cx={(i / (filteredWaveData.length - 1)) * 800}
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
                                    <div className="text-[10px] text-[#90A4AE]">{metrics.bpm} BPM</div>
                                    <div className="mt-1 text-[10px] font-bold text-[#546E7A]">频率误差</div>
                                    <div className="text-[10px] text-[#90A4AE]">{metrics.freqErr}%</div>
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
                                                        index < 3
                                                            ? "border-[#5A9CFF] bg-gradient-to-b from-[#9DC4FF] to-[#5A9CFF]"
                                                            : "border-[#9DB7D3] bg-gradient-to-b from-[#EAF2FB] to-[#D7E6F7]"
                                                    }`}
                                                />
                                                <span className={`text-[8px] leading-none font-mono ${index < 3 ? "text-[#2F80FF]" : "text-[#7A8DA1]"}`}>{index + 1}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="px-1 py-0.5 text-[9px] font-mono text-[#5F7892]">
                                        已扫描: 3/{BREATHING_BED_POSITION_COUNT}
                                    </div>
                                </div>
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
                    <button className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-solid shadow-sm transition-all uppercase text-[13px] active:scale-95">
                        <ChevronLeft size={20} /> 上一步
                    </button>
                </div>

                {bottomPanelMode === 'breathing' ? (
                    <div className="flex-1 flex justify-center items-center gap-2">
                        {/* Deleted Steady Breathing indicator from here */}
                    </div>
                ) : (
                    <div className="flex-1 flex justify-center">
                        <button
                            onClick={() => setShowAbortConfirm(true)}
                            className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#F57C00] font-bold rounded-md border-2 border-[#F57C00] hover:bg-orange-50 transition-all uppercase text-[13px] shadow-sm active:scale-95">
                            <AlertTriangle size={20} /> 中止检查
                        </button>
                    </div>
                )}

                <div className="flex-1 flex justify-end">
                    <button
                        disabled={bottomPanelMode === 'breathing' && breathingPhase !== 'stable'}
                        className={`flex items-center gap-2 px-10 h-[52px] font-bold rounded-md shadow-lg transition-all uppercase text-[13px] active:scale-95 ${(bottomPanelMode === 'breathing' && breathingPhase !== 'stable')
                            ? 'bg-gray-300 text-white cursor-not-allowed shadow-none active:scale-100'
                            : (bottomPanelMode === 'breathing' ? 'bg-[#7EAAFF] text-white hover:bg-[#6FA0FF]' : 'bg-[#4D94FF] text-white hover:bg-blue-600')
                            }`}
                    >
                        {bottomPanelMode === 'breathing' ? '下一步' : '下一步'} <ChevronRight size={20} />
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
                                <div className="text-[14px] font-black text-[#37474F]">确认删除</div>
                                <div className="text-[11px] text-[#78909C] mt-0.5">已选择 {selectedIds.length} 项，此操作不可恢复</div>
                            </div>
                        </div>
                        <div className="flex gap-2 px-5 py-4">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 h-[40px] bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg text-[13px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="flex-1 h-[40px] bg-[#D32F2F] text-white font-bold rounded-lg text-[13px] hover:bg-red-700 shadow-md transition-all active:scale-95"
                            >
                                确认删除
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
                                <div className="text-[15px] font-black text-[#37474F]">中止检查</div>
                                <div className="text-[12px] text-[#78909C] mt-0.5">确认中止当前检查流程？</div>
                            </div>
                        </div>
                        <div className="px-5 py-3">
                            <p className="text-[13px] text-[#546E7A] leading-relaxed">
                                中止后，<span className="font-bold text-[#37474F]">当前扫描参数将清空</span>，需要重新进入流程。
                            </p>
                        </div>
                        <div className="flex gap-2 px-5 pb-5">
                            <button
                                onClick={() => setShowAbortConfirm(false)}
                                className="flex-1 h-[40px] bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg text-[13px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                继续检查
                            </button>
                            <button
                                onClick={() => setShowAbortConfirm(false)}
                                className="flex-1 h-[40px] bg-[#F57C00] text-white font-bold rounded-lg text-[13px] hover:bg-orange-600 shadow-md transition-all active:scale-95"
                            >
                                确认中止
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FreeBreathingModeConfirmWorkflowScreen;
