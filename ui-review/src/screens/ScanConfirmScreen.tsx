import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
    User,
    Settings,
    Sun,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsUp,
    FilePlus,
    Trash2,
    CheckCircle,
    StretchHorizontal,
    Check,
    AlertTriangle,
    Fingerprint,
    Stethoscope,
    UserCircle,
    Info,
    X,
    Flame,
    Network,
    Siren
} from "lucide-react";
import { ensureBusinessSnapshotImported, loadProtocolCasesFromDb, type RawProtocolCase } from "../lib/protocolDb";

interface Sequence {
    id: string;
    name: string;
    steps?: string[];
}

interface ProtocolGroup {
    id: string;
    name: string;
    sequences: Sequence[];
}

type ScanConfirmScreenProps = {
    activeScoutStepIndex?: number;
    activeSequenceId?: "s1" | "s2";
    activeSequenceStepIndex?: number;
    parameterPanelMode?: "scout" | "tomographicScan" | "helicalScan";
    tomographicParamOverrides?: Partial<TomographicScanDisplayParams>;
    helicalParamOverrides?: Partial<HelicalScanDisplayParams>;
    rightViewportContent?: React.ReactNode;
    readOnlyMode?: boolean;
    onExecuteScan?: () => void;
};

type ScoutDisplayParams = {
    scanLength: string;
    mA: string;
    kV: string;
    angle: string;
    position: string;
    doseCtdiVol: string;
    doseDlp: string;
    notifyCtdiVol: string;
    notifyDlp: string;
};

type TomographicScanDisplayParams = {
    scanLength: string;
    mA: string;
    kV: string;
    angle: string;
    position: string;
    rotationTime: string;
    collimation: string;
    scanIncrement: string;
    cycleCount: string;
    scanningDirection: string;
    scoutFov: string;
};

type HelicalScanDisplayParams = {
    scanLength: string;
    mA: string;
    kV: string;
    angle: string;
    position: string;
    rotationTime: string;
    collimation: string;
    pitch: string;
    scanningDirection: string;
    scoutFov: string;
};

type ScoutDoseDisplayParams = {
    doseCtdiVol: string;
    doseDlp: string;
    notifyCtdiVol: string;
    notifyDlp: string;
};

const DEFAULT_SCOUT_PARAMS: ScoutDisplayParams = {
    scanLength: "--",
    mA: "--",
    kV: "--",
    angle: "--",
    position: "--",
    doseCtdiVol: "--",
    doseDlp: "--",
    notifyCtdiVol: "--",
    notifyDlp: "--",
};

const DEFAULT_TOMOGRAPHIC_SCAN_PARAMS: TomographicScanDisplayParams = {
    scanLength: "--",
    mA: "--",
    kV: "--",
    angle: "--",
    position: "--",
    rotationTime: "--",
    collimation: "--",
    scanIncrement: "--",
    cycleCount: "--",
    scanningDirection: "--",
    scoutFov: "--",
};

const DEFAULT_HELICAL_SCAN_PARAMS: HelicalScanDisplayParams = {
    scanLength: "--",
    mA: "--",
    kV: "--",
    angle: "--",
    position: "--",
    rotationTime: "--",
    collimation: "--",
    pitch: "--",
    scanningDirection: "--",
    scoutFov: "--",
};

const DEFAULT_SCOUT_DOSE_PARAMS: ScoutDoseDisplayParams = {
    doseCtdiVol: "--",
    doseDlp: "--",
    notifyCtdiVol: "--",
    notifyDlp: "--",
};

const toDisplayValue = (value: string | number | boolean | undefined, fractionDigits?: number): string => {
    if (typeof value === "number") {
        return typeof fractionDigits === "number" ? value.toFixed(fractionDigits) : String(value);
    }
    if (typeof value === "string" && value.trim().length > 0) return value;
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return "--";
};

const getScoutDisplayParams = (protocolCases: RawProtocolCase[] | undefined): ScoutDisplayParams => {
    if (!protocolCases || protocolCases.length === 0) return DEFAULT_SCOUT_PARAMS;

    const protocolCase = protocolCases.find((item) =>
        item.sequences.some((sequence) => sequence.sequenceType === "localizer")
    );
    if (!protocolCase) return DEFAULT_SCOUT_PARAMS;

    const scoutSequence = protocolCase.sequences.find((sequence) => sequence.sequenceType === "localizer");
    if (!scoutSequence) return DEFAULT_SCOUT_PARAMS;

    return {
        scanLength: toDisplayValue(scoutSequence.scanParams.scanLength, 2),
        mA: toDisplayValue(scoutSequence.scanParams.mA),
        kV: toDisplayValue(scoutSequence.scanParams.kV),
        angle: toDisplayValue(scoutSequence.scanParams.angle),
        position: protocolCase.protocol.supportedPositions[0] ?? "--",
        doseCtdiVol: "--",
        doseDlp: "--",
        notifyCtdiVol: "--",
        notifyDlp: "--",
    };
};

