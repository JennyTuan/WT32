import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as dicomParser from "dicom-parser";
import { imageLoader, metaData } from "@cornerstonejs/core";
import { Hand, Move, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { fetchSelectedScanSession, updateScanSessionSeriesExecution, updateSelectedScanSessionAxialParam, updateSelectedScanSessionSeriesPlanning } from "../lib/scanSession";
import type { ApiScanSessionAxialParam, ApiScanSessionSeries } from "../lib/scanSession";
import { DEFAULT_SCOUT_CROP_BOX, applyMeasurementsToCropBox, loadScoutPositioningRange, mapCropBoxToScoutRange, mapScoutRangeToCropBox } from "../lib/scoutPositioningSession";
import AutoMaPanel, { NOISE_SLIDER_DEFAULT, type NoiseLevel } from "../components/AutoMaPanel";
import ScanConfirmScreen from "./ScanConfirmScreen";
import { buildWadoImageId, initCornerstone } from "../lib/cornerstone/initCornerstone";
import { computeDoseModulation, type ScoutHuData } from "../lib/doseModulation";
import { getDoseSettings } from "../lib/doseSettingsApi";
import { useI18n } from "../lib/i18nContext";
import { loadSelectedPatient } from "../lib/patientSession";
import { buildScanSessionExecutionContext, isTerminalScanSessionStatus, resolveTopogramImageSource } from "../lib/scanSeriesPrerequisites";
import { ScanParamWriteCoordinator } from "../lib/scanParamWriteCoordinator";
import { getLimbsDicomSeries, loadLimbsDicomDemoManifest, type LimbsDicomDemoManifest } from "../lib/limbsDicomDemo";
import { getHeadDualScoutSeries, loadHeadDualScoutManifest, type HeadDualScoutManifest } from "../lib/headDualScoutDemo";
import {
    isReferenceDicomSourceId,
    loadReferenceDicomManifest,
    type ReferenceDicomManifest,
} from "../lib/referenceDicomDemo";

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
    basePath: "/dicom/cap/soft",
    count: 120,
    fallbackWindowWidth: 350,
    fallbackWindowLevel: 45,
};

