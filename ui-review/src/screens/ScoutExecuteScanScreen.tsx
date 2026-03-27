import { useEffect, useRef, useState } from "react";
import * as dicomParser from "dicom-parser";
import { CircleDot, Zap } from "lucide-react";
import ScanConfirmScreen from "./ScanConfirmScreen";

const HOLD_DURATION_MS = 3000;
const EXPOSURE_DURATION_MS = 1200;
const RENDER_DURATION_MS = 2200;
const SCOUT_SERIES = {
    basePath: "/dicom/QIN LUNG CT/QIN-LUNG-01-0007/01-12-2000-1-CT Thorax wContrast-47252/2.000000-THORAX W  3.0 B41 Soft Tissue-52055",
    count: 118,
    fallbackWindowWidth: 350,
    fallbackWindowLevel: 45,
};

type ScanStage = "idle" | "arming" | "enabled" | "exposing" | "rendering" | "completed";

type ProjectionMeta = {
    width: number;
    height: number;
    ww: number;
    wl: number;
    kvp: string;
    mas: string;
    thickness: string;
};

type LoadedSlice = {
    instanceNumber: number;
    positionZ: number;
    rows: number;
    cols: number;
    pixelSpacingX: number;
    sliceThickness: number;
    hu: Float32Array;
};

function clamp01(value: number) {
    return Math.min(1, Math.max(0, value));
}

