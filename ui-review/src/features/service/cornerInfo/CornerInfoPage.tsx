import { useEffect, useState } from "react";
import { Save, RotateCcw, Monitor, Settings2, CheckCircle2, AlertCircle } from "lucide-react";
import ServiceModeShell from "../shared/ServiceModeShell";
import CornerEditor from "./CornerEditor";
import CornerPreview from "./CornerPreview";
import FieldSelectorModal from "./FieldSelectorModal";
import { 
    fetchCornerConfig, 
    saveCornerConfig, 
    resetCornerConfig
} from "../../../lib/cornerConfig";
import type { 
    CornerConfigData,
    CornerItem
} from "../../../lib/cornerConfig";

export default function CornerInfoPage() {
    const [config, setConfig] = useState<CornerConfigData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const [activeQuadrant, setActiveQuadrant] = useState<string | null>(null);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const apiConfig = await fetchCornerConfig();
            setConfig(JSON.parse(apiConfig.config_json));
        } catch (err) {
            console.error("Failed to load corner config", err);
            showToast("加载配置失败", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        try {
            await saveCornerConfig(JSON.stringify(config));
            showToast("配置已成功保存", "success");
        } catch (err) {
            showToast("保存失败，请稍后重试", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!window.confirm("确定要恢复到出厂默认配置吗？当前修改将丢失。")) return;
        setLoading(true);
        try {
            const apiConfig = await resetCornerConfig();
            setConfig(JSON.parse(apiConfig.config_json));
            showToast("已恢复默认配置", "success");
        } catch (err) {
            showToast("恢复默认失败", "error");
        } finally {
            setLoading(false);
        }
    };

    const showToast = (msg: string, type: "success" | "error") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleAddField = (item: CornerItem) => {
        if (!config || !activeQuadrant) return;
        const qKey = activeQuadrant as keyof typeof config.corners;
        const nextItems = [...config.corners[qKey], item];
        setConfig({
            ...config,
            corners: {
                ...config.corners,
                [qKey]: nextItems
            }
        });
        setActiveQuadrant(null);
    };

    const getExistingKeysForActiveQuadrant = () => {
        if (!config || !activeQuadrant) return [];
        const qKey = activeQuadrant as keyof typeof config.corners;
        return config.corners[qKey].map(i => i.key);
    };

    return (
        <ServiceModeShell currentRoute="/service/settings/corner-info">
            <div className="flex flex-col h-full bg-[#EEF2F9]">
                {/* Header Section */}
                <div className="flex items-center justify-between mb-5 bg-white p-6 rounded-3xl border border-[#DDEAF8] shadow-sm">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#3B82F6]/10 rounded-2xl flex items-center justify-center text-[#3B82F6]">
                                <Settings2 size={24} strokeWidth={2.5} />
                            </div>
                            <h2 className="text-[22px] font-black text-[#1A2332] tracking-tighter">
                                 四角信息叠加配置
                            </h2>
                        </div>
                        <p className="text-[12px] text-[#64748B] font-bold ml-13 flex items-center gap-2">
                           IMAGE OVERLAY CONFIGURATION <span className="w-1 h-1 bg-[#CBD5E1] rounded-full" /> 图像参数实时显示管理
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleReset}
                            disabled={loading || saving}
                            className="flex items-center gap-2 h-12 px-6 rounded-2xl bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#334155] transition-all font-black text-[13px] disabled:opacity-50 active:scale-95"
                        >
                            <RotateCcw size={18} strokeWidth={2.5} />
                            恢复出厂默认
                        </button>
                        <button 
                            onClick={handleSave}
                            disabled={loading || saving}
                            className={`flex items-center gap-2 h-12 px-8 rounded-2xl bg-[#3B82F6] text-white shadow-xl shadow-blue-500/30 hover:bg-[#2563EB] hover:scale-[1.02] active:scale-95 transition-all font-black text-[14px] disabled:opacity-50`}
                        >
                            <Save size={18} strokeWidth={2.5} />
                            {saving ? "正在保存..." : "保存当前配置"}
                        </button>
                    </div>
                </div>

                {/* Grid Layout Container */}
                <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
                    {/* Left: Editor Grid (50%) */}
                    <div className="flex-[5] flex flex-col gap-4 min-w-0">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-2.5">
                                <span className="text-[13px] font-black text-[#475569] uppercase tracking-[0.2em] flex items-center gap-2">
                                    <div className="w-2 h-4 bg-[#3B82F6] rounded-full" />
                                    布局编辑器 (Configuration)
                                </span>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0">
                            {loading ? (
                                <div className="h-full bg-white rounded-[32px] border border-[#DDEAF8] flex flex-col items-center justify-center text-[#94A3B8] gap-4 shadow-sm">
                                    <div className="w-10 h-10 border-4 border-[#3B82F6]/20 border-t-[#3B82F6] rounded-full animate-spin" />
                                    <span className="text-[14px] font-black uppercase tracking-widest opacity-60">Loading Records...</span>
                                </div>
                            ) : config ? (
                                <CornerEditor 
                                    config={config} 
                                    onUpdate={setConfig} 
                                    onStartAdding={setActiveQuadrant}
                                />
                            ) : null}
                        </div>
                    </div>

                    {/* Right: Preview (50%) */}
                    <div className="flex-[5] flex flex-col gap-4 min-w-0">
                        <div className="flex items-center justify-between px-2">
                            <span className="text-[13px] font-black text-[#475569] uppercase tracking-[0.2em] flex items-center gap-2">
                                <div className="w-2 h-4 bg-[#10B981] rounded-full" />
                                实时预览效果 (Live Preview)
                            </span>
                        </div>
                        <div className="flex-1 min-h-0 flex flex-col">
                            {config && <CornerPreview config={config} />}
                        </div>
                    </div>
                </div>

                {/* Toast Notification */}
                {toast && (
                    <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-4 px-8 py-5 rounded-3xl shadow-2xl animate-in slide-in-from-bottom-6 duration-500 scale-110 ${
                        toast.type === "success" ? "bg-[#10B981] text-white" : "bg-[#EF4444] text-white"
                    }`}>
                        {toast.type === "success" ? <CheckCircle2 size={24} strokeWidth={2.5} /> : <AlertCircle size={24} strokeWidth={2.5} />}
                        <span className="text-[16px] font-black tracking-tight">{toast.msg}</span>
                    </div>
                )}

                {/* Field Selector Modal */}
                {activeQuadrant && (
                    <FieldSelectorModal 
                        onClose={() => setActiveQuadrant(null)}
                        onSelect={handleAddField}
                        existingKeys={getExistingKeysForActiveQuadrant()}
                    />
                )}
            </div>
        </ServiceModeShell>
    );
}
