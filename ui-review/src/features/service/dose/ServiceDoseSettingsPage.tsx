import { useState } from "react";
import { CheckCircle2, Info, RotateCcw, Save } from "lucide-react";
import ServiceModeShell from "../shared/ServiceModeShell";

type DomStrength = "low" | "medium" | "high";

type DoseSettings = {
    domEnabled: boolean;
    defaultStrength: DomStrength;
    childProtocolRecommend: boolean;
    requireConfirm: boolean;
    allowUserOverride: boolean;
    showDoseEstimate: boolean;
    requireAuditLog: boolean;
    defaultBodyParts: string[];
};

const DEFAULT_SETTINGS: DoseSettings = {
    domEnabled: true,
    defaultStrength: "medium",
    childProtocolRecommend: true,
    requireConfirm: true,
    allowUserOverride: true,
    showDoseEstimate: true,
    requireAuditLog: false,
    defaultBodyParts: ["CHEST", "HEAD", "NECK", "PELVIS"],
};

const STORAGE_KEY = "wt32_dose_settings";

const BODY_PARTS = [
    { value: "CHEST", label: "胸部" },
    { value: "HEAD", label: "头颅" },
    { value: "NECK", label: "颈部" },
    { value: "PELVIS", label: "盆腔" },
    { value: "ABDOMEN", label: "腹部" },
    { value: "SPINE", label: "脊柱" },
];

const STRENGTH_OPTIONS: { value: DomStrength; label: string; desc: string }[] = [
    { value: "low", label: "低", desc: "剂量降低约 8%，图像质量影响最小" },
    { value: "medium", label: "中", desc: "剂量降低约 15%，轻度噪声增加" },
    { value: "high", label: "高", desc: "剂量降低约 25%，局部噪声明显" },
];

const loadSettings = (): DoseSettings => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DoseSettings>) };
    } catch {
        // ignore
    }
    return { ...DEFAULT_SETTINGS };
};

