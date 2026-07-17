import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ScanConfirmScreen from "./ScanConfirmScreen";
import GatingWaveformPanel from "../components/GatingWaveformPanel";
import GatingMonitorPanel from "../components/GatingMonitorPanel";
import { FourDScoutViewport } from "./HelicalScanConfirmScreen";
import { fetchSelectedScanSession, loadSelectedScanSessionId, updateScanSessionSeriesExecution } from "../lib/scanSession";
import type { ApiScanSessionSeries } from "../lib/scanSession";
import {
    buildScanSessionExecutionContext,
    findRequiredTopogram,
    isScanExecutionReady,
    isSameScanSessionExecutionContext,
    isTerminalScanSessionStatus,
    isTopogramDependencyReady,
} from "../lib/scanSeriesPrerequisites";
import type { ScanSessionExecutionContext } from "../lib/scanSeriesPrerequisites";
import { loadSelectedPatient } from "../lib/patientSession";
import { useI18n } from "../lib/i18nContext";
import type { TranslationKey } from "../lib/i18n";

type BreathingMode = "free_breathing" | "breath_hold_inspiration";
type TargetPhase = "max_inspiration" | "max_expiration" | "custom";
type TriggerDirection = "rising" | "falling";

const BED_STEP_MM = 19.2;

const TARGET_PHASE_OPTIONS: { value: TargetPhase; labelKey: TranslationKey; threshold: number; direction: TriggerDirection }[] = [
    { value: "max_inspiration", labelKey: "scanFlow.gatingPhase.maxInspiration", threshold: 1.0, direction: "rising" },
    { value: "max_expiration", labelKey: "scanFlow.gatingPhase.maxExpiration", threshold: -1.0, direction: "falling" },
    { value: "custom", labelKey: "scanFlow.gatingPhase.custom", threshold: 0.5, direction: "rising" },
];

/**
 * Gated axial confirm — supports free-breathing (threshold-crossing) and DIBH branches.
 * Free-breathing branch mirrors 4D layout: TomographicScoutViewport (with draggable
 * range box) on top of GatingWaveformPanel; gating-specific params live in the
 * left aside under the standard scan-parameter card grid.
 *   Bed step is fixed at 19.2 mm (detector collimation), not configurable.
 */
