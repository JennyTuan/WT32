import { useEffect, useMemo, useRef, useState } from "react";
import * as dicomParser from "dicom-parser";
import { Hand, Move, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import ScanConfirmScreen from "./ScanConfirmScreen";

const SCOUT_SERIES = {
    basePath: "/dicom/QIN LUNG CT/QIN-LUNG-01-0007/01-12-2000-1-CT Thorax wContrast-47252/2.000000-THORAX W  3.0 B41 Soft Tissue-52055",
    count: 118,
    fallbackWindowWidth: 350,
    fallbackWindowLevel: 45,
};

type LoadedSlice = {
    instanceNumber: number;
    positionZ: number;
    rows: number;
    cols: number;
    pixelSpacingX: number;
    sliceThickness: number;
    hu: Float32Array;
    ww: number;
    wl: number;
};

type ProjectionMeta = {
    width: number;
    height: number;
    pixelSpacingX: number;
    sliceThickness: number;
};

type CropBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type DragHandle = "move" | "top" | "bottom" | "left" | "right";

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
    return clamp(value, 0, 1);
}

export function TomographicScoutViewport({
    onMeasurementChange,
}: {
    onMeasurementChange: (values: { scanLength: string; scoutFov: string }) => void;
}) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const projectionRef = useRef<Uint8ClampedArray | null>(null);
    const metaRef = useRef<ProjectionMeta | null>(null);
    const dragStateRef = useRef<{
        handle: DragHandle;
        startX: number;
        startY: number;
        initialBox: CropBox;
    } | null>(null);
    const panStateRef = useRef<{
        startX: number;
        startY: number;
        initialOffsetX: number;
        initialOffsetY: number;
    } | null>(null);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [cropBox, setCropBox] = useState<CropBox>({
        x: 0.18,
        y: 0.2,
        width: 0.54,
        height: 0.46,
    });
    const [toolMode, setToolMode] = useState<"crop" | "pan">("crop");
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });

    useEffect(() => {
        let cancelled = false;

        const loadProjection = async () => {
            try {
                const sliceNumbers = Array.from({ length: SCOUT_SERIES.count }, (_, index) => index + 1);
                const slices: LoadedSlice[] = [];
                const concurrency = 8;

                for (let start = 0; start < sliceNumbers.length; start += concurrency) {
                    const batch = sliceNumbers.slice(start, start + concurrency);
                    const loadedBatch = await Promise.all(
                        batch.map(async (sliceNumber) => {
                            const fileName = `1-${String(sliceNumber).padStart(3, "0")}.dcm`;
                            const response = await fetch(`${SCOUT_SERIES.basePath}/${fileName}`);
                            if (!response.ok) throw new Error(`Failed to fetch ${fileName}`);

                            const byteArray = new Uint8Array(await response.arrayBuffer());
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
                            if (!pixelDataElement || rows === 0 || cols === 0) throw new Error(`Missing pixel data for ${fileName}`);

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
                                pixelSpacingX: pixelSpacing[1] || 1,
                                sliceThickness: Number.isFinite(sliceThickness) && sliceThickness > 0 ? sliceThickness : 1,
                                hu,
                                ww: Number(dataSet.string("x00281051") ?? `${SCOUT_SERIES.fallbackWindowWidth}`),
                                wl: Number(dataSet.string("x00281050") ?? `${SCOUT_SERIES.fallbackWindowLevel}`),
                            };
                        })
                    );
                    slices.push(...loadedBatch);
                }

                slices.sort((a, b) => b.positionZ - a.positionZ || a.instanceNumber - b.instanceNumber);
                if (!slices.length) throw new Error("No scout slices loaded");

                const rows = slices[0].rows;
                const cols = slices[0].cols;
                const bandHalfHeight = Math.max(10, Math.floor(rows * 0.08));
                const centerY = Math.floor(rows / 2);
                const sampleStart = Math.max(0, centerY - bandHalfHeight);
                const sampleEnd = Math.min(rows, centerY + bandHalfHeight);
                const ww = Number.isFinite(slices[0].ww) && slices[0].ww > 1 ? slices[0].ww : SCOUT_SERIES.fallbackWindowWidth;
                const wl = Number.isFinite(slices[0].wl) ? slices[0].wl : SCOUT_SERIES.fallbackWindowLevel;
                const minVal = wl - ww / 2;
                const maxVal = wl + ww / 2;
                const range = Math.max(maxVal - minVal, 1);
                const output = new Uint8ClampedArray(cols * slices.length);

                slices.forEach((slice, sliceIndex) => {
                    for (let x = 0; x < cols; x += 1) {
                        let accum = 0;
                        let samples = 0;
                        for (let y = sampleStart; y < sampleEnd; y += 1) {
                            accum += slice.hu[y * cols + x];
                            samples += 1;
                        }
                        const meanHu = accum / Math.max(samples, 1);
                        const normalized = clamp01((meanHu - minVal) / range);
                        const gray = Math.round(normalized * 255);
                        output[sliceIndex * cols + x] = 255 - gray;
                    }
                });

                if (cancelled) return;
                projectionRef.current = output;
                metaRef.current = {
                    width: cols,
                    height: slices.length,
                    pixelSpacingX: slices[0].pixelSpacingX,
                    sliceThickness: slices[0].sliceThickness,
                };
                setLoadState("ready");
            } catch (error) {
                console.error(error);
                if (!cancelled) setLoadState("error");
            }
        };

        void loadProjection();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const viewport = viewportRef.current;
        const canvas = canvasRef.current;
        const pixels = projectionRef.current;
        const meta = metaRef.current;
        if (!viewport || !canvas || !pixels || !meta) return;

        const viewW = Math.max(1, Math.floor(viewport.clientWidth));
        const viewH = Math.max(1, Math.floor(viewport.clientHeight));
        if (canvas.width !== viewW || canvas.height !== viewH) {
            canvas.width = viewW;
            canvas.height = viewH;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const offscreen = document.createElement("canvas");
        offscreen.width = meta.width;
        offscreen.height = meta.height;
        const offCtx = offscreen.getContext("2d");
        if (!offCtx) return;

        const imageData = offCtx.createImageData(meta.width, meta.height);
        const out = imageData.data;
        for (let i = 0; i < pixels.length; i += 1) {
            const j = i * 4;
            out[j] = pixels[i];
            out[j + 1] = pixels[i];
            out[j + 2] = pixels[i];
            out[j + 3] = 255;
        }
        offCtx.putImageData(imageData, 0, 0);

        ctx.fillStyle = "#05080d";
        ctx.fillRect(0, 0, viewW, viewH);

        const fitScale = Math.min(viewW / meta.width, viewH / meta.height) * 0.92;
        const drawW = meta.width * fitScale * zoom;
        const drawH = meta.height * fitScale * zoom;
        const drawX = (viewW - drawW) / 2 + offset.x;
        const drawY = (viewH - drawH) / 2 + offset.y;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(offscreen, drawX, drawY, drawW, drawH);
    }, [loadState, offset.x, offset.y, zoom]);

    useEffect(() => {
        const meta = metaRef.current;
        if (!meta) return;
        const scanLengthMm = cropBox.height * meta.height * meta.sliceThickness;
        const fovMm = cropBox.width * meta.width * meta.pixelSpacingX;
        onMeasurementChange({
            scanLength: scanLengthMm.toFixed(1),
            scoutFov: fovMm.toFixed(1),
        });
    }, [cropBox, onMeasurementChange]);

    useEffect(() => {
        const handleMove = (event: MouseEvent) => {
            const viewport = viewportRef.current;
            if (!viewport) return;

            const panState = panStateRef.current;
            if (panState) {
                setOffset({
                    x: panState.initialOffsetX + (event.clientX - panState.startX),
                    y: panState.initialOffsetY + (event.clientY - panState.startY),
                });
                return;
            }

            const dragState = dragStateRef.current;
            if (!dragState) return;

            const rect = viewport.getBoundingClientRect();
            const dx = (event.clientX - dragState.startX) / rect.width;
            const dy = (event.clientY - dragState.startY) / rect.height;
            const minSize = 0.08;
            const next = { ...dragState.initialBox };

            switch (dragState.handle) {
                case "move":
                    next.x = clamp(dragState.initialBox.x + dx, 0, 1 - dragState.initialBox.width);
                    next.y = clamp(dragState.initialBox.y + dy, 0, 1 - dragState.initialBox.height);
                    break;
                case "top": {
                    const nextY = clamp(dragState.initialBox.y + dy, 0, dragState.initialBox.y + dragState.initialBox.height - minSize);
                    next.height = dragState.initialBox.height + (dragState.initialBox.y - nextY);
                    next.y = nextY;
                    break;
                }
                case "bottom":
                    next.height = clamp(dragState.initialBox.height + dy, minSize, 1 - dragState.initialBox.y);
                    break;
                case "left": {
                    const nextX = clamp(dragState.initialBox.x + dx, 0, dragState.initialBox.x + dragState.initialBox.width - minSize);
                    next.width = dragState.initialBox.width + (dragState.initialBox.x - nextX);
                    next.x = nextX;
                    break;
                }
                case "right":
                    next.width = clamp(dragState.initialBox.width + dx, minSize, 1 - dragState.initialBox.x);
                    break;
            }

            setCropBox(next);
        };

        const handleUp = () => {
            dragStateRef.current = null;
            panStateRef.current = null;
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, []);

    const measurementLabels = useMemo(() => {
        const meta = metaRef.current;
        if (!meta) return { scanLength: "--", scoutFov: "--" };
        return {
            scanLength: (cropBox.height * meta.height * meta.sliceThickness).toFixed(1),
            scoutFov: (cropBox.width * meta.width * meta.pixelSpacingX).toFixed(1),
        };
    }, [cropBox]);

    const startPan = (event: React.MouseEvent<HTMLDivElement>) => {
        if (toolMode !== "pan") return;
        event.preventDefault();
        panStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            initialOffsetX: offset.x,
            initialOffsetY: offset.y,
        };
    };

    const adjustZoom = (delta: number) => {
        setZoom((currentZoom) => clamp(Number((currentZoom + delta).toFixed(2)), 1, 3));
    };

    const resetView = () => {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setToolMode("crop");
    };

    const startDrag = (handle: DragHandle) => (event: React.MouseEvent<HTMLDivElement>) => {
        if (toolMode === "pan") return;
        event.preventDefault();
        event.stopPropagation();
        dragStateRef.current = {
            handle,
            startX: event.clientX,
            startY: event.clientY,
            initialBox: cropBox,
        };
    };

    return (
        <div className="flex-1 flex min-w-0 bg-[#05080d]">
            <section
                ref={viewportRef}
                className={`relative flex-1 min-w-0 rounded-l-lg bg-black overflow-hidden ${
                    toolMode === "pan" ? "cursor-grab" : "cursor-default"
                }`}
                onMouseDown={startPan}
            >
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

                {loadState === "loading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#05080d]/80 text-[14px] font-bold text-white/70">
                        正在载入定位像...
                    </div>
                )}

                {loadState === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#05080d]/80 text-[14px] font-bold text-[#FCA5A5]">
                        定位像加载失败
                    </div>
                )}

                {loadState === "ready" && (
                    <>
                        <div
                            className={`absolute border-2 border-[#4D94FF] bg-[#4D94FF]/8 shadow-[0_0_0_1px_rgba(77,148,255,0.2),0_0_24px_rgba(77,148,255,0.15)] ${
                                toolMode === "pan" ? "cursor-default opacity-80" : "cursor-move"
                            }`}
                            style={{
                                left: `${cropBox.x * 100}%`,
                                top: `${cropBox.y * 100}%`,
                                width: `${cropBox.width * 100}%`,
                                height: `${cropBox.height * 100}%`,
                            }}
                            onMouseDown={startDrag("move")}
                        >
                            <div className="absolute inset-0 border border-white/20">
                                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/20" />
                                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/20" />
                            </div>

                            <div className={`absolute -top-3 left-1/2 h-6 w-12 -translate-x-1/2 ${toolMode === "pan" ? "cursor-default" : "cursor-ns-resize"}`} onMouseDown={startDrag("top")} />
                            <div className={`absolute -bottom-3 left-1/2 h-6 w-12 -translate-x-1/2 ${toolMode === "pan" ? "cursor-default" : "cursor-ns-resize"}`} onMouseDown={startDrag("bottom")} />
                            <div className={`absolute left-0 top-1/2 h-12 w-6 -translate-x-1/2 -translate-y-1/2 ${toolMode === "pan" ? "cursor-default" : "cursor-ew-resize"}`} onMouseDown={startDrag("left")} />
                            <div className={`absolute right-0 top-1/2 h-12 w-6 translate-x-1/2 -translate-y-1/2 ${toolMode === "pan" ? "cursor-default" : "cursor-ew-resize"}`} onMouseDown={startDrag("right")} />

                            <div className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full border border-[#93C5FD] bg-[#0F172A] text-[#93C5FD] shadow-lg">
                                <Move size={12} />
                            </div>
                        </div>

                        <div className="absolute bottom-2 left-2 text-[10px] text-[#CFD8DC] font-mono leading-[1.35] pointer-events-none">
                            <div>Scan Length {measurementLabels.scanLength} mm</div>
                            <div>FOV {measurementLabels.scoutFov} mm</div>
                            <div>Zoom {zoom.toFixed(2)}x</div>
                        </div>
                    </>
                )}
            </section>

            <aside className="flex w-[72px] shrink-0 flex-col overflow-hidden rounded-r-lg border-l border-white/10 bg-[#111827] shadow-sm">
                <div className="flex h-[44px] items-center justify-center border-b border-white/10 bg-[#0F172A]">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#CBD5E1]">Tools</span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2" onPointerDown={(event) => event.stopPropagation()}>
                    <button
                        type="button"
                        title="Pan"
                        onClick={() => setToolMode((current) => (current === "pan" ? "crop" : "pan"))}
                        className={`flex h-[44px] w-[44px] items-center justify-center rounded-[10px] border transition-all ${
                            toolMode === "pan"
                                ? "border-[#60A5FA] bg-[#1D4ED8]/30 text-[#BFDBFE]"
                                : "border-white/10 bg-white/[0.04] text-[#CBD5E1] hover:bg-white/[0.08]"
                        }`}
                    >
                        <Hand size={20} strokeWidth={1.5} />
                    </button>
                    <div className="mx-1 my-1 h-px bg-white/[0.07]" />
                    <button
                        type="button"
                        title="Zoom In"
                        onClick={() => adjustZoom(0.2)}
                        className="flex h-[44px] w-[44px] items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-[#CBD5E1] transition-all hover:bg-white/[0.08]"
                    >
                        <ZoomIn size={20} strokeWidth={1.5} />
                    </button>
                    <button
                        type="button"
                        title="Zoom Out"
                        onClick={() => adjustZoom(-0.2)}
                        className="flex h-[44px] w-[44px] items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-[#CBD5E1] transition-all hover:bg-white/[0.08]"
                    >
                        <ZoomOut size={20} strokeWidth={1.5} />
                    </button>
                    <button
                        type="button"
                        title="Reset"
                        onClick={resetView}
                        className="flex h-[44px] w-[44px] items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-[#CBD5E1] transition-all hover:bg-white/[0.08]"
                    >
                        <RotateCcw size={20} strokeWidth={1.5} />
                    </button>
                </div>
            </aside>
        </div>
    );
}

const SequenceScanConfirmScreen = () => {
    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });

    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="tomographicScan"
            tomographicParamOverrides={measurements}
            rightViewportContent={<TomographicScoutViewport onMeasurementChange={setMeasurements} />}
        />
    );
};

export default SequenceScanConfirmScreen;
