import { useState } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    TouchSensor
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignJustify, Plus, Trash2, Save, RotateCcw } from "lucide-react";
import type { CornerItem, CornerConfigData } from "../../../lib/cornerConfig";

const EXAMPLE_VALUES: Record<string, string> = {
    patient_name: "张三",
    patient_id: "20240101",
    patient_gender: "M",
    patient_age: "45Y",
    scan_time: "08:30",
    protocol_name: "头部平扫",
    kv: "120kV",
    ma: "200mA",
    series_number: "001",
    image_number: "128",
    slice_thickness: "5.0mm",
    increment: "5.0mm",
    kernel: "STANDARD",
    window_width: "400",
    window_level: "40",
    recon_fov: "350mm",
    institution_name: "XX医院",
    device_model: "CT-2000",
};

type CornerKey = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

function getCornerDesc(items: CornerItem[]): string {
    if (items.length === 0) return "暂无配置";
    const hasPatient = items.some(i => ["patient_name","patient_id","patient_gender","patient_age"].includes(i.key));
    const hasDevice  = items.some(i => ["institution_name","device_model","scan_time"].includes(i.key));
    const hasScan    = items.some(i => ["kv","ma","protocol_name"].includes(i.key));
    const hasWindow  = items.some(i => ["window_width","window_level"].includes(i.key));
    const hasImage   = items.some(i => ["series_number","image_number","slice_thickness","recon_fov","kernel","increment"].includes(i.key));
    const parts: string[] = [];
    if (hasPatient) parts.push("患者身份信息");
    if (hasDevice)  parts.push("机构与检查时间");
    if (hasScan)    parts.push("采集参数");
    if (hasWindow)  parts.push("窗宽窗位 / HU");
    if (hasImage && !hasWindow) parts.push("图像信息");
    return parts.slice(0, 2).join(" / ") || items.slice(0, 2).map(i => i.label).join(" · ");
}

const CORNERS = [
    { id: "topLeft",     label: "左上角" },
    { id: "topRight",    label: "右上角" },
    { id: "bottomLeft",  label: "左下角" },
    { id: "bottomRight", label: "右下角" },
] as const;

