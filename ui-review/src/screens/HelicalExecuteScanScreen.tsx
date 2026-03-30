import { useEffect, useRef, useState } from "react";
import { CircleDot, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ScanConfirmScreen from "./ScanConfirmScreen";
import { TomographicScoutViewport } from "./SequenceScanConfirmScreen";

type ScanStage = "idle" | "arming" | "enabled" | "exposing" | "rendering" | "completed";

const HOLD_DURATION_MS = 3000;
const EXPOSURE_DURATION_MS = 1500;
const RENDER_DURATION_MS = 1600;

export default function HelicalExecuteScanScreen() {
    const navigate = useNavigate();
    const [stage, setStage] = useState<ScanStage>("idle");
    const [holdProgress, setHoldProgress] = useState(0);
    const [guideVisible, setGuideVisible] = useState(true);
    const [measurements, setMeasurements] = useState({ scanLength: "--", scoutFov: "--" });
    const rafRef = useRef<number | null>(null);
    const holdStartRef = useRef<number | null>(null);
    const progressStartRef = useRef<number | null>(null);
    const exposureTimerRef = useRef<number | null>(null);

    const clearHoldRaf = () => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };

    useEffect(() => {
        return () => {
            clearHoldRaf();
            if (exposureTimerRef.current !== null) {
                window.clearTimeout(exposureTimerRef.current);
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
            navigate("/image-viewer");
            return;
        }

        if (stage === "idle" || stage === "arming") {
            triggerScanSequence();
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
        if (stage !== "arming") {
            return;
        }

        clearHoldRaf();
        holdStartRef.current = null;
        setHoldProgress(0);
        setStage("idle");
    };

    const statusText =
        stage === "arming"
            ? `长按触发 ${Math.max(0, ((1 - holdProgress) * 3)).toFixed(1)}s`
            : stage === "enabled"
                ? "扫描已使能"
                : stage === "exposing"
                    ? "螺旋扫描中..."
                    : stage === "rendering"
                        ? "图像重建中..."
                        : stage === "completed"
                            ? "螺旋扫描已完成"
                            : "等待操作";

    const guideTitle =
        stage === "arming"
            ? "持续按住绿色按键"
            : stage === "enabled"
                ? "系统已使能"
                : stage === "exposing"
                    ? "正在执行螺旋扫描"
                    : "按住绿色按键";

    return (
        <div className="relative h-[768px] w-[1024px] overflow-hidden">
            <ScanConfirmScreen
                activeSequenceId="s2"
                activeSequenceStepIndex={stage === "completed" ? 2 : 1}
                parameterPanelMode="helicalScan"
                helicalParamOverrides={measurements}
                rightViewportContent={<TomographicScoutViewport onMeasurementChange={setMeasurements} />}
                readOnlyMode
                onExecuteScan={handleExecuteScanClick}
            />

            {stage === "completed" && (
                <div className="absolute bottom-[14px] right-8 z-50">
                    <button
                        type="button"
                        onClick={() => navigate("/image-viewer")}
                        className="flex items-center gap-2 px-10 h-[52px] bg-[#4D94FF] text-white font-bold rounded-md shadow-lg hover:bg-blue-600 transition-all uppercase text-[13px] active:scale-95"
                    >
                        图像浏览
                    </button>
                </div>
            )}

            <div className={`absolute bottom-[84px] right-0 top-[88px] z-40 flex items-stretch transition-all duration-500 ${guideVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
                <div className="w-12 bg-gradient-to-l from-black/18 to-transparent" />
                <div className="pointer-events-auto flex h-full w-[235px] flex-col overflow-hidden rounded-l-2xl border border-r-0 border-[#CBD5E1] bg-[#EDF1F7] shadow-[-24px_0_48px_rgba(15,23,42,0.22)]">
                    <div className="border-b border-slate-200 px-5 py-4">
                        <div className="text-[14px] font-black text-slate-700">实体按键操作引导</div>
                        <div className="mt-1 text-[11px] font-medium text-slate-400">演示长按三秒触发使能与螺旋扫描，扫描完成后再进入图像浏览。</div>
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
                                    <span>长按进度</span>
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

            <div className="pointer-events-none absolute bottom-[80px] left-[246px] right-0 top-[82px] z-20 overflow-hidden rounded-lg">
                <div className="flex h-full flex-col border border-white/5 bg-[#1A222B]/20">
                    <div className="flex h-[44px] items-center justify-between border-b border-white/10 bg-[#131A22]/80 px-4">
                        <div className="flex items-center gap-2 text-[#C6D4E1]">
                            <CircleDot size={12} className={stage === "exposing" ? "text-[#66BB6A]" : "text-[#4D94FF]"} />
                            <span className="text-[11px] font-bold tracking-wide">螺旋扫描状态</span>
                        </div>
                        <span className="text-[11px] text-[#90A4AE]">{statusText}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
