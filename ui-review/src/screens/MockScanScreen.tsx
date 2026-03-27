import { useState } from "react";
import {
    User,
    Settings,
    Sun,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsUp,
    Monitor,
    UserCheck,
    FilePlus,
    Trash2,
    CheckCircle,
    StretchHorizontal,
    Check,
    AlertTriangle,
    Info,
    CircleDot,
    Zap,
    Radio
} from "lucide-react";

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

const MockScanScreen = () => {
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
    const [bedMode, setBedMode] = useState<"in" | "out">("in");
    const [groups, setGroups] = useState<ProtocolGroup[]>([
        {
            id: "g1",
            name: "Head_FacialBoneVolume",
            sequences: [
                { id: "s1", name: "Scout", steps: ["打开激光灯获取定位", "确认参数", "执行扫描"] },
                { id: "s2", name: "Helical Scan", steps: ["参数确认", "执行扫描"] }
            ]
        }
    ]);
    const [expandedSeqId, setExpandedSeqId] = useState<string | null>("s1");
    const [checkedSeqIds, setCheckedSeqIds] = useState<string[]>([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAbortConfirm, setShowAbortConfirm] = useState(false);

    const [isPatientConfirmed, setIsPatientConfirmed] = useState(false);
    const [isEnabled, setIsEnabled] = useState(false);
    const [isExposing, setIsExposing] = useState(false);
    const interactionLocked = isEnabled;

    const toggleCheckSeq = (seqId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setCheckedSeqIds((prev) =>
            prev.includes(seqId) ? prev.filter((id) => id !== seqId) : [...prev, seqId]
        );
    };

    const handleDeleteClick = () => {
        if (checkedSeqIds.length === 0) return;
        setShowDeleteConfirm(true);
    };

    const handleConfirmDelete = () => {
        setGroups((prev) =>
            prev
                .map((g) => ({ ...g, sequences: g.sequences.filter((s) => !checkedSeqIds.includes(s.id)) }))
                .filter((g) => g.sequences.length > 0)
        );
        setCheckedSeqIds([]);
        setShowDeleteConfirm(false);
    };

    const handleEnableToggle = () => {
        setIsEnabled((prev) => !prev);
        if (isExposing) setIsExposing(false);
    };

    const handleExpose = () => {
        if (!isEnabled || isExposing) return;
        setIsExposing(true);
        setTimeout(() => setIsExposing(false), 1200);
    };

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative">
                <header className={`flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10 ${interactionLocked ? "pointer-events-none opacity-60" : ""}`}>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                            <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
                                <User size={24} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[16px] font-bold text-[#37474F]">Roky Zhang</span>
                                <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5">ID: 67890</span>
                            </div>
                            <div className="ml-auto flex flex-col gap-0.5 text-[#546E7A] opacity-60">
                                <div className="text-[9px] font-bold italic">⊥ 0</div>
                                <div className="text-[9px] font-bold">∠ 0</div>
                            </div>
                        </div>
                    </div>

                    <div className="text-center">
                        <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">13:52</div>
                        <div className="text-[12px] text-[#546E7A] font-medium mt-1 uppercase opacity-80">Mock Scan</div>
                    </div>

                    <div className="flex items-center gap-5 pr-2">
                        <div className="p-1 text-[#D32F2F] cursor-pointer hover:opacity-70"><UserCheck size={32} strokeWidth={1.5} /></div>
                        <div className="p-1 text-[#546E7A] cursor-pointer hover:opacity-70 relative">
                            <Monitor size={24} />
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">9</span>
                        </div>
                        <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                            <Sun size={24} />
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">5</span>
                        </div>
                        <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                            <Settings size={24} />
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">10</span>
                        </div>
                    </div>
                </header>

                <main className="flex-1 flex overflow-hidden p-4 gap-4">
                    <aside className={`w-[264px] bg-white rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden shrink-0 ${interactionLocked ? "pointer-events-none opacity-55 grayscale-[0.15]" : ""}`}>
                        <div className="h-[48px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-3 shrink-0">
                            <div className="flex items-center gap-2">
                                <button className="p-1.5 text-[#546E7A] hover:bg-[#EEF2F9] rounded transition-all"><FilePlus size={18} /></button>
                                <button
                                    onClick={handleDeleteClick}
                                    className={`p-1.5 rounded transition-all relative ${checkedSeqIds.length > 0
                                        ? "text-[#D32F2F] hover:bg-[#FFEBEE]"
                                        : "text-[#90A4AE] opacity-40 cursor-not-allowed"
                                        }`}
                                >
                                    <Trash2 size={18} />
                                    {checkedSeqIds.length > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[#D32F2F] text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                                            {checkedSeqIds.length}
                                        </span>
                                    )}
                                </button>
                            </div>
                            <button
                                onClick={() => setIsTreeCollapsed(!isTreeCollapsed)}
                                className="p-1.5 text-[#4D94FF] hover:bg-[#EEF2F9] rounded transition-all"
                            >
                                {isTreeCollapsed ? <ChevronDown size={20} /> : <ChevronsUp size={20} />}
                            </button>
                        </div>

                        <div className={`overflow-y-auto p-2 flex flex-col gap-0 transition-all duration-300 ${isTreeCollapsed ? "h-[48px] opacity-40 grayscale overflow-hidden" : "h-[240px]"}`}>
                            {groups.map((group) => (
                                <div key={group.id} className="flex flex-col">
                                    <div className="flex items-center gap-2 px-2 py-1.5 text-[#37474F]">
                                        <ChevronDown size={14} className="opacity-40" />
                                        <div className="w-3.5 h-3.5 rounded-sm border border-[#B0C4DE] bg-white"></div>
                                        <span className="text-[13px] font-bold truncate text-[#37474F]">{group.name}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        {group.sequences.map((seq) => {
                                            const isExpanded = expandedSeqId === seq.id;
                                            const isActive = seq.id === "s1";
                                            return (
                                                <div key={seq.id} className="mb-1">
                                                    <div
                                                        onClick={() => setExpandedSeqId(isExpanded ? null : seq.id)}
                                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md ml-4 shadow-sm cursor-pointer transition-all ${checkedSeqIds.includes(seq.id)
                                                            ? "bg-[#F3F8FF] text-[#37474F]"
                                                            : isActive
                                                                ? "bg-[#4D94FF] text-white"
                                                                : "text-[#37474F] hover:bg-gray-50 mr-1"
                                                            }`}
                                                    >
                                                        {isExpanded
                                                            ? <ChevronDown size={14} className={isActive ? "text-white/70" : "text-gray-400"} />
                                                            : <ChevronRight size={14} className={isActive ? "text-white/70" : "text-gray-400"} />}

                                                        <div
                                                            onClick={(e) => toggleCheckSeq(seq.id, e)}
                                                            className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checkedSeqIds.includes(seq.id)
                                                                ? "bg-[#4D94FF] border-[#4D94FF]"
                                                                : isActive
                                                                    ? "bg-white/20 border-white/30"
                                                                    : "bg-white border-[#B0C4DE] hover:border-[#4D94FF]"
                                                                }`}
                                                        >
                                                            {checkedSeqIds.includes(seq.id) && <Check size={9} className="text-white stroke-[3]" />}
                                                        </div>

                                                        <span className="text-[13px] font-bold">{seq.name}</span>
                                                    </div>

                                                    {isExpanded && seq.steps && seq.steps.length > 0 && (
                                                        <div className="flex flex-col ml-12 mt-2 gap-4 relative pb-4">
                                                            <div className="absolute left-[7px] top-2 bottom-6 w-[1px] bg-[#B0C4DE]"></div>
                                                            {seq.steps.map((step, idx) => {
                                                                const isStepCompleted = seq.id === "s1" && idx === 0;
                                                                const isStepInProgress = seq.id === "s1" && idx === 1;
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
                                                                        <span className={`text-[12px] font-bold ${isStepInProgress ? "text-[#37474F]" : "text-[#37474F]/60"}`}>
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

                        <div className="flex-1 border-t border-[#EEF2F9] bg-[#F8FAFC] flex flex-col overflow-hidden">
                            <div className="p-3 flex justify-center">
                                <div className="flex w-full h-[36px] bg-white border border-[#B0C4DE] rounded-sm overflow-hidden p-[2px]">
                                    <button
                                        onClick={() => setBedMode("in")}
                                        className={`flex-1 flex items-center justify-center text-[12px] font-bold rounded-sm transition-all ${bedMode === "in" ? "bg-[#4D94FF] text-white shadow-inner" : "text-[#90A4AE] hover:bg-gray-50"}`}
                                    >
                                        进床
                                    </button>
                                    <button
                                        onClick={() => setBedMode("out")}
                                        className={`flex-1 flex items-center justify-center text-[12px] font-bold rounded-sm transition-all ${bedMode === "out" ? "bg-[#4D94FF] text-white shadow-inner" : "text-[#90A4AE] hover:bg-gray-50"}`}
                                    >
                                        出床
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 px-4 py-3 flex flex-col gap-4 overflow-y-auto">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="p-2 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">扫描长度</span>
                                        <span className="text-[14px] font-black text-[#B0BEC5] mt-0.5">122.00</span>
                                    </div>
                                    <div className="p-2 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">mA</span>
                                        <span className="text-[14px] font-black text-[#37474F] mt-0.5">10</span>
                                    </div>
                                    <div className="p-2 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">KV</span>
                                        <span className="text-[14px] font-black text-[#37474F] mt-0.5">80</span>
                                    </div>
                                    <div className="p-2 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">平扫角度</span>
                                        <span className="text-[14px] font-black text-[#37474F] mt-0.5">90</span>
                                    </div>
                                    <div className="p-2 bg-white border border-[#B0C4DE]/40 rounded-md flex flex-col items-center justify-center shadow-sm col-span-2">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <StretchHorizontal size={14} className="text-[#4D94FF]" />
                                            <span className="text-[9px] font-black text-[#90A4AE] uppercase tracking-tighter">体位 (Position)</span>
                                        </div>
                                        <span className="text-[14px] font-black text-[#37474F]">HFS</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 pt-1 flex justify-center shrink-0">
                                <button className="h-[32px] w-full bg-white border border-[#B0C4DE] rounded-md text-[10px] font-bold text-[#4D94FF] flex items-center justify-center gap-1 hover:bg-blue-50 transition-all shadow-sm active:scale-95">
                                    <Info size={14} /> 更多详情
                                </button>
                            </div>
                        </div>
                    </aside>

                    <section className="flex-1 bg-[#1A222B] rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-hidden relative">
                        <div className="h-[44px] bg-[#131A22] border-b border-white/10 px-4 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 text-[#C6D4E1]">
                                <CircleDot size={12} className={isExposing ? "text-[#66BB6A]" : "text-[#4D94FF]"} />
                                <span className="text-[11px] font-bold tracking-wide">影像区域</span>
                            </div>
                            <span className="text-[11px] text-[#90A4AE]">{isExposing ? "曝光中..." : "待机"}</span>
                        </div>

                        <div className="flex-1 flex items-center justify-center overflow-hidden">
                            <div className="w-full h-full opacity-10 bg-gradient-to-br from-blue-900/40 to-transparent flex items-center justify-center text-[#546E7A] uppercase font-thin text-[52px] tracking-[16px]">
                                Viewport
                            </div>
                        </div>

                        <div className={`absolute top-1/2 -translate-y-1/2 right-3 w-[160px] rounded-xl border shadow-xl transition-all duration-300 ${isPatientConfirmed ? "translate-x-0 opacity-100 border-[#9EB5CC] bg-[#F8FAFC]" : "translate-x-[180px] opacity-0 pointer-events-none border-[#B0C4DE] bg-white"}`}>
                            <div className="h-[34px] px-3 border-b border-[#DCE6F2] flex items-center justify-between">
                                <span className="text-[10px] font-black text-[#546E7A] tracking-wide">模拟物理按键</span>
                                <Radio size={12} className={isEnabled ? "text-[#4D94FF]" : "text-[#90A4AE]"} />
                            </div>
                            <div className="p-3 flex flex-col gap-2">
                                <button
                                    onClick={handleEnableToggle}
                                    disabled={interactionLocked}
                                    className={`h-[44px] rounded-md border text-[12px] font-black transition-all ${isEnabled ? "bg-[#E3F2FD] border-[#4D94FF] text-[#1565C0]" : "bg-white border-[#B0C4DE] text-[#607D8B] hover:border-[#4D94FF]"}`}
                                >
                                    {isEnabled ? "使能: 开" : "使能: 关"}
                                </button>
                                <button
                                    onClick={handleExpose}
                                    disabled={!isEnabled || isExposing}
                                    className={`h-[54px] rounded-md border text-[13px] font-black transition-all flex items-center justify-center gap-1.5 ${!isEnabled
                                        ? "bg-[#ECEFF1] border-[#CFD8DC] text-[#90A4AE] cursor-not-allowed"
                                        : isExposing
                                            ? "bg-[#E8F5E9] border-[#66BB6A] text-[#2E7D32]"
                                            : "bg-[#4D94FF] border-[#4D94FF] text-white hover:bg-blue-600"
                                        }`}
                                >
                                    <Zap size={14} />
                                    {isExposing ? "曝光中" : "曝光"}
                                </button>
                            </div>
                        </div>
                    </section>
                </main>

                <footer className={`h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10 ${interactionLocked ? "pointer-events-none opacity-60" : ""}`}>
                    <div className="flex-1">
                        <button className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-solid shadow-sm transition-all uppercase text-[13px] active:scale-95">
                            <ChevronLeft size={20} /> 上一步
                        </button>
                    </div>
                    <div className="flex-1 flex justify-center">
                        <button
                            onClick={() => setShowAbortConfirm(true)}
                            className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#F57C00] font-bold rounded-md border-2 border-[#F57C00] hover:bg-orange-50 transition-all uppercase text-[13px] shadow-sm active:scale-95">
                            <AlertTriangle size={20} /> 中止检查
                        </button>
                    </div>
                    <div className="flex-1 flex justify-end">
                        <button
                            onClick={() => setIsPatientConfirmed(true)}
                            className="flex items-center gap-2 px-10 h-[52px] bg-[#4D94FF] text-white font-bold rounded-md shadow-lg hover:bg-blue-600 transition-all uppercase text-[13px] active:scale-95"
                        >
                            执行扫描 <ChevronRight size={20} />
                        </button>
                    </div>
                </footer>

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
                                    中止后，当前扫描参数将清空，需要重新进入流程。
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
            </div>
    );
};

export default MockScanScreen;
