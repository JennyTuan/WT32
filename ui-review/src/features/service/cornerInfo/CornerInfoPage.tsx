import { useEffect, useState, useRef } from "react";
import { CheckCircle2, AlertCircle, Save, RotateCcw } from "lucide-react";
import ServiceModeShell from "../shared/ServiceModeShell";
import CornerEditor from "./CornerEditor";
import CornerPreview from "./CornerPreview";
import {
    fetchCornerConfig,
    saveCornerConfig,
    resetCornerConfig,
    normalizeCornerConfig
} from "../../../lib/cornerConfig";
import type { CornerConfigData } from "../../../lib/cornerConfig";

export default function CornerInfoPage() {
    const [config, setConfig] = useState<CornerConfigData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const initialConfigRef = useRef<CornerConfigData | null>(null);

    useEffect(() => { loadConfig(); }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const apiConfig = await fetchCornerConfig();
            const parsed = normalizeCornerConfig(JSON.parse(apiConfig.config_json));
            setConfig(parsed);
            initialConfigRef.current = parsed;
            setIsDirty(false);
        } catch(err) {
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
        } catch {
            showToast("保存失败，请稍后重试", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleResetAll = async () => {
        if (!window.confirm("确定要恢复到出厂默认配置吗？当前修改将丢失。")) return;
        setLoading(true);
        try {
            const apiConfig = await resetCornerConfig();
            const parsed = normalizeCornerConfig(JSON.parse(apiConfig.config_json));
            setConfig(parsed);
            initialConfigRef.current = parsed;
            setIsDirty(false);
            showToast("已恢复默认配置", "success");
        } catch {
            showToast("恢复默认失败", "error");
        } finally {
            setLoading(false);
        }
    };

    const showToast = (msg: string, type: "success" | "error") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    return (
        <ServiceModeShell currentRoute="/service/settings/corner-info">
            <div className="flex flex-col h-full bg-[#EEF2F9]">
                {/* Main Layout */}
                <div className="flex-1 flex gap-6 min-h-0 overflow-hidden pt-2 pb-8 pl-6 pr-2">
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
                            />
                        ) : null}
                    </div>

                    {/* Right: Preview + bottom-right actions */}
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
                        <div className="shrink-0 flex items-center justify-end gap-3 pt-2 px-2">
                            {isDirty && (
                                <span className="flex items-center gap-1.5 text-[12px] font-black text-[#EF4444]">
                                    <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
                                    未保存
                                </span>
                            )}
                            <button
                                onClick={handleResetAll}
                                className="flex items-center gap-1.5 px-4 py-2 border border-[#E2E8F0] bg-white text-[#64748B] rounded-xl font-black text-[12px] hover:bg-[#F8FAFC] active:scale-95 transition-all"
                            >
                                <RotateCcw size={12} strokeWidth={2.5} />
                                恢复默认
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !isDirty}
                                className="flex items-center gap-2 px-5 py-2 bg-[#3B82F6] text-white rounded-xl font-black text-[13px] hover:bg-[#2563EB] active:scale-95 transition-all disabled:opacity-50 shadow-sm shadow-blue-500/20"
                            >
                                <Save size={14} strokeWidth={2.5} />
                                {saving ? "保存中..." : "保存"}
                            </button>
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
            </div>
        </ServiceModeShell>
    );
}
