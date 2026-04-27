import { useState, useEffect, useRef, useCallback } from "react";
import { Info, CircleDot, X, Shield, Zap, Settings, AlertTriangle } from "lucide-react";
import type { 
    ApiProtocolDetail, 
    ApiSeriesDetail, 
    BasicDraft, 
    SeriesDraft, 
    ReconDraft 
} from "../types";
import { AGE_LABEL, ALL_POSITIONS, SERIES_TYPE_LABEL, EDITABLE_SERIES_TYPE_OPTIONS } from "../constants";
import { FieldInput, FieldSelect, FieldSpinner, Divider } from "./SharedUI";
import {
    DOM_MODE_OPTIONS,
    type DomMode,
    type DomDirection,
    type DomStrength,
    type DomImageQualityPriority,
    type ApiProtocolDomConfig,
    type DomConfigUpdate,
    fetchProtocolDomConfig,
    updateProtocolDomConfig,
} from "../../../lib/scanSession";

const DOM_LABEL_TO_VALUE: Record<string, DomMode> = Object.fromEntries(
    DOM_MODE_OPTIONS.map((o) => [o.label, o.value]),
) as Record<string, DomMode>;
const DOM_VALUE_TO_LABEL: Record<string, string> = Object.fromEntries(
    DOM_MODE_OPTIONS.map((o) => [o.value, o.label]),
);
const DOM_OPTION_LABELS: string[] = DOM_MODE_OPTIONS.map((o) => o.label);

// ── body_part → recommended organ mapping ──
const BODY_PART_ORGAN_MAP: Record<string, DomMode> = {
    "胸部": "breast",
    "chest": "breast",
    "头部": "eye_lens",
    "head": "eye_lens",
    "脑部": "eye_lens",
    "brain": "eye_lens",
    "颈部": "thyroid",
    "neck": "thyroid",
    "盆腔": "gonad",
    "pelvis": "gonad",
    "腹部": "gonad",
    "abdomen": "gonad",
};

const recommendOrgan = (bodyPart: string | undefined | null): DomMode | null => {
    if (!bodyPart) return null;
    const key = bodyPart.trim().toLowerCase();
    for (const [pattern, organ] of Object.entries(BODY_PART_ORGAN_MAP)) {
        if (key.includes(pattern.toLowerCase())) return organ;
    }
    return null;
};

// ── DOM sub-option label maps ──
const DOM_ORGAN_OPTIONS: { value: DomMode; label: string }[] = [
    { value: "breast", label: "乳腺" },
    { value: "eye_lens", label: "晶状体" },
    { value: "thyroid", label: "甲状腺" },
    { value: "gonad", label: "性腺" },
    { value: "custom", label: "自定义" },
];

const DOM_DIRECTION_OPTIONS: { value: DomDirection; label: string }[] = [
    { value: "auto", label: "自动" },
    { value: "anterior", label: "前方 (Anterior)" },
    { value: "posterior", label: "后方 (Posterior)" },
    { value: "left", label: "左侧 (Left)" },
    { value: "right", label: "右侧 (Right)" },
];

const DOM_STRENGTH_OPTIONS: { value: DomStrength; label: string }[] = [
    { value: "low", label: "低 (Low)" },
    { value: "medium", label: "中 (Medium)" },
    { value: "high", label: "高 (High)" },
];

const DOM_QUALITY_OPTIONS: { value: DomImageQualityPriority; label: string }[] = [
    { value: "balanced", label: "均衡" },
    { value: "dose_saving", label: "优先降剂量" },
    { value: "image_quality", label: "优先图像质量" },
];

const DOSE_REDUCTION_EST: Record<DomStrength, number> = {
    low: 0.08,
    medium: 0.15,
    high: 0.25,
};

const toDomLabel = (raw: string | null | undefined): string => {
    if (!raw) return DOM_VALUE_TO_LABEL.off;
    if (raw in DOM_VALUE_TO_LABEL) return DOM_VALUE_TO_LABEL[raw];
    if (raw === "0") return DOM_VALUE_TO_LABEL.off;
    if (raw === "1") return DOM_VALUE_TO_LABEL.auto;
    return DOM_VALUE_TO_LABEL.off;
};