const Toggle = ({
    checked,
    onChange,
    disabled,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) => (
    <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            checked ? "bg-[#2563EB]" : "bg-[#CBD5E1]"
        } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
        <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                checked ? "translate-x-6" : "translate-x-1"
            }`}
        />
    </button>
);

export default function ServiceDoseSettingsPage() {
    const [settings, setSettings] = useState<DoseSettings>(loadSettings);
    const [saved, setSaved] = useState(false);

    const update = <K extends keyof DoseSettings>(key: K, value: DoseSettings[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        setSaved(false);
    };

    const toggleBodyPart = (part: string) => {
        setSettings((prev) => {
            const next = prev.defaultBodyParts.includes(part)
                ? prev.defaultBodyParts.filter((p) => p !== part)
                : [...prev.defaultBodyParts, part];
            return { ...prev, defaultBodyParts: next };
        });
        setSaved(false);
    };

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        setSaved(true);
    };

    const handleReset = () => {
        setSettings({ ...DEFAULT_SETTINGS });
        setSaved(false);
    };

    return (
        <ServiceModeShell currentRoute="/service/dose/settings" footerStatus={{ label: "IDLE", tone: "idle" }}>
            <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 custom-scrollbar">

                {/* 页面标题行 — 无独立卡片，直接与内容贴合 */}
                <div className="flex items-start justify-between">
                    <div>
                        <div className="text-[16px] font-black text-[#1E293B]">DOM 剂量策略设置</div>
                        <div className="mt-0.5 text-[12px] text-[#94A3B8]">系统级器官剂量保护策略，影响所有协议和扫描会话</div>
                    </div>
                    <div className="flex items-center gap-3">
                        {saved && (
                            <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#16A34A]">
                                <CheckCircle2 size={14} /> 已保存
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={handleReset}
                            className="flex items-center gap-1.5 rounded-md border border-[#D1D5DB] bg-white px-4 py-2 text-[13px] font-bold text-[#4F6479] hover:bg-gray-50 active:scale-95 transition-all"
                        >
                            <RotateCcw size={14} /> 恢复默认
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            className="flex items-center gap-1.5 rounded-md bg-[#1D4ED8] px-5 py-2 text-[13px] font-bold text-white hover:bg-[#1e40af] active:scale-95 transition-all"
                        >
                            <Save size={14} /> 保存设置
                        </button>
                    </div>
                </div>

                {/* 统一设置卡片 — 所有章节在同一卡内，用分隔线区分 */}
                <div className="rounded-md border border-[#B0C4DE] bg-white shadow-sm">

                    {/* ── 基础配置 ── */}
                    <SectionLabel>基础配置</SectionLabel>
                    <div className="divide-y divide-[#F1F5F9]">
                        <SettingRow
                            label="启用 DOM 器官剂量保护"
                            desc="全局开关，关闭后所有协议的 DOM 功能均不可用"
                        >
                            <Toggle checked={settings.domEnabled} onChange={(v) => update("domEnabled", v)} />
                        </SettingRow>
                        <SettingRow
                            label="强制扫描前二次确认"
                            desc="启用 DOM 时，扫描前必须弹窗确认风险"
                            disabled={!settings.domEnabled}
                        >
                            <Toggle
                                checked={settings.requireConfirm}
                                onChange={(v) => update("requireConfirm", v)}
                                disabled={!settings.domEnabled}
                            />
                        </SettingRow>
                        <SettingRow
                            label="允许技师覆盖协议默认值"
                            desc="技师可在本次扫描中临时修改协议模板的 DOM 配置"
                            disabled={!settings.domEnabled}
                        >
                            <Toggle
                                checked={settings.allowUserOverride}
                                onChange={(v) => update("allowUserOverride", v)}
                                disabled={!settings.domEnabled}
                            />
                        </SettingRow>
                        <SettingRow
                            label="显示剂量预估变化"
                            desc="在扫描确认页展示 DOM 启用后的剂量变化百分比"
                            disabled={!settings.domEnabled}
                        >
                            <Toggle
                                checked={settings.showDoseEstimate}
                                onChange={(v) => update("showDoseEstimate", v)}
                                disabled={!settings.domEnabled}
                            />
                        </SettingRow>
                        <SettingRow
                            label="记录审计日志"
                            desc="将所有 DOM 确认操作写入剂量日志，用于合规追踪"
                            disabled={!settings.domEnabled}
                        >
                            <Toggle
                                checked={settings.requireAuditLog}
                                onChange={(v) => update("requireAuditLog", v)}
                                disabled={!settings.domEnabled}
                            />
                        </SettingRow>
                    </div>

                    <div className="border-t border-[#E2E8F0]" />

                    {/* ── 默认保护强度 ── */}
                    <SectionLabel>默认保护强度</SectionLabel>
                    <div className={`flex gap-4 px-5 pb-5 ${!settings.domEnabled ? "opacity-50 pointer-events-none" : ""}`}>
                        {STRENGTH_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => update("defaultStrength", opt.value)}
                                className={`flex-1 rounded-xl border-2 px-4 py-4 text-left transition-all ${
                                    settings.defaultStrength === opt.value
                                        ? "border-[#2563EB] bg-[#EFF6FF]"
                                        : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#93C5FD]"
                                }`}
                            >
                                <div className={`text-[18px] font-black ${settings.defaultStrength === opt.value ? "text-[#1D4ED8]" : "text-[#223547]"}`}>
                                    {opt.label}
                                </div>
                                <div className="mt-1 text-[12px] leading-5 text-[#64748B]">{opt.desc}</div>
                            </button>
                        ))}
                    </div>

                    <div className="border-t border-[#E2E8F0]" />

                    {/* ── 默认推荐部位 ── */}
                    <div className={!settings.domEnabled ? "opacity-50 pointer-events-none" : ""}>
                        <div className="flex items-center gap-2 px-5 pt-4 pb-2">
                            <div className="text-[11px] font-black text-[#94A3B8] uppercase tracking-wider">默认推荐部位</div>
                            <span className="flex items-center gap-1 text-[11px] text-[#CBD5E1]">
                                <Info size={11} /> 选中部位将在创建扫描时自动推荐 DOM
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-3 px-5 pb-5">
                            {BODY_PARTS.map((part) => {
                                const active = settings.defaultBodyParts.includes(part.value);
                                return (
                                    <button
                                        key={part.value}
                                        type="button"
                                        onClick={() => toggleBodyPart(part.value)}
                                        className={`rounded-full px-5 py-2 text-[13px] font-bold transition-all ${
                                            active
                                                ? "bg-[#2563EB] text-white shadow-sm"
                                                : "border border-[#D1D5DB] bg-white text-[#475569] hover:bg-gray-50"
                                        }`}
                                    >
                                        {part.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-t border-[#E2E8F0]" />

                    {/* ── 儿童 / 特殊人群 ── */}
                    <SectionLabel>儿童 / 特殊人群</SectionLabel>
                    <div className={!settings.domEnabled ? "opacity-50 pointer-events-none" : ""}>
                        <SettingRow
                            label="儿童协议默认推荐 DOM"
                            desc="age_group = child / infant 时自动推荐器官保护，且强度不可由技师任意输入"
                        >
                            <Toggle
                                checked={settings.childProtocolRecommend}
                                onChange={(v) => update("childProtocolRecommend", v)}
                            />
                        </SettingRow>
                    </div>
                </div>
            </section>
        </ServiceModeShell>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="px-5 pt-4 pb-2">
            <div className="text-[11px] font-black text-[#94A3B8] uppercase tracking-wider">{children}</div>
        </div>
    );
}

function SettingRow({
    label,
    desc,
    disabled,
    children,
}: {
    label: string;
    desc: string;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className={`flex items-center justify-between px-5 py-4 ${disabled ? "opacity-40" : ""}`}>
            <div>
                <div className="text-[14px] font-bold text-[#223547]">{label}</div>
                <div className="mt-0.5 text-[12px] text-[#7B92A8]">{desc}</div>
            </div>
            <div className="ml-6 shrink-0">{children}</div>
        </div>
    );
}
