import { useState } from 'react';
import {
    LayoutGrid,
    Battery,
    Disc,
    BatteryCharging,
    RotateCcw,
    History,
    AlertTriangle,
    Check,
    ChevronDown,
    ZapOff,
    Info,
    XCircle,
    X,
    Lock,
    Trash2,
    Share2
} from 'lucide-react';

const ComponentSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className="mb-12">
        <h2 className="text-[18px] font-black text-[#263238] uppercase tracking-widest mb-6 pb-2 border-b-2 border-[#4D94FF] w-fit">
            {title}
        </h2>
        <div className="grid grid-cols-1 gap-8">
            {children}
        </div>
    </div>
);

const Group = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div className="flex flex-col gap-4">
        <span className="text-[12px] font-bold text-[#90A4AE] uppercase tracking-wider">{label}</span>
        <div className="flex flex-wrap gap-6 items-center">
            {children}
        </div>
    </div>
);

const ComponentLibraryScreen = () => {
    const [activeTab, setActiveTab] = useState('Tab 1');

    return (
        <div className="w-[1100px] h-[800px] bg-white rounded-xl shadow-2xl border border-[#B0C4DE] flex flex-col overflow-hidden">

                {/* Header */}
                <header className="h-[70px] bg-[#E8EAF1] border-b border-[#B0C4DE] flex items-center justify-between px-8 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#4D94FF] rounded-lg text-white shadow-md">
                            <LayoutGrid size={24} />
                        </div>
                        <h1 className="text-[20px] font-black text-[#263238]">设计组件库</h1>
                        <span className="px-3 py-1 bg-white/50 border border-[#B0C4DE] rounded text-[10px] font-bold text-[#546E7A] ml-2">V 1.0</span>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-[#F8FAFC]">

                    {/* 1. Buttons */}
                    <ComponentSection title="按钮系统 · Buttons">
                        <Group label="主按钮 (Primary)">
                            <button className="px-8 h-10 bg-[#4D94FF] text-white font-black rounded-full shadow-lg hover:bg-[#3B82F6] active:bg-[#2563EB] transition-all active:scale-95 text-[14px]">
                                标准主按钮
                            </button>
                            <button className="px-10 h-11 bg-[#4D94FF] text-white font-black rounded-full shadow-lg hover:bg-[#3B82F6] active:bg-[#2563EB] transition-all active:scale-95 text-[14px]">
                                紧凑型尺寸
                            </button>
                            <button className="px-10 h-12 bg-[#2F54EB] text-white font-black rounded-xl hover:bg-[#1D39C4] transition-all active:scale-95 shadow-lg text-[14px]">
                                方正型 (弹窗专用)
                            </button>
                        </Group>

                        <Group label="次级按钮 (Secondary / Outline)">
                            <button className="px-8 h-10 bg-white border-2 border-[#4D94FF] text-[#4D94FF] font-black rounded-full hover:bg-[#F9FBFC] active:bg-[#E3F2FD] transition-all active:scale-95 text-[14px] flex items-center gap-2 shadow-sm">
                                <History size={16} /> 历史记录
                            </button>
                            <button className="px-8 h-10 bg-white border border-[#B0C4DE] text-[#263238] font-black rounded-xl hover:bg-gray-50 transition-all active:scale-95 shadow-sm text-[14px]">
                                取消按钮
                            </button>
                            <button className="px-8 h-10 bg-white border border-[#B0C4DE] text-[#546E7A] font-black rounded-full hover:bg-gray-50 transition-all active:scale-95 shadow-sm text-[13px]">
                                复位操作
                            </button>
                        </Group>

                        <Group label="颜色规约为平铺 (Color Palettes)">
                            <div className="flex gap-10">
                                <div className="flex flex-col gap-2">
                                    <span className="text-[11px] font-bold text-[#90A4AE]">主按钮状态</span>
                                    <div className="flex gap-3">
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="w-12 h-12 bg-[#4D94FF] rounded-lg shadow-inner border border-black/5"></div>
                                            <span className="text-[10px] font-bold">Normal</span>
                                            <span className="text-[9px] text-[#90A4AE]">#4D94FF</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="w-12 h-12 bg-[#3B82F6] rounded-lg shadow-inner border border-black/5"></div>
                                            <span className="text-[10px] font-bold">Hover</span>
                                            <span className="text-[9px] text-[#90A4AE]">#3B82F6</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="w-12 h-12 bg-[#2563EB] rounded-lg shadow-inner border border-black/5"></div>
                                            <span className="text-[10px] font-bold">Active</span>
                                            <span className="text-[9px] text-[#90A4AE]">#2563EB</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <span className="text-[11px] font-bold text-[#90A4AE]">线性按钮状态 (背景)</span>
                                    <div className="flex gap-3">
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="w-12 h-12 bg-white rounded-lg shadow-inner border border-[#B0C4DE]"></div>
                                            <span className="text-[10px] font-bold">Normal</span>
                                            <span className="text-[9px] text-[#90A4AE]">#FFFFFF</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="w-12 h-12 bg-[#F9FBFC] rounded-lg shadow-inner border border-[#B0C4DE]"></div>
                                            <span className="text-[10px] font-bold">Hover</span>
                                            <span className="text-[9px] text-[#90A4AE]">#F9FBFC</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="w-12 h-12 bg-[#E3F2FD] rounded-lg shadow-inner border border-[#4D94FF]/30"></div>
                                            <span className="text-[10px] font-bold">Active</span>
                                            <span className="text-[9px] text-[#90A4AE]">#E3F2FD</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Group>
                    </ComponentSection>

                    {/* 2. Status Banners */}
                    <ComponentSection title="状态横幅 · Status Banners">
                        <Group label="充电/运行状态">
                            <div className="flex gap-8">
                                <div className="w-[450px] bg-[#F6FFED] border border-[#B7EB8F] rounded-xl p-4 flex items-center justify-between shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-[#52C41A] rounded flex items-center justify-center text-white">
                                            <BatteryCharging size={20} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[14px] font-black text-[#135200]">充电中</span>
                                        </div>
                                    </div>
                                    <div className="text-[20px] font-black text-[#135200]">-1.0 A</div>
                                </div>

                                <div className="w-[450px] bg-[#FFF7E6] border border-[#FFE7BA] rounded-xl p-4 flex items-center justify-between shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-[#FA8C16] rounded flex items-center justify-center text-white">
                                            <ZapOff size={18} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[14px] font-black text-[#873800]">放电</span>
                                            <span className="text-[10px] font-bold text-[#FA8C16]/70 mt-0.5">状态由电流方向判断</span>
                                        </div>
                                    </div>
                                    <div className="text-[20px] font-black text-[#873800]">+5.2 A</div>
                                </div>
                            </div>
                        </Group>

                        <Group label="告警提示 (Alerts · 3级)">
                            <div className="flex flex-col gap-4 w-full">
                                <div className="w-full bg-[#E6F7FF] border border-[#91D5FF] rounded-xl p-4 flex items-center justify-between shadow-sm transform transition-all hover:scale-[1.01]">
                                    <div className="flex items-center gap-3">
                                        <Info size={20} className="text-[#1890FF]" />
                                        <div className="flex flex-col">
                                            <span className="text-[14px] font-black text-[#003A8C]">提示 (Info)</span>
                                            <span className="text-[12px] font-bold text-[#0050B3]/70">系统运行正常，当前环境已准备就绪。</span>
                                        </div>
                                    </div>
                                    <button className="p-1 hover:bg-[#91D5FF]/20 rounded-full transition-colors">
                                        <X size={16} className="text-[#1890FF]" />
                                    </button>
                                </div>
                                <div className="w-full bg-[#FFFBE6] border border-[#FFE58F] rounded-xl p-4 flex items-center justify-between shadow-sm transform transition-all hover:scale-[1.01]">
                                    <div className="flex items-center gap-3">
                                        <AlertTriangle size={20} className="text-[#FAAD14]" />
                                        <div className="flex flex-col">
                                            <span className="text-[14px] font-black text-[#856404]">警示 (Warning)</span>
                                            <span className="text-[12px] font-bold text-[#856404]/70">请确认模体是否摆放正确，可能影响分析准确性。</span>
                                        </div>
                                    </div>
                                    <button className="p-1 hover:bg-[#FFE58F]/30 rounded-full transition-colors">
                                        <X size={16} className="text-[#FAAD14]" />
                                    </button>
                                </div>
                                <div className="w-full bg-[#FFF1F0] border border-[#FFA39E] rounded-xl p-4 flex items-center justify-between shadow-sm transform transition-all hover:scale-[1.01]">
                                    <div className="flex items-center gap-3">
                                        <XCircle size={20} className="text-[#F5222D]" />
                                        <div className="flex flex-col">
                                            <span className="text-[14px] font-black text-[#820014]">错误 (Error)</span>
                                            <span className="text-[12px] font-bold text-[#A8071A]/70">硬件连接异常，请检查通讯链路后重试。</span>
                                        </div>
                                    </div>
                                    <button className="p-1 hover:bg-[#FFA39E]/30 rounded-full transition-colors">
                                        <X size={16} className="text-[#F5222D]" />
                                    </button>
                                </div>
                            </div>
                        </Group>
                    </ComponentSection>

                    {/* 3. Data Metrics */}
                    <ComponentSection title="指标卡片 · Data Metrics">
                        <Group label="核心看板卡片">
                            <div className="flex gap-6">
                                <div className="w-[180px] bg-white border border-[#B0C4DE]/40 rounded-2xl p-4 flex flex-col shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[11px] font-bold text-[#90A4AE]">总电压</span>
                                        <span className="text-[11px] font-bold text-[#B0C4DE]">V</span>
                                    </div>
                                    <div className="text-[24px] font-black text-[#263238]">540.20</div>
                                </div>

                                <div className="w-[200px] bg-white border border-[#B0C4DE]/40 rounded-2xl p-4 flex flex-col shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[11px] font-bold text-[#90A4AE]">SOC</span>
                                        <span className="text-[11px] font-bold text-[#B0C4DE]">%</span>
                                    </div>
                                    <div className="text-[24px] font-black text-[#263238]">78</div>
                                    <div className="w-full h-2 bg-[#EEF2F9] rounded-full mt-3 overflow-hidden">
                                        <div className="h-full bg-[#4D94FF] rounded-full shadow-[0_0_8px_rgba(77,148,255,0.4)]" style={{ width: '78%' }}></div>
                                    </div>
                                </div>

                                <div className="w-[180px] bg-white border border-[#B0C4DE]/40 rounded-2xl p-4 flex flex-col shadow-sm">
                                    <span className="text-[11px] font-bold text-[#90A4AE] mb-2 uppercase">单体最小电压</span>
                                    <div className="text-[24px] font-black text-[#263238]">3.12 <span className="text-[12px] font-bold text-[#B0C4DE] ml-1">V</span></div>
                                    <div className="mt-auto pt-3 border-t border-[#EEF2F9]">
                                        <div className="px-2 py-0.5 bg-[#EEF2F9] rounded text-[10px] font-bold text-[#4D94FF] w-fit">计算项</div>
                                    </div>
                                </div>
                            </div>
                        </Group>
                    </ComponentSection>

                    {/* 4. Tabs & Navigation */}
                    <ComponentSection title="导航与切换 · Tabs & Navigation">
                        <Group label="临床模式标签页 (Clinical Tabs)">
                            <div className="flex bg-[#EEF2F9] p-1 rounded-md border border-[#B0C4DE]/50 overflow-hidden shadow-sm">
                                {['高压电池', '低压电池'].map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-10 h-[32px] text-[13px] font-bold rounded-md transition-all duration-200 ${activeTab === tab ? 'bg-[#4D94FF] text-white shadow-sm' : 'text-[#4D94FF] hover:bg-white/50'}`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </Group>

                        <Group label="侧边栏项 (Sidebar Items)">
                            <div className="flex gap-4 p-4 bg-white border border-[#B0C4DE] rounded-lg">
                                <div className="flex items-center gap-3 px-4 py-2.5 bg-[#E3F2FD] text-[#1E88E5] border-l-4 border-[#1E88E5] rounded-md font-bold text-[13px]">
                                    <Battery size={18} /> 激活项
                                </div>
                                <div className="flex items-center gap-3 px-4 py-2.5 text-[#546E7A] hover:bg-gray-50 rounded-md font-medium text-[13px]">
                                    <Disc size={18} /> 普通项
                                </div>
                            </div>
                        </Group>
                    </ComponentSection>

                    {/* 5. Form Elements */}
                    <ComponentSection title="表单元素 · Form Elements">
                        <Group label="参数调节框 (Parameter Input)">
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-4 bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg h-10 px-4 gap-4 shadow-inner">
                                    <input
                                        type="text"
                                        value="480"
                                        readOnly
                                        className="w-16 bg-transparent text-[15px] font-black text-[#263238] text-center"
                                    />
                                    <div className="flex flex-col border-l border-[#B0C4DE]/30 pl-2">
                                        <ChevronDown size={14} className="rotate-180 text-[#B0C4DE]" />
                                        <ChevronDown size={14} className="text-[#B0C4DE]" />
                                    </div>
                                </div>
                                <div className="w-16 h-10 bg-[#F8FAFC] border border-[#B0C4DE] rounded-lg flex items-center justify-center font-bold text-[#4D94FF] text-[15px] shadow-inner">
                                    3
                                </div>
                            </div>
                        </Group>

                        <Group label="状态反馈">
                            <div className="flex items-center gap-2 text-[#52C41A] font-bold text-[13px]">
                                <div className="w-4 h-4 bg-[#52C41A] rounded-full flex items-center justify-center text-white">
                                    <Check size={10} strokeWidth={4} />
                                </div>
                                配置已保存
                            </div>
                            <div className="flex items-center gap-2 text-[#90A4AE] font-bold text-[13px]">
                                <RotateCcw size={16} /> 运行中...
                            </div>
                        </Group>
                    </ComponentSection>

                    {/* 6. Data Management */}
                    <ComponentSection title="数据管理 · Data Management">
                        <Group label="数据保留状态 (Retention Status)">
                            <div className="flex items-center justify-center gap-1.5 px-3 py-1 bg-[#E3F2FD] text-[#4D94FF] rounded-full font-bold text-[11px] border border-[#4D94FF]/20">
                                <Lock size={12} /> 保留状态
                            </div>
                        </Group>

                        <Group label="列表操作项 (Row Actions)">
                            <div className="flex items-center gap-2">
                                <button className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#B0C4DE] text-[#546E7A] hover:bg-gray-50 shadow-sm">
                                    <Share2 size={16} />
                                </button>
                                <button className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#FF4D4F] text-white hover:bg-[#D9363E] shadow-sm">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </Group>
                    </ComponentSection>
                </main>

                {/* Footer */}
                <footer className="h-[50px] bg-[#EEF2F9] border-t border-[#B0C4DE] flex items-center px-8 text-[11px] text-[#90A4AE] font-bold uppercase tracking-widest italic shrink-0">
                    Antigravity Design System Toolkit
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

export default ComponentLibraryScreen;