function SortableFieldItem({ id, item, onToggle, onRemove, showExample }: {
    id: string;
    item: CornerItem;
    onToggle: () => void;
    onRemove: () => void;
    showExample: boolean;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border transition-all group ${
                isDragging ? "border-[#3B82F6] shadow-lg" : "border-[#F0F4F8] hover:border-[#DBEAFE]"
            }`}
        >
            <div
                {...attributes}
                {...listeners}
                className="p-1 text-[#C8D6E5] cursor-grab active:cursor-grabbing hover:text-[#94A3B8] touch-none shrink-0"
            >
                <AlignJustify size={16} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
                <span className="text-[13px] font-black text-[#334155] block leading-snug">{item.label}</span>
                {showExample && (
                    <span className="text-[11px] text-[#94A3B8] leading-tight block">
                        示例：{EXAMPLE_VALUES[item.key] ?? "—"}
                    </span>
                )}
            </div>
            <button
                onClick={onToggle}
                className={`px-3 py-1 rounded-lg text-[11px] font-black transition-all shrink-0 ${
                    item.visible
                        ? "bg-[#DCFCE7] text-[#16A34A] hover:bg-[#BBF7D0]"
                        : "bg-[#F1F5F9] text-[#94A3B8] hover:bg-[#E2E8F0]"
                }`}
            >
                {item.visible ? "已启用" : "已禁用"}
            </button>
            <button
                onClick={onRemove}
                className="p-1 text-transparent group-hover:text-[#EF4444] transition-colors shrink-0"
            >
                <Trash2 size={13} strokeWidth={2.5} />
            </button>
        </div>
    );
}

interface CornerEditorProps {
    config: CornerConfigData;
    onUpdate: (config: CornerConfigData) => void;
    onStartAdding: (quadrant: string) => void;
    onSave: () => void;
    onResetCorner: (quadrant: string) => void;
    onResetAll: () => void;
    saving: boolean;
    isDirty: boolean;
}

export default function CornerEditor({
    config, onUpdate, onStartAdding, onSave, onResetCorner, onResetAll, saving, isDirty
}: CornerEditorProps) {
    const [activeCorner, setActiveCorner] = useState<CornerKey>("topLeft");
    const [showExamples, setShowExamples] = useState(true);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const activeItems: CornerItem[] = config.corners[activeCorner] ?? [];
    const activeLabel = CORNERS.find(c => c.id === activeCorner)?.label ?? "";

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIdx = activeItems.findIndex(i => i.key === active.id);
            const newIdx = activeItems.findIndex(i => i.key === over.id);
            updateCorner(arrayMove(activeItems, oldIdx, newIdx));
        }
    };

    const updateCorner = (items: CornerItem[]) => {
        onUpdate({ ...config, corners: { ...config.corners, [activeCorner]: items } });
    };

    return (
        <div className="flex flex-col h-full gap-3">
            {/* 2×2 Corner Overview Cards */}
            <div className="grid grid-cols-2 gap-2.5 shrink-0">
                {CORNERS.map(corner => {
                    const items: CornerItem[] = config.corners[corner.id] ?? [];
                    const isActive = activeCorner === corner.id;
                    return (
                        <button
                            key={corner.id}
                            onClick={() => setActiveCorner(corner.id)}
                            className={`text-left rounded-2xl px-4 py-3 border-2 transition-all ${
                                isActive
                                    ? "bg-[#EFF6FF] border-[#3B82F6] shadow-sm"
                                    : "bg-white border-[#E8F0FB] hover:border-[#BFDBFE]"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className={`text-[13px] font-black ${isActive ? "text-[#1D4ED8]" : "text-[#334155]"}`}>
                                    {corner.label}
                                </span>
                                <span className={`text-[12px] font-bold ${isActive ? "text-[#3B82F6]" : "text-[#94A3B8]"}`}>
                                    {items.length} 项
                                </span>
                            </div>
                            <span className={`text-[11px] leading-snug block truncate ${isActive ? "text-[#3B82F6]/70" : "text-[#94A3B8]"}`}>
                                {getCornerDesc(items)}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Actions */}
            <div className="shrink-0 bg-white rounded-2xl border border-[#E8F0FB] px-4 py-3 flex flex-col gap-2.5">
                {/* Save row */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onSave}
                        disabled={saving || !isDirty}
                        className="flex items-center gap-2 px-5 py-2 bg-[#3B82F6] text-white rounded-xl font-black text-[13px] hover:bg-[#2563EB] active:scale-95 transition-all disabled:opacity-50 shadow-sm shadow-blue-500/20"
                    >
                        <Save size={14} strokeWidth={2.5} />
                        {saving ? "保存中..." : "保存"}
                    </button>
                    {isDirty && (
                        <span className="flex items-center gap-1.5 text-[12px] font-black text-[#EF4444]">
                            <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
                            未保存
                        </span>
                    )}
                </div>

                {/* Reset row */}
                <div className="flex gap-2">
                    <button
                        onClick={() => onResetCorner(activeCorner)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#3B82F6]/10 text-[#3B82F6] rounded-xl font-black text-[12px] hover:bg-[#3B82F6]/20 active:scale-95 transition-all"
                    >
                        <RotateCcw size={12} strokeWidth={2.5} />
                        恢复当前角默认
                    </button>
                    <button
                        onClick={onResetAll}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-[#E2E8F0] text-[#64748B] rounded-xl font-black text-[12px] hover:bg-[#F8FAFC] active:scale-95 transition-all"
                    >
                        <RotateCcw size={12} strokeWidth={2.5} />
                        恢复全部默认
                    </button>
                </div>

                {/* Examples toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                    <input
                        type="checkbox"
                        checked={showExamples}
                        onChange={e => setShowExamples(e.target.checked)}
                        className="w-4 h-4 rounded accent-[#3B82F6] cursor-pointer"
                    />
                    <span className="text-[12px] font-bold text-[#64748B]">显示示例</span>
                </label>
            </div>

            {/* Field List */}
            <div className="flex-1 min-h-0 bg-white rounded-[20px] border border-[#E8F0FB] overflow-hidden flex flex-col">
                {/* List header */}
                <div className="px-4 py-3 border-b border-[#F0F4F8] shrink-0 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <span className="text-[12px] font-black text-[#334155] block truncate">
                            {activeLabel} · {getCornerDesc(activeItems)}
                        </span>
                        <span className="text-[10px] text-[#B0BEC5] font-bold mt-0.5 block">
                            勾选=显示 · 长按手柄拖拽排序
                        </span>
                    </div>
                    <button
                        onClick={() => onStartAdding(activeCorner)}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-[#3B82F6] text-white rounded-lg text-[12px] font-black hover:bg-[#2563EB] active:scale-95 transition-all shadow-sm"
                    >
                        <Plus size={13} strokeWidth={3} />
                        添加
                    </button>
                </div>

                {/* Scrollable list */}
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
                    {activeItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 text-[#94A3B8] py-10">
                            <div className="w-10 h-10 rounded-full bg-[#F8FAFC] border border-[#E8F0FB] flex items-center justify-center">
                                <Plus size={18} strokeWidth={1.5} className="opacity-40" />
                            </div>
                            <span className="text-[12px] font-bold">暂无字段，点击添加</span>
                        </div>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={activeItems.map(i => i.key)}
                                strategy={verticalListSortingStrategy}
                            >
                                {activeItems.map((item, idx) => (
                                    <SortableFieldItem
                                        key={item.key}
                                        id={item.key}
                                        item={item}
                                        showExample={showExamples}
                                        onToggle={() => {
                                            const next = [...activeItems];
                                            next[idx] = { ...next[idx], visible: !next[idx].visible };
                                            updateCorner(next);
                                        }}
                                        onRemove={() => updateCorner(activeItems.filter((_, i) => i !== idx))}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
            </div>
        </div>
    );
}
