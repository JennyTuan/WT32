import { Eye, EyeOff } from "lucide-react";
import type { TranslationKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/i18nContext";
import { CORNER_FIELD_EXAMPLES } from "../../../lib/cornerConfig";
import type { CornerItem, CornerConfigData, CornerKey } from "../../../lib/cornerConfig";
import { getCornerFieldLabel } from "./cornerInfoI18n";

const CORNERS: { id: CornerKey; labelKey: TranslationKey; hintKey: TranslationKey; accent: string }[] = [
    { id: "topLeft",     labelKey: "service.corner.corner.topLeft",     hintKey: "service.corner.corner.topLeftHint",     accent: "#3B82F6" },
    { id: "topRight",    labelKey: "service.corner.corner.topRight",    hintKey: "service.corner.corner.topRightHint",    accent: "#10B981" },
    { id: "bottomLeft",  labelKey: "service.corner.corner.bottomLeft",  hintKey: "service.corner.corner.bottomLeftHint",  accent: "#F59E0B" },
    { id: "bottomRight", labelKey: "service.corner.corner.bottomRight", hintKey: "service.corner.corner.bottomRightHint", accent: "#8B5CF6" },
];

interface CornerEditorProps {
    config: CornerConfigData;
    onUpdate: (config: CornerConfigData) => void;
}

export default function CornerEditor({ config, onUpdate }: CornerEditorProps) {
    const { t } = useI18n();

    const setCorner = (key: CornerKey, items: CornerItem[]) => {
        onUpdate({ ...config, corners: { ...config.corners, [key]: items } });
    };

    const toggleField = (corner: CornerKey, fieldKey: string) => {
        const items = config.corners[corner];
        setCorner(corner, items.map(i => i.key === fieldKey ? { ...i, visible: !i.visible } : i));
    };

    const setGroupAll = (corner: CornerKey, visible: boolean) => {
        const items = config.corners[corner];
        setCorner(corner, items.map(i => ({ ...i, visible })));
    };

    return (
        <div className="flex-1 min-h-0 bg-white rounded-3xl border border-[#DDEAF8] shadow-sm overflow-y-auto custom-scrollbar">
            {CORNERS.map((corner, idx) => {
                const items = config.corners[corner.id];
                const visibleCount = items.filter(i => i.visible).length;
                const allVisible = visibleCount === items.length;
                const noneVisible = visibleCount === 0;

                return (
                    <section
                        key={corner.id}
                        className={`px-6 py-4 ${idx > 0 ? "border-t border-[#F0F4F8]" : ""}`}
                    >
                        {/* Section header */}
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <span
                                    className="w-1 h-5 rounded-full shrink-0"
                                    style={{ backgroundColor: corner.accent }}
                                />
                                <div className="flex items-baseline gap-2 min-w-0">
                                    <span className="text-[14px] font-black text-[#1A2332] tracking-tight">
                                        {t(corner.labelKey)}
                                    </span>
                                    <span className="text-[12px] font-bold text-[#64748B]">
                                        {t(corner.hintKey)}
                                    </span>
                                    <span className="text-[10px] font-black text-[#94A3B8] uppercase tracking-wider ml-1">
                                        {visibleCount}/{items.length}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setGroupAll(corner.id, noneVisible ? true : !allVisible)}
                                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] transition-colors"
                            >
                                {allVisible ? <EyeOff size={11} strokeWidth={2.5} /> : <Eye size={11} strokeWidth={2.5} />}
                                {allVisible ? t("service.corner.closeAll") : t("service.corner.openAll")}
                            </button>
                        </div>

                        {/* Field rows */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            {items.map(item => (
                                <label
                                    key={item.key}
                                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                                        item.visible
                                            ? "bg-[#F8FAFC] hover:bg-[#F1F5F9]"
                                            : "opacity-50 hover:opacity-80 hover:bg-[#F8FAFC]"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={item.visible}
                                        onChange={() => toggleField(corner.id, item.key)}
                                        className="w-4 h-4 rounded accent-[#3B82F6] cursor-pointer shrink-0"
                                    />
                                    <div className="flex-1 min-w-0 flex flex-col">
                                        <span className="text-[12px] font-black text-[#334155] truncate leading-tight">
                                            {getCornerFieldLabel(item.key, item.label, t)}
                                        </span>
                                        <span
                                            className="text-[10px] text-[#94A3B8] truncate leading-tight"
                                            style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}
                                        >
                                            {CORNER_FIELD_EXAMPLES[item.key] ?? "—"}
                                        </span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
