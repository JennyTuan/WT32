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
    Thermometer,
    Wind,
    CheckCircle2,
    TestTube,
    Battery,
    Disc,
    BarChart3,
    MousePointer2,
    Layout,
    Trash2
} from 'lucide-react';

const HardwareTestScreen = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState('机架');
    const [gantryParams] = useState({
        rotateSpeed: '3',
        gantryAngle: '180'
    });

    const sidebarItems = [
        { icon: <Thermometer size={18} />, label: "球管预热" },
        { icon: <Wind size={18} />, label: "空气校正" },
        { icon: <CheckCircle2 size={18} />, label: "日常QA" },
        { icon: <TestTube size={18} />, label: "硬件测试", active: true },
        { icon: <Battery size={18} />, label: "电池管理" },
        { icon: <Disc size={18} />, label: "磁盘管理" },
        { icon: <BarChart3 size={18} />, label: "性能评估" },
        { icon: <MousePointer2 size={18} />, label: "手动扫描" },
    ];

    const tabs = ['机架', '轨道', '影像'];

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
                        <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">16:14</div>
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
                                    <div className="text-[10px] text-[#90A4AE] font-bold mt-0.5">硬件 / 硬件测试</div>
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
                    <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm p-8 flex flex-col relative overflow-hidden">

                        {/* Tab Switcher */}
                        <div className="flex mb-8">
                            <div className="flex bg-[#EEF2F9] p-1 rounded-md border border-[#B0C4DE]/50 overflow-hidden shadow-sm">
                                {tabs.map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-10 h-[32px] text-[13px] font-bold rounded-md transition-all duration-200 ${activeTab === tab ? 'bg-[#4D94FF] text-white shadow-sm' : 'text-[#4D94FF] hover:bg-white/50'}`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Test Table Area */}
                        <div className="flex-1 flex flex-col bg-white border border-[#B0C4DE] rounded-2xl overflow-hidden shadow-sm">
                            <div className="h-[48px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center px-6 text-[13px] font-black text-[#90A4AE] uppercase tracking-wider">
                                <div className="w-1/3 text-left">测试项目</div>
                                <div className="w-1/3 text-center">参数调节</div>
                                <div className="w-1/3 text-right pr-10">操作控制</div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {/* Item 1 */}
                                <div className="flex items-center px-6 py-6 border-b border-[#EEF2F9] hover:bg-gray-50 transition-all">
                                    <div className="w-1/3">
                                        <div className="text-[16px] font-black text-[#263238]">机架复位</div>
                                        <div className="text-[13px] font-bold text-[#90A4AE] mt-0.5">(RCB)</div>
                                    </div>
                                    <div className="w-1/3 flex justify-center italic text-[#B0C4DE] font-bold text-[14px]">无需参数</div>
                                    <div className="w-1/3 flex justify-end pr-6">
                                        <button className="px-8 h-10 bg-white border border-[#B0C4DE] text-[#546E7A] font-black rounded-full hover:bg-gray-50 transition-all active:scale-95 shadow-sm text-[13px]">
                                            复位
                                        </button>
                                    </div>
                                </div>

                                {/* Item 2 */}
                                <div className="flex items-center px-6 py-6 border-b border-[#EEF2F9] hover:bg-gray-50 transition-all">
                                    <div className="w-1/3 flex items-center gap-3">
                                        <div className="text-[16px] font-black text-[#263238]">旋转找零</div>
                                    </div>
                                    <div className="w-1/3 flex justify-center italic text-[#B0C4DE] font-bold text-[14px]">无需参数</div>
                                    <div className="w-1/3 flex justify-end pr-6">
                                        <button className="px-8 h-10 bg-[#4D94FF] text-white font-black rounded-full hover:bg-[#3B82F6] active:bg-[#2563EB] transition-all active:scale-95 shadow-md text-[13px]">
                                            开始
                                        </button>
                                    </div>
                                </div>

                                {/* Item 3 (With Inputs) */}
                                <div className="flex items-center px-6 py-6 border-b border-[#EEF2F9] hover:bg-gray-50 transition-all">
                                    <div className="w-1/3">
                                        <div className="text-[16px] font-black text-[#263238]">旋转控制</div>
                                    </div>
                                    <div className="w-1/3 flex justify-center items-center gap-3">
                                        <span className="text-[13px] font-bold text-[#90A4AE]">速度</span>
                                        <div className="w-16 h-10 bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg flex items-center justify-center font-bold text-[#4D94FF] text-[15px] shadow-inner">
                                            {gantryParams.rotateSpeed}
                                        </div>
                                    </div>
                                    <div className="w-1/3 flex justify-end pr-6">
                                        <button className="px-8 h-10 bg-[#4D94FF] text-white font-black rounded-full hover:bg-[#3B82F6] active:bg-[#2563EB] transition-all active:scale-95 shadow-md text-[13px]">
                                            开始
                                        </button>
                                    </div>
                                </div>

                                {/* Item 4 (Multiple Inputs) */}
                                <div className="flex items-center px-6 py-6 border-b border-[#EEF2F9] hover:bg-gray-50 transition-all">
                                    <div className="w-1/3">
                                        <div className="text-[16px] font-black text-[#263238]">机架定位</div>
                                    </div>
                                    <div className="w-1/3 flex justify-center items-center gap-6">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[13px] font-bold text-[#B0C4DE]">速度</span>
                                            <div className="w-14 h-10 bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg flex items-center justify-center font-bold text-[#4D94FF] text-[15px] shadow-inner">
                                                {gantryParams.rotateSpeed}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[13px] font-bold text-[#B0C4DE]">角度</span>
                                            <div className="w-20 h-10 bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg flex items-center justify-center font-bold text-[#2F54EB] text-[15px] shadow-inner">
                                                {gantryParams.gantryAngle}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-1/3 flex justify-end pr-6">
                                        <button className="px-8 h-10 bg-[#2F54EB] text-white font-black rounded-full hover:bg-[#1D39C4] transition-all active:scale-95 shadow-md text-[13px]">
                                            开始
                                        </button>
                                    </div>
                                </div>

                                {/* Item 5 */}
                                <div className="flex items-center px-6 py-6 hover:bg-gray-50 transition-all">
                                    <div className="w-1/3">
                                        <div className="text-[16px] font-black text-[#263238]">倾斜复位</div>
                                    </div>
                                    <div className="w-1/3 flex justify-center italic text-[#B0C4DE] font-bold text-[14px]">无需参数</div>
                                    <div className="w-1/3 flex justify-end pr-6">
                                        <button className="px-8 h-10 bg-white border border-[#B0C4DE] text-[#546E7A] font-black rounded-full hover:bg-gray-50 transition-all active:scale-95 shadow-sm text-[13px]">
                                            复位
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Status Area */}
                        <div className="mt-6 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[13px] font-black text-[#90A4AE] uppercase tracking-wider">运行状态</span>
                                    <div className="w-2 h-2 rounded-full bg-[#52C41A] shadow-[0_0_8px_rgba(82,196,26,0.5)]"></div>
                                </div>
                                <button className="text-[12px] font-black text-[#90A4AE] hover:text-red-500 transition-all flex items-center gap-1">
                                    <Trash2 size={14} /> 清除日志
                                </button>
                            </div>
                            <div className="h-[100px] bg-black rounded-xl p-4 font-mono text-[13px] border-l-4 border-[#2F54EB] overflow-y-auto custom-scrollbar shadow-inner">
                                <div className="text-[#52C41A] opacity-90 leading-relaxed">[16:14:02] 系统自检完成...</div>
                                <div className="text-white opacity-80 leading-relaxed">[16:14:05] 机架通讯正常连接</div>
                                <div className="text-white opacity-40 leading-relaxed">[16:14:10] 等待用户操作控制...</div>
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
                        服务模式 · 硬件 / 硬件测试
                    </div>
                </footer>

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

export default HardwareTestScreen;