export default function GatedAxialConfirmScreen() {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const breathingMode = (params.get("breathingMode") ?? "free_breathing") as BreathingMode;
    const isFreeBreathing = breathingMode === "free_breathing";

    const [targetPhase, setTargetPhase] = useState<TargetPhase>("max_inspiration");
    const [threshold, setThreshold] = useState<number>(1.0);
    const [direction, setDirection] = useState<TriggerDirection>("rising");
    const [waitTimeoutS, setWaitTimeoutS] = useState<number>(30);
    const [requiredTopogram, setRequiredTopogram] = useState<ApiScanSessionSeries | null>(null);
    const [executionContext, setExecutionContext] = useState<ScanSessionExecutionContext | null>(null);
    const [scoutLoadState, setScoutLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [executionError, setExecutionError] = useState<string | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);

    // Live measurements driven by FourDScoutViewport. Initial values mirror the viewport's
    // default crop box (height 0.48, width 0.56) × FULL_RANGE_MM (500) so totalBeds and the
    // bed-position strip have sensible values before the user drags.
    const [scoutMeasurements, setScoutMeasurements] = useState<{ scanLength: string; scoutFov: string }>({
        scanLength: "240.0",
        scoutFov: "280.0",
    });

    // Pull gating defaults & scan_length from session (B1: read-only initial; no write-back).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const session = await fetchSelectedScanSession({ preferCache: false });
                if (cancelled) return;
                if (!session) throw new Error("未找到当前扫描会话，请返回患者列表重新选择");
                if (isTerminalScanSessionStatus(session.status)) {
                    throw new Error("当前扫描会话已结束，不能再次确认范围；请返回患者列表重新创建或选择会话");
                }
                const selectedPatient = loadSelectedPatient();
                const context = buildScanSessionExecutionContext(session, "axial");
                if (!selectedPatient || selectedPatient.id !== session.patient_id) {
                    throw new Error("患者与扫描会话不一致，请返回患者列表重新选择");
                }
                if (!context) throw new Error("当前扫描会话缺少门控断层序列");
                setExecutionContext(context);
                setRequiredTopogram(findRequiredTopogram(session.series, "axial"));
                const axialSeries = session.series.find((s) => s.series_type === "axial");
                if (!axialSeries) return;

                const gating = axialSeries.gating_config;
                if (gating && gating.breathing_mode === "free_breathing") {
                    if (gating.target_phase) setTargetPhase(gating.target_phase);
                    if (typeof gating.threshold_normalized === "number") setThreshold(gating.threshold_normalized);
                    if (gating.trigger_direction) setDirection(gating.trigger_direction);
                    if (typeof gating.wait_timeout_s === "number") setWaitTimeoutS(gating.wait_timeout_s);
                }

                const axialParam = axialSeries.axial_param;
                if (axialParam) {
                    setScoutMeasurements({
                        scanLength: String(axialParam.scan_length),
                        scoutFov: String(axialParam.fov),
                    });
                }
            } catch (err) {
                console.error("Failed to load gating session defaults.", err);
                if (!cancelled) {
                    setExecutionContext(null);
                    setRequiredTopogram(null);
                    setExecutionError(err instanceof Error ? err.message : "扫描会话加载失败，请重试");
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const scanLengthMm = useMemo(() => {
        const n = Number(scoutMeasurements.scanLength);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }, [scoutMeasurements.scanLength]);

    const totalBeds = useMemo(
        () => (scanLengthMm > 0 ? Math.ceil(scanLengthMm / BED_STEP_MM) : 0),
        [scanLengthMm]
    );

    const handleTargetPhase = (next: TargetPhase) => {
        setTargetPhase(next);
        const preset = TARGET_PHASE_OPTIONS.find((o) => o.value === next);
        if (preset && next !== "custom") {
            setThreshold(preset.threshold);
            setDirection(preset.direction);
        }
    };

    const nextRoute = isFreeBreathing
        ? `/helical-execute?mode=gated_axial&breathingMode=free_breathing` +
          `&targetPhase=${targetPhase}&threshold=${threshold}&direction=${direction}` +
          `&waitTimeoutS=${waitTimeoutS}&scanLengthMm=${scanLengthMm || 320}&scoutFov=${scoutMeasurements.scoutFov}`
        : `/helical-execute?mode=gated_axial&breathingMode=${breathingMode}` +
          `&scanLengthMm=${scanLengthMm || 320}&scoutFov=${scoutMeasurements.scoutFov}`;

    const topogramDependencyReady = isScanExecutionReady(
        executionContext,
        requiredTopogram,
        scoutLoadState === "ready",
    );

    const handleExecuteScan = async () => {
        setExecutionError(null);
        if (!executionContext || !topogramDependencyReady) {
            setExecutionError("定位像未成功出图，无法执行后续门控断层扫描");
            return;
        }

        setIsConfirming(true);
        try {
            const selectedSessionId = loadSelectedScanSessionId();
            const selectedPatient = loadSelectedPatient();
            if (selectedSessionId !== executionContext.scanSessionId || selectedPatient?.id !== executionContext.patientId) {
                throw new Error("患者或扫描会话已切换，请返回患者列表重新选择");
            }

            const latestSession = await fetchSelectedScanSession({ preferCache: false });
            if (!latestSession) throw new Error("未找到当前扫描会话，请返回患者列表重新选择");
            if (isTerminalScanSessionStatus(latestSession.status)) {
                throw new Error("当前扫描会话已结束，不能再次确认范围；请返回患者列表重新创建或选择会话");
            }
            const latestContext = buildScanSessionExecutionContext(latestSession, "axial");
            if (!latestContext || !isSameScanSessionExecutionContext(executionContext, latestContext)) {
                throw new Error("扫描会话结构已更新，请重新进入范围确认页");
            }
            const latestTopogram = findRequiredTopogram(latestSession.series, "axial");
            if (!isTopogramDependencyReady(latestTopogram, scoutLoadState === "ready")) {
                throw new Error("定位像未成功出图，无法执行后续门控断层扫描");
            }
            if (latestTopogram) {
                await updateScanSessionSeriesExecution(latestTopogram.id, { range_confirmed: true });
            }
            if (loadSelectedScanSessionId() !== latestSession.id || loadSelectedPatient()?.id !== latestSession.patient_id) {
                throw new Error("患者或扫描会话已切换，已停止进入执行页");
            }
            navigate(
                `${nextRoute}&scanSessionId=${latestContext.scanSessionId}`
                + `&targetSeriesId=${latestContext.targetSeriesId}`
                + `&topogramId=${latestContext.requiredTopogramId ?? "none"}`,
                { state: { showCombinedPatientConfirm: true } },
            );
        } catch (error) {
            setExecutionError(error instanceof Error ? error.message : "门控断层扫描前置条件校验失败");
        } finally {
            setIsConfirming(false);
        }
    };

    // ---------- left-aside extras (free-breathing only) ----------
    const gatingParamCard = isFreeBreathing ? (
        <div className="flex flex-col">
            <ParamField label={t("scanFlow.targetPhase")}>
                <select
                    value={targetPhase}
                    onChange={(e) => handleTargetPhase(e.target.value as TargetPhase)}
                    className="h-[26px] w-full appearance-none rounded border border-[#B0C4DE] bg-white px-2 pr-6 text-[12px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF]"
                >
                    {TARGET_PHASE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                    ))}
                </select>
            </ParamField>
            <ParamField label={t("scanFlow.triggerDirection")}>
                <select
                    value={direction}
                    onChange={(e) => {
                        setDirection(e.target.value as TriggerDirection);
                        if (targetPhase !== "custom") setTargetPhase("custom");
                    }}
                    className="h-[26px] w-full appearance-none rounded border border-[#B0C4DE] bg-white px-2 pr-6 text-[12px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF]"
                >
                    <option value="rising">{t("scanFlow.triggerDirection.rising")}</option>
                    <option value="falling">{t("scanFlow.triggerDirection.falling")}</option>
                </select>
            </ParamField>
            <ParamField label={t("scanFlow.thresholdNormalized")}>
                <input
                    type="number"
                    min={-2}
                    max={2}
                    step={0.1}
                    value={threshold}
                    onChange={(e) => {
                        setThreshold(Number(e.target.value));
                        if (targetPhase !== "custom") setTargetPhase("custom");
                    }}
                    className="h-[26px] w-full rounded border border-[#B0C4DE] bg-white px-2 text-right text-[12px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF]"
                />
            </ParamField>
            <ParamField label={t("scanFlow.waitTimeout")}>
                <input
                    type="number"
                    min={5}
                    max={120}
                    step={1}
                    value={waitTimeoutS}
                    onChange={(e) => setWaitTimeoutS(Number(e.target.value))}
                    className="h-[26px] w-full rounded border border-[#B0C4DE] bg-white px-2 text-right text-[12px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF]"
                />
            </ParamField>
        </div>
    ) : null;

    // ---------- right viewport ----------
    const rightContent = isFreeBreathing ? (
        <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
                <div className="absolute inset-0">
                    <FourDScoutViewport
                        enableImageTools
                        onLoadStateChange={setScoutLoadState}
                        onCropBoxChange={({ width, height }) => {
                            // Box height (along Z) drives scan length; width drives scout FOV.
                            // FULL_RANGE_MM = nominal full-image axial extent used as the box→mm mapping.
                            const FULL_RANGE_MM = 500;
                            setScoutMeasurements({
                                scanLength: (height * FULL_RANGE_MM).toFixed(1),
                                scoutFov: (width * FULL_RANGE_MM).toFixed(1),
                            });
                        }}
                    />
                </div>
            </div>
            <div className="h-[178px] shrink-0 border-t border-[#B0C4DE]/70">
                <GatingMonitorPanel
                    threshold={threshold}
                    direction={direction}
                    onThresholdChange={(v) => {
                        setThreshold(v);
                        if (targetPhase !== "custom") setTargetPhase("custom");
                    }}
                    bedStrip={{
                        total: totalBeds,
                        completed: 0,
                    }}
                />
            </div>
        </div>
    ) : (
        // DIBH branch — same scout (with crop box) on top as the free-breathing
        // branch, so the technician can still pick the scan range; bottom is
        // the bare waveform for stability monitoring. No software-driven
        // preview of the breath-hold ceremony.
        <div className="relative h-full w-full overflow-hidden bg-black">
            <div className="absolute inset-x-0 top-0 bottom-[160px]">
                <FourDScoutViewport
                    enableImageTools
                    onLoadStateChange={setScoutLoadState}
                    onCropBoxChange={({ width, height }) => {
                        const FULL_RANGE_MM = 500;
                        setScoutMeasurements({
                            scanLength: (height * FULL_RANGE_MM).toFixed(1),
                            scoutFov: (width * FULL_RANGE_MM).toFixed(1),
                        });
                    }}
                />
            </div>
            <div className="absolute inset-x-0 bottom-0 px-3 pb-2">
                <GatingWaveformPanel mode="breath_hold" readOnly bare />
            </div>
        </div>
    );

    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="tomographicScan"
            tomographicParamOverrides={scoutMeasurements}
            extraParamSection={gatingParamCard}
            nextRoute={nextRoute}
            onExecuteScan={() => { void handleExecuteScan(); }}
            executeDisabled={!topogramDependencyReady || isConfirming}
            allowBackNavigation={false}
            rightViewportContent={
                <>
                    {rightContent}
                    {(executionError || (requiredTopogram && !topogramDependencyReady)) && (
                        <div className="absolute bottom-3 left-3 right-3 z-30 rounded border border-[#EF4444]/60 bg-[#2A1115]/95 px-3 py-2 text-[12px] font-bold text-[#FCA5A5]">
                            {executionError ?? t("scanFlow.localizerPrerequisiteBlocked")}
                        </div>
                    )}
                </>
            }
            rightViewportClassName="flex-1 rounded-lg border border-[#B0C4DE] bg-white shadow-sm flex flex-col overflow-hidden relative"
        />
    );
}

function ParamField({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="py-1.5 first:pt-0">
            <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-tighter text-[#64748B]">{label}</span>
                {hint && <span className="text-[9px] text-[#94A3B8] truncate">{hint}</span>}
            </div>
            {children}
        </div>
    );
}
