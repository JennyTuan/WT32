import { useEffect, useMemo, useRef, useState } from "react";
import * as dicomParser from "dicom-parser";
import { imageLoader, metaData } from "@cornerstonejs/core";
import { Hand, Move, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { fetchSelectedScanSession, updateSelectedScanSessionAxialParam } from "../lib/scanSession";
import type { ApiScanSessionAxialParam } from "../lib/scanSession";
import { DEFAULT_SCOUT_CROP_BOX, applyMeasurementsToCropBox, loadScoutPositioningRange, mapScoutRangeToCropBox } from "../lib/scoutPositioningSession";
import AutoMaPanel, { type NoiseLevel } from "../components/AutoMaPanel";
import ScanConfirmScreen from "./ScanConfirmScreen";
import { buildWadoImageId, initCornerstone } from "../lib/cornerstone/initCornerstone";

// Optional cornerstone-backed loading source. When provided, TomographicScoutViewport
// loads via cornerstone (so JPEG Lossless / other compressed transfer syntaxes work).
// When omitted, the legacy dicom-parser path is used unchanged.
//   - kind: "topogram" → render a real scanner-produced AP/LAT localizer image as-is
//   - kind: "axialStack" → synthesize a coronal-band projection from a stack of axial slices
export type TomographicScoutSeriesOverride =
    | {
          kind: "topogram";
          url: string;
          fallbackWindowWidth?: number;
          fallbackWindowLevel?: number;
      }
    | {
          kind: "axialStack";
          urls: string[];
          fallbackWindowWidth?: number;
          fallbackWindowLevel?: number;
      };

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

const SCOUT_LOAD_TIMEOUT_MS = 18000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        promise.then(
            (value) => {
                window.clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(timer);
                reject(error);
            },
        );
    });
}

function createFallbackScoutProjection(metrics?: { scanLength?: string; scoutFov?: string }): { output: Uint8ClampedArray; meta: ProjectionMeta } {
    const width = 320;
    const height = 620;
    const scanLength = Number(metrics?.scanLength);
    const scoutFov = Number(metrics?.scoutFov);
    const meta: ProjectionMeta = {
        width,
        height,
        pixelSpacingX: Number.isFinite(scoutFov) && scoutFov > 0 ? scoutFov / width : 250 / width,
        sliceThickness: Number.isFinite(scanLength) && scanLength > 0 ? scanLength / height : 305 / height,
    };
    const output = new Uint8ClampedArray(width * height);

    for (let y = 0; y < height; y += 1) {
        const yNorm = y / (height - 1);
        const neckTaper = Math.max(0.42, 1 - Math.max(0, yNorm - 0.62) * 1.3);
        const bodyHalfWidth = (0.2 + 0.22 * Math.sin(Math.PI * yNorm)) * width * neckTaper;
        const spineHalfWidth = 0.025 * width;
        const centerX = width * (0.5 + 0.015 * Math.sin(yNorm * Math.PI * 2));
        for (let x = 0; x < width; x += 1) {
            const dx = Math.abs(x - centerX);
            const body = dx < bodyHalfWidth ? 78 + Math.round(38 * (1 - dx / bodyHalfWidth)) : 8;
            const spine = dx < spineHalfWidth ? 148 : 0;
            const shoulder = yNorm > 0.45 && yNorm < 0.72 && dx < bodyHalfWidth * 1.15 ? 34 : 0;
            output[y * width + x] = Math.min(210, Math.max(body, spine) + shoulder);
        }
    }

    return { output, meta };
}

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

function getHandleCursor(toolMode: "crop" | "pan", handle: DragHandle) {
    if (toolMode === "pan") return "default";
    if (handle === "top" || handle === "bottom") return "ns-resize";
    if (handle === "left" || handle === "right") return "ew-resize";
    return "move";
}

