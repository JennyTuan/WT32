import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generateMockScanResult, type FourDPostScanState } from "../lib/fourDTypes";
import {
    AlertTriangle,
    Check,
    CheckCircle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsUp,
    FilePlus,
    Info,
    Trash2,
} from "lucide-react";

import { loadSelectedPatient } from "../lib/patientSession";
import { loadSelectedScanSessionId } from "../lib/scanSession";
import { loadSelectedScanWorkflowPlans, type WorkflowSequenceType } from "../lib/scanWorkflowSession";
import { FourDScoutViewport } from "./HelicalScanConfirmScreen";
import { PatientConfirmationModal } from "./ScanConfirmScreen";
import AppHeader from "../components/AppHeader";
import type { PhysicalTriggerStep } from "../components/PhysicalTriggerGuide";
import ScanTriggerFailureDialog from "../components/ScanTriggerFailureDialog";
import { DEVICE_ERROR_RAISED_EVENT, type DeviceErrorEvent } from "../lib/deviceErrorEvents";
import { useI18n } from "../lib/i18nContext";

const HOLD_DURATION_MS = 3000;
const POSITIONING_TIMEOUT_MS = 8000;
const SCAN_DURATION_MS = 16000;
const FOUR_D_AUTO_NEXT_STEP_DELAY_MS = 700;
const BED_TRAVEL_MM = 19.2;

const FOURD_PARAMS = {
    bedMode: "OUT",
    position: "HFS",
    scanLength: "165.0",
    mA: "215",
    kV: "120",
    rotationTime: "1.0",
    focus: "Small",
    pitch: "0.500",
    fov: "500",
    phases: "10",
    acquisitionTime: "30 s",
    breathingMode: "free_breathing",
    triggerThreshold: "50%",
    ctdiVol: "40.95",
    dlp: "1334.97",
};

type ScanStage = "idle" | "positioning" | "positioned" | "enabled" | "exposing" | "paused" | "completed";
type PhysicalTriggerAction = "position" | "exposure";

interface Sequence {
    id: string;
    name: string;
    type: WorkflowSequenceType;
    steps: string[];
}

interface ProtocolGroup {
    id: string;
    name: string;
    sequences: Sequence[];
}

