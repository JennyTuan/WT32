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
    Flame,
    Info,
    Network,
    Settings,
    Siren,
    Sun,
    Trash2,
    User,
    Zap,
} from "lucide-react";

import { formatPatientCardSubtitle, loadSelectedPatient } from "../lib/patientSession";
import { loadSelectedScanWorkflowPlans, type WorkflowSequenceType } from "../lib/scanWorkflowSession";
import { FourDScoutViewport } from "./HelicalScanConfirmScreen";
import { PatientConfirmationModal } from "./ScanConfirmScreen";

const HOLD_DURATION_MS = 3000;
const SCAN_DURATION_MS = 16000;
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
    breathingMode: "自由呼吸",
    triggerThreshold: "50%",
    ctdiVol: "40.95",
    dlp: "1334.97",
};

type ScanStage = "idle" | "arming" | "enabled" | "exposing" | "completed";

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
    const navigate = useNavigate();
    const selectedPatient = useMemo(() => loadSelectedPatient(), []);
    const workflowPlans = useMemo(() => loadSelectedScanWorkflowPlans(), []);

    const [laserActive, setLaserActive] = useState(false);
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
    const [showAbortConfirm, setShowAbortConfirm] = useState(false);
    const [showPatientConfirm, setShowPatientConfirm] = useState(false);
    const [guideVisible, setGuideVisible] = useState(false);

    const [scanStage, setScanStage] = useState<ScanStage>("idle");
    const [holdProgress, setHoldProgress] = useState(0);
    const [scanStarted, setScanStarted] = useState(false);
    const [scanCompleted, setScanCompleted] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
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
        triggerDelay: 120,
    });

    const [rawWaveData, setRawWaveData] = useState<number[]>(new Array(500).fill(100));
    const [filteredWaveData, setFilteredWaveData] = useState<number[]>(new Array(500).fill(100));
    const [metrics, setMetrics] = useState({ bpm: "14.2", peakErr: "1.6", freqErr: "1.8" });

    const holdRafRef = useRef<number | null>(null);
    const holdStartRef = useRef<number | null>(null);
    const scanRafRef = useRef<number | null>(null);
    const waveRafRef = useRef<number | null>(null);
    const waveTimeRef = useRef(0);

    const buildGroups = useCallback((): ProtocolGroup[] => {
        if (workflowPlans.length === 0) {
            return [{
                id: "g1",
                name: "胸部4D",
                sequences: [
                    { id: "s1", name: "定位像", type: "scout", steps: ["激光灯定位", "参数确认", "执行扫描"] },
                    { id: "s2", name: "4D扫描", type: "4d", steps: ["参数确认", "执行扫描"] },
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
                    ? ["激光灯定位", "参数确认", "执行扫描"]
                    : ["参数确认", "执行扫描"],
            })),
        }));
    }, [workflowPlans]);

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

    const bedSegmentCount = useMemo(
        () => Math.max(1, Math.ceil(dynamicParams.scanLength / BED_TRAVEL_MM)),
        [dynamicParams.scanLength]
    );

    const handleScanComplete = useCallback(() => {
        setScanStarted(false);
        setScanCompleted(true);
        setScanStage("completed");
        setScanProgress(1);
        setBedProgress(bedSegmentCount);
    }, [bedSegmentCount]);

    /** 扫描完成后点击"下一步"时的路由决策 */
    const handlePostScanNavigate = useCallback(() => {
        const scanResult = generateMockScanResult(
            bedSegmentCount,
            Number(FOURD_PARAMS.phases),
            dynamicParams.scanLength
        );
        const postScanState: FourDPostScanState = { scanResult };

        if (scanResult.rescanOccurred) {
            // 先做重扫区域选择，再进图像浏览
            navigate("/fourd-rescan-select", { state: postScanState });
        } else {
            // 直接进图像浏览，若有相位冲突在那里弹窗处理
            navigate("/image-load", { state: postScanState });
        }
    }, [bedSegmentCount, dynamicParams.scanLength, navigate]);

    const handleCropBoxChange = useCallback(({ width, height }: { width: number; height: number }) => {
        setDynamicParams({
            scanLength: Number((height * 458.33).toFixed(1)),
            fov: Math.round(width * 892.86),
        });
    }, []);

    const triggerScanSequence = useCallback(() => {
        clearHoldRaf();
        setHoldProgress(1);
        setScanStage("enabled");

        window.setTimeout(() => {
            setScanStage("exposing");
            setGuideVisible(false);
        }, 180);

        window.setTimeout(() => {
            setScanStarted(true);
            setScanCompleted(false);
            setScanProgress(0);
            setBedProgress(0);
        }, 1200);
    }, []);

    const startHold = () => {
        if (!guideVisible || scanStage === "exposing" || scanStage === "completed") return;

        clearHoldRaf();
        holdStartRef.current = performance.now();
        setScanStage("arming");

        const tick = (timestamp: number) => {
            const startedAt = holdStartRef.current ?? timestamp;
            const progress = Math.min((timestamp - startedAt) / HOLD_DURATION_MS, 1);
            setHoldProgress(progress);

            if (progress >= 1) {
                triggerScanSequence();
                return;
            }

            holdRafRef.current = requestAnimationFrame(tick);
        };

        holdRafRef.current = requestAnimationFrame(tick);
    };

    const stopHold = () => {
        if (scanStage !== "arming") return;
        clearHoldRaf();
        holdStartRef.current = null;
        setHoldProgress(0);
        setScanStage("idle");
    };

    useEffect(() => {
        if (!scanStarted) return;

        let startTs: number | null = null;

        const tick = (timestamp: number) => {
            if (startTs === null) startTs = timestamp;
            const progress = Math.min((timestamp - startTs) / SCAN_DURATION_MS, 1);
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
    }, [bedSegmentCount, handleScanComplete, scanStarted]);

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
        clearScanRaf();
    }, []);

    const statusText =
        scanStage === "arming" ? `长按触发 ${Math.max(0, (1 - holdProgress) * 3).toFixed(1)}s`
        : scanStage === "enabled" ? "系统已使能"
        : scanStage === "exposing" ? "正在采集..."
        : scanStage === "completed" ? "采集完成"
        : "等待执行";

    const guideTitle =
        scanStage === "arming" ? "持续按住绿色按钮"
        : scanStage === "enabled" ? "系统已使能"
        : scanStage === "exposing" ? "正在4D采集"
        : "按住绿色按钮";

    const sidebarParams = [
        { label: "进出床", value: FOURD_PARAMS.bedMode, accent: false },
        { label: "体位", value: FOURD_PARAMS.position, accent: false },
        { label: "扫描长度", value: dynamicParams.scanLength.toFixed(1), accent: false },
        { label: "mA", value: FOURD_PARAMS.mA, accent: true },
        { label: "KV", value: FOURD_PARAMS.kV, accent: true },
        { label: "旋转时间", value: FOURD_PARAMS.rotationTime, accent: true },
        { label: "焦点", value: FOURD_PARAMS.focus, accent: true },
        { label: "FOV", value: dynamicParams.fov.toString(), accent: true },
        { label: "CTDIvol", value: FOURD_PARAMS.ctdiVol, unit: "mGy", accent: false, dose: true },
        { label: "DLP", value: FOURD_PARAMS.dlp, unit: "mGy·cm", accent: false, dose: true },
    ];

    const currentBedDisplay = scanCompleted ? bedSegmentCount : scanStarted ? Math.max(1, bedProgress) : 0;
    const waveformExposureWidth = 96;
    const waveformExposureX = Math.max(0, Math.min(800 - waveformExposureWidth, scanProgress * (800 - waveformExposureWidth)));

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
            <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                        <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
                            <User size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold text-[#37474F]">{selectedPatient?.name ?? "未选择患者"}</span>
                            <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5">
                                {formatPatientCardSubtitle(selectedPatient)}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
                        <div className="text-[9px] font-bold italic">♂ 0</div>
                        <div className="text-[9px] font-bold">♀ 0</div>
                        <div className="flex items-center gap-1 text-[11px] font-bold">
                            <Flame size={14} />
                            <span>0%</span>
                        </div>
                    </div>
                </div>

                <div className="text-center">
                    <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">13:52</div>
                    <div className="text-[12px] text-[#546E7A] font-medium mt-1 uppercase opacity-80">2月26日 周四</div>
                </div>

                <div className="flex items-center gap-5 pr-2">
                    <div className="p-1 text-[#D32F2F] cursor-pointer hover:opacity-70"><Siren size={30} strokeWidth={1.8} /></div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Network size={24} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">5</span>
                    </div>
                    <button
                        type="button"
                        aria-label="激光灯"
                        aria-pressed={laserActive}
                        onClick={() => setLaserActive((prev) => !prev)}
                        className={`relative p-1 bg-transparent border-0 shadow-none outline-none transition-all ${
                            laserActive ? "text-[#F59E0B]" : "text-[#546E7A] hover:opacity-70"
                        }`}
                    >
                        <Sun size={24} />
                    </button>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Settings size={24} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">10</span>
                    </div>
                </div>
            </header>

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
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#64748B]">扫描队列</span>
                            <span className="text-[9px] font-bold text-[#94A3B8]">{groups.length} 组</span>
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
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#64748B]">扫描参数</span>
                            <span className="text-[9px] font-bold text-[#94A3B8]">4D</span>
                        </div>
                        <div className="flex-1 px-2 pb-2 flex flex-col gap-2 overflow-y-auto overscroll-contain">
                            <div className="grid grid-cols-2 gap-2">
                                {sidebarParams.map(({ label, value, accent, unit, dose }) => (
                                    <div
                                        key={label}
                                        className={`min-h-[38px] p-1.5 bg-white border rounded-md flex flex-col items-center justify-center shadow-sm ${
                                            dose ? "border-[#F59E0B]/30 bg-[#FFF7ED]" : "border-[#B0C4DE]/40"
                                        } ${
                                            accent ? "group hover:border-[#4D94FF] cursor-pointer" : ""
                                        }`}
                                    >
                                        <span className={`text-[9px] font-black uppercase tracking-tighter ${dose ? "text-[#B45309]/70" : "text-[#90A4AE]"}`}>{label}</span>
                                        {accent ? (
                                            <div className="flex items-center gap-1 mt-[1px]">
                                                <span className="text-[13px] font-black text-[#37474F]">{value}</span>
                                                <ChevronDown size={9} className="text-[#90A4AE] group-hover:text-[#4D94FF]" />
                                            </div>
                                        ) : (
                                            <div className="mt-[1px] flex items-baseline gap-1">
                                                <span className={`text-[13px] font-black ${dose ? "text-[#B45309]" : "text-[#37474F]"}`}>{value}</span>
                                                {unit && <span className={`text-[8px] font-bold ${dose ? "text-[#B45309]/65" : "text-[#90A4AE]"}`}>{unit}</span>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="px-2 pb-2 flex justify-center shrink-0">
                            <button className="h-[32px] w-full rounded-md text-[10px] font-bold flex items-center justify-center gap-1 border border-[#B0C4DE] bg-white text-[#4D94FF] hover:bg-blue-50 active:scale-95 shadow-sm transition-all">
                                <Info size={14} /> 参数详情
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
                                    <path
                                        d={`M ${rawWaveData.map((value, index) => `${(index / (rawWaveData.length - 1)) * 800},${120 - (value / 1100) * 120}`).join(" L ")}`}
                                        fill="none"
                                        stroke="#64748B"
                                        strokeWidth="1"
                                        className="opacity-30"
                                    />
                                    <path
                                        d={`M 0,120 L ${filteredWaveData.map((value, index) => `${(index / (filteredWaveData.length - 1)) * 800},${120 - (value / 1100) * 120}`).join(" L ")} L 800,120 Z`}
                                        fill="url(#fourd-wave-fill)"
                                    />
                                    <path
                                        d={`M ${filteredWaveData.map((value, index) => `${(index / (filteredWaveData.length - 1)) * 800},${120 - (value / 1100) * 120}`).join(" L ")}`}
                                        fill="none"
                                        stroke="#2563EB"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </div>

                            <div className="absolute inset-x-3 bottom-0.5 flex items-center gap-2">
                                <span className="text-[8px] font-black text-[#475569] uppercase opacity-70 shrink-0">床位进度</span>
                                <div className="flex flex-1 gap-1 items-end h-3">
                                    {Array.from({ length: bedSegmentCount }, (_, index) => {
                                        const isCompletedSegment = scanCompleted || index < bedProgress;
                                        const isActiveSegment = scanStarted && !scanCompleted && index === bedProgress;
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
                                {renderControlSlider("最小间距", breathingControls.minSpacing, 0.5, 5, 0.1, (value) => {
                                    setBreathingControls((prev) => ({ ...prev, minSpacing: value }));
                                }, " s")}
                                {renderControlSlider("滤波阈", breathingControls.filterThreshold, 0.1, 1, 0.01, (value) => {
                                    setBreathingControls((prev) => ({ ...prev, filterThreshold: value }));
                                })}
                                {renderControlSlider("峰值阈", breathingControls.peakThreshold, 0.5, 2.5, 0.05, (value) => {
                                    setBreathingControls((prev) => ({ ...prev, peakThreshold: value }));
                                })}
                                {renderControlSlider("增益", breathingControls.gain, 0.5, 3, 0.1, (value) => {
                                    setBreathingControls((prev) => ({ ...prev, gain: value }));
                                })}
                                {renderControlSlider("谷值阈", breathingControls.triggerDelay, 0, 500, 10, (value) => {
                                    setBreathingControls((prev) => ({ ...prev, triggerDelay: value }));
                                }, " ms")}
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
                        <ChevronLeft size={20} /> 上一步                    </button>
                </div>

                <div className="flex-1 flex justify-center">
                    {!scanCompleted && (
                        <button
                            onClick={() => setShowAbortConfirm(true)}
                            className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#F57C00] font-bold rounded-md border-2 border-[#F57C00] hover:bg-orange-50 transition-all uppercase text-[13px] shadow-sm active:scale-95"
                        >
                            <AlertTriangle size={20} /> 中止检查                        </button>
                    )}
                </div>

                <div className="flex-1 flex justify-end">
                    <button
                        disabled={scanStarted}
                        onClick={() => {
                            if (scanCompleted) {
                                handlePostScanNavigate();
                                return;
                            }
                            setShowPatientConfirm(true);
                        }}
                        className={`flex items-center gap-2 px-10 h-[52px] font-bold rounded-md shadow-lg transition-all uppercase text-[13px] active:scale-95 ${
                            scanStarted
                                ? "bg-gray-300 text-white cursor-not-allowed shadow-none active:scale-100"
                                : "bg-[#4D94FF] text-white hover:bg-blue-600"
                        }`}
                    >
                        {scanCompleted ? "下一步" : "执行扫描"} <ChevronRight size={20} />
                    </button>
                </div>
            </footer>

            <div className={`absolute bottom-[84px] right-0 top-[88px] z-40 flex items-stretch transition-all duration-500 ${guideVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
                <div className="pointer-events-auto flex h-full w-[235px] flex-col overflow-hidden rounded-l-2xl border border-r-0 border-[#CBD5E1] bg-[#EDF1F7] shadow-[-24px_0_48px_rgba(15,23,42,0.22)]">
                    <div className="border-b border-slate-200 px-5 py-4">
                        <div className="text-[14px] font-black text-slate-700">实体按键操作引导</div>
                        <div className="mt-1 text-[11px] font-medium text-slate-400">长按三秒后触发4D采集，扫描进度会在主界面实时更新。</div>
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
                                className={`group flex h-[132px] w-[132px] items-center justify-center rounded-full border-[10px] shadow-[0_22px_40px_rgba(15,23,42,0.28)] transition-all duration-200 ${
                                    scanStage === "arming" || scanStage === "enabled" || scanStage === "exposing"
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

            <PatientConfirmationModal
                isOpen={showPatientConfirm}
                onClose={() => setShowPatientConfirm(false)}
                onConfirm={() => {
                    setShowPatientConfirm(false);
                    setGuideVisible(true);
                }}
                patientData={selectedPatient ? {
                    name: selectedPatient.name,
                    age: selectedPatient.age,
                    gender: selectedPatient.gender,
                    idNumber: "--",
                    patientId: selectedPatient.patientId,
                    checkType: selectedPatient.checkType ?? "4D扫描",
                } : undefined}
                scanData={{
                    ctdi: FOURD_PARAMS.ctdiVol,
                    dlp: FOURD_PARAMS.dlp,
                    protocol: "4D扫描",
                }}
            />

            {showAbortConfirm && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl border border-[#FFE082] w-[360px] overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 bg-[#FFF8E1] border-b border-[#FFE082]">
                            <div className="w-10 h-10 rounded-full bg-[#F57C00]/15 flex items-center justify-center shrink-0">
                                <AlertTriangle size={20} className="text-[#F57C00]" />
                            </div>
                            <div>
                                <div className="text-[15px] font-black text-[#37474F]">中止检查</div>
                                <div className="text-[12px] text-[#78909C] mt-0.5">确认中止当前4D扫描流程？</div>
                            </div>
                        </div>
                        <div className="px-5 py-3">
                            <p className="text-[13px] text-[#546E7A] leading-relaxed">
                                中止后，<span className="font-bold text-[#37474F]">当前4D扫描将终止</span>，已采集数据会保留。                            </p>
                        </div>
                        <div className="flex gap-2 px-5 pb-4">
                            <button
                                onClick={() => setShowAbortConfirm(false)}
                                className="flex-1 h-[40px] bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg text-[13px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => navigate("/patients")}
                                className="flex-1 h-[40px] bg-[#F57C00] text-white font-bold rounded-lg text-[13px] hover:bg-orange-600 shadow-md transition-all active:scale-95"
                            >
                                确认中止
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
