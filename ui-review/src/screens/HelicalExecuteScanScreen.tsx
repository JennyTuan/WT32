import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import DicomViewer from "../components/DicomViewer";
import PhysicalTriggerGuide, { type PhysicalTriggerStep } from "../components/PhysicalTriggerGuide";
import ScanTriggerFailureDialog from "../components/ScanTriggerFailureDialog";
import GatingMonitorPanel from "../components/GatingMonitorPanel";
import GatingWaveformPanel from "../components/GatingWaveformPanel";
import DibhStatusRow from "../components/DibhStatusRow";
import { useBreathHoldStateMachine, type BreathHoldStage } from "../components/useBreathHoldStateMachine";
import { clearSelectedScanSessionId, fetchSelectedScanSession, loadSelectedScanSessionId, startScanSession, completeScanSession, updateScanSessionSeriesExecution, type ApiScanSeriesImageSourceId, type ApiScanSessionDetail, type ApiScanSessionSeries } from "../lib/scanSession";
import { applyScanWorkflowAction, createActionId } from "../lib/scanWorkflowActions";
import { loadSelectedPatient } from "../lib/patientSession";
import {
    buildScanSessionExecutionContext,
    isTerminalScanSessionStatus,
    matchesScanExecutionBinding,
} from "../lib/scanSeriesPrerequisites";
import type { DependentScanSeriesType, ScanExecutionBinding } from "../lib/scanSeriesPrerequisites";
import { FourDScoutViewport } from "./HelicalScanConfirmScreen";
import { getLimbsDicomSeries, loadLimbsDicomDemoManifest } from "../lib/limbsDicomDemo";
import { useI18n } from "../lib/i18nContext";
import { DEVICE_ERROR_RAISED_EVENT, type DeviceErrorEvent } from "../lib/deviceErrorEvents";
import { hasVerifiedSeriesImageSource, resolveHelicalResultImageSource } from "../lib/scanSeriesImageSource";
import { isBrainHelicalScanSession } from "../lib/brainHelicalDemo";
import { resolvePostExecutionDestination } from "../lib/scanExecutionFlow";

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
    basePath: "/dicom-head-stroke-plain/soft",
    count: 27,
    fallbackWindowWidth: 100,
    fallbackWindowLevel: 35,
};

import ScanConfirmScreen, { PatientConfirmationModal } from "./ScanConfirmScreen";

type ScanStage = "idle" | "positioning" | "positioned" | "enabled" | "exposing" | "paused" | "rendering" | "completed";
type ExecuteMode = "helical" | "axial" | "gated_helical" | "gated_axial";
type PhysicalTriggerAction = "position" | "exposure";
type FinalizationState = "idle" | "saving" | "succeeded" | "failed" | "blocked";
type HelicalExecuteLocationState = {
    showCombinedPatientConfirm?: boolean;
};

const validateBoundExecutionSession = (
    scanSession: ApiScanSessionDetail | null,
    binding: ScanExecutionBinding | null,
    targetType: DependentScanSeriesType,
    selectedSessionId: number | null,
    selectedPatientId: number | null,
): ApiScanSessionSeries => {
    if (!binding) {
        throw new Error("执行页缺少完整的已确认扫描绑定，请返回范围确认页");
    }
    if (!scanSession || selectedSessionId !== binding.scanSessionId || scanSession.id !== binding.scanSessionId) {
        throw new Error("患者或扫描会话已切换，请返回患者列表重新选择");
    }
    if (selectedPatientId === null || scanSession.patient_id !== selectedPatientId) {
        throw new Error("患者与扫描会话不一致，请返回患者列表重新选择");
    }
    if (isTerminalScanSessionStatus(scanSession.status)) {
        throw new Error("当前扫描会话已结束，不能再次执行；请返回患者列表重新创建或选择会话");
    }

    const context = buildScanSessionExecutionContext(scanSession, targetType);
    if (!matchesScanExecutionBinding(context, binding)) {
        throw new Error("扫描会话结构已更新，请重新进入范围确认页");
    }

    const targetSeries = scanSession.series.find(
        (series) => series.id === binding.targetSeriesId && series.series_type === targetType,
    );
    if (!targetSeries) throw new Error("当前扫描会话缺少已确认的待执行序列");

    if (binding.requiredTopogramId !== null) {
        const topogram = scanSession.series.find(
            (series) => series.id === binding.requiredTopogramId && series.series_type === "topogram",
        );
        if (!topogram || topogram.execution_status !== "image_ready" || !topogram.range_confirmed) {
            throw new Error("已确认的定位像或扫描范围不再可用，请返回范围确认页");
        }
    }

    return targetSeries;
};

const validateExecuteModeForSession = (
    scanSession: ApiScanSessionDetail | null,
    executeMode: ExecuteMode,
    hasValidExecuteMode: boolean,
) => {
    if (!hasValidExecuteMode) {
        throw new Error("执行页扫描模式参数无效，请从扫描确认页重新进入");
    }
    if (!scanSession) {
        throw new Error("未找到当前扫描会话，请返回患者列表重新选择");
    }
    const expectedAcquisitionType = executeMode === "helical" || executeMode === "axial"
        ? "regular"
        : "gating";
    if (scanSession.acquisition_type !== expectedAcquisitionType) {
        throw new Error("扫描会话类型与执行页模式不一致，请从对应的扫描确认页重新进入");
    }
};