export function BasicInfoPanel({ protocol, draft, selectedPos, bodyPartOptions, ageGroupOptions, onPosChange, onDraftChange }: {
    protocol: ApiProtocolDetail | null;
    draft: BasicDraft;
    selectedPos: string;
    bodyPartOptions: string[];
    ageGroupOptions: BasicDraft["ageGroup"][];
    onPosChange: (pos: string) => void;
    onDraftChange: (patch: Partial<BasicDraft>) => void;
}) {
    const bodyPartValue = draft.bodyPart || protocol?.body_part || bodyPartOptions[0] || "";
    const ageValue = draft.ageGroup || protocol?.age_group || ageGroupOptions[0] || "adult";
    return (
        <>
            <div className="h-[44px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">协议基本信息 (Basic Info)</span>
                <Info size={16} className="text-[#4D94FF]" />
            </div>
            <div className="flex-1 px-8 py-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-6">
                    <FieldInput label="协议名称" value={draft.name} required onChange={(value) => onDraftChange({ name: value })} />
                    <FieldSelect label="部位" value={bodyPartValue} options={bodyPartOptions} required onChange={(value) => onDraftChange({ bodyPart: value })} />
                    <FieldInput label="体型范围" value={draft.patientWeight} onChange={(value) => onDraftChange({ patientWeight: value })} />
                    <FieldSelect
                        label="年龄"
                        value={AGE_LABEL[ageValue] ?? ageValue}
                        options={ageGroupOptions.map((option) => AGE_LABEL[option])}
                        required
                        onChange={(value) => {
                            const nextAge = (Object.entries(AGE_LABEL).find(([, label]) => label === value)?.[0] ?? "adult") as BasicDraft["ageGroup"];
                            onDraftChange({ ageGroup: nextAge });
                        }}
                    />
                </div>
                <div className="border-t border-[#EEF2F9] pt-5">
                    <h3 className="text-[12px] font-black text-[#37474F] uppercase tracking-wider flex items-center gap-0.5 mb-4 px-1">
                        扫描体位<span className="text-red-500 text-[14px] leading-none select-none">*</span>
                    </h3>
                    <div className="grid grid-cols-4 gap-4">
                        {ALL_POSITIONS.map((pos) => (
                            <button
                                key={pos.id}
                                onClick={() => {
                                    onPosChange(pos.id);
                                    onDraftChange({ patientPosition: pos.id });
                                }}
                                className={`relative flex flex-col items-center justify-center p-3 rounded-md border-2 transition-all h-[76px] shadow-sm ${selectedPos === pos.id
                                    ? "bg-white border-[#4D94FF] ring-2 ring-[#4D94FF]/10"
                                    : "bg-white border-[#B0C4DE]/40 hover:border-[#B0C4DE]"}`}
                            >
                                <span className={`text-[16px] font-black font-mono tracking-tighter ${selectedPos === pos.id ? "text-[#1E88E5]" : "text-[#B0C4DE]"}`}>{pos.id}</span>
                                <span className={`text-[10px] font-black mt-1 ${selectedPos === pos.id ? "text-[#4D94FF]" : "text-[#B0C4DE]"}`}>{pos.label}</span>
                                {selectedPos === pos.id && (
                                    <div className="absolute top-2 right-2"><CircleDot size={12} className="text-[#4D94FF]" /></div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}

export function ScoutParamsPanel({ draft, canEditMode, onModeChange, onDelete, onDraftChange }: {
    draft: SeriesDraft;
    canEditMode?: boolean;
    onModeChange?: (value: string) => void;
    onDelete?: () => void;
    onDraftChange: (patch: Partial<SeriesDraft>) => void;
}) {
    return (
        <>
            <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">定位像采集参数 (Scout Params)</span>
                <button onClick={onDelete} className="flex items-center gap-1.5 text-[#94A3B8] hover:text-[#D32F2F] transition-colors group">
                    <X size={14} className="opacity-70 group-hover:opacity-100" />
                    <span className="text-[11px] font-bold">删除该采集序列</span>
                </button>
            </div>
            <div className="flex-1 p-5 overflow-y-auto bg-white">
                <div className="bg-[#EEF6FF] border border-[#BFDBFE] rounded-md px-3 py-2 flex items-center gap-2.5 mb-4 shadow-sm">
                    <div className="w-5 h-5 rounded-full bg-[#4D94FF]/10 flex items-center justify-center shrink-0">
                        <Info size={12} className="text-[#4D94FF]" />
                    </div>
                    <p className="text-[10px] text-[#546E7A] leading-[1.5] font-medium">
                        定位像参数的修改只会保存到当前扫描会话，不会覆盖出厂协议模板。
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <FieldInput label="名称" value={draft.seriesLabel} onChange={(value) => onDraftChange({ seriesLabel: value })} />
                    <FieldSelect label="模式" value="定位像" options={EDITABLE_SERIES_TYPE_OPTIONS} onChange={canEditMode ? onModeChange : undefined} />
                    <Divider />
                    <FieldSelect label="KV" value={draft.kv} options={[draft.kv || "120", "100", "80"]} required onChange={(value) => onDraftChange({ kv: value })} />
                    <FieldInput label="MA" value={draft.ma} required onChange={(value) => onDraftChange({ ma: value })} />
                    <FieldSelect label="旋转时间 (S)" value="1" options={["1", "0.5", "1.5"]} required />
                    <FieldInput label="准直器" value={draft.collimator} placeholder="例如: 32x0.6" onChange={(value) => onDraftChange({ collimator: value })} />
                    <FieldInput label="扫描长度 (MM)" value={draft.scanLength} required onChange={(value) => onDraftChange({ scanLength: value })} />
                    <FieldSelect label="扫描方向" value={draft.scanDirection} options={["OUT", "IN"]} required onChange={(value) => onDraftChange({ scanDirection: value })} />
                    <FieldInput label="FOV" value={draft.fov} required onChange={(value) => onDraftChange({ fov: value })} />
                    <FieldSelect
                        label="DOM 器官剂量保护"
                        value={toDomLabel(draft.dom)}
                        options={DOM_OPTION_LABELS}
                        onChange={(label) => onDraftChange({ dom: DOM_LABEL_TO_VALUE[label] ?? "off" })}
                    />
                    <FieldInput label="床角度 (ANGLE)" value={draft.tubeAngle} required onChange={(value) => onDraftChange({ tubeAngle: value })} />
                </div>
            </div>
        </>
    );
}

export function HelicalParamsPanel({ series, draft, canEditMode, onModeChange, onDelete, onDraftChange, onSelectDose }: {
    series: ApiSeriesDetail;
    draft: SeriesDraft;
    canEditMode?: boolean;
    onModeChange?: (value: string) => void;
    onDelete?: () => void;
    onDraftChange: (patch: Partial<SeriesDraft>) => void;
    onSelectDose?: () => void;
}) {
    const typeLabel = SERIES_TYPE_LABEL[series.series_type]?.zh ?? series.series_type;
    const typeKey = series.series_type === "helical" ? "HELICAL PARAMS" : "AXIAL PARAMS";
    return (
        <>
            <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">
                    扫描采集：{draft.seriesLabel || series.series_label} ({typeKey})
                </span>
                <button onClick={onDelete} className="flex items-center gap-1.5 text-[#94A3B8] hover:text-[#D32F2F] transition-colors group">
                    <X size={14} className="opacity-70 group-hover:opacity-100" />
                    <span className="text-[11px] font-bold">删除该采集序列</span>
                </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto bg-white">
                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                    <FieldInput label="名称" value={draft.seriesLabel} onChange={(value) => onDraftChange({ seriesLabel: value })} />
                    <FieldSelect label="模式" value={typeLabel} options={EDITABLE_SERIES_TYPE_OPTIONS} onChange={canEditMode ? onModeChange : undefined} />
                    <Divider />
                    <FieldSelect label="KV" value={draft.kv} options={[draft.kv || "120", "100", "80"]} required onChange={(value) => onDraftChange({ kv: value })} />
                    <FieldInput label="MA" value={draft.ma} required onChange={(value) => onDraftChange({ ma: value })} />
                    <FieldSelect label="旋转时间 (S)" value={draft.rotationTime || "1"} options={[draft.rotationTime || "1", "0.5", "1.5"]} required onChange={(value) => onDraftChange({ rotationTime: value })} />
                    <FieldInput label="准直器" value={draft.collimator} placeholder="例如: 32x0.6" onChange={(value) => onDraftChange({ collimator: value })} />
                    <FieldInput label="扫描长度 (MM)" value={draft.scanLength} required onChange={(value) => onDraftChange({ scanLength: value })} />
                    <FieldSelect label="扫描方向" value={draft.scanDirection} options={["OUT", "IN"]} required onChange={(value) => onDraftChange({ scanDirection: value })} />
                    <FieldInput label="FOV" value={draft.fov} required onChange={(value) => onDraftChange({ fov: value })} />
                    <FieldSelect
                        label="DOM 器官剂量保护"
                        value={toDomLabel(draft.dom)}
                        options={DOM_OPTION_LABELS}
                        onChange={(label) => onDraftChange({ dom: DOM_LABEL_TO_VALUE[label] ?? "off" })}
                    />
                    {series.series_type === "helical" && (
                        <FieldInput label="PITCH" value={draft.pitch} required onChange={(value) => onDraftChange({ pitch: value })} />
                    )}
                    {series.series_type === "axial" && (
                        <FieldInput label="扫描增量 (MM)" value={draft.sliceInterval} required onChange={(value) => onDraftChange({ sliceInterval: value })} />
                    )}
                    <FieldInput label="层厚 (MM)" value={draft.sliceThickness} required onChange={(value) => onDraftChange({ sliceThickness: value })} />

                    {/* DOM 详细配置快捷入口 */}
                    <div className="col-span-2 mt-2">
                        <button
                            onClick={onSelectDose}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#EEF6FF] to-[#F0F4FF] border border-[#BFDBFE] rounded-lg text-[12px] font-bold text-[#1E88E5] hover:from-[#E3F2FD] hover:to-[#E8F0FE] hover:border-[#4D94FF]/40 transition-all shadow-sm group"
                        >
                            <Shield size={14} className="text-[#4D94FF] group-hover:scale-110 transition-transform" />
                            DOM 器官剂量保护 — 详细配置
                            <Settings size={12} className="ml-auto text-[#90A4AE] group-hover:text-[#4D94FF] transition-colors" />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

export function ReconParamsPanel({ series, draft, onDelete, onDraftChange }: {
    series: ApiSeriesDetail;
    draft: ReconDraft;
    onDelete?: () => void;
    onDraftChange: (patch: Partial<ReconDraft>) => void;
}) {
    return (
        <>
            <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0">
                <div className="flex flex-col justify-center">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">
                        所属采集：{series.series_label} / 重建系列：{draft.reconName}
                    </span>
                    <span className="text-[10px] text-[#94A3B8] font-bold">修改仅作用于本次扫描会话</span>
                </div>
                <button onClick={onDelete} className="flex items-center gap-1.5 text-[#94A3B8] hover:text-[#D32F2F] transition-colors group">
                    <X size={14} className="opacity-70 group-hover:opacity-100" />
                    <span className="text-[11px] font-bold">删除该重建序列</span>
                </button>
            </div>
            <div className="flex-1 p-8 overflow-y-auto bg-white">
                <div className="grid grid-cols-2 gap-x-12 gap-y-5">
                    <FieldInput label="系列名称" value={draft.reconName} onChange={(value) => onDraftChange({ reconName: value })} />
                    <FieldInput label="KERNEL" value={draft.kernel} onChange={(value) => onDraftChange({ kernel: value })} />
                    <FieldSpinner label="层厚 (MM)" value={draft.sliceThickness} onChange={(value) => onDraftChange({ sliceThickness: value })} />
                    <FieldSpinner label="重建增量 (MM)" value={draft.increment} onChange={(value) => onDraftChange({ increment: value })} />
                    <FieldSpinner label="重建 FOV (MM)" value={draft.reconFov} onChange={(value) => onDraftChange({ reconFov: value })} />
                    <FieldSpinner label="MATRIX" value={draft.matrix} onChange={(value) => onDraftChange({ matrix: value })} />
                    <FieldSpinner label="窗位 (WL)" value={draft.windowLevel} onChange={(value) => onDraftChange({ windowLevel: value })} />
                    <FieldSpinner label="窗宽 (WW)" value={draft.windowWidth} onChange={(value) => onDraftChange({ windowWidth: value })} />
                    <FieldSpinner label="中心 X" value={draft.centerX} onChange={(value) => onDraftChange({ centerX: value })} />
                    <FieldSpinner label="中心 Y" value={draft.centerY} onChange={(value) => onDraftChange({ centerY: value })} />
                    <div className="flex flex-col gap-2 col-span-2 mt-2">
                        <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">金属伪影抑制</label>
                        <button className="w-full h-[44px] bg-white border border-[#B0C4DE] rounded-md text-[14px] font-bold text-[#37474F] hover:bg-gray-50 transition-all shadow-sm">
                            已关闭
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

export function DoseParamsPanel({ protocol, scrollToDom }: { protocol: ApiProtocolDetail | null; scrollToDom?: boolean }) {
    const series = protocol?.series ?? [];
    const domSectionRef = useRef<HTMLDivElement>(null);

    // ── Dose rows (existing) ──
    const doseRows = series.map((s) => {
        const p = s.topogram_param ?? s.helical_param ?? s.axial_param;
        return {
            label: s.series_label,
            type: SERIES_TYPE_LABEL[s.series_type]?.zh ?? s.series_type,
            ctdi: p?.ctdi_vol ?? null,
            dlp: p?.dlp ?? null,
        };
    }).filter((r) => r.ctdi !== null || r.dlp !== null);

    const totalCtdi = doseRows.reduce((sum, r) => sum + (r.ctdi ?? 0), 0);
    const totalDlp  = doseRows.reduce((sum, r) => sum + (r.dlp  ?? 0), 0);
    const fmt = (v: number | null) => v !== null ? v.toFixed(1) : "-";

    // ── DOM config state ──
    const [domConfig, setDomConfig] = useState<ApiProtocolDomConfig | null>(null);
    const [domLoading, setDomLoading] = useState(false);
    const [domSaveMsg, setDomSaveMsg] = useState<string | null>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Local draft mirrors
    const [domMode, setDomMode] = useState<DomMode>("off");
    const [domOrgan, setDomOrgan] = useState<DomMode>("breast");
    const [domDirection, setDomDirection] = useState<DomDirection>("auto");
    const [domStrength, setDomStrength] = useState<DomStrength>("medium");
    const [domAutoMaLinked, setDomAutoMaLinked] = useState(true);
    const [domQuality, setDomQuality] = useState<DomImageQualityPriority>("balanced");

    const protocolId = protocol?.id ?? null;
    const bodyPart = protocol?.body_part ?? null;
    const recommended = recommendOrgan(bodyPart);

    // Fetch DOM config from backend on mount / protocolId change
    useEffect(() => {
        if (!protocolId || protocolId <= 0) return;
        let cancelled = false;
        setDomLoading(true);
        fetchProtocolDomConfig(protocolId)
            .then((cfg) => {
                if (cancelled) return;
                setDomConfig(cfg);
                setDomMode(cfg.mode);
                if (cfg.mode !== "off" && cfg.mode !== "auto") setDomOrgan(cfg.mode);
                else if (cfg.mode === "auto" && recommended) setDomOrgan(recommended);
                setDomDirection((cfg.direction as DomDirection) ?? "auto");
                setDomStrength((cfg.strength as DomStrength) ?? "medium");
                setDomAutoMaLinked(cfg.auto_ma_linked);
                setDomQuality((cfg.image_quality_priority as DomImageQualityPriority) ?? "balanced");
            })
            .catch(() => { /* first time — use local defaults */ })
            .finally(() => { if (!cancelled) setDomLoading(false); });
        return () => { cancelled = true; };
    }, [protocolId]);

    // Scroll to DOM section when requested from helical panel
    useEffect(() => {
        if (scrollToDom && domSectionRef.current) {
            domSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [scrollToDom]);

    // Persist helper
    const persistDomConfig = useCallback((patch: DomConfigUpdate) => {
        if (!protocolId || protocolId <= 0) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                const updated = await updateProtocolDomConfig(protocolId, patch);
                setDomConfig(updated);
                setDomSaveMsg("DOM 配置已保存");
                setTimeout(() => setDomSaveMsg(null), 2000);
            } catch {
                setDomSaveMsg("DOM 配置保存失败");
                setTimeout(() => setDomSaveMsg(null), 3000);
            }
        }, 400);
    }, [protocolId]);

    // Compute effective mode for API (combines domMode + domOrgan)
    const effectiveMode: DomMode = domMode === "off" ? "off" : domMode === "auto" ? "auto" : domOrgan;
    const isDomActive = domMode !== "off";

    // Dose estimate
    const estReduction = isDomActive ? DOSE_REDUCTION_EST[domStrength] : 0;
    const estCtdi = totalCtdi > 0 ? totalCtdi * (1 - estReduction) : null;
    const estDlp  = totalDlp  > 0 ? totalDlp  * (1 - estReduction) : null;

    return (
        <>
            <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex flex-col justify-center px-6 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">剂量 / DOM 保护 / 通知阈值</span>
                <span className="text-[10px] text-[#94A3B8] font-bold">剂量参考 · DOM 器官剂量保护配置 · 通知阈值 · 剂量预估</span>
            </div>
            <div className="flex-1 p-6 overflow-y-auto bg-white">
                <div className="flex flex-col gap-8">

                    {/* ═══ Section 1: 剂量参考与 DRL ═══ */}
                    {doseRows.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-3 bg-[#4D94FF] rounded-full" />
                                <span className="text-[11px] font-black text-[#546E7A] uppercase tracking-widest">各采集序列剂量参考</span>
                            </div>
                            <div className="border border-[#EEF2F9] rounded-md overflow-hidden">
                                <div className="grid grid-cols-4 bg-[#F8FAFC] px-4 py-2 border-b border-[#EEF2F9]">
                                    <span className="text-[10px] font-black text-[#90A4AE] uppercase">序列</span>
                                    <span className="text-[10px] font-black text-[#90A4AE] uppercase">类型</span>
                                    <span className="text-[10px] font-black text-[#90A4AE] uppercase">CTDIvol (mGy)</span>
                                    <span className="text-[10px] font-black text-[#90A4AE] uppercase">DLP (mGy·cm)</span>
                                </div>
                                {doseRows.map((row, i) => (
                                    <div key={i} className="grid grid-cols-4 px-4 py-2.5 border-b border-[#EEF2F9] last:border-0 hover:bg-[#F8FAFC]">
                                        <span className="text-[12px] font-bold text-[#37474F] truncate pr-2">{row.label}</span>
                                        <span className="text-[11px] text-[#546E7A]">{row.type}</span>
                                        <span className="text-[12px] font-bold text-[#37474F]">{fmt(row.ctdi)}</span>
                                        <span className="text-[12px] font-bold text-[#37474F]">{fmt(row.dlp)}</span>
                                    </div>
                                ))}
                                <div className="grid grid-cols-4 px-4 py-2.5 bg-[#EEF6FF] border-t border-[#BFDBFE]">
                                    <span className="text-[11px] font-black text-[#1E88E5] col-span-2">合计</span>
                                    <span className="text-[12px] font-black text-[#1E88E5]">{fmt(totalCtdi)}</span>
                                    <span className="text-[12px] font-black text-[#1E88E5]">{fmt(totalDlp)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-3 bg-[#4D94FF] rounded-full" />
                                <span className="text-[11px] font-black text-[#546E7A] uppercase tracking-widest">剂量参考与 DRL</span>
                            </div>
                            <button className="px-4 py-1.5 bg-[#EEF2F9] text-[#4D94FF] rounded text-[11px] font-bold border border-[#4D94FF]/20 hover:bg-[#4D94FF] hover:text-white transition-all shadow-sm">
                                一键应用系统 DRL
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-12 gap-y-5">
                            <FieldSpinner label="CTDIvol (mGy) (参考)" value={totalCtdi > 0 ? fmt(totalCtdi) : undefined} />
                            <FieldSpinner label="DLP (mGy*cm) (参考)" value={totalDlp > 0 ? fmt(totalDlp) : undefined} />
                        </div>
                    </div>

                    {/* ═══ Section 2: DOM 器官剂量保护 ═══ */}
                    <div ref={domSectionRef} id="dom-config-section" className="relative rounded-xl border-2 border-[#BFDBFE] bg-gradient-to-br from-[#F0F7FF] to-[#FAFCFF] p-5 flex flex-col gap-5 shadow-sm">
                        {/* Section header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4D94FF] to-[#1E88E5] flex items-center justify-center shadow-sm">
                                    <Shield size={14} className="text-white" />
                                </div>
                                <div>
                                    <span className="text-[12px] font-black text-[#37474F] uppercase tracking-wider">DOM 器官剂量保护</span>
                                    <p className="text-[10px] text-[#90A4AE] font-bold">Dynamic Organ Dose Modulation</p>
                                </div>
                            </div>
                            {domSaveMsg && (
                                <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${domSaveMsg.includes("失败") ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"}`}>
                                    {domSaveMsg}
                                </span>
                            )}
                        </div>

                        {domLoading ? (
                            <div className="flex items-center justify-center py-8 text-[#90A4AE] text-[12px] font-bold">
                                加载 DOM 配置中…
                            </div>
                        ) : (
                            <>
                                {/* Row 1: Mode toggle (3-state) */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">启用状态</label>
                                    <div className="flex gap-2">
                                        {[
                                            { mode: "off" as const, label: "关闭", desc: "不启用 DOM" },
                                            { mode: "auto" as const, label: "自动推荐", desc: "基于部位自动" },
                                            { mode: "manual" as const, label: "手动配置", desc: "自选保护器官" },
                                        ].map((opt) => {
                                            const modeKey = opt.mode === "manual" ? domOrgan : opt.mode;
                                            const isActive = opt.mode === "manual"
                                                ? (domMode !== "off" && domMode !== "auto")
                                                : domMode === opt.mode;
                                            return (
                                                <button
                                                    key={opt.mode}
                                                    onClick={() => {
                                                        const nextMode: DomMode = opt.mode === "manual" ? domOrgan : opt.mode;
                                                        setDomMode(opt.mode === "manual" ? domOrgan : opt.mode);
                                                        if (opt.mode === "auto" && recommended) setDomOrgan(recommended);
                                                        persistDomConfig({ mode: nextMode });
                                                    }}
                                                    className={`flex-1 flex flex-col items-center gap-0.5 py-3 rounded-lg border-2 transition-all text-center ${
                                                        isActive
                                                            ? "bg-white border-[#4D94FF] shadow-md ring-2 ring-[#4D94FF]/10"
                                                            : "bg-white/60 border-[#E0E8F0] hover:border-[#B0C4DE] hover:bg-white"
                                                    }`}
                                                >
                                                    <span className={`text-[12px] font-black ${isActive ? "text-[#1E88E5]" : "text-[#546E7A]"}`}>{opt.label}</span>
                                                    <span className={`text-[9px] font-bold ${isActive ? "text-[#4D94FF]" : "text-[#B0C4DE]"}`}>{opt.desc}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Auto recommendation hint */}
                                {domMode === "auto" && recommended && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-[#E8F5E9] border border-[#A5D6A7] rounded-lg">
                                        <Zap size={14} className="text-[#43A047] shrink-0" />
                                        <span className="text-[11px] font-bold text-[#2E7D32]">
                                            基于部位「{bodyPart}」，自动推荐保护器官：{DOM_ORGAN_OPTIONS.find(o => o.value === recommended)?.label ?? recommended}
                                        </span>
                                    </div>
                                )}

                                {/* DOM detail fields – visible when not off */}
                                {isDomActive && (
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                        {/* 保护器官 */}
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">保护器官</label>
                                            <div className="flex flex-wrap gap-2">
                                                {DOM_ORGAN_OPTIONS.map((opt) => {
                                                    const isSelected = domOrgan === opt.value;
                                                    const isRecommended = domMode === "auto" && opt.value === recommended;
                                                    return (
                                                        <button
                                                            key={opt.value}
                                                            onClick={() => {
                                                                setDomOrgan(opt.value);
                                                                if (domMode !== "auto") setDomMode(opt.value);
                                                                persistDomConfig({ mode: domMode === "auto" ? "auto" : opt.value, protected_organs: JSON.stringify([opt.value]) });
                                                            }}
                                                            className={`px-3 py-1.5 rounded-md text-[11px] font-bold border transition-all ${
                                                                isSelected
                                                                    ? "bg-[#4D94FF] text-white border-[#4D94FF] shadow-sm"
                                                                    : isRecommended
                                                                        ? "bg-white text-[#1E88E5] border-[#4D94FF]/40 ring-1 ring-[#4D94FF]/10"
                                                                        : "bg-white text-[#546E7A] border-[#E0E8F0] hover:border-[#B0C4DE]"
                                                            }`}
                                                        >
                                                            {opt.label}
                                                            {isRecommended && !isSelected && <span className="ml-1 text-[9px] text-[#4D94FF]">★</span>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* 保护方向 */}
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">保护方向</label>
                                            <div className="flex flex-wrap gap-2">
                                                {DOM_DIRECTION_OPTIONS.map((opt) => {
                                                    const isActive = domDirection === opt.value;
                                                    return (
                                                        <button
                                                            key={opt.value}
                                                            onClick={() => {
                                                                setDomDirection(opt.value);
                                                                persistDomConfig({ direction: opt.value });
                                                            }}
                                                            className={`px-3 py-1.5 rounded-md text-[11px] font-bold border transition-all ${
                                                                isActive
                                                                    ? "bg-[#4D94FF] text-white border-[#4D94FF] shadow-sm"
                                                                    : "bg-white text-[#546E7A] border-[#E0E8F0] hover:border-[#B0C4DE]"
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* 保护强度 */}
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">保护强度</label>
                                            <div className="flex gap-2">
                                                {DOM_STRENGTH_OPTIONS.map((opt) => {
                                                    const isActive = domStrength === opt.value;
                                                    const barColors: Record<DomStrength, string> = {
                                                        low: "from-[#81D4FA] to-[#4FC3F7]",
                                                        medium: "from-[#4D94FF] to-[#1E88E5]",
                                                        high: "from-[#7B1FA2] to-[#9C27B0]",
                                                    };
                                                    return (
                                                        <button
                                                            key={opt.value}
                                                            onClick={() => {
                                                                setDomStrength(opt.value);
                                                                persistDomConfig({ strength: opt.value });
                                                            }}
                                                            className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border-2 transition-all ${
                                                                isActive
                                                                    ? "bg-white border-[#4D94FF] shadow-md ring-2 ring-[#4D94FF]/10"
                                                                    : "bg-white/60 border-[#E0E8F0] hover:border-[#B0C4DE]"
                                                            }`}
                                                        >
                                                            <div className={`w-8 h-1 rounded-full bg-gradient-to-r ${barColors[opt.value]}`} />
                                                            <span className={`text-[11px] font-bold ${isActive ? "text-[#1E88E5]" : "text-[#90A4AE]"}`}>{opt.label}</span>
                                                            <span className={`text-[9px] font-bold ${isActive ? "text-[#4D94FF]" : "text-[#B0C4DE]"}`}>≈{(DOSE_REDUCTION_EST[opt.value] * 100).toFixed(0)}% 降剂量</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* 图像质量优先级 */}
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">图像质量优先级</label>
                                            <div className="flex gap-2">
                                                {DOM_QUALITY_OPTIONS.map((opt) => {
                                                    const isActive = domQuality === opt.value;
                                                    return (
                                                        <button
                                                            key={opt.value}
                                                            onClick={() => {
                                                                setDomQuality(opt.value);
                                                                persistDomConfig({ image_quality_priority: opt.value });
                                                            }}
                                                            className={`flex-1 py-2 rounded-lg text-[11px] font-bold border-2 transition-all ${
                                                                isActive
                                                                    ? "bg-white border-[#4D94FF] text-[#1E88E5] shadow-md ring-2 ring-[#4D94FF]/10"
                                                                    : "bg-white/60 border-[#E0E8F0] text-[#90A4AE] hover:border-[#B0C4DE]"
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* auto_mA 联动开关 */}
                                        <div className="col-span-2 flex items-center justify-between bg-white rounded-lg border border-[#E0E8F0] p-3">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-[#37474F]">auto mA 联动</span>
                                                <span className="text-[9px] font-bold text-[#90A4AE]">开启后 DOM 将与 auto mA 协同调节管电流</span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const next = !domAutoMaLinked;
                                                    setDomAutoMaLinked(next);
                                                    persistDomConfig({ auto_ma_linked: next });
                                                }}
                                                className={`relative w-[44px] h-[24px] rounded-full transition-colors duration-200 ${
                                                    domAutoMaLinked ? "bg-[#4D94FF]" : "bg-[#CFD8DC]"
                                                }`}
                                            >
                                                <div className={`absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white shadow-md transition-transform duration-200 ${
                                                    domAutoMaLinked ? "translate-x-[22px]" : "translate-x-[2px]"
                                                }`} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* ═══ Section 3: 通知阈值 ═══ */}
                    <div className="bg-[#F8FAFC] border border-[#EEF2F9] rounded-lg p-5 flex flex-col gap-5">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-3 bg-[#4D94FF] rounded-full" />
                            <span className="text-[11px] font-black text-[#546E7A] uppercase tracking-widest">通知阈值 (可编辑)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-12 gap-y-5">
                            <FieldSpinner label="CTDI 通知阈值 (mGy)" value={totalCtdi > 0 ? fmt(totalCtdi * 1.35) : "80"} />
                            <FieldSpinner label="DLP 通知阈值 (mGy*cm)" value={totalDlp > 0 ? fmt(totalDlp * 1.13) : "1320"} />
                        </div>
                    </div>

                    {/* ═══ Section 4: 剂量预估与风险提示 ═══ */}
                    <div className="rounded-xl border border-dashed border-[#BFDBFE] bg-[#FAFCFF] p-5 flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-3 bg-[#FFB74D] rounded-full" />
                            <span className="text-[11px] font-black text-[#546E7A] uppercase tracking-widest">剂量预估与风险提示</span>
                            <span className="ml-auto text-[9px] text-[#B0C4DE] font-bold italic">预估值仅供参考</span>
                        </div>

                        {isDomActive && (totalCtdi > 0 || totalDlp > 0) ? (
                            <div className="grid grid-cols-2 gap-4">
                                {totalCtdi > 0 && (
                                    <div className="flex flex-col gap-1 bg-white rounded-lg border border-[#E0E8F0] p-3">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase">CTDIvol 预估变化</span>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-[14px] font-black text-[#37474F]">{fmt(totalCtdi)}</span>
                                            <span className="text-[11px] font-bold text-[#90A4AE]">→</span>
                                            <span className="text-[14px] font-black text-[#1E88E5]">{fmt(estCtdi)}</span>
                                            <span className="text-[10px] font-bold text-[#43A047]">-{(estReduction * 100).toFixed(0)}%</span>
                                        </div>
                                    </div>
                                )}
                                {totalDlp > 0 && (
                                    <div className="flex flex-col gap-1 bg-white rounded-lg border border-[#E0E8F0] p-3">
                                        <span className="text-[9px] font-black text-[#90A4AE] uppercase">DLP 预估变化</span>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-[14px] font-black text-[#37474F]">{fmt(totalDlp)}</span>
                                            <span className="text-[11px] font-bold text-[#90A4AE]">→</span>
                                            <span className="text-[14px] font-black text-[#1E88E5]">{fmt(estDlp)}</span>
                                            <span className="text-[10px] font-bold text-[#43A047]">-{(estReduction * 100).toFixed(0)}%</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-[#B0C4DE] py-4 justify-center">
                                <AlertTriangle size={14} />
                                <span className="text-[11px] font-bold">
                                    {isDomActive ? "暂无剂量参考数据，无法生成预估" : "DOM 未启用，无剂量变化预估"}
                                </span>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </>
    );
}
