import { useState, useEffect } from 'react';
import {
    User,
    Settings,
    Search,
    Thermometer,
    Wind,
    CheckCircle2,
    CircleDot,
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

const TubeWarmupScreen = () => {
    const [targetHeat, setTargetHeat] = useState(60);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isWarmingUp, setIsWarmingUp] = useState(false);
    const [warmupProgress, setWarmupProgress] = useState(0);
    const [showAbortConfirm, setShowAbortConfirm] = useState(false);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isWarmingUp && !showAbortConfirm) {
            interval = setInterval(() => {
                setWarmupProgress(prev => {
                    if (prev >= 100) {
                        setIsWarmingUp(false);
                        return 100;
                    }
                    return prev + 0.5;
                });
            }, 100);
        }
        return () => clearInterval(interval!);
    }, [isWarmingUp, showAbortConfirm]);

    const handleStartWarmup = () => {
        setWarmupProgress(0);
        setIsWarmingUp(true);
    };

    const handleAbort = () => {
        setShowAbortConfirm(true);
    };

    const confirmAbort = () => {
        setIsWarmingUp(false);
        setShowAbortConfirm(false);
        setWarmupProgress(0);
    };

    const sidebarItems = [
        { icon: <Thermometer size={18} />, label: "球管预热", active: true },
        { icon: <Wind size={18} />, label: "空气校正" },
        { icon: <CheckCircle2 size={18} />, label: "日常QA" },
        { icon: <TestTube size={18} />, label: "硬件测试" },
        { icon: <Battery size={18} />, label: "电池管理" },
        { icon: <Disc size={18} />, label: "磁盘管理" },
        { icon: <BarChart3 size={18} />, label: "性能评估" },
        { icon: <MousePointer2 size={18} />, label: "手动扫描" },
    ];

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative">
            {/* Main Container 1024x768 */}

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
                        <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">15:07</div>
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

                {/* 2. Content Area with Sidebar Partitioning */}
                <main className="flex-1 overflow-hidden p-4 flex gap-4 bg-[#EEF2F9]">
                    {/* Sidebar Card */}
                    <aside className={`${isCollapsed ? 'w-[80px]' : 'w-[220px]'} bg-white border border-[#B0C4DE] rounded-md shadow-sm flex flex-col p-4 shrink-0 overflow-hidden transition-all duration-300 ease-in-out`}>
                        <div className="flex items-center justify-between mb-6 h-10">
                            {!isCollapsed && (
                                <div className="animate-in fade-in duration-300">
                                    <div className="text-[14px] font-black text-[#37474F] uppercase tracking-wider">服务模式</div>
                                    <div className="text-[10px] text-[#90A4AE] font-bold mt-0.5">硬件 / 球管预热</div>
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
                            <div className="relative mb-6 animate-in slide-in-from-left-2 duration-300">
                                <input
                                    type="text"
                                    placeholder="关键字搜索..."
                                    className="w-full h-[36px] pl-10 pr-4 bg-white border border-[#B0C4DE] rounded-md text-[13px] focus:outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/20"
                                />
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" size={16} />
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} p-3 bg-[#4D94FF] text-white rounded-md mb-4 shadow-sm transition-all`}>
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
                    <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm p-12 flex flex-col relative overflow-hidden">
                        <div className="text-[#F57C00] text-[24px] font-black mb-16 tracking-tight">
                            提示：热容量低于20%时建议进行预热
                        </div>

                        <div className="space-y-12">
                            <div className="flex items-center gap-8">
                                <div className="text-[32px] font-black text-[#37474F] min-w-[200px]">当前热容量：</div>
                                <div className="flex items-center gap-4">
                                    <div className="w-[240px] h-[72px] bg-[#F8FAFC] border border-[#B0C4DE] rounded-md flex items-center px-6 text-[20px] text-[#90A4AE] font-mono shadow-inner">
                                        0.00
                                    </div>
                                    <div className="text-[48px] font-black text-[#B0BEC5] ml-2 font-mono">%</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-8">
                                <div className="text-[32px] font-black text-[#37474F] min-w-[200px]">目标热容量：</div>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="number"
                                        value={targetHeat}
                                        onChange={(e) => setTargetHeat(parseInt(e.target.value))}
                                        className="w-[180px] h-[72px] bg-white border border-[#B0C4DE] rounded-md px-6 text-[24px] font-black text-[#37474F] focus:outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/20 shadow-sm font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <div className="text-[48px] font-black text-[#B0BEC5] ml-2 font-mono">%</div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto flex justify-end">
                            <button
                                onClick={handleStartWarmup}
                                className="flex items-center gap-2 px-12 h-[64px] bg-[#4D94FF] text-white font-bold rounded-md shadow-lg hover:bg-blue-600 transition-all uppercase text-[16px] active:scale-95"
                            >
                                <CircleDot size={24} />
                                <span>开始预热</span>
                            </button>
                        </div>
                    </section>
                </main>

                {/* 3. Footer */}
                <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center px-8 shrink-0">
                    <button className="h-[52px] px-10 bg-white border-2 border-[#B0C4DE] rounded-md text-[14px] font-bold text-[#37474F] hover:bg-gray-50 shadow-sm transition-all active:scale-95">
                        首页
                    </button>
                    <div className="ml-8 text-[13px] text-[#546E7A] font-medium">
                        服务模式 · 硬件 / 球管预热
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#263238] flex items-center justify-center text-white text-[10px] font-bold italic">
                            N
                        </div>
                    </div>
                </footer>

                {/* 4. Warmup Progress Overlay */}
                {isWarmingUp && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center animate-in fade-in duration-300">
                        {/* Progress Modal */}
                        <div className="bg-white w-[640px] h-[360px] rounded-3xl shadow-2xl p-10 flex flex-col justify-center animate-in zoom-in-95 duration-300">
                            <div className="flex justify-between items-baseline mb-8">
                                <h2 className="text-[32px] font-black text-[#37474F]">球管预热中...</h2>
                                <span className="text-[72px] font-black text-[#4D94FF] italic">{Math.floor(warmupProgress)}%</span>
                            </div>

                            {/* Progress Bar Container */}
                            <div className="w-full h-4 bg-[#F0F4F9] rounded-full overflow-hidden mb-10 shadow-inner">
                                <div
                                    className="h-full bg-[#4D94FF] rounded-full transition-all duration-300"
                                    style={{ width: `${warmupProgress}%` }}
                                ></div>
                            </div>

                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <span className="text-[18px] text-[#90A4AE] font-bold">当前进度实时更新：</span>
                                    <div className="px-4 py-1.5 bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg text-[18px] font-bold text-[#37474F] shadow-sm">
                                        {warmupProgress.toFixed(2)}%
                                    </div>
                                </div>
                                <button
                                    onClick={handleAbort}
                                    className="flex items-center gap-2 px-6 h-12 bg-[#FFF1F0] border border-[#FFA39E] text-[#CF1322] font-black rounded-xl shadow-sm hover:bg-[#FFCCC7] transition-all active:scale-95"
                                >
                                    <Square size={16} fill="currentColor" />
                                    <span className="text-[16px]">终止预热</span>
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
                                    <h3 className="font-black text-[#37474F] mb-3">确认要终止球管预热吗？</h3>
                                    <p className="text-[16px] text-[#546E7A] font-bold leading-relaxed">
                                        终止将停止后续增长，但已完成的部分将保留。
                                    </p>
                                    <p className="text-[16px] text-[#4D94FF] font-black mt-2">
                                        已完成热容量: {warmupProgress.toFixed(2)}%
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

export default TubeWarmupScreen;
