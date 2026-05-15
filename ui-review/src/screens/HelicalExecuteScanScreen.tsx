import { useEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DicomViewer from "../components/DicomViewer";
import GatingMonitorPanel from "../components/GatingMonitorPanel";
import { fetchSelectedScanSession, type ApiScanSessionDetail } from "../lib/scanSession";
import { loadSelectedScanWorkflowPlans } from "../lib/scanWorkflowSession";
import {
    applySupplementalScan,
    generateMockGatingResult,
    loadGatingResult,
    saveGatingResult,
    type GatingBreathingMode,
} from "../lib/gatingResult";

// Demo dataset for the "脑部螺旋" (brain helical, non-gating) protocol — JPEG Lossless
// Thin Brain reconstruction (219 slices). Used only when executeMode === "helical"
// AND the active workflow plan title matches; gated_helical / gated_axial paths are
// untouched and keep using HELICAL_RESULT_SERIES.
const BRAIN_HELICAL_PROTOCOL_TITLE = "脑部螺旋";
const BRAIN_HELICAL_RESULT_SERIES = {
    basePath: "/dicom-out/HeadStrokeDemo/ThinBrain",
    count: 219,
    fallbackWindowWidth: 100,
    fallbackWindowLevel: 35,
};

type HelicalResultSeriesConfig = {
    basePath: string;
    count: number;
    fallbackWindowWidth: number;
    fallbackWindowLevel: number;
};

const SCAN_SESSION_DETAIL_CACHE_KEY = "selectedScanSessionDetail";

const isBrainHelicalName = (value: string | null | undefined) =>
    typeof value === "string" && value.includes(BRAIN_HELICAL_PROTOCOL_TITLE);

const isBrainHelicalScanSession = (session: ApiScanSessionDetail | null) => {
    if (!session) return false;
    return (
        session.acquisition_type === "regular" &&
        session.body_part.toLowerCase() === "head" &&
        (session.protocol_id === 1 || isBrainHelicalName(session.name) || isBrainHelicalName(session.session_name))
    );
};

const loadCachedBrainHelicalSession = () => {
    try {
        const raw = localStorage.getItem(SCAN_SESSION_DETAIL_CACHE_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as ApiScanSessionDetail;
        return isBrainHelicalScanSession(session) ? session : null;
    } catch {
        return null;
    }
};

import ScanConfirmScreen from "./ScanConfirmScreen";

type ScanStage = "idle" | "arming" | "enabled" | "exposing" | "rendering" | "completed";
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
// In a fresh (non-supplemental) gated_axial demo run, force the 2nd bed's
// first attempt to time out so the technician-intervention branch is shown.
const GATED_AXIAL_TIMEOUT_DEMO_BED_INDEX = 1;
const GATED_AXIAL_TIMEOUT_DEMO_UNREACHABLE_WAIT_MS = GATED_AXIAL_WAIT_TIMEOUT_MS + 4000;
// Mock value applied when technician chooses "临时降阈值" in the timeout dialog.
const GATED_AXIAL_LOWERED_THRESHOLD = 0.7;
const HELICAL_RESULT_SERIES = {
    basePath: "/dicom/QIN LUNG CT/QIN-LUNG-01-0007/01-12-2000-1-CT Thorax wContrast-47252/2.000000-THORAX W  3.0 B41 Soft Tissue-52055",
    count: 118,
    fallbackWindowWidth: 350,
    fallbackWindowLevel: 45,
};

function HelicalExecuteIdleViewport({ isGated }: { isGated: boolean }) {
    return (
        <div className="relative h-full w-full overflow-hidden bg-black">
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-[14px] font-semibold tracking-[0.28em] text-[#7E8CA0]">LIVE VIEW</div>
                    <div className="mt-3 text-[12px] text-[#566474]">
                        {isGated ? "等待物理按键确认，系统将在指定呼吸相位曝光" : "等待触发扫描，影像将在扫描过程中实时显示"}
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
        () =>
            Array.from({ length: series.count }, (_, index) => {
                const name = useOverride
                    ? `image-${String(index + 1).padStart(3, "0")}.dcm`
                    : `1-${String(index + 1).padStart(3, "0")}.dcm`;
                return `${series.basePath}/${name}`;
            }),
        [series.basePath, series.count, useOverride],
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
    supplementalBeds,
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
    supplementalBeds?: number[];
    waitingForBreath?: boolean;
    waitElapsedMs?: number;
    waitTimeoutMs?: number;
    waitTimedOut?: boolean;
}) {
    const imageUrls = useMemo(
        () =>
            Array.from(
                { length: HELICAL_RESULT_SERIES.count },
                (_, index) => `${HELICAL_RESULT_SERIES.basePath}/1-${String(index + 1).padStart(3, "0")}.dcm`
            ),
        []
    );
    const supplementalBedSet = useMemo(() => new Set(supplementalBeds ?? []), [supplementalBeds]);
    const hasSupplementalBeds = supplementalBedSet.size > 0;
    const supplementalCompletedBeds = useMemo(
        () => (supplementalBeds ?? []).slice(0, completedBeds),
        [completedBeds, supplementalBeds]
    );
    const completedBedNumbers = useMemo(() => {
        if (!hasSupplementalBeds) {
            return Array.from({ length: completedBeds }, (_, index) => index + 1);
        }
        const alreadyScanned = Array.from({ length: totalBeds }, (_, index) => index + 1).filter(
            (bedNumber) => !supplementalBedSet.has(bedNumber)
        );
        return [...alreadyScanned, ...supplementalCompletedBeds].sort((a, b) => a - b);
    }, [completedBeds, hasSupplementalBeds, supplementalBedSet, supplementalCompletedBeds, totalBeds]);
    const currentBedNumber = hasSupplementalBeds
        ? (supplementalBeds ?? [])[completedBeds] ?? null
        : Math.min(completedBeds + (stage === "completed" ? 0 : 1), totalBeds || 1);
    const completedImages = hasSupplementalBeds
        ? (completedBedNumbers.length * GATED_AXIAL_SLICES_PER_BED + currentSlice)
        : (completedBeds * GATED_AXIAL_SLICES_PER_BED + currentSlice);
    const totalImages = Math.max(1, totalBeds * GATED_AXIAL_SLICES_PER_BED);
    const progress = Math.min(completedImages / totalImages, 1);
    const scanActive = stage === "enabled" || stage === "exposing" || stage === "rendering";
    const showDicom = stage === "exposing" || stage === "rendering" || stage === "completed";
    const activeBedForImage = hasSupplementalBeds ? currentBedNumber ?? 1 : completedBeds + 1;
    const displayIndex = Math.min(
        imageUrls.length - 1,
        Math.max(0, (((activeBedForImage - 1) * GATED_AXIAL_SLICES_PER_BED) + Math.max(0, currentSlice - 1)) % imageUrls.length)
    );
    const displayBed = stage === "completed" && hasSupplementalBeds
        ? (supplementalBeds ?? [])[Math.max(0, (supplementalBeds?.length ?? 1) - 1)] ?? totalBeds
        : currentBedNumber ?? totalBeds;

    return (
        <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
                <div className="absolute left-4 top-3 z-20 rounded border border-white/10 bg-black/60 px-3 py-2 text-white shadow-lg">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">AXIAL LIVE</div>
                    <div className="mt-1 text-[12px] font-bold">
                        {stage === "completed"
                            ? "采集完成"
                            : waitTimedOut
                                ? "等待超时 · 需技师介入"
                                : waitingForBreath
                                    ? "等待呼吸稳定"
                                    : scanActive
                                        ? "实时采集中"
                                        : "等待物理按键"}
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
                                    ? "呼吸信号长时间未进入触发窗，扫描已暂停，等待技师处理"
                                    : waitingForBreath
                                        ? waitTimeoutMs
                                            ? `呼吸波形不稳，等待进入触发窗 ${(waitElapsedMs / 1000).toFixed(1)}s / ${(waitTimeoutMs / 1000).toFixed(0)}s`
                                            : "呼吸波形不稳，等待进入触发窗"
                                        : "等待物理按键触发，曝光后显示实时轴扫图像"}
                            </div>
                        </div>
                    </div>
                )}

                <div className="absolute bottom-4 left-4 right-4">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                        <span>
                            床位 {displayBed} / {totalBeds || 1}
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
                        completedIndices: hasSupplementalBeds ? completedBedNumbers : undefined,
                        currentIndex: hasSupplementalBeds ? currentBedNumber : undefined,
                        pendingIndices: hasSupplementalBeds ? supplementalBeds : undefined,
                    }}
                    scanActive={scanActive && (hasSupplementalBeds ? completedBeds < (supplementalBeds?.length ?? 0) : completedBeds < totalBeds)}
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
    const [params] = useSearchParams();
    const executeMode = (params.get("mode") ?? "helical") as ExecuteMode;
    const isGated = executeMode === "gated_helical" || executeMode === "gated_axial";
    const isGatedAxial = executeMode === "gated_axial";
    const [scanSession, setScanSession] = useState<ApiScanSessionDetail | null>(() => loadCachedBrainHelicalSession());

    useEffect(() => {
        fetchSelectedScanSession({ preferCache: true })
            .then((session) => {
                if (session) setScanSession(session);
            })
            .catch(() => { /* live viewport falls back to workflow-plan detection */ });
    }, []);

    // Brain-helical demo override: only when running NON-gated helical for the "脑部螺旋"
    // protocol. Gated paths intentionally fall through to the legacy HELICAL_RESULT_SERIES.
    const helicalResultOverride = useMemo<HelicalResultSeriesConfig | undefined>(() => {
        if (executeMode !== "helical") return undefined;
        const plans = loadSelectedScanWorkflowPlans();
        const isBrainHelical =
            plans.some((plan) => isBrainHelicalName(plan.title)) ||
            isBrainHelicalScanSession(scanSession);
        return isBrainHelical ? BRAIN_HELICAL_RESULT_SERIES : undefined;
    }, [executeMode, scanSession]);
    const [stage, setStage] = useState<ScanStage>("idle");
    const [holdProgress, setHoldProgress] = useState(0);
    const [guideVisible, setGuideVisible] = useState(true);
    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });
    const [completedBeds, setCompletedBeds] = useState(0);
    const [currentSlice, setCurrentSlice] = useState(0);
    const [axialWaitingForBreath, setAxialWaitingForBreath] = useState(false);
    const [bedWaitElapsedMs, setBedWaitElapsedMs] = useState(0);
    const [bedWaitTimedOut, setBedWaitTimedOut] = useState(false);
    const [activeThresholdOverride, setActiveThresholdOverride] = useState<number | null>(null);
    const [thresholdLowered, setThresholdLowered] = useState(false);
    const rafRef = useRef<number | null>(null);
    const holdStartRef = useRef<number | null>(null);
    const progressStartRef = useRef<number | null>(null);
    const exposureTimerRef = useRef<number | null>(null);
    const axialProgressTimerRef = useRef<number | null>(null);
    const axialWaitTimerRef = useRef<number | null>(null);
    const autoNavigateTimerRef = useRef<number | null>(null);
    const bedWaitTickRef = useRef<number | null>(null);
    const bedWaitStartRef = useRef<number | null>(null);
    const pendingBedIndexRef = useRef<number | null>(null);
    const bedAttemptsRef = useRef<Map<number, number>>(new Map());

    const scanLengthMm = Number(params.get("scanLengthMm") ?? measurements.scanLength);
    const totalBeds = useMemo(() => {
        if (!Number.isFinite(scanLengthMm) || scanLengthMm <= 0) return 1;
        return Math.max(1, Math.ceil(scanLengthMm / GATED_AXIAL_BED_STEP_MM));
    }, [scanLengthMm]);
    const threshold = Number(params.get("threshold") ?? "1.0");
    const direction = (params.get("direction") ?? "rising") as "rising" | "falling";
    const effectiveThreshold = activeThresholdOverride ?? threshold;
    const breathingMode = (params.get("breathingMode") ?? (isGatedAxial ? "free_breathing" : "breath_hold_inspiration")) as GatingBreathingMode;
    const supplementalIndices = useMemo(() => {
        const raw = params.get("supplemental");
        if (!raw) return null;
        const parsed = raw
            .split(",")
            .map((s) => Number.parseInt(s, 10))
            .filter((n) => Number.isFinite(n));
        return parsed.length > 0 ? parsed : null;
    }, [params]);
    const supplementalBedTargets = useMemo(() => {
        if (!supplementalIndices) return null;
        const unique = Array.from(new Set(supplementalIndices))
            .filter((bedNumber) => bedNumber >= 1 && bedNumber <= totalBeds)
            .sort((a, b) => a - b);
        return unique.length > 0 ? unique : null;
    }, [supplementalIndices, totalBeds]);
    const isSupplementalRun = !!supplementalBedTargets;

    const clearHoldRaf = () => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };

    useEffect(() => {
        let cancelled = false;

        const loadSessionMeasurements = async () => {
            try {
                const scanSession = await fetchSelectedScanSession();
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
    }, [isGatedAxial, params]);

    useEffect(() => {
        if (stage !== "completed") return;

        if (isGated) {
            if (isSupplementalRun) {
                // Merge: replace the selected triggers in the prior result.
                const prior = loadGatingResult();
                if (prior && supplementalIndices) {
                    saveGatingResult(applySupplementalScan(prior, supplementalIndices));
                }
            } else {
                const totalSlices = isGatedAxial
                    ? Math.max(1, totalBeds) * GATED_AXIAL_SLICES_PER_BED
                    : HELICAL_RESULT_SERIES.count;
                const result = generateMockGatingResult({
                    mode: isGatedAxial ? "gated_axial" : "gated_helical",
                    breathingMode,
                    totalSlices,
                    slicesPerBed: isGatedAxial ? GATED_AXIAL_SLICES_PER_BED : undefined,
                    threshold: effectiveThreshold,
                    direction,
                });
                saveGatingResult(result);
            }
        }

        autoNavigateTimerRef.current = window.setTimeout(() => {
            navigate("/image-viewer", {
                state: isGated
                    ? { gatingMode: isGatedAxial ? "gated_axial" : "gated_helical", breathingMode }
                    : undefined,
            });
        }, AUTO_NAVIGATE_DELAY_MS);

        return () => {
            if (autoNavigateTimerRef.current !== null) {
                window.clearTimeout(autoNavigateTimerRef.current);
                autoNavigateTimerRef.current = null;
            }
        };
    }, [navigate, stage, isGated, isGatedAxial, totalBeds, breathingMode, effectiveThreshold, direction, isSupplementalRun, supplementalIndices]);

    useEffect(() => {
        return () => {
            clearHoldRaf();
            if (exposureTimerRef.current !== null) {
                window.clearTimeout(exposureTimerRef.current);
            }
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

    const axialTargetBedCount = supplementalBedTargets?.length ?? totalBeds;

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

        const attemptCount = bedAttemptsRef.current.get(targetIndex) ?? 0;
        // Demo branch: on a fresh run, the 2nd bed's first attempt never receives
        // a valid threshold-cross within wait_timeout → forces the technician
        // intervention dialog. Retries always succeed.
        const isDemoTimeoutBed =
            !isSupplementalRun &&
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
        setStage("idle");
        navigate("/gated-axial-confirm");
    };

    const triggerScanSequence = () => {
        clearHoldRaf();
        setHoldProgress(1);
        setStage("enabled");
        setCompletedBeds(0);
        setCurrentSlice(0);
        setAxialWaitingForBreath(false);
        setBedWaitTimedOut(false);
        setBedWaitElapsedMs(0);

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

        window.setTimeout(() => {
            setStage("exposing");
            setGuideVisible(false);
        }, 180);

        exposureTimerRef.current = window.setTimeout(() => {
            setStage("rendering");
            runRenderAnimation();
        }, EXPOSURE_DURATION_MS);
    };

    const handleExecuteScanClick = () => {
        if (stage === "completed") {
            navigate("/image-viewer", {
                state: isGated
                    ? { gatingMode: isGatedAxial ? "gated_axial" : "gated_helical", breathingMode }
                    : undefined,
            });
            return;
        }

        if (stage === "idle" || stage === "arming") {
            setGuideVisible(true);
        }
    };

    const startHold = () => {
        if (!guideVisible || stage === "exposing" || stage === "rendering" || stage === "completed") {
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
            ? `Hold to trigger ${Math.max(0, ((1 - holdProgress) * 3)).toFixed(1)}s`
            : stage === "enabled"
                ? axialWaitingForBreath
                    ? "Waiting for stable respiration..."
                    : "Scan enabled"
                : stage === "exposing"
                    ? isGated
                        ? "Gated exposure in progress..."
                        : "Helical scan in progress..."
                    : stage === "rendering"
                        ? "Rendering images..."
                        : stage === "completed"
                            ? isGated
                                ? "Gated scan completed"
                                : "Helical scan completed"
                            : "Waiting";

    const guideTitle =
        stage === "arming"
            ? "Keep holding the green button"
            : stage === "enabled"
                ? axialWaitingForBreath
                    ? "Waiting for stable respiration"
                    : "System enabled"
                : stage === "exposing"
                    ? isGated
                        ? "Running gated scan"
                        : "Running helical scan"
                    : isGated
                        ? "Hold for gated exposure"
                        : "Hold the green button";

    const showLiveViewport = stage === "exposing" || stage === "rendering" || stage === "completed";

    const executeButtonLabel = (() => {
        if (stage === "completed") return "图像浏览";
        if (bedWaitTimedOut) return "等待技师处理";
        if (stage === "rendering") return "图像重建中…";
        if (stage === "exposing") return isGated ? "门控曝光中…" : "扫描中…";
        if (stage === "enabled") {
            if (isGatedAxial && axialWaitingForBreath) return "等待呼吸信号…";
            return "扫描就绪…";
        }
        if (stage === "arming") return "请按住物理按键";
        return "执行扫描";
    })();
    // Only allow click on the bottom-right button at the very start (kick off
    // the guide overlay) and at the very end (navigate to image viewer). During
    // arming / enabled / exposing / rendering, or while the timeout dialog is
    // open, the button must be inert so it can't be mistaken for "click again
    // to trigger another scan".
    const executeButtonClickable =
        !bedWaitTimedOut &&
        (stage === "idle" || stage === "arming" || stage === "completed");
    const rightViewport = isGatedAxial ? (
        <AxialRealtimeViewport
            stage={stage}
            completedBeds={completedBeds}
            currentSlice={currentSlice}
            totalBeds={totalBeds}
            threshold={effectiveThreshold}
            direction={direction}
            supplementalBeds={supplementalBedTargets ?? undefined}
            waitingForBreath={axialWaitingForBreath}
            waitElapsedMs={bedWaitElapsedMs}
            waitTimeoutMs={GATED_AXIAL_WAIT_TIMEOUT_MS}
            waitTimedOut={bedWaitTimedOut}
        />
    ) : showLiveViewport ? (
        <HelicalLiveViewport playbackActive={stage !== "completed"} seriesOverride={helicalResultOverride} />
    ) : (
        <HelicalExecuteIdleViewport isGated={isGated} />
    );

    return (
        <div className="relative h-[768px] w-[1024px] overflow-hidden">
            {isSupplementalRun && supplementalBedTargets && (
                <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-[#f59e0b] bg-[#451a03]/90 px-4 py-1 text-[12px] font-bold text-[#fbbf24] shadow-lg">
                    补扫模式 · 仅补采床位段 {supplementalBedTargets.join("、")}
                </div>
            )}
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
            />

            <div className={`absolute bottom-[84px] right-0 top-[88px] z-40 flex items-stretch transition-all duration-500 ${guideVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
                <div className="pointer-events-auto flex h-full w-[235px] flex-col overflow-hidden rounded-l-2xl border border-r-0 border-[#CBD5E1] bg-[#EDF1F7] shadow-[-24px_0_48px_rgba(15,23,42,0.22)]">
                    <div className="border-b border-slate-200 px-5 py-4">
                        <div className="text-[14px] font-black text-slate-700">Physical button guide</div>
                        <div className="mt-1 text-[11px] font-medium text-slate-400">
                            {isGated
                                ? "Hold for three seconds to enable exposure at the selected respiratory phase."
                                : "Hold for three seconds to enable and start the helical scan."}
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
                                    <span>Hold progress</span>
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
                                <div className="text-[14px] font-black text-amber-900">门控等待超时</div>
                                <div className="mt-0.5 text-[11px] font-medium text-amber-700">
                                    床位 {(pendingBedIndexRef.current ?? 0) + 1} / {totalBeds} · 等待 {(GATED_AXIAL_WAIT_TIMEOUT_MS / 1000).toFixed(0)} s 内未检测到有效触发
                                </div>
                            </div>
                        </div>
                        <div className="space-y-3 px-6 py-5 text-[12px] leading-relaxed text-slate-600">
                            <p>
                                呼吸波形在设定阈值 <span className="font-black text-slate-800">{effectiveThreshold.toFixed(2)}</span>（{direction === "rising" ? "上升" : "下降"}方向）上未稳定穿越触发窗，当前床位曝光已暂停。
                            </p>
                            <p>请确认患者呼吸状态、传感器位置和波形质量，然后选择处理方式：</p>
                            {thresholdLowered && (
                                <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
                                    已临时降低阈值至 {GATED_AXIAL_LOWERED_THRESHOLD.toFixed(2)}，本次扫描结果将以此阈值标注。
                                </p>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <button
                                type="button"
                                onClick={handleTimeoutAbort}
                                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-100"
                            >
                                中止扫描
                            </button>
                            <button
                                type="button"
                                onClick={handleTimeoutLowerThreshold}
                                disabled={thresholdLowered}
                                className="rounded-md border border-amber-400 bg-white px-4 py-2 text-[12px] font-bold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                临时降阈值至 {GATED_AXIAL_LOWERED_THRESHOLD.toFixed(2)}
                            </button>
                            <button
                                type="button"
                                onClick={handleTimeoutRetry}
                                className="rounded-md bg-[#1D4ED8] px-4 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#1E40AF]"
                            >
                                重试当前床位
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