export function TomographicScoutViewport({
    onMeasurementChange,
    initialMeasurements,
    scanPositionRatio = 0.5,
    onScanPositionRatioChange,
    hideTools = false,
    seriesOverride,
}: {
    onMeasurementChange: (values: { scanLength: string; scoutFov: string }) => void;
    initialMeasurements?: { scanLength?: string; scoutFov?: string };
    scanPositionRatio?: number;
    onScanPositionRatioChange?: (ratio: number) => void;
    hideTools?: boolean;
    seriesOverride?: TomographicScoutSeriesOverride;
}) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const projectionRef = useRef<Uint8ClampedArray | null>(null);
    const metaRef = useRef<ProjectionMeta | null>(null);
    const initializedCropRef = useRef(false);
    const initialMeasurementsRef = useRef(initialMeasurements);
    const dragStateRef = useRef<{
        handle: DragHandle;
        pointerId: number;
        startX: number;
        startY: number;
        initialBox: CropBox;
    } | null>(null);
    const cropBoxRef = useRef<CropBox>({
        x: 0.18,
        y: 0.2,
        width: 0.54,
        height: 0.46,
    });
    const positionDragRef = useRef<{ pointerId: number } | null>(null);
    const panStateRef = useRef<{
        pointerId: number;
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
        initialMeasurementsRef.current = initialMeasurements;
    }, [initialMeasurements]);

    useEffect(() => {
        cropBoxRef.current = cropBox;
    }, [cropBox]);

    useEffect(() => {
        let cancelled = false;
        initializedCropRef.current = false;
        projectionRef.current = null;
        metaRef.current = null;
        setLoadState("loading");

        const loadAxialStackViaCornerstone = async (
            override: Extract<TomographicScoutSeriesOverride, { kind: "axialStack" }>,
        ): Promise<LoadedSlice[]> => {
            await initCornerstone();
            const fallbackWw = override.fallbackWindowWidth ?? SCOUT_SERIES.fallbackWindowWidth;
            const fallbackWl = override.fallbackWindowLevel ?? SCOUT_SERIES.fallbackWindowLevel;
            const slices: LoadedSlice[] = [];
            const concurrency = 8;
            for (let start = 0; start < override.urls.length; start += concurrency) {
                const batch = override.urls.slice(start, start + concurrency);
                const loadedBatch = await Promise.all(
                    batch.map(async (url, idxInBatch) => {
                        const indexInSeries = start + idxInBatch;
                        const imageId = buildWadoImageId(url);
                        const image = await imageLoader.loadAndCacheImage(imageId);
                        const rows = image.rows;
                        const cols = image.columns;
                        const slope = (image as { slope?: number }).slope ?? 1;
                        const intercept = (image as { intercept?: number }).intercept ?? 0;
                        const plane = (metaData.get("imagePlaneModule", imageId) ?? {}) as {
                            imagePositionPatient?: number[];
                            columnPixelSpacing?: number;
                            pixelSpacing?: number[];
                            sliceThickness?: number;
                        };
                        const voi = (metaData.get("voiLutModule", imageId) ?? {}) as {
                            windowCenter?: number | number[];
                            windowWidth?: number | number[];
                        };
                        const general = (metaData.get("generalImageModule", imageId) ?? {}) as {
                            instanceNumber?: number;
                        };
                        const positionZ = plane.imagePositionPatient?.[2] ?? indexInSeries;
                        const pixelSpacingX = plane.columnPixelSpacing ?? plane.pixelSpacing?.[1] ?? 1;
                        const sliceThickness = Number.isFinite(plane.sliceThickness) && (plane.sliceThickness ?? 0) > 0
                            ? (plane.sliceThickness as number)
                            : 1;
                        const wwRaw = Array.isArray(voi.windowWidth) ? voi.windowWidth[0] : voi.windowWidth;
                        const wlRaw = Array.isArray(voi.windowCenter) ? voi.windowCenter[0] : voi.windowCenter;
                        const ww = Number.isFinite(wwRaw) ? (wwRaw as number) : fallbackWw;
                        const wl = Number.isFinite(wlRaw) ? (wlRaw as number) : fallbackWl;
                        const pixelData = image.getPixelData() as Int16Array | Uint16Array;
                        const hu = new Float32Array(pixelData.length);
                        for (let i = 0; i < pixelData.length; i += 1) {
                            hu[i] = pixelData[i] * slope + intercept;
                        }
                        return {
                            instanceNumber: general.instanceNumber ?? indexInSeries + 1,
                            positionZ,
                            rows,
                            cols,
                            pixelSpacingX,
                            sliceThickness,
                            hu,
                            ww,
                            wl,
                        } as LoadedSlice;
                    }),
                );
                slices.push(...loadedBatch);
            }
            return slices;
        };

        const loadViaDicomParser = async (): Promise<LoadedSlice[]> => {
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
            return slices;
        };

        const loadTopogramViaCornerstone = async (
            override: Extract<TomographicScoutSeriesOverride, { kind: "topogram" }>,
        ): Promise<{ output: Uint8ClampedArray; meta: ProjectionMeta }> => {
            await initCornerstone();
            const fallbackWw = override.fallbackWindowWidth ?? SCOUT_SERIES.fallbackWindowWidth;
            const fallbackWl = override.fallbackWindowLevel ?? SCOUT_SERIES.fallbackWindowLevel;
            const imageId = buildWadoImageId(override.url);
            const image = await imageLoader.loadAndCacheImage(imageId);
            const rows = image.rows;
            const cols = image.columns;
            const slope = (image as { slope?: number }).slope ?? 1;
            const intercept = (image as { intercept?: number }).intercept ?? 0;
            const plane = (metaData.get("imagePlaneModule", imageId) ?? {}) as {
                columnPixelSpacing?: number;
                rowPixelSpacing?: number;
                pixelSpacing?: number[];
            };
            const voi = (metaData.get("voiLutModule", imageId) ?? {}) as {
                windowCenter?: number | number[];
                windowWidth?: number | number[];
            };
            const general = (metaData.get("imagePixelModule", imageId) ?? {}) as {
                photometricInterpretation?: string;
            };
            const wwRaw = Array.isArray(voi.windowWidth) ? voi.windowWidth[0] : voi.windowWidth;
            const wlRaw = Array.isArray(voi.windowCenter) ? voi.windowCenter[0] : voi.windowCenter;
            const ww = Number.isFinite(wwRaw) && (wwRaw ?? 0) > 1 ? (wwRaw as number) : fallbackWw;
            const wl = Number.isFinite(wlRaw) ? (wlRaw as number) : fallbackWl;
            const pixelSpacingX = plane.columnPixelSpacing ?? plane.pixelSpacing?.[1] ?? 1;
            const pixelSpacingY = plane.rowPixelSpacing ?? plane.pixelSpacing?.[0] ?? 1;
            const invert = (general.photometricInterpretation ?? "").toUpperCase() === "MONOCHROME1";

            const pixelData = image.getPixelData() as Int16Array | Uint16Array;
            const minVal = wl - ww / 2;
            const maxVal = wl + ww / 2;
            const range = Math.max(maxVal - minVal, 1);
            const output = new Uint8ClampedArray(cols * rows);
            for (let i = 0; i < pixelData.length; i += 1) {
                const value = pixelData[i] * slope + intercept;
                const normalized = clamp01((value - minVal) / range);
                const gray = Math.round(normalized * 255);
                output[i] = invert ? 255 - gray : gray;
            }
            return {
                output,
                meta: {
                    width: cols,
                    height: rows,
                    pixelSpacingX,
                    // For a topogram, the vertical pixel pitch (mm/row) defines the Z extent the
                    // crop box maps onto — feed pixelSpacingY in place of sliceThickness.
                    sliceThickness: pixelSpacingY,
                },
            };
        };

        const loadProjection = async () => {
            try {
                if (seriesOverride?.kind === "topogram") {
                    const { output, meta } = await withTimeout(
                        loadTopogramViaCornerstone(seriesOverride),
                        SCOUT_LOAD_TIMEOUT_MS,
                        "Topogram loading",
                    );
                    if (cancelled) return;
                    projectionRef.current = output;
                    metaRef.current = meta;
                    setLoadState("ready");
                    return;
                }

                const slices =
                    seriesOverride?.kind === "axialStack"
                        ? await withTimeout(loadAxialStackViaCornerstone(seriesOverride), SCOUT_LOAD_TIMEOUT_MS, "Scout stack loading")
                        : await withTimeout(loadViaDicomParser(), SCOUT_LOAD_TIMEOUT_MS, "Scout stack loading");

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
                console.warn("Failed to load scout DICOM; using fallback scout projection.", error);
                if (!cancelled) {
                    const fallback = createFallbackScoutProjection(initialMeasurementsRef.current);
                    projectionRef.current = fallback.output;
                    metaRef.current = fallback.meta;
                    setLoadState("ready");
                }
            }
        };

        void loadProjection();
        return () => {
            cancelled = true;
        };
    }, [seriesOverride]);

    useEffect(() => {
        const meta = metaRef.current;
        if (!meta || loadState !== "ready" || initializedCropRef.current) return;

        const savedRange = loadScoutPositioningRange();
        const baseCropBox = savedRange ? mapScoutRangeToCropBox(savedRange) : DEFAULT_SCOUT_CROP_BOX;
        const scanLength = initialMeasurements?.scanLength ? Number(initialMeasurements.scanLength) : null;
        const scoutFov = initialMeasurements?.scoutFov ? Number(initialMeasurements.scoutFov) : null;

        setCropBox(applyMeasurementsToCropBox(baseCropBox, { scanLength, scoutFov }, meta));
        initializedCropRef.current = true;
    }, [initialMeasurements?.scanLength, initialMeasurements?.scoutFov, loadState]);

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
        const updateScanPositionFromPointer = (clientY: number) => {
            const viewport = viewportRef.current;
            if (!viewport || !onScanPositionRatioChange) return;
            const rect = viewport.getBoundingClientRect();
            const currentBox = cropBoxRef.current;
            const cropTop = rect.top + currentBox.y * rect.height;
            const cropHeight = Math.max(1, currentBox.height * rect.height);
            onScanPositionRatioChange(clamp01((clientY - cropTop) / cropHeight));
        };

        const handleMove = (event: PointerEvent) => {
            if (positionDragRef.current?.pointerId === event.pointerId) {
                updateScanPositionFromPointer(event.clientY);
                return;
            }

            const viewport = viewportRef.current;
            if (!viewport) return;

            const panState = panStateRef.current;
            if (panState && panState.pointerId === event.pointerId) {
                setOffset({
                    x: panState.initialOffsetX + (event.clientX - panState.startX),
                    y: panState.initialOffsetY + (event.clientY - panState.startY),
                });
                return;
            }

            const dragState = dragStateRef.current;
            if (!dragState || dragState.pointerId !== event.pointerId) return;

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

        const handleUp = (event: PointerEvent) => {
            if (positionDragRef.current?.pointerId === event.pointerId) {
                positionDragRef.current = null;
            }
            if (dragStateRef.current?.pointerId === event.pointerId) {
                dragStateRef.current = null;
            }
            if (panStateRef.current?.pointerId === event.pointerId) {
                panStateRef.current = null;
            }
        };

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
        window.addEventListener("pointercancel", handleUp);
        return () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", handleUp);
            window.removeEventListener("pointercancel", handleUp);
        };
    }, [onScanPositionRatioChange]);

    const measurementLabels = useMemo(() => {
        const meta = metaRef.current;
        if (!meta) return { scanLength: "--", scoutFov: "--" };
        return {
            scanLength: (cropBox.height * meta.height * meta.sliceThickness).toFixed(1),
            scoutFov: (cropBox.width * meta.width * meta.pixelSpacingX).toFixed(1),
        };
    }, [cropBox]);
    const measurementScanLength = Number(measurementLabels.scanLength);
    const scanPositionMm = Number.isFinite(measurementScanLength)
        ? clamp01(scanPositionRatio) * measurementScanLength
        : null;

    const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
        if (toolMode !== "pan") return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        panStateRef.current = {
            pointerId: event.pointerId,
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

    const startDrag = (handle: DragHandle) => (event: React.PointerEvent<HTMLDivElement>) => {
        if (toolMode === "pan") return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragStateRef.current = {
            handle,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            initialBox: cropBox,
        };
    };

    const startPositionDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!onScanPositionRatioChange || toolMode === "pan") return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        positionDragRef.current = { pointerId: event.pointerId };
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cropTop = rect.top + cropBox.y * rect.height;
        const cropHeight = Math.max(1, cropBox.height * rect.height);
        onScanPositionRatioChange(clamp01((event.clientY - cropTop) / cropHeight));
    };

    return (
        <div className="flex-1 flex min-w-0 bg-[#05080d]">
            <section
                ref={viewportRef}
                className={`relative flex-1 min-w-0 rounded-l-lg bg-black overflow-hidden ${
                    toolMode === "pan" ? "cursor-grab" : "cursor-default"
                }`}
                onPointerDown={startPan}
                style={{ touchAction: "none", cursor: toolMode === "pan" ? "grab" : "crosshair" }}
            >
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />

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
                            className="absolute z-20 border-2 border-[#4D94FF] bg-[#4D94FF]/8 shadow-[0_0_0_1px_rgba(77,148,255,0.2),0_0_24px_rgba(77,148,255,0.15)] pointer-events-auto"
                            style={{
                                left: `${cropBox.x * 100}%`,
                                top: `${cropBox.y * 100}%`,
                                width: `${cropBox.width * 100}%`,
                                height: `${cropBox.height * 100}%`,
                                cursor: getHandleCursor(toolMode, "move"),
                                opacity: toolMode === "pan" ? 0.8 : 1,
                                touchAction: "none",
                            }}
                            onPointerDown={startDrag("move")}
                        >
                            <div className="absolute inset-0 border border-white/20">
                                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/20" />
                                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/20" />
                            </div>

                            <div
                                className="absolute left-0 right-0 z-40 h-10 -translate-y-1/2 cursor-ns-resize touch-none"
                                style={{ top: `${clamp01(scanPositionRatio) * 100}%`, pointerEvents: "auto" }}
                                title="扫描位置"
                                onPointerDown={startPositionDrag}
                                onPointerDownCapture={startPositionDrag}
                            >
                                <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[#FBBF24] shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
                                <div className="absolute left-2 top-1/2 -translate-y-1/2 rounded bg-[#0F172A]/90 px-1.5 py-0.5 text-[9px] font-mono font-bold text-[#FBBF24] ring-1 ring-[#FBBF24]/40">
                                    Z {scanPositionMm !== null ? scanPositionMm.toFixed(1) : "--"} mm
                                </div>
                            </div>

                            <div
                                className="absolute -top-4 left-1/2 h-8 w-16 -translate-x-1/2 bg-transparent"
                                style={{ cursor: getHandleCursor(toolMode, "top"), touchAction: "none" }}
                                onPointerDown={startDrag("top")}
                            />
                            <div
                                className="absolute -bottom-4 left-1/2 h-8 w-16 -translate-x-1/2 bg-transparent"
                                style={{ cursor: getHandleCursor(toolMode, "bottom"), touchAction: "none" }}
                                onPointerDown={startDrag("bottom")}
                            />
                            <div
                                className="absolute left-0 top-1/2 h-16 w-8 -translate-x-1/2 -translate-y-1/2 bg-transparent"
                                style={{ cursor: getHandleCursor(toolMode, "left"), touchAction: "none" }}
                                onPointerDown={startDrag("left")}
                            />
                            <div
                                className="absolute right-0 top-1/2 h-16 w-8 translate-x-1/2 -translate-y-1/2 bg-transparent"
                                style={{ cursor: getHandleCursor(toolMode, "right"), touchAction: "none" }}
                                onPointerDown={startDrag("right")}
                            />

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

            {!hideTools && (
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
            )}
        </div>
    );
}

