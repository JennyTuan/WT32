import { useEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DicomViewer from "../components/DicomViewer";
import GatingMonitorPanel from "../components/GatingMonitorPanel";
import GatingWaveformPanel from "../components/GatingWaveformPanel";
import DibhStatusRow from "../components/DibhStatusRow";
import { useBreathHoldStateMachine, type BreathHoldStage } from "../components/BreathHoldGuide";
import { fetchSelectedScanSession, loadSelectedScanSessionId, startScanSession, completeScanSession, cancelScanSession } from "../lib/scanSession";
import { FourDScoutViewport } from "./HelicalScanConfirmScreen";
import { getLimbsDicomSeries, isLimbsHelicalScanSession, loadLimbsDicomDemoManifest } from "../lib/limbsDicomDemo";
import { useI18n } from "../lib/i18nContext";

type HelicalResultSeriesConfig = {
    basePath?: string;
    count: number;
    fallbackWindowWidth: number;
    fallbackWindowLevel: number;
    urls?: string[];
};

// Demo dataset for the "脑部螺旋" (brain helical, non-gating) protocol — JPEG Lossless
// Thin Brain reconstruction (219 slices). Used only when executeMode === "helical"
// AND the active protocol ID matches; gated_helical / gated_axial paths are
// untouched and keep using HELICAL_RESULT_SERIES.
const BRAIN_HELICAL_RESULT_SERIES: HelicalResultSeriesConfig = {
    basePath: "/dicom-out/HeadStrokeDemo/ThinBrain",
    count: 219,
    fallbackWindowWidth: 100,
    fallbackWindowLevel: 35,
};

import ScanConfirmScreen from "./ScanConfirmScreen";

type ScanStage = "idle" | "arming" | "enabled" | "exposing" | "paused" | "rendering" | "completed";
type ExecuteMode = "helical" | "gated_helical" | "gated_axial";

const HOLD_DURATION_MS = 3000;
const EXPOSURE_DURATION_MS = 1500;
const RENDER_DURATION_MS = 1600;
const LIVE_FRAME_INTERVAL_MS = 85;
const AUTO_NAVIGATE_DELAY_MS = 700;
const GATED_AXIAL_BED_STEP_MM = 19.2;
const GATED_AXIAL_SLICES_PER_BED = 16;
const GATED_AXIAL_BREATH_CYCLE_MS = 1800;
const GATED_AXIAL_SLICE_INTERVAL_MS = GATED_AXIAL_BREATH_CYCLE_MS / GATED_AXIAL_SLICES_PER_BED;
const GATED_AXIAL_STABILITY_WAIT_MS = [1800, 2600, 1400, 2200];
// Demo-shortened wait_timeout (real default per CONTEXT: 30s). When no valid
// threshold-cross / stable signal arrives within this window the scan must
// pause and hand control back to the technician.
const GATED_AXIAL_WAIT_TIMEOUT_MS = 6000;
// In a fresh gated_axial demo run, force the 2nd bed's first attempt to time
// out so the technician-intervention branch is shown.
const GATED_AXIAL_TIMEOUT_DEMO_BED_INDEX = 1;
const GATED_AXIAL_TIMEOUT_DEMO_UNREACHABLE_WAIT_MS = GATED_AXIAL_WAIT_TIMEOUT_MS + 4000;
// Mock value applied when technician chooses "临时降阈值" in the timeout dialog.
const GATED_AXIAL_LOWERED_THRESHOLD = 0.7;

// ── DIBH (gated helical breath-hold) demo timings ───────────────────────────
// Real wait_timeout is 25 s; for demo we let the *failure* attempt time out
// in 4 s so the abort branch is fast to see. The success attempt keeps a
// generous 25 s ceiling — the parent disarms the guide once exposure finishes
// well before that.
const DIBH_FAILURE_TIMEOUT_S = 4;
const DIBH_SUCCESS_TIMEOUT_S = 25;
// Exposure runs inside the breath hold. Real DIBH helical lasts ~5-10 s; we
// pick 4.5 s so the demo doesn't drag.
const DIBH_EXPOSURE_DURATION_MS = 4500;
const DIBH_MID_SCAN_PAUSE_PROGRESS = 0.52;
const HELICAL_RESULT_SERIES: HelicalResultSeriesConfig = {
    basePath: "/dicom/QIN LUNG CT/QIN-LUNG-01-0007/01-12-2000-1-CT Thorax wContrast-47252/2.000000-THORAX W  3.0 B41 Soft Tissue-52055",
    count: 118,
    fallbackWindowWidth: 350,
    fallbackWindowLevel: 45,
};

function HelicalExecuteIdleViewport({ isGated }: { isGated: boolean }) {
    const { t } = useI18n();
    return (
        <div className="relative h-full w-full overflow-hidden bg-black">
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-[14px] font-semibold tracking-[0.28em] text-[#7E8CA0]">LIVE VIEW</div>
                    <div className="mt-3 text-[12px] text-[#566474]">
                        {isGated ? t("scanFlow.live.gatedInstruction") : t("scanFlow.live.helicalInstruction")}
                    </div>
                </div>
            </div>
        </div>
    );
}

function HelicalLiveViewport({
    playbackActive,
    seriesOverride,
}: {
    playbackActive: boolean;
    seriesOverride?: HelicalResultSeriesConfig;
}) {
    const series = seriesOverride ?? HELICAL_RESULT_SERIES;
    const useOverride = !!seriesOverride;
    const imageUrls = useMemo(
        () => {
            if (series.urls?.length) return series.urls;
            if (!series.basePath) return [];
            return (
            Array.from({ length: series.count }, (_, index) => {
                const name = useOverride
                    ? `image-${String(index + 1).padStart(3, "0")}.dcm`
                    : `1-${String(index + 1).padStart(3, "0")}.dcm`;
                return `${series.basePath}/${name}`;
            })
            );
        },
        [series.basePath, series.count, series.urls, useOverride],
    );
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    useEffect(() => {
        if (!playbackActive) return;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrentImageIndex(0);
        const timer = window.setInterval(() => {
            setCurrentImageIndex((prev) => {
                if (prev >= imageUrls.length - 1) {
                    window.clearInterval(timer);
                    return prev;
                }
                return prev + 1;
            });
        }, LIVE_FRAME_INTERVAL_MS);

        return () => {
            window.clearInterval(timer);
        };
    }, [imageUrls.length, playbackActive]);

    return (
        <div className="relative h-full w-full overflow-hidden bg-black">
            <DicomViewer
                key={series.basePath}
                imageUrls={imageUrls}
                currentImageIndex={currentImageIndex}
                onImageIndexChange={setCurrentImageIndex}
                activeTool="pan"
                windowCenter={series.fallbackWindowLevel}
                windowWidth={series.fallbackWindowWidth}
            />
        </div>
    );
}

function AxialRealtimeViewport({
    stage,
    completedBeds,
    currentSlice,
    totalBeds,
    threshold,
    direction,
    waitingForBreath,
    waitElapsedMs = 0,
    waitTimeoutMs,
    waitTimedOut = false,
}: {
    stage: ScanStage;
    completedBeds: number;
    currentSlice: number;
    totalBeds: number;
    threshold: number;
    direction: "rising" | "falling";
    waitingForBreath?: boolean;
    waitElapsedMs?: number;
    waitTimeoutMs?: number;
    waitTimedOut?: boolean;
}) {
    const { t } = useI18n();
    const imageUrls = useMemo(
        () =>
            Array.from(
                { length: HELICAL_RESULT_SERIES.count },
                (_, index) => `${HELICAL_RESULT_SERIES.basePath}/1-${String(index + 1).padStart(3, "0")}.dcm`
            ),
        []
    );
    const currentBedNumber = Math.min(
        completedBeds + (stage === "completed" ? 0 : 1),
        totalBeds || 1
    );
    const completedImages = completedBeds * GATED_AXIAL_SLICES_PER_BED + currentSlice;
    const totalImages = Math.max(1, totalBeds * GATED_AXIAL_SLICES_PER_BED);
    const progress = Math.min(completedImages / totalImages, 1);
    const scanActive = stage === "enabled" || stage === "exposing" || stage === "rendering";
    const showDicom = stage === "exposing" || stage === "rendering" || stage === "completed";
    const activeBedForImage = completedBeds + 1;
    const displayIndex = Math.min(
        imageUrls.length - 1,
        Math.max(0, (((activeBedForImage - 1) * GATED_AXIAL_SLICES_PER_BED) + Math.max(0, currentSlice - 1)) % imageUrls.length)
    );
    const displayBed = currentBedNumber;

    return (
        <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
                <div className="absolute left-4 top-3 z-20 rounded border border-white/10 bg-black/60 px-3 py-2 text-white shadow-lg">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">AXIAL LIVE</div>
                    <div className="mt-1 text-[12px] font-bold">
                        {stage === "completed"
                            ? t("scanFlow.live.completed")
                            : waitTimedOut
                                ? t("scanFlow.live.waitingTechnician")
                                : waitingForBreath
                                    ? t("scanFlow.live.waitingBreath")
                                    : scanActive
                                        ? t("scanFlow.live.liveAcquiring")
                                        : t("scanFlow.live.waitingPhysical")}
                    </div>
                </div>

                {showDicom ? (
                    <div className="absolute inset-0">
                        <DicomViewer
                            imageUrls={imageUrls}
                            currentImageIndex={displayIndex}
                            activeTool="pan"
                            windowCenter={HELICAL_RESULT_SERIES.fallbackWindowLevel}
                            windowWidth={HELICAL_RESULT_SERIES.fallbackWindowWidth}
                        />
                    </div>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                        <div className="text-center">
                            <div className="text-[14px] font-semibold tracking-[0.28em] text-[#64748B]">AXIAL LIVE</div>
                            <div className="mt-3 text-[12px] text-[#475569]">
                                {waitTimedOut
                                    ? t("scanFlow.live.longBreathWait")
                                    : waitingForBreath
                                        ? waitTimeoutMs
                                            ? t("scanFlow.live.waitingBreathWindowTimed", { elapsed: (waitElapsedMs / 1000).toFixed(1), timeout: (waitTimeoutMs / 1000).toFixed(0) })
                                            : t("scanFlow.live.waitingBreathWindow")
                                        : t("scanFlow.live.waitingPhysicalTrigger")}
                            </div>
                        </div>
                    </div>
                )}

                <div className="absolute bottom-4 left-4 right-4">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                        <span>
                            {t("scanFlow.live.tablePosition")} {displayBed} / {totalBeds || 1}
                            <span className="ml-3 text-slate-400">Slice {stage === "completed" ? GATED_AXIAL_SLICES_PER_BED : Math.max(1, currentSlice)} / {GATED_AXIAL_SLICES_PER_BED}</span>
                        </span>
                        <span>{Math.round(progress * 100)}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,#38BDF8,#22C55E)] transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
                    </div>
                </div>
            </div>
            <div className="h-[178px] shrink-0 border-t border-[#B0C4DE]/70">
                <GatingMonitorPanel
                    threshold={threshold}
                    direction={direction}
                    bedStrip={{
                        total: totalBeds,
                        completed: completedBeds,
                    }}
                    scanActive={scanActive && completedBeds < totalBeds}
                    exposing={stage === "exposing"}
                    bedPhase={currentSlice / GATED_AXIAL_SLICES_PER_BED}
                    waitingForStableBreath={waitingForBreath}
                    showScanMarkers={false}
                    readOnly
                />
            </div>
        </div>
    );
}

export default function HelicalExecuteScanScreen() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const [params] = useSearchParams();
    const executeMode = (params.get("mode") ?? "helical") as ExecuteMode;
    const isGated = executeMode === "gated_helical" || executeMode === "gated_axial";
    const isGatedAxial = executeMode === "gated_axial";
    const isHelicalDIBH = executeMode === "gated_helical";

    const [limbsHelicalResultSeries, setLimbsHelicalResultSeries] = useState<HelicalResultSeriesConfig | null>(null);

    // Regular (non-gated) helical execution plays protocol-specific demo data
    // when available. Gated paths intentionally keep their own result series.
    const helicalResultOverride = useMemo<HelicalResultSeriesConfig | undefined>(() => {
        if (executeMode !== "helical") return undefined;
        if (limbsHelicalResultSeries) return limbsHelicalResultSeries;
        return BRAIN_HELICAL_RESULT_SERIES;
    }, [executeMode, limbsHelicalResultSeries]);
    const [stage, setStage] = useState<ScanStage>("idle");
    const [holdProgress, setHoldProgress] = useState(0);
    const [guideVisible, setGuideVisible] = useState(true);
    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });
    const [completedBeds, setCompletedBeds] = useState(0);
    const [currentSlice, setCurrentSlice] = useState(0);
    const [axialWaitingForBreath, setAxialWaitingForBreath] = useState(false);
    const [pendingBedIndex, setPendingBedIndex] = useState<number | null>(null);
    const [bedWaitElapsedMs, setBedWaitElapsedMs] = useState(0);
    const [bedWaitTimedOut, setBedWaitTimedOut] = useState(false);
    const [activeThresholdOverride, setActiveThresholdOverride] = useState<number | null>(null);
    const [thresholdLowered, setThresholdLowered] = useState(false);
    // DIBH (gated helical breath-hold) state. armed drives the BreathHoldGuide;
    // attempt 0 = first try (forced to abort for demo); attempt ≥ 1 = retry,
    // proceeds normally. timedOut shows the technician-intervention modal.
    const [dibhArmed, setDibhArmed] = useState(false);
    const [dibhAttempt, setDibhAttempt] = useState(0);
    const [dibhStage, setDibhStage] = useState<BreathHoldStage>("idle");
    const [dibhTimedOut, setDibhTimedOut] = useState(false);
    const [dibhMidScanPaused, setDibhMidScanPaused] = useState(false);
    // Tracks 0..1 fraction of DIBH helical exposure elapsed; drives the
    // bed-strip progress fill while the gate is open.
    const [dibhExposureProgress, setDibhExposureProgress] = useState(0);
    const rafRef = useRef<number | null>(null);
    const holdStartRef = useRef<number | null>(null);
    const progressStartRef = useRef<number | null>(null);
    const exposureTimerRef = useRef<number | null>(null);
    const dibhMidScanPauseTimerRef = useRef<number | null>(null);
    const axialProgressTimerRef = useRef<number | null>(null);
    const axialWaitTimerRef = useRef<number | null>(null);
    const autoNavigateTimerRef = useRef<number | null>(null);
    const bedWaitTickRef = useRef<number | null>(null);
    const bedWaitStartRef = useRef<number | null>(null);
    const pendingBedIndexRef = useRef<number | null>(null);
    const bedAttemptsRef = useRef<Map<number, number>>(new Map());
    const dibhMidScanPauseFiredRef = useRef(false);

    const scanLengthMm = Number(params.get("scanLengthMm") ?? measurements.scanLength);
    const totalBeds = useMemo(() => {
        if (!Number.isFinite(scanLengthMm) || scanLengthMm <= 0) return 1;
        return Math.max(1, Math.ceil(scanLengthMm / GATED_AXIAL_BED_STEP_MM));
    }, [scanLengthMm]);
    const threshold = Number(params.get("threshold") ?? "1.0");
    const direction = (params.get("direction") ?? "rising") as "rising" | "falling";
    const effectiveThreshold = activeThresholdOverride ?? threshold;

    const clearHoldRaf = () => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };

    const clearDibhTimers = () => {
        if (exposureTimerRef.current !== null) {
            window.clearTimeout(exposureTimerRef.current);
            exposureTimerRef.current = null;
        }
        if (dibhMidScanPauseTimerRef.current !== null) {
            window.clearTimeout(dibhMidScanPauseTimerRef.current);
            dibhMidScanPauseTimerRef.current = null;
        }
    };

    useEffect(() => {
        let cancelled = false;

        const loadSessionMeasurements = async () => {
            try {
                const scanSession = await fetchSelectedScanSession();
                if (executeMode === "helical" && isLimbsHelicalScanSession(scanSession)) {
                    const manifest = await loadLimbsDicomDemoManifest();
                    const liveSeries = getLimbsDicomSeries(manifest, "thin-soft");
                    if (!cancelled && liveSeries) {
                        setLimbsHelicalResultSeries({
                            count: liveSeries.count,
                            urls: liveSeries.urls,
                            fallbackWindowWidth: liveSeries.windowWidth ?? manifest.defaultWindowWidth,
                            fallbackWindowLevel: liveSeries.windowCenter ?? manifest.defaultWindowLevel,
                        });
                    }
                }

                if (isGatedAxial) {
                    const axialParam = scanSession?.series.find((series) => series.series_type === "axial")?.axial_param;
                    if (!axialParam || cancelled) return;

                    setMeasurements({
                        scanLength: params.get("scanLengthMm") ?? String(axialParam.scan_length),
                        scoutFov: params.get("scoutFov") ?? String(axialParam.fov),
                    });
                    return;
                }

                const helicalParam = scanSession?.series.find((series) => series.series_type === "helical")?.helical_param;
                if (!helicalParam || cancelled) return;

                setMeasurements({
                    scanLength: String(helicalParam.scan_length),
                    scoutFov: String(helicalParam.fov),
                });
            } catch (error) {
                console.error("Failed to load helical execute parameters.", error);
            }
        };

        void loadSessionMeasurements();

        return () => {
            cancelled = true;
        };
    }, [executeMode, isGatedAxial, params]);

    // DIBH exposure progress: starts at 0 when exposure begins, climbs to 1
    // over DIBH_EXPOSURE_DURATION_MS, then stays at 1 through rendering /
    // completed (so the bed strip stays filled until auto-navigation). Resets
    // to 0 whenever we leave the exposing/rendering/completed cluster.
    useEffect(() => {
        if (!isHelicalDIBH) return;
        if (stage === "exposing") {
            const start = performance.now();
            const id = window.setInterval(() => {
                const p = Math.min(1, (performance.now() - start) / DIBH_EXPOSURE_DURATION_MS);
                setDibhExposureProgress(p);
                if (p >= 1) window.clearInterval(id);
            }, 100);
            return () => window.clearInterval(id);
        }
    }, [stage, isHelicalDIBH]);

    useEffect(() => {
        if (stage !== "completed") return;

        const sessionId = loadSelectedScanSessionId();
        if (sessionId) void completeScanSession(sessionId);

        autoNavigateTimerRef.current = window.setTimeout(() => {
            navigate("/image-viewer");
        }, AUTO_NAVIGATE_DELAY_MS);

        return () => {
            if (autoNavigateTimerRef.current !== null) {
                window.clearTimeout(autoNavigateTimerRef.current);
                autoNavigateTimerRef.current = null;
            }
        };
    }, [navigate, stage]);

    useEffect(() => {
        return () => {
            clearHoldRaf();
            clearDibhTimers();
            if (axialProgressTimerRef.current !== null) {
                window.clearInterval(axialProgressTimerRef.current);
            }
            if (axialWaitTimerRef.current !== null) {
                window.clearTimeout(axialWaitTimerRef.current);
            }
            if (autoNavigateTimerRef.current !== null) {
                window.clearTimeout(autoNavigateTimerRef.current);
            }
            if (bedWaitTickRef.current !== null) {
                window.clearInterval(bedWaitTickRef.current);
            }
        };
    }, []);

    const runRenderAnimation = () => {
        progressStartRef.current = performance.now();

        const tick = (timestamp: number) => {
            const startedAt = progressStartRef.current ?? timestamp;
            const nextProgress = Math.min((timestamp - startedAt) / RENDER_DURATION_MS, 1);
            if (nextProgress < 1) {
                rafRef.current = requestAnimationFrame(tick);
                return;
            }
            rafRef.current = null;
            setStage("completed");
        };

        rafRef.current = requestAnimationFrame(tick);
    };

    const stopBedWaitTick = () => {
        if (bedWaitTickRef.current !== null) {
            window.clearInterval(bedWaitTickRef.current);
            bedWaitTickRef.current = null;
        }
        bedWaitStartRef.current = null;
    };

    const axialTargetBedCount = totalBeds;

    const beginBedExposure = () => {
        if (axialProgressTimerRef.current !== null) {
            window.clearInterval(axialProgressTimerRef.current);
        }

        axialProgressTimerRef.current = window.setInterval(() => {
            setCurrentSlice((prevSlice) => {
                const nextSlice = prevSlice + 1;
                if (nextSlice < GATED_AXIAL_SLICES_PER_BED) {
                    return nextSlice;
                }

                setCompletedBeds((prevBed) => {
                    const nextBed = Math.min(axialTargetBedCount, prevBed + 1);
                    setCurrentSlice(0);
                    if (nextBed >= axialTargetBedCount) {
                        if (axialProgressTimerRef.current !== null) {
                            window.clearInterval(axialProgressTimerRef.current);
                            axialProgressTimerRef.current = null;
                        }
                        setAxialWaitingForBreath(false);
                        setStage("rendering");
                        window.setTimeout(() => setStage("completed"), 500);
                    } else {
                        if (axialProgressTimerRef.current !== null) {
                            window.clearInterval(axialProgressTimerRef.current);
                            axialProgressTimerRef.current = null;
                        }
                        window.setTimeout(() => scheduleBedExposure(nextBed), 180);
                    }
                    return nextBed;
                });
                return 0;
            });
        }, GATED_AXIAL_SLICE_INTERVAL_MS);
    };

    const scheduleBedExposure = (targetIndex: number) => {
        // Clear any stale timers from a previous attempt at this or another bed.
        if (axialWaitTimerRef.current !== null) {
            window.clearTimeout(axialWaitTimerRef.current);
            axialWaitTimerRef.current = null;
        }
        stopBedWaitTick();

        setStage("enabled");
        setAxialWaitingForBreath(true);
        setBedWaitTimedOut(false);
        setBedWaitElapsedMs(0);
        setCurrentSlice(0);
        pendingBedIndexRef.current = targetIndex;
        setPendingBedIndex(targetIndex);

        const attemptCount = bedAttemptsRef.current.get(targetIndex) ?? 0;
        // Demo branch: on a fresh run, the 2nd bed's first attempt never receives
        // a valid threshold-cross within wait_timeout → forces the technician
        // intervention dialog. Retries always succeed.
        const isDemoTimeoutBed =
            targetIndex === GATED_AXIAL_TIMEOUT_DEMO_BED_INDEX &&
            attemptCount === 0;
        const triggerWaitMs = isDemoTimeoutBed
            ? GATED_AXIAL_TIMEOUT_DEMO_UNREACHABLE_WAIT_MS
            : GATED_AXIAL_STABILITY_WAIT_MS[targetIndex % GATED_AXIAL_STABILITY_WAIT_MS.length];

        bedWaitStartRef.current = performance.now();

        // Trigger-arrival timer (fires when a valid gating event is detected).
        axialWaitTimerRef.current = window.setTimeout(() => {
            axialWaitTimerRef.current = null;
            stopBedWaitTick();
            setBedWaitElapsedMs(0);
            setAxialWaitingForBreath(false);
            setBedWaitTimedOut(false);
            setStage("exposing");
            setGuideVisible(false);
            beginBedExposure();
        }, triggerWaitMs);

        // Elapsed + wait_timeout watcher.
        bedWaitTickRef.current = window.setInterval(() => {
            const startedAt = bedWaitStartRef.current;
            if (startedAt === null) return;
            const elapsed = performance.now() - startedAt;
            setBedWaitElapsedMs(elapsed);
            if (elapsed >= GATED_AXIAL_WAIT_TIMEOUT_MS) {
                if (axialWaitTimerRef.current !== null) {
                    window.clearTimeout(axialWaitTimerRef.current);
                    axialWaitTimerRef.current = null;
                }
                stopBedWaitTick();
                setBedWaitTimedOut(true);
            }
        }, 100);
    };

    const handleTimeoutRetry = () => {
        const targetIndex = pendingBedIndexRef.current;
        if (targetIndex === null) return;
        const prev = bedAttemptsRef.current.get(targetIndex) ?? 0;
        bedAttemptsRef.current.set(targetIndex, prev + 1);
        scheduleBedExposure(targetIndex);
    };

    const handleTimeoutLowerThreshold = () => {
        setActiveThresholdOverride(GATED_AXIAL_LOWERED_THRESHOLD);
        setThresholdLowered(true);
        handleTimeoutRetry();
    };

    const handleTimeoutAbort = () => {
        if (axialWaitTimerRef.current !== null) {
            window.clearTimeout(axialWaitTimerRef.current);
            axialWaitTimerRef.current = null;
        }
        if (axialProgressTimerRef.current !== null) {
            window.clearInterval(axialProgressTimerRef.current);
            axialProgressTimerRef.current = null;
        }
        stopBedWaitTick();
        setBedWaitTimedOut(false);
        setAxialWaitingForBreath(false);
        setPendingBedIndex(null);
        setStage("idle");
        const sessionId = loadSelectedScanSessionId();
        if (sessionId) void cancelScanSession(sessionId);
        navigate("/gated-axial-confirm");
    };

    const triggerScanSequence = () => {
        const sessionId = loadSelectedScanSessionId();
        if (sessionId) void startScanSession(sessionId);
        clearHoldRaf();
        setHoldProgress(1);
        setStage("enabled");
        setCompletedBeds(0);
        setCurrentSlice(0);
        setAxialWaitingForBreath(false);
        setBedWaitTimedOut(false);
        setBedWaitElapsedMs(0);
        setPendingBedIndex(null);

        if (isGatedAxial) {
            // Fresh run resets per-bed attempt history and any threshold override.
            bedAttemptsRef.current = new Map();
            setActiveThresholdOverride(null);
            setThresholdLowered(false);

            if (axialProgressTimerRef.current !== null) {
                window.clearInterval(axialProgressTimerRef.current);
            }
            if (axialWaitTimerRef.current !== null) {
                window.clearTimeout(axialWaitTimerRef.current);
                axialWaitTimerRef.current = null;
            }
            stopBedWaitTick();

            scheduleBedExposure(0);
            return;
        }

        if (isHelicalDIBH) {
            // Fresh DIBH run: reset attempt counter and arm the BreathHoldGuide.
            // The guide's onStableHold / onAbort callbacks drive the rest of
            // the state machine — we don't time anything from here.
            clearDibhTimers();
            dibhMidScanPauseFiredRef.current = false;
            setDibhAttempt(0);
            setDibhTimedOut(false);
            setDibhMidScanPaused(false);
            setDibhExposureProgress(0);
            setDibhStage("idle");
            setGuideVisible(false);
            // Brief flicker so the guide's useEffect rebuilds cleanly even
            // when re-arming within the same component instance.
            setDibhArmed(false);
            window.setTimeout(() => setDibhArmed(true), 30);
            return;
        }

        window.setTimeout(() => {
            setStage("exposing");
            setGuideVisible(false);
        }, 180);

        exposureTimerRef.current = window.setTimeout(() => {
            setStage("rendering");
            runRenderAnimation();
        }, EXPOSURE_DURATION_MS);
    };

    // ─── DIBH callbacks (helical gated breath-hold) ────────────────────────
    // BreathHoldGuide drives countdown → holding → stable; once stable we
    // start the (mocked) exposure timer. Failure path: guide stays in
    // `holding` for DIBH_FAILURE_TIMEOUT_S then fires onAbort.
    const handleDibhStableHold = () => {
        // Defensive: guide can briefly emit stable as state flips; ignore if
        // we are already past the breath-hold phase or in a failure attempt.
        if (!isHelicalDIBH || dibhTimedOut) return;
        if (stage === "exposing" || stage === "rendering" || stage === "completed") return;
        setDibhExposureProgress(0);
        setStage("exposing");
        clearDibhTimers();
        if (!dibhMidScanPauseFiredRef.current) {
            dibhMidScanPauseTimerRef.current = window.setTimeout(() => {
                dibhMidScanPauseFiredRef.current = true;
                clearDibhTimers();
                setDibhArmed(false);
                setDibhExposureProgress(DIBH_MID_SCAN_PAUSE_PROGRESS);
                setDibhMidScanPaused(true);
                setStage("paused");
            }, DIBH_EXPOSURE_DURATION_MS * DIBH_MID_SCAN_PAUSE_PROGRESS);
        }
        exposureTimerRef.current = window.setTimeout(() => {
            // End of exposure: release the breath hold visual and proceed.
            setDibhArmed(false);
            setDibhExposureProgress(1);
            setStage("rendering");
            runRenderAnimation();
        }, DIBH_EXPOSURE_DURATION_MS);
    };

    const handleDibhAbort = () => {
        if (!isHelicalDIBH) return;
        // First attempt: surface the technician dialog. We do NOT auto-retry.
        clearDibhTimers();
        setDibhArmed(false);
        setDibhTimedOut(true);
    };

    const handleDibhRetry = () => {
        clearDibhTimers();
        setDibhTimedOut(false);
        setDibhMidScanPaused(false);
        setDibhExposureProgress(0);
        setDibhAttempt((prev) => prev + 1);
        setDibhStage("idle");
        // Flicker armed so the guide's internal state resets cleanly.
        setDibhArmed(false);
        window.setTimeout(() => setDibhArmed(true), 30);
    };

    const handleDibhAbortScan = () => {
        clearDibhTimers();
        setDibhArmed(false);
        setDibhTimedOut(false);
        setDibhMidScanPaused(false);
        setDibhStage("idle");
        setStage("idle");
        setHoldProgress(0);
        setDibhExposureProgress(0);
        setGuideVisible(true);
        const sessionId = loadSelectedScanSessionId();
        if (sessionId) void cancelScanSession(sessionId);
        navigate("/gated-helical-confirm");
    };

    const handleDibhRestartFromPause = (savePartialData: boolean) => {
        clearDibhTimers();
        const interruptedAtPercent = Math.round(DIBH_MID_SCAN_PAUSE_PROGRESS * 100);
        sessionStorage.setItem(
            "dibhInterruptedHelicalRestart",
            JSON.stringify({
                savedPartialData: savePartialData,
                interruptedAtPercent,
                createdAt: new Date().toISOString(),
            }),
        );
        setDibhArmed(false);
        setDibhTimedOut(false);
        setDibhMidScanPaused(false);
        setDibhStage("idle");
        setStage("idle");
        setHoldProgress(0);
        setDibhExposureProgress(0);
        setGuideVisible(true);
        const sessionId = loadSelectedScanSessionId();
        if (sessionId) void cancelScanSession(sessionId);
        navigate("/gated-helical-confirm");
    };

    // DIBH state machine — drives the compact status row + waveform overlay
    // below. Same machine that BreathHoldGuide uses; we consume the raw state
    // here because the execute screen has a different (tighter) layout than
    // the confirm screens.
    const dibhTimeoutSeconds = dibhAttempt === 0 ? DIBH_FAILURE_TIMEOUT_S : DIBH_SUCCESS_TIMEOUT_S;
    const { countdown: dibhCountdown, holdElapsed: dibhHoldElapsed } = useBreathHoldStateMachine({
        armed: isHelicalDIBH && dibhArmed,
        timeoutSeconds: dibhTimeoutSeconds,
        forceFailure: dibhAttempt === 0,
        onStageChange: setDibhStage,
        onStableHold: handleDibhStableHold,
        onAbort: handleDibhAbort,
    });

    const handleExecuteScanClick = () => {
        if (stage === "completed") {
            navigate("/image-viewer");
            return;
        }

        if (stage === "idle" || stage === "arming") {
            setGuideVisible(true);
        }
    };

    const startHold = () => {
        if (!guideVisible || stage === "exposing" || stage === "paused" || stage === "rendering" || stage === "completed") {
            return;
        }

        clearHoldRaf();
        holdStartRef.current = performance.now();
        setStage("arming");

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
        if (stage !== "arming") return;
        clearHoldRaf();
        holdStartRef.current = null;
        setHoldProgress(0);
        setStage("idle");
    };

    const statusText =
        stage === "arming"
            ? t("scanFlow.physicalGuide.holdToTrigger", { seconds: Math.max(0, ((1 - holdProgress) * 3)).toFixed(1) })
            : stage === "enabled"
                ? axialWaitingForBreath
                    ? t("scanFlow.live.waitingBreath")
                    : t("scanFlow.physicalGuide.enabledStatus")
                : stage === "exposing"
                    ? isGated
                        ? t("scanFlow.physicalGuide.gatedExposure")
                        : t("scanFlow.physicalGuide.scanning")
                    : stage === "paused"
                        ? t("scanFlow.live.scanPaused")
                    : stage === "rendering"
                        ? t("scanFlow.imageReconstructing")
                        : stage === "completed"
                            ? isGated
                                ? t("scanFlow.live.gatedCompleted")
                                : t("scanFlow.live.helicalCompleted")
                            : t("scanFlow.live.waiting");

    const guideTitle =
        stage === "arming"
            ? t("scanFlow.physicalGuide.keepHolding")
            : stage === "enabled"
                ? axialWaitingForBreath
                    ? t("scanFlow.live.waitingBreath")
                    : t("scanFlow.physicalGuide.enabled")
                : stage === "exposing"
                    ? isGated
                        ? t("scanFlow.physicalGuide.runningGated")
                        : t("scanFlow.live.helicalRunning")
                    : stage === "paused"
                        ? t("scanFlow.live.scanPaused")
                    : isGated
                        ? t("scanFlow.physicalGuide.holdForGatedExposure")
                        : t("scanFlow.physicalGuide.helicalHold");

    const showLiveViewport = stage === "exposing" || stage === "paused" || stage === "rendering" || stage === "completed";

    const executeButtonLabel = (() => {
        if (stage === "completed") return t("scanFlow.imageBrowser");
        if (bedWaitTimedOut) return t("scanFlow.live.waitingTechnician");
        if (dibhTimedOut) return t("scanFlow.live.waitingTechnician");
        if (dibhMidScanPaused) return t("scanFlow.scanPausedWaiting");
        if (stage === "rendering") return t("scanFlow.imageReconstructing");
        if (stage === "exposing") return isGated ? t("scanFlow.physicalGuide.gatedExposure") : t("scanFlow.physicalGuide.scanning");
        if (stage === "enabled") {
            if (isGatedAxial && axialWaitingForBreath) return t("scanFlow.live.waitingStableRespiration");
            if (isHelicalDIBH) {
                if (dibhStage === "countdown") return t("scanFlow.dibh.countdown");
                if (dibhStage === "holding") return t("scanFlow.dibh.waitingStable");
                if (dibhStage === "stable") return t("scanFlow.dibh.stableReady");
            }
            return t("scanFlow.physicalGuide.scanReady");
        }
        if (stage === "arming") return t("scanFlow.physicalGuide.keepHoldingPhysical");
        return t("scanFlow.executeScan");
    })();
    // Only allow click on the bottom-right button at the very start (kick off
    // the guide overlay) and at the very end (navigate to image viewer). During
    // arming / enabled / exposing / rendering, or while either gating dialog is
    // open, the button must be inert so it can't be mistaken for "click again
    // to trigger another scan".
    const executeButtonClickable =
        !bedWaitTimedOut &&
        !dibhTimedOut &&
        !dibhMidScanPaused &&
        (stage === "idle" || stage === "arming" || stage === "completed");
    const timeoutDirectionLabel = direction === "rising"
        ? t("scanFlow.gatingTimeout.directionRising")
        : t("scanFlow.gatingTimeout.directionFalling");
    const rightViewport = isGatedAxial ? (
        <AxialRealtimeViewport
            stage={stage}
            completedBeds={completedBeds}
            currentSlice={currentSlice}
            totalBeds={totalBeds}
            threshold={effectiveThreshold}
            direction={direction}
            waitingForBreath={axialWaitingForBreath}
            waitElapsedMs={bedWaitElapsedMs}
            waitTimeoutMs={GATED_AXIAL_WAIT_TIMEOUT_MS}
            waitTimedOut={bedWaitTimedOut}
        />
    ) : isHelicalDIBH ? (
        // Compact DIBH execute layout: scout (with the scan range already
        // chosen on the confirm screen) on top until exposure starts, then
        // swap to the live DICOM viewport. Bottom = DibhStatusRow + waveform.
        <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
                {showLiveViewport ? (
                    <HelicalLiveViewport
                        playbackActive={stage === "exposing" || stage === "rendering"}
                        seriesOverride={helicalResultOverride}
                    />
                ) : (
                    <FourDScoutViewport />
                )}
            </div>
            <div className="flex shrink-0 items-stretch border-t border-[#B0C4DE]/70 bg-[#0F172A] text-[#E2E8F0]">
                <div className="min-w-0 flex-1 px-3 py-2">
                    <GatingWaveformPanel
                        mode="breath_hold"
                        readOnly
                        bare
                        holdTolerance={
                            dibhStage === "holding" || dibhStage === "stable" || dibhStage === "scanning"
                                ? { target: 1.0, halfWidth: 0.2, label: "±2.0 mm" }
                                : undefined
                        }
                        exposing={stage === "exposing"}
                        gateTrack
                        zRangeStrip={{
                            scanLengthMm: scanLengthMm,
                            completedSegments: stage === "completed" || stage === "rendering"
                                ? totalBeds
                                : stage === "exposing" || stage === "paused"
                                    ? Math.floor(dibhExposureProgress * totalBeds)
                                    : 0,
                            activeSegment: stage === "exposing" || stage === "paused"
                                ? Math.min(totalBeds - 1, Math.floor(dibhExposureProgress * totalBeds))
                                : -1,
                        }}
                    />
                </div>
                <DibhStatusRow
                    stage={dibhStage}
                    countdown={dibhCountdown}
                    holdElapsedSec={dibhHoldElapsed}
                    timeoutSec={dibhTimeoutSeconds}
                    vertical
                />
            </div>
        </div>
    ) : showLiveViewport ? (
        <HelicalLiveViewport playbackActive={stage !== "completed"} seriesOverride={helicalResultOverride} />
    ) : (
        <HelicalExecuteIdleViewport isGated={isGated} />
    );

    return (
        <div className="relative h-[768px] w-[1024px] overflow-hidden">
            <ScanConfirmScreen
                activeSequenceId="s2"
                activeSequenceStepIndex={stage === "completed" ? 2 : 1}
                parameterPanelMode={isGatedAxial ? "tomographicScan" : "helicalScan"}
                helicalParamOverrides={isGatedAxial ? undefined : measurements}
                tomographicParamOverrides={isGatedAxial ? measurements : undefined}
                rightViewportContent={rightViewport}
                rightViewportClassName={isGatedAxial ? "flex-1 rounded-lg border border-[#B0C4DE] bg-white shadow-sm flex flex-col overflow-hidden relative" : undefined}
                readOnlyMode
                onExecuteScan={executeButtonClickable ? handleExecuteScanClick : undefined}
                patientConfirmBeforeExecute={stage !== "completed"}
                executeButtonLabel={executeButtonLabel}
                executeButtonCompact={stage === "arming"}
            />

            <div className={`absolute bottom-[84px] right-0 top-[88px] z-40 flex items-stretch transition-all duration-500 ${guideVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
                <div className="pointer-events-auto flex h-full w-[235px] flex-col overflow-hidden rounded-l-2xl border border-r-0 border-[#CBD5E1] bg-[#EDF1F7] shadow-[-24px_0_48px_rgba(15,23,42,0.22)]">
                    <div className="border-b border-slate-200 px-5 py-4">
                        <div className="text-[14px] font-black text-slate-700">{t("scanFlow.physicalGuide.title")}</div>
                        <div className="mt-1 text-[11px] font-medium text-slate-400">
                            {isGated
                                ? t("scanFlow.physicalGuide.gatedDescription")
                                : t("scanFlow.physicalGuide.helicalDescription")}
                        </div>
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
                                className={`group flex h-[132px] w-[132px] items-center justify-center rounded-full border-[10px] shadow-[0_22px_40px_rgba(15,23,42,0.28)] transition-all duration-200 ${stage === "arming" || stage === "enabled" || stage === "exposing"
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
                                    <span>{t("scanFlow.holdProgress")}</span>
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

            {isGatedAxial && bedWaitTimedOut && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/55 backdrop-blur-[1px]">
                    <div className="w-[460px] rounded-2xl border border-[#F59E0B]/60 bg-white shadow-[0_30px_60px_rgba(15,23,42,0.35)]">
                        <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50 px-6 py-4">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                                <span className="text-[18px] font-black leading-none">!</span>
                            </div>
                            <div>
                                <div className="text-[14px] font-black text-amber-900">{t("scanFlow.gatingTimeout.title")}</div>
                                <div className="mt-0.5 text-[11px] font-medium text-amber-700">
                                    {t("scanFlow.gatingTimeout.subtitle", { bed: (pendingBedIndex ?? 0) + 1, total: totalBeds, seconds: (GATED_AXIAL_WAIT_TIMEOUT_MS / 1000).toFixed(0) })}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-3 px-6 py-5 text-[12px] leading-relaxed text-slate-600">
                            <p>
                                {t("scanFlow.gatingTimeout.body", { threshold: effectiveThreshold.toFixed(2), direction: timeoutDirectionLabel })}
                            </p>
                            <p>{t("scanFlow.gatingTimeout.guide")}</p>
                            {thresholdLowered && (
                                <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
                                    {t("scanFlow.gatingTimeout.loweredNotice", { threshold: GATED_AXIAL_LOWERED_THRESHOLD.toFixed(2) })}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <button
                                type="button"
                                onClick={handleTimeoutAbort}
                                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-100"
                            >
                                {t("scanFlow.gatingTimeout.abort")}
                            </button>
                            <button
                                type="button"
                                onClick={handleTimeoutLowerThreshold}
                                disabled={thresholdLowered}
                                className="rounded-md border border-amber-400 bg-white px-4 py-2 text-[12px] font-bold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {t("scanFlow.gatingTimeout.lowerThreshold", { threshold: GATED_AXIAL_LOWERED_THRESHOLD.toFixed(2) })}
                            </button>
                            <button
                                type="button"
                                onClick={handleTimeoutRetry}
                                className="rounded-md bg-[#1D4ED8] px-4 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#1E40AF]"
                            >
                                {t("scanFlow.gatingTimeout.retry")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isHelicalDIBH && dibhTimedOut && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/55 backdrop-blur-[1px]">
                    <div className="w-[460px] rounded-2xl border border-[#F59E0B]/60 bg-white shadow-[0_30px_60px_rgba(15,23,42,0.35)]">
                        <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50 px-6 py-4">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                                <span className="text-[18px] font-black leading-none">!</span>
                            </div>
                            <div>
                                <div className="text-[14px] font-black text-amber-900">{t("scanFlow.dibhDialog.failureTitle")}</div>
                                <div className="mt-0.5 text-[11px] font-medium text-amber-700">
                                    {t("scanFlow.dibhDialog.failureSubtitle", { attempt: dibhAttempt + 1, seconds: DIBH_FAILURE_TIMEOUT_S })}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-3 px-6 py-5 text-[12px] leading-relaxed text-slate-600">
                            <p>
                                {t("scanFlow.dibhDialog.failureBody", { tolerance: "±2.0 mm" })}
                            </p>
                            <p>{t("scanFlow.dibhDialog.failureGuide")}</p>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <button
                                type="button"
                                onClick={handleDibhAbortScan}
                                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-100"
                            >
                                {t("scanFlow.dibhDialog.abort")}
                            </button>
                            <button
                                type="button"
                                onClick={handleDibhRetry}
                                className="rounded-md bg-[#1D4ED8] px-4 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#1E40AF]"
                            >
                                {t("scanFlow.dibhDialog.retry")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isHelicalDIBH && dibhMidScanPaused && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/55 backdrop-blur-[1px]">
                    <div className="w-[500px] rounded-2xl border border-[#F59E0B]/60 bg-white shadow-[0_30px_60px_rgba(15,23,42,0.35)]">
                        <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50 px-6 py-4">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                                <span className="text-[18px] font-black leading-none">!</span>
                            </div>
                            <div>
                                <div className="text-[14px] font-black text-amber-900">{t("scanFlow.dibhDialog.midPauseTitle")}</div>
                                <div className="mt-0.5 text-[11px] font-medium text-amber-700">
                                    {t("scanFlow.dibhDialog.midPauseSubtitle", { progress: Math.round(dibhExposureProgress * 100) })}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-3 px-6 py-5 text-[12px] leading-relaxed text-slate-600">
                            <p>
                                {t("scanFlow.dibhDialog.midPauseBody")}
                            </p>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                                    <span>{t("scanFlow.dibhDialog.interruptPosition")}</span>
                                    <span>{Math.round(dibhExposureProgress * 100)}%</span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                                    <div
                                        className="h-full rounded-full bg-amber-500"
                                        style={{ width: `${Math.round(dibhExposureProgress * 100)}%` }}
                                    />
                                </div>
                            </div>
                            <p>
                                {t("scanFlow.dibhDialog.midPauseGuide")}
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => handleDibhRestartFromPause(false)}
                                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-100"
                            >
                                {t("scanFlow.dibhDialog.restartDiscard")}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDibhRestartFromPause(true)}
                                className="rounded-md bg-[#1D4ED8] px-4 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#1E40AF]"
                            >
                                {t("scanFlow.dibhDialog.restartSave")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
