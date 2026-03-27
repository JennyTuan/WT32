import { useState } from 'react';

import DicomViewer from '../components/DicomViewer';
import {
    User,
    Settings,
    Search,
    Menu,
    ChevronDown,
    LayoutGrid,
    Thermometer,
    Wind,
    CheckCircle2,
    TestTube,
    Battery,
    Disc,
    BarChart3,
    MousePointer2,
    Play,
    RotateCcw,
    ScanLine,
    Siren,
    Network,
    Sun,
    Flame,
    ZoomIn,
    ZoomOut,
    Move,
    Ruler,
    FlipHorizontal2,
    RefreshCw,
    Maximize2,
    SlidersHorizontal,
} from 'lucide-react';

const scanModes = [
    { id: 'helical', label: '螺旋扫描', desc: '连续进床采集' },
    { id: 'axial', label: '断层扫描', desc: '定点分步曝光' },
];

const acquisitionFields = [
    { label: '管电压 (kV)', value: '120', type: 'select', options: ['100', '120', '140'] },
    { label: '管电流 (mA)', value: '200', type: 'input' },
    { label: '旋转时间 (s)', value: '1', type: 'select', options: ['0.5', '1', '1.5', '2'] },
    { label: '准直器宽度', value: '32*0.6', type: 'select', options: ['32*0.6', '16*1.2', '64*0.6'] },
    { label: '螺距 (Pitch)', value: '1', type: 'input' },
    { label: '起始位置 (Start)', value: '--.-', type: 'input' },
    { label: '结束位置 (End)', value: '--.-', type: 'input' },
];

const reconFields = [
    { label: '层厚 (mm)', value: '5', type: 'input' },
    { label: '层间距 (mm)', value: '5', type: 'input' },
    { label: '窗位 (WL)', value: '40', type: 'input' },
    { label: '窗宽 (WW)', value: '400', type: 'input' },
    { label: '重建视野 (mm)', value: '500', type: 'input' },
    { label: '矩阵大小', value: '512', type: 'select', options: ['256', '512', '1024'] },
    { label: '重建算法 (Kernel)', value: 'Standard', type: 'select', options: ['Standard', 'Bone', 'Soft'], fullWidth: true },
];

// statusCards removed to match reference image

