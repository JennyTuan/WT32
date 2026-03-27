import { useState } from 'react';
import {
    User,
    Settings,
    Search,
    Menu,
    ChevronDown,
    Plus,
    LayoutGrid,
    Lightbulb,
    History,
    Calendar as CalendarIcon,
    Thermometer,
    Wind,
    CheckCircle2,
    TestTube,
    Battery,
    Disc,
    BarChart3,
    MousePointer2,
    Layout,
    AlertTriangle
} from 'lucide-react';

const QACard = ({ title, limit, actual, status }: { title: string, limit: string, actual: string, status: string }) => (
    <div className="bg-[#F8FAFC] border border-[#B0C4DE] rounded-xl p-6 flex flex-col shadow-sm">
        <h3 className="text-[16px] font-black text-[#37474F] mb-6">{title}</h3>

        <div className="flex-1 bg-black rounded-lg flex items-center justify-center text-white mb-6 min-h-[180px]">
            <span className="text-[12px] text-gray-400 font-bold">等待分析图像</span>
        </div>

        <div className="space-y-3 mb-6">
            <div className="flex justify-between text-[12px] font-bold pb-1 border-b border-[#EEF2F9]">
                <span className="text-[#90A4AE]">limit</span>
                <span className="text-[#90A4AE]">actual</span>
            </div>
            <div className="flex justify-between items-center text-[14px] font-bold">
                <span className="text-[#37474F] leading-tight">{limit}</span>
                <span className="text-[#37474F]">{actual}</span>
            </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-[#EEF2F9]">
            <span className="text-[13px] font-bold text-[#37474F]">判定结果</span>
            <div className="px-4 py-1.5 bg-[#CF1322] text-white rounded-full text-[12px] font-black shadow-sm">
                {status}
            </div>
        </div>
    </div>
);

const DailyQAScreen = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [phantomType, setPhantomType] = useState('水模');
    const [showAnalyzeConfirm, setShowAnalyzeConfirm] = useState(false);

    const sidebarItems = [
        { icon: <Thermometer size={18} />, label: "球管预热" },
        { icon: <Wind size={18} />, label: "空气校正" },
        { icon: <CheckCircle2 size={18} />, label: "日常QA", active: true },
        { icon: <TestTube size={18} />, label: "硬件测试" },
        { icon: <Battery size={18} />, label: "电池管理" },
        { icon: <Disc size={18} />, label: "磁盘管理" },
        { icon: <BarChart3 size={18} />, label: "性能评估" },
        { icon: <MousePointer2 size={18} />, label: "手动扫描" },
    ];

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative">

                {/* 1. Header (Grey style consistent with before) */}
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
                        <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">15:37</div>
                        <div className="text-[12px] text-[#546E7A] font-medium mt-1">3月2日 周一</div>
                    </div>

                    <div className="flex items-center gap-6 pr-2">
                        <div className="p-1 text-[#D32F2F] cursor-pointer hover:opacity-70"><Plus size={32} strokeWidth={1.5} /></div>
                        <div className="p-1 text-[#546E7A] cursor-pointer hover:opacity-70"><Layout size={24} /></div>
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
                                    <div className="text-[10px] text-[#90A4AE] font-bold mt-0.5">硬件 / 日常QA</div>
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
                        {/* Top Filters */}
                        <div className="flex items-center justify-between mb-8 bg-[#F8FAFC] p-4 rounded-xl border border-[#EEF2F9] shadow-sm">
                            <div className="flex items-center gap-8">
                                <div className="flex items-center gap-3">
                                    <span className="text-[14px] text-[#90A4AE] font-black uppercase tracking-wider">日期</span>
                                    <div className="flex items-center gap-3 px-4 py-2 bg-white border border-[#B0C4DE] rounded-lg text-[14px] font-bold text-[#37474F] cursor-pointer hover:border-[#4D94FF] transition-all">
                                        2026 / 03 / 02
                                        <CalendarIcon size={16} className="text-[#4D94FF]" />
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span className="text-[14px] text-[#90A4AE] font-black uppercase tracking-wider">模体</span>
                                    <div className="relative group">
                                        <select
                                            value={phantomType}
                                            onChange={(e) => setPhantomType(e.target.value)}
                                            className="appearance-none bg-white border border-[#B0C4DE] rounded-lg px-4 py-2 text-[14px] font-bold text-[#37474F] focus:outline-none focus:border-[#4D94FF] cursor-pointer pr-10 hover:border-[#4D94FF] transition-all"
                                            style={{ backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%234D94FF%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '1rem' }}
                                        >
                                            <option>水模</option>
                                            <option>空气模</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setShowAnalyzeConfirm(true)}
                                    className={`${isCollapsed ? 'px-10 h-11' : 'px-6 h-9'} bg-[#4D94FF] text-white font-black rounded-full shadow-lg hover:bg-[#3B82F6] active:bg-[#2563EB] transition-all active:scale-95 text-[14px] flex items-center justify-center`}
                                >
                                    一键分析
                                </button>
                                <button className={`${isCollapsed ? 'px-10 h-11' : 'px-6 h-9'} bg-white border-2 border-[#4D94FF] text-[#4D94FF] font-black rounded-full hover:bg-[#F9FBFC] active:bg-[#E3F2FD] transition-all active:scale-95 text-[14px] flex items-center gap-2 shadow-sm`}>
                                    <History size={isCollapsed ? 16 : 14} strokeWidth={3} />
                                    历史记录
                                </button>
                            </div>
                        </div>

                        {/* Analysis Grid */}
                        <div className="flex-1 grid grid-cols-3 gap-6 overflow-y-auto pr-2 custom-scrollbar">
                            <QACard title="噪声分析" limit="≤ 3" actual="-" status="不通过" />
                            <QACard title="CT值均匀性分析" limit="≤ 4" actual="-" status="不通过" />
                            <QACard title="CT值准确性分析" limit="water: -" actual="-" status="不通过" />
                        </div>
                    </section>
                </main>

                {/* 3. Footer */}
                <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center px-8 shrink-0">
                    <button className="h-[52px] px-10 bg-white border-2 border-[#B0C4DE] rounded-md text-[14px] font-bold text-[#37474F] hover:bg-gray-50 shadow-sm transition-all active:scale-95">
                        首页
                    </button>
                    <div className="ml-8 text-[13px] text-[#546E7A] font-medium">
                        服务模式 · 硬件 / 日常QA
                    </div>
                </footer>

                {/* 4. Analysis Confirmation Modal */}
                {showAnalyzeConfirm && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-[100] flex items-center justify-center animate-in fade-in duration-300">
                        <div className="bg-white w-[560px] rounded-[32px] shadow-2xl p-10 flex flex-col relative animate-in zoom-in-95 duration-300">
                            <div className="flex gap-6 mb-8">
                                <div className="w-14 h-14 rounded-full bg-[#FFF7E6] flex items-center justify-center shrink-0 border border-[#FFE7BA]">
                                    <AlertTriangle size={32} className="text-[#FA8C16]" />
                                </div>
                                <div className="flex flex-col gap-3">
                                    <h3 className="text-[22px] font-black text-[#263238] leading-tight">
                                        开启每日质控前请确认{phantomType}是否摆放正确
                                    </h3>
                                    <p className="text-[16px] text-[#90A4AE] font-bold leading-relaxed">
                                        激光灯应对齐{phantomType}中心点。确认后点击“扫描”开始采集与分析。
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-4 mt-4">
                                <button
                                    onClick={() => setShowAnalyzeConfirm(false)}
                                    className="px-10 h-12 bg-white border border-[#B0C4DE] text-[#263238] font-black rounded-xl hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={() => setShowAnalyzeConfirm(false)}
                                    className="px-10 h-12 bg-[#2F54EB] text-white font-black rounded-xl hover:bg-[#1D39C4] transition-all active:scale-95 shadow-lg flex items-center justify-center"
                                >
                                    扫描
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #B0C4DE;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #90A4AE;
                }
            `}</style>
        </div>
    );
};

export default DailyQAScreen;
