import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
    Plus,
    ChevronRight,
    Info,
    CircleDot,
    ChevronDown,
    X,
} from "lucide-react";
import {
    fetchSelectedScanSession,
    updateSelectedScanSession,
    updateSelectedScanSessionAxialParam,
    updateSelectedScanSessionHelicalParam,
    updateSelectedScanSessionReconSeries,
    updateSelectedScanSessionSeries,
    updateSelectedScanSessionTopogramParam,
} from "../lib/scanSession";

// ── Types (mirrors ProtocolSetupScreen API types) ──────────────────────────

type ApiReconSeries = {
    id: number;
    recon_name: string;
    kernel: string;
    matrix: number;
    window_width: number;
    window_level: number;
    slice_thickness: number;
    increment?: number | null;
};

type ApiSeriesDetail = {
    id: number;
    series_type: "topogram" | "helical" | "axial" | "4d";
    series_label: string;
    topogram_param?: {
        id?: number;
        kv: number; ma: number; scan_length: number; tube_angle: number; fov: number;
        ctdi_vol?: number | null; dlp?: number | null;
    } | null;
    helical_param?: {
        id?: number;
        kv: number; ma: number; slice_thickness: number; pitch: number;
        rotation_time: number; scan_length: number; fov: number; auto_ma?: boolean;
        ctdi_vol?: number | null; dlp?: number | null;
    } | null;
    axial_param?: {
        id?: number;
        kv: number; ma: number; slice_thickness: number; slice_interval: number;
        rotation_time: number; scan_length: number; fov: number; step_count?: number | null;
        ctdi_vol?: number | null; dlp?: number | null;
    } | null;
    recon_series: ApiReconSeries[];
};

type ApiProtocolDetail = {
    id: number;
    name: string;
    body_part: string;
    age_group: "adult" | "child" | "infant";
    patient_weight: string;
    patient_position: string;
    table_direction: string;
    description?: string | null;
    series: ApiSeriesDetail[];
};

const mapScanSessionToProtocolDetail = (scanSession: Awaited<ReturnType<typeof fetchSelectedScanSession>>): ApiProtocolDetail | null => {
    if (!scanSession) return null;

    return {
        id: scanSession.id,
        name: scanSession.name,
        body_part: scanSession.body_part,
        age_group: scanSession.age_group,
        patient_weight: scanSession.patient_weight,
        patient_position: scanSession.patient_position,
        table_direction: scanSession.table_direction,
        description: scanSession.description,
        series: scanSession.series.map((series) => ({
            id: series.id,
            series_type: series.series_type,
            series_label: series.series_label,
            topogram_param: series.topogram_param
                ? {
                    kv: series.topogram_param.kv,
                    ma: series.topogram_param.ma,
                    scan_length: series.topogram_param.scan_length,
                    tube_angle: series.topogram_param.tube_angle,
                    fov: series.topogram_param.fov,
                    ctdi_vol: series.topogram_param.ctdi_vol,
                    dlp: series.topogram_param.dlp,
                }
                : null,
            helical_param: series.helical_param
                ? {
                    kv: series.helical_param.kv,
                    ma: series.helical_param.ma,
                    slice_thickness: series.helical_param.slice_thickness,
                    pitch: series.helical_param.pitch,
                    rotation_time: series.helical_param.rotation_time,
                    scan_length: series.helical_param.scan_length,
                    fov: series.helical_param.fov,
                    auto_ma: series.helical_param.auto_ma,
                    ctdi_vol: series.helical_param.ctdi_vol,
                    dlp: series.helical_param.dlp,
                }
                : null,
            axial_param: series.axial_param
                ? {
                    kv: series.axial_param.kv,
                    ma: series.axial_param.ma,
                    slice_thickness: series.axial_param.slice_thickness,
                    slice_interval: series.axial_param.slice_interval,
                    rotation_time: series.axial_param.rotation_time,
                    scan_length: series.axial_param.scan_length,
                    fov: series.axial_param.fov,
                    step_count: series.axial_param.step_count,
                    ctdi_vol: series.axial_param.ctdi_vol,
                    dlp: series.axial_param.dlp,
                }
                : null,
            recon_series: series.recon_series.map((recon) => ({
                id: recon.id,
                recon_name: recon.recon_name,
                kernel: recon.kernel,
                matrix: recon.matrix,
                window_width: recon.window_width,
                window_level: recon.window_level,
                slice_thickness: recon.slice_thickness,
                increment: recon.increment,
            })),
        })),
    };
};

// ── Selection state ────────────────────────────────────────────────────────

type Selection =
    | { type: "basic" }
    | { type: "dose" }
    | { type: "series"; seriesId: number }
    | { type: "recon"; seriesId: number; reconId: number };