export default function ManualScanScreen() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [activeMode, setActiveMode] = useState('helical');
    const [activePanel, setActivePanel] = useState<'acq' | 'recon'>('acq');
    const [activeTool, setActiveTool] = useState<string>('pan');
    // WL/WC driven from recon panel (kept in sync with reconFields defaults)
    const [windowCenter] = useState(40);
    const [windowWidth] = useState(400);

    const sidebarItems = [
        { icon: <Thermometer size={18} />, label: "球管预热" },
        { icon: <Wind size={18} />, label: "空气校正" },
        { icon: <CheckCircle2 size={18} />, label: "日常QA" },
        { icon: <TestTube size={18} />, label: "硬件测试" },
        { icon: <Battery size={18} />, label: "电池管理" },
        { icon: <Disc size={18} />, label: "磁盘管理" },
        { icon: <BarChart3 size={18} />, label: "性能评估" },
        { icon: <MousePointer2 size={18} />, label: "手动扫描", active: true },
    ];

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative font-sans select-none">

            {/* 1. Header (Patient List Style) */}
            <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                        <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
                            <User size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold">Roky Zhang</span>
                            <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5">ID: 67890</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
                        <div className="text-[9px] font-bold italic">⊥ 0</div>
                        <div className="text-[9px] font-bold">∠ 0</div>
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

            {/* 2. Content Area */}
            <main className="flex-1 overflow-hidden p-2 flex gap-2 bg-[#EEF2F9]">
                {/* Sidebar Card */}
                <aside className={`${isCollapsed ? 'w-[80px]' : 'w-[220px]'} bg-white border border-[#B0C4DE] rounded-md shadow-sm flex flex-col p-4 shrink-0 overflow-hidden transition-all duration-300 ease-in-out`}>
                    <div className="flex items-center justify-between mb-6 h-10">
                        {!isCollapsed && (
                            <div className="animate-in fade-in duration-300">
                                <div className="text-[14px] font-black text-[#37474F] uppercase tracking-wider">服务模式</div>
                                <div className="text-[10px] text-[#90A4AE] font-bold mt-0.5">硬件 / 手动扫描</div>
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
                        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} p-3 bg-[#EEF2F9] text-[#4D94FF] rounded-md mb-2 shadow-sm transition-all border border-[#B0C4DE]/30`}>
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-[#4D94FF] text-white rounded-md">
                                    <LayoutGrid size={20} />
                                </div>
                                {!isCollapsed && <span className="font-bold text-[14px]">硬件</span>}
                            </div>
                            {!isCollapsed && <ChevronDown size={18} className="opacity-60" />}
                        </div>

                        {sidebarItems.map((item, idx) => (
                            <div
                                key={idx}
                                className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2.5 rounded-md cursor-pointer transition-all ${item.active ? 'bg-[#E3F2FD] text-[#4D94FF] border-l-4 border-[#4D94FF]' : 'text-[#546E7A] hover:bg-gray-50'}`}
                            >
                                <div className={`${item.active ? 'text-[#4D94FF]' : 'text-[#90A4AE]'}`}>
                                    {item.icon}
                                </div>
                                {!isCollapsed && <span className={`text-[13px] ${item.active ? 'font-bold' : 'font-medium'} whitespace-nowrap`}>{item.label}</span>}
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Main Content Area - No wrapper card to reduce fragmentation */}
                <section className="flex-1 flex flex-col relative overflow-hidden">
                    <div className="flex-1 flex gap-3 overflow-hidden h-full">
                        {/* Dark Monitor Area */}
                        <div className="flex-1 bg-[#050A19] rounded-md relative overflow-hidden border border-[#1A2642] shadow-2xl">

                            {/* DICOM Viewer fills the monitor */}
                            <DicomViewer
                                dicomUrl="/dicom/test/SYNO0160.dcm"
                                activeTool={activeTool}
                                windowCenter={windowCenter}
                                windowWidth={windowWidth}
                            />

                            {/* Imaging Toolbar - horizontal top strip */}
                            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-row gap-1.5 z-10 bg-black/30 backdrop-blur-sm rounded-2xl px-3 py-2 border border-[#4D94FF]/15">
                                {([
                                    { id: 'pan',      icon: <Move size={15} />,              label: '平移' },
                                    { id: 'zoom',     icon: <ZoomIn size={15} />,            label: '放大' },
                                    { id: 'zoomout',  icon: <ZoomOut size={15} />,           label: '缩小' },
                                    { id: 'window',   icon: <SlidersHorizontal size={15} />, label: '调窗' },
                                    { id: 'ruler',    icon: <Ruler size={15} />,             label: '测量' },
                                    { id: 'flip',     icon: <FlipHorizontal2 size={15} />,   label: '翻转' },
                                    { id: 'fit',      icon: <Maximize2 size={15} />,          label: '适合' },
                                    { id: 'reset',    icon: <RefreshCw size={15} />,          label: '重置' },
                                ] as { id: string; icon: React.ReactNode; label: string }[]).map((tool) => (
                                    <button
                                        key={tool.id}
                                        title={tool.label}
                                        onClick={() => setActiveTool(tool.id)}
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border ${
                                            activeTool === tool.id
                                                ? 'bg-[#4D94FF] text-white border-[#4D94FF] shadow-[0_0_8px_rgba(77,148,255,0.5)]'
                                                : 'bg-white/5 text-[#4D94FF]/60 border-[#4D94FF]/20 hover:bg-white/15 hover:text-[#4D94FF]'
                                        }`}
                                    >
                                        {tool.icon}
                                    </button>
                                ))}
                            </div>

                            {/* Slice info overlay bottom-left */}
                            <div className="absolute bottom-4 left-5 flex flex-col gap-0.5 text-[#4D94FF]/40 font-mono text-[10px] font-bold pointer-events-none">
                                <div>WL: {windowCenter} / WW: {windowWidth}</div>
                                <div>SYNO-0160 · HELICAL</div>
                            </div>
                        </div>

                        {/* Right Info Panel */}
                        <div className="w-[260px] h-full overflow-hidden rounded-md border border-[#B0C4DE]/50 bg-[#F8FAFC] shadow-sm flex flex-col">
                            {/* Parameters Card */}
                            <div className="flex flex-1 flex-col overflow-hidden p-3 pb-3">
                                <div className="mb-3 flex items-center rounded-xl bg-[#EEF2F9] p-1 shrink-0">
                                    <button
                                        onClick={() => setActivePanel('acq')}
                                        className={`flex-1 flex items-center justify-center gap-2 h-[36px] rounded-lg text-[12px] font-black transition-all ${activePanel === 'acq' ? 'bg-white text-[#1E88E5] shadow-sm' : 'text-[#64748B]'}`}
                                    >
                                        <ScanLine size={14} />
                                        采集参数
                                    </button>
                                    <button
                                        onClick={() => setActivePanel('recon')}
                                        className={`flex-1 flex items-center justify-center gap-2 h-[36px] rounded-lg text-[12px] font-black transition-all ${activePanel === 'recon' ? 'bg-white text-[#1E88E5] shadow-sm' : 'text-[#64748B]'}`}
                                    >
                                        <RotateCcw size={14} />
                                        重建参数
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto px-1 pb-1 custom-scrollbar">
                                    {/* Scan Mode Sub-tabs within right panel */}
                                    <div className="space-y-2 pb-3 border-b border-[#E2E8F0]">
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">扫描模式</div>
                                        <div className="flex items-center gap-2 p-1 bg-white/70 rounded-lg">
                                            {scanModes.map((mode) => {
                                                const active = activeMode === mode.id;
                                                return (
                                                    <button
                                                        key={mode.id}
                                                        onClick={() => setActiveMode(mode.id)}
                                                        className={`flex-1 flex flex-col items-center justify-center h-[38px] rounded-lg border transition-all ${active
                                                            ? 'bg-white border-[#BFDBFE] text-[#1D4ED8] shadow-sm'
                                                            : 'border-transparent text-slate-400 hover:bg-white/50'
                                                            }`}
                                                    >
                                                        <span className="text-[11px] font-black leading-tight uppercase tracking-tighter">{mode.id}</span>
                                                        <span className="text-[9px] font-bold opacity-70 leading-tight">{mode.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {activePanel === 'acq' ? (
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-3">
                                            {acquisitionFields.slice(0, 4).map((field) => (
                                                <div key={field.label} className="flex flex-col gap-1">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{field.label}</label>
                                                    {field.type === 'select' ? (
                                                        <div className="relative">
                                                            <select className="w-full h-[32px] px-2 bg-white border border-slate-200 rounded-lg text-[12px] font-bold appearance-none outline-none focus:border-[#4D94FF] transition-all">
                                                                <option>{field.value}</option>
                                                            </select>
                                                            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            defaultValue={field.value}
                                                            className="w-full h-[32px] px-2 bg-white border border-slate-200 rounded-lg text-[12px] font-bold outline-none focus:border-[#4D94FF] transition-all"
                                                        />
                                                    )}
                                                </div>
                                            ))}

                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">螺距 (Pitch)</label>
                                                <input
                                                    type="text"
                                                    defaultValue="1"
                                                    className="w-full h-[32px] px-2 bg-white border border-slate-200 rounded-lg text-[12px] font-bold outline-none focus:border-[#4D94FF] transition-all"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">体位</label>
                                                <div className="relative">
                                                    <select className="w-full h-[32px] px-2 bg-white border border-slate-200 rounded-lg text-[12px] font-bold appearance-none outline-none focus:border-[#4D94FF] transition-all">
                                                        <option>HFS</option>
                                                        <option>FFS</option>
                                                        <option>HFP</option>
                                                        <option>FFP</option>
                                                    </select>
                                                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">开始位置 (Start)</label>
                                                <input
                                                    type="text"
                                                    defaultValue="--.-"
                                                    className="w-full h-[32px] px-2 bg-white border border-slate-200 rounded-lg text-[12px] font-bold outline-none focus:border-[#4D94FF] transition-all"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">结束位置 (End)</label>
                                                <input
                                                    type="text"
                                                    defaultValue="--.-"
                                                    className="w-full h-[32px] px-2 bg-white border border-slate-200 rounded-lg text-[12px] font-bold outline-none focus:border-[#4D94FF] transition-all"
                                                />
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">扫描方向</label>
                                                <div className="relative">
                                                    <select className="w-full h-[32px] px-2 bg-white border border-slate-200 rounded-lg text-[12px] font-bold appearance-none outline-none focus:border-[#4D94FF] transition-all">
                                                        <option>IN</option>
                                                        <option>OUT</option>
                                                    </select>
                                                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">部位</label>
                                                <div className="relative">
                                                    <select className="w-full h-[32px] px-2 bg-white border border-slate-200 rounded-lg text-[12px] font-bold appearance-none outline-none focus:border-[#4D94FF] transition-all">
                                                        <option>Body</option>
                                                        <option>Head</option>
                                                        <option>Chest</option>
                                                        <option>Abdomen</option>
                                                    </select>
                                                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                </div>
                                            </div>

                                            <div className="col-span-2 flex flex-col gap-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">扫描名称</label>
                                                <input
                                                    type="text"
                                                    defaultValue="待定"
                                                    className="w-full h-[32px] px-2 bg-white border border-slate-200 rounded-lg text-[12px] font-bold outline-none focus:border-[#4D94FF] transition-all"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-3">
                                            {reconFields.map((field) => (
                                                <div key={field.label} className={`flex flex-col gap-1 ${field.fullWidth ? 'col-span-2' : ''}`}>
                                                    <label className="text-[10px] font-black text-slate-400 font-sans uppercase tracking-[0.05em] px-0.5">{field.label}</label>
                                                    {field.type === 'select' ? (
                                                        <div className="relative">
                                                            <select className="w-full h-[36px] px-3 bg-white border border-slate-200 rounded-xl text-[12px] font-bold appearance-none outline-none focus:border-[#4D94FF] transition-all">
                                                                {field.options?.map((opt: string) => (
                                                                    <option key={opt}>{opt}</option>
                                                                ))}
                                                            </select>
                                                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            defaultValue={field.value}
                                                            className="w-full h-[36px] px-3 bg-white border border-slate-200 rounded-xl text-[12px] font-bold outline-none focus:border-[#4D94FF] transition-all"
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-3 mb-3 flex justify-center gap-2 px-2 shrink-0">
                                <button className="h-[36px] min-w-[92px] px-3.5 rounded-lg bg-[#4D94FF] text-white font-black text-[12px] hover:bg-blue-600 transition-all active:scale-95 shadow-sm flex items-center justify-center gap-2 uppercase tracking-[0.04em]">
                                    <Play size={14} fill="currentColor" />
                                    扫描
                                </button>
                                <button className="h-[36px] min-w-[92px] px-3.5 rounded-lg bg-white border border-[#B0C4DE] text-[#546E7A] font-bold text-[11px] hover:bg-slate-50 transition-all active:scale-95 flex items-center justify-center gap-2">
                                    <RotateCcw size={16} />
                                    重置
                                </button>
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
                <div className="ml-8 text-[13px] text-[#546E7A] font-medium leading-none">
                    服务模式 · 硬件 / 手动扫描
                </div>
            </footer>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
            `}</style>
        </div>
    );
}