function ScoutProjectionViewport({
    renderProgress,
    active,
}: {
    renderProgress: number;
    active: boolean;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const projectionRef = useRef<Uint8ClampedArray | null>(null);
    const projectionSizeRef = useRef<{ width: number; height: number } | null>(null);
    const metaRef = useRef<ProjectionMeta | null>(null);
    const [meta, setMeta] = useState<ProjectionMeta | null>(null);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

    useEffect(() => {
        let cancelled = false;

        const loadSlices = async () => {
            try {
                const sliceNumbers = Array.from({ length: SCOUT_SERIES.count }, (_, index) => index + 1);
                const slices: LoadedSlice[] = [];
                const concurrency = 8;

                for (let start = 0; start < sliceNumbers.length; start += concurrency) {
                    const batch = sliceNumbers.slice(start, start + concurrency);
                    const loadedBatch = await Promise.all(
                        batch.map(async (sliceNumber) => {
                            const fileName = `1-${String(sliceNumber).padStart(3, "0")}.dcm`;
                            const response = await fetch(`${SCOUT_SERIES.basePath}/${fileName}`);
                            if (!response.ok) {
                                throw new Error(`Failed to fetch ${fileName}`);
                            }

                            const arrayBuffer = await response.arrayBuffer();
                            const byteArray = new Uint8Array(arrayBuffer);
                            const dataSet = dicomParser.parseDicom(byteArray);

                            const rows = dataSet.uint16("x00280010") ?? 0;
                            const cols = dataSet.uint16("x00280011") ?? 0;
                            const bitsAllocated = dataSet.uint16("x00280100") ?? 16;
                            const pixelRepresentation = dataSet.uint16("x00280103") ?? 0;
                            const intercept = Number(dataSet.string("x00281052") ?? "0");
                            const slope = Number(dataSet.string("x00281053") ?? "1");
                            const positionZ = Number((dataSet.string("x00200032") ?? "0\\0\\0").split("\\")[2] ?? 0);
                            const pixelSpacing = (dataSet.string("x00280030") ?? "1\\1").split("\\").map(Number);
                            const sliceThickness = Number(dataSet.string("x00180050") ?? "1");
                            const pixelDataElement = dataSet.elements.x7fe00010;
                            if (!pixelDataElement || rows === 0 || cols === 0) {
                                throw new Error(`Missing pixel data for ${fileName}`);
                            }

                            const pixelData = byteArray.slice(
                                pixelDataElement.dataOffset,
                                pixelDataElement.dataOffset + pixelDataElement.length
                            );
                            const pixelBuffer = pixelData.buffer.slice(
                                pixelData.byteOffset,
                                pixelData.byteOffset + pixelData.byteLength
                            );

                            const values =
                                bitsAllocated === 16
                                    ? pixelRepresentation === 1
                                        ? new Int16Array(pixelBuffer)
                                        : new Uint16Array(pixelBuffer)
                                    : new Uint16Array(pixelBuffer);

                            const hu = new Float32Array(values.length);
                            for (let i = 0; i < values.length; i += 1) {
                                hu[i] = values[i] * slope + intercept;
                            }

                            return {
                                instanceNumber: Number(dataSet.string("x00200013") ?? sliceNumber),
                                positionZ,
                                rows,
                                cols,
                                pixelSpacingX: pixelSpacing[1] || 1,
                                sliceThickness: Number.isFinite(sliceThickness) && sliceThickness > 0 ? sliceThickness : 1,
                                hu,
                                ww: Number(dataSet.string("x00281051") ?? `${SCOUT_SERIES.fallbackWindowWidth}`),
                                wl: Number(dataSet.string("x00281050") ?? `${SCOUT_SERIES.fallbackWindowLevel}`),
                                kvp: dataSet.string("x00180060") ?? "120",
                                mas: dataSet.string("x00181152") ?? "Auto",
                                thickness: dataSet.string("x00180050") ?? "3.0 mm",
                            };
                        })
                    );

                    loadedBatch.forEach((slice) => {
                        slices.push({
                            instanceNumber: slice.instanceNumber,
                            positionZ: slice.positionZ,
                            rows: slice.rows,
                            cols: slice.cols,
                            pixelSpacingX: slice.pixelSpacingX,
                            sliceThickness: slice.sliceThickness,
                            hu: slice.hu,
                        });

                        if (!metaRef.current) {
                            metaRef.current = {
                                width: slice.cols,
                                height: SCOUT_SERIES.count,
                                ww: Number.isFinite(slice.ww) && slice.ww > 1 ? slice.ww : SCOUT_SERIES.fallbackWindowWidth,
                                wl: Number.isFinite(slice.wl) ? slice.wl : SCOUT_SERIES.fallbackWindowLevel,
                                kvp: slice.kvp,
                                mas: slice.mas,
                                thickness: slice.thickness,
                            };
                        }
                    });
                }

                slices.sort((a, b) => b.positionZ - a.positionZ || a.instanceNumber - b.instanceNumber);
                if (slices.length === 0) {
                    throw new Error("No DICOM slices loaded.");
                }

                const rows = slices[0].rows;
                const cols = slices[0].cols;
                const bandHalfHeight = Math.max(10, Math.floor(rows * 0.08));
                const centerY = Math.floor(rows / 2);
                const sampleStart = Math.max(0, centerY - bandHalfHeight);
                const sampleEnd = Math.min(rows, centerY + bandHalfHeight);
                const ww = metaRef.current?.ww ?? SCOUT_SERIES.fallbackWindowWidth;
                const wl = metaRef.current?.wl ?? SCOUT_SERIES.fallbackWindowLevel;
                const minVal = wl - ww / 2;
                const maxVal = wl + ww / 2;
                const range = Math.max(maxVal - minVal, 1);
                const output = new Uint8ClampedArray(cols * slices.length);

                slices.forEach((slice, sliceIndex) => {
                    for (let x = 0; x < cols; x += 1) {
                        let accum = 0;
                        let samples = 0;

                        for (let y = sampleStart; y < sampleEnd; y += 1) {
                            accum += slice.hu[y * cols + x];
                            samples += 1;
                        }

                        const meanHu = accum / Math.max(samples, 1);
                        const normalized = clamp01((meanHu - minVal) / range);
                        const gray = Math.round(normalized * 255);
                        output[sliceIndex * cols + x] = 255 - gray;
                    }
                });

                if (cancelled) return;

                projectionRef.current = output;
                projectionSizeRef.current = { width: cols, height: slices.length };
                setMeta({
                    width: cols,
                    height: slices.length,
                    ww,
                    wl,
                    kvp: metaRef.current?.kvp ?? "120",
                    mas: metaRef.current?.mas ?? "Auto",
                    thickness: metaRef.current?.thickness ?? "3.0 mm",
                });
                setLoadState("ready");
            } catch (error) {
                console.error(error);
                if (!cancelled) {
                    setLoadState("error");
                }
            }
        };

        void loadSlices();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const viewport = viewportRef.current;
        const pixels = projectionRef.current;
        const size = projectionSizeRef.current;
        if (!canvas || !viewport || !pixels || !size) return;

        const viewW = Math.max(1, Math.floor(viewport.clientWidth));
        const viewH = Math.max(1, Math.floor(viewport.clientHeight));
        if (canvas.width !== viewW || canvas.height !== viewH) {
            canvas.width = viewW;
            canvas.height = viewH;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const offscreen = document.createElement("canvas");
        offscreen.width = size.width;
        offscreen.height = size.height;
        const offCtx = offscreen.getContext("2d");
        if (!offCtx) return;

        const imageData = offCtx.createImageData(size.width, size.height);
        const out = imageData.data;
        for (let i = 0; i < pixels.length; i += 1) {
            const j = i * 4;
            const value = pixels[i];
            out[j] = value;
            out[j + 1] = value;
            out[j + 2] = value;
            out[j + 3] = 255;
        }
        offCtx.putImageData(imageData, 0, 0);

        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, viewW, viewH);

        const fitScale = Math.min(viewW / size.width, viewH / size.height);
        const drawScale = fitScale * 0.9;
        const drawW = size.width * drawScale;
        const drawH = size.height * drawScale;
        const x = (viewW - drawW) / 2;
        const y = (viewH - drawH) / 2;

        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = 0.28 + renderProgress * 0.72;
        ctx.filter = `contrast(${1.04 + renderProgress * 0.08}) brightness(${0.84 + renderProgress * 0.1})`;
        ctx.drawImage(offscreen, x, y, drawW, drawH);
        ctx.restore();
    }, [renderProgress, loadState]);

    return (
        <div ref={viewportRef} className="absolute inset-0 overflow-hidden bg-black">
            <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full"
                style={{
                    clipPath: `inset(${(1 - renderProgress) * 100}% 0 0 0)`,
                    opacity: active ? 1 : 0,
                    transition: "opacity 180ms ease",
                }}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/55 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />

            {loadState === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium tracking-[0.12em] text-[#9FB2C5]">
                    正在载入定位像数据...
                </div>
            )}

            {loadState === "error" && (
                <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium tracking-[0.08em] text-[#D1D9E1]">
                    定位像加载失败
                </div>
            )}

            {meta && (
                <>
                    <div className="pointer-events-none absolute left-3 top-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div className="font-bold">Scout Projection</div>
                        <div>{meta.width} x {meta.height}</div>
                    </div>
                    <div className="pointer-events-none absolute right-3 top-3 text-right text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div className="font-bold">CT</div>
                        <div>KV {meta.kvp} | mAs {meta.mas}</div>
                    </div>
                    <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] font-mono leading-[1.35] text-[#CFD8DC]">
                        <div>WW/WL {Math.round(meta.ww)} / {Math.round(meta.wl)}</div>
                        <div>Thick {meta.thickness}</div>
                    </div>
                    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[11px] font-bold tracking-[0.12em] text-[#DCE5ED]">
                        R
                    </div>
                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold tracking-[0.12em] text-[#DCE5ED]">
                        L
                    </div>
                </>
            )}

            <div
                className="pointer-events-none absolute left-[12%] right-[12%] h-px bg-[linear-gradient(90deg,transparent,rgba(215,227,239,0.9),transparent)]"
                style={{
                    top: `${Math.min(renderProgress, 0.995) * 100}%`,
                    opacity: active && renderProgress < 1 ? 1 : 0,
                    transition: "opacity 160ms ease",
                }}
            />
        </div>
    );
}

export default function ScoutExecuteScanScreen() {
    const [stage, setStage] = useState<ScanStage>("idle");
    const [holdProgress, setHoldProgress] = useState(0);
    const [guideVisible, setGuideVisible] = useState(true);
    const [renderProgress, setRenderProgress] = useState(0);
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
            setRenderProgress(nextProgress);

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
            setRenderProgress(0);
            runRenderAnimation();
        }, EXPOSURE_DURATION_MS);
    };

    const handleExecuteScanClick = () => {
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
                ? "使能已建立"
                : stage === "exposing"
                    ? "曝光中..."
                    : stage === "rendering"
                        ? "定位像生成中..."
                        : stage === "completed"
                            ? "定位像已生成"
                            : "等待操作";

    const guideTitle =
        stage === "arming"
            ? "持续按住绿色按钮"
            : stage === "enabled"
                ? "系统已使能"
                : stage === "exposing"
                    ? "正在曝光"
                    : "按住绿色按钮";

    return (
        <div className="relative h-[768px] w-[1024px] overflow-hidden">
            <ScanConfirmScreen activeScoutStepIndex={2} readOnlyMode onExecuteScan={handleExecuteScanClick} />

            <div className="pointer-events-none absolute bottom-[80px] left-[246px] right-0 top-[82px] z-20 overflow-hidden rounded-lg">
                <div className="flex h-full flex-col border border-white/5 bg-[#1A222B]">
                    <div className="flex h-[44px] items-center justify-between border-b border-white/10 bg-[#131A22] px-4">
                        <div className="flex items-center gap-2 text-[#C6D4E1]">
                            <CircleDot size={12} className={stage === "exposing" ? "text-[#66BB6A]" : "text-[#4D94FF]"} />
                            <span className="text-[11px] font-bold tracking-wide">影像区域</span>
                        </div>
                        <span className="text-[11px] text-[#90A4AE]">{statusText}</span>
                    </div>

                    <div className="relative flex-1 overflow-hidden bg-[#05080C]">
                        <div className={`absolute inset-0 transition-opacity duration-500 ${stage === "idle" || stage === "arming" || stage === "enabled" ? "opacity-100" : "opacity-0"}`}>
                            <div className="flex h-full items-center justify-center text-[42px] font-thin uppercase tracking-[8px] text-[#44515F]/55">
                                Viewport
                            </div>
                        </div>

                        <div className={`absolute inset-0 transition-opacity duration-500 ${stage === "rendering" || stage === "completed" ? "opacity-100" : "opacity-0"}`}>
                            <ScoutProjectionViewport renderProgress={renderProgress} active={stage === "rendering" || stage === "completed"} />
                        </div>
                    </div>
                </div>
            </div>

            <div className={`absolute bottom-[84px] right-0 top-[88px] z-40 flex items-stretch transition-all duration-500 ${guideVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
                <div className="w-12 bg-gradient-to-l from-black/18 to-transparent" />
                <div className="pointer-events-auto flex h-full w-[235px] flex-col overflow-hidden rounded-l-2xl border border-r-0 border-[#CBD5E1] bg-[#EDF1F7] shadow-[-24px_0_48px_rgba(15,23,42,0.22)]">
                    <div className="border-b border-slate-200 px-5 py-4">
                        <div className="text-[14px] font-black text-slate-700">实体按键操作引导</div>
                        <div className="mt-1 text-[11px] font-medium text-slate-400">演示长按三秒后触发使能与曝光，并在右侧生成定位像。</div>
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
        </div>
    );
}