const getTomographicScanDisplayParams = (protocolCases: RawProtocolCase[] | undefined): TomographicScanDisplayParams => {
    if (!protocolCases || protocolCases.length === 0) return DEFAULT_TOMOGRAPHIC_SCAN_PARAMS;

    const protocolCase = protocolCases.find((item) =>
        item.sequences.some((sequence) => sequence.sequenceType === "scan" && sequence.mode === "断层扫描")
    );
    if (!protocolCase) return DEFAULT_TOMOGRAPHIC_SCAN_PARAMS;

    const scanSequence = protocolCase.sequences.find(
        (sequence) => sequence.sequenceType === "scan" && sequence.mode === "断层扫描"
    );
    if (!scanSequence) return DEFAULT_TOMOGRAPHIC_SCAN_PARAMS;

    return {
        scanLength: toDisplayValue(scanSequence.scanParams.scanLength, 2),
        mA: toDisplayValue(scanSequence.scanParams.mA),
        kV: toDisplayValue(scanSequence.scanParams.kV),
        angle: toDisplayValue(scanSequence.scanParams.angle),
        position: protocolCase.protocol.supportedPositions[0] ?? "--",
        rotationTime: toDisplayValue(scanSequence.scanParams.rotationTime),
        collimation: toDisplayValue(scanSequence.scanParams.collimation),
        scanIncrement: toDisplayValue(scanSequence.scanParams.scanIncrement, 1),
        cycleCount: toDisplayValue(scanSequence.scanParams.cycleCount),
        scanningDirection: toDisplayValue(scanSequence.scanParams.scanningDirection),
        scoutFov: toDisplayValue(scanSequence.scanParams.scoutFOV),
    };
};

const getHelicalScanDisplayParams = (protocolCases: RawProtocolCase[] | undefined): HelicalScanDisplayParams => {
    if (!protocolCases || protocolCases.length === 0) return DEFAULT_HELICAL_SCAN_PARAMS;

    const protocolCase = protocolCases.find((item) =>
        item.sequences.some((sequence) => sequence.sequenceType === "scan" && sequence.mode === "螺旋扫描")
    );
    if (!protocolCase) return DEFAULT_HELICAL_SCAN_PARAMS;

    const scanSequence = protocolCase.sequences.find(
        (sequence) => sequence.sequenceType === "scan" && sequence.mode === "螺旋扫描"
    );
    if (!scanSequence) return DEFAULT_HELICAL_SCAN_PARAMS;

    return {
        scanLength: toDisplayValue(scanSequence.scanParams.scanLength, 2),
        mA: toDisplayValue(scanSequence.scanParams.mA),
        kV: toDisplayValue(scanSequence.scanParams.kV),
        angle: toDisplayValue(scanSequence.scanParams.angle),
        position: protocolCase.protocol.supportedPositions[0] ?? "--",
        rotationTime: toDisplayValue(scanSequence.scanParams.rotationTime),
        collimation: toDisplayValue(scanSequence.scanParams.collimation),
        pitch: toDisplayValue(scanSequence.scanParams.pitch, 3),
        scanningDirection: toDisplayValue(scanSequence.scanParams.scanningDirection),
        scoutFov: toDisplayValue(scanSequence.scanParams.scoutFOV),
    };
};

