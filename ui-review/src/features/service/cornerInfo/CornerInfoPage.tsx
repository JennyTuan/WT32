import { useEffect, useState, useRef } from "react";
import { Settings2, CheckCircle2, AlertCircle } from "lucide-react";
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
    const [isDirty, setIsDirty] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const [activeQuadrant, setActiveQuadrant] = useState<string | null>(null);
    const initialConfigRef = useRef<CornerConfigData | null>(null);

    useEffect(() => { loadConfig(); }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const apiConfig = await fetchCornerConfig();
            const parsed = JSON.parse(apiConfig.config_json);
            setConfig(parsed);
            initialConfigRef.current = parsed;
            setIsDirty(false);
        } catch (err) {
            console.error("Failed to load corner config", err);
            showToast("加载配置失败", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleConfigUpdate = (newConfig: CornerConfigData) => {
        setConfig(newConfig);
        setIsDirty(true);
    };

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        try {
            await saveCornerConfig(JSON.stringify(config));
            initialConfigRef.current = config;
            setIsDirty(false);
            showToast("配置已成功保存", "success");
        } catch (err) {
            showToast("保存失败，请稍后重试", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleResetCorner = (quadrant: string) => {
        if (!initialConfigRef.current || !config) return;
        const qKey = quadrant as keyof CornerConfigData["corners"];
        handleConfigUpdate({
            ...config,
            corners: {
                ...config.corners,
                [qKey]: initialConfigRef.current.corners[qKey]
            }
        });
        showToast("已恢复该角配置", "success");
    };

    const handleResetAll = async () => {
        if (!window.confirm("确定要恢复到出厂默认配置吗？当前修改将丢失。")) return;
        setLoading(true);
        try {
            const apiConfig = await resetCornerConfig();
            const parsed = JSON.parse(apiConfig.config_json);
            setConfig(parsed);
            initialConfigRef.current = parsed;
            setIsDirty(false);
            showToast("已恢复全部默认配置", "success");
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
        handleConfigUpdate({
            ...config,
            corners: {
                ...config.corners,
                [qKey]: [...config.corners[qKey], item]
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
                {/* Header */}
                <div className="flex items-center mb-5 bg-white px-6 py-4 rounded-3xl border border-[#DDEAF8] shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#3B82F6]/10 rounded-xl flex items-center justify-center text-[#3B82F6]">
                            <Settings2 size={20} strokeWidth={2.5} />
                        </div>
                        <h2 className="text-[20px] font-black text-[#1A2332] tracking-tighter">
                            四角信息叠加配置
                        </h2>
                    </div>
                </div>

                {/* Main Layout */}
                <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
                    {/* Left: Editor */}
                    <div className="flex-[5] min-w-0 min-h-0 flex flex-col">
                        {loading ? (
                            <div className="flex-1 bg-white rounded-[32px] border border-[#DDEAF8] flex flex-col items-center justify-center text-[#94A3B8] gap-4 shadow-sm">
                                <div className="w-10 h-10 border-4 border-[#3B82F6]/20 border-t-[#3B82F6] rounded-full animate-spin" />
                                <span className="text-[13px] font-black uppercase tracking-widest opacity-50">Loading...</span>
                            </div>
                        ) : config ? (
                            <CornerEditor
                                config={config}
                                onUpdate={handleConfigUpdate}
                                onStartAdding={setActiveQuadrant}
                                onSave={handleSave}
                                onResetCorner={handleResetCorner}
                                onResetAll={handleResetAll}
                                saving={saving}
                                isDirty={isDirty}
                            />
                        ) : null}
                    </div>

                    {/* Right: Preview */}
                    <div className="flex-[5] min-w-0 min-h-0 flex flex-col gap-4">
                        <div className="flex items-center px-2">
                            <span className="text-[13px] font-black text-[#475569] uppercase tracking-[0.2em] flex items-center gap-2">
                                <div className="w-2 h-4 bg-[#10B981] rounded-full" />
                                实时预览
                            </span>
                        </div>
                        <div className="flex-1 min-h-0">
                            {config && <CornerPreview config={config} />}
                        </div>
                    </div>
                </div>

                {/* Toast */}
                {toast && (
                    <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-4 px-8 py-5 rounded-3xl shadow-2xl animate-in slide-in-from-bottom-6 duration-500 ${
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
