import { useState, useEffect } from 'react';
import {
    User,
    Settings,
    Search,
    Thermometer,
    Wind,
    CheckCircle2,
    TestTube,
    Battery,
    Disc,
    BarChart3,
    MousePointer2,
    Menu,
    ChevronDown,
    Plus,
    LayoutGrid,
    Lightbulb,
    Square,
    AlertTriangle
} from 'lucide-react';

const AirCalibrationScreen = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [calibrationProgress, setCalibrationProgress] = useState(0);
    const [showAbortConfirm, setShowAbortConfirm] = useState(false);

    // Parameter Selections (Multi-select states)
    const [rotationSpeeds, setRotationSpeeds] = useState<string[]>(['1']);
    const [voltages, setVoltages] = useState<string[]>(['100', '140']);
    const [focuses, setFocuses] = useState<string[]>(['small']);
    const [collimators, setCollimators] = useState<string[]>(['32*0.6']);

    const toggleSelection = (val: string, current: string[], setter: (v: string[]) => void) => {
        if (current.includes(val)) {
            if (current.length > 1) {
                setter(current.filter(i => i !== val));
            }
        } else {
            setter([...current, val]);
        }
    };

    const totalCombinations = rotationSpeeds.length * focuses.length * voltages.length * collimators.length;

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isCalibrating && !showAbortConfirm) {
            interval = setInterval(() => {
                setCalibrationProgress(prev => {
                    if (prev >= 100) {
                        setIsCalibrating(false);
                        return 100;
                    }
                    return prev + 0.5;
                });
            }, 100);
        }
        return () => clearInterval(interval!);
    }, [isCalibrating, showAbortConfirm]);

    const handleStartCalibration = () => {
        setCalibrationProgress(0);
        setIsCalibrating(true);
    };

    const handleAbort = () => {
        setShowAbortConfirm(true);
    };

    const confirmAbort = () => {
        setIsCalibrating(false);
        setShowAbortConfirm(false);
        setCalibrationProgress(0);
    };

    const sidebarItems = [
        { icon: <Thermometer size={18} />, label: "球管预热" },
        { icon: <Wind size={18} />, label: "空气校正", active: true },
        { icon: <CheckCircle2 size={18} />, label: "日常QA" },
        { icon: <TestTube size={18} />, label: "硬件测试" },
        { icon: <Battery size={18} />, label: "电池管理" },
        { icon: <Disc size={18} />, label: "磁盘管理" },
        { icon: <BarChart3 size={18} />, label: "性能评估" },
        { icon: <MousePointer2 size={18} />, label: "手动扫描" },
    ];

    const OptionButton = ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) => (
        <button
            onClick={onClick}
            className={`px-4 py-2 rounded-full border transition-all flex items-center gap-2 ${active
                ? 'bg-[#4D94FF] text-white border-[#4D94FF] shadow-md'
                : 'bg-white text-[#546E7A] border-[#B0C4DE] hover:bg-gray-50'
                }`}
        >
            <div className={`w-3 h-3 rounded-full ${active ? 'bg-white' : 'bg-[#E8EAF1]'}`} />
            <span className="font-bold text-[14px]">{label}</span>
        </button>
    );

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative">

                {/* 1. Header */}
                <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                            <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
                                <User size={24} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[14px] font-bold text-[#263238]">暂无选中患者</span>
                                <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5">ID: —</span>
                            </div>
                            <div className="ml-auto flex flex-col gap-0.5 text-[#546E7A] opacity-60">
                                <div className="text-[9px] font-bold italic">⊥ 60 mm</div>
                                <div className="text-[9px] font-bold">∠ 3.0°</div>
                                <div className="text-[9px] font-bold">🌡️ 60%</div>
                            </div>
                        </div>
                    </div>

                    <div className="text-center">
                        <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">15:27</div>
                        <div className="text-[12px] text-[#546E7A] font-medium mt-1">3月2日 周一</div>
                    </div>

                    <div className="flex items-center gap-6 pr-2">
                        <div className="p-1 text-[#D32F2F] cursor-pointer hover:opacity-70"><Plus size={32} strokeWidth={1.5} /></div>
                        <div className="p-1 text-[#546E7A] cursor-pointer hover:opacity-70"><LayoutGrid size={24} /></div>
                        <div className="p-1 text-[#546E7A] cursor-pointer hover:opacity-70"><Lightbulb size={24} /></div>
                        <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                            <Settings size={24} />
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">100</span>
                        </div>
                    </div>
                </header>

                {/* 2. Content Area */}
                <main className="flex-1 overflow-hidden p-4 flex gap-4 bg-[#EEF2F9]">
                    {/* Sidebar Card */}
                    <aside className={`${isCollapsed ? 'w-[80px]' : 'w-[220px]'} bg-white border border-[#B0C4DE] rounded-md shadow-sm flex flex-col p-4 shrink-0 overflow-hidden transition-all duration-300 ease-in-out`}>
                        <div className="flex items-center justify-between mb-6 h-10">
                            {!isCollapsed && (
                                <div className="animate-in fade-in duration-300">
                                    <div className="text-[14px] font-black text-[#37474F] uppercase tracking-wider">服务模式</div>
                                    <div className="text-[10px] text-[#90A4AE] font-bold mt-0.5">硬件 / 空气校正</div>
                                </div>
                            )}
                            <div
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                className={`w-9 h-9 rounded-md bg-white border border-[#B0C4DE] flex items-center justify-center text-[#546E7A] hover:bg-gray-50 cursor-pointer transition-all active:scale-95 shadow-sm ${isCollapsed ? 'mx-auto' : ''}`}
                            >
                                <Menu size={18} />
                            </div>
                        </div>

                        {!isCollapsed && (
                            <div className="relative mb-6">
                                <input
                                    type="text"
                                    placeholder="关键字搜索..."
                                    className="w-full h-[36px] pl-10 pr-4 bg-white border border-[#B0C4DE] rounded-md text-[13px] focus:outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/20"
                                />
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" size={16} />
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} p-3 bg-[#4D94FF] text-white rounded-md mb-4 shadow-sm`}>
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-white/20 rounded-md">
                                        <LayoutGrid size={20} />
                                    </div>
                                    {!isCollapsed && <span className="font-bold text-[14px]">硬件</span>}
                                </div>
                                {!isCollapsed && <ChevronDown size={18} className="opacity-60" />}
                            </div>

                            {sidebarItems.map((item, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2.5 rounded-md cursor-pointer transition-all ${item.active ? 'bg-[#E3F2FD] text-[#1E88E5] border-l-4 border-[#1E88E5]' : 'text-[#546E7A] hover:bg-gray-50'}`}
                                >
                                    <div className={`${item.active ? 'text-[#1E88E5]' : 'text-[#90A4AE]'}`}>
                                        {item.icon}
                                    </div>
                                    {!isCollapsed && <span className={`text-[13px] ${item.active ? 'font-bold' : 'font-medium'} whitespace-nowrap`}>{item.label}</span>}
                                </div>
                            ))}
                        </div>
                    </aside>

                    {/* Main Content Card */}
                    <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm p-8 flex flex-col relative overflow-hidden">

                        <div className="grid grid-cols-2 gap-6 flex-1 h-0 overflow-y-auto pr-2 custom-scrollbar">
                            {/* 1. Rotation Speed */}
                            <div className="bg-[#F8FAFC] border border-[#B0C4DE] rounded-xl p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="w-1.5 h-6 bg-[#4D94FF] rounded-full" />
                                    <h3 className="text-[18px] font-black text-[#37474F]">旋转速度</h3>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {['1', '2', '0.75'].map(val => (
                                        <OptionButton
                                            key={val}
                                            label={val}
                                            active={rotationSpeeds.includes(val)}
                                            onClick={() => toggleSelection(val, rotationSpeeds, setRotationSpeeds)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* 2. Focus */}
                            <div className="bg-[#F8FAFC] border border-[#B0C4DE] rounded-xl p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="w-1.5 h-6 bg-[#4D94FF] rounded-full" />
                                    <h3 className="text-[18px] font-black text-[#37474F]">焦点</h3>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {['small', 'big'].map(val => (
                                        <OptionButton
                                            key={val}
                                            label={val}
                                            active={focuses.includes(val)}
                                            onClick={() => toggleSelection(val, focuses, setFocuses)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* 3. Voltage */}
                            <div className="bg-[#F8FAFC] border border-[#B0C4DE] rounded-xl p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="w-1.5 h-6 bg-[#4D94FF] rounded-full" />
                                    <h3 className="text-[18px] font-black text-[#37474F]">电压</h3>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {['80', '100', '120', '140'].map(val => (
                                        <OptionButton
                                            key={val}
                                            label={val}
                                            active={voltages.includes(val)}
                                            onClick={() => toggleSelection(val, voltages, setVoltages)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* 4. Collimator Width */}
                            <div className="bg-[#F8FAFC] border border-[#B0C4DE] rounded-xl p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="w-1.5 h-6 bg-[#4D94FF] rounded-full" />
                                    <h3 className="text-[18px] font-black text-[#37474F]">准直器宽度</h3>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {['32*0.6'].map(val => (
                                        <OptionButton
                                            key={val}
                                            label={val}
                                            active={collimators.includes(val)}
                                            onClick={() => toggleSelection(val, collimators, setCollimators)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between">
                            <div className="text-[14px] font-bold text-[#546E7A]">
                                当前组合数：<span className="text-[#1E88E5] text-[18px]"> {totalCombinations} </span>
                                <span className="text-[#90A4AE] ml-2">(已完成 0, 待校正 {totalCombinations})</span>
                            </div>
                            <div className="flex items-end gap-4">
                                <button
                                    onClick={() => {
                                        setRotationSpeeds(['1']);
                                        setVoltages(['100']);
                                        setFocuses(['small']);
                                        setCollimators(['32*0.6']);
                                    }}
                                    className="px-6 h-[48px] bg-white border border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg hover:bg-gray-50 transition-all shadow-sm active:scale-95"
                                >
                                    清空记录
                                </button>
                                <button
                                    onClick={handleStartCalibration}
                                    className="flex items-center gap-3 px-12 h-[64px] bg-[#4D94FF] text-white font-black rounded-xl shadow-lg hover:bg-blue-600 transition-all active:scale-95"
                                >
                                    <div className="w-4 h-4 rounded-full bg-white opacity-40" />
                                    <span className="text-[20px]">开始校正</span>
                                </button>
                            </div>
                        </div>
                    </section>
                </main>

                {/* 3. Footer */}
                <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center px-8 shrink-0">
                    <button className="h-[52px] px-10 bg-white border-2 border-[#B0C4DE] rounded-md text-[14px] font-bold text-[#37474F] hover:bg-gray-50 shadow-sm transition-all active:scale-95">
                        首页
                    </button>
                    <div className="ml-8 text-[13px] text-[#546E7A] font-medium">
                        服务模式 · 硬件 / 空气校正
                    </div>
                </footer>

                {/* 4. Progress Overlay */}
                {isCalibrating && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center animate-in fade-in duration-300">
                        <div className="bg-white w-[640px] h-[360px] rounded-3xl shadow-2xl p-10 flex flex-col justify-center animate-in zoom-in-95 duration-300">
                            <div className="flex justify-between items-baseline mb-8">
                                <h2 className="text-[32px] font-black text-[#37474F]">空气校正中...</h2>
                                <span className="text-[72px] font-black text-[#4D94FF] italic">{Math.floor(calibrationProgress)}%</span>
                            </div>

                            <div className="w-full h-4 bg-[#F0F4F9] rounded-full overflow-hidden mb-10 shadow-inner">
                                <div
                                    className="h-full bg-[#4D94FF] rounded-full transition-all duration-300"
                                    style={{ width: `${calibrationProgress}%` }}
                                ></div>
                            </div>

                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <span className="text-[18px] text-[#90A4AE] font-bold">当前进度实时更新：</span>
                                    <div className="px-4 py-1.5 bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg text-[18px] font-bold text-[#37474F] shadow-sm">
                                        {calibrationProgress.toFixed(2)}%
                                    </div>
                                </div>
                                <button
                                    onClick={handleAbort}
                                    className="flex items-center gap-2 px-6 h-12 bg-[#FFF1F0] border border-[#FFA39E] text-[#CF1322] font-black rounded-xl shadow-sm hover:bg-[#FFCCC7] transition-all active:scale-95"
                                >
                                    <Square size={16} fill="currentColor" />
                                    <span className="text-[16px]">终止校正</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. Abort Confirmation Modal */}
                {showAbortConfirm && (
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] z-[60] flex items-center justify-center animate-in fade-in duration-200">
                        <div className="bg-white w-[560px] rounded-[32px] shadow-2xl border border-white p-12 animate-in zoom-in-95 duration-200">
                            <div className="flex items-start gap-6 mb-8 text-[24px]">
                                <div className="w-14 h-14 rounded-full bg-[#FFF3E0] flex items-center justify-center shrink-0">
                                    <AlertTriangle size={32} className="text-[#FF9800]" />
                                </div>
                                <div>
                                    <h3 className="font-black text-[#37474F] mb-3">确认要终止空气校正吗？</h3>
                                    <p className="text-[16px] text-[#546E7A] font-bold leading-relaxed">
                                        终止将停止后续由于采集，但已校正的部分将保留。
                                    </p>
                                    <p className="text-[16px] text-[#4D94FF] font-black mt-2">
                                        已完成进度: {calibrationProgress.toFixed(2)}%
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowAbortConfirm(false)}
                                    className="flex-1 h-14 bg-white border-2 border-[#B0C4DE] text-[#546E7A] font-black rounded-2xl text-[18px] hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={confirmAbort}
                                    className="flex-1 h-14 bg-[#4D94FF] text-white font-black rounded-2xl text-[18px] hover:bg-blue-600 transition-all active:scale-95 shadow-lg"
                                >
                                    确认
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
    );
};

export default AirCalibrationScreen;
