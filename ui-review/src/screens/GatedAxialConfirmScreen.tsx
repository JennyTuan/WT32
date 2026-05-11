import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ScanConfirmScreen from "./ScanConfirmScreen";
import GatingWaveformPanel from "../components/GatingWaveformPanel";
import GatingMonitorPanel from "../components/GatingMonitorPanel";
import BreathHoldGuide from "../components/BreathHoldGuide";
import { FourDScoutViewport } from "./HelicalScanConfirmScreen";
import { fetchSelectedScanSession } from "../lib/scanSession";

type BreathingMode = "free_breathing" | "breath_hold_inspiration";
type TargetPhase = "max_inspiration" | "max_expiration" | "custom";
type TriggerDirection = "rising" | "falling";

const BED_STEP_MM = 19.2;

const TARGET_PHASE_OPTIONS: { value: TargetPhase; label: string; threshold: number; direction: TriggerDirection }[] = [
    { value: "max_inspiration", label: "最大吸气", threshold: 1.0, direction: "rising" },
    { value: "max_expiration", label: "最大呼气", threshold: -1.0, direction: "falling" },
    { value: "custom", label: "自定义", threshold: 0.5, direction: "rising" },
];

/**
 * Gated axial confirm — supports free-breathing (threshold-crossing) and DIBH branches.
 * Free-breathing branch mirrors 4D layout: TomographicScoutViewport (with draggable
 * range box) on top of GatingWaveformPanel; gating-specific params live in the
 * left aside under the standard scan-parameter card grid.
 *   Bed step is fixed at 19.2 mm (detector collimation), not configurable.
 */
export default function GatedAxialConfirmScreen() {
    const [params] = useSearchParams();
    const breathingMode = (params.get("breathingMode") ?? "free_breathing") as BreathingMode;
    const isFreeBreathing = breathingMode === "free_breathing";

    const [targetPhase, setTargetPhase] = useState<TargetPhase>("max_inspiration");
    const [threshold, setThreshold] = useState<number>(1.0);
    const [direction, setDirection] = useState<TriggerDirection>("rising");
    const [waitTimeoutS, setWaitTimeoutS] = useState<number>(30);
    const [holdArmed, setHoldArmed] = useState(false);

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
                const session = await fetchSelectedScanSession();
                if (cancelled || !session) return;
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
        : `/helical-execute?mode=gated_axial&breathingMode=${breathingMode}`;

    // ---------- left-aside extras (free-breathing only) ----------
    const gatingParamCard = isFreeBreathing ? (
        <div className="flex flex-col">
            <ParamField label="目标相位">
                <select
                    value={targetPhase}
                    onChange={(e) => handleTargetPhase(e.target.value as TargetPhase)}
                    className="h-[26px] w-full appearance-none rounded border border-[#B0C4DE] bg-white px-2 pr-6 text-[12px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF]"
                >
                    {TARGET_PHASE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </ParamField>
            <ParamField label="触发方向">
                <select
                    value={direction}
                    onChange={(e) => {
                        setDirection(e.target.value as TriggerDirection);
                        if (targetPhase !== "custom") setTargetPhase("custom");
                    }}
                    className="h-[26px] w-full appearance-none rounded border border-[#B0C4DE] bg-white px-2 pr-6 text-[12px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF]"
                >
                    <option value="rising">上行穿越</option>
                    <option value="falling">下行穿越</option>
                </select>
            </ParamField>
            <ParamField label="阈值 (归一化 −2 ~ +2)">
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
            <ParamField label="等待超时 (s)">
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
        <div className="flex h-full flex-col gap-3 p-3 text-[#E2E8F0]">
            <div className="rounded-md border border-[#1E293B] bg-[#0F172A] p-3 text-[12px]">
                <div className="text-[13px] font-semibold mb-1">门控-断层 · 深吸气屏息</div>
                <div className="text-[#94A3B8]">技师对讲指导患者屏息；波形进入平台后启用「开始扫描」按钮。</div>
            </div>
            <BreathHoldGuide armed={holdArmed} timeoutSeconds={25} amplitudeToleranceMm={2.0} />
            <GatingWaveformPanel mode="breath_hold" readOnly />
            <button
                onClick={() => setHoldArmed((v) => !v)}
                className={`rounded-md px-3 py-2 text-[13px] font-semibold text-white transition-colors ${
                    holdArmed ? "bg-red-800 hover:bg-red-700" : "bg-sky-500 hover:bg-sky-400"
                }`}
            >
                {holdArmed ? "取消屏息引导" : "开始屏息引导（演示）"}
            </button>
        </div>
    );

    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="tomographicScan"
            tomographicParamOverrides={isFreeBreathing ? scoutMeasurements : undefined}
            extraParamSection={gatingParamCard}
            nextRoute={nextRoute}
            allowBackNavigation={false}
            rightViewportContent={rightContent}
            rightViewportClassName={
                isFreeBreathing
                    ? "flex-1 rounded-lg border border-[#B0C4DE] bg-white shadow-sm flex flex-col overflow-hidden relative"
                    : undefined
            }
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
