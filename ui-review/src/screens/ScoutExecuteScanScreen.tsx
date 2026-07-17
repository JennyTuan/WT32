import { useEffect, useMemo, useRef, useState } from "react";
import * as dicomParser from "dicom-parser";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchSelectedScanSession, loadSelectedScanSessionId, startScanSession, updateScanSessionSeriesExecution, type ApiScanSeriesImageSourceId, type ApiScanSessionDetail } from "../lib/scanSession";
import { applyScanWorkflowAction, createActionId } from "../lib/scanWorkflowActions";
import { loadSelectedPatient } from "../lib/patientSession";
import { loadSelectedScanWorkflowPlans } from "../lib/scanWorkflowSession";
import { useDoseThresholdGuard } from "../lib/useDoseThresholdGuard";
import { isBrainHelicalScanSession, isBrainHelicalWorkflow } from "../lib/brainHelicalDemo";
import {
    getLimbsDicomSeries,
    isLimbsHelicalScanSession,
    isLimbsHelicalWorkflow,
    loadLimbsDicomDemoManifest,
    resetLimbsDicomDemoManifestCache,
    type LimbsDicomDemoManifest,
} from "../lib/limbsDicomDemo";
import {
    getHeadDualScoutSeries,
    isHeadDualScoutSession,
    isHeadDualScoutWorkflow,
    loadHeadDualScoutManifest,
    mergeDualScoutPlanSequences,
    resetHeadDualScoutManifestCache,
    type HeadDualScoutManifest,
} from "../lib/headDualScoutDemo";
import DicomViewer from "../components/DicomViewer";
import PhysicalTriggerGuide, { type PhysicalTriggerStep } from "../components/PhysicalTriggerGuide";
import ScanTriggerFailureDialog from "../components/ScanTriggerFailureDialog";
import ThresholdGuardModal from "../components/ThresholdGuardModal";
import ScanConfirmScreen, { PatientConfirmationModal } from "./ScanConfirmScreen";
import { useI18n } from "../lib/i18nContext";
import type { TranslationKey } from "../lib/i18n";
import { DEVICE_ERROR_RAISED_EVENT, type DeviceErrorEvent } from "../lib/deviceErrorEvents";
import {
    canStartScoutExecution,
    resolvePostScoutScanTypeFromSession,
    resolveSeriesRecoveryAction,
    selectScoutExecutionSeries,
    type PostScoutScanType,
    type SeriesRecoveryIntent,
} from "../lib/scanExecutionFlow";

const HOLD_DURATION_MS = 3000;
const POSITIONING_TIMEOUT_MS = 8000;
const EXPOSURE_REQUEST_TIMEOUT_MS = 8000;
const EXPOSURE_DURATION_MS = 1200;
const RENDER_DURATION_MS = 2200;
const GANTRY_ROTATION_DURATION_MS = 1500;
type DualScoutPhase = "ap_exposing" | "ap_rendering" | "rotating" | "lat_exposing" | "lat_rendering" | "done" | null;
const SCOUT_SERIES = {
    basePath: "/dicom/cap/soft",
    count: 120,
    firstImageNumber: 1,
    fileNamePrefix: "1-",
    fileNamePadding: 3,
    directImage: false,
    fallbackWindowWidth: 350,
    fallbackWindowLevel: 45,
};
const FOUR_D_SCOUT_SERIES = {
    basePath: "/daae3df7f522b56724aed7e3e544c0fe/series-000002",
    count: 1,
    firstImageNumber: 2,
    fileNamePrefix: "image-",
    fileNamePadding: 6,
    directImage: true,
    fallbackWindowWidth: 500,
    fallbackWindowLevel: 50,
};
const BRAIN_HELICAL_SCOUT_EXECUTE_SERIES = {
    basePath: "/dicom-head-stroke-plain/scout",
    count: 1,
    firstImageNumber: 1,
    fileNamePrefix: "",
    fileNamePadding: 0,
    fileNames: ["scout.dcm"],
    directImage: true,
    useCornerstoneViewer: true,
    fallbackWindowWidth: 130,
    fallbackWindowLevel: 130,
};

type ScoutDicomSeries = typeof SCOUT_SERIES & {
    fileNames?: string[];
    useCornerstoneViewer?: boolean;
};

type ScanStage = "idle" | "positioning" | "positioned" | "enabled" | "exposing" | "rendering" | "completed" | "failed";
type ScoutImageLoadState = "loading" | "ready" | "error";
type PhysicalTriggerAction = "position" | "exposure";
type ScoutExecuteLocationState = {
    showCombinedPatientConfirm?: boolean;
    returnRoute?: "/scan-confirm" | "/scout-scan";
    returnStep?: number;
};

type ProjectionMeta = {
    width: number;
    height: number;
    ww: number;
    wl: number;
    kvp: string;
    mas: string;
    thickness: string;
};

type LoadedSlice = {
    instanceNumber: number;
    positionZ: number;
    rows: number;
    cols: number;
    pixelSpacingX: number;
    sliceThickness: number;
    hu: Float32Array;
};

const DEFAULT_POST_SCOUT_SCAN_TYPE: PostScoutScanType = "helical";

const POST_SCOUT_SCAN_CONFIG: Record<PostScoutScanType, { labelKey: TranslationKey; route: string }> = {
    helical: {
        labelKey: "scanFlow.postScout.helical",
        route: "/helical-confirm",
    },
    axial: {
        labelKey: "scanFlow.postScout.axial",
        route: "/sequence-confirm",
    },
    "4d": {
        labelKey: "scanFlow.postScout.fourD",
        route: "/fourd-confirm",
    },
    gated_helical: {
        labelKey: "scanFlow.postScout.gatedHelical",
        route: "/gated-helical-confirm",
    },
    gated_axial: {
        labelKey: "scanFlow.postScout.gatedAxial",
        route: "/gated-axial-confirm",
    },
};

const resolvePostScoutScanTypeFromWorkflowPlans = (): PostScoutScanType | null => {
    const workflowPlans = loadSelectedScanWorkflowPlans();
    for (const plan of workflowPlans) {
        const nextSequence = plan.sequences.find(
            (sequence) => sequence.type === "helical" || sequence.type === "axial" || sequence.type === "4d"
        );
        if (nextSequence && (nextSequence.type === "helical" || nextSequence.type === "axial" || nextSequence.type === "4d")) {
            return nextSequence.type;
        }
    }

    return null;
};

const hasBrainHelicalWorkflow = () => isBrainHelicalWorkflow(loadSelectedScanWorkflowPlans());
const hasLimbsHelicalWorkflow = () => isLimbsHelicalWorkflow(loadSelectedScanWorkflowPlans());
const hasHeadDualScoutWorkflow = () => isHeadDualScoutWorkflow(loadSelectedScanWorkflowPlans());

