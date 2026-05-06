import { useState, useMemo } from "react";
import { X, Search, Check, User, Activity, Image as ImageIcon, Cpu } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CornerItem } from "../../../lib/cornerConfig";

interface FieldSelectorModalProps {
    onClose: () => void;
    onSelect: (item: CornerItem) => void;
    existingKeys: string[];
}

interface FieldGroup {
    id: string;
    label: string;
    icon: LucideIcon;
    fields: { key: string; label: string }[];
}

const FIELD_GROUPS: FieldGroup[] = [
    {
        id: "patient",
        label: "患者信息",
        icon: User,
        fields: [
            { key: "patient_name", label: "姓名" },
            { key: "patient_id", label: "ID" },
            { key: "patient_gender", label: "性别" },
            { key: "patient_age", label: "年龄" },
        ]
    },
    {
        id: "scan",
        label: "扫描参数",
        icon: Activity,
        fields: [
            { key: "scan_time", label: "扫描时间" },
            { key: "protocol_name", label: "协议名称" },
            { key: "kv", label: "管电压 (kV)" },
            { key: "ma", label: "管电流 (mA)" },
        ]
    },
    {
        id: "image",
        label: "图像信息",
        icon: ImageIcon,
        fields: [
            { key: "series_number", label: "序列号" },
            { key: "image_number", label: "图像号" },
            { key: "slice_thickness", label: "层厚" },
            { key: "increment", label: "层间距" },
            { key: "kernel", label: "重建算法" },
            { key: "window_width", label: "窗宽 (WW)" },
            { key: "window_level", label: "窗位 (WL)" },
            { key: "recon_fov", label: "视野 (FOV)" },
        ]
    },
    {
        id: "device",
        label: "设备信息",
        icon: Cpu,
        fields: [
            { key: "institution_name", label: "医疗机构" },
            { key: "device_model", label: "设备型号" },
        ]
    }
];

export default function FieldSelectorModal({ onClose, onSelect, existingKeys }: FieldSelectorModalProps) {
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState(FIELD_GROUPS[0].id);

    const filteredGroups = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return FIELD_GROUPS;

        return FIELD_GROUPS.map(group => ({
            ...group,
            fields: group.fields.filter(f => 
                f.label.toLowerCase().includes(keyword) || f.key.toLowerCase().includes(keyword)
            )
        })).filter(group => group.fields.length > 0);
    }, [search]);

    const displayGroups = useMemo(() => {
        if (search.trim()) return filteredGroups;
        return filteredGroups.filter(g => g.id === activeTab);
    }, [filteredGroups, activeTab, search]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-[560px] h-[520px] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[#DDEAF8]">
                {/* Header */}
                <div className="px-6 py-5 border-b border-[#F1F5F9] flex items-center justify-between bg-[#F8FAFC]">
                    <div className="flex flex-col">
                        <h3 className="text-[17px] font-black text-[#1A2332]">选择显示字段</h3>
                        <p className="text-[11px] text-[#94A3B8] font-bold uppercase tracking-wider">点击字段名添加到当前区域</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[#F1F5F9] rounded-full text-[#94A3B8] transition-colors active:scale-90">
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="flex-1 flex min-h-0">
                    {/* Category Sidebar */}
                    {!search.trim() && (
                        <div className="w-[160px] bg-[#F8FAFC] border-r border-[#F1F5F9] p-3 flex flex-col gap-1">
                            {FIELD_GROUPS.map(group => {
                                const Icon = group.icon;
                                const isActive = activeTab === group.id;
                                return (
                                    <button
                                        key={group.id}
                                        onClick={() => setActiveTab(group.id)}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                                            isActive 
                                                ? "bg-white text-[#3B82F6] shadow-sm border border-[#3B82F6]/10" 
                                                : "text-[#64748B] hover:bg-gray-100/50"
                                        }`}
                                    >
                                        <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                                        <span className={`text-[13px] ${isActive ? "font-black" : "font-bold"}`}>{group.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 flex flex-col p-5">
                        <div className="relative mb-5">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#3B82F6]" size={16} strokeWidth={2.5} />
                            <input 
                                type="text" 
                                placeholder="快速搜索字段..." 
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full h-12 pl-11 pr-4 bg-[#F1F5F9]/50 border-2 border-transparent rounded-2xl text-[14px] font-bold outline-none focus:border-[#3B82F6]/20 focus:bg-white transition-all shadow-inner"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-4">
                            {displayGroups.map(group => (
                                <div key={group.id} className="flex flex-col gap-2">
                                    {search.trim() && (
                                        <div className="px-2 py-1 flex items-center gap-2 opacity-50">
                                            <group.icon size={12} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">{group.label}</span>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 gap-2">
                                        {group.fields.map(field => {
                                            const isAdded = existingKeys.includes(field.key);
                                            return (
                                                <button 
                                                    key={field.key}
                                                    disabled={isAdded}
                                                    onClick={() => onSelect({ key: field.key, label: field.label, visible: true })}
                                                    className={`group flex items-center justify-between px-4 py-4 rounded-2xl transition-all border-2 ${
                                                        isAdded 
                                                            ? "bg-[#F1F5F9]/50 border-transparent opacity-40 cursor-not-allowed" 
                                                            : "bg-white border-[#F1F5F9] hover:border-[#3B82F6]/30 hover:shadow-md active:scale-[0.98]"
                                                    }`}
                                                >
                                                    <div className="flex flex-col items-start">
                                                        <span className="text-[14px] font-black text-[#334155]">{field.label}</span>
                                                        <span className="text-[10px] font-mono text-[#94A3B8] tracking-wider">{field.key}</span>
                                                    </div>
                                                    {isAdded ? (
                                                        <span className="text-[11px] font-black text-[#94A3B8] bg-gray-200 px-2 py-1 rounded-md uppercase">已添加</span>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-xl bg-[#3B82F6]/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Check size={16} className="text-[#3B82F6]" strokeWidth={3} />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {displayGroups.length === 0 && (
                                <div className="flex-1 flex flex-col items-center justify-center py-20 text-[#94A3B8] gap-4">
                                    <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center">
                                        <Search size={32} opacity={0.2} />
                                    </div>
                                    <span className="text-[13px] font-bold">没有发现可用的字段</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
