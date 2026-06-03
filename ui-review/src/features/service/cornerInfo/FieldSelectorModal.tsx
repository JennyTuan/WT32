import { useState, useMemo } from "react";
import { X, Search, Check, User, Activity, Image as ImageIcon, Cpu } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TranslationKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/i18nContext";
import type { CornerItem } from "../../../lib/cornerConfig";
import { getCornerFieldLabel } from "./cornerInfoI18n";

interface FieldSelectorModalProps {
    onClose: () => void;
    onSelect: (item: CornerItem) => void;
    existingKeys: string[];
}

interface FieldGroup {
    id: string;
    labelKey: TranslationKey;
    icon: LucideIcon;
    fields: { key: string; labelKey: TranslationKey }[];
}

const FIELD_GROUPS: FieldGroup[] = [
    {
        id: "patient",
        labelKey: "service.corner.group.patient",
        icon: User,
        fields: [
            { key: "patient_name", labelKey: "service.corner.field.patientName" },
            { key: "patient_id", labelKey: "service.corner.field.patientId" },
            { key: "patient_gender", labelKey: "service.corner.field.patientGender" },
            { key: "patient_age", labelKey: "service.corner.field.patientAge" },
        ]
    },
    {
        id: "scan",
        labelKey: "service.corner.group.scan",
        icon: Activity,
        fields: [
            { key: "scan_time", labelKey: "service.corner.field.scanTime" },
            { key: "protocol_name", labelKey: "service.corner.field.protocolName" },
            { key: "kv", labelKey: "service.corner.field.kv" },
            { key: "ma", labelKey: "service.corner.field.ma" },
        ]
    },
    {
        id: "image",
        labelKey: "service.corner.group.image",
        icon: ImageIcon,
        fields: [
            { key: "series_number", labelKey: "service.corner.field.seriesNumber" },
            { key: "image_number", labelKey: "service.corner.field.imageNumber" },
            { key: "slice_thickness", labelKey: "service.corner.field.sliceThickness" },
            { key: "increment", labelKey: "service.corner.field.increment" },
            { key: "kernel", labelKey: "service.corner.field.kernel" },
            { key: "window_width", labelKey: "service.corner.field.windowWidth" },
            { key: "window_level", labelKey: "service.corner.field.windowLevel" },
            { key: "recon_fov", labelKey: "service.corner.field.reconFov" },
        ]
    },
    {
        id: "device",
        labelKey: "service.corner.group.device",
        icon: Cpu,
        fields: [
            { key: "institution_name", labelKey: "service.corner.field.institutionName" },
            { key: "device_model", labelKey: "service.corner.field.deviceModel" },
        ]
    }
];

export default function FieldSelectorModal({ onClose, onSelect, existingKeys }: FieldSelectorModalProps) {
    const { t } = useI18n();
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState(FIELD_GROUPS[0].id);

    const filteredGroups = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return FIELD_GROUPS;

        return FIELD_GROUPS.map(group => ({
            ...group,
            fields: group.fields.filter(f => 
                t(f.labelKey).toLowerCase().includes(keyword) || f.key.toLowerCase().includes(keyword)
            )
        })).filter(group => group.fields.length > 0);
    }, [search, t]);

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
                        <h3 className="text-[17px] font-black text-[#1A2332]">{t("service.corner.modalTitle")}</h3>
                        <p className="text-[11px] text-[#94A3B8] font-bold uppercase tracking-wider">{t("service.corner.modalSubtitle")}</p>
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
                                        <span className={`text-[13px] ${isActive ? "font-black" : "font-bold"}`}>{t(group.labelKey)}</span>
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
                                placeholder={t("service.corner.modalSearch")}
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
                                            <span className="text-[10px] font-black uppercase tracking-widest">{t(group.labelKey)}</span>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 gap-2">
                                        {group.fields.map(field => {
                                            const isAdded = existingKeys.includes(field.key);
                                            return (
                                                <button 
                                                    key={field.key}
                                                    disabled={isAdded}
                                                    onClick={() => onSelect({ key: field.key, label: getCornerFieldLabel(field.key, t(field.labelKey), t), visible: true })}
                                                    className={`group flex items-center justify-between px-4 py-4 rounded-2xl transition-all border-2 ${
                                                        isAdded 
                                                            ? "bg-[#F1F5F9]/50 border-transparent opacity-40 cursor-not-allowed" 
                                                            : "bg-white border-[#F1F5F9] hover:border-[#3B82F6]/30 hover:shadow-md active:scale-[0.98]"
                                                    }`}
                                                >
                                                    <div className="flex flex-col items-start">
                                                        <span className="text-[14px] font-black text-[#334155]">{t(field.labelKey)}</span>
                                                        <span className="text-[10px] font-mono text-[#94A3B8] tracking-wider">{field.key}</span>
                                                    </div>
                                                    {isAdded ? (
                                                        <span className="text-[11px] font-black text-[#94A3B8] bg-gray-200 px-2 py-1 rounded-md uppercase">{t("service.corner.added")}</span>
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
                                    <span className="text-[13px] font-bold">{t("service.corner.noFields")}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