const buildHeadDualScoutSeries = (manifest: HeadDualScoutManifest, key: "scout-ap" | "scout-lat"): ScoutDicomSeries | null => {
    const series = getHeadDualScoutSeries(manifest, key);
    if (!series) return null;
    const url = series.url;
    const lastSlash = url.lastIndexOf("/");
    const basePath = lastSlash >= 0 ? url.slice(0, lastSlash) : url;
    const fileName = lastSlash >= 0 ? url.slice(lastSlash + 1) : url;
    return {
        basePath,
        count: 1,
        firstImageNumber: 1,
        fileNamePrefix: "",
        fileNamePadding: 0,
        fileNames: [fileName],
        directImage: true,
        useCornerstoneViewer: true,
        fallbackWindowWidth: series.windowWidth ?? manifest.defaultWindowWidth,
        fallbackWindowLevel: series.windowCenter ?? manifest.defaultWindowLevel,
    };
};

const buildLimbsScoutExecuteSeries = (manifest: LimbsDicomDemoManifest): ScoutDicomSeries | null => {
    const topogram = getLimbsDicomSeries(manifest, "topogram");
    const url = topogram?.urls[0];
    if (!url) return null;
    const lastSlash = url.lastIndexOf("/");
    const basePath = lastSlash >= 0 ? url.slice(0, lastSlash) : url;
    const fileName = lastSlash >= 0 ? url.slice(lastSlash + 1) : url;
    return {
        basePath,
        count: 1,
        firstImageNumber: 1,
        fileNamePrefix: "",
        fileNamePadding: 0,
        fileNames: [fileName],
        directImage: true,
        useCornerstoneViewer: true,
        fallbackWindowWidth: topogram?.windowWidth ?? manifest.defaultWindowWidth,
        fallbackWindowLevel: topogram?.windowCenter ?? manifest.defaultWindowLevel,
    };
};

function clamp01(value: number) {
    return Math.min(1, Math.max(0, value));
}

