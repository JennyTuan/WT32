import { useState } from "react";
import {
    Plus,
    ChevronRight,
    Info,
    CircleDot,
    ChevronDown
} from "lucide-react";

export default function WT32ProtocolDetailScreen() {
    const [activeTab, setActiveTab] = useState("basic");
    const [selectedPos, setSelectedPos] = useState("HFS");

    const positions = [
        { id: "HFS", label: "头先进-仰卧" },
        { id: "FFS", label: "足先进-仰卧" },
        { id: "HFP", label: "头先进-俯卧" },
        { id: "FFP", label: "足先进-俯卧" },
        { id: "HFDR", label: "头先进-右侧卧" },
        { id: "FFDR", label: "足先进-右侧卧" },
        { id: "HFDL", label: "头先进-左侧卧" },
        { id: "FFDL", label: "足先进-左侧卧" },
    ];

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
                                <span className="font-bold text-sm text-[#37474F]">牙齿</span>
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
                            <button
                                onClick={() => setActiveTab("basic")}
                                className={`flex items-center justify-between px-4 py-2.5 rounded-md text-[13px] font-bold transition-all border ${activeTab === "basic"
                                    ? "bg-[#E3F2FD] border-[#4D94FF] text-[#1E88E5] shadow-sm"
                                    : "text-[#546E7A] border-transparent hover:bg-gray-50"
                                    }`}
                            >
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
                                    <div className="group relative bg-[#F8FAFC] border border-[#EEF2F9] rounded-md px-3 py-2 cursor-pointer hover:bg-[#F3F8FF] transition-colors shadow-sm flex justify-between items-start">
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

                            <button className="flex items-center justify-between px-4 py-3 rounded-md text-[13px] font-bold text-[#546E7A] hover:bg-gray-50 mt-1 transition-colors group">
                                剂量 / 通知阈值
                                <ChevronRight size={14} className="text-[#90A4AE] group-hover:text-[#4D94FF]" />
                            </button>

                            <button className="flex items-center justify-between px-4 py-3 rounded-md text-[13px] font-bold text-[#546E7A] hover:bg-gray-50 transition-colors group">
                                高级设置
                                <ChevronRight size={14} className="text-[#90A4AE] group-hover:text-[#4D94FF]" />
                            </button>
                        </nav>
                    </div>
                </aside>

                {/* Right Panel - Parameter Editor */}
                <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm flex flex-col overflow-hidden">
                    <div className="h-[44px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0 text-[#37474F]">
                        <span className="text-[11px] font-black uppercase tracking-widest">协议基本信息 (Basic Info)</span>
                        <Info size={16} className="text-[#4D94FF]" />
                    </div>

                    <div className="flex-1 px-8 py-4 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-6">
                            {[
                                { label: "协议名称", value: "牙齿", required: true },
                                { label: "部位", value: "头部", type: "select", required: true },
                                { label: "解剖区域（细分）", value: "上颌骨" },
                                { label: "体型范围（KG）", value: "50-90" },
                                { label: "年龄", value: "成人", type: "select", required: true },
                            ].map((field, idx) => (
                                <div key={idx} className="space-y-2">
                                    <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight flex items-center gap-0.5">
                                        {field.label}
                                        {field.required && <span className="text-red-500 text-[12px] leading-none select-none">*</span>}
                                    </label>
                                    {field.type === "select" ? (
                                        <div className="relative">
                                            <select className="w-full h-[40px] px-3 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none appearance-none cursor-pointer focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10">
                                                <option>{field.value}</option>
                                            </select>
                                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            defaultValue={field.value}
                                            className="w-full h-[40px] px-3 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 border-t border-[#EEF2F9] pt-8">
                            <div className="flex flex-col gap-1 mb-6 px-1">
                                <h3 className="text-[12px] font-black text-[#37474F] uppercase tracking-wider flex items-center gap-0.5">
                                    扫描体位
                                    <span className="text-red-500 text-[14px] leading-none select-none">*</span>
                                </h3>
                            </div>

                            <div className="grid grid-cols-4 gap-4">
                                {positions.map((pos) => (
                                    <button
                                        key={pos.id}
                                        onClick={() => setSelectedPos(pos.id)}
                                        className={`relative flex flex-col items-center justify-center p-3 rounded-md border-2 transition-all h-[76px] shadow-sm ${selectedPos === pos.id
                                            ? "bg-white border-[#4D94FF] ring-2 ring-[#4D94FF]/10"
                                            : "bg-white border-[#B0C4DE]/40 group hover:border-[#B0C4DE]"
                                            }`}
                                    >
                                        <span className={`text-[16px] font-black font-mono tracking-tighter ${selectedPos === pos.id ? "text-[#1E88E5]" : "text-[#B0C4DE]"}`}>{pos.id}</span>
                                        <span className={`text-[10px] font-black mt-1 ${selectedPos === pos.id ? "text-[#4D94FF]" : "text-[#B0C4DE]"}`}>
                                            {pos.label}
                                        </span>
                                        {selectedPos === pos.id && (
                                            <div className="absolute top-2 right-2">
                                                <CircleDot size={12} className="text-[#4D94FF]" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
