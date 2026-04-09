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
import { Eye, EyeOff, Trash2, GripVertical, Plus, MousePointer2 } from "lucide-react";
import type { CornerItem } from "../../../lib/cornerConfig";

interface SortableItemProps {
    id: string;
    item: CornerItem;
    onRemove: () => void;
    onToggle: () => void;
}

function SortableItem({ id, item, onRemove, onToggle }: SortableItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.6 : 1,
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style}
            className={`flex items-center gap-3 px-4 py-4 bg-white rounded-3xl border-2 transition-all ${
                isDragging ? "border-[#3B82F6] shadow-xl" : "border-[#F1F5F9] hover:border-[#3B82F6]/20"
            }`}
        >
            <div 
                {...attributes} 
                {...listeners} 
                className="p-2 text-[#94A3B8] cursor-grab active:cursor-grabbing hover:bg-gray-100 rounded-xl touch-none"
            >
                <GripVertical size={20} strokeWidth={2.5} />
            </div>
            
            <div className="flex-1 flex flex-col">
                <span className="text-[15px] font-black text-[#334155] leading-tight">{item.label}</span>
                <span className="text-[10px] text-[#94A3B8] font-mono tracking-widest uppercase">{item.key}</span>
            </div>
            
            <div className="flex items-center gap-2">
                <button 
                    onClick={onToggle} 
                    className={`p-3 rounded-2xl transition-all shadow-sm ${
                        item.visible 
                            ? "bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981] hover:text-white" 
                            : "bg-[#94A3B8]/10 text-[#94A3B8] hover:bg-[#64748B] hover:text-white"
                    }`}
                >
                    {item.visible ? <Eye size={18} strokeWidth={2.5} /> : <EyeOff size={18} strokeWidth={2.5} />}
                </button>
                <button 
                    onClick={onRemove} 
                    className="p-3 bg-[#EF4444]/10 text-[#EF4444] rounded-2xl hover:bg-[#EF4444] hover:text-white transition-all shadow-sm"
                >
                    <Trash2 size={18} strokeWidth={2.5} />
                </button>
            </div>
        </div>
    );
}

interface CornerQuadrantProps {
    title: string;
    items: CornerItem[];
    onUpdate: (items: CornerItem[]) => void;
    onAddItem: () => void;
}