const DETAIL_TARGET_STORAGE_KEY = "scanConfirmDetailTarget";

// ── Constants ──────────────────────────────────────────────────────────────

const AGE_LABEL: Record<string, string> = { adult: "成人", child: "儿童", infant: "婴儿" };

const SERIES_TYPE_LABEL: Record<string, { zh: string; en: string }> = {
    topogram: { zh: "定位像", en: "LOCALIZER" },
    helical:  { zh: "螺旋扫描", en: "HELICAL" },
    axial:    { zh: "轴位扫描", en: "AXIAL" },
    "4d":     { zh: "4D 扫描",  en: "4D" },
};

const ALL_POSITIONS = [
    { id: "HFS",  label: "头先进-仰卧" },
    { id: "FFS",  label: "足先进-仰卧" },
    { id: "HFP",  label: "头先进-俯卧" },
    { id: "FFP",  label: "足先进-俯卧" },
    { id: "HFDR", label: "头先进-右侧卧" },
    { id: "FFDR", label: "足先进-右侧卧" },
    { id: "HFDL", label: "头先进-左侧卧" },
    { id: "FFDL", label: "足先进-左侧卧" },
];

// ── Shared form helpers ────────────────────────────────────────────────────

function FieldInput({ label, value, placeholder, required, onChange }: {
    label: string; value?: string | number; placeholder?: string; required?: boolean; onChange?: (value: string) => void;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight flex items-center gap-0.5">
                {label}
                {required && <span className="text-red-500 text-[12px] leading-none select-none">*</span>}
            </label>
            <input
                type="text"
                value={value !== undefined && value !== null ? String(value) : ""}
                onChange={(event) => onChange?.(event.target.value)}
                placeholder={placeholder}
                className="w-full h-[40px] px-3 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none placeholder:font-normal placeholder:text-[#90A4AE]/40 focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10 shadow-sm"
            />
        </div>
    );
}