export default function FourDDiagnosticConfirmScreen() {
    const { t } = useI18n();
    const navigate = useNavigate();
    const selectedPatient = useMemo(() => loadSelectedPatient(), []);
    const workflowPlans = useMemo(() => loadSelectedScanWorkflowPlans(), []);

    const [laserActive, setLaserActive] = useState(false);
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
    const [showAbortConfirm, setShowAbortConfirm] = useState(false);
    const [showPatientConfirm, setShowPatientConfirm] = useState(false);
    const [physicalWorkflowReady, setPhysicalWorkflowReady] = useState(false);

    const [scanStage, setScanStage] = useState<ScanStage>("idle");
    const [physicalTriggerAction, setPhysicalTriggerAction] = useState<PhysicalTriggerAction>("position");
    const [scanStarted, setScanStarted] = useState(false);
    const [scanPaused, setScanPaused] = useState(false);
    const [scanCompleted, setScanCompleted] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [triggerFailure, setTriggerFailure] = useState<{ title: string; message: string } | null>(null);
    const [bedProgress, setBedProgress] = useState(0);
    const [dynamicParams, setDynamicParams] = useState({
        scanLength: Number(FOURD_PARAMS.scanLength),
        fov: Number(FOURD_PARAMS.fov),
    });
    const [breathingControls, setBreathingControls] = useState({
        minSpacing: 1.8,
        filterThreshold: 0.42,
        peakThreshold: 1.15,
        gain: 1.4,
        valleyThreshold: 0.35,
    });

    const [rawWaveData, setRawWaveData] = useState<number[]>(new Array(500).fill(100));
    const [filteredWaveData, setFilteredWaveData] = useState<number[]>(new Array(500).fill(100));
    const [metrics, setMetrics] = useState({ bpm: "14.2", peakErr: "1.6", freqErr: "1.8" });
    const [breathingDemoElapsedSec, setBreathingDemoElapsedSec] = useState(0);

    const holdRafRef = useRef<number | null>(null);
    const holdStartRef = useRef<number | null>(null);
    const positioningTimerRef = useRef<number | null>(null);
    const positioningTimeoutRef = useRef<number | null>(null);
    const scanRafRef = useRef<number | null>(null);
    const scanProgressRef = useRef(0);
    const autoNextTimerRef = useRef<number | null>(null);
    const postScanNavigationStartedRef = useRef(false);
    const waveRafRef = useRef<number | null>(null);
    const waveTimeRef = useRef(0);
    // eslint-disable-next-line react-hooks/purity
    const breathingDemoStartRef = useRef(Date.now());

    const buildGroups = useCallback((): ProtocolGroup[] => {
        if (workflowPlans.length === 0) {
            return [{
                id: "g1",
                name: t("scanFlow.fourD.defaultGroup"),
                sequences: [
                    { id: "s1", name: t("scanFlow.scout"), type: "scout", steps: [t("scanFlow.step.laserPosition"), t("scanFlow.step.parameterConfirm"), t("scanFlow.step.executeScan")] },
                    { id: "s2", name: t("scanFlow.fourD.mode"), type: "4d", steps: [t("scanFlow.step.parameterConfirm"), t("scanFlow.step.executeScan")] },
                ],
            }];
        }

        return workflowPlans.map((plan) => ({
            id: `group-${plan.id}`,
            name: plan.title,
            sequences: plan.sequences.map((sequence) => ({
                id: `group-${plan.id}-seq-${sequence.id}`,
                name: sequence.name,
                type: sequence.type,
                steps: sequence.type === "scout"
                    ? [t("scanFlow.step.laserPosition"), t("scanFlow.step.parameterConfirm"), t("scanFlow.step.executeScan")]
                    : [t("scanFlow.step.parameterConfirm"), t("scanFlow.step.executeScan")],
            })),
        }));
    }, [t, workflowPlans]);

    const groups = useMemo(() => buildGroups(), [buildGroups]);
    const allSequences = useMemo(() => groups.flatMap((group) => group.sequences), [groups]);
    const fourDSequenceId = useMemo(
        () => allSequences.find((sequence) => sequence.type === "4d")?.id ?? allSequences[0]?.id ?? null,
        [allSequences]
    );
    const [expandedSeqId, setExpandedSeqId] = useState<string | null>(fourDSequenceId);

    useEffect(() => {
        setExpandedSeqId(fourDSequenceId);
    }, [fourDSequenceId]);

    const activeStepIdx = scanStarted || scanCompleted ? 1 : 0;

    const clearHoldRaf = () => {
        if (holdRafRef.current !== null) {
            cancelAnimationFrame(holdRafRef.current);
            holdRafRef.current = null;
        }
    };

    const clearScanRaf = () => {
        if (scanRafRef.current !== null) {
            cancelAnimationFrame(scanRafRef.current);
            scanRafRef.current = null;
        }
    };

    const clearPositioningTimeout = () => {
        if (positioningTimeoutRef.current !== null) {
            window.clearTimeout(positioningTimeoutRef.current);
            positioningTimeoutRef.current = null;
        }
    };

    const exitTriggerFlowWithFailure = (failure: { title: string; message: string }) => {
        clearHoldRaf();
        clearPositioningTimeout();
        if (positioningTimerRef.current !== null) {
            window.clearTimeout(positioningTimerRef.current);
            positioningTimerRef.current = null;
        }
        setShowPatientConfirm(false);
        setPhysicalWorkflowReady(false);
        setPhysicalTriggerAction("position");
        setScanStage("idle");
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
                message: `${deviceError.error.message}。当前模拟定位/采集请求已停止，请按设备提示处理后重新尝试。`,
            });
        };
        window.addEventListener(DEVICE_ERROR_RAISED_EVENT, handleDeviceError);
        return () => window.removeEventListener(DEVICE_ERROR_RAISED_EVENT, handleDeviceError);
    });

    const bedSegmentCount = useMemo(
        () => Math.max(1, Math.ceil(dynamicParams.scanLength / BED_TRAVEL_MM)),
        [dynamicParams.scanLength]
    );

    const handleScanComplete = useCallback(() => {
        setScanStarted(false);
        setScanPaused(false);
        setScanCompleted(true);
        setScanStage("completed");
        scanProgressRef.current = 1;
        setScanProgress(1);
        setBedProgress(bedSegmentCount);
    }, [bedSegmentCount]);

    /** 扫描完成后点击"下一步"时的路由决策 */
    const handlePostScanNavigate = useCallback(() => {
        if (postScanNavigationStartedRef.current) return;
        postScanNavigationStartedRef.current = true;

        const scanResult = generateMockScanResult(
            bedSegmentCount,
            Number(FOURD_PARAMS.phases),
            dynamicParams.scanLength
        );
        const postScanState: FourDPostScanState = {
            scanResult,
            showSliceLoadingBeforeImageLoad: false,
        };

        if (scanResult.rescanOccurred) {
            // 先做重扫区域选择，再进图像浏览
            navigate("/fourd-rescan-select", { state: postScanState });
        } else {
            // 直接进入图像加载流程第一步
            navigate("/image-load", { state: postScanState });
        }
    }, [bedSegmentCount, dynamicParams.scanLength, navigate]);

    useEffect(() => {
        if (!scanCompleted) return;

        autoNextTimerRef.current = window.setTimeout(() => {
            handlePostScanNavigate();
        }, FOUR_D_AUTO_NEXT_STEP_DELAY_MS);

        return () => {
            if (autoNextTimerRef.current !== null) {
                window.clearTimeout(autoNextTimerRef.current);
                autoNextTimerRef.current = null;
            }
        };
    }, [handlePostScanNavigate, scanCompleted]);

    const handleCropBoxChange = useCallback(({ width, height }: { width: number; height: number }) => {
        setDynamicParams({
            scanLength: Number((height * 458.33).toFixed(1)),
            fov: Math.round(width * 892.86),
        });
    }, []);

    const breathingStability = useMemo(() => {
        const demoWarmupRemaining = Math.max(0, 10 - breathingDemoElapsedSec);
        if (demoWarmupRemaining > 0) {
            return {
                stable: false,
                label: t("scanFlow.fourD.breathingUnstable"),
                detail: t("scanFlow.fourD.stableAfter", { seconds: demoWarmupRemaining }),
            };
        }

        const recent = filteredWaveData.slice(-360);
        const extremaWindow = 6;
        const peaks: { index: number; value: number }[] = [];

        for (let index = extremaWindow; index < recent.length - extremaWindow; index += 1) {
            const value = recent[index];
            const neighbors = [
                ...recent.slice(index - extremaWindow, index),
                ...recent.slice(index + 1, index + extremaWindow + 1),
            ];
            const isPeak = neighbors.every((neighbor) => value > neighbor);
            if (isPeak && value > 620) peaks.push({ index, value });
        }

        const recentPeaks = peaks.slice(-4);
        if (recentPeaks.length < 3) {
            return { stable: false, label: t("scanFlow.fourD.breathingAcquiring"), detail: t("scanFlow.fourD.waitStablePeak") };
        }

        const intervals = recentPeaks.slice(1).map((peak, index) => peak.index - recentPeaks[index].index);
        const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
        const cv = (values: number[]) => {
            const avg = mean(values);
            if (avg <= 0) return 1;
            const variance = mean(values.map((value) => (value - avg) ** 2));
            return Math.sqrt(variance) / avg;
        };
        const intervalCv = cv(intervals);
        const amplitudeCv = cv(recentPeaks.map((peak) => peak.value));
        const stable = intervalCv < 0.18 && amplitudeCv < 0.08;

        return {
            stable,
            label: stable ? t("scanFlow.fourD.breathingStable") : t("scanFlow.fourD.breathingUnstable"),
            detail: stable ? t("scanFlow.executeScan") : t("scanFlow.fourD.waitStableBreath"),
        };
    }, [breathingDemoElapsedSec, filteredWaveData, t]);

    const triggerPositioningSequence = useCallback(() => {
        if (!physicalWorkflowReady) return;
        clearHoldRaf();
        clearPositioningTimeout();
        setPhysicalTriggerAction("exposure");
        setScanStage("positioned");
    }, [physicalWorkflowReady]);

    const triggerScanSequence = useCallback(() => {
        if (!physicalWorkflowReady) return;
        clearHoldRaf();
        setShowPatientConfirm(false);
        setPhysicalWorkflowReady(false);
        setScanStage("enabled");

        window.setTimeout(() => {
            setScanStage("exposing");
        }, 180);

        window.setTimeout(() => {
            setScanStarted(true);
            setScanPaused(false);
            setScanCompleted(false);
            postScanNavigationStartedRef.current = false;
            if (autoNextTimerRef.current !== null) {
                window.clearTimeout(autoNextTimerRef.current);
                autoNextTimerRef.current = null;
            }
            scanProgressRef.current = 0;
            setScanProgress(0);
            setBedProgress(0);
        }, 1200);
    }, [physicalWorkflowReady]);

    const startHold = () => {
        if (!showPatientConfirm || !physicalWorkflowReady || scanStage === "positioning" || scanStage === "enabled" || scanStage === "exposing" || scanStage === "completed") return;

        if (physicalTriggerAction === "exposure") {
            triggerScanSequence();
            return;
        }

        clearHoldRaf();
        holdStartRef.current = performance.now();
        setScanStage("positioning");
        clearPositioningTimeout();
        positioningTimeoutRef.current = window.setTimeout(() => {
            exitTriggerFlowWithFailure({ title: "定位移动超时", message: "未在预期时间内收到起始位到达结果，当前按键引导已关闭。" });
        }, POSITIONING_TIMEOUT_MS);

        const tick = (timestamp: number) => {
            const startedAt = holdStartRef.current ?? timestamp;
            const progress = Math.min((timestamp - startedAt) / HOLD_DURATION_MS, 1);

            if (progress >= 1) {
                triggerPositioningSequence();
                return;
            }

            holdRafRef.current = requestAnimationFrame(tick);
        };

        holdRafRef.current = requestAnimationFrame(tick);
    };

    const stopHold = () => {
        if (scanStage !== "positioning") return;
        clearHoldRaf();
        clearPositioningTimeout();
        holdStartRef.current = null;
        setScanStage("idle");
    };

    const toggleScanPause = () => {
        if (!scanStarted || scanCompleted) return;
        setScanPaused((paused) => {
            const nextPaused = !paused;
            setScanStage(nextPaused ? "paused" : "exposing");
            return nextPaused;
        });
    };

    useEffect(() => {
        if (!scanStarted || scanPaused) return;

        let lastTs: number | null = null;

        const tick = (timestamp: number) => {
            if (lastTs === null) lastTs = timestamp;
            const elapsed = timestamp - lastTs;
            lastTs = timestamp;
            const progress = Math.min(scanProgressRef.current + elapsed / SCAN_DURATION_MS, 1);
            scanProgressRef.current = progress;
            setScanProgress(progress);
            setBedProgress(Math.min(bedSegmentCount, Math.max(0, Math.ceil(progress * bedSegmentCount))));

            if (progress >= 1) {
                handleScanComplete();
                return;
            }

            scanRafRef.current = requestAnimationFrame(tick);
        };

        scanRafRef.current = requestAnimationFrame(tick);
        return clearScanRaf;
    }, [bedSegmentCount, handleScanComplete, scanPaused, scanStarted]);

    useEffect(() => {
        const tick = () => {
            waveTimeRef.current += 0.05;
            const t = waveTimeRef.current;
            const cycle = Math.sin(t);
            const filteredValue = 500 + cycle * 200 + Math.sin(t * 0.3) * 30 + (Math.random() - 0.5) * 5;
            const pulse = Math.pow(Math.max(0, Math.sin(t + 0.1)), 24) * 400;
            const rawValue = 480 + cycle * 80 + pulse + (Math.random() - 0.5) * 15;

            setRawWaveData((prev) => [...prev.slice(1), rawValue]);
            setFilteredWaveData((prev) => [...prev.slice(1), filteredValue]);
            setBreathingDemoElapsedSec(Math.floor((Date.now() - breathingDemoStartRef.current) / 1000));

            if (Math.random() > 0.98) {
                setMetrics({
                    bpm: (14 + Math.random() * 1.2).toFixed(1),
                    peakErr: (1.2 + Math.random() * 0.6).toFixed(1),
                    freqErr: (1.5 + Math.random() * 0.5).toFixed(1),
                });
            }

            waveRafRef.current = requestAnimationFrame(tick);
        };

        waveRafRef.current = requestAnimationFrame(tick);
        return () => {
            if (waveRafRef.current !== null) cancelAnimationFrame(waveRafRef.current);
        };
    }, []);

    useEffect(() => () => {
        clearHoldRaf();
        clearPositioningTimeout();
        clearScanRaf();
        if (positioningTimerRef.current !== null) {
            window.clearTimeout(positioningTimerRef.current);
        }
        if (autoNextTimerRef.current !== null) {
            window.clearTimeout(autoNextTimerRef.current);
        }
    }, []);

    const guideTitle =
        scanStage === "positioning" ? t("scanFlow.physicalGuide.keepHoldingPosition")
        : scanStage === "positioned" ? t("scanFlow.physicalGuide.pressAgainForExposure")
        : scanStage === "enabled" ? t("scanFlow.physicalGuide.enabled")
        : scanStage === "exposing" ? t("scanFlow.fourD.running")
        : scanStage === "paused" ? t("scanFlow.fourD.paused")
        : t("scanFlow.physicalGuide.holdGreenButton");

    const physicalTriggerSteps: PhysicalTriggerStep[] = [
        {
            id: "position",
            label: t("scanFlow.physicalGuide.stepPosition"),
            detail: t("scanFlow.physicalGuide.stepPositionDetail"),
            state: physicalTriggerAction === "position" && scanStage !== "completed" ? "active" : "done",
        },
        {
            id: "exposure",
            label: t("scanFlow.physicalGuide.stepExposure"),
            detail: t("scanFlow.physicalGuide.stepExposureDetail"),
            state:
                scanStage === "completed"
                    ? "done"
                    : physicalTriggerAction === "exposure" || scanStage === "enabled" || scanStage === "exposing" || scanStage === "paused"
                        ? "active"
                        : "pending",
        },
    ];

    const sidebarParams = [
        { label: t("scanFlow.inOutTable"), value: FOURD_PARAMS.bedMode, accent: false },
        { label: t("scanFlow.patientPosition"), value: FOURD_PARAMS.position, accent: false },
        { label: t("scanFlow.scanLength"), value: dynamicParams.scanLength.toFixed(1), accent: false },
        { label: "mA", value: FOURD_PARAMS.mA, accent: true },
        { label: "KV", value: FOURD_PARAMS.kV, accent: true },
        { label: t("scanFlow.rotationTime"), value: FOURD_PARAMS.rotationTime, accent: true },
        { label: t("scanFlow.fourD.focus"), value: FOURD_PARAMS.focus, accent: true },
        { label: "FOV", value: dynamicParams.fov.toString(), accent: true },
        { label: "CTDIvol", value: FOURD_PARAMS.ctdiVol, unit: "mGy", accent: false, dose: true },
        { label: "DLP", value: FOURD_PARAMS.dlp, unit: "mGy·cm", accent: false, dose: true },
    ];

    const currentBedDisplay = scanCompleted ? bedSegmentCount : scanStarted ? Math.max(1, bedProgress) : 0;
    const waveformExposureWidth = 96;
    const waveformExposureX = Math.max(0, Math.min(800 - waveformExposureWidth, scanProgress * (800 - waveformExposureWidth)));
    const thresholdY = (value: number) => 120 - (value / 1100) * 120;
    const upperThresholdY = thresholdY(500 + breathingControls.peakThreshold * 280);
    const lowerThresholdY = thresholdY(breathingControls.valleyThreshold * 680);
    const filteredWavePoints = filteredWaveData.map((value, index) => ({
        x: (index / (filteredWaveData.length - 1)) * 800,
        y: thresholdY(value),
        value,
        index,
    }));
    const waveformExtremaMarkers = filteredWavePoints.flatMap((point, index) => {
        const windowSize = 6;
        if (index < windowSize || index > filteredWavePoints.length - windowSize - 1) return [];

        const neighbors = [
            ...filteredWaveData.slice(index - windowSize, index),
            ...filteredWaveData.slice(index + 1, index + windowSize + 1),
        ];
        const isPeak = neighbors.every((value) => point.value > value);
        const isValley = neighbors.every((value) => point.value < value);

        if (!isPeak && !isValley) return [];

        return [{
            id: `${isPeak ? "peak" : "valley"}-${point.index}`,
            kind: isPeak ? "peak" : "valley",
            x: point.x,
            y: point.y,
        }];
    });
    const canExecuteScan = scanCompleted || scanStarted || breathingStability.stable;
    const primaryActionLabel = scanCompleted
        ? t("scanFlow.fourD.completeScan")
        : scanStarted
            ? (scanPaused ? t("scanFlow.continueExam") : t("scanFlow.fourD.pauseScan"))
            : t("scanFlow.executeScan");

    const renderSteps = (sequence: Sequence, isActiveSequence: boolean, isCompletedSequence: boolean) => (
        <div className="flex flex-col ml-12 mt-1.5 gap-2.5 relative pb-2.5">
            <div className="absolute left-[7px] top-2 bottom-6 w-[1px] bg-[#B0C4DE]" />
            {sequence.steps.map((step, idx) => {
                const isCompleted = isCompletedSequence || (isActiveSequence && idx < activeStepIdx);
                const isActive = !isCompletedSequence && isActiveSequence && idx === activeStepIdx;

                return (
                    <div key={`${sequence.id}-step-${idx}`} className="flex items-center gap-3 z-10">
                        {isCompleted ? (
                            <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                                <CheckCircle size={16} className="text-[#66BB6A]" />
                            </div>
                        ) : isActive ? (
                            <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-[#4D94FF] translate-x-[1px] shadow-[0_0_8px_rgba(77,148,255,0.3)]" />
                        ) : (
                            <div className="w-3.5 h-3.5 rounded-full bg-white border border-[#B0C4DE] translate-x-[1px]" />
                        )}
                        <span className={`text-[12px] font-bold ${isActive ? "text-[#37474F]" : "text-[#37474F]/60"}`}>
                            {step}
                        </span>
                    </div>
                );
            })}
        </div>
    );

    const renderControlSlider = (
        label: string,
        value: number,
        min: number,
        max: number,
        step: number,
        onChange: (value: number) => void,
        unit = ""
    ) => (
        <label className="block rounded-md border border-[#DCE6F2] bg-white px-1.5 py-1 shadow-sm">
            <div className="mb-px flex items-center justify-between text-[8px] font-bold leading-none text-[#546E7A]">
                <span className="tracking-tight">{label}</span>
                <span className="font-mono text-[#37474F]">
                    {value.toFixed(step < 0.1 ? 2 : 1)}{unit}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="h-3 w-full accent-[#4D94FF]"
            />
        </label>
    );

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative text-[#37474F] font-sans select-none">
            <AppHeader
                patientName={selectedPatient?.name ?? null}
                patientId={selectedPatient?.patientId ?? null}
                laserActive={laserActive}
                onLaserToggle={() => setLaserActive((prev) => !prev)}
            />

            <main className="flex-1 flex overflow-hidden p-2 gap-1">
                <aside className="w-[240px] bg-white rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden shrink-0">
                    <div className="h-[48px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-3 shrink-0">
                        <div className="flex items-center gap-2">
                            <button className="p-1.5 text-[#546E7A] hover:bg-[#EEF2F9] rounded transition-all"><FilePlus size={18} /></button>
                            <button className="p-1.5 text-[#90A4AE] opacity-40 cursor-not-allowed rounded"><Trash2 size={18} /></button>
                        </div>
                        <button onClick={() => setIsTreeCollapsed((prev) => !prev)} className="p-1.5 text-[#4D94FF] hover:bg-[#EEF2F9] rounded transition-all">
                            {isTreeCollapsed ? <ChevronDown size={20} /> : <ChevronsUp size={20} />}
                        </button>
                    </div>

                    <div className={`border-b border-[#EEF2F9] transition-all duration-300 ${isTreeCollapsed ? "h-[48px] opacity-40 grayscale overflow-hidden" : "h-[220px] shrink-0"}`}>
                        <div className="flex items-center justify-between px-3 pt-2 pb-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#64748B]">{t("scanFlow.fourD.scanQueue")}</span>
                            <span className="text-[9px] font-bold text-[#94A3B8]">{t("scanFlow.fourD.groupCount", { count: groups.length })}</span>
                        </div>
                        <div className="h-[calc(100%-28px)] overflow-y-auto px-2 pb-2 flex flex-col gap-0">
                        {groups.map((group) => (
                            <div key={group.id} className="flex flex-col">
                                <div className="flex items-center gap-2 px-2 py-1.5 text-[#37474F] cursor-pointer hover:bg-[#EEF2F9] rounded-md transition-all">
                                    <ChevronDown size={14} className="opacity-40" />
                                    <div className="w-3.5 h-3.5 rounded border-2 bg-[#4D94FF] border-[#4D94FF] flex items-center justify-center shrink-0">
                                        <Check size={9} className="text-white stroke-[3]" />
                                    </div>
                                    <span className="text-[13px] font-bold truncate text-[#4D94FF]">{group.name}</span>
                                </div>

                                <div className="flex flex-col">
                                    {group.sequences.map((sequence) => {
                                        const isScout = sequence.type === "scout";
                                        const isFourD = sequence.id === fourDSequenceId || sequence.type === "4d";
                                        const isFourDCompleted = isFourD && scanCompleted;
                                        const isFourDActive = isFourD && !scanCompleted;
                                        const isExpanded = expandedSeqId === sequence.id;

                                        return (
                                            <div key={sequence.id}>
                                                <div
                                                    onClick={() => setExpandedSeqId(isExpanded ? null : sequence.id)}
                                                    className={`flex items-center gap-2 px-3 rounded-lg mb-1 transition-all relative cursor-pointer border h-[28px] ${
                                                        isFourDActive
                                                            ? "bg-[#4D94FF] border-[#4D94FF] text-white shadow-md"
                                                            : isFourDCompleted
                                                                ? "bg-[#E8F5E9] border-[#A5D6A7] text-[#2E7D32]"
                                                            : isScout
                                                                ? "bg-[#E8F5E9] border-[#A5D6A7] text-[#2E7D32]"
                                                                : "bg-transparent border-transparent text-[#546E7A] hover:bg-[#EEF2F9]"
                                                    }`}
                                                >
                                                    {isExpanded
                                                        ? <ChevronDown size={14} className={isFourDActive ? "text-white/70" : isScout || isFourDCompleted ? "text-[#2E7D32]/70" : "text-gray-400"} />
                                                        : <ChevronRight size={14} className={isFourDActive ? "text-white/70" : isScout || isFourDCompleted ? "text-[#2E7D32]/70" : "text-gray-400"} />}
                                                    <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 ${
                                                        isScout || isFourDCompleted
                                                            ? "bg-[#66BB6A] border-[#66BB6A]"
                                                            : isFourDActive
                                                                ? "bg-white/20 border-white/30"
                                                                : "bg-white border-[#B0C4DE]"
                                                    }`}>
                                                        {(isScout || isFourDCompleted) && <Check size={9} className="text-white stroke-[3]" />}
                                                    </div>
                                                    <span className="text-[13px] font-bold">{sequence.name}</span>
                                                </div>

                                                {isExpanded && renderSteps(sequence, isFourDActive, isScout || isFourDCompleted)}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 bg-[#F8FAFC] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#64748B]">{t("scanFlow.scanParameters")}</span>
                            <span className="text-[9px] font-bold text-[#94A3B8]">4D</span>
                        </div>
                        <div className="flex-1 px-2 pb-2 flex flex-col gap-2 overflow-y-auto overscroll-contain">
                            <div className="grid grid-cols-2 gap-2">
                                {sidebarParams.map(({ label, value, accent, unit, dose }) => (
                                    <div
                                        key={label}
                                        className={`min-h-[38px] p-1.5 bg-white border rounded-md flex flex-col items-center justify-center shadow-sm ${
                                            dose ? "border-[#FB923C]/70 bg-[#FFF7ED] ring-1 ring-[#FED7AA] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_14px_rgba(251,146,60,0.16)]" : "border-[#B0C4DE]/40"
                                        } ${
                                            accent ? "group hover:border-[#4D94FF] cursor-pointer" : ""
                                        }`}
                                    >
                                        <span className={`text-[9px] font-black uppercase tracking-tighter ${dose ? "text-[#C2410C]/80" : "text-[#90A4AE]"}`}>{label}</span>
                                        {accent ? (
                                            <div className="flex items-center gap-1 mt-[1px]">
                                                <span className="text-[13px] font-black text-[#37474F]">{value}</span>
                                                <ChevronDown size={9} className="text-[#90A4AE] group-hover:text-[#4D94FF]" />
                                            </div>
                                        ) : (
                                            <div className="mt-[1px] flex items-baseline gap-1">
                                                <span className={`font-black ${dose ? "text-[14px] text-[#EA580C]" : "text-[13px] text-[#37474F]"}`}>{value}</span>
                                                {unit && <span className={`text-[8px] font-bold ${dose ? "text-[#C2410C]/70" : "text-[#90A4AE]"}`}>{unit}</span>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="px-2 pb-2 flex justify-center shrink-0">
                            <button className="h-[32px] w-full rounded-md text-[10px] font-bold flex items-center justify-center gap-1 border border-[#B0C4DE] bg-white text-[#4D94FF] hover:bg-blue-50 active:scale-95 shadow-sm transition-all">
                                <Info size={14} /> {t("scanFlow.parameterDetails")}
                            </button>
                        </div>
                    </div>
                </aside>

                <section className="flex-1 min-w-0 flex flex-col overflow-hidden rounded-md border border-[#B0C4DE]/40 bg-white shadow-sm">
                    <div className="min-h-0 flex-1 overflow-hidden bg-black">
                        <div className="relative h-full">
                            <div className="absolute inset-0 overflow-hidden bg-black">
                                <FourDScoutViewport
                                    onCropBoxChange={handleCropBoxChange}
                                    isScanning={scanStarted}
                                    revealY={scanProgress}
                                    enableImageTools
                                />
                            </div>
                        </div>
                    </div>

                    <div className="h-px shrink-0 bg-[#B0C4DE]/70" />

                    <div className="h-[150px] shrink-0 bg-white flex overflow-hidden">
                        <div className="flex-1 relative overflow-hidden">
                            <div className="pointer-events-none absolute left-3 top-1.5 text-[8px] font-black tracking-[0.18em] text-[#475569] opacity-80 uppercase">
                                RESP SIGNAL MONITORING
                            </div>

                            <div className="absolute right-2 top-1.5 flex gap-1.5 z-10">
                                <div className={`px-2 py-0.5 rounded border shadow-sm flex items-center gap-1.5 min-w-[86px] ${
                                    breathingStability.stable
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                        : "bg-amber-50 border-amber-200 text-amber-700"
                                }`}>
                                    <span className={`h-2 w-2 rounded-full ${
                                        breathingStability.stable ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.65)]" : "bg-amber-500 animate-pulse"
                                    }`} />
                                    <span className="text-[9px] font-black leading-none">{breathingStability.label}</span>
                                </div>
                                {[
                                    { label: "BPM", value: metrics.bpm },
                                    { label: "PEAK ERR", value: `${metrics.peakErr}%` },
                                    { label: "FREQ ERR", value: `${metrics.freqErr}%` },
                                ].map(({ label, value }) => (
                                    <div key={label} className="px-1.5 py-0.5 rounded bg-white shadow-sm border border-[#B0C4DE]/50 flex flex-col items-center min-w-[50px]">
                                        <span className="text-[7px] font-black text-[#94A3B8] uppercase tracking-wider">{label}</span>
                                        <span className="text-[11px] font-bold text-[#1E293B] leading-tight">{value}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="absolute inset-x-2 top-6 bottom-6 flex flex-col justify-between pointer-events-none opacity-20">
                                {[1100, 800, 500, 200, 0].map((value) => (
                                    <div key={value} className="flex items-center gap-2">
                                        <span className="text-[9px] w-7 text-right font-mono font-black text-[#64748B]">{value}</span>
                                        <div className="flex-1 h-[0.5px] bg-[#94A3B8]" />
                                    </div>
                                ))}
                            </div>

                            <div className="absolute left-0 right-0 top-5 bottom-6 flex flex-col justify-end px-3">
                                <svg viewBox="0 0 800 120" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="fourd-wave-fill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.18" />
                                            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.01" />
                                        </linearGradient>
                                    </defs>
                                    {scanStarted && (
                                        <rect
                                            x={waveformExposureX}
                                            y="0"
                                            width={waveformExposureWidth}
                                            height="120"
                                            fill="#F59E0B"
                                            opacity="0.18"
                                            rx="6"
                                        />
                                    )}
                                    <line x1="0" y1="60" x2="800" y2="60" stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
                                    <line x1="0" y1={upperThresholdY} x2="800" y2={upperThresholdY} stroke="#EF4444" strokeWidth="1.4" strokeDasharray="8 5" opacity="0.82" />
                                    <line x1="0" y1={lowerThresholdY} x2="800" y2={lowerThresholdY} stroke="#F59E0B" strokeWidth="1.4" strokeDasharray="8 5" opacity="0.82" />
                                    <text x="6" y={upperThresholdY - 4} fill="#EF4444" fontSize="10" fontWeight="800">
                                        Upper Threshold
                                    </text>
                                    <text x="6" y={lowerThresholdY - 4} fill="#F59E0B" fontSize="10" fontWeight="800">
                                        Lower Threshold
                                    </text>
                                    <path
                                        d={`M ${rawWaveData.map((value, index) => `${(index / (rawWaveData.length - 1)) * 800},${120 - (value / 1100) * 120}`).join(" L ")}`}
                                        fill="none"
                                        stroke="#64748B"
                                        strokeWidth="1"
                                        className="opacity-30"
                                    />
                                    <path
                                        d={`M 0,120 L ${filteredWavePoints.map((point) => `${point.x},${point.y}`).join(" L ")} L 800,120 Z`}
                                        fill="url(#fourd-wave-fill)"
                                    />
                                    <path
                                        d={`M ${filteredWavePoints.map((point) => `${point.x},${point.y}`).join(" L ")}`}
                                        fill="none"
                                        stroke="#2563EB"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    {waveformExtremaMarkers.map((marker) => (
                                        <circle
                                            key={marker.id}
                                            cx={marker.x}
                                            cy={marker.y}
                                            r={marker.kind === "peak" ? 4.2 : 3.8}
                                            fill={marker.kind === "peak" ? "#2563EB" : "#DC2626"}
                                            stroke="#FFFFFF"
                                            strokeWidth="1.3"
                                        />
                                    ))}
                                </svg>
                            </div>

                            <div className="absolute inset-x-3 bottom-0.5 flex items-center gap-2">
                                <span className="text-[8px] font-black text-[#475569] uppercase opacity-70 shrink-0">{t("scanFlow.fourD.bedProgress")}</span>
                                <div className="flex flex-1 gap-1 items-end h-3">
                                    {Array.from({ length: bedSegmentCount }, (_, index) => {
                                        const isCompletedSegment = scanCompleted || index < bedProgress;
                                        const isActiveSegment = scanStarted && !scanPaused && !scanCompleted && index === bedProgress;
                                        return (
                                            <div key={index} className="flex-1 flex flex-col gap-0.5">
                                                <div className={`h-1.5 w-full rounded-sm transition-all duration-500 ${
                                                    isCompletedSegment
                                                        ? "bg-[#3B82F6]"
                                                        : isActiveSegment
                                                            ? "bg-[#93C5FD] animate-pulse"
                                                            : "bg-[#E2E8F0]"
                                                }`} />
                                                <span className={`text-[7px] text-center font-bold font-mono ${
                                                    isActiveSegment ? "text-[#3B82F6]" : "text-[#94A3B8]"
                                                }`}>
                                                    {index + 1}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="text-[9px] font-mono font-bold text-[#475569] shrink-0">
                                    {currentBedDisplay}/{bedSegmentCount}
                                </div>
                            </div>
                        </div>

                        <div className="w-[230px] shrink-0 border-l border-[#B0C4DE]/60 bg-[#F8FAFC] px-2 py-1 flex flex-col justify-center">
                            <div className="grid grid-cols-2 gap-1">
                                {renderControlSlider(t("scanFlow.fourD.minSpacing"), breathingControls.minSpacing, 0.5, 5, 0.1, (value) => {
                                    setBreathingControls((prev) => ({ ...prev, minSpacing: value }));
                                }, " s")}
                                {renderControlSlider(t("scanFlow.fourD.filterThreshold"), breathingControls.filterThreshold, 0.1, 1, 0.01, (value) => {
                                    setBreathingControls((prev) => ({ ...prev, filterThreshold: value }));
                                })}
                                {renderControlSlider(t("scanFlow.fourD.peakThreshold"), breathingControls.peakThreshold, 0.5, 2.5, 0.05, (value) => {
                                    setBreathingControls((prev) => ({ ...prev, peakThreshold: value }));
                                })}
                                {renderControlSlider(t("scanFlow.fourD.gain"), breathingControls.gain, 0.5, 3, 0.1, (value) => {
                                    setBreathingControls((prev) => ({ ...prev, gain: value }));
                                })}
                                {renderControlSlider(t("scanFlow.fourD.valleyThreshold"), breathingControls.valleyThreshold, 0.1, 0.8, 0.01, (value) => {
                                    setBreathingControls((prev) => ({ ...prev, valleyThreshold: value }));
                                })}
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10">
                <div className="flex-1">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-solid shadow-sm transition-all uppercase text-[13px] active:scale-95"
                    >
                        <ChevronLeft size={20} /> {t("common.previousStep")}                    </button>
                </div>

                <div className="flex-1 flex justify-center">
                    {!scanCompleted && (
                        <button
                            onClick={() => setShowAbortConfirm(true)}
                            className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#F57C00] font-bold rounded-md border-2 border-[#F57C00] hover:bg-orange-50 transition-all uppercase text-[13px] shadow-sm active:scale-95"
                        >
                            <AlertTriangle size={20} /> {t("scanFlow.abortExam")}                        </button>
                    )}
                </div>

                <div className="flex-1 flex justify-end">
                    <button
                        disabled={!canExecuteScan}
                        onClick={() => {
                            if (scanCompleted) {
                                handlePostScanNavigate();
                                return;
                            }
                            if (scanStarted) {
                                toggleScanPause();
                                return;
                            }
                            if (!breathingStability.stable) return;
                            if (scanStage === "idle") {
                                setPhysicalTriggerAction("position");
                            }
                            setPhysicalWorkflowReady(true);
                            setShowPatientConfirm(true);
                        }}
                        className={`flex items-center gap-2 px-10 h-[52px] font-bold rounded-md shadow-lg transition-all uppercase text-[13px] active:scale-95 ${
                            !canExecuteScan
                                ? "bg-gray-300 text-white cursor-not-allowed shadow-none active:scale-100"
                                : scanStarted && !scanPaused
                                    ? "bg-[#F57C00] text-white hover:bg-orange-600"
                                : "bg-[#4D94FF] text-white hover:bg-blue-600"
                        }`}
                        title={scanCompleted ? undefined : breathingStability.detail}
                    >
                        {primaryActionLabel} <ChevronRight size={20} />
                    </button>
                </div>
            </footer>

            <PatientConfirmationModal
                isOpen={showPatientConfirm}
                onClose={() => {
                    setShowPatientConfirm(false);
                    setPhysicalWorkflowReady(false);
                    clearHoldRaf();
                    holdStartRef.current = null;
                }}
                onConfirm={() => setShowPatientConfirm(false)}
                patientData={{
                    name: selectedPatient?.name ?? "--",
                    age: selectedPatient?.age ?? 45,
                    gender: selectedPatient?.gender ?? "--",
                    idNumber: "--",
                    patientId: selectedPatient?.patientId ?? "--",
                    checkType: selectedPatient?.checkType ?? t("scanFlow.fourD.mode"),
                    scanSequence: t("scanFlow.fourD.mode"),
                }}
                scanData={{
                    ctdi: FOURD_PARAMS.ctdiVol,
                    dlp: FOURD_PARAMS.dlp,
                    protocol: t("scanFlow.fourD.mode"),
                    sequence: t("scanFlow.fourD.mode"),
                }}
                physicalGuide={{
                    title: t("scanFlow.physicalGuide.title"),
                    description: t("scanFlow.physicalGuide.fourDTwoStepDescription"),
                    guideTitle,
                    triggerLabel: t("scanFlow.physicalGuide.triggerLabel"),
                    emergencyLabel: t("scanFlow.physicalGuide.referenceEmergency"),
                    simulatedLabel: t("scanFlow.physicalGuide.referenceSimulated"),
                    steps: physicalTriggerSteps,
                    onHoldStart: startHold,
                    onHoldEnd: stopHold,
                    disabled: !physicalWorkflowReady || scanStage === "exposing" || scanStage === "completed",
                    buttonActive: scanStage === "positioning" || scanStage === "enabled" || scanStage === "exposing",
                }}
            />

            <ScanTriggerFailureDialog
                failure={triggerFailure}
                onRetry={() => {
                    setTriggerFailure(null);
                    setPhysicalTriggerAction("position");
                    setScanStage("idle");
                    setPhysicalWorkflowReady(true);
                    setShowPatientConfirm(true);
                }}
                onReturnToConfirm={() => navigate("/scout-execute")}
            />

            {showAbortConfirm && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl border border-[#FFE082] w-[360px] overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 bg-[#FFF8E1] border-b border-[#FFE082]">
                            <div className="w-10 h-10 rounded-full bg-[#F57C00]/15 flex items-center justify-center shrink-0">
                                <AlertTriangle size={20} className="text-[#F57C00]" />
                            </div>
                            <div>
                                <div className="text-[15px] font-black text-[#37474F]">{t("scanFlow.abortExam")}</div>
                                <div className="text-[12px] text-[#78909C] mt-0.5">{t("scanFlow.fourD.abortQuestion")}</div>
                            </div>
                        </div>
                        <div className="px-5 py-3">
                            <p className="text-[13px] text-[#546E7A] leading-relaxed">
                                {t("scanFlow.abortBodyStart")}<span className="font-bold text-[#37474F]">{t("scanFlow.fourD.abortBodyStrong")}</span>{t("scanFlow.fourD.abortBodyEnd")}                            </p>
                        </div>
                        <div className="flex gap-2 px-5 pb-4">
                            <button
                                onClick={() => setShowAbortConfirm(false)}
                                className="flex-1 h-[40px] bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg text-[13px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                {t("common.cancel")}
                            </button>
                            <button
                                onClick={() => navigate("/patients")}
                                className="flex-1 h-[40px] bg-[#F57C00] text-white font-bold rounded-lg text-[13px] hover:bg-orange-600 shadow-md transition-all active:scale-95"
                            >
                                {t("scanFlow.confirmAbort")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