const ScanConfirmScreen = ({
    activeScoutStepIndex = 1,
    activeSequenceId = "s1",
    activeSequenceStepIndex,
    parameterPanelMode = "scout",
    tomographicParamOverrides,
    helicalParamOverrides,
    rightViewportContent,
    readOnlyMode = false,
    onExecuteScan,
}: ScanConfirmScreenProps) => {
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
    const [bedMode, setBedMode] = useState<"in" | "out">("in");
    const [patientPosition, setPatientPosition] = useState("HFS");

    // Data structure with sequences at the same level
    const [groups, setGroups] = useState<ProtocolGroup[]>([
        {
            id: 'g1',
            name: 'Head_FacialBoneVolume',
            sequences: [
                { id: 's1', name: 'Scout', steps: ['打开激光灯获取定位', '确认参数', '执行扫描'] },
                { id: 's2', name: 'Helical Scan', steps: ['参数确认', '执行扫描'] }
            ]
        }
    ]);

    const [expandedSeqId, setExpandedSeqId] = useState<string | null>(activeSequenceId);
    const [checkedSeqIds, setCheckedSeqIds] = useState<string[]>([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAbortConfirm, setShowAbortConfirm] = useState(false);
    const [showPatientConfirm, setShowPatientConfirm] = useState(false);
    const [scoutDoseDisplayParams, setScoutDoseDisplayParams] = useState<ScoutDoseDisplayParams>(DEFAULT_SCOUT_DOSE_PARAMS);

    useEffect(() => {
        let isMounted = true;

        const importSnapshot = async () => {
            try {
                const response = await fetch("/db_business_4tables_for_ai.json");
                if (!response.ok) return;
                const snapshot = await response.json();
                if (!isMounted) return;
                await ensureBusinessSnapshotImported(snapshot);

                const protocolRows = snapshot?.tables?.protocol?.rows;
                if (!Array.isArray(protocolRows) || protocolRows.length === 0) return;

                const matchingProtocol =
                    protocolRows.find((row: { supportedModes?: string; doseCtdiVol?: number; doseDlp?: number }) =>
                        typeof row.supportedModes === "string" && row.supportedModes.includes("定位像")
                    ) ?? protocolRows[0];

                setScoutDoseDisplayParams({
                    doseCtdiVol: toDisplayValue(matchingProtocol?.doseCtdiVol, 2),
                    doseDlp: toDisplayValue(matchingProtocol?.doseDlp, 2),
                    notifyCtdiVol: toDisplayValue(matchingProtocol?.notifyCtdiVol, 2),
                    notifyDlp: toDisplayValue(matchingProtocol?.notifyDlp, 2),
                });
            } catch (error) {
                console.error("Failed to import protocol snapshot for scan confirm screen.", error);
            }
        };

        void importSnapshot();

        return () => {
            isMounted = false;
        };
    }, []);

    const dbProtocolCases = useLiveQuery(() => loadProtocolCasesFromDb(), [], []);
    const scoutDisplayParams = getScoutDisplayParams(dbProtocolCases);
    const tomographicScanDisplayParams = getTomographicScanDisplayParams(dbProtocolCases);
    const helicalScanDisplayParams = getHelicalScanDisplayParams(dbProtocolCases);
    const resolvedTomographicScanDisplayParams = {
        ...tomographicScanDisplayParams,
        ...tomographicParamOverrides,
    };
    const resolvedHelicalScanDisplayParams = {
        ...helicalScanDisplayParams,
        ...helicalParamOverrides,
    };

    useEffect(() => {
        const resolvedPosition = parameterPanelMode === "tomographicScan"
            ? resolvedTomographicScanDisplayParams.position
            : parameterPanelMode === "helicalScan"
                ? resolvedHelicalScanDisplayParams.position
                : scoutDisplayParams.position;
        if (resolvedPosition !== "--") {
            setPatientPosition(resolvedPosition);
        }
    }, [parameterPanelMode, scoutDisplayParams.position, resolvedTomographicScanDisplayParams.position, resolvedHelicalScanDisplayParams.position]);

    useEffect(() => {
        if (parameterPanelMode !== "tomographicScan" && parameterPanelMode !== "helicalScan") return;
        const direction = parameterPanelMode === "helicalScan"
            ? resolvedHelicalScanDisplayParams.scanningDirection
            : resolvedTomographicScanDisplayParams.scanningDirection;
        if (direction === "IN" || direction === "OUT") {
            setBedMode(direction === "IN" ? "in" : "out");
        }
    }, [parameterPanelMode, resolvedTomographicScanDisplayParams.scanningDirection, resolvedHelicalScanDisplayParams.scanningDirection]);

    useEffect(() => {
        setExpandedSeqId(activeSequenceId);
    }, [activeSequenceId]);

    const toggleCheck = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setCheckedSeqIds(prev => {
            const next = new Set(prev);

            // Check if it's a group
            const group = groups.find(g => g.id === id);
            if (group) {
                const childIds = group.sequences.map(s => s.id);
                const allSelected = childIds.every(cid => next.has(cid));

                if (allSelected) {
                    childIds.forEach(cid => next.delete(cid));
                } else {
                    childIds.forEach(cid => next.add(cid));
                }
            } else {
                // It's a sequence
                if (next.has(id)) next.delete(id);
                else next.add(id);
            }
            return Array.from(next);
        });
    };

    const handleDeleteClick = () => {
        if (checkedSeqIds.length === 0) return;
        setShowDeleteConfirm(true);
    };

    const handleConfirmDelete = () => {
        setGroups(prev => prev
            .map(g => ({ ...g, sequences: g.sequences.filter(s => !checkedSeqIds.includes(s.id)) }))
            .filter(g => g.sequences.length > 0)
        );
        setCheckedSeqIds([]);
        setShowDeleteConfirm(false);
    };

    return (
        <div className={`flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative text-[#37474F] font-sans select-none ${readOnlyMode ? "scan-confirm-read-only" : ""}`}>
            {readOnlyMode && (
                <style>{`.scan-confirm-read-only select { pointer-events: none; } .scan-confirm-read-only .cursor-pointer { cursor: default !important; }`}</style>
            )}

            {/* 1. Header (System Info) */}
            <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                        <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
                            <User size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold text-[#37474F]">Roky Zhang</span>
                            <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5">ID: 67890</span>
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
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Sun size={24} />
                    </div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Settings size={24} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">10</span>
                    </div>
                </div>
            </header>

            {/* 2. Main Content Area */}
            <main className="flex-1 flex overflow-hidden p-2 gap-1">
                {/* Left Sidebar Card */}
                <aside className="w-[240px] bg-white rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden shrink-0">
                    {/* Sidebar Toolbar - Precise match to screenshot */}
                    <div className="h-[48px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-3 shrink-0">
                        <div className="flex items-center gap-2">
                            <button className="p-1.5 text-[#546E7A] hover:bg-[#EEF2F9] rounded transition-all"><FilePlus size={18} /></button>
                            <button
                                onClick={handleDeleteClick}
                                className={`p-1.5 rounded transition-all relative ${checkedSeqIds.length > 0
                                    ? 'text-[#D32F2F] hover:bg-[#FFEBEE]'
                                    : 'text-[#90A4AE] opacity-40 cursor-not-allowed'
                                    }`}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                        <button
                            onClick={() => setIsTreeCollapsed(!isTreeCollapsed)}
                            className="p-1.5 text-[#4D94FF] hover:bg-[#EEF2F9] rounded transition-all"
                        >
                            {isTreeCollapsed ? <ChevronDown size={20} /> : <ChevronsUp size={20} />}
                        </button>
                    </div>

                    {/* Protocol Tree Summary - Fixed Hierarchy */}
                    <div className={`overflow-y-auto p-2 flex flex-col gap-0 transition-all duration-300 ${isTreeCollapsed ? 'h-[48px] opacity-40 grayscale overflow-hidden' : 'h-[240px]'}`}>
                        {groups.map(group => (
                            <div key={group.id} className="flex flex-col">
                                <div
                                    onClick={(e) => toggleCheck(group.id, e as React.MouseEvent)}
                                    className="flex items-center gap-2 px-2 py-1.5 text-[#37474F] cursor-pointer hover:bg-[#EEF2F9] rounded-md transition-all"
                                >
                                    <ChevronDown size={14} className="opacity-40" />
                                    <div
                                        onClick={(e) => toggleCheck(group.id, e as React.MouseEvent)}
                                        className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${group.sequences.every(s => checkedSeqIds.includes(s.id))
                                            ? 'bg-[#4D94FF] border-[#4D94FF]'
                                            : 'bg-white border-[#B0C4DE]'
                                            }`}
                                    >
                                        {group.sequences.every(s => checkedSeqIds.includes(s.id)) && <Check size={9} className="text-white stroke-[3]" />}
                                    </div>
                                    <span className={`text-[13px] font-bold truncate transition-all ${group.sequences.every(s => checkedSeqIds.includes(s.id)) ? 'text-[#4D94FF]' : 'text-[#37474F]'
                                        }`}>{group.name}</span>
                                </div>
                                <div className="flex flex-col">
                                    {group.sequences.map(seq => {
                                        const isExpanded = expandedSeqId === seq.id;
                                        const isActive = seq.id === activeSequenceId;

                                        return (
                                            <div key={seq.id} className="mb-1">
                                                <div
                                                    onClick={() => setExpandedSeqId(isExpanded ? null : seq.id)}
                                                    className={`flex items-center gap-2 px-3 rounded-lg mb-1 transition-all relative cursor-pointer border ${seq.name === 'Scout' || seq.name === 'Helical Scan' ? 'h-[28px]' : 'py-2.5'} ${isActive
                                                        ? 'bg-[#4D94FF] border-[#4D94FF] text-white shadow-md'
                                                        : (checkedSeqIds.includes(seq.id) ? 'bg-[#E3F2FD] border-[#4D94FF]/30 text-[#4D94FF]' : 'bg-transparent border-transparent text-[#546E7A] hover:bg-[#EEF2F9]')
                                                        }`}
                                                >
                                                    {isExpanded ? <ChevronDown size={14} className={checkedSeqIds.includes(seq.id) ? 'text-[#4D94FF]/60' : isActive ? "text-white/70" : "text-gray-400"} /> : <ChevronRight size={14} className={checkedSeqIds.includes(seq.id) ? 'text-[#4D94FF]/60' : isActive ? "text-white/70" : "text-gray-400"} />}

                                                    {/* Checkbox */}
                                                    <div
                                                        onClick={(e) => toggleCheck(seq.id, e)}
                                                        className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checkedSeqIds.includes(seq.id)
                                                            ? (isActive ? 'bg-white border-white/30' : 'bg-[#4D94FF] border-[#4D94FF]')
                                                            : (isActive ? 'bg-white/20 border-white/30' : 'bg-white border-[#B0C4DE]')
                                                            }`}
                                                    >
                                                        {checkedSeqIds.includes(seq.id) && <Check size={9} className={`${isActive ? 'text-[#4D94FF]' : 'text-white'} stroke-[3]`} />}
                                                    </div>

                                                    <span className="text-[13px] font-bold">{seq.name}</span>
                                                </div>

                                                {/* Toggleable Workflow Steps */}
                                                {isExpanded && seq.steps && seq.steps.length > 0 && (
                                                    <div className="flex flex-col ml-12 mt-2 gap-4 relative pb-4">
                                                        {/* Connector Line */}
                                                        <div className="absolute left-[7px] top-2 bottom-6 w-[1px] bg-[#B0C4DE]"></div>

                                                        {seq.steps.map((step, idx) => {
                                                            const isActiveSequence = seq.id === activeSequenceId;
                                                            const resolvedStepIndex = seq.id === "s1"
                                                                ? activeScoutStepIndex
                                                                : (activeSequenceStepIndex ?? 0);
                                                            const isStepCompleted = isActiveSequence && idx < resolvedStepIndex;
                                                            const isStepInProgress = isActiveSequence && idx === resolvedStepIndex;

                                                            return (
                                                                <div key={idx} className="flex items-center gap-3 z-10">
                                                                    {isStepCompleted ? (
                                                                        <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                                                                            <CheckCircle size={16} className="text-[#66BB6A]" />
                                                                        </div>
                                                                    ) : isStepInProgress ? (
                                                                        <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-[#4D94FF] translate-x-[1px] shadow-[0_0_8px_rgba(77,148,255,0.3)]"></div>
                                                                    ) : (
                                                                        <div className="w-3.5 h-3.5 rounded-full bg-white border border-[#B0C4DE] translate-x-[1px]"></div>
                                                                    )}
                                                                    <span className={`text-[12px] font-bold ${isStepInProgress ? 'text-[#37474F]' : 'text-[#37474F]/60'}`}>
                                                                        {step}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* New Parameter Confirmation Area */}
                    <div className="flex-1 border-t border-[#EEF2F9] bg-[#F8FAFC] flex flex-col overflow-hidden">
                        <div className="hidden">
                            <div className="grid grid-cols-2 gap-2">
                                <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                    <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">进出床</span>
                                    <div className="relative w-full">
                                        <select
                                            value={bedMode}
                                            onChange={(event) => setBedMode(event.target.value as "in" | "out")}
                                            disabled={readOnlyMode}
                                            className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                        >
                                            <option value="in">进床</option>
                                            <option value="out">出床</option>
                                        </select>
                                        <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                    </div>
                                </label>
                                <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                    <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">体位</span>
                                    <div className="relative w-full">
                                        <select
                                            value={patientPosition}
                                            onChange={(event) => setPatientPosition(event.target.value)}
                                            disabled={readOnlyMode}
                                            className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                        >
                                            <option value="HFS">HFS</option>
                                            <option value="FFS">FFS</option>
                                            <option value="HFP">HFP</option>
                                            <option value="FFP">FFP</option>
                                            <option value="HFDR">HFDR</option>
                                            <option value="FFDR">FFDR</option>
                                            <option value="HFDL">HFDL</option>
                                            <option value="FFDL">FFDL</option>
                                        </select>
                                        <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                    </div>
                                </label>
                            </div>
                        </div>
                        {/* In/Out Toggle */}
                        <div className="hidden">
                            <div className="flex w-full h-[36px] bg-white border border-[#B0C4DE] rounded-sm overflow-hidden p-[2px]">
                                <button
                                    onClick={() => setBedMode("in")}
                                    className={`flex-1 flex items-center justify-center text-[12px] font-bold rounded-sm transition-all ${bedMode === "in" ? 'bg-[#4D94FF] text-white shadow-inner' : 'text-[#90A4AE] hover:bg-gray-50'}`}
                                >
                                    进床
                                </button>
                                <button
                                    onClick={() => setBedMode("out")}
                                    className={`flex-1 flex items-center justify-center text-[12px] font-bold rounded-sm transition-all ${bedMode === "out" ? 'bg-[#4D94FF] text-white shadow-inner' : 'text-[#90A4AE] hover:bg-gray-50'}`}
                                >
                                    出床
                                </button>
                            </div>
                        </div>

                        {/* Reorganized Parameter Grid - 2 Column Layout */}
                        <div className="flex-1 p-2 pt-2 flex flex-col gap-2 overflow-y-auto">
                            {parameterPanelMode === "tomographicScan" ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">进出床</span>
                                        <div className="relative w-full">
                                            <select
                                                value={bedMode}
                                                onChange={(event) => setBedMode(event.target.value as "in" | "out")}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="in">进床</option>
                                                <option value="out">出床</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">体位</span>
                                        <div className="relative w-full">
                                            <select
                                                value={patientPosition}
                                                onChange={(event) => setPatientPosition(event.target.value)}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="HFS">HFS</option>
                                                <option value="FFS">FFS</option>
                                                <option value="HFP">HFP</option>
                                                <option value="FFP">FFP</option>
                                                <option value="HFDR">HFDR</option>
                                                <option value="FFDR">FFDR</option>
                                                <option value="HFDL">HFDL</option>
                                                <option value="FFDL">FFDL</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">扫描长度</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{resolvedTomographicScanDisplayParams.scanLength}</span>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">mA</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedTomographicScanDisplayParams.mA}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">KV</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedTomographicScanDisplayParams.kV}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">旋转时间</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedTomographicScanDisplayParams.rotationTime}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">准直器</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{resolvedTomographicScanDisplayParams.collimation}</span>
                                    </div>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">扫描增量</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{resolvedTomographicScanDisplayParams.scanIncrement}</span>
                                    </div>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">循环次数</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{resolvedTomographicScanDisplayParams.cycleCount}</span>
                                    </div>
                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">FOV</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedTomographicScanDisplayParams.scoutFov}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">床倾角</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedTomographicScanDisplayParams.angle}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>
                                </div>
                            ) : parameterPanelMode === "helicalScan" ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">进出床</span>
                                        <div className="relative w-full">
                                            <select
                                                value={bedMode}
                                                onChange={(event) => setBedMode(event.target.value as "in" | "out")}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="in">进床</option>
                                                <option value="out">出床</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">体位</span>
                                        <div className="relative w-full">
                                            <select
                                                value={patientPosition}
                                                onChange={(event) => setPatientPosition(event.target.value)}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="HFS">HFS</option>
                                                <option value="FFS">FFS</option>
                                                <option value="HFP">HFP</option>
                                                <option value="FFP">FFP</option>
                                                <option value="HFDR">HFDR</option>
                                                <option value="FFDR">FFDR</option>
                                                <option value="HFDL">HFDL</option>
                                                <option value="FFDL">FFDL</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">扫描长度</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{resolvedHelicalScanDisplayParams.scanLength}</span>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">mA</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedHelicalScanDisplayParams.mA}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">KV</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedHelicalScanDisplayParams.kV}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">旋转时间</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedHelicalScanDisplayParams.rotationTime}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">准直器</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{resolvedHelicalScanDisplayParams.collimation}</span>
                                    </div>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">Pitch</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{resolvedHelicalScanDisplayParams.pitch}</span>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">FOV</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedHelicalScanDisplayParams.scoutFov}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">床倾角</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{resolvedHelicalScanDisplayParams.angle}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">进出床</span>
                                        <div className="relative w-full">
                                            <select
                                                value={bedMode}
                                                onChange={(event) => setBedMode(event.target.value as "in" | "out")}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="in">进床</option>
                                                <option value="out">出床</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    <label className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm cursor-pointer">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">体位</span>
                                        <div className="relative w-full">
                                            <select
                                                value={patientPosition}
                                                onChange={(event) => setPatientPosition(event.target.value)}
                                                className="h-[18px] w-full appearance-none bg-transparent px-1 pr-4 text-center text-[13px] font-black text-[#37474F] outline-none"
                                            >
                                                <option value="HFS">HFS</option>
                                                <option value="FFS">FFS</option>
                                                <option value="HFP">HFP</option>
                                                <option value="FFP">FFP</option>
                                                <option value="HFDR">HFDR</option>
                                                <option value="FFDR">FFDR</option>
                                                <option value="HFDL">HFDL</option>
                                                <option value="FFDL">FFDL</option>
                                            </select>
                                            <ChevronDown size={9} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                                        </div>
                                    </label>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">扫描长度</span>
                                        <span className="text-[13px] font-black text-[#B0BEC5] mt-[1px]">{scoutDisplayParams.scanLength}</span>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">mA</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{scoutDisplayParams.mA}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">KV</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{scoutDisplayParams.kV}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className={`p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm group ${readOnlyMode ? "cursor-default" : "hover:border-[#4D94FF] cursor-pointer"}`}>
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">平扫角度</span>
                                        <div className="flex items-center gap-1 mt-[1px]">
                                            <span className="text-[13px] font-black text-[#37474F]">{scoutDisplayParams.angle}</span>
                                            <ChevronDown size={9} className={`text-[#90A4AE] ${readOnlyMode ? "" : "group-hover:text-[#4D94FF]"}`} />
                                        </div>
                                    </div>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">CTDIvol</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{scoutDoseDisplayParams.doseCtdiVol}</span>
                                    </div>

                                    <div className="p-1.5 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">DLP</span>
                                        <span className="text-[13px] font-black text-[#37474F] mt-[1px]">{scoutDoseDisplayParams.doseDlp}</span>
                                    </div>

                                    <div className="hidden">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <StretchHorizontal size={14} className="text-[#4D94FF]" />
                                            <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">体位 (Position)</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[14px] font-black text-[#37474F]">{scoutDisplayParams.position}</span>
                                            <ChevronDown size={12} className="text-[#90A4AE] group-hover:text-[#4D94FF]" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Details Button */}
                        <div className="p-2 flex justify-center shrink-0">
                            <button disabled={readOnlyMode} className={`h-[32px] w-full rounded-md text-[10px] font-bold flex items-center justify-center gap-1 border shadow-sm transition-all ${readOnlyMode ? "bg-[#F1F5F9] border-[#CBD5E1] text-[#94A3B8] cursor-not-allowed" : "bg-white border-[#B0C4DE] text-[#4D94FF] hover:bg-blue-50 active:scale-95"}`}>
                                <Info size={14} /> 参数详情
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Right Viewport Card */}
                <section className="flex-1 bg-[#1A222B] rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden relative">
                    {rightViewportContent ?? (
                        <div className="flex-1 flex items-center justify-center overflow-hidden">
                            <div className="w-full h-full opacity-10 bg-gradient-to-br from-blue-900/40 to-transparent flex items-center justify-center text-[#546E7A] uppercase font-thin text-[52px] tracking-[16px]">
                                Viewport
                            </div>
                        </div>
                    )}
                </section>
            </main>

            {/* 3. Footer (Nav Buttons) */}
            <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10">
                <div className="flex-1">
                    <button disabled={readOnlyMode} className={`flex items-center gap-2 px-10 h-[52px] font-bold rounded-md border-2 shadow-sm transition-all uppercase text-[13px] ${readOnlyMode ? "bg-[#F8FAFC] text-[#94A3B8] border-[#CBD5E1] cursor-not-allowed" : "bg-white text-[#4D94FF] border-[#4D94FF] hover:bg-solid active:scale-95"}`}>
                        <ChevronLeft size={20} /> 上一步
                    </button>
                </div>
                <div className="flex-1 flex justify-center">
                    <button
                        onClick={() => setShowAbortConfirm(true)}
                        disabled={readOnlyMode}
                        className={`flex items-center gap-2 px-10 h-[52px] font-bold rounded-md border-2 transition-all uppercase text-[13px] shadow-sm ${readOnlyMode ? "bg-[#F8FAFC] text-[#94A3B8] border-[#CBD5E1] cursor-not-allowed" : "bg-white text-[#F57C00] border-[#F57C00] hover:bg-orange-50 active:scale-95"}`}>
                        <AlertTriangle size={20} /> 中止检查
                    </button>
                </div>
                <div className="flex-1 flex justify-end">
                    <button
                        onClick={() => {
                            if (onExecuteScan) {
                                onExecuteScan();
                                return;
                            }
                            setShowPatientConfirm(true);
                        }}
                        disabled={readOnlyMode && !onExecuteScan}
                        className={`flex items-center gap-2 px-10 h-[52px] font-bold rounded-md transition-all uppercase text-[13px] ${readOnlyMode && !onExecuteScan ? "bg-[#CBD5E1] text-white cursor-not-allowed shadow-none" : "bg-[#4D94FF] text-white shadow-lg hover:bg-blue-600 active:scale-95"}`}
                    >
                        执行扫描 <ChevronRight size={20} />
                    </button>
                </div>
            </footer>

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl border border-[#B0C4DE] w-[340px] overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 bg-[#FFF8E1] border-b border-[#FFE082]">
                            <div className="w-9 h-9 rounded-full bg-[#F57C00]/10 flex items-center justify-center shrink-0">
                                <AlertTriangle size={16} className="text-[#F57C00]" />
                            </div>
                            <div>
                                <div className="text-[14px] font-black text-[#37474F]">确认删除序列</div>
                                <div className="text-[11px] text-[#78909C] mt-0.5">已选 {checkedSeqIds.length} 项，此操作不可恢复</div>
                            </div>
                        </div>
                        <div className="px-5 pt-3 pb-1">
                            <ul className="flex flex-col gap-1.5">
                                {checkedSeqIds.map(id => {
                                    const seq = groups.flatMap(g => g.sequences).find(s => s.id === id);
                                    return seq ? (
                                        <li key={id} className="flex items-center gap-2 text-[12px] text-[#37474F] font-bold">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#D32F2F] shrink-0" />
                                            {seq.name}
                                        </li>
                                    ) : null;
                                })}
                            </ul>
                        </div>
                        <div className="flex gap-2 px-5 py-4">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 h-[40px] bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg text-[13px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="flex-1 h-[40px] bg-[#D32F2F] text-white font-bold rounded-lg text-[13px] hover:bg-red-700 shadow-md transition-all active:scale-95"
                            >
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Abort Confirmation Dialog */}
            {showAbortConfirm && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl border border-[#FFE082] w-[360px] overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 bg-[#FFF8E1] border-b border-[#FFE082]">
                            <div className="w-10 h-10 rounded-full bg-[#F57C00]/15 flex items-center justify-center shrink-0">
                                <AlertTriangle size={20} className="text-[#F57C00]" />
                            </div>
                            <div>
                                <div className="text-[15px] font-black text-[#37474F]">中止检查</div>
                                <div className="text-[12px] text-[#78909C] mt-0.5">确认中止当前检查流程？</div>
                            </div>
                        </div>
                        <div className="px-5 py-3">
                            <p className="text-[13px] text-[#546E7A] leading-relaxed">
                                中止后，<span className="font-bold text-[#37474F]">当前扫描参数将清空</span>，需要重新进入流程。
                            </p>
                        </div>
                        <div className="flex gap-2 px-5 pb-5">
                            <button
                                onClick={() => setShowAbortConfirm(false)}
                                className="flex-1 h-[40px] bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg text-[13px] hover:bg-gray-50 transition-all active:scale-95"
                            >
                                继续检查
                            </button>
                            <button
                                onClick={() => setShowAbortConfirm(false)}
                                className="flex-1 h-[40px] bg-[#F57C00] text-white font-bold rounded-lg text-[13px] hover:bg-orange-600 shadow-md transition-all active:scale-95"
                            >
                                确认中止
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <PatientConfirmationModal isOpen={showPatientConfirm} onClose={() => setShowPatientConfirm(false)} />
        </div>
    );
};

/**
 * PatientConfirmationModal - 适配 1024x768 的精简版患者确认弹窗
 */
interface PatientData {
    name: string;
    age: number;
    gender: string;
    idNumber: string;
    patientId: string;
    checkType: string;
}

interface ScanData {
    ctdi: string;
    dlp: string;
    protocol: string;
}

interface PatientConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    patientData?: PatientData;
    scanData?: ScanData;
}

// 辅助组件：信息项
const InfoItem = ({ label, value, icon: Icon }: { label: string; value: string | number; icon?: React.ElementType }) => (
    <div className="flex flex-col gap-1 p-4 bg-[#F8FAFC] rounded-2xl border border-[#F1F5F9] transition-all">
        <div className="flex items-center gap-2 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
            {Icon && <Icon size={12} />}
            {label}
        </div>
        <div className="text-[18px] font-bold text-[#334155] truncate">
            {value || "---"}
        </div>
    </div>
);

const PatientConfirmationModal: React.FC<PatientConfirmationModalProps> = ({
    isOpen,
    onClose,
    patientData = {
        name: "张三",
        age: 45,
        gender: "男",
        idNumber: "11010119800101XXXX",
        patientId: "P20260226001",
        checkType: "CT Routine"
    },
    scanData = { ctdi: "12.45", dlp: "658.2", protocol: "定位像" }
}) => {
    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[999] flex items-center justify-center bg-[#0F172A]/40 backdrop-blur-sm animate-in fade-in duration-300">
            {/* 弹窗主容器 - 尺寸经过优化以适配 1024x768 */}
            <div className="bg-white w-[880px] rounded-[40px] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.25)] p-10 flex flex-col gap-8 border border-white relative overflow-hidden">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-8 right-8 w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all z-20 group"
                >
                    <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>

                {/* 背景渐变装饰 */}
                <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-blue-50/40 to-transparent pointer-events-none" />

                {/* 头部标题区 */}
                <div className="relative z-10 flex items-center gap-3">
                    <div className="w-11 h-11 bg-[#4D94FF] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                        <UserCheckIcon size={22} />
                    </div>
                    <div>
                        <h2 className="text-[22px] font-black text-[#1E293B]">确认患者扫描信息</h2>
                        <p className="text-[11px] text-[#94A3B8] font-bold uppercase tracking-[0.2em]">Patient Data Confirmation</p>
                    </div>
                </div>

                <div className="grid grid-cols-12 gap-8 relative z-10">

                    {/* 左侧：精简后的患者档案 (占据 7/12 列) */}
                    <div className="col-span-7 flex flex-col gap-4">
                        <h3 className="text-[12px] font-bold text-[#94A3B8] tracking-widest px-1">患者档案 (PATIENT INFO)</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <InfoItem label="Name / 姓名" value={patientData.name} icon={UserCircle} />
                            <div className="grid grid-cols-2 gap-4">
                                <InfoItem label="Age / 年龄" value={patientData.age} />
                                <InfoItem label="Gender / 性别" value={patientData.gender} />
                            </div>
                            <InfoItem label="Check Type / 检查类型" value={patientData.checkType} icon={Stethoscope} />
                            <InfoItem label="Patient ID / 病历号" value={patientData.patientId} icon={Info} />
                            <div className="col-span-2">
                                <InfoItem label="ID Number / 证件号" value={patientData.idNumber} icon={Fingerprint} />
                            </div>
                        </div>
                    </div>

                    {/* 右侧：剂量与序列 (占据 5/12 列) */}
                    <div className="col-span-5 flex flex-col gap-6">
                        <div className="flex flex-col gap-4">
                            <h3 className="text-[12px] font-bold text-[#94A3B8] tracking-widest px-1">参数预览 (PARAMETERS)</h3>

                            {/* 剂量卡片 */}
                            <div className="bg-[#FFFBEB] rounded-[28px] p-5 border border-[#FEF3C7] flex items-center justify-around shadow-sm">
                                <div className="text-center">
                                    <div className="text-[10px] font-bold text-[#B45309] mb-1 opacity-70 uppercase">CTDIvol (mGy)</div>
                                    <div className="text-[32px] font-black text-[#B45309] leading-none">{scanData.ctdi}</div>
                                </div>
                                <div className="w-px h-8 bg-[#FEF3C7]" />
                                <div className="text-center">
                                    <div className="text-[10px] font-bold text-[#B45309] mb-1 opacity-70 uppercase">DLP (mGy·cm)</div>
                                    <div className="text-[32px] font-black text-[#B45309] leading-none">{scanData.dlp}</div>
                                </div>
                            </div>

                            {/* 序列卡片 */}
                            <div className="bg-[#EFF6FF] rounded-[28px] p-5 border border-[#DBEAFE] flex flex-col items-center justify-center min-h-[120px]">
                                <div className="text-[10px] font-bold text-[#3B82F6] mb-1 uppercase">Current Protocol</div>
                                <div className="text-[28px] font-black text-[#2563EB] text-center leading-tight">
                                    {scanData.protocol}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 底部按钮栏 */}
                <div className="flex items-center justify-between mt-2 pt-8 border-t border-slate-100 relative z-10">
                    <p className="text-[14px] italic text-[#64748B] font-medium">
                        请确保以上信息正确，完成后点击“开始扫描”
                    </p>

                    <div className="flex items-center gap-5">
                        <div className="flex items-center gap-3 bg-[#F0FDF4] px-4 py-2.5 rounded-xl border border-[#DCFCE7]">
                            <div className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#22C55E]"></span>
                            </div>
                            <span className="text-[14px] font-bold text-[#166534]">准备就绪</span>
                        </div>

                        <button
                            onClick={onClose}
                            className="h-[60px] px-12 bg-[#4D94FF] text-white font-black rounded-2xl shadow-[0_15px_30px_-8px_rgba(77,148,255,0.4)] hover:bg-[#3B82F6] hover:translate-y-[-1px] active:translate-y-[1px] transition-all text-[18px]"
                        >
                            开始扫描
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 内部图标小组件
const UserCheckIcon = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <polyline points="16 11 18 13 22 9" />
    </svg>
);

export default ScanConfirmScreen;
