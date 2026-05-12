import { useEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DicomViewer from "../components/DicomViewer";
import GatingMonitorPanel from "../components/GatingMonitorPanel";
import { fetchSelectedScanSession } from "../lib/scanSession";
import {
    applySupplementalScan,
    generateMockGatingResult,
    loadGatingResult,
    saveGatingResult,
    type GatingBreathingMode,
} from "../lib/gatingResult";

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

function HelicalLiveViewport({ playbackActive }: { playbackActive: boolean }) {
    const imageUrls = Array.from(
        { length: HELICAL_RESULT_SERIES.count },
        (_, index) => `${HELICAL_RESULT_SERIES.basePath}/1-${String(index + 1).padStart(3, "0")}.dcm`
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
                imageUrls={imageUrls}
                currentImageIndex={currentImageIndex}
                onImageIndexChange={setCurrentImageIndex}
                activeTool="pan"
                windowCenter={HELICAL_RESULT_SERIES.fallbackWindowLevel}
                windowWidth={HELICAL_RESULT_SERIES.fallbackWindowWidth}
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
}: {
    stage: ScanStage;
    completedBeds: number;
    currentSlice: number;
    totalBeds: number;
    threshold: number;
    direction: "rising" | "falling";
    supplementalBeds?: number[];
    waitingForBreath?: boolean;
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
                        {stage === "completed" ? "采集完成" : waitingForBreath ? "等待呼吸稳定" : scanActive ? "实时采集中" : "等待物理按键"}
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
                                {waitingForBreath ? "呼吸波形不稳，等待进入触发窗" : "等待物理按键触发，曝光后显示实时轴扫图像"}
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
    const [stage, setStage] = useState<ScanStage>("idle");
    const [holdProgress, setHoldProgress] = useState(0);
    const [guideVisible, setGuideVisible] = useState(true);
    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });
    const [completedBeds, setCompletedBeds] = useState(0);
    const [currentSlice, setCurrentSlice] = useState(0);
    const [axialWaitingForBreath, setAxialWaitingForBreath] = useState(false);
    const rafRef = useRef<number | null>(null);
    const holdStartRef = useRef<number | null>(null);
    const progressStartRef = useRef<number | null>(null);
    const exposureTimerRef = useRef<number | null>(null);
    const axialProgressTimerRef = useRef<number | null>(null);
    const axialWaitTimerRef = useRef<number | null>(null);
    const autoNavigateTimerRef = useRef<number | null>(null);

    const scanLengthMm = Number(params.get("scanLengthMm") ?? measurements.scanLength);
    const totalBeds = useMemo(() => {
        if (!Number.isFinite(scanLengthMm) || scanLengthMm <= 0) return 1;
        return Math.max(1, Math.ceil(scanLengthMm / GATED_AXIAL_BED_STEP_MM));
    }, [scanLengthMm]);
    const threshold = Number(params.get("threshold") ?? "1.0");
    const direction = (params.get("direction") ?? "rising") as "rising" | "falling";
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
                    threshold,
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
    }, [navigate, stage, isGated, isGatedAxial, totalBeds, breathingMode, threshold, direction, isSupplementalRun, supplementalIndices]);

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

    const triggerScanSequence = () => {
        clearHoldRaf();
        setHoldProgress(1);
        setStage("enabled");
        setCompletedBeds(0);
        setCurrentSlice(0);
        setAxialWaitingForBreath(false);

        if (isGatedAxial) {
            const targetBedCount = supplementalBedTargets?.length ?? totalBeds;

            if (axialProgressTimerRef.current !== null) {
                window.clearInterval(axialProgressTimerRef.current);
            }
            if (axialWaitTimerRef.current !== null) {
                window.clearTimeout(axialWaitTimerRef.current);
                axialWaitTimerRef.current = null;
            }

            const scheduleBedExposure = (targetIndex: number) => {
                setStage("enabled");
                setAxialWaitingForBreath(true);
                setCurrentSlice(0);
                const waitMs = GATED_AXIAL_STABILITY_WAIT_MS[targetIndex % GATED_AXIAL_STABILITY_WAIT_MS.length];

                axialWaitTimerRef.current = window.setTimeout(() => {
                    axialWaitTimerRef.current = null;
                    setAxialWaitingForBreath(false);
                    setStage("exposing");
                    setGuideVisible(false);
                    beginBedExposure();
                }, waitMs);
            };

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
                            const nextBed = Math.min(targetBedCount, prevBed + 1);
                            setCurrentSlice(0);
                            if (nextBed >= targetBedCount) {
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
    const rightViewport = isGatedAxial ? (
        <AxialRealtimeViewport
            stage={stage}
            completedBeds={completedBeds}
            currentSlice={currentSlice}
            totalBeds={totalBeds}
            threshold={threshold}
            direction={direction}
            supplementalBeds={supplementalBedTargets ?? undefined}
            waitingForBreath={axialWaitingForBreath}
        />
    ) : showLiveViewport ? (
        <HelicalLiveViewport playbackActive={stage !== "completed"} />
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
                onExecuteScan={handleExecuteScanClick}
                patientConfirmBeforeExecute={stage !== "completed"}
                executeButtonLabel={stage === "completed" ? "图像浏览" : "执行扫描"}
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
        </div>
    );
}
