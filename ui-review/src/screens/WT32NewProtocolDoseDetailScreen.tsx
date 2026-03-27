import { ChevronDown, ChevronRight, Info, Plus } from "lucide-react";

export default function WT32NewProtocolDoseDetailScreen() {
    return (
        <div className="flex flex-col h-full bg-[#EEF2F9] text-[#37474F] font-sans select-none">
            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden p-2 flex gap-3">
                {/* Left Panel - Protocol Sidebar */}
                <aside className="w-[310px] flex flex-col bg-white border border-[#B0C4DE] rounded-md shadow-sm overflow-hidden shrink-0">
                    <div className="h-[44px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center px-4 shrink-0">
                        <span className="text-[11px] font-black uppercase tracking-wider text-[#37474F]">
                            协议队列 (Protocols)
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
                        <div className="p-3 bg-[#F8FAFC] border border-[#EEF2F9] rounded-md">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="font-bold text-sm text-[#37474F]">脑部螺旋</span>
                                <span className="bg-[#EEF2F9] text-[#546E7A] text-[10px] px-1.5 py-0.5 rounded">头部</span>
                                <span className="bg-[#EEF2F9] text-[#546E7A] text-[10px] px-1.5 py-0.5 rounded">成人</span>
                            </div>
                            <div className="flex items-start gap-2 text-[#4D94FF]">
                                <Info size={12} className="shrink-0 mt-0.5" />
                                <p className="text-[10px] leading-tight font-bold">
                                    出厂模板：您的修改仅对本次扫描生效。
                                </p>
                            </div>
                        </div>

                        <nav className="flex flex-col gap-2">
                            <button className="flex items-center justify-between px-4 py-2.5 rounded-md text-[13px] font-bold text-[#546E7A] border border-transparent hover:bg-gray-50 transition-all text-left">
                                协议基本信息
                            </button>

                            <div className="mt-2 flex flex-col">
                                <div className="flex justify-between items-center px-1 mb-2">
                                    <span className="text-[10px] text-[#94A3B8] font-black uppercase tracking-widest">采集队列</span>
                                    <button className="text-[#4D94FF] flex items-center gap-1 text-[11px] hover:underline font-bold px-2 py-1 rounded hover:bg-blue-50 transition-colors">
                                        <Plus size={12} /> 新增
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <div className="bg-[#F8FAFC] border border-[#EEF2F9] rounded-md px-3 py-2 cursor-pointer hover:bg-[#F3F8FF] transition-colors shadow-sm flex justify-between items-start">
                                        <span className="text-[11px] text-[#37474F] font-bold">定位像</span>
                                        <span className="opacity-50 text-[10px] mt-0.5">LOCALIZER</span>
                                    </div>

                                    <div className="flex flex-col rounded-md border border-[#EEF2F9] bg-[#F8FAFC] overflow-hidden shadow-sm">
                                        <div className="px-3 py-2.5 flex justify-between items-center border-b border-[#EEF2F9] group cursor-pointer hover:bg-[#F3F8FF] transition-colors">
                                            <span className="text-[11px] font-bold text-[#546E7A]">Acquisition 1</span>
                                            <span className="text-[10px] text-[#94A3B8] font-medium uppercase tracking-tight">螺旋扫描</span>
                                        </div>

                                        <div className="p-2 flex flex-col gap-1">
                                            <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#E3F2FD]/50 rounded cursor-pointer transition-colors group">
                                                <div className="w-1 h-3 bg-[#4D94FF] rounded-full opacity-30 group-hover:opacity-100 transition-opacity"></div>
                                                <span className="text-[11px] text-[#546E7A] font-bold">软组织</span>
                                            </div>
                                            <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#E3F2FD]/50 rounded cursor-pointer transition-colors group">
                                                <div className="w-1 h-3 bg-[#4D94FF] rounded-full opacity-30 group-hover:opacity-100 transition-opacity"></div>
                                                <span className="text-[11px] text-[#546E7A] font-bold">骨骼</span>
                                            </div>

                                            <button className="mt-0.5 w-full py-1.5 bg-white border border-[#4D94FF]/10 text-[#4D94FF] hover:border-[#4D94FF]/30 rounded text-[10px] font-black transition-all flex items-center justify-center gap-1.5 shadow-sm">
                                                <Plus size={10} strokeWidth={3} /> 新增重建
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button className="flex items-center justify-between px-4 py-3 rounded-md text-[13px] font-bold bg-[#E3F2FD] border border-[#4D94FF] text-[#1E88E5] shadow-sm mt-1 transition-colors group text-left">
                                剂量 / 通知阈值
                                <ChevronRight size={14} className="text-[#1E88E5]" />
                            </button>

                            <button className="flex items-center justify-between px-4 py-3 rounded-md text-[13px] font-bold text-[#546E7A] hover:bg-gray-50 transition-colors group text-left">
                                高级设置
                                <ChevronRight size={14} className="text-[#90A4AE] group-hover:text-[#4D94FF]" />
                            </button>
                        </nav>
                    </div>
                </aside>

                {/* Right Panel - Dose & Notification Threshold */}
                <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm flex flex-col overflow-hidden">
                    <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex flex-col justify-center px-6 shrink-0">
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">剂量 / 通知阈值</span>
                        <span className="text-[10px] text-[#94A3B8] font-bold">参考值可选填；通知阈值用于扫描前确认/告警</span>
                    </div>

                    <div className="flex-1 p-8 overflow-y-auto bg-white">
                        <div className="flex flex-col gap-10">
                            {/* Section 1: Dose Reference */}
                            <div className="flex flex-col gap-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-3 bg-[#4D94FF] rounded-full"></div>
                                        <span className="text-[11px] font-black text-[#546E7A] uppercase tracking-widest">剂量参考与阈值</span>
                                    </div>
                                    <button className="px-4 py-1.5 bg-[#EEF2F9] text-[#4D94FF] rounded text-[11px] font-bold border border-[#4D94FF]/20 hover:bg-[#4D94FF] hover:text-white transition-all shadow-sm">
                                        一键应用系统 DRL
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">CTDIvol (mGy) (参考)</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                defaultValue="59.4"
                                                className="w-full h-[40px] px-4 bg-white border border-[#B0C4DE] rounded-md text-[14px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10 transition-all shadow-sm"
                                            />
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0 border-l border-[#B0C4DE] pl-2 h-7 justify-center">
                                                <ChevronDown size={14} className="text-[#94A3B8] rotate-180 cursor-pointer hover:text-[#4D94FF]" />
                                                <ChevronDown size={14} className="text-[#94A3B8] cursor-pointer hover:text-[#4D94FF]" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">DLP (mGy*cm) (参考)</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                defaultValue="1168.5"
                                                className="w-full h-[40px] px-4 bg-white border border-[#B0C4DE] rounded-md text-[14px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10 transition-all shadow-sm"
                                            />
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0 border-l border-[#B0C4DE] pl-2 h-7 justify-center">
                                                <ChevronDown size={14} className="text-[#94A3B8] rotate-180 cursor-pointer hover:text-[#4D94FF]" />
                                                <ChevronDown size={14} className="text-[#94A3B8] cursor-pointer hover:text-[#4D94FF]" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Editable Thresholds */}
                            <div className="bg-[#F8FAFC] border border-[#EEF2F9] rounded-lg p-6 flex flex-col gap-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-3 bg-[#4D94FF] rounded-full"></div>
                                    <span className="text-[11px] font-black text-[#546E7A] uppercase tracking-widest">通知阈值 (可编辑)</span>
                                </div>

                                <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">CTDI 通知阈值 (mGy)</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                defaultValue="80"
                                                className="w-full h-[40px] px-4 bg-white border border-[#B0C4DE] rounded-md text-[14px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10 transition-all shadow-sm"
                                            />
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0 border-l border-[#B0C4DE] pl-2 h-7 justify-center">
                                                <ChevronDown size={14} className="text-[#94A3B8] rotate-180 cursor-pointer hover:text-[#4D94FF]" />
                                                <ChevronDown size={14} className="text-[#94A3B8] cursor-pointer hover:text-[#4D94FF]" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">DLP 通知阈值 (mGy*cm)</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                defaultValue="1320"
                                                className="w-full h-[40px] px-4 bg-white border border-[#B0C4DE] rounded-md text-[14px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10 transition-all shadow-sm"
                                            />
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0 border-l border-[#B0C4DE] pl-2 h-7 justify-center">
                                                <ChevronDown size={14} className="text-[#94A3B8] rotate-180 cursor-pointer hover:text-[#4D94FF]" />
                                                <ChevronDown size={14} className="text-[#94A3B8] cursor-pointer hover:text-[#4D94FF]" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