const SequenceScanConfirmScreen = () => {
    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });
    const [axialParam, setAxialParam] = useState<ApiScanSessionAxialParam | null>(null);
    const [noiseLevel, setNoiseLevel] = useState<NoiseLevel>("medium");
    const [scanPositionRatio, setScanPositionRatio] = useState(0.5);
    const axialParamId = axialParam?.id ?? null;
    const updateTimerRef = useRef<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadSessionDefaults = async () => {
            try {
                const scanSession = await fetchSelectedScanSession();
                const loaded = scanSession?.series.find((series) => series.series_type === "axial")?.axial_param as ApiScanSessionAxialParam | null | undefined;
                if (!loaded || cancelled) return;

                setAxialParam(loaded);
                setMeasurements({
                    scanLength: String(loaded.scan_length),
                    scoutFov: String(loaded.fov),
                });
            } catch (error) {
                console.error("Failed to load axial scan session defaults.", error);
            }
        };

        void loadSessionDefaults();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleAutoMaChange = (patch: { auto_ma?: boolean; ma_min?: number; ma_max?: number; noise_level?: NoiseLevel }) => {
        const { noise_level, ...rest } = patch;
        if (noise_level) setNoiseLevel(noise_level);
        if (!axialParam || Object.keys(rest).length === 0) return;
        setAxialParam((prev) => (prev ? { ...prev, ...rest } : prev));
        void updateSelectedScanSessionAxialParam(axialParam.id, rest).catch((error) => {
            console.error("Failed to persist Auto mA settings.", error);
        });
    };

    useEffect(() => {
        if (!axialParamId) return;
        const scanLength = Number(measurements.scanLength);
        const scoutFov = Number(measurements.scoutFov);
        if (!Number.isFinite(scanLength) || !Number.isFinite(scoutFov)) return;

        if (updateTimerRef.current !== null) {
            window.clearTimeout(updateTimerRef.current);
        }

        updateTimerRef.current = window.setTimeout(() => {
            void updateSelectedScanSessionAxialParam(axialParamId, {
                scan_length: Number(scanLength.toFixed(1)),
                fov: Number(scoutFov.toFixed(1)),
            }).catch((error) => {
                console.error("Failed to persist axial crop measurements.", error);
            });
        }, 180);

        return () => {
            if (updateTimerRef.current !== null) {
                window.clearTimeout(updateTimerRef.current);
            }
        };
    }, [axialParamId, measurements.scanLength, measurements.scoutFov]);

    const scanLengthNum = Number(measurements.scanLength);
    const scanLengthForCurve = Number.isFinite(scanLengthNum) ? scanLengthNum : (axialParam?.scan_length ?? 0);
    const axialBedCount = Math.max(1, axialParam?.step_count ?? Math.round(scanLengthForCurve / Math.max(1, axialParam?.slice_interval ?? 1)));
    const setAxialScanPositionRatio = (ratio: number) => {
        if (axialBedCount <= 1) {
            setScanPositionRatio(0);
            return;
        }
        const bedIndex = Math.round(Math.min(1, Math.max(0, ratio)) * (axialBedCount - 1));
        setScanPositionRatio(bedIndex / (axialBedCount - 1));
    };

    const showAutoMaPanel = axialParam?.auto_ma ?? false;

    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="tomographicScan"
            tomographicParamOverrides={measurements}
            autoMaEnabled={showAutoMaPanel}
            onAutoMaEnabledChange={(value) => handleAutoMaChange({ auto_ma: value })}
            rightViewportContent={
                <>
                    <TomographicScoutViewport
                        onMeasurementChange={setMeasurements}
                        initialMeasurements={measurements}
                        scanPositionRatio={scanPositionRatio}
                        onScanPositionRatioChange={setAxialScanPositionRatio}
                    />
                    {axialParam && showAutoMaPanel && (
                        <AutoMaPanel
                            autoMa={axialParam.auto_ma ?? false}
                            maMin={axialParam.ma_min ?? Math.max(40, Math.round((axialParam.ma ?? 200) * 0.5))}
                            maMax={axialParam.ma_max ?? Math.round((axialParam.ma ?? 200) * 1.2)}
                            fallbackMa={axialParam.ma}
                            scanLength={scanLengthForCurve}
                            sliceInterval={axialParam.slice_interval}
                            rotationTime={axialParam.rotation_time}
                            stepCount={axialParam.step_count}
                            noiseLevel={noiseLevel}
                            scanPositionRatio={scanPositionRatio}
                            onScanPositionRatioChange={setAxialScanPositionRatio}
                            onChange={handleAutoMaChange}
                        />
                    )}
                </>
            }
            nextRoute="/image-viewer"
        />
    );
};

export default SequenceScanConfirmScreen;
