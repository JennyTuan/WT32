import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ScanConfirmScreen from "./ScanConfirmScreen";
import GatingWaveformPanel from "../components/GatingWaveformPanel";
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

type BreathingMode = "breath_hold_inspiration" | "breath_hold_expiration";

/**
 * Gated helical confirm screen — DIBH (deep inspiration breath-hold) only.
 * Layout: scout (topogram with draggable crop box) on top, respiratory
 * waveform on the bottom. The crop box drives scan length / FOV the same
 * way it does in the non-gated helical confirm screen — technician drags
 * to pick coverage. No software-driven preview of the breath-hold ceremony;
 * clinical staff coach the patient themselves, the UI only surfaces the
 * respiratory signal and its 稳定/不稳定 indicator.
 *
 * Left aside hosts a `门控参数` tab via ScanConfirmScreen's `extraParamSection`
 * slot — mirrors what GatedAxialConfirmScreen does for the free-breathing
 * branch, but with DIBH-specific fields (屏息时相 / 屏息超时 / 振幅容差).
 */
export default function GatedHelicalConfirmScreen() {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const initialBreathingMode = (params.get("breathingMode") ?? "breath_hold_inspiration") as BreathingMode;

    const [breathingMode, setBreathingMode] = useState<BreathingMode>(initialBreathingMode);
    // DIBH gating params. Defaults follow CONTEXT: timeout 25 s, tolerance ±2 mm.
    const [breathHoldTimeoutS, setBreathHoldTimeoutS] = useState<number>(25);
    const [amplitudeToleranceMm, setAmplitudeToleranceMm] = useState<number>(2.0);
    const [requiredTopogram, setRequiredTopogram] = useState<ApiScanSessionSeries | null>(null);
    const [executionContext, setExecutionContext] = useState<ScanSessionExecutionContext | null>(null);
    const [scoutLoadState, setScoutLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [executionError, setExecutionError] = useState<string | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);

    // Read gating defaults from the active scan session if present.
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
                const context = buildScanSessionExecutionContext(session, "helical");
                if (!selectedPatient || selectedPatient.id !== session.patient_id) {
                    throw new Error("患者与扫描会话不一致，请返回患者列表重新选择");
                }
                if (!context) throw new Error("当前扫描会话缺少门控螺旋序列");
                setExecutionContext(context);
                setRequiredTopogram(findRequiredTopogram(session.series, "helical"));
                const helicalSeries = session.series.find((s) => s.series_type === "helical");
                const gating = helicalSeries?.gating_config;
                if (!gating) return;
                if (
                    gating.breathing_mode === "breath_hold_inspiration" ||
                    gating.breathing_mode === "breath_hold_expiration"
                ) {
                    setBreathingMode(gating.breathing_mode);
                }
                if (typeof gating.breath_hold_timeout_s === "number") {
                    setBreathHoldTimeoutS(gating.breath_hold_timeout_s);
                }
                if (typeof gating.breath_hold_amplitude_tolerance_mm === "number") {
                    setAmplitudeToleranceMm(gating.breath_hold_amplitude_tolerance_mm);
                }
            } catch (err) {
                console.error("Failed to load DIBH gating defaults.", err);
                if (!cancelled) {
                    setExecutionContext(null);
                    setRequiredTopogram(null);
                    setExecutionError(err instanceof Error ? err.message : "扫描会话加载失败，请重试");
                }
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Scan range / FOV derived from the scout crop box. Same physical
    // mapping as HelicalScanConfirmScreen (Height 0.48 unit → 220 mm;
    // Width 0.56 unit → 500 mm). Z coordinate uses the same 458.33 mm/unit
    // vertical scale with Z=0 at the topogram center (head-first supine →
    // top of scout = head = larger positive Z).
    const SCOUT_Z_HEIGHT_MM = 458.33;
    const SCOUT_Z_TOP_MM = SCOUT_Z_HEIGHT_MM / 2; // +229.17 mm (head side)

    // Initial crop-box defaults match FourDScoutViewport (x:0.2 y:0.18 w:0.56 h:0.48)
    const [cropRect, setCropRect] = useState({ x: 0.2, y: 0.18, width: 0.56, height: 0.48 });

    const scanLengthMm = Number((cropRect.height * SCOUT_Z_HEIGHT_MM).toFixed(1));
    const fovMm = Math.round(cropRect.width * 892.86);
    const startZMm = Number((SCOUT_Z_TOP_MM - cropRect.y * SCOUT_Z_HEIGHT_MM).toFixed(1));
    const endZMm = Number((SCOUT_Z_TOP_MM - (cropRect.y + cropRect.height) * SCOUT_Z_HEIGHT_MM).toFixed(1));

    const helicalParamOverrides = useMemo(
        () => ({
            scanLength: scanLengthMm.toFixed(2),
            scoutFov: String(fovMm),
        }),
        [scanLengthMm, fovMm]
    );

    const handleRectChange = (rect: { x: number; y: number; width: number; height: number }) => {
        setCropRect(rect);
    };

    // ---------- left-aside gating params (DIBH) ----------
    const gatingParamCard = (
        <div className="flex flex-col">
            <ParamField label={t("scanFlow.breathHold.phase")}>
                <select
                    value={breathingMode}
                    onChange={(e) => setBreathingMode(e.target.value as BreathingMode)}
                    className="h-[26px] w-full appearance-none rounded border border-[#B0C4DE] bg-white px-2 pr-6 text-[12px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF]"
                >
                    <option value="breath_hold_inspiration">{t("scanFlow.breathHold.inspiration")}</option>
                    <option value="breath_hold_expiration">{t("scanFlow.breathHold.expiration")}</option>
                </select>
            </ParamField>
            <ParamField label={t("scanFlow.breathHold.timeout")} hint={t("scanFlow.breathHold.timeoutHint")}>
                <input
                    type="number"
                    min={5}
                    max={60}
                    step={1}
                    value={breathHoldTimeoutS}
                    onChange={(e) => setBreathHoldTimeoutS(Number(e.target.value))}
                    className="h-[26px] w-full rounded border border-[#B0C4DE] bg-white px-2 text-right text-[12px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF]"
                />
            </ParamField>
            <ParamField label={t("scanFlow.breathHold.amplitudeTolerance")} hint={t("scanFlow.breathHold.toleranceHint")}>
                <input
                    type="number"
                    min={0.5}
                    max={10}
                    step={0.1}
                    value={amplitudeToleranceMm}
                    onChange={(e) => setAmplitudeToleranceMm(Number(e.target.value))}
                    className="h-[26px] w-full rounded border border-[#B0C4DE] bg-white px-2 text-right text-[12px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF]"
                />
            </ParamField>
        </div>
    );

    const nextRoute =
        `/helical-execute?mode=gated_helical&breathingMode=${breathingMode}` +
        `&scanLengthMm=${scanLengthMm}&scoutFov=${fovMm}` +
        `&breathHoldTimeoutS=${breathHoldTimeoutS}` +
        `&amplitudeToleranceMm=${amplitudeToleranceMm}`;

    const topogramDependencyReady = isScanExecutionReady(
        executionContext,
        requiredTopogram,
        scoutLoadState === "ready",
    );

    const handleExecuteScan = async () => {
        setExecutionError(null);
        if (!executionContext || !topogramDependencyReady) {
            setExecutionError("定位像未成功出图，无法执行后续门控螺旋扫描");
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
            const latestContext = buildScanSessionExecutionContext(latestSession, "helical");
            if (!latestContext || !isSameScanSessionExecutionContext(executionContext, latestContext)) {
                throw new Error("扫描会话结构已更新，请重新进入范围确认页");
            }
            const latestTopogram = findRequiredTopogram(latestSession.series, "helical");
            if (!isTopogramDependencyReady(latestTopogram, scoutLoadState === "ready")) {
                throw new Error("定位像未成功出图，无法执行后续门控螺旋扫描");
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
            setExecutionError(error instanceof Error ? error.message : "门控螺旋扫描前置条件校验失败");
        } finally {
            setIsConfirming(false);
        }
    };

    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="helicalScan"
            helicalParamOverrides={helicalParamOverrides}
            extraParamSection={gatingParamCard}
            nextRoute={nextRoute}
            onExecuteScan={() => { void handleExecuteScan(); }}
            executeDisabled={!topogramDependencyReady || isConfirming}
            allowBackNavigation={false}
            rightViewportContent={
                <div className="relative h-full w-full overflow-hidden bg-black">
                    {/* Top: scout (topogram) with draggable crop box. */}
                    <div className="absolute inset-x-0 top-0 bottom-[200px]">
                        <FourDScoutViewport
                            enableImageTools
                            onRectChange={handleRectChange}
                            onLoadStateChange={setScoutLoadState}
                        />
                    </div>
                    {/* Bottom: respiratory waveform + Z bed-position strip, pinned to bottom. */}
                    <div className="absolute inset-x-0 bottom-0 px-3 pb-2">
                        <GatingWaveformPanel
                            mode="breath_hold"
                            readOnly
                            bare
                            zRangeStrip={{
                                scanLengthMm: scanLengthMm,
                                startMm: startZMm,
                                endMm: endZMm,
                            }}
                        />
                    </div>
                    {(executionError || (requiredTopogram && !topogramDependencyReady)) && (
                        <div className="absolute bottom-3 left-3 right-3 z-30 rounded border border-[#EF4444]/60 bg-[#2A1115]/95 px-3 py-2 text-[12px] font-bold text-[#FCA5A5]">
                            {executionError ?? t("scanFlow.localizerPrerequisiteBlocked")}
                        </div>
                    )}
                </div>
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