const HOLD_DURATION_MS = 3000;
const POSITIONING_TIMEOUT_MS = 8000;
const EXPOSURE_REQUEST_TIMEOUT_MS = 8000;
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
    basePath: "/dicom/cap/soft",
    count: 120,
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
    gated,
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
    gated: boolean;
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

                {showDicom && gated ? (
                    <div className="absolute inset-0">
                        <DicomViewer
                            imageUrls={imageUrls}
                            currentImageIndex={displayIndex}
                            activeTool="pan"
                            windowCenter={HELICAL_RESULT_SERIES.fallbackWindowLevel}
                            windowWidth={HELICAL_RESULT_SERIES.fallbackWindowWidth}
                        />
                    </div>
                ) : !gated ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,#1E293B_0%,#020617_68%)]">
                        <div className="relative flex h-[250px] w-[250px] items-center justify-center rounded-full border border-cyan-300/25 bg-slate-900/80 shadow-[0_0_70px_rgba(14,165,233,0.18)]">
                            <div
                                className="absolute rounded-full border border-cyan-200/30 bg-[radial-gradient(ellipse_at_46%_48%,rgba(226,232,240,0.5),rgba(71,85,105,0.38)_34%,rgba(15,23,42,0.92)_68%)] transition-all duration-150"
                                style={{
                                    width: `${148 + (currentSlice % 5) * 5}px`,
                                    height: `${190 - (currentSlice % 4) * 4}px`,
                                }}
                            />
                            <div className="absolute h-px w-[230px] bg-cyan-300/25" />
                            <div className="absolute h-[230px] w-px bg-cyan-300/25" />
                            <div className="relative z-10 rounded border border-cyan-300/30 bg-slate-950/75 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-cyan-100">
                                {t("scanFlow.physicalGuide.referenceSimulated")}
                            </div>
                        </div>
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
            {gated ? (
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
            ) : (
                <div className="flex h-[72px] shrink-0 items-center justify-between border-t border-[#B0C4DE]/70 bg-slate-50 px-5">
                    <div>
                        <div className="text-[11px] font-black text-slate-700">{t("scanFlow.postScout.axial")}</div>
                        <div className="mt-1 text-[10px] text-slate-500">{t("scanFlow.physicalGuide.referenceSimulated")}</div>
                    </div>
                    <div className="text-right text-[11px] font-bold tabular-nums text-[#1D4ED8]">
                        {t("scanFlow.live.tablePosition")} {displayBed} / {totalBeds || 1}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function HelicalExecuteScanScreen() {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useI18n();
    const initialCombinedPatientConfirm = (location.state as HelicalExecuteLocationState | null)?.showCombinedPatientConfirm === true;
    const [currentParams] = useSearchParams();
    const initialParamsRef = useRef<URLSearchParams | null>(null);
    if (initialParamsRef.current === null) {
        initialParamsRef.current = new URLSearchParams(currentParams);
    }
    const params = initialParamsRef.current;
    const routeContextChanged = currentParams.toString() !== params.toString();
    const requestedExecuteMode = params.get("mode");
    const hasValidExecuteMode = requestedExecuteMode === null
        || requestedExecuteMode === "helical"
        || requestedExecuteMode === "axial"
        || requestedExecuteMode === "gated_helical"
        || requestedExecuteMode === "gated_axial";
    const executeMode: ExecuteMode = hasValidExecuteMode
        ? (requestedExecuteMode ?? "helical")
        : "helical";
    const isGated = executeMode === "gated_helical" || executeMode === "gated_axial";
    const isGatedAxial = executeMode === "gated_axial";
    const isAxial = executeMode === "axial" || isGatedAxial;
    // 所有正式模拟执行模式都必须固定绑定同一患者、会话、目标序列和前置定位像。
    const isBoundExecution = true;
    const isHelicalDIBH = executeMode === "gated_helical";
    const parsedExpectedScanSessionId = Number(params.get("scanSessionId"));
    const expectedScanSessionId = isBoundExecution
        && Number.isInteger(parsedExpectedScanSessionId)
        && parsedExpectedScanSessionId > 0
        ? parsedExpectedScanSessionId
        : null;
    const targetSeriesIdParam = params.get("targetSeriesId");
    const parsedExpectedTargetSeriesId = Number(targetSeriesIdParam);
    const expectedTargetSeriesId = isBoundExecution
        && targetSeriesIdParam !== null
        && Number.isInteger(parsedExpectedTargetSeriesId)
        && parsedExpectedTargetSeriesId > 0
        ? parsedExpectedTargetSeriesId
        : null;
    const topogramIdParam = params.get("topogramId");
    const parsedExpectedTopogramId = Number(topogramIdParam);
    const expectedTopogramId: number | null | undefined = !isBoundExecution
        ? undefined
        : topogramIdParam === "none"
            ? null
            : topogramIdParam !== null
                && Number.isInteger(parsedExpectedTopogramId)
                && parsedExpectedTopogramId > 0
                ? parsedExpectedTopogramId
                : undefined;
    const targetType: DependentScanSeriesType = isAxial ? "axial" : "helical";
    const expectedExecutionBinding = useMemo<ScanExecutionBinding | null>(() => {
        if (
            !isBoundExecution
            || expectedScanSessionId === null
            || expectedTargetSeriesId === null
            || expectedTopogramId === undefined
        ) {
            return null;
        }
        return {
            scanSessionId: expectedScanSessionId,
            targetSeriesId: expectedTargetSeriesId,
            requiredTopogramId: expectedTopogramId,
        };
    }, [expectedScanSessionId, expectedTargetSeriesId, expectedTopogramId, isBoundExecution]);

    const [limbsHelicalResultSeries, setLimbsHelicalResultSeries] = useState<HelicalResultSeriesConfig | null>(null);

    const [stage, setStage] = useState<ScanStage>("idle");
    const [physicalTriggerAction, setPhysicalTriggerAction] = useState<PhysicalTriggerAction>("position");
    const [guideVisible, setGuideVisible] = useState(false);
    const [showCombinedPatientConfirm, setShowCombinedPatientConfirm] = useState(initialCombinedPatientConfirm);
    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });
    const [scanSession, setScanSession] = useState<ApiScanSessionDetail | null>(null);
    const helicalResultImageSourceId = useMemo<ApiScanSeriesImageSourceId | null>(() => {
        if (executeMode !== "helical") return null;
        if (isBrainHelicalScanSession(scanSession)) return "brain-helical-demo";
        const persistedTarget = scanSession?.series.find((series) => series.id === expectedTargetSeriesId);
        if (
            persistedTarget?.image_source_version === 1
            && (
                persistedTarget.image_source_id === "brain-helical-demo"
                || persistedTarget.image_source_id === "limbs-helical-demo"
                || persistedTarget.image_source_id === "qin-lung-helical-demo"
            )
        ) {
            return persistedTarget.image_source_id;
        }
        if (expectedTopogramId === null) return null;
        const topogramSource = scanSession?.series.find((series) => series.id === expectedTopogramId);
        if (!hasVerifiedSeriesImageSource(topogramSource)) return null;
        return resolveHelicalResultImageSource(topogramSource.image_source_id);
    }, [executeMode, expectedTargetSeriesId, expectedTopogramId, scanSession]);
    const helicalResultOverride = useMemo<HelicalResultSeriesConfig | undefined>(() => {
        if (helicalResultImageSourceId === "brain-helical-demo") return BRAIN_HELICAL_RESULT_SERIES;
        if (helicalResultImageSourceId === "limbs-helical-demo") return limbsHelicalResultSeries ?? undefined;
        return undefined;
    }, [helicalResultImageSourceId, limbsHelicalResultSeries]);
    const helicalResultImageSourceReady = executeMode !== "helical"
        || helicalResultImageSourceId === "brain-helical-demo"
        || helicalResultImageSourceId === "qin-lung-helical-demo"
        || (helicalResultImageSourceId === "limbs-helical-demo" && limbsHelicalResultSeries !== null);
    const selectedPatient = useMemo(() => loadSelectedPatient(), []);
    const [completedBeds, setCompletedBeds] = useState(0);
    const [executionError, setExecutionError] = useState<string | null>(null);
    const [finalizationState, setFinalizationState] = useState<FinalizationState>("idle");
    const [postExecutionDestination, setPostExecutionDestination] = useState<"viewer" | "next_series" | null>(null);
    const [postExecutionRoute, setPostExecutionRoute] = useState<"/image-viewer" | "/helical-confirm" | "/sequence-confirm" | "/fourd-confirm" | null>(null);
    const [finalizationAttempt, setFinalizationAttempt] = useState(0);
    const [sessionValidationState, setSessionValidationState] = useState<"loading" | "ready" | "error">("loading");
    const [isCancelling, setIsCancelling] = useState(false);
    const [triggerFailure, setTriggerFailure] = useState<{ title: string; message: string } | null>(null);
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
    const positioningTimerRef = useRef<number | null>(null);
    const positioningTimeoutRef = useRef<number | null>(null);
    const triggerRequestIdRef = useRef(0);
    const dibhMidScanPauseTimerRef = useRef<number | null>(null);
    const axialProgressTimerRef = useRef<number | null>(null);
    const axialWaitTimerRef = useRef<number | null>(null);
    const autoNavigateTimerRef = useRef<number | null>(null);
    const bedWaitTickRef = useRef<number | null>(null);
    const bedWaitStartRef = useRef<number | null>(null);
    const pendingBedIndexRef = useRef<number | null>(null);
    const bedAttemptsRef = useRef<Map<number, number>>(new Map());
    const dibhMidScanPauseFiredRef = useRef(false);
    const cancellationInFlightRef = useRef(false);
    const terminateActionIdRef = useRef<string | null>(null);
    const retryActionIdRef = useRef<string | null>(null);
    const returnToEditActionIdRef = useRef<string | null>(null);
    const [isRecoveryActionRunning, setIsRecoveryActionRunning] = useState(false);

    const boundTargetSeries = scanSession?.series.find(
        (series) => series.series_type === targetType
            && (!isBoundExecution || series.id === expectedExecutionBinding?.targetSeriesId),
    ) ?? null;
    const axialStepCount = boundTargetSeries?.axial_param?.step_count;
    const scanLengthMm = Number(
        isAxial
            ? boundTargetSeries?.axial_param?.scan_length ?? measurements.scanLength
            : params.get("scanLengthMm") ?? measurements.scanLength,
    );
    const totalBeds = useMemo(() => {
        if (isAxial && axialStepCount && Number.isFinite(axialStepCount) && axialStepCount > 0) {
            return Math.max(1, Math.round(axialStepCount));
        }
        if (!Number.isFinite(scanLengthMm) || scanLengthMm <= 0) return 1;
        if (executeMode === "axial") {
            const sliceInterval = boundTargetSeries?.axial_param?.slice_interval;
            if (!sliceInterval || !Number.isFinite(sliceInterval) || sliceInterval <= 0) return 1;
            return Math.max(1, Math.ceil(scanLengthMm / sliceInterval));
        }
        return Math.max(1, Math.ceil(scanLengthMm / GATED_AXIAL_BED_STEP_MM));
    }, [axialStepCount, boundTargetSeries?.axial_param?.slice_interval, executeMode, isAxial, scanLengthMm]);
    const threshold = Number(params.get("threshold") ?? "1.0");
    const direction = (params.get("direction") ?? "rising") as "rising" | "falling";
    const effectiveThreshold = activeThresholdOverride ?? threshold;

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

    const clearExecutionTimers = () => {
        clearHoldRaf();
        clearPositioningTimeout();
        if (positioningTimerRef.current !== null) {
            window.clearTimeout(positioningTimerRef.current);
            positioningTimerRef.current = null;
        }
        if (exposureTimerRef.current !== null) {
            window.clearTimeout(exposureTimerRef.current);
            exposureTimerRef.current = null;
        }
        if (dibhMidScanPauseTimerRef.current !== null) {
            window.clearTimeout(dibhMidScanPauseTimerRef.current);
            dibhMidScanPauseTimerRef.current = null;
        }
        if (axialProgressTimerRef.current !== null) {
            window.clearInterval(axialProgressTimerRef.current);
            axialProgressTimerRef.current = null;
        }
        if (axialWaitTimerRef.current !== null) {
            window.clearTimeout(axialWaitTimerRef.current);
            axialWaitTimerRef.current = null;
        }
        if (autoNavigateTimerRef.current !== null) {
            window.clearTimeout(autoNavigateTimerRef.current);
            autoNavigateTimerRef.current = null;
        }
        if (bedWaitTickRef.current !== null) {
            window.clearInterval(bedWaitTickRef.current);
            bedWaitTickRef.current = null;
        }
        pendingBedIndexRef.current = null;
    };

    useEffect(() => {
        if (!routeContextChanged) return;
        setSessionValidationState("error");
        setGuideVisible(false);
        setShowCombinedPatientConfirm(false);
        setExecutionError("执行页地址参数已变化；为避免跨会话写入，请从扫描确认页重新进入");
    }, [routeContextChanged]);

    const returnToExecuteConfirm = () => {
        navigate(
            isGatedAxial
                ? "/gated-axial-confirm"
                : isHelicalDIBH
                    ? "/gated-helical-confirm"
                    : isAxial
                        ? "/sequence-confirm"
                        : "/helical-confirm",
        );
    };

    const recoverTargetForRetry = async (returnToConfirmAfterRecovery = false) => {
        if (!expectedExecutionBinding?.scanSessionId || isRecoveryActionRunning) return;
        setIsRecoveryActionRunning(true);
        setExecutionError(null);
        try {
            const latestSession = await fetchSelectedScanSession({ preferCache: false });
            const targetSeries = validateBoundExecutionSession(
                latestSession,
                expectedExecutionBinding,
                targetType,
                loadSelectedScanSessionId(),
                loadSelectedPatient()?.id ?? null,
            );
            let recoveredSession = latestSession;
            let mustReturnToRangeConfirm = returnToConfirmAfterRecovery;
            if (targetSeries.execution_status === "running") {
                const actionId = returnToEditActionIdRef.current ?? createActionId();
                returnToEditActionIdRef.current = actionId;
                const result = await applyScanWorkflowAction(expectedExecutionBinding.scanSessionId, {
                    action_id: actionId,
                    action: "return_to_edit",
                    target_series_id: targetSeries.id,
                    reason: "Recover simulated execution after an uncertain or failed trigger request",
                });
                recoveredSession = result.scan_session;
                returnToEditActionIdRef.current = null;
                // return_to_edit invalidates the persisted topogram range confirmation.
                mustReturnToRangeConfirm = true;
            } else if (
                targetSeries.execution_status === "failed"
                || targetSeries.execution_status === "interrupted"
            ) {
                const actionId = retryActionIdRef.current ?? createActionId();
                retryActionIdRef.current = actionId;
                const result = await applyScanWorkflowAction(expectedExecutionBinding.scanSessionId, {
                    action_id: actionId,
                    action: "retry_series",
                    target_series_id: targetSeries.id,
                    reason: "User requested another simulated series attempt",
                });
                recoveredSession = result.scan_session;
                retryActionIdRef.current = null;
            } else if (targetSeries.execution_status !== "pending") {
                throw new Error("目标序列当前不能返回待执行状态");
            }

            setTriggerFailure(null);
            setScanSession(recoveredSession);
            setStage("idle");
            setPhysicalTriggerAction("position");
            setGuideVisible(true);
            if (mustReturnToRangeConfirm) {
                returnToExecuteConfirm();
            } else {
                setShowCombinedPatientConfirm(true);
            }
        } catch (error) {
            setExecutionError(error instanceof Error ? error.message : "序列状态恢复失败，请重试或终止检查");
        } finally {
            setIsRecoveryActionRunning(false);
        }
    };

    const exitTriggerFlowWithFailure = (failure: { title: string; message: string }) => {
        triggerRequestIdRef.current += 1;
        clearExecutionTimers();
        setGuideVisible(false);
        setShowCombinedPatientConfirm(false);
        setPhysicalTriggerAction("position");
        setStage("idle");
        setTriggerFailure(failure);
    };

    useEffect(() => {
        const handleDeviceError = (event: Event) => {
            const deviceError = (event as CustomEvent<DeviceErrorEvent>).detail;
            if (!deviceError || deviceError.error.severity === "warning") return;
            const selectedSessionId = isBoundExecution ? expectedScanSessionId : loadSelectedScanSessionId();
            if (isBoundExecution && selectedSessionId === null) return;
            if (deviceError.scan_session_id !== null && deviceError.scan_session_id !== selectedSessionId) return;
            exitTriggerFlowWithFailure({
                title: `设备异常：${deviceError.error.code}`,
                message: `${deviceError.error.message}。当前模拟定位/曝光请求已停止，请按设备提示处理后重新尝试。`,
            });
        };
        window.addEventListener(DEVICE_ERROR_RAISED_EVENT, handleDeviceError);
        return () => window.removeEventListener(DEVICE_ERROR_RAISED_EVENT, handleDeviceError);
    });

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
                const loadedScanSession = await fetchSelectedScanSession({ preferCache: false });
                validateExecuteModeForSession(loadedScanSession, executeMode, hasValidExecuteMode);
                if (!expectedExecutionBinding) {
                    throw new Error("执行页缺少完整的已确认扫描绑定，请返回范围确认页");
                }
                if (
                    !loadedScanSession
                    || loadSelectedScanSessionId() !== expectedExecutionBinding.scanSessionId
                    || loadedScanSession.id !== expectedExecutionBinding.scanSessionId
                    || loadedScanSession.patient_id !== (loadSelectedPatient()?.id ?? null)
                    || !matchesScanExecutionBinding(
                        buildScanSessionExecutionContext(loadedScanSession, targetType),
                        expectedExecutionBinding,
                    )
                ) {
                    throw new Error("患者、扫描会话或目标序列已切换，请返回患者列表重新选择");
                }
                if (loadedScanSession.status === "cancelled") {
                    throw new Error("当前扫描会话已终止，不能再次执行");
                }
                const boundTargetSeries = loadedScanSession.status === "completed"
                    ? loadedScanSession.series.find(
                        (series) => series.id === expectedExecutionBinding.targetSeriesId
                            && series.series_type === targetType,
                    ) ?? null
                    : validateBoundExecutionSession(
                        loadedScanSession,
                        expectedExecutionBinding,
                        targetType,
                        loadSelectedScanSessionId(),
                        loadSelectedPatient()?.id ?? null,
                    );
                if (!boundTargetSeries) throw new Error("当前扫描会话缺少已绑定的目标序列");
                if (boundTargetSeries.execution_status === "running") {
                    throw new Error("扫描序列仍标记为运行中；请先执行状态恢复或明确终止，不能重复触发");
                }
                if (boundTargetSeries.execution_status === "failed") {
                    throw new Error("扫描序列已失败；请通过明确的重试当前序列动作继续");
                }
                if (loadedScanSession.status === "completed" && boundTargetSeries.execution_status !== "image_ready") {
                    throw new Error("已完成会话的目标序列没有可用结果，不能进入查看");
                }
                const boundTopogram = expectedExecutionBinding.requiredTopogramId === null
                    ? null
                    : loadedScanSession.series.find(
                        (series) => series.id === expectedExecutionBinding.requiredTopogramId,
                    ) ?? null;
                if (executeMode === "helical" && boundTopogram) {
                    if (!boundTopogram.image_source_id || boundTopogram.image_source_version !== 1) {
                        throw new Error("定位像缺少可验证的模拟影像来源，请返回定位像步骤重新出图");
                    }
                    if (![
                        "head-stroke-topogram",
                        "head-dual-scout-demo",
                        "limbs-helical-demo",
                        "qin-lung-topogram",
                    ].includes(boundTopogram.image_source_id)) {
                        throw new Error("定位像影像来源与当前螺旋模拟不匹配，请返回定位像步骤重新确认");
                    }
                }
                if (executeMode === "helical" && boundTopogram?.image_source_id === "limbs-helical-demo") {
                    const manifest = await loadLimbsDicomDemoManifest();
                    const liveSeries = getLimbsDicomSeries(manifest, "thin-soft");
                    if (!liveSeries) throw new Error("下肢螺旋模拟影像清单缺少 thin-soft 序列");
                    if (cancelled) return;
                    setLimbsHelicalResultSeries({
                        count: liveSeries.count,
                        urls: liveSeries.urls,
                        fallbackWindowWidth: liveSeries.windowWidth ?? manifest.defaultWindowWidth,
                        fallbackWindowLevel: liveSeries.windowCenter ?? manifest.defaultWindowLevel,
                    });
                }

                if (isAxial) {
                    const axialParam = (boundTargetSeries
                        ?? loadedScanSession?.series.find((series) => series.series_type === "axial"))?.axial_param;
                    if (!axialParam) throw new Error("当前断层扫描序列缺少执行参数");
                    if (cancelled) return;

                    setMeasurements({
                        scanLength: String(axialParam.scan_length),
                        scoutFov: String(axialParam.fov),
                    });
                } else {
                    const helicalParam = (boundTargetSeries
                        ?? loadedScanSession?.series.find((series) => series.series_type === "helical"))?.helical_param;
                    if (!helicalParam) throw new Error("当前螺旋扫描序列缺少执行参数");
                    if (cancelled) return;

                    setMeasurements({
                        scanLength: String(helicalParam.scan_length),
                        scoutFov: String(helicalParam.fov),
                    });
                }
                if (!cancelled) {
                    setScanSession(loadedScanSession);
                    setSessionValidationState("ready");
                    if (boundTargetSeries.execution_status === "image_ready") setStage("completed");
                }
            } catch (error) {
                console.error("Failed to load helical execute parameters.", error);
                if (!cancelled) {
                    setScanSession(null);
                    setSessionValidationState("error");
                    setExecutionError(error instanceof Error ? error.message : "扫描会话加载失败");
                }
            }
        };

        void loadSessionMeasurements();

        return () => {
            cancelled = true;
        };
    }, [executeMode, expectedExecutionBinding, hasValidExecuteMode, isAxial, isBoundExecution, params, targetType]);

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
        let cancelled = false;
        const finish = async () => {
            setFinalizationState("saving");
            setPostExecutionDestination(null);
            setPostExecutionRoute(null);
            setExecutionError(null);
            try {
                const sessionId = expectedExecutionBinding?.scanSessionId ?? null;
                if (!sessionId || loadSelectedScanSessionId() !== sessionId) {
                    throw new Error("患者或扫描会话已切换，不能写回本次模拟扫描结果");
                }
                const latestScanSession = await fetchSelectedScanSession({ preferCache: false });
                validateExecuteModeForSession(latestScanSession, executeMode, hasValidExecuteMode);
                if (!latestScanSession || latestScanSession.patient_id !== (loadSelectedPatient()?.id ?? null)) {
                    throw new Error("患者与扫描会话不一致，不能写回本次模拟扫描结果");
                }
                if (!matchesScanExecutionBinding(
                    buildScanSessionExecutionContext(latestScanSession, targetType),
                    expectedExecutionBinding,
                )) {
                    throw new Error("扫描会话结构已更新，不能写回本次模拟扫描结果");
                }
                const targetSeries = latestScanSession.status === "completed"
                    ? latestScanSession.series.find(
                        (series) => series.id === expectedExecutionBinding?.targetSeriesId
                            && series.series_type === targetType,
                    ) ?? null
                    : validateBoundExecutionSession(
                        latestScanSession,
                        expectedExecutionBinding,
                        targetType,
                        loadSelectedScanSessionId(),
                        loadSelectedPatient()?.id ?? null,
                    );
                if (!targetSeries) throw new Error("当前扫描会话缺少已绑定的目标序列");
                if (targetSeries.execution_status === "running") {
                    if (targetType === "helical" && (!helicalResultImageSourceId || !helicalResultImageSourceReady)) {
                        throw new Error("螺旋模拟影像来源尚未完成验证，不能登记为可查看结果");
                    }
                    await updateScanSessionSeriesExecution(targetSeries.id, {
                        execution_status: "image_ready",
                        ...(targetType === "helical" && helicalResultImageSourceId ? {
                            image_source_id: helicalResultImageSourceId,
                            image_source_version: 1 as const,
                        } : {}),
                    });
                } else if (targetSeries.execution_status !== "image_ready") {
                    throw new Error("目标序列未处于可完成状态，请先处理扫描失败或重试动作");
                }
                const sessionAfterImageReady = await fetchSelectedScanSession({ preferCache: false });
                if (!sessionAfterImageReady) throw new Error("结果已登记，但无法重新读取扫描会话状态");
                const destination = resolvePostExecutionDestination(sessionAfterImageReady);
                if (destination.kind === "blocked") {
                    if (cancelled) return;
                    setScanSession(sessionAfterImageReady);
                    setFinalizationState("blocked");
                    setExecutionError("当前序列已出图，但会话仍有未完成序列；当前版本不能自动衔接该组合，请终止本次模拟检查，系统不会提前完成整个会话");
                    return;
                }
                if (destination.kind === "next_series") {
                    if (cancelled) return;
                    setScanSession(sessionAfterImageReady);
                    setPostExecutionDestination("next_series");
                    setPostExecutionRoute(destination.route);
                    setFinalizationState("succeeded");
                    autoNavigateTimerRef.current = window.setTimeout(() => {
                        navigate(destination.route);
                    }, AUTO_NAVIGATE_DELAY_MS);
                    return;
                }
                const completedSession = sessionAfterImageReady.status === "completed"
                    ? sessionAfterImageReady
                    : await completeScanSession(sessionId);
                if (completedSession.status !== "completed") {
                    throw new Error("扫描会话已结束或状态已变化，未覆盖原有终态");
                }
                if (loadSelectedScanSessionId() !== sessionId) {
                    throw new Error("当前选择已切换；原扫描会话已完成，请从患者列表重新打开结果");
                }
                if (cancelled) return;
                setScanSession(completedSession);
                setPostExecutionDestination("viewer");
                setPostExecutionRoute(destination.route);
                setFinalizationState("succeeded");
                autoNavigateTimerRef.current = window.setTimeout(() => {
                    // Keep an explicit viewer binding so the completed result
                    // remains available even if browser storage was cleared
                    // between acquisition and the viewer route.
                    navigate(destination.route, {
                        state: {
                            viewerKind: "standard",
                            scanSessionId: completedSession.id,
                            patientId: completedSession.patient_id,
                        },
                    });
                }, AUTO_NAVIGATE_DELAY_MS);
            } catch (error) {
                if (!cancelled) {
                    setFinalizationState("failed");
                    setExecutionError(error instanceof Error ? error.message : "扫描结果状态更新失败");
                }
            }
        };
        void finish();

        return () => {
            cancelled = true;
            if (autoNavigateTimerRef.current !== null) {
                window.clearTimeout(autoNavigateTimerRef.current);
                autoNavigateTimerRef.current = null;
            }
        };
    }, [executeMode, expectedExecutionBinding, finalizationAttempt, hasValidExecuteMode, helicalResultImageSourceId, helicalResultImageSourceReady, navigate, stage, targetType]);

    useEffect(() => {
        return () => {
            clearHoldRaf();
            clearDibhTimers();
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
            if (positioningTimerRef.current !== null) {
                window.clearTimeout(positioningTimerRef.current);
            }
            clearPositioningTimeout();
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
        }, isGatedAxial ? GATED_AXIAL_SLICE_INTERVAL_MS : 55);
    };

    const scheduleBedExposure = (targetIndex: number) => {
        // Clear any stale timers from a previous attempt at this or another bed.
        if (axialWaitTimerRef.current !== null) {
            window.clearTimeout(axialWaitTimerRef.current);
            axialWaitTimerRef.current = null;
        }
        stopBedWaitTick();

        setStage(isGatedAxial ? "enabled" : "exposing");
        setAxialWaitingForBreath(isGatedAxial);
        setBedWaitTimedOut(false);
        setBedWaitElapsedMs(0);
        setCurrentSlice(0);
        pendingBedIndexRef.current = targetIndex;
        setPendingBedIndex(targetIndex);

        if (!isGatedAxial) {
            setGuideVisible(false);
            axialWaitTimerRef.current = window.setTimeout(() => {
                axialWaitTimerRef.current = null;
                beginBedExposure();
            }, 180);
            return;
        }

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

    const cancelBoundGatedSessionAndReturn = async () => {
        const sessionId = expectedExecutionBinding?.scanSessionId;
        if (!sessionId) {
            setExecutionError("执行页缺少完整的已确认扫描绑定，无法终止当前检查");
            return;
        }
        if (cancellationInFlightRef.current) return;
        cancellationInFlightRef.current = true;
        setIsCancelling(true);
        try {
            const latestScanSession = await fetchSelectedScanSession({ preferCache: false });
            validateExecuteModeForSession(latestScanSession, executeMode, hasValidExecuteMode);
            const targetSeries = validateBoundExecutionSession(
                latestScanSession,
                expectedExecutionBinding,
                targetType,
                loadSelectedScanSessionId(),
                loadSelectedPatient()?.id ?? null,
            );
            const actionId = terminateActionIdRef.current ?? createActionId();
            terminateActionIdRef.current = actionId;
            const { scan_session: cancelledSession } = await applyScanWorkflowAction(sessionId, {
                action_id: actionId,
                action: "terminate_exam",
                target_series_id: targetSeries.id,
                reason: "User terminated the simulated acquisition before completion",
            });
            if (cancelledSession.status !== "cancelled") {
                throw new Error("当前扫描会话已经结束，未覆盖原有终态");
            }
            clearSelectedScanSessionId();
            navigate("/patients");
        } catch (error) {
            cancellationInFlightRef.current = false;
            setIsCancelling(false);
            setExecutionError(error instanceof Error ? error.message : "终止扫描会话失败，请重试");
        }
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
        setPhysicalTriggerAction("position");
        void cancelBoundGatedSessionAndReturn();
    };

    const triggerPositioningSequence = () => {
        clearHoldRaf();
        clearPositioningTimeout();
        setPhysicalTriggerAction("exposure");
        setStage("positioned");
    };

    const triggerScanSequence = async () => {
        if (routeContextChanged || sessionValidationState !== "ready") {
            setExecutionError("扫描执行上下文尚未通过校验，请从扫描确认页重新进入");
            return;
        }
        if (executeMode === "helical" && (!helicalResultImageSourceId || !helicalResultImageSourceReady)) {
            setExecutionError("螺旋模拟影像来源尚未完成验证，请返回扫描确认页检查定位像来源");
            return;
        }
        if (cancellationInFlightRef.current) {
            setExecutionError("正在终止当前扫描会话，请等待处理完成");
            return;
        }
        const requestId = ++triggerRequestIdRef.current;
        const sessionId = isBoundExecution ? expectedExecutionBinding?.scanSessionId ?? null : loadSelectedScanSessionId();
        setExecutionError(null);
        try {
            await Promise.race([
                (async () => {
                    if (isBoundExecution) {
                        if (!sessionId || loadSelectedScanSessionId() !== sessionId) {
                            throw new Error("患者或扫描会话已切换，扫描未启动");
                        }
                    }
                    const activeScanSession = isBoundExecution
                        ? await fetchSelectedScanSession({ preferCache: false })
                        : scanSession ?? await fetchSelectedScanSession({ preferCache: false });
                    validateExecuteModeForSession(activeScanSession, executeMode, hasValidExecuteMode);
                    const targetSeries = isBoundExecution
                        ? validateBoundExecutionSession(
                            activeScanSession,
                            expectedExecutionBinding,
                            targetType,
                            loadSelectedScanSessionId(),
                            loadSelectedPatient()?.id ?? null,
                        )
                        : activeScanSession?.series.find((series) => series.series_type === "helical");
                    if (sessionId && !targetSeries) throw new Error("当前扫描会话缺少待执行序列");
                    if (targetSeries && targetSeries.execution_status !== "pending") {
                        throw new Error("目标序列已被执行或需要先走明确的重试动作，不能重复启动");
                    }
                    const startedSession = sessionId ? await startScanSession(sessionId) : null;
                    if (isBoundExecution && startedSession?.status !== "in_progress") {
                        throw new Error("当前扫描会话已结束，扫描未启动");
                    }
                    if (targetSeries) await updateScanSessionSeriesExecution(targetSeries.id, { execution_status: "running" });
                })(),
                new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("扫描下发超时")), EXPOSURE_REQUEST_TIMEOUT_MS)),
            ]);
        } catch (error) {
            if (requestId !== triggerRequestIdRef.current) return;
            exitTriggerFlowWithFailure({ title: "扫描下发超时或失败", message: error instanceof Error ? error.message : "扫描前置条件校验失败" });
            return;
        }
        if (requestId !== triggerRequestIdRef.current) return;
        clearHoldRaf();
        setShowCombinedPatientConfirm(false);
        setFinalizationState("idle");
        setStage("enabled");
        setCompletedBeds(0);
        setCurrentSlice(0);
        setAxialWaitingForBreath(false);
        setBedWaitTimedOut(false);
        setBedWaitElapsedMs(0);
        setPendingBedIndex(null);

        if (isAxial) {
            if (isGatedAxial) {
                // Fresh gated run resets per-bed attempt history and any threshold override.
                bedAttemptsRef.current = new Map();
                setActiveThresholdOverride(null);
                setThresholdLowered(false);
            }

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
        setPhysicalTriggerAction("position");
        setDibhExposureProgress(0);
        setGuideVisible(true);
        void cancelBoundGatedSessionAndReturn();
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
        setPhysicalTriggerAction("position");
        setDibhExposureProgress(0);
        setGuideVisible(true);
        void cancelBoundGatedSessionAndReturn();
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
        if (routeContextChanged || sessionValidationState !== "ready") {
            setExecutionError("扫描执行上下文尚未通过校验，请从扫描确认页重新进入");
            return;
        }
        if (cancellationInFlightRef.current) {
            setExecutionError("正在终止当前扫描会话，请等待处理完成");
            return;
        }
        if (stage === "completed") {
            if (finalizationState === "succeeded" && postExecutionRoute) navigate(postExecutionRoute);
            return;
        }

        if (stage === "idle" || stage === "positioned") {
            if (isBoundExecution) {
                try {
                    validateBoundExecutionSession(
                        scanSession,
                        expectedExecutionBinding,
                        targetType,
                        loadSelectedScanSessionId(),
                        loadSelectedPatient()?.id ?? null,
                    );
                } catch (error) {
                    setExecutionError(error instanceof Error ? error.message : "扫描执行上下文校验失败");
                    return;
                }
            }
            setGuideVisible(false);
            setShowCombinedPatientConfirm(true);
        }
    };

    const startHold = () => {
        if (routeContextChanged || sessionValidationState !== "ready" || cancellationInFlightRef.current || (!guideVisible && !showCombinedPatientConfirm) || stage === "positioning" || stage === "enabled" || stage === "exposing" || stage === "paused" || stage === "rendering" || stage === "completed") {
            return;
        }

        if (physicalTriggerAction === "exposure") {
            void triggerScanSequence();
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
        if (stage !== "positioning") return;
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
        if (stage === "completed") {
            if (finalizationState === "failed") return t("scanFlow.finalization.retry");
            if (finalizationState !== "succeeded") return t("scanFlow.finalization.saving");
            if (postExecutionDestination === "next_series") return t("common.nextStep");
            return t("scanFlow.imageBrowser");
        }
        if (bedWaitTimedOut) return t("scanFlow.live.waitingTechnician");
        if (dibhTimedOut) return t("scanFlow.live.waitingTechnician");
        if (dibhMidScanPaused) return t("scanFlow.scanPausedWaiting");
        if (stage === "rendering") return t("scanFlow.imageReconstructing");
        if (stage === "exposing") return isGated ? t("scanFlow.physicalGuide.gatedExposure") : t("scanFlow.physicalGuide.scanning");
        if (stage === "positioning") return t("scanFlow.physicalGuide.moveToStart");
        if (stage === "positioned") return t("scanFlow.physicalGuide.pressAgainForExposure");
        if (stage === "enabled") {
            if (isGatedAxial && axialWaitingForBreath) return t("scanFlow.live.waitingStableRespiration");
            if (isHelicalDIBH) {
                if (dibhStage === "countdown") return t("scanFlow.dibh.countdown");
                if (dibhStage === "holding") return t("scanFlow.dibh.waitingStable");
                if (dibhStage === "stable") return t("scanFlow.dibh.stableReady");
            }
            return t("scanFlow.physicalGuide.scanReady");
        }
        return t("scanFlow.executeScan");
    })();
    // Only allow click on the bottom-right button at the very start (kick off
    // the guide overlay) and at the very end (navigate to image viewer). During
    // enabled / exposing / rendering, or while either gating dialog is
    // open, the button must be inert so it can't be mistaken for "click again
    // to trigger another scan".
    const executeButtonClickable =
        !routeContextChanged &&
        sessionValidationState === "ready" &&
        !isCancelling &&
        !bedWaitTimedOut &&
        !dibhTimedOut &&
        !dibhMidScanPaused &&
        (stage === "idle" || stage === "positioned" || (stage === "completed" && finalizationState === "succeeded"));
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
                stage === "rendering" || stage === "completed"
                    ? "done"
                    : physicalTriggerAction === "exposure" || stage === "enabled" || stage === "exposing" || stage === "paused"
                        ? "active"
                        : "pending",
        },
    ];
    const patientConfirmScanData = useMemo(() => {
        const targetSeries = scanSession?.series.find(
            (series) => series.series_type === targetType
                && (!isBoundExecution || series.id === expectedExecutionBinding?.targetSeriesId),
        );
        const targetParam = isAxial ? targetSeries?.axial_param : targetSeries?.helical_param;
        const formatDose = (value: number | null | undefined) => value == null ? "--" : value.toFixed(2);
        const fallbackSequence = isAxial
            ? isGatedAxial
                ? t("scanFlow.postScout.gatedAxial")
                : t("scanFlow.postScout.axial")
            : isHelicalDIBH
                ? t("scanFlow.postScout.gatedHelical")
                : t("scanFlow.postScout.helical");

        return {
            ctdi: formatDose(targetParam?.ctdi_vol),
            dlp: formatDose(targetParam?.dlp),
            protocol: scanSession?.name ?? "--",
            sequence: targetSeries?.series_label ?? fallbackSequence,
        };
    }, [expectedExecutionBinding, isAxial, isBoundExecution, isGatedAxial, isHelicalDIBH, scanSession, t, targetType]);
    const timeoutDirectionLabel = direction === "rising"
        ? t("scanFlow.gatingTimeout.directionRising")
        : t("scanFlow.gatingTimeout.directionFalling");
    const rightViewport = isAxial ? (
        <AxialRealtimeViewport
            gated={isGatedAxial}
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
                parameterPanelMode={isAxial ? "tomographicScan" : "helicalScan"}
                helicalParamOverrides={isAxial ? undefined : measurements}
                tomographicParamOverrides={isAxial ? measurements : undefined}
                rightViewportContent={rightViewport}
                rightViewportClassName={isAxial ? "flex-1 rounded-lg border border-[#B0C4DE] bg-white shadow-sm flex flex-col overflow-hidden relative" : undefined}
                readOnlyMode
                onExecuteScan={executeButtonClickable ? handleExecuteScanClick : undefined}
                executeButtonLabel={executeButtonLabel}
                executeButtonCompact={stage === "positioning"}
            />

            <div className={`absolute bottom-[84px] right-0 top-[88px] z-40 flex items-stretch transition-all duration-500 ${guideVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
                <PhysicalTriggerGuide
                    title={t("scanFlow.physicalGuide.title")}
                    description={isGated
                        ? t("scanFlow.physicalGuide.gatedTwoStepDescription")
                        : isAxial
                            ? t("scanFlow.physicalGuide.twoStepDescription")
                            : t("scanFlow.physicalGuide.helicalTwoStepDescription")}
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
                onClose={() => {
                    clearHoldRaf();
                    clearPositioningTimeout();
                    holdStartRef.current = null;
                    setShowCombinedPatientConfirm(false);
                    setGuideVisible(false);
                    setPhysicalTriggerAction("position");
                    setStage("idle");
                }}
                onConfirm={() => undefined}
                patientData={selectedPatient ? {
                    name: selectedPatient.name,
                    age: selectedPatient.age,
                    gender: selectedPatient.gender,
                    idNumber: "--",
                    patientId: selectedPatient.patientId,
                    checkType: patientConfirmScanData.sequence,
                    scanSequence: patientConfirmScanData.sequence,
                } : undefined}
                scanData={patientConfirmScanData}
                physicalGuide={{
                    title: t("scanFlow.physicalGuide.title"),
                    description: isGated
                        ? t("scanFlow.physicalGuide.gatedTwoStepDescription")
                        : isAxial
                            ? t("scanFlow.physicalGuide.twoStepDescription")
                            : t("scanFlow.physicalGuide.helicalTwoStepDescription"),
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

            {executionError && (
                <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-900/55 backdrop-blur-[1px]">
                    <div className="w-[440px] rounded-xl border border-[#EF4444]/60 bg-white shadow-2xl">
                        <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-[15px] font-black text-red-800">扫描无法继续</div>
                        <div className="px-6 py-5 text-[13px] leading-relaxed text-slate-600">{executionError}</div>
                        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            {finalizationState === "failed" ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setExecutionError(null);
                                        setFinalizationAttempt((attempt) => attempt + 1);
                                    }}
                                    className="rounded-md bg-[#1D4ED8] px-5 py-2 text-[12px] font-bold text-white"
                                >
                                    {t("scanFlow.finalization.retry")}
                                </button>
                            ) : finalizationState === "blocked" ? (
                                <button
                                    type="button"
                                    onClick={() => { void cancelBoundGatedSessionAndReturn(); }}
                                    disabled={isRecoveryActionRunning || isCancelling}
                                    className="rounded-md bg-[#B91C1C] px-5 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                                >
                                    终止检查
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => { void recoverTargetForRetry(true); }}
                                        disabled={isRecoveryActionRunning || isCancelling}
                                        className="rounded-md border border-blue-300 bg-white px-4 py-2 text-[12px] font-bold text-blue-700 disabled:opacity-50"
                                    >
                                        返回确认
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { void cancelBoundGatedSessionAndReturn(); }}
                                        disabled={isRecoveryActionRunning || isCancelling}
                                        className="rounded-md bg-[#B91C1C] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                                    >
                                        终止检查
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ScanTriggerFailureDialog
                failure={triggerFailure}
                onRetry={() => { void recoverTargetForRetry(false); }}
                onReturnToConfirm={() => { void recoverTargetForRetry(true); }}
            />

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
