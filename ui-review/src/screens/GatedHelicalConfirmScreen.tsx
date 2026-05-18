import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ScanConfirmScreen from "./ScanConfirmScreen";
import GatingWaveformPanel from "../components/GatingWaveformPanel";
import { FourDScoutViewport } from "./HelicalScanConfirmScreen";
import { fetchSelectedScanSession } from "../lib/scanSession";

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
    const [params] = useSearchParams();
    const initialBreathingMode = (params.get("breathingMode") ?? "breath_hold_inspiration") as BreathingMode;

    const [breathingMode, setBreathingMode] = useState<BreathingMode>(initialBreathingMode);
    // DIBH gating params. Defaults follow CONTEXT: timeout 25 s, tolerance ±2 mm.
    const [breathHoldTimeoutS, setBreathHoldTimeoutS] = useState<number>(25);
    const [amplitudeToleranceMm, setAmplitudeToleranceMm] = useState<number>(2.0);

    // Read gating defaults from the active scan session if present.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const session = await fetchSelectedScanSession();
                if (cancelled || !session) return;
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
            <ParamField label="屏息时相">
                <select
                    value={breathingMode}
                    onChange={(e) => setBreathingMode(e.target.value as BreathingMode)}
                    className="h-[26px] w-full appearance-none rounded border border-[#B0C4DE] bg-white px-2 pr-6 text-[12px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF]"
                >
                    <option value="breath_hold_inspiration">深吸气末屏息</option>
                    <option value="breath_hold_expiration">深呼气末屏息</option>
                </select>
            </ParamField>
            <ParamField label="屏息超时 (s)" hint="超过此时间未稳定即中止">
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
            <ParamField label="振幅容差 (±mm)" hint="屏息平台允许的抖动范围">
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

    return (
        <ScanConfirmScreen
            activeSequenceId="s2"
            activeSequenceStepIndex={0}
            parameterPanelMode="helicalScan"
            helicalParamOverrides={helicalParamOverrides}
            extraParamSection={gatingParamCard}
            nextRoute={nextRoute}
            allowBackNavigation={false}
            rightViewportContent={
                <div className="relative h-full w-full overflow-hidden bg-black">
                    {/* Top: scout (topogram) with draggable crop box. */}
                    <div className="absolute inset-x-0 top-0 bottom-[200px]">
                        <FourDScoutViewport
                            enableImageTools
                            onRectChange={handleRectChange}
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