function ScoutProjectionViewport({
    renderProgress,
    active,
    series,
    onLoadStateChange,
}: {
    renderProgress: number;
    active: boolean;
    series: ScoutDicomSeries;
    onLoadStateChange?: (state: ScoutImageLoadState) => void;
}) {
    const { t } = useI18n();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const projectionRef = useRef<Uint8ClampedArray | null>(null);
    const projectionSizeRef = useRef<{ width: number; height: number } | null>(null);
    const metaRef = useRef<ProjectionMeta | null>(null);
    const [meta, setMeta] = useState<ProjectionMeta | null>(null);
    const [loadState, setLoadState] = useState<ScoutImageLoadState>("loading");
    useEffect(() => {
        onLoadStateChange?.(loadState);
    }, [loadState, onLoadStateChange]);
    const imageUrls = useMemo(
        () =>
            series.fileNames?.length
                ? series.fileNames.map((fileName) => `${series.basePath}/${fileName}`)
                : Array.from({ length: series.count }, (_, index) => {
                    const imageNumber = series.firstImageNumber + index;
                    const fileName = `${series.fileNamePrefix}${String(imageNumber).padStart(series.fileNamePadding, "0")}.dcm`;
                    return `${series.basePath}/${fileName}`;
                }),
        [series]
    );

    useEffect(() => {
        if (series.useCornerstoneViewer) {
            setLoadState("ready");
            setMeta({
                width: 512,
                height: 512,
                ww: series.fallbackWindowWidth,
                wl: series.fallbackWindowLevel,
                kvp: "120",
                mas: "198",
                thickness: "2.0",
            });
            return;
        }

        let cancelled = false;

        const loadSlices = async () => {
            try {
                const sliceNumbers = Array.from({ length: series.count }, (_, index) => series.firstImageNumber + index);
                const slices: LoadedSlice[] = [];
                const concurrency = 8;

                for (let start = 0; start < sliceNumbers.length; start += concurrency) {
                    const batch = sliceNumbers.slice(start, start + concurrency);
                    const loadedBatch = await Promise.all(
                        batch.map(async (sliceNumber) => {
                            const fileName = `${series.fileNamePrefix}${String(sliceNumber).padStart(series.fileNamePadding, "0")}.dcm`;
                            const response = await fetch(`${series.basePath}/${fileName}`);
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
                                pixelSpacingX: pixelSpacing[1] || 1,
                                sliceThickness: Number.isFinite(sliceThickness) && sliceThickness > 0 ? sliceThickness : 1,
                                hu,
                                ww: Number(dataSet.string("x00281051") ?? `${series.fallbackWindowWidth}`),
                                wl: Number(dataSet.string("x00281050") ?? `${series.fallbackWindowLevel}`),
                                kvp: dataSet.string("x00180060") ?? "120",
                                mas: dataSet.string("x00181152") ?? "Auto",
                                thickness: dataSet.string("x00180050") ?? "3.0 mm",
                            };
                        })
                    );

                    loadedBatch.forEach((slice) => {
                        slices.push({
                            instanceNumber: slice.instanceNumber,
                            positionZ: slice.positionZ,
                            rows: slice.rows,
                            cols: slice.cols,
                            pixelSpacingX: slice.pixelSpacingX,
                            sliceThickness: slice.sliceThickness,
                            hu: slice.hu,
                        });

                            if (!metaRef.current) {
                                metaRef.current = {
                                    width: slice.cols,
                                    height: series.directImage ? slice.rows : series.count,
                                    ww: Number.isFinite(slice.ww) && slice.ww > 1 ? slice.ww : series.fallbackWindowWidth,
                                    wl: Number.isFinite(slice.wl) ? slice.wl : series.fallbackWindowLevel,
                                    kvp: slice.kvp,
                                    mas: slice.mas,
                                    thickness: slice.thickness,
                            };
                        }
                    });
                }

                slices.sort((a, b) => b.positionZ - a.positionZ || a.instanceNumber - b.instanceNumber);
                if (slices.length === 0) {
                    throw new Error("No DICOM slices loaded.");
                }

                const rows = slices[0].rows;
                const cols = slices[0].cols;
                const ww = metaRef.current?.ww ?? series.fallbackWindowWidth;
                const wl = metaRef.current?.wl ?? series.fallbackWindowLevel;
                const minVal = wl - ww / 2;
                const maxVal = wl + ww / 2;
                const range = Math.max(maxVal - minVal, 1);
                const output = new Uint8ClampedArray(cols * (series.directImage ? rows : slices.length));

                if (series.directImage) {
                    const slice = slices[0];
                    for (let index = 0; index < slice.hu.length; index += 1) {
                        const normalized = clamp01((slice.hu[index] - minVal) / range);
                        output[index] = Math.round(normalized * 255);
                    }
                } else {
                    const bandHalfHeight = Math.max(10, Math.floor(rows * 0.08));
                    const centerY = Math.floor(rows / 2);
                    const sampleStart = Math.max(0, centerY - bandHalfHeight);
                    const sampleEnd = Math.min(rows, centerY + bandHalfHeight);

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
                }

                if (cancelled) return;

                projectionRef.current = output;
                projectionSizeRef.current = { width: cols, height: series.directImage ? rows : slices.length };
                setMeta({
                    width: cols,
                    height: series.directImage ? rows : slices.length,
                    ww,
                    wl,
                    kvp: metaRef.current?.kvp ?? "120",
                    mas: metaRef.current?.mas ?? "Auto",
                    thickness: metaRef.current?.thickness ?? "3.0 mm",
                });
                setLoadState("ready");
            } catch (error) {
                console.error(error);
                if (!cancelled) {
                    setLoadState("error");
                }
            }
        };

        void loadSlices();

        return () => {
            cancelled = true;
        };
    }, [series]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const viewport = viewportRef.current;
        const pixels = projectionRef.current;
        const size = projectionSizeRef.current;
        if (!canvas || !viewport || !pixels || !size) return;

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
        for (let i = 0; i < pixels.length; i += 1) {
            const j = i * 4;
            const value = pixels[i];
            out[j] = value;
            out[j + 1] = value;
            out[j + 2] = value;
            out[j + 3] = 255;
        }
        offCtx.putImageData(imageData, 0, 0);

        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, viewW, viewH);

        const fitScale = Math.min(viewW / size.width, viewH / size.height);
        const drawScale = fitScale * 0.9;
        const drawW = size.width * drawScale;
        const drawH = size.height * drawScale;
        const x = (viewW - drawW) / 2;
        const y = 20;

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = 0.28 + renderProgress * 0.72;
        ctx.filter = `contrast(${1.04 + renderProgress * 0.08}) brightness(${0.84 + renderProgress * 0.1})`;
        ctx.drawImage(offscreen, x, y, drawW, drawH);
        ctx.restore();
    }, [renderProgress, loadState]);

    return (
        <div ref={viewportRef} className="absolute inset-0 overflow-hidden bg-black">
            {series.useCornerstoneViewer ? (
                <div
                    className="absolute inset-0 h-full w-full"
                    style={{
                        clipPath: `inset(${(1 - renderProgress) * 100}% 0 0 0)`,
                        opacity: active ? 1 : 0,
                        transition: "opacity 180ms ease",
                    }}
                >
                    <DicomViewer
                        key={series.basePath}
                        imageUrls={imageUrls}
                        currentImageIndex={0}
                        activeTool="pan"
                        windowCenter={series.fallbackWindowLevel}
                        windowWidth={series.fallbackWindowWidth}
                    />
                </div>
            ) : (
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 h-full w-full"
                    style={{
                        clipPath: `inset(${(1 - renderProgress) * 100}% 0 0 0)`,
                        opacity: active ? 1 : 0,
                        transition: "opacity 180ms ease",
                    }}
                />
            )}

            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/55 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />

            {loadState === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium tracking-[0.12em] text-[#9FB2C5]">
                    {t("scanFlow.scoutLoadingData")}
                </div>
            )}

            {loadState === "error" && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium tracking-[0.08em] text-[#D1D9E1]">
                    {t("scanFlow.scoutLoadError")}
                </div>
            )}

            {meta && (
                <>
                    <div className="pointer-events-none absolute left-3 top-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div className="font-bold">Scout Projection</div>
                        <div>{meta.width} x {meta.height}</div>
                    </div>
                    <div className="pointer-events-none absolute right-3 top-3 text-right text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div className="font-bold">CT</div>
                        <div>KV {meta.kvp} | mAs {meta.mas}</div>
                    </div>
                    <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div>WW/WL {Math.round(meta.ww)} / {Math.round(meta.wl)}</div>
                        <div>Thick {meta.thickness}</div>
                    </div>
                    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[11px] font-bold tracking-[0.12em] text-[#DCE5ED]">
                        R
                    </div>
                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold tracking-[0.12em] text-[#DCE5ED]">
                        L
                    </div>
                </>
            )}

            <div
                className="pointer-events-none absolute left-[12%] right-[12%] h-px bg-[linear-gradient(90deg,transparent,rgba(215,227,239,0.9),transparent)]"
                style={{
                    top: `${Math.min(renderProgress, 0.995) * 100}%`,
                    opacity: active && renderProgress < 1 ? 1 : 0,
                    transition: "opacity 160ms ease",
                }}
            />
        </div>
    );
}

export default function ScoutExecuteScanScreen() {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useI18n();
    const routeState = location.state as ScoutExecuteLocationState | null;
    const initialCombinedPatientConfirm = routeState?.showCombinedPatientConfirm === true;
    const [stage, setStage] = useState<ScanStage>("idle");
    const [physicalTriggerAction, setPhysicalTriggerAction] = useState<PhysicalTriggerAction>("position");
    const [showCombinedPatientConfirm, setShowCombinedPatientConfirm] = useState(initialCombinedPatientConfirm);
    const [guideVisible, setGuideVisible] = useState(!initialCombinedPatientConfirm);
    const [renderProgress, setRenderProgress] = useState(0);
    const [dualPhase, setDualPhase] = useState<DualScoutPhase>(null);
    const [apRenderProgress, setApRenderProgress] = useState(0);
    const [latRenderProgress, setLatRenderProgress] = useState(0);
    const [scoutImageLoadState, setScoutImageLoadState] = useState<ScoutImageLoadState>("loading");
    const [apImageLoadState, setApImageLoadState] = useState<ScoutImageLoadState>("loading");
    const [latImageLoadState, setLatImageLoadState] = useState<ScoutImageLoadState>("loading");
    const [imageLoadAttempt, setImageLoadAttempt] = useState(0);
    const [executionError, setExecutionError] = useState<string | null>(null);
    const [isRecoveryActionRunning, setIsRecoveryActionRunning] = useState(false);
    const [triggerFailure, setTriggerFailure] = useState<{ title: string; message: string } | null>(null);
    const [postScoutScanType, setPostScoutScanType] = useState<PostScoutScanType>(
        () => resolvePostScoutScanTypeFromWorkflowPlans() ?? DEFAULT_POST_SCOUT_SCAN_TYPE
    );
    const [scanSession, setScanSession] = useState<ApiScanSessionDetail | null>(null);
    const [sessionAuthorityState, setSessionAuthorityState] = useState<"loading" | "session" | "fallback">("loading");
    const [gatingBreathingMode, setGatingBreathingMode] = useState<string | null>(null);
    const [limbsDicomManifest, setLimbsDicomManifest] = useState<LimbsDicomDemoManifest | null>(null);
    const [headDualScoutManifest, setHeadDualScoutManifest] = useState<HeadDualScoutManifest | null>(null);
    const [scoutManifestError, setScoutManifestError] = useState<string | null>(null);
    const [manifestLoadAttempt, setManifestLoadAttempt] = useState(0);
    const workflowPlans = useMemo(() => loadSelectedScanWorkflowPlans(), []);
    const thresholdGuard = useDoseThresholdGuard();
    const rafRef = useRef<number | null>(null);
    const holdStartRef = useRef<number | null>(null);
    const progressStartRef = useRef<number | null>(null);
    const exposureTimerRef = useRef<number | null>(null);
    const positioningTimerRef = useRef<number | null>(null);
    const positioningTimeoutRef = useRef<number | null>(null);
    const triggerRequestIdRef = useRef(0);
    const recoveryActionIdsRef = useRef<Map<string, string>>(new Map());
    const selectedPatient = useMemo(() => loadSelectedPatient(), []);

    const navigateToSeriesConfirmation = () => {
        const usesEmbeddedScoutConfirmation = scanSession?.acquisition_type === "four_d"
            || scanSession?.acquisition_type === "gating";
        const returnRoute = routeState?.returnRoute
            ?? (usesEmbeddedScoutConfirmation ? "/scout-scan" : "/scan-confirm");
        const returnStep = routeState?.returnStep
            ?? (returnRoute === "/scout-scan" ? 2 : undefined);
        navigate(returnRoute, {
            state: returnStep === undefined ? undefined : { activeStepIdx: returnStep },
        });
    };

    const clearHoldRaf = () => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };

    const clearPositioningTimeout = () => {
        if (positioningTimeoutRef.current !== null) {
            window.clearTimeout(positioningTimeoutRef.current);
            positioningTimeoutRef.current = null;
        }
    };

    const exitTriggerFlowWithFailure = (failure: { title: string; message: string }) => {
        triggerRequestIdRef.current += 1;
        clearHoldRaf();
        clearPositioningTimeout();
        if (positioningTimerRef.current !== null) {
            window.clearTimeout(positioningTimerRef.current);
            positioningTimerRef.current = null;
        }
        setShowCombinedPatientConfirm(false);
        setGuideVisible(false);
        setPhysicalTriggerAction("position");
        setStage("idle");
        setTriggerFailure(failure);
    };

    useEffect(() => {
        const handleDeviceError = (event: Event) => {
            const deviceError = (event as CustomEvent<DeviceErrorEvent>).detail;
            if (!deviceError || deviceError.error.severity === "warning") return;
            const selectedSessionId = loadSelectedScanSessionId();
            if (deviceError.scan_session_id !== null && deviceError.scan_session_id !== selectedSessionId) return;
            exitTriggerFlowWithFailure({
                title: `设备异常：${deviceError.error.code}`,
                message: `${deviceError.error.message}。当前模拟定位/曝光请求已停止，请按设备提示处理后重新尝试。`,
            });
        };
        window.addEventListener(DEVICE_ERROR_RAISED_EVENT, handleDeviceError);
        return () => window.removeEventListener(DEVICE_ERROR_RAISED_EVENT, handleDeviceError);
    });

    useEffect(() => {
        let cancelled = false;

        const workflowType = resolvePostScoutScanTypeFromWorkflowPlans();

        const resolveFromSession = async () => {
            try {
                const scanSession = await fetchSelectedScanSession({ preferCache: false });
                if (cancelled || !scanSession) {
                    if (workflowType) setPostScoutScanType(workflowType);
                    if (!cancelled) setSessionAuthorityState("fallback");
                    return;
                }
                setScanSession(scanSession);
                setSessionAuthorityState("session");

                const sessionType = resolvePostScoutScanTypeFromSession(scanSession);
                if (sessionType) setPostScoutScanType(sessionType);
                const nextSeries = [...scanSession.series]
                    .sort((left, right) => left.series_order - right.series_order)
                    .find((series) => series.series_type !== "topogram" && series.execution_status !== "image_ready");
                const cfg = (nextSeries as { gating_config?: { breathing_mode?: string } } | undefined)?.gating_config;
                setGatingBreathingMode(cfg?.breathing_mode ?? null);
            } catch (error) {
                console.error("Failed to resolve post-scout scan type.", error);
                if (!cancelled) {
                    setScanSession(null);
                    setSessionAuthorityState("fallback");
                    if (workflowType) setPostScoutScanType(workflowType);
                }
            }
        };

        void resolveFromSession();

        return () => {
            cancelled = true;
        };
    }, []);

    const postScoutAction = POST_SCOUT_SCAN_CONFIG[postScoutScanType];
    const hasResolvedSessionAuthority = sessionAuthorityState !== "loading";
    const isFourDScoutWorkflow = hasResolvedSessionAuthority && postScoutScanType === "4d";
    const isBrainHelicalScoutWorkflow = sessionAuthorityState === "session"
        ? isBrainHelicalScanSession(scanSession)
        : sessionAuthorityState === "fallback" && hasBrainHelicalWorkflow();
    const isLimbsHelicalScoutWorkflow = sessionAuthorityState === "session"
        ? isLimbsHelicalScanSession(scanSession)
        : sessionAuthorityState === "fallback" && hasLimbsHelicalWorkflow();
    const isHeadDualScoutFlow = sessionAuthorityState === "session"
        ? isHeadDualScoutSession(scanSession)
        : sessionAuthorityState === "fallback" && hasHeadDualScoutWorkflow();
    const scoutExecutionSeries = useMemo(
        () => selectScoutExecutionSeries(scanSession, isHeadDualScoutFlow),
        [isHeadDualScoutFlow, scanSession],
    );
    const limbsScoutExecuteSeries = useMemo<ScoutDicomSeries | null>(
        () => (limbsDicomManifest ? buildLimbsScoutExecuteSeries(limbsDicomManifest) : null),
        [limbsDicomManifest],
    );
    const headDualApSeries = useMemo<ScoutDicomSeries | null>(
        () => (headDualScoutManifest ? buildHeadDualScoutSeries(headDualScoutManifest, "scout-ap") : null),
        [headDualScoutManifest],
    );
    const headDualLatSeries = useMemo<ScoutDicomSeries | null>(
        () => (headDualScoutManifest ? buildHeadDualScoutSeries(headDualScoutManifest, "scout-lat") : null),
        [headDualScoutManifest],
    );
    const scoutResultSeries: ScoutDicomSeries | null = !hasResolvedSessionAuthority
        ? null
        : isFourDScoutWorkflow
        ? FOUR_D_SCOUT_SERIES
        : isBrainHelicalScoutWorkflow
            ? BRAIN_HELICAL_SCOUT_EXECUTE_SERIES
            : isLimbsHelicalScoutWorkflow
                ? limbsScoutExecuteSeries
                : isHeadDualScoutFlow
                    ? headDualApSeries
                    : SCOUT_SERIES;
    const scoutImageSourceId: ApiScanSeriesImageSourceId | null = !hasResolvedSessionAuthority
        ? null
        : isFourDScoutWorkflow
        ? "fourd-scout-demo"
        : isBrainHelicalScoutWorkflow
            ? "head-stroke-topogram"
            : isLimbsHelicalScoutWorkflow
                ? "limbs-helical-demo"
                : isHeadDualScoutFlow
                    ? "head-dual-scout-demo"
                    : "qin-lung-topogram";
    const scoutImageSourceReady = hasResolvedSessionAuthority && scoutImageSourceId !== null && (isLimbsHelicalScoutWorkflow
        ? limbsScoutExecuteSeries !== null
        : isHeadDualScoutFlow
            ? headDualApSeries !== null && headDualLatSeries !== null
            : true);
    const scoutTriggerReady = canStartScoutExecution(
        hasResolvedSessionAuthority,
        scoutImageSourceReady,
        scanSession !== null,
        scoutExecutionSeries.length,
        isHeadDualScoutFlow ? 2 : 1,
    );
    const currentProtocolName = sessionAuthorityState === "session"
        ? scanSession?.name ?? t("scanFlow.scout")
        : workflowPlans[0]?.title ?? scanSession?.name ?? t("scanFlow.scout");
    const currentScanSequenceName = (() => {
        for (const plan of workflowPlans) {
            const sequence = mergeDualScoutPlanSequences(plan).sequences.find((item) => item.type === "scout");
            if (sequence?.name) return sequence.name;
        }
        return t("scanFlow.scout");
    })();
    const patientConfirmScanData = useMemo(() => {
        const topogramParam = scanSession?.series.find((series) => series.series_type === "topogram" && series.topogram_param)?.topogram_param;
        const formatDose = (value: number | null | undefined) => value == null ? "--" : value.toFixed(2);

        return {
            ctdi: formatDose(topogramParam?.ctdi_vol),
            dlp: formatDose(topogramParam?.dlp),
            protocol: currentProtocolName,
            sequence: currentScanSequenceName,
        };
    }, [currentProtocolName, currentScanSequenceName, scanSession]);

    useEffect(() => {
        if (!isLimbsHelicalScoutWorkflow) return;
        let cancelled = false;
        loadLimbsDicomDemoManifest()
            .then((manifest) => {
                if (!cancelled) setLimbsDicomManifest(manifest);
            })
            .catch((error) => {
                console.error("Failed to load limbs DICOM demo manifest for scout execute.", error);
                if (!cancelled) {
                    setScoutManifestError(error instanceof Error ? error.message : "四肢定位像清单加载失败");
                    setScoutImageLoadState("error");
                }
            });
        return () => { cancelled = true; };
    }, [isLimbsHelicalScoutWorkflow, manifestLoadAttempt]);

    useEffect(() => {
        if (!isHeadDualScoutFlow) return;
        let cancelled = false;
        loadHeadDualScoutManifest()
            .then((manifest) => {
                if (!cancelled) setHeadDualScoutManifest(manifest);
            })
            .catch((error) => {
                console.error("Failed to load head dual scout manifest.", error);
                if (!cancelled) {
                    setScoutManifestError(error instanceof Error ? error.message : "头部双定位像清单加载失败");
                    setApImageLoadState("error");
                    setLatImageLoadState("error");
                }
            });
        return () => { cancelled = true; };
    }, [isHeadDualScoutFlow, manifestLoadAttempt]);

    const postScoutRoute = useMemo(() => {
        if ((postScoutScanType === "gated_helical" || postScoutScanType === "gated_axial") && gatingBreathingMode) {
            const sep = postScoutAction.route.includes("?") ? "&" : "?";
            return `${postScoutAction.route}${sep}breathingMode=${gatingBreathingMode}`;
        }
        return postScoutAction.route;
    }, [postScoutAction.route, postScoutScanType, gatingBreathingMode]);
    const postScoutActionLabel = t(postScoutAction.labelKey);

    useEffect(() => {
        if (stage !== "completed") return;

        // 定位像状态及影像来源已持久化后，立即进入下一序列的参数确认与范围框选。
        navigate(postScoutRoute, { replace: true });
    }, [navigate, postScoutRoute, stage]);

    const renderFinished = isHeadDualScoutFlow
        ? dualPhase === "done" && apRenderProgress >= 1 && latRenderProgress >= 1
        : renderProgress >= 1;
    const scoutImagesReady = isHeadDualScoutFlow
        ? apImageLoadState === "ready" && latImageLoadState === "ready"
        : scoutImageLoadState === "ready";
    const scoutImagesFailed = isHeadDualScoutFlow
        ? apImageLoadState === "error" || latImageLoadState === "error"
        : scoutImageLoadState === "error";

    useEffect(() => {
        if (stage !== "rendering" || !renderFinished) return;
        if (!scoutImagesReady && !scoutImagesFailed) return;
        let cancelled = false;

        const finish = async () => {
            const targetCountValid = !scanSession
                || scoutExecutionSeries.length === (isHeadDualScoutFlow ? 2 : 1);
            if (!scoutImagesReady || !scoutImageSourceReady || !scoutImageSourceId || !targetCountValid) {
                const message = scoutManifestError
                    ? `${t("scanFlow.scoutLoadError")}：${scoutManifestError}`
                    : !targetCountValid
                        ? "头部双定位会话缺少独立的 AP/LAT 定位像序列"
                        : t("scanFlow.scoutLoadError");
                await Promise.all(scoutExecutionSeries
                    .filter((series) => series.execution_status !== "image_ready")
                    .map((series) => (
                    updateScanSessionSeriesExecution(series.id, {
                        execution_status: "failed",
                        failure_reason: message,
                    }).catch(() => undefined)
                )));
                if (!cancelled) {
                    setExecutionError(message);
                    setStage("failed");
                }
                return;
            }

            try {
                for (const series of scoutExecutionSeries) {
                    if (series.execution_status === "image_ready") {
                        if (
                            series.image_source_id !== scoutImageSourceId
                            || series.image_source_version !== 1
                        ) {
                            throw new Error("已完成的定位像序列来源与本次双定位流程不匹配");
                        }
                        continue;
                    }
                    await updateScanSessionSeriesExecution(series.id, {
                        execution_status: "image_ready",
                        image_source_id: scoutImageSourceId,
                        image_source_version: 1,
                    });
                }
                if (!cancelled) setStage("completed");
            } catch (error) {
                if (!cancelled) {
                    setExecutionError(error instanceof Error ? error.message : t("scanFlow.scoutLoadError"));
                    setStage("failed");
                }
            }
        };
        void finish();
        return () => { cancelled = true; };
    }, [isHeadDualScoutFlow, renderFinished, scanSession, scoutExecutionSeries, scoutImageSourceId, scoutImageSourceReady, scoutImagesFailed, scoutImagesReady, scoutManifestError, stage, t]);

    useEffect(() => {
        if (stage !== "rendering" || !renderFinished || scoutImagesReady || scoutImagesFailed) return;
        const timer = window.setTimeout(() => {
            const message = t("scanFlow.scoutLoadError");
            scoutExecutionSeries
                .filter((series) => series.execution_status !== "image_ready")
                .forEach((series) => {
                void updateScanSessionSeriesExecution(series.id, {
                    execution_status: "failed",
                    failure_reason: message,
                }).catch(() => undefined);
            });
            setExecutionError(message);
            setStage("failed");
        }, 10000);
        return () => window.clearTimeout(timer);
    }, [renderFinished, scoutExecutionSeries, scoutImagesFailed, scoutImagesReady, stage, t]);

    useEffect(() => {
        return () => {
            clearHoldRaf();
            if (exposureTimerRef.current !== null) {
                window.clearTimeout(exposureTimerRef.current);
            }
            if (positioningTimerRef.current !== null) {
                window.clearTimeout(positioningTimerRef.current);
            }
            clearPositioningTimeout();
        };
    }, []);

    const runRenderAnimation = () => {
        progressStartRef.current = performance.now();

        const tick = (timestamp: number) => {
            const startedAt = progressStartRef.current ?? timestamp;
            const nextProgress = Math.min((timestamp - startedAt) / RENDER_DURATION_MS, 1);
            setRenderProgress(nextProgress);

            if (nextProgress < 1) {
                rafRef.current = requestAnimationFrame(tick);
                return;
            }

            rafRef.current = null;
            setRenderProgress(1);
        };

        rafRef.current = requestAnimationFrame(tick);
    };

    const runRampAnimation = (setter: (v: number) => void, durationMs: number, onDone: () => void) => {
        progressStartRef.current = performance.now();
        const tick = (timestamp: number) => {
            const startedAt = progressStartRef.current ?? timestamp;
            const next = Math.min((timestamp - startedAt) / durationMs, 1);
            setter(next);
            if (next < 1) {
                rafRef.current = requestAnimationFrame(tick);
                return;
            }
            rafRef.current = null;
            onDone();
        };
        rafRef.current = requestAnimationFrame(tick);
    };

    const performTriggerScanDual = async () => {
        const requestId = ++triggerRequestIdRef.current;
        const sessionId = loadSelectedScanSessionId();
        try {
            await Promise.race([
                (async () => {
                    if (sessionAuthorityState === "loading") throw new Error("正在核验当前扫描会话，请稍后重试");
                    if (!scoutTriggerReady) {
                        throw new Error(scoutManifestError || "定位像模拟影像来源尚未就绪，请等待加载完成后重试");
                    }
                    if (scanSession && scoutExecutionSeries.length !== 2) {
                        throw new Error("头部双定位会话缺少独立的 AP/LAT 定位像序列");
                    }
                    if (sessionId) await startScanSession(sessionId);
                    for (const series of scoutExecutionSeries) {
                        if (series.execution_status === "image_ready") continue;
                        await updateScanSessionSeriesExecution(series.id, { execution_status: "running" });
                    }
                })(),
                new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("扫描下发超时")), EXPOSURE_REQUEST_TIMEOUT_MS)),
            ]);
        } catch (error) {
            if (requestId !== triggerRequestIdRef.current) return;
            exitTriggerFlowWithFailure({ title: "扫描下发超时或失败", message: error instanceof Error ? error.message : t("scanFlow.scoutLoadError") });
            return;
        }
        if (requestId !== triggerRequestIdRef.current) return;
        clearHoldRaf();
        setShowCombinedPatientConfirm(false);
        setStage("enabled");
        setApRenderProgress(0);
        setLatRenderProgress(0);
        setDualPhase(null);

        window.setTimeout(() => {
            setStage("exposing");
            setGuideVisible(false);
            setDualPhase("ap_exposing");
        }, 180);

        exposureTimerRef.current = window.setTimeout(() => {
            setStage("rendering");
            setDualPhase("ap_rendering");
            runRampAnimation(setApRenderProgress, RENDER_DURATION_MS, () => {
                // AP done → rotate gantry → LAT
                setDualPhase("rotating");
                window.setTimeout(() => {
                    setStage("exposing");
                    setDualPhase("lat_exposing");
                    exposureTimerRef.current = window.setTimeout(() => {
                        setStage("rendering");
                        setDualPhase("lat_rendering");
                        runRampAnimation(setLatRenderProgress, RENDER_DURATION_MS, () => {
                            setDualPhase("done");
                            setStage("rendering");
                        });
                    }, EXPOSURE_DURATION_MS);
                }, GANTRY_ROTATION_DURATION_MS);
            });
        }, EXPOSURE_DURATION_MS);
    };

    const performTriggerScan = async () => {
        if (isHeadDualScoutFlow) {
            performTriggerScanDual();
            return;
        }
        const requestId = ++triggerRequestIdRef.current;
        const sessionId = loadSelectedScanSessionId();
        try {
            await Promise.race([
                (async () => {
                    if (sessionAuthorityState === "loading") throw new Error("正在核验当前扫描会话，请稍后重试");
                    if (!scoutTriggerReady) {
                        throw new Error(scoutManifestError || "定位像模拟影像来源尚未就绪，请等待加载完成后重试");
                    }
                    if (scanSession && scoutExecutionSeries.length !== 1) {
                        throw new Error("当前扫描会话缺少唯一的定位像执行序列");
                    }
                    if (sessionId) await startScanSession(sessionId);
                    for (const series of scoutExecutionSeries) {
                        if (series.execution_status === "image_ready") continue;
                        await updateScanSessionSeriesExecution(series.id, { execution_status: "running" });
                    }
                })(),
                new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("扫描下发超时")), EXPOSURE_REQUEST_TIMEOUT_MS)),
            ]);
        } catch (error) {
            if (requestId !== triggerRequestIdRef.current) return;
            exitTriggerFlowWithFailure({ title: "扫描下发超时或失败", message: error instanceof Error ? error.message : t("scanFlow.scoutLoadError") });
            return;
        }
        if (requestId !== triggerRequestIdRef.current) return;
        clearHoldRaf();
        setShowCombinedPatientConfirm(false);
        setStage("enabled");

        window.setTimeout(() => {
            setStage("exposing");
            setGuideVisible(false);
        }, 180);

        exposureTimerRef.current = window.setTimeout(() => {
            setStage("rendering");
            setRenderProgress(0);
            runRenderAnimation();
        }, EXPOSURE_DURATION_MS);
    };

    // Build threshold input from the current scout (topogram) series of the
    // active scan session. Demo: scan session carries body_part + age_group;
    // the topogram series may carry ctdi_vol/dlp from the protocol seed.
    const buildThresholdInput = () => {
        const topo = scanSession?.series.find((s) => s.series_type === "topogram");
        const param = topo?.topogram_param ?? null;
        return {
            body_part: scanSession?.body_part ?? null,
            age_group: scanSession?.age_group ?? null,
            ctdi_vol: param?.ctdi_vol ?? null,
            dlp: param?.dlp ?? null,
        };
    };

    const triggerPositioningSequence = () => {
        clearHoldRaf();
        clearPositioningTimeout();
        setPhysicalTriggerAction("exposure");
        setStage("positioned");
    };

    const triggerScanSequence = () => {
        clearHoldRaf();
        holdStartRef.current = null;
        setStage("positioned");
        thresholdGuard.guard(buildThresholdInput(), performTriggerScan);
    };

    const resetScoutExecutionUi = (intent: SeriesRecoveryIntent) => {
        resetLimbsDicomDemoManifestCache();
        resetHeadDualScoutManifestCache();
        setLimbsDicomManifest(null);
        setHeadDualScoutManifest(null);
        setScoutManifestError(null);
        setManifestLoadAttempt((attempt) => attempt + 1);
        setTriggerFailure(null);
        setExecutionError(null);
        setRenderProgress(0);
        setApRenderProgress(0);
        setLatRenderProgress(0);
        setDualPhase(null);
        setScoutImageLoadState("loading");
        setApImageLoadState("loading");
        setLatImageLoadState("loading");
        setPhysicalTriggerAction("position");
        setImageLoadAttempt((attempt) => attempt + 1);
        setStage("idle");
        // 重新尝试必须重新经过患者信息确认，再由“开始扫描”进入模拟物理按键引导。
        setShowCombinedPatientConfirm(intent === "physical_trigger");
        setGuideVisible(false);
    };

    const recoverScoutSeries = async (intent: SeriesRecoveryIntent) => {
        if (isRecoveryActionRunning) return;
        setIsRecoveryActionRunning(true);
        try {
            const latestSession = await fetchSelectedScanSession({ preferCache: false });
            if (latestSession) {
                const dualScout = isHeadDualScoutSession(latestSession);
                const targets = selectScoutExecutionSeries(latestSession, dualScout);
                if (dualScout && targets.length !== 2) {
                    throw new Error("头部双定位会话缺少独立的 AP/LAT 定位像序列");
                }
                let latest = latestSession;
                for (const target of targets) {
                    if (target.execution_status === "image_ready" && dualScout) continue;
                    const action = resolveSeriesRecoveryAction(target.execution_status, intent);
                    if (!action) continue;
                    const actionKey = `${action}:${target.id}`;
                    const actionId = recoveryActionIdsRef.current.get(actionKey) ?? createActionId();
                    recoveryActionIdsRef.current.set(actionKey, actionId);
                    const result = await applyScanWorkflowAction(latestSession.id, {
                        action_id: actionId,
                        action,
                        target_series_id: target.id,
                        reason: intent === "parameter_confirmation"
                            ? "User returned the simulated scout series to parameter confirmation"
                            : action === "retry_series"
                                ? "User requested another simulated scout attempt"
                                : "Recover an uncertain simulated scout trigger before retry",
                    });
                    recoveryActionIdsRef.current.delete(actionKey);
                    latest = result.scan_session;
                }
                setScanSession(latest);
            }
        } catch (error) {
            // 页面出口不依赖网络恢复结果；实际再次触发时仍由后端状态机校验并要求确认。
            console.error("Failed to synchronize scout recovery state before leaving the failure dialog", error);
        } finally {
            resetScoutExecutionUi(intent);
            if (intent === "parameter_confirmation") {
                navigateToSeriesConfirmation();
            }
            setIsRecoveryActionRunning(false);
        }
    };

    const handleExecuteScanClick = () => {
        if (stage === "failed") {
            void recoverScoutSeries("physical_trigger");
            return;
        }
        if (stage === "completed") {
            navigate(postScoutRoute);
            return;
        }

        if (stage === "idle" || stage === "positioned") {
            setGuideVisible(true);
        }
    };

    const startHold = () => {
        if ((!guideVisible && !showCombinedPatientConfirm) || stage === "positioning" || stage === "enabled" || stage === "exposing" || stage === "rendering" || stage === "completed") {
            return;
        }

        if (physicalTriggerAction === "exposure") {
            triggerScanSequence();
            return;
        }

        clearHoldRaf();
        holdStartRef.current = performance.now();
        setStage("positioning");
        clearPositioningTimeout();
        positioningTimeoutRef.current = window.setTimeout(() => {
            exitTriggerFlowWithFailure({ title: "定位移动超时", message: "未在预期时间内收到起始位到达结果，当前按键引导已关闭。" });
        }, POSITIONING_TIMEOUT_MS);

        const tick = (timestamp: number) => {
            const startedAt = holdStartRef.current ?? timestamp;
            const nextProgress = Math.min((timestamp - startedAt) / HOLD_DURATION_MS, 1);

            if (nextProgress >= 1) {
                triggerPositioningSequence();
                return;
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
    };

    const stopHold = () => {
        if (stage !== "positioning") {
            return;
        }

        clearHoldRaf();
        clearPositioningTimeout();
        holdStartRef.current = null;
        setStage("idle");
    };

    const guideTitle =
        stage === "positioning"
            ? t("scanFlow.physicalGuide.keepHoldingPosition")
            : stage === "positioned"
                    ? t("scanFlow.physicalGuide.pressAgainForExposure")
            : stage === "enabled"
                ? t("scanFlow.physicalGuide.enabled")
                : stage === "exposing"
                    ? t("scanFlow.physicalGuide.exposing")
                    : t("scanFlow.physicalGuide.holdGreenButton");

    const physicalTriggerSteps: PhysicalTriggerStep[] = [
        {
            id: "position",
            label: t("scanFlow.physicalGuide.stepPosition"),
            detail: t("scanFlow.physicalGuide.stepPositionDetail"),
            state: physicalTriggerAction === "position" && stage !== "completed" ? "active" : "done",
        },
        {
            id: "exposure",
            label: t("scanFlow.physicalGuide.stepExposure"),
            detail: t("scanFlow.physicalGuide.stepExposureDetail"),
            state:
                stage === "exposing" || stage === "rendering" || stage === "completed"
                    ? "done"
                    : physicalTriggerAction === "exposure"
                        ? "active"
                        : "pending",
        },
    ];

    const handleCombinedPatientClose = () => {
        clearHoldRaf();
        holdStartRef.current = null;
        navigateToSeriesConfirmation();
    };

    return (
        <div className="relative h-[768px] w-[1024px] overflow-hidden">
            <ScanConfirmScreen
                activeScoutStepIndex={isFourDScoutWorkflow ? (stage === "completed" ? 4 : 3) : (stage === "completed" ? 3 : 2)}
                forceFourDScoutWorkflow={isFourDScoutWorkflow}
                readOnlyMode
                onExecuteScan={handleExecuteScanClick}
                executeButtonLabel={stage === "completed" ? postScoutActionLabel : stage === "failed" ? t("common.retry") : t("scanFlow.executeScan")}
            />

            <ThresholdGuardModal
                {...thresholdGuard.modalProps}
                onContinue={thresholdGuard.confirm}
                onCancel={thresholdGuard.cancel}
            />

            <div className="pointer-events-none absolute bottom-[80px] left-[246px] right-0 top-[82px] z-20 overflow-hidden rounded-lg">
                <div className="flex h-full flex-col border border-white/5 bg-[#1A222B]">
                    <div className="relative flex-1 overflow-hidden bg-[#05080C]">
                        <div className={`absolute inset-0 transition-opacity duration-500 ${stage === "idle" || stage === "positioning" || stage === "positioned" || stage === "enabled" ? "opacity-100" : "opacity-0"}`}>
                            <div className="flex h-full items-center justify-center text-[42px] font-thin uppercase tracking-[8px] text-[#44515F]/55">
                                Viewport
                            </div>
                        </div>

                        <div className={`absolute inset-0 transition-opacity duration-500 ${(isHeadDualScoutFlow ? dualPhase !== null && dualPhase !== "ap_exposing" : (stage === "rendering" || stage === "completed")) ? "opacity-100" : "opacity-0"}`}>
                            {isHeadDualScoutFlow && headDualApSeries && headDualLatSeries ? (
                                <div className="grid h-full grid-cols-2 gap-[2px] bg-[#0A0F14]">
                                    <div className="relative overflow-hidden bg-black">
                                        <ScoutProjectionViewport
                                            key={`ap-${imageLoadAttempt}`}
                                            renderProgress={apRenderProgress}
                                            active={dualPhase === "ap_rendering" || dualPhase === "rotating" || dualPhase === "lat_exposing" || dualPhase === "lat_rendering" || dualPhase === "done"}
                                            series={headDualApSeries}
                                            onLoadStateChange={setApImageLoadState}
                                        />
                                        <div className="pointer-events-none absolute left-3 bottom-3 z-10 rounded border border-[#4D94FF]/40 bg-[#08111f]/85 px-2 py-1 text-[10px] font-black tracking-[0.12em] text-[#DBEAFE]">
                                            AP · 正位 0°{dualPhase === "ap_rendering" ? " · 采集中" : (dualPhase === "rotating" || dualPhase === "lat_exposing" || dualPhase === "lat_rendering" || dualPhase === "done") ? " · ✓" : ""}
                                        </div>
                                    </div>
                                    <div className="relative overflow-hidden bg-black">
                                        {dualPhase === "rotating" ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#05080C] text-[#9FB2C5]">
                                                <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#4D94FF]/30 border-t-[#4D94FF]" />
                                                <div className="text-[12px] font-bold tracking-[0.18em]">机架旋转 90°</div>
                                                <div className="text-[10px] text-[#6B7E91] tracking-[0.12em]">准备侧位采集 →</div>
                                            </div>
                                        ) : dualPhase === "lat_exposing" ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#05080C] text-[#FFD600]">
                                                <div className="text-[14px] font-black tracking-[0.18em]">LAT 曝光中</div>
                                                <div className="text-[10px] text-[#9FB2C5] tracking-[0.12em]">侧位采集 · 请勿移动患者</div>
                                            </div>
                                        ) : dualPhase === "lat_rendering" || dualPhase === "done" ? (
                                            <ScoutProjectionViewport
                                                key={`lat-${imageLoadAttempt}`}
                                                renderProgress={latRenderProgress}
                                                active={true}
                                                series={headDualLatSeries}
                                                onLoadStateChange={setLatImageLoadState}
                                            />
                                        ) : null}
                                        <div className="pointer-events-none absolute left-3 bottom-3 z-10 rounded border border-[#4D94FF]/40 bg-[#08111f]/85 px-2 py-1 text-[10px] font-black tracking-[0.12em] text-[#DBEAFE]">
                                            LAT · 侧位 90°{dualPhase === "lat_rendering" ? " · 采集中" : dualPhase === "done" ? " · ✓" : (dualPhase === "ap_rendering" || dualPhase === null) ? " · 等待" : ""}
                                        </div>
                                    </div>
                                </div>
                            ) : scoutResultSeries ? (
                                <ScoutProjectionViewport
                                    key={`single-${imageLoadAttempt}`}
                                    renderProgress={renderProgress}
                                    active={stage === "rendering" || stage === "completed"}
                                    series={scoutResultSeries}
                                    onLoadStateChange={setScoutImageLoadState}
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center bg-[#05080C] px-8 text-center text-[12px] font-bold text-[#9FB2C5]">
                                    {scoutManifestError
                                        ? `${t("scanFlow.scoutLoadError")}：${scoutManifestError}`
                                        : t("scanFlow.scoutLoadingData")}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {stage === "failed" && (
                <div className="pointer-events-none absolute bottom-[84px] left-[246px] right-0 top-[88px] z-30 flex items-center justify-center bg-[#05080C]/85">
                    <div className="max-w-[420px] rounded-lg border border-[#EF4444]/60 bg-[#1F1215] px-6 py-5 text-center text-[#FCA5A5] shadow-2xl">
                        <div className="text-[16px] font-black">{t("scanFlow.scoutLoadError")}</div>
                        <div className="mt-2 text-[12px] text-[#D1D9E1]">{executionError}</div>
                    </div>
                </div>
            )}

            <div className={`absolute bottom-[84px] right-0 top-[88px] z-40 flex items-stretch transition-all duration-500 ${guideVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
                <PhysicalTriggerGuide
                    title={t("scanFlow.physicalGuide.title")}
                    description={t("scanFlow.physicalGuide.twoStepDescription")}
                    guideTitle={guideTitle}
                    triggerLabel={t("scanFlow.physicalGuide.triggerLabel")}
                    emergencyLabel={t("scanFlow.physicalGuide.referenceEmergency")}
                    simulatedLabel={t("scanFlow.physicalGuide.referenceSimulated")}
                    steps={physicalTriggerSteps}
                    onHoldStart={startHold}
                    onHoldEnd={stopHold}
                    buttonActive={stage === "positioning" || stage === "enabled" || stage === "exposing"}
                />
            </div>

            <PatientConfirmationModal
                isOpen={showCombinedPatientConfirm}
                onClose={handleCombinedPatientClose}
                onConfirm={() => setShowCombinedPatientConfirm(false)}
                patientData={selectedPatient ? {
                    name: selectedPatient.name,
                    age: selectedPatient.age,
                    gender: selectedPatient.gender,
                    idNumber: "--",
                    patientId: selectedPatient.patientId,
                    checkType: currentScanSequenceName,
                    scanSequence: currentScanSequenceName,
                } : undefined}
                scanData={patientConfirmScanData}
                physicalGuide={{
                    title: t("scanFlow.physicalGuide.title"),
                    description: t("scanFlow.physicalGuide.twoStepDescription"),
                    guideTitle,
                    triggerLabel: t("scanFlow.physicalGuide.triggerLabel"),
                    emergencyLabel: t("scanFlow.physicalGuide.referenceEmergency"),
                    simulatedLabel: t("scanFlow.physicalGuide.referenceSimulated"),
                    steps: physicalTriggerSteps,
                    onHoldStart: startHold,
                    onHoldEnd: stopHold,
                    buttonActive: stage === "positioning" || stage === "enabled" || stage === "exposing",
                }}
            />
            <ScanTriggerFailureDialog
                failure={triggerFailure}
                busy={isRecoveryActionRunning}
                onRetry={() => { void recoverScoutSeries("physical_trigger"); }}
                onReturnToConfirm={() => { void recoverScoutSeries("parameter_confirmation"); }}
            />
        </div>
    );
}