// Head Stroke Demo topogram (backend/data/Head Stroke Demo [Plain]/Series 001
// [Topogram]). Used as the scout / 定位像 source for all regular (non-gating)
// protocols so the demo shows a single consistent dataset.
const HEAD_STROKE_DEMO_SCOUT_OVERRIDE: TomographicScoutSeriesOverride = {
    kind: "topogram",
    url: "/dicom-head-stroke-plain/scout/scout.dcm",
    fallbackWindowWidth: 130,
    fallbackWindowLevel: 130,
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

type CropBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type DragHandle = "move" | "top" | "bottom" | "left" | "right";

// AP scout convention follows LPS: patient left is X+, back/posterior is Y+,
// and head is Z+. The reconstruction-center marker follows the crop box center.
type ReconCenterDelta = { axis: "x" | "y"; valueMm: number };

function computeReconCenterDelta(
    centerXRatio: number,
    physicalWidthMm: number,
): ReconCenterDelta {
    return { axis: "x", valueMm: (0.5 - centerXRatio) * physicalWidthMm };
}

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
    showScanPositionGuide = false,
    hideTools = false,
    seriesOverride,
    onScoutHuChange,
    onCropBoxChange,
    cropBoxOverride,
    tubeAngle = 180,
    onReconCenterChange,
    onLoadStateChange,
}: {
    onMeasurementChange: (values: { scanLength: string; scoutFov: string }) => void;
    initialMeasurements?: { scanLength?: string; scoutFov?: string };
    scanPositionRatio?: number;
    onScanPositionRatioChange?: (ratio: number) => void;
    showScanPositionGuide?: boolean;
    hideTools?: boolean;
    seriesOverride?: TomographicScoutSeriesOverride;
    onScoutHuChange?: (data: ScoutHuData | null) => void;
    onCropBoxChange?: (cropBox: { x: number; y: number; width: number; height: number }) => void;
    cropBoxOverride?: { x: number; y: number; width: number; height: number };
    tubeAngle?: number;
    onReconCenterChange?: (delta: ReconCenterDelta) => void;
    onLoadStateChange?: (state: "loading" | "ready" | "error") => void;
}) {
    // 保留角度输入用于与确认页的定位参数同步；不再在视图区显示中心标记。
    void tubeAngle;
    const { t } = useI18n();
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const projectionRef = useRef<Uint8ClampedArray | null>(null);
    const metaRef = useRef<ProjectionMeta | null>(null);
    const huRef = useRef<ScoutHuData | null>(null);
    const onScoutHuChangeRef = useRef(onScoutHuChange);
    const onCropBoxChangeRef = useRef(onCropBoxChange);
    useEffect(() => { onScoutHuChangeRef.current = onScoutHuChange; }, [onScoutHuChange]);
    useEffect(() => { onCropBoxChangeRef.current = onCropBoxChange; }, [onCropBoxChange]);
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
    const onReconCenterChangeRef = useRef(onReconCenterChange);
    useEffect(() => { onReconCenterChangeRef.current = onReconCenterChange; }, [onReconCenterChange]);
    const panStateRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        initialOffsetX: number;
        initialOffsetY: number;
    } | null>(null);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [projectionMeta, setProjectionMeta] = useState<ProjectionMeta | null>(null);
    useEffect(() => {
        onLoadStateChange?.(loadState);
    }, [loadState, onLoadStateChange]);
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
        setProjectionMeta(null);
        huRef.current = null;
        onScoutHuChangeRef.current?.(null);
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
        ): Promise<{ output: Uint8ClampedArray; meta: ProjectionMeta; hu: ScoutHuData }> => {
            // Pixel data goes through cornerstone so compressed transfer
            // syntaxes (e.g. JPEG Lossless on the Head Stroke Demo topogram)
            // are properly decoded. Header fields (RescaleSlope/Intercept,
            // PixelSpacing, WW/WL, Photometric) are parsed directly from the
            // DICOM bytes — cornerstone has historically been inconsistent
            // about exposing RescaleIntercept (the LIHVR limbs topogram with
            // intercept=-1024 rendered solid black via cornerstone alone).
            await initCornerstone();
            const [response, image] = await Promise.all([
                fetch(override.url),
                imageLoader.loadAndCacheImage(buildWadoImageId(override.url)),
            ]);
            if (!response.ok) {
                throw new Error(`Failed to fetch topogram (${response.status})`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const byteArray = new Uint8Array(arrayBuffer);
            const dataSet = dicomParser.parseDicom(byteArray);

            const rows = (dataSet.uint16("x00280010") ?? 0) || image.rows;
            const cols = (dataSet.uint16("x00280011") ?? 0) || image.columns;
            const intercept = Number(dataSet.string("x00281052") ?? "0");
            const slope = Number(dataSet.string("x00281053") ?? "1");
            const pixelSpacingPair = (dataSet.string("x00280030") ?? "1\\1").split("\\").map(Number);
            const pixelSpacingY = Number.isFinite(pixelSpacingPair[0]) && pixelSpacingPair[0] > 0 ? pixelSpacingPair[0] : 1;
            const pixelSpacingX = Number.isFinite(pixelSpacingPair[1]) && pixelSpacingPair[1] > 0 ? pixelSpacingPair[1] : pixelSpacingY;
            const photometric = (dataSet.string("x00280004") ?? "").toUpperCase();
            const invert = photometric === "MONOCHROME1";
            const dicomWw = Number(dataSet.string("x00281051") ?? NaN);
            const dicomWl = Number(dataSet.string("x00281050") ?? NaN);
            if (rows === 0 || cols === 0) {
                throw new Error("Topogram DICOM is missing pixel data");
            }
            const pixelData = image.getPixelData() as Int16Array | Uint16Array | Uint8Array;

            // Apply rescale to get HU, then choose a window. Override wins; if
            // none provided, prefer the DICOM-embedded window over the lung-CT
            // fallback so each dataset displays with its own intent.
            const huFloat = new Float32Array(rows * cols);
            let huMin = Number.POSITIVE_INFINITY;
            let huMax = Number.NEGATIVE_INFINITY;
            for (let i = 0; i < pixelData.length; i += 1) {
                const hu = pixelData[i] * slope + intercept;
                huFloat[i] = hu;
                if (hu < huMin) huMin = hu;
                if (hu > huMax) huMax = hu;
            }

            let ww = override.fallbackWindowWidth ?? (Number.isFinite(dicomWw) && dicomWw > 1 ? dicomWw : NaN);
            let wl = override.fallbackWindowLevel ?? (Number.isFinite(dicomWl) ? dicomWl : NaN);
            if (!Number.isFinite(ww) || !Number.isFinite(wl)) {
                ww = SCOUT_SERIES.fallbackWindowWidth;
                wl = SCOUT_SERIES.fallbackWindowLevel;
            }
            // If the configured window misses the actual HU range entirely
            // (everything clamps to 0 or to 1), fall back to a window centred
            // on the data so the topogram is at least visible.
            const minVal0 = wl - ww / 2;
            const maxVal0 = wl + ww / 2;
            if (Number.isFinite(huMin) && Number.isFinite(huMax) && (huMax < minVal0 || huMin > maxVal0)) {
                const span = Math.max(huMax - huMin, 1);
                wl = (huMin + huMax) / 2;
                ww = span * 1.1;
            }

            const minVal = wl - ww / 2;
            const range = Math.max(ww, 1);
            const output = new Uint8ClampedArray(rows * cols);
            for (let i = 0; i < huFloat.length; i += 1) {
                const normalized = clamp01((huFloat[i] - minVal) / range);
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
                hu: {
                    hu: huFloat,
                    rows,
                    cols,
                    pixelSpacingX,
                    pixelSpacingY,
                },
            };
        };

        const loadProjection = async () => {
            try {
                if (seriesOverride?.kind === "topogram") {
                    const { output, meta, hu } = await withTimeout(
                        loadTopogramViaCornerstone(seriesOverride),
                        SCOUT_LOAD_TIMEOUT_MS,
                        "Topogram loading",
                    );
                    if (cancelled) return;
                    projectionRef.current = output;
                    metaRef.current = meta;
                    setProjectionMeta(meta);
                    huRef.current = hu;
                    onScoutHuChangeRef.current?.(hu);
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
                const nextProjectionMeta = {
                    width: cols,
                    height: slices.length,
                    pixelSpacingX: slices[0].pixelSpacingX,
                    sliceThickness: slices[0].sliceThickness,
                };
                metaRef.current = nextProjectionMeta;
                setProjectionMeta(nextProjectionMeta);
                setLoadState("ready");
            } catch (error) {
                console.warn("Failed to load scout DICOM.", error);
                if (!cancelled) setLoadState("error");
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

        const physW = meta.width * meta.pixelSpacingX;
        const physH = meta.height * meta.sliceThickness;
        const fitScale = Math.min(viewW / physW, viewH / physH) * 0.92;
        const drawW = physW * fitScale * zoom;
        const drawH = physH * fitScale * zoom;
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
        onCropBoxChangeRef.current?.(cropBox);
    }, [cropBox, onMeasurementChange]);

    // When a controlled cropBoxOverride is provided, sync internal state to it
    // whenever it changes from the outside. Skip if the override matches the
    // current state (e.g. our own onCropBoxChange just bubbled back up), or if
    // the user is actively dragging — the drag would otherwise be clobbered by
    // a round-trip through the parent's controlled state.
    useEffect(() => {
        if (!cropBoxOverride) return;
        if (dragStateRef.current) return;
        const current = cropBoxRef.current;
        if (
            Math.abs(current.x - cropBoxOverride.x) < 1e-4 &&
            Math.abs(current.y - cropBoxOverride.y) < 1e-4 &&
            Math.abs(current.width - cropBoxOverride.width) < 1e-4 &&
            Math.abs(current.height - cropBoxOverride.height) < 1e-4
        ) {
            return;
        }
        setCropBox(cropBoxOverride);
    }, [cropBoxOverride]);

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

    const reconCenterRatio = useMemo(
        () => ({
            x: cropBox.x + cropBox.width / 2,
            y: cropBox.y + cropBox.height / 2,
        }),
        [cropBox],
    );
    const reconCenterDelta = useMemo<ReconCenterDelta | null>(() => {
        if (!projectionMeta) return null;
        const physW = projectionMeta.width * projectionMeta.pixelSpacingX;
        return computeReconCenterDelta(reconCenterRatio.x, physW);
    }, [projectionMeta, reconCenterRatio.x]);

    useEffect(() => {
        if (reconCenterDelta) onReconCenterChangeRef.current?.(reconCenterDelta);
    }, [reconCenterDelta]);

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
                        {t("scanFlow.scoutLoading")}
                    </div>
                )}

                {loadState === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#05080d]/80 text-[14px] font-bold text-[#FCA5A5]">
                        {t("scanFlow.scoutLoadError")}
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

                            {showScanPositionGuide && (
                                <div
                                    className="absolute left-0 right-0 z-40 h-10 -translate-y-1/2 cursor-ns-resize touch-none"
                                    style={{ top: `${clamp01(scanPositionRatio) * 100}%`, pointerEvents: "auto" }}
                                    title={t("scanFlow.scanPosition")}
                                    onPointerDown={startPositionDrag}
                                    onPointerDownCapture={startPositionDrag}
                                >
                                    <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[#FBBF24] shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
                                    <div className="absolute left-2 top-1/2 -translate-y-1/2 rounded bg-[#0F172A]/90 px-1.5 py-0.5 text-[9px] font-mono font-bold text-[#FBBF24] ring-1 ring-[#FBBF24]/40">
                                        Z {scanPositionMm !== null ? scanPositionMm.toFixed(1) : "--"} mm
                                    </div>
                                </div>
                            )}

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
    const navigate = useNavigate();
    const { t } = useI18n();
    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });
    const [axialParam, setAxialParam] = useState<ApiScanSessionAxialParam | null>(null);
    const [noiseLevel, setNoiseLevel] = useState<NoiseLevel>(NOISE_SLIDER_DEFAULT);
    const [scanPositionRatio, setScanPositionRatio] = useState(0.5);
    const [scoutHu, setScoutHu] = useState<ScoutHuData | null>(null);
    const [scoutCropBox, setScoutCropBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    // 暂存重建中心偏移，后续接入扫描协议持久化时使用
    const [, setReconCenterDelta] = useState<ReconCenterDelta | null>(null);
    const [topogramTubeAngle, setTopogramTubeAngle] = useState<number>(180);
    const [topogramSeries, setTopogramSeries] = useState<ApiScanSessionSeries | null>(null);
    const [scoutLoadState, setScoutLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [executionError, setExecutionError] = useState<string | null>(null);
    const [sessionResolved, setSessionResolved] = useState(false);
    const [limbsDicomManifest, setLimbsDicomManifest] = useState<LimbsDicomDemoManifest | null>(null);
    const [headDualScoutManifest, setHeadDualScoutManifest] = useState<HeadDualScoutManifest | null>(null);
    const [referenceTopogramManifest, setReferenceTopogramManifest] = useState<ReferenceDicomManifest | null>(null);
    const [scoutSourceError, setScoutSourceError] = useState<string | null>(null);
    const axialParamId = axialParam?.id ?? null;
    const [paramWrites] = useState(() => new ScanParamWriteCoordinator());
    const topogramImageSource = resolveTopogramImageSource(topogramSeries);
    const isReferenceTopogram = isReferenceDicomSourceId(topogramImageSource);

    useEffect(() => () => paramWrites.dispose(), [paramWrites]);

    useEffect(() => {
        let cancelled = false;
        setScoutSourceError(null);
        setScoutLoadState("loading");
        if (!isReferenceTopogram) setReferenceTopogramManifest(null);

        if (isReferenceTopogram && topogramImageSource) {
            loadReferenceDicomManifest(topogramImageSource)
                .then((manifest) => {
                    if (manifest && !cancelled) setReferenceTopogramManifest(manifest);
                    if (!manifest && !cancelled) setScoutSourceError("本地模拟定位像不可用，请检查数据目录");
                });
        } else if (topogramImageSource === "limbs-helical-demo") {
            loadLimbsDicomDemoManifest()
                .then((manifest) => {
                    if (!cancelled) setLimbsDicomManifest(manifest);
                })
                .catch((error) => {
                    if (!cancelled) setScoutSourceError(error instanceof Error ? error.message : "四肢定位像清单加载失败");
                });
        } else if (topogramImageSource === "head-dual-scout-demo") {
            loadHeadDualScoutManifest()
                .then((manifest) => {
                    if (!cancelled) setHeadDualScoutManifest(manifest);
                })
                .catch((error) => {
                    if (!cancelled) setScoutSourceError(error instanceof Error ? error.message : "头部双定位像清单加载失败");
                });
        }

        return () => { cancelled = true; };
    }, [isReferenceTopogram, topogramImageSource]);

    const scoutSeriesOverride = useMemo<TomographicScoutSeriesOverride | undefined>(() => {
        if (referenceTopogramManifest) {
            const url = referenceTopogramManifest.urls[0];
            return url ? {
                kind: "topogram",
                url,
                fallbackWindowWidth: referenceTopogramManifest.windowWidth ?? undefined,
                fallbackWindowLevel: referenceTopogramManifest.windowCenter ?? undefined,
            } : undefined;
        }
        if (topogramImageSource === "head-stroke-topogram") return HEAD_STROKE_DEMO_SCOUT_OVERRIDE;
        if (topogramImageSource === "limbs-helical-demo") {
            const topogram = getLimbsDicomSeries(limbsDicomManifest, "topogram");
            const url = topogram?.urls[0];
            return url ? {
                kind: "topogram",
                url,
                fallbackWindowWidth: topogram.windowWidth ?? undefined,
                fallbackWindowLevel: topogram.windowCenter ?? undefined,
            } : undefined;
        }
        if (topogramImageSource === "head-dual-scout-demo") {
            const apSeries = getHeadDualScoutSeries(headDualScoutManifest, "scout-ap");
            return apSeries ? {
                kind: "topogram",
                url: apSeries.url,
                fallbackWindowWidth: apSeries.windowWidth ?? headDualScoutManifest?.defaultWindowWidth,
                fallbackWindowLevel: apSeries.windowCenter ?? headDualScoutManifest?.defaultWindowLevel,
            } : undefined;
        }
        // qin-lung-topogram is the only registered source that intentionally
        // uses TomographicScoutViewport's built-in QIN axial-stack projection.
        return undefined;
    }, [headDualScoutManifest, limbsDicomManifest, referenceTopogramManifest, topogramImageSource]);

    const scoutManifestReady = isReferenceTopogram
        ? Boolean(referenceTopogramManifest?.urls[0])
        : topogramImageSource === "limbs-helical-demo"
        ? Boolean(getLimbsDicomSeries(limbsDicomManifest, "topogram")?.urls[0])
        : topogramImageSource === "head-dual-scout-demo"
            ? Boolean(
                getHeadDualScoutSeries(headDualScoutManifest, "scout-ap")
                && getHeadDualScoutSeries(headDualScoutManifest, "scout-lat"),
            )
            : topogramImageSource !== null;

    useEffect(() => {
        let cancelled = false;

        const loadSessionDefaults = async () => {
            try {
                const scanSession = await fetchSelectedScanSession({ preferCache: false });
                const loaded = scanSession?.series.find((series) => series.series_type === "axial")?.axial_param as ApiScanSessionAxialParam | null | undefined;
                const loadedAxialSeries = scanSession?.series.find((series) => series.series_type === "axial") ?? null;
                const loadedTopogramSeries = scanSession?.series
                    .filter((series) => series.series_type === "topogram" && (!loadedAxialSeries || series.series_order < loadedAxialSeries.series_order))
                    .sort((a, b) => b.series_order - a.series_order)[0] ?? null;
                const topogram = loadedTopogramSeries?.topogram_param;
                if (!cancelled) {
                    setTopogramSeries(loadedTopogramSeries);
                }
                if (topogram && !cancelled) {
                    setTopogramTubeAngle(topogram.tube_angle ?? 180);
                }
                if (!loaded || cancelled) return;

                let resolvedParam = loaded;
                if (loaded.dom == null) {
                    try {
                        const domEnabled = (await getDoseSettings()).dom_enabled;
                        const domPatch = { dom: domEnabled ? "1" : "0", auto_ma: domEnabled };
                        resolvedParam = { ...loaded, ...domPatch };
                        await updateSelectedScanSessionAxialParam(loaded.id, domPatch);
                    } catch (error) {
                        console.error("Failed to apply the DOM default to the scan session.", error);
                    }
                }

                if (cancelled) return;
                setAxialParam(resolvedParam);
                setMeasurements({
                    scanLength: String(loaded.scan_length),
                    scoutFov: String(loaded.fov),
                });
            } catch (error) {
                console.error("Failed to load axial scan session defaults.", error);
            } finally {
                if (!cancelled) setSessionResolved(true);
            }
        };

        void loadSessionDefaults();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleAutoMaChange = (patch: { auto_ma?: boolean; ma_min?: number; ma_max?: number; noise_level?: NoiseLevel }) => {
        const { noise_level, ...rest } = patch;
        if (noise_level !== undefined) setNoiseLevel(noise_level);
        if (!axialParam || Object.keys(rest).length === 0) return;
        const synchronizedPatch = rest.auto_ma === undefined
            ? rest
            : { ...rest, dom: rest.auto_ma ? "1" : "0" };
        setAxialParam((prev) => (prev ? { ...prev, ...synchronizedPatch } : prev));
        void paramWrites.write(() => updateSelectedScanSessionAxialParam(axialParam.id, synchronizedPatch)).catch((error) => {
            console.error("Failed to persist Auto mA settings.", error);
        });
    };

    useEffect(() => {
        if (!axialParamId) return;
        const scanLength = Number(measurements.scanLength);
        const scoutFov = Number(measurements.scoutFov);
        if (!Number.isFinite(scanLength) || !Number.isFinite(scoutFov)) return;

        paramWrites.schedule(
            () => updateSelectedScanSessionAxialParam(axialParamId, {
                scan_length: Number(scanLength.toFixed(1)),
                fov: Number(scoutFov.toFixed(1)),
            }),
            180,
            (error) => {
                console.error("Failed to persist axial crop measurements.", error);
            },
        );
    }, [axialParamId, measurements.scanLength, measurements.scoutFov, paramWrites]);

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

    const showAutoMaPanel = axialParam?.dom === "1" || (axialParam?.dom == null && axialParam?.auto_ma === true);

    const realMaCurve = useMemo(() => {
        if (!showAutoMaPanel || !scoutHu || !scoutCropBox || !axialParam) return null;
        const maRef = axialParam.ma ?? 200;
        const maMin = axialParam.ma_min ?? Math.max(40, Math.round(maRef * 0.5));
        const maMax = axialParam.ma_max ?? Math.round(maRef * 1.2);
        try {
            const result = computeDoseModulation({
                scoutData: scoutHu,
                cropBox: scoutCropBox,
                kv: axialParam.kv ?? 120,
                maRef,
                maMin,
                maMax,
                steps: axialBedCount,
            });
            return result.maCurve;
        } catch (error) {
            console.error("Failed to compute axial dose modulation curve.", error);
            return null;
        }
    }, [showAutoMaPanel, scoutHu, scoutCropBox, axialParam, axialBedCount]);

    const scoutDisplayReady = topogramImageSource !== null
        && scoutManifestReady
        && !scoutSourceError
        && scoutLoadState === "ready";
    const topogramDependencyReady = Boolean(
        sessionResolved
        && topogramSeries
        && topogramSeries.execution_status === "image_ready"
        && scoutDisplayReady,
    );

    const handleExecuteScan = async () => {
        setExecutionError(null);
        try {
            await paramWrites.flush();
            if (!topogramDependencyReady) {
                throw new Error("定位像未成功出图或未登记受支持的影像来源，无法执行后续断层扫描");
            }
            const latestScanSession = await fetchSelectedScanSession({ preferCache: false });
            if (!latestScanSession || latestScanSession.acquisition_type !== "regular") {
                throw new Error("当前扫描会话与常规断层扫描不匹配，请返回患者列表重新选择");
            }
            const selectedPatient = loadSelectedPatient();
            if (!selectedPatient || latestScanSession.patient_id !== selectedPatient.id) {
                throw new Error("患者与扫描会话不一致，请返回患者列表重新选择");
            }
            if (isTerminalScanSessionStatus(latestScanSession.status)) {
                throw new Error("当前扫描会话已结束，不能再次执行");
            }
            const axialTargets = latestScanSession.series.filter((series) => series.series_type === "axial");
            if (axialTargets.length !== 1) {
                throw new Error("当前版本仅支持单个断层扫描目标，请返回协议配置检查序列");
            }
            if (axialTargets[0].execution_status !== "pending") {
                throw new Error("断层扫描序列不是待执行状态；请通过明确的重试或结果查看入口继续");
            }

            const executionContext = buildScanSessionExecutionContext(latestScanSession, "axial");
            if (!executionContext) throw new Error("当前扫描会话缺少待执行的断层扫描序列");

            const requiredTopogram = executionContext.requiredTopogramId === null
                ? null
                : latestScanSession.series.find((series) => series.id === executionContext.requiredTopogramId) ?? null;
            if (requiredTopogram) {
                const latestImageSource = resolveTopogramImageSource(requiredTopogram);
                if (
                    requiredTopogram.execution_status !== "image_ready"
                    || latestImageSource === null
                    || latestImageSource !== topogramImageSource
                    || !scoutDisplayReady
                ) {
                    throw new Error("定位像未成功出图，无法执行后续断层扫描");
                }
                if (scoutCropBox) {
                    const range = mapCropBoxToScoutRange(scoutCropBox);
                    const target = latestScanSession.series.find((series) => series.id === executionContext.targetSeriesId);
                    await updateSelectedScanSessionSeriesPlanning(executionContext.targetSeriesId, {
                        source_topogram_series_id: requiredTopogram.id,
                        range_min_position_mm: range.start,
                        range_max_position_mm: range.end,
                        scan_direction: target?.axial_param?.scan_direction === "FOOT_TO_HEAD"
                            ? "FOOT_TO_HEAD"
                            : target?.scan_planning?.scan_direction === "FOOT_TO_HEAD"
                                ? "FOOT_TO_HEAD"
                                : "HEAD_TO_FOOT",
                    });
                }
                await updateScanSessionSeriesExecution(requiredTopogram.id, { range_confirmed: true });
            }

            const query = new URLSearchParams({
                mode: "axial",
                scanSessionId: String(executionContext.scanSessionId),
                targetSeriesId: String(executionContext.targetSeriesId),
                topogramId: executionContext.requiredTopogramId === null
                    ? "none"
                    : String(executionContext.requiredTopogramId),
            });
            navigate(`/helical-execute?${query.toString()}`, {
                state: { showCombinedPatientConfirm: true },
            });
        } catch (error) {
            setExecutionError(error instanceof Error ? error.message : "断层扫描前置条件校验失败");
        }
    };

    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="tomographicScan"
            tomographicParamOverrides={measurements}
            onScoutAngleChange={setTopogramTubeAngle}
            autoMaEnabled={showAutoMaPanel}
            onAutoMaEnabledChange={(value) => handleAutoMaChange({ auto_ma: value })}
            onExecuteScan={() => { void handleExecuteScan(); }}
            executeDisabled={!topogramDependencyReady}
            rightViewportContent={
                <>
                    {sessionResolved && topogramImageSource && scoutManifestReady && !scoutSourceError ? (
                        <TomographicScoutViewport
                            key={topogramImageSource}
                            onMeasurementChange={setMeasurements}
                            initialMeasurements={measurements}
                            scanPositionRatio={scanPositionRatio}
                            showScanPositionGuide={showAutoMaPanel}
                            onScanPositionRatioChange={setAxialScanPositionRatio}
                            seriesOverride={scoutSeriesOverride}
                            onScoutHuChange={setScoutHu}
                            onCropBoxChange={setScoutCropBox}
                            tubeAngle={topogramTubeAngle}
                            onReconCenterChange={setReconCenterDelta}
                            onLoadStateChange={setScoutLoadState}
                        />
                    ) : (
                        <div className="flex h-full flex-1 items-center justify-center rounded-lg bg-[#05080d] px-8 text-center text-[14px] font-bold text-white/70">
                            {!sessionResolved
                                ? t("scanFlow.scoutLoading")
                                : scoutSourceError
                                    ? `定位像来源加载失败：${scoutSourceError}`
                                    : topogramSeries
                                        ? "定位像未登记受支持的 v1 影像来源，无法确认扫描范围"
                                        : "当前扫描序列未配置定位像依赖"}
                        </div>
                    )}
                    {(executionError || (topogramSeries && !topogramDependencyReady)) && (
                        <div className="absolute bottom-3 left-3 right-3 z-30 rounded border border-[#EF4444]/60 bg-[#2A1115]/95 px-3 py-2 text-[12px] font-bold text-[#FCA5A5]">
                            {executionError ?? t("scanFlow.localizerPrerequisiteBlocked")}
                        </div>
                    )}
                    {axialParam && showAutoMaPanel && (
                        <AutoMaPanel
                            autoMa={showAutoMaPanel}
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
                            realMaCurve={realMaCurve}
                        />
                    )}
                </>
            }
            nextRoute="/image-viewer"
        />
    );
};

export default SequenceScanConfirmScreen;