function CornerQuadrant({ title, items, onUpdate, onAddItem }: CornerQuadrantProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex((i) => i.key === active.id);
            const newIndex = items.findIndex((i) => i.key === over.id);
            onUpdate(arrayMove(items, oldIndex, newIndex));
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-[32px] overflow-hidden border border-[#DDEAF8] shadow-sm">
            <div className="px-8 py-5 bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-[12px] font-black text-[#475569] uppercase tracking-[0.2em]">{title}</span>
                    <span className="text-[11px] text-[#94A3B8] font-bold mt-0.5">该区域包含 {items.length} 个配置项</span>
                </div>
                <button 
                  onClick={onAddItem}
                  className="flex items-center gap-2.5 px-6 py-2.5 bg-[#3B82F6] text-white rounded-2xl hover:bg-[#2563EB] transition-all active:scale-95 shadow-xl shadow-blue-500/20"
                >
                    <Plus size={18} strokeWidth={3} />
                    <span className="text-[13px] font-black">添加字段</span>
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-3 custom-scrollbar">
                {items.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-[#94A3B8] gap-4 border-4 border-dashed border-[#F1F5F9] rounded-[32px] bg-[#F8FAFC]/50">
                        <div className="w-16 h-16 rounded-full bg-white border border-[#DDEAF8] flex items-center justify-center shadow-sm">
                            <Plus size={32} strokeWidth={1.5} className="opacity-30" />
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[14px] font-black text-[#546E7A] uppercase tracking-widest">象限内容为空</span>
                            <span className="text-[11px] font-bold mt-1 opacity-60">点击上方按钮开始配置字段</span>
                        </div>
                    </div>
                ) : (
                    <DndContext 
                        sensors={sensors} 
                        collisionDetection={closestCenter} 
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext 
                            items={items.map((i) => i.key)} 
                            strategy={verticalListSortingStrategy}
                        >
                            {items.map((item, idx) => (
                                <SortableItem 
                                    key={item.key} 
                                    id={item.key} 
                                    item={item} 
                                    onToggle={() => {
                                        const next = [...items];
                                        next[idx] = { ...next[idx], visible: !next[idx].visible };
                                        onUpdate(next);
                                    }}
                                    onRemove={() => onUpdate(items.filter((_, i) => i !== idx))}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
            </div>
        </div>
    );
}

interface CornerEditorProps {
    config: any;
    onUpdate: (config: any) => void;
    onStartAdding: (quadrant: string) => void;
}

const TABS = [
    { id: "topLeft", label: "左上 (Top Left)", icon: "↖️" },
    { id: "topRight", label: "右上 (Top Right)", icon: "↗️" },
    { id: "bottomLeft", label: "左下 (Bottom Left)", icon: "↙️" },
    { id: "bottomRight", label: "右下 (Bottom Right)", icon: "↘️" },
];

export default function CornerEditor({ config, onUpdate, onStartAdding }: CornerEditorProps) {
    const [activeTab, setActiveTab] = useState("topLeft");

    const handleQuadrantUpdate = (qKey: string, items: CornerItem[]) => {
        onUpdate({
            ...config,
            corners: {
                ...config.corners,
                [qKey]: items
            }
        });
    };

    return (
        <div className="flex flex-col h-full gap-5">
            {/* Tab Rail */}
            <div className="bg-white p-2 rounded-[24px] border border-[#DDEAF8] shadow-sm flex items-center gap-1">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-[18px] transition-all ${
                            activeTab === tab.id 
                                ? "bg-[#3B82F6] text-white shadow-lg shadow-blue-500/20 font-black" 
                                : "text-[#64748B] hover:bg-[#F8FAFC] font-bold"
                        }`}
                    >
                        <span className="text-[16px]">{tab.icon}</span>
                        <span className="text-[13px] tracking-tight">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Single Column Content */}
            <div className="flex-1 min-h-0">
                {activeTab === "topLeft" && (
                    <CornerQuadrant 
                        title="Top Left / 左上采集区" 
                        items={config.corners.topLeft} 
                        onUpdate={(items) => handleQuadrantUpdate("topLeft", items)}
                        onAddItem={() => onStartAdding("topLeft")}
                    />
                )}
                {activeTab === "topRight" && (
                    <CornerQuadrant 
                        title="Top Right / 右上采集区" 
                        items={config.corners.topRight} 
                        onUpdate={(items) => handleQuadrantUpdate("topRight", items)}
                        onAddItem={() => onStartAdding("topRight")}
                    />
                )}
                {activeTab === "bottomLeft" && (
                    <CornerQuadrant 
                        title="Bottom Left / 左下采集区" 
                        items={config.corners.bottomLeft} 
                        onUpdate={(items) => handleQuadrantUpdate("bottomLeft", items)}
                        onAddItem={() => onStartAdding("bottomLeft")}
                    />
                )}
                {activeTab === "bottomRight" && (
                    <CornerQuadrant 
                        title="Bottom Right / 右下采集区" 
                        items={config.corners.bottomRight} 
                        onUpdate={(items) => handleQuadrantUpdate("bottomRight", items)}
                        onAddItem={() => onStartAdding("bottomRight")}
                    />
                )}
            </div>
            
            <div className="px-4 py-2 flex items-center gap-2 text-[#94A3B8]">
                <MousePointer2 size={12} />
                <span className="text-[10px] font-black uppercase tracking-widest">提示：拖拽手柄可快速调整字段在图像上的叠加显示顺序</span>
            </div>
        </div>
    );
}
