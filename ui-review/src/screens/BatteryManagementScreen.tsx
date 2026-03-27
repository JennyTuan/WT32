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
    BatteryCharging,
    RotateCcw,
    Save
} from 'lucide-react';

const MetricCard = ({ title, value, unit, extra, sub }: { title: string, value: string | number, unit: string, extra?: React.ReactNode, sub?: string }) => (
    <div className="bg-white border border-[#B0C4DE]/40 rounded-2xl p-4 flex flex-col shadow-sm hover:shadow-md transition-all">
        <div className="flex justify-between items-start mb-2">
            <span className="text-[12px] font-bold text-[#90A4AE] tracking-wide">{title}</span>
            <span className="text-[12px] font-bold text-[#B0C4DE]">{unit}</span>
        </div>
        <div className="flex items-baseline gap-1 mb-2">
            <span className="text-[28px] font-black text-[#263238] leading-none">{value}</span>
        </div>
        {extra}
        {sub && (
            <div className="mt-auto pt-3 border-t border-[#EEF2F9]">
                <div className="px-3 py-1 bg-[#EEF2F9] rounded text-[11px] font-bold text-[#4D94FF] w-fit">
                    {sub}
                </div>
            </div>
        )}
    </div>
);

const BatteryManagementScreen = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState('高压电池');
    const [config, setConfig] = useState({
        voltage: '480',
        soc: '20'
    });

    const sidebarItems = [
        { icon: <Thermometer size={18} />, label: "球管预热" },
        { icon: <Wind size={18} />, label: "空气校正" },
        { icon: <CheckCircle2 size={18} />, label: "日常QA" },
        { icon: <TestTube size={18} />, label: "硬件测试" },
        { icon: <Battery size={18} />, label: "电池管理", active: true },
        { icon: <Disc size={18} />, label: "磁盘管理" },
        { icon: <BarChart3 size={18} />, label: "性能评估" },
        { icon: <MousePointer2 size={18} />, label: "手动扫描" },
    ];

    const tabs = ['高压电池', '低压电池'];

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
                        <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">16:20</div>
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
                                    <div className="text-[10px] text-[#90A4AE] font-bold mt-0.5">硬件 / 电池管理</div>
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
                    <section className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">

                        {/* Tab Switcher Card */}
                        <div className="bg-white border border-[#B0C4DE] rounded-md shadow-sm p-4 shrink-0 px-8">
                            <div className="flex bg-[#EEF2F9] p-1 rounded-md border border-[#B0C4DE]/50 overflow-hidden shadow-sm w-fit">
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

                        {/* Data Dashboard Card */}
                        <div className="bg-white border border-[#B0C4DE] rounded-md shadow-sm p-8 flex flex-col shrink-0">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-[15px] font-black text-[#263238] uppercase tracking-wider">数据面板</h2>
                                <span className="text-[12px] font-bold text-[#90A4AE]">实时数据 (示例)</span>
                            </div>

                            {/* Status Banner */}
                            <div className="bg-[#F6FFED] border border-[#B7EB8F] rounded-xl p-5 mb-8 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-[#52C41A] rounded-lg flex items-center justify-center text-white shadow-md">
                                        <BatteryCharging size={24} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[18px] font-black text-[#135200]">充电中</span>
                                        <span className="text-[12px] font-bold text-[#52C41A]/70">状态由电流方向判断</span>
                                    </div>
                                </div>
                                <div className="text-[32px] font-black text-[#135200]">
                                    -1.0 <span className="text-[16px] font-bold ml-1">A</span>
                                </div>
                            </div>

                            {/* Metric Grid */}
                            <div className="grid grid-cols-3 gap-6 mb-8">
                                <MetricCard title="总电压" value="540.20" unit="V" />
                                <MetricCard
                                    title="SOC"
                                    value="78"
                                    unit="%"
                                    extra={
                                        <div className="w-full h-2.5 bg-[#EEF2F9] rounded-full mt-4 overflow-hidden shadow-inner">
                                            <div className="h-full bg-[#4D94FF] rounded-full shadow-[0_0_8px_rgba(77,148,255,0.4)]" style={{ width: '78%' }}></div>
                                        </div>
                                    }
                                />
                                <MetricCard title="电流" value="-1.0" unit="A" />
                            </div>

                            <div className="grid grid-cols-4 gap-6">
                                <MetricCard title="单体最小电压" value="3.12" unit="V" />
                                <MetricCard title="单体最大电压" value="3.48" unit="V" />
                                <MetricCard title="最低温度" value="12" unit="℃" />
                                <MetricCard title="最高温度" value="36" unit="℃" />
                            </div>

                            <div className="grid grid-cols-4 gap-6 mt-6">
                                <MetricCard title="温度差值" value="24" unit="℃" sub="计算项" />
                                <MetricCard title="压差" value="0.36" unit="V" sub="计算项" />
                            </div>
                        </div>

                        {/* Protection Config Card */}
                        <div className="bg-white border border-[#B0C4DE] rounded-md shadow-sm p-8 flex flex-col shrink-0 mb-4">
                            <h2 className="text-[15px] font-black text-[#263238] uppercase tracking-wider mb-8">放电保护条件</h2>

                            <div className="space-y-8 max-w-[500px]">
                                <div className="flex items-center justify-between">
                                    <span className="text-[14px] font-bold text-[#546E7A]">总电压保护</span>
                                    <div className="flex items-center gap-4">
                                        <span className="text-[13px] text-[#90A4AE] font-bold">当 总电压 ≤</span>
                                        <div className="flex items-center bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg h-10 px-4 gap-4 shadow-inner">
                                            <input
                                                type="text"
                                                value={config.voltage}
                                                onChange={(e) => setConfig({ ...config, voltage: e.target.value })}
                                                className="w-16 bg-transparent text-[15px] font-black text-[#263238] focus:outline-none text-center"
                                            />
                                            <div className="flex flex-col border-l border-[#B0C4DE]/30 pl-2">
                                                <ChevronDown size={14} className="rotate-180 text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                                                <ChevronDown size={14} className="text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                                            </div>
                                        </div>
                                        <span className="text-[13px] font-black text-[#B0C4DE]">V</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-[14px] font-bold text-[#546E7A]">SOC保护</span>
                                    <div className="flex items-center gap-4">
                                        <span className="text-[13px] text-[#90A4AE] font-bold">当 SOC ≤</span>
                                        <div className="flex items-center bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg h-10 px-4 gap-4 shadow-inner">
                                            <input
                                                type="text"
                                                value={config.soc}
                                                onChange={(e) => setConfig({ ...config, soc: e.target.value })}
                                                className="w-16 bg-transparent text-[15px] font-black text-[#263238] focus:outline-none text-center"
                                            />
                                            <div className="flex flex-col border-l border-[#B0C4DE]/30 pl-2">
                                                <ChevronDown size={14} className="rotate-180 text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                                                <ChevronDown size={14} className="text-[#B0C4DE] cursor-pointer hover:text-[#4D94FF]" />
                                            </div>
                                        </div>
                                        <span className="text-[13px] font-black text-[#B0C4DE]">%</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-4">
                                    <span className="text-[12px] font-bold text-[#52C41A]">配置已保存</span>
                                    <div className="flex gap-4">
                                        <button className="flex items-center gap-2 px-6 h-10 bg-white border border-[#B0C4DE] text-[#546E7A] font-black rounded-lg hover:bg-gray-50 transition-all active:scale-95 text-[13px] shadow-sm">
                                            <RotateCcw size={16} /> 重置
                                        </button>
                                        <button className="flex items-center gap-2 px-6 h-10 bg-[#4D94FF] text-white font-black rounded-lg hover:bg-[#3B82F6] active:bg-[#2563EB] transition-all active:scale-95 text-[13px] shadow-lg">
                                            <Save size={16} /> 保存
                                        </button>
                                    </div>
                                </div>
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
                        服务模式 · 硬件 / 电池管理
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

export default BatteryManagementScreen;