function FieldSelect({ label, value, options, required, onChange }: {
    label: string; value?: string | number; options: string[]; required?: boolean; onChange?: (value: string) => void;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight flex items-center gap-0.5">
                {label}
                {required && <span className="text-red-500 text-[12px] leading-none select-none">*</span>}
            </label>
            <div className="relative">
                <select
                    value={value !== undefined ? String(value) : options[0]}
                    onChange={(event) => onChange?.(event.target.value)}
                    className="w-full h-[40px] px-3 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none appearance-none cursor-pointer focus:border-[#4D94FF] shadow-sm"
                >
                    {options.map((o) => <option key={o}>{o}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
            </div>
        </div>
    );
}

function FieldSpinner({ label, value, onChange }: { label: string; value?: string | number; onChange?: (value: string) => void }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">{label}</label>
            <div className="relative">
                <input
                    type="text"
                    value={value !== undefined && value !== null ? String(value) : ""}
                    onChange={(event) => onChange?.(event.target.value)}
                    className="w-full h-[40px] px-3 pr-10 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10 shadow-sm"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0 border-l border-[#B0C4DE] pl-2 h-7 justify-center">
                    <ChevronDown size={14} className="text-[#94A3B8] rotate-180 cursor-pointer hover:text-[#4D94FF]" />
                    <ChevronDown size={14} className="text-[#94A3B8] cursor-pointer hover:text-[#4D94FF]" />
                </div>
            </div>
        </div>
    );
}

function Divider() {
    return <div className="col-span-2 h-[1px] bg-[#EEF2F9] my-1" />;
}

type BasicDraft = {
    name: string;
    patientWeight: string;
    patientPosition: string;
};

type SeriesDraft = {
    seriesLabel: string;
    kv: string;
    ma: string;
    scanLength: string;
    fov: string;
    tubeAngle: string;
    rotationTime: string;
    pitch: string;
    sliceThickness: string;
    sliceInterval: string;
};

type ReconDraft = {
    reconName: string;
    kernel: string;
    sliceThickness: string;
    increment: string;
    matrix: string;
    windowLevel: string;
    windowWidth: string;
};

// ── Right panels ───────────────────────────────────────────────────────────

function BasicInfoPanel({ protocol, draft, selectedPos, onPosChange, onDraftChange }: {
    protocol: ApiProtocolDetail | null;
    draft: BasicDraft;
    selectedPos: string;
    onPosChange: (pos: string) => void;
    onDraftChange: (patch: Partial<BasicDraft>) => void;
}) {
    const ageLabel = protocol ? (AGE_LABEL[protocol.age_group] ?? protocol.age_group) : "-";
    return (
        <>
            <div className="h-[44px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">协议基本信息 (Basic Info)</span>
                <Info size={16} className="text-[#4D94FF]" />
            </div>
            <div className="flex-1 px-8 py-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-6">
                    <FieldInput label="协议名称" value={draft.name} required onChange={(value) => onDraftChange({ name: value })} />
                    <FieldSelect label="部位" value={protocol?.body_part} options={[protocol?.body_part ?? "-"]} required />
                    <FieldInput label="体型范围" value={draft.patientWeight} onChange={(value) => onDraftChange({ patientWeight: value })} />
                    <FieldSelect label="年龄" value={ageLabel} options={[ageLabel]} required />
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

function ScoutParamsPanel({ draft, onDraftChange }: {
    draft: SeriesDraft;
    onDraftChange: (patch: Partial<SeriesDraft>) => void;
}) {
    return (
        <>
            <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">定位像采集参数 (Scout Params)</span>
                <button className="flex items-center gap-1.5 text-[#94A3B8] hover:text-[#D32F2F] transition-colors group">
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
                    <FieldSelect label="模式" value="定位像" options={["定位像", "螺旋扫描", "断层扫描"]} />
                    <Divider />
                    <FieldSelect label="KV" value={draft.kv} options={[draft.kv || "120", "100", "80"]} required onChange={(value) => onDraftChange({ kv: value })} />
                    <FieldInput label="MA" value={draft.ma} required onChange={(value) => onDraftChange({ ma: value })} />
                    <FieldSelect label="旋转时间 (S)" value="1" options={["1", "0.5", "1.5"]} required />
                    <FieldInput label="准直器" placeholder="例如: 320.6" />
                    <FieldInput label="扫描长度 (MM)" value={draft.scanLength} required onChange={(value) => onDraftChange({ scanLength: value })} />
                    <FieldSelect label="扫描方向" value="OUT" options={["OUT", "IN"]} required />
                    <FieldInput label="FOV" value={draft.fov} required onChange={(value) => onDraftChange({ fov: value })} />
                    <FieldInput label="DOM" placeholder="0 或 1" />
                    <FieldInput label="床角度 (ANGLE)" value={draft.tubeAngle} required onChange={(value) => onDraftChange({ tubeAngle: value })} />
                </div>
            </div>
        </>
    );
}

function HelicalParamsPanel({ series, draft, onDraftChange }: {
    series: ApiSeriesDetail;
    draft: SeriesDraft;
    onDraftChange: (patch: Partial<SeriesDraft>) => void;
}) {
    const typeLabel = SERIES_TYPE_LABEL[series.series_type]?.zh ?? series.series_type;
    const typeKey = series.series_type === "helical" ? "HELICAL PARAMS" : "AXIAL PARAMS";
    return (
        <>
            <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">
                    扫描采集：{draft.seriesLabel || series.series_label} ({typeKey})
                </span>
                <button className="flex items-center gap-1.5 text-[#94A3B8] hover:text-[#D32F2F] transition-colors group">
                    <X size={14} className="opacity-70 group-hover:opacity-100" />
                    <span className="text-[11px] font-bold">删除该采集序列</span>
                </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto bg-white">
                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                    <FieldInput label="名称" value={draft.seriesLabel} onChange={(value) => onDraftChange({ seriesLabel: value })} />
                    <FieldSelect label="模式" value={typeLabel} options={[typeLabel, "定位像", "断层扫描"]} />
                    <Divider />
                    <FieldSelect label="KV" value={draft.kv} options={[draft.kv || "120", "100", "80"]} required onChange={(value) => onDraftChange({ kv: value })} />
                    <FieldInput label="MA" value={draft.ma} required onChange={(value) => onDraftChange({ ma: value })} />
                    <FieldSelect label="旋转时间 (S)" value={draft.rotationTime || "1"} options={[draft.rotationTime || "1", "0.5", "1.5"]} required onChange={(value) => onDraftChange({ rotationTime: value })} />
                    <FieldInput label="准直器" placeholder="例如: 32x0.6" required />
                    <FieldInput label="扫描长度 (MM)" value={draft.scanLength} required onChange={(value) => onDraftChange({ scanLength: value })} />
                    <FieldSelect label="扫描方向" value="OUT" options={["OUT", "IN"]} required />
                    <FieldInput label="FOV" value={draft.fov} required onChange={(value) => onDraftChange({ fov: value })} />
                    <FieldInput label="DOM" value="0" required />
                    {series.series_type === "helical" && (
                        <FieldInput label="PITCH" value={draft.pitch} required onChange={(value) => onDraftChange({ pitch: value })} />
                    )}
                    {series.series_type === "axial" && (
                        <FieldInput label="扫描增量 (MM)" value={draft.sliceInterval} required onChange={(value) => onDraftChange({ sliceInterval: value })} />
                    )}
                    <FieldInput label="层厚 (MM)" value={draft.sliceThickness} required onChange={(value) => onDraftChange({ sliceThickness: value })} />
                </div>
            </div>
        </>
    );
}

function ReconParamsPanel({ series, draft, onDraftChange }: {
    series: ApiSeriesDetail;
    draft: ReconDraft;
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
                <button className="flex items-center gap-1.5 text-[#94A3B8] hover:text-[#D32F2F] transition-colors group">
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
                    <FieldSpinner label="重建 FOV (MM)" value={250} />
                    <FieldSpinner label="MATRIX" value={draft.matrix} onChange={(value) => onDraftChange({ matrix: value })} />
                    <FieldSpinner label="窗位 (WL)" value={draft.windowLevel} onChange={(value) => onDraftChange({ windowLevel: value })} />
                    <FieldSpinner label="窗宽 (WW)" value={draft.windowWidth} onChange={(value) => onDraftChange({ windowWidth: value })} />
                    <FieldSpinner label="中心 X" value={0} />
                    <FieldSpinner label="中心 Y" value={0} />
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

function DoseParamsPanel({ protocol }: { protocol: ApiProtocolDetail | null }) {
    const series = protocol?.series ?? [];

    // Per-series dose breakdown
    const doseRows = series.map((s) => {
        const p = s.topogram_param ?? s.helical_param ?? s.axial_param;
        return {
            label: s.series_label,
            type: SERIES_TYPE_LABEL[s.series_type]?.zh ?? s.series_type,
            ctdi: p?.ctdi_vol ?? null,
            dlp: p?.dlp ?? null,
        };
    }).filter((r) => r.ctdi !== null || r.dlp !== null);

    // Totals
    const totalCtdi = doseRows.reduce((sum, r) => sum + (r.ctdi ?? 0), 0);
    const totalDlp  = doseRows.reduce((sum, r) => sum + (r.dlp  ?? 0), 0);

    const fmt = (v: number | null) => v !== null ? v.toFixed(1) : "-";

    return (
        <>
            <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex flex-col justify-center px-6 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">剂量 / 通知阈值</span>
                <span className="text-[10px] text-[#94A3B8] font-bold">参考值可选填；通知阈值用于扫描前确认/告警</span>
            </div>
            <div className="flex-1 p-6 overflow-y-auto bg-white">
                <div className="flex flex-col gap-8">

                    {/* Section 1: Per-series dose reference from API */}
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

                    {/* Section 2: Dose reference fields */}
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-3 bg-[#4D94FF] rounded-full" />
                                <span className="text-[11px] font-black text-[#546E7A] uppercase tracking-widest">剂量参考与阈值</span>
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

                    {/* Section 3: Editable thresholds */}
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
                </div>
            </div>
        </>
    );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function WT32ProtocolDetailScreen() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isNewMode = searchParams.get("mode") === "new";
    const [protocol, setProtocol] = useState<ApiProtocolDetail | null>(null);
    const [selectedPos, setSelectedPos] = useState("HFS");
    const [selection, setSelection] = useState<Selection>({ type: "basic" });
    const [basicDraft, setBasicDraft] = useState<BasicDraft>({ name: "", patientWeight: "", patientPosition: "HFS" });
    const [seriesDraft, setSeriesDraft] = useState<SeriesDraft>({
        seriesLabel: "",
        kv: "",
        ma: "",
        scanLength: "",
        fov: "",
        tubeAngle: "",
        rotationTime: "",
        pitch: "",
        sliceThickness: "",
        sliceInterval: "",
    });
    const [reconDraft, setReconDraft] = useState<ReconDraft>({
        reconName: "",
        kernel: "",
        sliceThickness: "",
        increment: "",
        matrix: "",
        windowLevel: "",
        windowWidth: "",
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    const syncProtocolFromSession = async () => {
        const scanSession = await fetchSelectedScanSession();
        const mappedSession = mapScanSessionToProtocolDetail(scanSession);
        if (mappedSession) {
            setProtocol(mappedSession);
            setSelectedPos(mappedSession.patient_position || "HFS");
            return true;
        }
        return false;
    };

    useEffect(() => {
        if (isNewMode) {
            setProtocol({
                id: 0,
                name: "",
                body_part: "",
                age_group: "adult",
                patient_weight: "",
                patient_position: "HFS",
                table_direction: "",
                series: [],
            });
            return;
        }

        let cancelled = false;

        const loadProtocolSource = async () => {
            try {
                const synced = await syncProtocolFromSession();
                if (!cancelled && synced) return;
            } catch (error) {
                console.error(error);
            }

            const raw = localStorage.getItem("selectedProtocol");
            if (!raw || cancelled) return;

            try {
                const parsed = JSON.parse(raw) as ApiProtocolDetail;
                if (!cancelled) {
                    setProtocol(parsed);
                    if (parsed.patient_position) setSelectedPos(parsed.patient_position);
                }
            } catch {
                // ignore invalid fallback payload
            }
        };

        void loadProtocolSource();

        return () => {
            cancelled = true;
        };
    }, [isNewMode]);

    const series = protocol?.series ?? [];
    const topograms = series.filter((item) => item.series_type === "topogram");
    const acquisitions = series.filter((item) => item.series_type !== "topogram");
    const ageLabel = protocol ? (AGE_LABEL[protocol.age_group] ?? protocol.age_group) : "-";

    const activeSeries = (selection.type === "series" || selection.type === "recon")
        ? series.find((item) => item.id === selection.seriesId) ?? null
        : null;
    const activeRecon = selection.type === "recon" && activeSeries
        ? activeSeries.recon_series.find((item) => item.id === selection.reconId) ?? null
        : null;

    useEffect(() => {
        if (!protocol || series.length === 0) return;

        const detailTarget = localStorage.getItem(DETAIL_TARGET_STORAGE_KEY);
        if (!detailTarget) return;

        const targetSeries = series.find((item) => item.series_type === detailTarget);
        if (targetSeries) {
            setSelection({ type: "series", seriesId: targetSeries.id });
        }

        localStorage.removeItem(DETAIL_TARGET_STORAGE_KEY);
    }, [protocol, series]);

    useEffect(() => {
        setBasicDraft({
            name: protocol?.name ?? "",
            patientWeight: protocol?.patient_weight ?? "",
            patientPosition: selectedPos,
        });
    }, [protocol?.name, protocol?.patient_weight, selectedPos]);

    useEffect(() => {
        if (!activeSeries || selection.type !== "series") return;
        setSeriesDraft({
            seriesLabel: activeSeries.series_label ?? "",
            kv: String(activeSeries.topogram_param?.kv ?? activeSeries.helical_param?.kv ?? activeSeries.axial_param?.kv ?? ""),
            ma: String(activeSeries.topogram_param?.ma ?? activeSeries.helical_param?.ma ?? activeSeries.axial_param?.ma ?? ""),
            scanLength: String(activeSeries.topogram_param?.scan_length ?? activeSeries.helical_param?.scan_length ?? activeSeries.axial_param?.scan_length ?? ""),
            fov: String(activeSeries.topogram_param?.fov ?? activeSeries.helical_param?.fov ?? activeSeries.axial_param?.fov ?? ""),
            tubeAngle: String(activeSeries.topogram_param?.tube_angle ?? ""),
            rotationTime: String(activeSeries.helical_param?.rotation_time ?? activeSeries.axial_param?.rotation_time ?? ""),
            pitch: String(activeSeries.helical_param?.pitch ?? ""),
            sliceThickness: String(activeSeries.helical_param?.slice_thickness ?? activeSeries.axial_param?.slice_thickness ?? ""),
            sliceInterval: String(activeSeries.axial_param?.slice_interval ?? ""),
        });
    }, [activeSeries, selection.type]);

    useEffect(() => {
        if (!activeRecon || selection.type !== "recon") return;
        setReconDraft({
            reconName: activeRecon.recon_name ?? "",
            kernel: activeRecon.kernel ?? "",
            sliceThickness: String(activeRecon.slice_thickness ?? ""),
            increment: String(activeRecon.increment ?? activeRecon.slice_thickness ?? ""),
            matrix: String(activeRecon.matrix ?? ""),
            windowLevel: String(activeRecon.window_level ?? ""),
            windowWidth: String(activeRecon.window_width ?? ""),
        });
    }, [activeRecon, selection.type]);

    const isSeriesSelected = (id: number) => selection.type === "series" && selection.seriesId === id;
    const isReconSelected = (seriesId: number, reconId: number) =>
        selection.type === "recon" && selection.seriesId === seriesId && selection.reconId === reconId;

    const parseNumber = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const handleSave = async () => {
        if (!protocol) return;

        setIsSaving(true);
        setSaveMessage(null);

        try {
            if (selection.type === "basic") {
                await updateSelectedScanSession({
                    name: basicDraft.name.trim() || protocol.name,
                    patient_weight: basicDraft.patientWeight.trim(),
                    patient_position: basicDraft.patientPosition,
                });
            } else if (selection.type === "series" && activeSeries) {
                await updateSelectedScanSessionSeries(activeSeries.id, {
                    series_label: seriesDraft.seriesLabel.trim() || activeSeries.series_label,
                });

                if (activeSeries.series_type === "topogram" && activeSeries.topogram_param?.id) {
                    await updateSelectedScanSessionTopogramParam(activeSeries.topogram_param.id, {
                        kv: parseNumber(seriesDraft.kv) ?? activeSeries.topogram_param.kv,
                        ma: parseNumber(seriesDraft.ma) ?? activeSeries.topogram_param.ma,
                        scan_length: parseNumber(seriesDraft.scanLength) ?? activeSeries.topogram_param.scan_length,
                        fov: parseNumber(seriesDraft.fov) ?? activeSeries.topogram_param.fov,
                        tube_angle: parseNumber(seriesDraft.tubeAngle) ?? activeSeries.topogram_param.tube_angle,
                    });
                }

                if (activeSeries.series_type === "helical" && activeSeries.helical_param?.id) {
                    await updateSelectedScanSessionHelicalParam(activeSeries.helical_param.id, {
                        kv: parseNumber(seriesDraft.kv) ?? activeSeries.helical_param.kv,
                        ma: parseNumber(seriesDraft.ma) ?? activeSeries.helical_param.ma,
                        scan_length: parseNumber(seriesDraft.scanLength) ?? activeSeries.helical_param.scan_length,
                        fov: parseNumber(seriesDraft.fov) ?? activeSeries.helical_param.fov,
                        rotation_time: parseNumber(seriesDraft.rotationTime) ?? activeSeries.helical_param.rotation_time,
                        pitch: parseNumber(seriesDraft.pitch) ?? activeSeries.helical_param.pitch,
                        slice_thickness: parseNumber(seriesDraft.sliceThickness) ?? activeSeries.helical_param.slice_thickness,
                    });
                }

                if (activeSeries.series_type === "axial" && activeSeries.axial_param?.id) {
                    await updateSelectedScanSessionAxialParam(activeSeries.axial_param.id, {
                        kv: parseNumber(seriesDraft.kv) ?? activeSeries.axial_param.kv,
                        ma: parseNumber(seriesDraft.ma) ?? activeSeries.axial_param.ma,
                        scan_length: parseNumber(seriesDraft.scanLength) ?? activeSeries.axial_param.scan_length,
                        fov: parseNumber(seriesDraft.fov) ?? activeSeries.axial_param.fov,
                        rotation_time: parseNumber(seriesDraft.rotationTime) ?? activeSeries.axial_param.rotation_time,
                        slice_interval: parseNumber(seriesDraft.sliceInterval) ?? activeSeries.axial_param.slice_interval,
                        slice_thickness: parseNumber(seriesDraft.sliceThickness) ?? activeSeries.axial_param.slice_thickness,
                    });
                }
            } else if (selection.type === "recon" && activeRecon) {
                await updateSelectedScanSessionReconSeries(activeRecon.id, {
                    recon_name: reconDraft.reconName.trim() || activeRecon.recon_name,
                    kernel: reconDraft.kernel.trim() || activeRecon.kernel,
                    slice_thickness: parseNumber(reconDraft.sliceThickness) ?? activeRecon.slice_thickness,
                    increment: parseNumber(reconDraft.increment) ?? activeRecon.increment ?? activeRecon.slice_thickness,
                    matrix: parseNumber(reconDraft.matrix) ?? activeRecon.matrix,
                    window_level: parseNumber(reconDraft.windowLevel) ?? activeRecon.window_level,
                    window_width: parseNumber(reconDraft.windowWidth) ?? activeRecon.window_width,
                });
            }

            await syncProtocolFromSession();
            navigate(-1);
        } catch (error) {
            console.error(error);
            setSaveMessage("保存失败，请稍后重试");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl text-[#37474F] font-sans select-none">
            <header className="flex items-center px-5 h-[52px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <span className="text-[16px] font-bold text-[#37474F]">协议编辑器 (Session Detail)</span>
            </header>

            <main className="flex-1 overflow-hidden p-2 flex gap-3">
                <aside className="w-[310px] flex flex-col bg-white border border-[#B0C4DE] rounded-md shadow-sm overflow-hidden shrink-0">
                    <div className="h-[44px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center px-4 shrink-0">
                        <span className="text-[11px] font-black uppercase tracking-wider text-[#37474F]">协议队列 (Protocols)</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
                        <div className="p-3 bg-[#F8FAFC] border border-[#EEF2F9] rounded-md">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="font-bold text-sm text-[#37474F]">{isNewMode ? "新建协议" : (protocol?.name ?? "-")}</span>
                                {!isNewMode && protocol?.body_part && (
                                    <span className="bg-[#EEF2F9] text-[#546E7A] text-[10px] px-1.5 py-0.5 rounded">{protocol.body_part}</span>
                                )}
                                {!isNewMode && <span className="bg-[#EEF2F9] text-[#546E7A] text-[10px] px-1.5 py-0.5 rounded">{ageLabel}</span>}
                                {isNewMode && <span className="bg-[#E3F2FD] text-[#1E88E5] text-[10px] px-1.5 py-0.5 rounded font-bold">新建</span>}
                            </div>
                            <div className="flex items-start gap-2 text-[#4D94FF]">
                                <Info size={12} className="shrink-0 mt-0.5" />
                                <p className="text-[10px] leading-tight font-bold">出厂模板保持不变，您在这里的修改仅作用于当前扫描流程。</p>
                            </div>
                        </div>

                        <nav className="flex flex-col gap-2">
                            <button
                                onClick={() => setSelection({ type: "basic" })}
                                className={`flex items-center justify-between px-4 py-2.5 rounded-md text-[13px] font-bold transition-all border ${
                                    selection.type === "basic"
                                        ? "bg-[#E3F2FD] border-[#4D94FF] text-[#1E88E5] shadow-sm"
                                        : "text-[#546E7A] border-transparent hover:bg-gray-50"
                                }`}
                            >
                                协议基本信息
                            </button>

                            <div className="mt-1 flex flex-col">
                                <div className="flex justify-between items-center px-1 mb-2">
                                    <span className="text-[10px] text-[#94A3B8] font-black uppercase tracking-widest">采集队列</span>
                                    <button className="text-[#4D94FF] flex items-center gap-1 text-[11px] hover:underline font-bold px-2 py-1 rounded hover:bg-blue-50 transition-colors">
                                        <Plus size={12} /> 新增
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {(topograms.length > 0 ? topograms : [{ id: -1, series_label: "定位像", series_type: "topogram" as const, recon_series: [] }]).map((seriesItem) => (
                                        <div
                                            key={seriesItem.id}
                                            onClick={() => seriesItem.id !== -1 && setSelection({ type: "series", seriesId: seriesItem.id })}
                                            className={`rounded-md px-3 py-2 cursor-pointer transition-colors shadow-sm flex justify-between items-start ${
                                                isSeriesSelected(seriesItem.id)
                                                    ? "bg-[#4D94FF] text-white"
                                                    : "bg-[#F8FAFC] border border-[#EEF2F9] hover:bg-[#F3F8FF]"
                                            }`}
                                        >
                                            <span className={`text-[11px] font-bold ${isSeriesSelected(seriesItem.id) ? "text-white" : "text-[#37474F]"}`}>{seriesItem.series_label}</span>
                                            <span className={`text-[10px] mt-0.5 ${isSeriesSelected(seriesItem.id) ? "text-white/80" : "opacity-50"}`}>
                                                {SERIES_TYPE_LABEL[seriesItem.series_type]?.en ?? seriesItem.series_type.toUpperCase()}
                                            </span>
                                        </div>
                                    ))}

                                    {acquisitions.map((seriesItem) => (
                                        <div key={seriesItem.id} className="flex flex-col rounded-md border border-[#EEF2F9] bg-[#F8FAFC] overflow-hidden shadow-sm">
                                            <div
                                                onClick={() => setSelection({ type: "series", seriesId: seriesItem.id })}
                                                className={`px-3 py-2.5 flex justify-between items-center border-b border-[#EEF2F9] cursor-pointer transition-colors ${
                                                    isSeriesSelected(seriesItem.id)
                                                        ? "bg-[#4D94FF] border-[#4D94FF]/20"
                                                        : "hover:bg-[#F3F8FF]"
                                                }`}
                                            >
                                                <span className={`text-[11px] font-bold ${isSeriesSelected(seriesItem.id) ? "text-white" : "text-[#546E7A]"}`}>{seriesItem.series_label}</span>
                                                <span className={`text-[10px] font-medium uppercase tracking-tight ${isSeriesSelected(seriesItem.id) ? "text-white/80" : "text-[#94A3B8]"}`}>
                                                    {SERIES_TYPE_LABEL[seriesItem.series_type]?.zh ?? seriesItem.series_type}
                                                </span>
                                            </div>

                                            <div className="p-2 flex flex-col gap-1">
                                                {seriesItem.recon_series.map((recon) => (
                                                    <div
                                                        key={recon.id}
                                                        onClick={() => setSelection({ type: "recon", seriesId: seriesItem.id, reconId: recon.id })}
                                                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                                                            isReconSelected(seriesItem.id, recon.id)
                                                                ? "bg-[#E3F2FD] shadow-sm"
                                                                : "hover:bg-[#E3F2FD]/50"
                                                        }`}
                                                    >
                                                        <div className={`w-1 h-3 bg-[#4D94FF] rounded-full transition-opacity ${isReconSelected(seriesItem.id, recon.id) ? "opacity-100" : "opacity-30"}`}></div>
                                                        <span className={`text-[11px] font-bold ${isReconSelected(seriesItem.id, recon.id) ? "text-[#1E88E5]" : "text-[#546E7A]"}`}>{recon.recon_name}</span>
                                                        {isReconSelected(seriesItem.id, recon.id) && <ChevronRight size={12} className="ml-auto text-[#1E88E5]" />}
                                                    </div>
                                                ))}
                                                <button className="mt-0.5 w-full py-1.5 bg-white border border-[#4D94FF]/10 text-[#4D94FF] hover:border-[#4D94FF]/30 rounded text-[10px] font-black transition-all flex items-center justify-center gap-1.5 shadow-sm">
                                                    <Plus size={10} strokeWidth={3} /> 新增重建
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={() => setSelection({ type: "dose" })}
                                className={`flex items-center justify-between px-4 py-3 rounded-md text-[13px] font-bold transition-all mt-1 border ${
                                    selection.type === "dose"
                                        ? "bg-[#E3F2FD] border-[#4D94FF] text-[#1E88E5] shadow-sm"
                                        : "text-[#546E7A] border-transparent hover:bg-gray-50"
                                }`}
                            >
                                剂量 / 通知阈值
                                <ChevronRight size={14} className={selection.type === "dose" ? "text-[#1E88E5]" : "text-[#90A4AE] group-hover:text-[#4D94FF]"} />
                            </button>
                            <button className="flex items-center justify-between px-4 py-3 rounded-md text-[13px] font-bold text-[#546E7A] hover:bg-gray-50 transition-colors group">
                                高级设置
                                <ChevronRight size={14} className="text-[#90A4AE] group-hover:text-[#4D94FF]" />
                            </button>
                        </nav>
                    </div>
                </aside>

                <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm flex flex-col overflow-hidden">
                    {selection.type === "basic" && (
                        <BasicInfoPanel
                            protocol={protocol}
                            draft={basicDraft}
                            selectedPos={selectedPos}
                            onPosChange={setSelectedPos}
                            onDraftChange={(patch) => setBasicDraft((current) => ({ ...current, ...patch }))}
                        />
                    )}
                    {selection.type === "series" && activeSeries?.series_type === "topogram" && (
                        <ScoutParamsPanel
                            draft={seriesDraft}
                            onDraftChange={(patch) => setSeriesDraft((current) => ({ ...current, ...patch }))}
                        />
                    )}
                    {selection.type === "series" && activeSeries && activeSeries.series_type !== "topogram" && (
                        <HelicalParamsPanel
                            series={activeSeries}
                            draft={seriesDraft}
                            onDraftChange={(patch) => setSeriesDraft((current) => ({ ...current, ...patch }))}
                        />
                    )}
                    {selection.type === "recon" && activeSeries && activeRecon && (
                        <ReconParamsPanel
                            series={activeSeries}
                            draft={reconDraft}
                            onDraftChange={(patch) => setReconDraft((current) => ({ ...current, ...patch }))}
                        />
                    )}
                    {selection.type === "dose" && (
                        <DoseParamsPanel protocol={protocol} />
                    )}
                </section>
            </main>

            <footer className="flex items-center justify-end gap-3 px-5 h-[56px] bg-[#E8EAF1] border-t border-[#B0C4DE] shrink-0">
                {saveMessage && (
                    <span className={`mr-auto text-[12px] font-bold ${saveMessage.includes("失败") ? "text-[#D32F2F]" : "text-[#1E88E5]"}`}>
                        {saveMessage}
                    </span>
                )}
                <button
                    onClick={() => navigate(-1)}
                    className="h-[36px] px-6 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#546E7A] hover:bg-[#DCE6F2] transition-colors"
                >
                    取消
                </button>
                <button
                    onClick={() => void handleSave()}
                    disabled={isSaving || selection.type === "dose"}
                    className="h-[36px] px-6 bg-[#4D94FF] rounded-md text-[13px] font-bold text-white hover:bg-[#1E88E5] transition-colors disabled:bg-[#B0C4DE] disabled:cursor-not-allowed"
                >
                    {isSaving ? "保存中..." : "保存"}
                </button>
            </footer>
        </div>
    );
}