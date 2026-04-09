import { useEffect, useMemo, useRef, useState } from "react";
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
    createAdHocScanSessionForSelectedPatient,
    createScanSessionSeries,
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
    recon_fov?: number | null;
    center_x?: number | null;
    center_y?: number | null;
};

type ApiSeriesDetail = {
    id: number;
    series_type: "topogram" | "helical" | "axial" | "4d";
    series_label: string;
    topogram_param?: {
        id?: number;
        kv: number; ma: number; scan_length: number; tube_angle: number; fov: number;
        collimator?: string | null; scan_direction?: string | null; dom?: string | null;
        ctdi_vol?: number | null; dlp?: number | null;
    } | null;
    helical_param?: {
        id?: number;
        kv: number; ma: number; slice_thickness: number; pitch: number;
        rotation_time: number; scan_length: number; fov: number; auto_ma?: boolean;
        collimator?: string | null; scan_direction?: string | null; dom?: string | null;
        ctdi_vol?: number | null; dlp?: number | null;
    } | null;
    axial_param?: {
        id?: number;
        kv: number; ma: number; slice_thickness: number; slice_interval: number;
        rotation_time: number; scan_length: number; fov: number; step_count?: number | null;
        collimator?: string | null; scan_direction?: string | null; dom?: string | null;
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
    scan_mode: "plain" | "contrast" | "4d";
    description?: string | null;
    is_factory: boolean;
    series: ApiSeriesDetail[];
};

type ApiProtocolSummary = {
    id: number;
    name: string;
    body_part: string;
    age_group: "adult" | "child" | "infant";
    patient_weight: string;
    patient_position: string;
    table_direction: string;
    description?: string | null;
    is_factory: boolean;
    series_count: number;
    supported_modes: ApiSeriesDetail["series_type"][];
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "";

const buildApiUrl = (path: string) => {
    if (!API_BASE_URL) return path;
    return `${API_BASE_URL}${path}`;
};

const fetchProtocolCatalogWithFallback = async () => {
    const candidates = API_BASE_URL
        ? [buildApiUrl("/api/protocols/catalog"), "/api/protocols/catalog"]
        : ["/api/protocols/catalog", "http://127.0.0.1:8000/api/protocols/catalog"];

    let lastError: Error | null = null;

    for (const url of candidates) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                lastError = new Error(`Request failed with status ${response.status}`);
                continue;
            }
            return (await response.json()) as ApiProtocolSummary[];
        } catch (error) {
            lastError = error instanceof Error ? error : new Error("Unknown request error");
        }
    }

    throw lastError ?? new Error("Failed to load protocol catalog");
};

const createDraftSeries = (id: number, seriesType: ApiSeriesDetail["series_type"], index: number): ApiSeriesDetail => {
    if (seriesType === "topogram") {
        return {
            id,
            series_type: "topogram",
            series_label: `定位像 ${index}`,
            topogram_param: {
                kv: 120,
                ma: 50,
                scan_length: 80,
                tube_angle: 270,
                fov: 500,
                collimator: "32x0.6",
                scan_direction: "OUT",
                dom: "0",
            },
            helical_param: null,
            axial_param: null,
            recon_series: [],
        };
    }

    if (seriesType === "axial") {
        return {
            id,
            series_type: "axial",
            series_label: `断层扫描 ${index}`,
            topogram_param: null,
            helical_param: null,
            axial_param: {
                kv: 120,
                ma: 150,
                slice_thickness: 5,
                slice_interval: 5,
                rotation_time: 1,
                scan_length: 120,
                fov: 350,
                step_count: 24,
                collimator: "32x0.6",
                scan_direction: "OUT",
                dom: "0",
            },
            recon_series: [],
        };
    }

    return {
        id,
        series_type: "helical",
        series_label: `螺旋扫描 ${index}`,
        topogram_param: null,
        helical_param: {
            kv: 120,
            ma: 180,
            slice_thickness: 1,
            pitch: 1,
            rotation_time: 1,
            scan_length: 120,
            fov: 350,
            auto_ma: false,
            collimator: "32x0.6",
            scan_direction: "OUT",
            dom: "0",
        },
        axial_param: null,
        recon_series: [],
    };
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
        scan_mode: scanSession.scan_mode,
        description: scanSession.description,
        is_factory: false,
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
                    collimator: series.topogram_param.collimator,
                    scan_direction: series.topogram_param.scan_direction,
                    dom: series.topogram_param.dom,
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
                    collimator: series.helical_param.collimator,
                    scan_direction: series.helical_param.scan_direction,
                    dom: series.helical_param.dom,
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
                    collimator: series.axial_param.collimator,
                    scan_direction: series.axial_param.scan_direction,
                    dom: series.axial_param.dom,
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
const EDITABLE_SERIES_TYPES: ApiSeriesDetail["series_type"][] = ["topogram", "helical", "axial"];
const EDITABLE_SERIES_TYPE_OPTIONS = EDITABLE_SERIES_TYPES.map((type: ApiSeriesDetail["series_type"]) => SERIES_TYPE_LABEL[type].zh);

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
    bodyPart: string;
    ageGroup: "adult" | "child" | "infant";
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
    collimator: string;
    scanDirection: string;
    dom: string;
};

type ReconDraft = {
    reconName: string;
    kernel: string;
    sliceThickness: string;
    increment: string;
    matrix: string;
    windowLevel: string;
    windowWidth: string;
    reconFov: string;
    centerX: string;
    centerY: string;
};

// ── Right panels ───────────────────────────────────────────────────────────

function BasicInfoPanel({ protocol, draft, selectedPos, bodyPartOptions, ageGroupOptions, onPosChange, onDraftChange }: {
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

function ScoutParamsPanel({ draft, canEditMode, onModeChange, onDelete, onDraftChange }: {
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
                    <FieldInput label="DOM" value={draft.dom} placeholder="0 或 1" onChange={(value) => onDraftChange({ dom: value })} />
                    <FieldInput label="床角度 (ANGLE)" value={draft.tubeAngle} required onChange={(value) => onDraftChange({ tubeAngle: value })} />
                </div>
            </div>
        </>
    );
}

function HelicalParamsPanel({ series, draft, canEditMode, onModeChange, onDelete, onDraftChange }: {
    series: ApiSeriesDetail;
    draft: SeriesDraft;
    canEditMode?: boolean;
    onModeChange?: (value: string) => void;
    onDelete?: () => void;
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
                    <FieldInput label="DOM" value={draft.dom} placeholder="0 或 1" onChange={(value) => onDraftChange({ dom: value })} />
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

function ReconParamsPanel({ series, draft, onDelete, onDraftChange }: {
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
    const isViewMode = searchParams.get("mode") === "view";
    const source = searchParams.get("source");
    const isCatalogSource = source === "catalog";
    const protocolId = searchParams.get("id");
    const [protocol, setProtocol] = useState<ApiProtocolDetail | null>(null);
    const isFactory = protocol?.is_factory === true;
    const isReadOnly = isViewMode || (isCatalogSource && isFactory);
    const [catalogProtocols, setCatalogProtocols] = useState<ApiProtocolSummary[]>([]);
    const [selectedPos, setSelectedPos] = useState("HFS");
    const [selection, setSelection] = useState<Selection>({ type: "basic" });
    const [basicDraft, setBasicDraft] = useState<BasicDraft>({ name: "", bodyPart: "", ageGroup: "adult", patientWeight: "", patientPosition: "HFS" });
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
        collimator: "",
        scanDirection: "OUT",
        dom: "0",
    });
    const [reconDraft, setReconDraft] = useState<ReconDraft>({
        reconName: "",
        kernel: "",
        sliceThickness: "",
        increment: "",
        matrix: "",
        windowLevel: "",
        windowWidth: "",
        reconFov: "250",
        centerX: "0",
        centerY: "0",
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const tempSeriesIdRef = useRef(-1);

    const bodyPartOptions = useMemo(() => {
        const options = Array.from(new Set(catalogProtocols.map((item) => item.body_part.trim()).filter(Boolean)));
        if (options.length > 0) return options;
        if (protocol?.body_part) return [protocol.body_part];
        return [];
    }, [catalogProtocols, protocol?.body_part]);

    const ageGroupOptions = useMemo<BasicDraft["ageGroup"][]>(() => {
        const options = Array.from(new Set(catalogProtocols.map((item) => item.age_group))) as BasicDraft["ageGroup"][];
        if (options.length > 0) return options;
        if (protocol?.age_group) return [protocol.age_group as BasicDraft["ageGroup"]];
        return ["adult"];
    }, [catalogProtocols, protocol?.age_group]);

    useEffect(() => {
        let cancelled = false;

        const loadCatalog = async () => {
            try {
                const data = await fetchProtocolCatalogWithFallback();
                if (!cancelled) {
                    setCatalogProtocols(data);
                }
            } catch (error) {
                console.error(error);
                if (!cancelled) {
                    setCatalogProtocols([]);
                }
            }
        };

        void loadCatalog();

        return () => {
            cancelled = true;
        };
    }, []);

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
                name: "新建协议",
                body_part: bodyPartOptions[0] || "",
                age_group: "adult",
                patient_weight: "50-90kg",
                patient_position: "HFS",
                table_direction: "in",
                scan_mode: "plain",
                is_factory: false,
                series: [],
            });
            return;
        }

        let cancelled = false;

        const loadProtocolSource = async () => {
            try {
                if (isCatalogSource && protocolId) {
                    const res = await fetch(buildApiUrl(`/api/protocols/${protocolId}`));
                    if (res.ok) {
                        const data = await res.json();
                        setProtocol(data);
                        if (data.patient_position) setSelectedPos(data.patient_position);
                        return;
                    }
                }

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
    }, [isNewMode, isCatalogSource, protocolId, bodyPartOptions]);

    const series = useMemo(() => protocol?.series ?? [], [protocol?.series]);
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

    // Only reset basicDraft when the actual protocol object/ID changes (initial load or source change)
    useEffect(() => {
        if (!protocol) return;
        setBasicDraft({
            name: protocol.name ?? "",
            bodyPart: protocol.body_part || bodyPartOptions[0] || "",
            ageGroup: (protocol.age_group ?? ageGroupOptions[0] ?? "adult") as BasicDraft["ageGroup"],
            patientWeight: protocol.patient_weight ?? "",
            patientPosition: protocol.patient_position ?? selectedPos,
        });
    }, [protocol?.id]);

    // REMOVED destructive reset: useEffect that was overwriting basicDraft on selectedPos change

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
            collimator: String(activeSeries.topogram_param?.collimator ?? activeSeries.helical_param?.collimator ?? activeSeries.axial_param?.collimator ?? ""),
            scanDirection: String(activeSeries.topogram_param?.scan_direction ?? activeSeries.helical_param?.scan_direction ?? activeSeries.axial_param?.scan_direction ?? "OUT"),
            dom: String(activeSeries.topogram_param?.dom ?? activeSeries.helical_param?.dom ?? activeSeries.axial_param?.dom ?? "0"),
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
            reconFov: String(activeRecon.recon_fov ?? "250"),
            centerX: String(activeRecon.center_x ?? "0"),
            centerY: String(activeRecon.center_y ?? "0"),
        });
    }, [activeRecon, selection.type]);

    const appendDraftSeries = (seriesType: ApiSeriesDetail["series_type"]) => {
        if (!isNewMode) return;

        const nextId = tempSeriesIdRef.current;
        tempSeriesIdRef.current -= 1;

        setProtocol((current) => {
            if (!current) return current;
            const existingCount = current.series.filter((item) => item.series_type === seriesType).length;
            const createdSeries = createDraftSeries(nextId, seriesType, existingCount + 1);
            return {
                ...current,
                series: [...current.series, createdSeries],
            };
        });

        setSelection({ type: "series", seriesId: nextId });
    };

    const appendDraftRecon = (seriesId: number) => {
        if (!isNewMode) return;

        const nextId = tempSeriesIdRef.current;
        tempSeriesIdRef.current -= 1;

        setProtocol((current) => {
            if (!current) return current;
            return {
                ...current,
                series: current.series.map((item) => {
                    if (item.id !== seriesId) return item;
                    const nextReconIndex = item.recon_series.length + 1;
                    return {
                        ...item,
                        recon_series: [
                            ...item.recon_series,
                            {
                                id: nextId,
                                recon_name: `重建 ${nextReconIndex}`,
                                kernel: "STANDARD",
                                matrix: 512,
                                window_width: 400,
                                window_level: 40,
                                slice_thickness: 1,
                                increment: 1,
                            },
                        ],
                    };
                }),
            };
        });

        setSelection({ type: "recon", seriesId, reconId: nextId });
    };

    const isSeriesSelected = (id: number) => selection.type === "series" && selection.seriesId === id;
    const isReconSelected = (seriesId: number, reconId: number) =>
        selection.type === "recon" && selection.seriesId === seriesId && selection.reconId === reconId;

    const handleDeleteActiveSeries = () => {
        if (!activeSeries) return;

        if (isNewMode) {
            setProtocol((current) => {
                if (!current) return current;
                const remainingSeries = current.series.filter((seriesItem) => seriesItem.id !== activeSeries.id);
                return {
                    ...current,
                    series: remainingSeries,
                };
            });

            const remainingSeries = series.filter((seriesItem) => seriesItem.id !== activeSeries.id);
            if (remainingSeries.length > 0) {
                setSelection({ type: "series", seriesId: remainingSeries[0].id });
            } else {
                setSelection({ type: "basic" });
            }
            return;
        }
    };

    const handleDeleteActiveRecon = () => {
        if (!activeSeries || !activeRecon) return;

        if (isNewMode) {
            setProtocol((current) => {
                if (!current) return current;
                return {
                    ...current,
                    series: current.series.map((seriesItem) => (
                        seriesItem.id !== activeSeries.id
                            ? seriesItem
                            : {
                                ...seriesItem,
                                recon_series: seriesItem.recon_series.filter((reconItem) => reconItem.id !== activeRecon.id),
                            }
                    )),
                };
            });

            const remainingRecon = activeSeries.recon_series.filter((reconItem) => reconItem.id !== activeRecon.id);
            if (remainingRecon.length > 0) {
                setSelection({ type: "recon", seriesId: activeSeries.id, reconId: remainingRecon[0].id });
            } else {
                setSelection({ type: "series", seriesId: activeSeries.id });
            }
            return;
        }
    };

    const handleSeriesModeChange = (modeLabel: string) => {
        if (!isNewMode || !activeSeries) return;

        const nextType = EDITABLE_SERIES_TYPES.find((type: ApiSeriesDetail["series_type"]) => SERIES_TYPE_LABEL[type].zh === modeLabel);
        if (!nextType || nextType === activeSeries.series_type) return;

        setProtocol((current) => {
            if (!current) return current;
            return {
                ...current,
                series: current.series.map((seriesItem) => {
                    if (seriesItem.id !== activeSeries.id) return seriesItem;
                    const renamedLabel =
                        nextType === "topogram"
                            ? seriesItem.series_label.replace(/螺旋扫描|断层扫描/g, "定位像")
                            : nextType === "helical"
                                ? seriesItem.series_label.replace(/定位像|断层扫描/g, "螺旋扫描")
                                : seriesItem.series_label.replace(/定位像|螺旋扫描/g, "断层扫描");

                    return {
                        ...seriesItem,
                        series_type: nextType,
                        series_label: renamedLabel,
                        topogram_param: nextType === "topogram"
                            ? (seriesItem.topogram_param ?? { kv: 120, ma: 50, scan_length: 80, tube_angle: 270, fov: 500 })
                            : null,
                        helical_param: nextType === "helical"
                            ? (seriesItem.helical_param ?? { kv: 120, ma: 180, slice_thickness: 1, pitch: 1, rotation_time: 1, scan_length: 120, fov: 350, auto_ma: false })
                            : null,
                        axial_param: nextType === "axial"
                            ? (seriesItem.axial_param ?? { kv: 120, ma: 150, slice_thickness: 5, slice_interval: 5, rotation_time: 1, scan_length: 120, fov: 350, step_count: 24 })
                            : null,
                    };
                }),
            };
        });
    };

    const parseNumber = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const saveToCatalog = async () => {
        if (!protocol) return;
        setIsSaving(true);
        setSaveMessage(null);

        try {
            // Collect full protocol payload for nested persistence
            const finalSeries = series.map((s, idx) => {
                const isSeriesActive = (selection.type === "series" || selection.type === "recon") && s.id === selection.seriesId;
                const activeRId = selection.type === "recon" ? selection.reconId : undefined;
                
                // If it's the active series, use seriesDraft, otherwise use existing series data
                const sLabel = (isSeriesActive && selection.type === "series") ? seriesDraft.seriesLabel.trim() : s.series_label;
                
                return {
                    series_order: idx + 1,
                    series_type: s.series_type,
                    series_label: sLabel || s.series_label,
                    topogram_param: s.topogram_param ? {
                        kv: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.kv) ?? s.topogram_param.kv) : s.topogram_param.kv,
                        ma: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.ma) ?? s.topogram_param.ma) : s.topogram_param.ma,
                        scan_length: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.scanLength) ?? s.topogram_param.scan_length) : s.topogram_param.scan_length,
                        tube_angle: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.tubeAngle) ?? s.topogram_param.tube_angle) : s.topogram_param.tube_angle,
                        fov: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.fov) ?? s.topogram_param.fov) : s.topogram_param.fov,
                        collimator: (isSeriesActive && selection.type === "series") ? (seriesDraft.collimator || s.topogram_param.collimator) : s.topogram_param.collimator,
                        scan_direction: (isSeriesActive && selection.type === "series") ? (seriesDraft.scanDirection || s.topogram_param.scan_direction) : s.topogram_param.scan_direction,
                        dom: (isSeriesActive && selection.type === "series") ? (seriesDraft.dom || s.topogram_param.dom) : s.topogram_param.dom,
                    } : null,
                    helical_param: s.helical_param ? {
                        kv: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.kv) ?? s.helical_param.kv) : s.helical_param.kv,
                        ma: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.ma) ?? s.helical_param.ma) : s.helical_param.ma,
                        slice_thickness: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.sliceThickness) ?? s.helical_param.slice_thickness) : s.helical_param.slice_thickness,
                        pitch: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.pitch) ?? s.helical_param.pitch) : s.helical_param.pitch,
                        rotation_time: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.rotationTime) ?? s.helical_param.rotation_time) : s.helical_param.rotation_time,
                        scan_length: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.scanLength) ?? s.helical_param.scan_length) : s.helical_param.scan_length,
                        fov: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.fov) ?? s.helical_param.fov) : s.helical_param.fov,
                        auto_ma: s.helical_param.auto_ma,
                        collimator: (isSeriesActive && selection.type === "series") ? (seriesDraft.collimator || s.helical_param.collimator) : s.helical_param.collimator,
                        scan_direction: (isSeriesActive && selection.type === "series") ? (seriesDraft.scanDirection || s.helical_param.scan_direction) : s.helical_param.scan_direction,
                        dom: (isSeriesActive && selection.type === "series") ? (seriesDraft.dom || s.helical_param.dom) : s.helical_param.dom,
                    } : null,
                    axial_param: s.axial_param ? {
                        kv: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.kv) ?? s.axial_param.kv) : s.axial_param.kv,
                        ma: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.ma) ?? s.axial_param.ma) : s.axial_param.ma,
                        slice_thickness: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.sliceThickness) ?? s.axial_param.slice_thickness) : s.axial_param.slice_thickness,
                        slice_interval: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.sliceInterval) ?? s.axial_param.slice_interval) : s.axial_param.slice_interval,
                        rotation_time: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.rotationTime) ?? s.axial_param.rotation_time) : s.axial_param.rotation_time,
                        scan_length: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.scanLength) ?? s.axial_param.scan_length) : s.axial_param.scan_length,
                        fov: (isSeriesActive && selection.type === "series") ? (parseNumber(seriesDraft.fov) ?? s.axial_param.fov) : s.axial_param.fov,
                        step_count: s.axial_param.step_count,
                        collimator: (isSeriesActive && selection.type === "series") ? (seriesDraft.collimator || s.axial_param.collimator) : s.axial_param.collimator,
                        scan_direction: (isSeriesActive && selection.type === "series") ? (seriesDraft.scanDirection || s.axial_param.scan_direction) : s.axial_param.scan_direction,
                        dom: (isSeriesActive && selection.type === "series") ? (seriesDraft.dom || s.axial_param.dom) : s.axial_param.dom,
                    } : null,
                    recon_series: s.recon_series.map(r => {
                        const isReconActive = isSeriesActive && selection.type === "recon" && r.id === activeRId;
                        return {
                            recon_name: isReconActive ? (reconDraft.reconName.trim() || r.recon_name) : r.recon_name,
                            recon_type: "soft",
                            kernel: isReconActive ? (reconDraft.kernel.trim() || r.kernel) : r.kernel,
                            matrix: isReconActive ? (parseNumber(reconDraft.matrix) ?? r.matrix) : r.matrix,
                            window_width: isReconActive ? (parseNumber(reconDraft.windowWidth) ?? r.window_width) : r.window_width,
                            window_level: isReconActive ? (parseNumber(reconDraft.windowLevel) ?? r.window_level) : r.window_level,
                            slice_thickness: isReconActive ? (parseNumber(reconDraft.sliceThickness) ?? r.slice_thickness) : r.slice_thickness,
                            increment: isReconActive ? (parseNumber(reconDraft.increment) ?? r.increment) : r.increment,
                            recon_fov: isReconActive ? (parseNumber(reconDraft.reconFov) ?? r.recon_fov ?? 250) : (r.recon_fov ?? 250),
                            center_x: isReconActive ? (parseNumber(reconDraft.centerX) ?? r.center_x ?? 0) : (r.center_x ?? 0),
                            center_y: isReconActive ? (parseNumber(reconDraft.centerY) ?? r.center_y ?? 0) : (r.center_y ?? 0),
                        };
                    })
                };
            });

            const payload = {
                name: basicDraft.name.trim() || protocol.name,
                body_part: basicDraft.bodyPart,
                age_group: basicDraft.ageGroup,
                patient_weight: basicDraft.patientWeight.trim(),
                patient_position: basicDraft.patientPosition,
                table_direction: protocol.table_direction || "in",
                scan_mode: protocol.scan_mode || "plain",
                description: protocol.description || "",
                series: finalSeries
            };

            const url = isNewMode
                ? buildApiUrl("/api/protocols/full")
                : buildApiUrl(`/api/protocols/${protocolId}/full`);
            
            const method = isNewMode ? "POST" : "PUT";

            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("保存协议至目录失败");

            setSaveMessage("协议已更新");
            setTimeout(() => navigate(-1), 1000);
        } catch (error) {
            console.error("Save to catalog failed:", error);
            setSaveMessage("保存失败，请重试");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        if (!protocol) return;

        if (isCatalogSource) {
            await saveToCatalog();
            return;
        }

        setIsSaving(true);
        setSaveMessage(null);

        try {
            if (isNewMode) {
                // ... ad hoc session save logic remains here ...
                let nextProtocol = {
                    ...protocol,
                    name: basicDraft.name.trim() || protocol.name,
                    body_part: basicDraft.bodyPart,
                    age_group: basicDraft.ageGroup,
                    patient_weight: basicDraft.patientWeight.trim(),
                    patient_position: basicDraft.patientPosition,
                };

                if (selection.type === "series" && activeSeries) {
                    nextProtocol = {
                        ...nextProtocol,
                        series: nextProtocol.series.map((seriesItem) => {
                            if (seriesItem.id !== activeSeries.id) return seriesItem;
                            return {
                                ...seriesItem,
                                series_label: seriesDraft.seriesLabel.trim() || seriesItem.series_label,
                                topogram_param: seriesItem.series_type === "topogram"
                                    ? {
                                        ...(seriesItem.topogram_param ?? { kv: 120, ma: 50, scan_length: 80, tube_angle: 270, fov: 500 }),
                                        kv: parseNumber(seriesDraft.kv) ?? seriesItem.topogram_param?.kv ?? 120,
                                        ma: parseNumber(seriesDraft.ma) ?? seriesItem.topogram_param?.ma ?? 50,
                                        scan_length: parseNumber(seriesDraft.scanLength) ?? seriesItem.topogram_param?.scan_length ?? 80,
                                        fov: parseNumber(seriesDraft.fov) ?? seriesItem.topogram_param?.fov ?? 500,
                                        tube_angle: parseNumber(seriesDraft.tubeAngle) ?? seriesItem.topogram_param?.tube_angle ?? 270,
                                        collimator: seriesDraft.collimator || seriesItem.topogram_param?.collimator,
                                        scan_direction: seriesDraft.scanDirection || seriesItem.topogram_param?.scan_direction,
                                        dom: seriesDraft.dom || seriesItem.topogram_param?.dom,
                                    }
                                    : seriesItem.topogram_param,
                                helical_param: seriesItem.series_type === "helical"
                                    ? {
                                        ...(seriesItem.helical_param ?? { kv: 120, ma: 180, slice_thickness: 1, pitch: 1, rotation_time: 1, scan_length: 120, fov: 350, auto_ma: false }),
                                        kv: parseNumber(seriesDraft.kv) ?? seriesItem.helical_param?.kv ?? 120,
                                        ma: parseNumber(seriesDraft.ma) ?? seriesItem.helical_param?.ma ?? 180,
                                        scan_length: parseNumber(seriesDraft.scanLength) ?? seriesItem.helical_param?.scan_length ?? 120,
                                        fov: parseNumber(seriesDraft.fov) ?? seriesItem.helical_param?.fov ?? 350,
                                        rotation_time: parseNumber(seriesDraft.rotationTime) ?? seriesItem.helical_param?.rotation_time ?? 1,
                                        pitch: parseNumber(seriesDraft.pitch) ?? seriesItem.helical_param?.pitch ?? 1,
                                        slice_thickness: parseNumber(seriesDraft.sliceThickness) ?? seriesItem.helical_param?.slice_thickness ?? 1,
                                        collimator: seriesDraft.collimator || seriesItem.helical_param?.collimator,
                                        scan_direction: seriesDraft.scanDirection || seriesItem.helical_param?.scan_direction,
                                        dom: seriesDraft.dom || seriesItem.helical_param?.dom,
                                    }
                                    : seriesItem.helical_param,
                                axial_param: seriesItem.series_type === "axial"
                                    ? {
                                        ...(seriesItem.axial_param ?? { kv: 120, ma: 150, slice_thickness: 5, slice_interval: 5, rotation_time: 1, scan_length: 120, fov: 350, step_count: 24 }),
                                        kv: parseNumber(seriesDraft.kv) ?? seriesItem.axial_param?.kv ?? 120,
                                        ma: parseNumber(seriesDraft.ma) ?? seriesItem.axial_param?.ma ?? 150,
                                        scan_length: parseNumber(seriesDraft.scanLength) ?? seriesItem.axial_param?.scan_length ?? 120,
                                        fov: parseNumber(seriesDraft.fov) ?? seriesItem.axial_param?.fov ?? 350,
                                        rotation_time: parseNumber(seriesDraft.rotationTime) ?? seriesItem.axial_param?.rotation_time ?? 1,
                                        slice_interval: parseNumber(seriesDraft.sliceInterval) ?? seriesItem.axial_param?.slice_interval ?? 5,
                                        slice_thickness: parseNumber(seriesDraft.sliceThickness) ?? seriesItem.axial_param?.slice_thickness ?? 5,
                                        collimator: seriesDraft.collimator || seriesItem.axial_param?.collimator,
                                        scan_direction: seriesDraft.scanDirection || seriesItem.axial_param?.scan_direction,
                                        dom: seriesDraft.dom || seriesItem.axial_param?.dom,
                                    }
                                    : seriesItem.axial_param,
                            };
                        }),
                    };
                } else if (selection.type === "recon" && activeSeries && activeRecon) {
                    nextProtocol = {
                        ...nextProtocol,
                        series: nextProtocol.series.map((seriesItem) => {
                            if (seriesItem.id !== activeSeries.id) return seriesItem;
                            return {
                                ...seriesItem,
                                recon_series: seriesItem.recon_series.map((reconItem) => (
                                    reconItem.id !== activeRecon.id
                                        ? reconItem
                                        : {
                                            ...reconItem,
                                            recon_name: reconDraft.reconName.trim() || reconItem.recon_name,
                                            kernel: reconDraft.kernel.trim() || reconItem.kernel,
                                            slice_thickness: parseNumber(reconDraft.sliceThickness) ?? reconItem.slice_thickness,
                                            increment: parseNumber(reconDraft.increment) ?? reconItem.increment ?? reconItem.slice_thickness,
                                            matrix: parseNumber(reconDraft.matrix) ?? reconItem.matrix,
                                            window_level: parseNumber(reconDraft.windowLevel) ?? reconItem.window_level,
                                            window_width: parseNumber(reconDraft.windowWidth) ?? reconItem.window_width,
                                            recon_fov: parseNumber(reconDraft.reconFov) ?? (reconItem as any).recon_fov ?? 250,
                                            center_x: parseNumber(reconDraft.centerX) ?? (reconItem as any).center_x ?? 0,
                                            center_y: parseNumber(reconDraft.centerY) ?? (reconItem as any).center_y ?? 0,
                                        }
                                )),
                            };
                        }),
                    };
                }

                const sourceProtocolId = catalogProtocols.find(
                    (item) => item.body_part === nextProtocol.body_part && item.age_group === nextProtocol.age_group
                )?.id ?? catalogProtocols[0]?.id;

                if (!sourceProtocolId) {
                    throw new Error("No protocol catalog available for ad hoc scan session");
                }

                let savedSession = await createAdHocScanSessionForSelectedPatient({
                    source_protocol_id: sourceProtocolId,
                    session_name: nextProtocol.name,
                    name: nextProtocol.name,
                    body_part: nextProtocol.body_part,
                    age_group: nextProtocol.age_group,
                    patient_weight: nextProtocol.patient_weight,
                    patient_position: nextProtocol.patient_position,
                    table_direction: nextProtocol.table_direction || "in",
                    scan_mode: nextProtocol.series.some((item) => item.series_type === "4d") ? "4d" : "plain",
                    description: nextProtocol.description ?? null,
                });

                for (const [index, seriesItem] of nextProtocol.series.entries()) {
                    savedSession = await createScanSessionSeries(savedSession.id, {
                        series_order: index + 1,
                        series_type: seriesItem.series_type,
                        series_label: seriesItem.series_label,
                        topogram_param: seriesItem.topogram_param
                            ? {
                                kv: seriesItem.topogram_param.kv,
                                ma: seriesItem.topogram_param.ma,
                                scan_length: seriesItem.topogram_param.scan_length,
                                tube_angle: seriesItem.topogram_param.tube_angle,
                                fov: seriesItem.topogram_param.fov,
                                collimator: seriesItem.topogram_param.collimator,
                                scan_direction: seriesItem.topogram_param.scan_direction,
                                dom: seriesItem.topogram_param.dom,
                                ctdi_vol: seriesItem.topogram_param.ctdi_vol ?? null,
                                dlp: seriesItem.topogram_param.dlp ?? null,
                            }
                            : null,
                        helical_param: seriesItem.helical_param
                            ? {
                                kv: seriesItem.helical_param.kv,
                                ma: seriesItem.helical_param.ma,
                                slice_thickness: seriesItem.helical_param.slice_thickness,
                                pitch: seriesItem.helical_param.pitch,
                                rotation_time: seriesItem.helical_param.rotation_time,
                                scan_length: seriesItem.helical_param.scan_length,
                                fov: seriesItem.helical_param.fov,
                                collimator: seriesItem.helical_param.collimator,
                                scan_direction: seriesItem.helical_param.scan_direction,
                                dom: seriesItem.helical_param.dom,
                                auto_ma: seriesItem.helical_param.auto_ma ?? false,
                                ctdi_vol: seriesItem.helical_param.ctdi_vol ?? null,
                                dlp: seriesItem.helical_param.dlp ?? null,
                            }
                            : null,
                        axial_param: seriesItem.axial_param
                            ? {
                                kv: seriesItem.axial_param.kv,
                                ma: seriesItem.axial_param.ma,
                                slice_thickness: seriesItem.axial_param.slice_thickness,
                                slice_interval: seriesItem.axial_param.slice_interval,
                                rotation_time: seriesItem.axial_param.rotation_time,
                                scan_length: seriesItem.axial_param.scan_length,
                                fov: seriesItem.axial_param.fov,
                                collimator: seriesItem.axial_param.collimator,
                                scan_direction: seriesItem.axial_param.scan_direction,
                                dom: seriesItem.axial_param.dom,
                                step_count: seriesItem.axial_param.step_count ?? null,
                                auto_ma: false,
                                ctdi_vol: seriesItem.axial_param.ctdi_vol ?? null,
                                dlp: seriesItem.axial_param.dlp ?? null,
                            }
                            : null,
                        recon_series: seriesItem.recon_series.map((reconItem) => ({
                            recon_name: reconItem.recon_name,
                            recon_type: "soft",
                            kernel: reconItem.kernel,
                            matrix: reconItem.matrix,
                            window_width: reconItem.window_width,
                            window_level: reconItem.window_level,
                            slice_thickness: reconItem.slice_thickness,
                            increment: reconItem.increment ?? null,
                            recon_fov: (reconItem as any).recon_fov ?? 250,
                            center_x: (reconItem as any).center_x ?? 0,
                            center_y: (reconItem as any).center_y ?? 0,
                        })),
                    });
                }

                setProtocol(mapScanSessionToProtocolDetail(savedSession));
                localStorage.removeItem("selectedProtocol");
                setSaveMessage("本次扫描计划已保存");
                navigate(-1);
                return;
            }

            // Robust handleSave: ensure basic info is ALWAYS saved alongside specific series/recon changes
            await updateSelectedScanSession({
                name: basicDraft.name.trim() || protocol.name,
                body_part: basicDraft.bodyPart,
                age_group: basicDraft.ageGroup,
                patient_weight: basicDraft.patientWeight.trim(),
                patient_position: basicDraft.patientPosition,
            });

            if (selection.type === "series" && activeSeries) {
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
                        collimator: seriesDraft.collimator || activeSeries.topogram_param.collimator || null,
                        scan_direction: seriesDraft.scanDirection || activeSeries.topogram_param.scan_direction || null,
                        dom: seriesDraft.dom || activeSeries.topogram_param.dom || null,
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
                        collimator: seriesDraft.collimator || activeSeries.helical_param.collimator || null,
                        scan_direction: seriesDraft.scanDirection || activeSeries.helical_param.scan_direction || null,
                        dom: seriesDraft.dom || activeSeries.helical_param.dom || null,
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
                        collimator: seriesDraft.collimator || activeSeries.axial_param.collimator || null,
                        scan_direction: seriesDraft.scanDirection || activeSeries.axial_param.scan_direction || null,
                        dom: seriesDraft.dom || activeSeries.axial_param.dom || null,
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
                    recon_fov: parseNumber(reconDraft.reconFov) ?? activeRecon.recon_fov ?? 250,
                    center_x: parseNumber(reconDraft.centerX) ?? activeRecon.center_x ?? 0,
                    center_y: parseNumber(reconDraft.centerY) ?? activeRecon.center_y ?? 0,
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
                                    <button
                                        onClick={() => appendDraftSeries("helical")}
                                        className="text-[#4D94FF] flex items-center gap-1 text-[11px] hover:underline font-bold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                    >
                                        <Plus size={12} /> 新增
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {(topograms.length > 0 ? topograms : [{ id: -1, series_label: "定位像", series_type: "topogram" as const, recon_series: [] }]).map((seriesItem) => (
                                        <div
                                            key={seriesItem.id}
                                            onClick={() => {
                                                if (seriesItem.id !== -1) {
                                                    setSelection({ type: "series", seriesId: seriesItem.id });
                                                    return;
                                                }
                                                appendDraftSeries("topogram");
                                            }}
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
                                                <button
                                                    onClick={() => appendDraftRecon(seriesItem.id)}
                                                    className="mt-0.5 w-full py-1.5 bg-white border border-[#4D94FF]/10 text-[#4D94FF] hover:border-[#4D94FF]/30 rounded text-[10px] font-black transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                                >
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
                            bodyPartOptions={bodyPartOptions}
                            ageGroupOptions={ageGroupOptions}
                            onPosChange={setSelectedPos}
                            onDraftChange={(patch) => setBasicDraft((current) => ({ ...current, ...patch }))}
                        />
                    )}
                    {selection.type === "series" && activeSeries?.series_type === "topogram" && (
                        <ScoutParamsPanel
                            draft={seriesDraft}
                            canEditMode={isNewMode}
                            onModeChange={handleSeriesModeChange}
                            onDelete={handleDeleteActiveSeries}
                            onDraftChange={(patch) => setSeriesDraft((current) => ({ ...current, ...patch }))}
                        />
                    )}
                    {selection.type === "series" && activeSeries && activeSeries.series_type !== "topogram" && (
                        <HelicalParamsPanel
                            series={activeSeries}
                            draft={seriesDraft}
                            canEditMode={isNewMode}
                            onModeChange={handleSeriesModeChange}
                            onDelete={handleDeleteActiveSeries}
                            onDraftChange={(patch) => setSeriesDraft((current) => ({ ...current, ...patch }))}
                        />
                    )}
                    {selection.type === "recon" && activeSeries && activeRecon && (
                        <ReconParamsPanel
                            series={activeSeries}
                            draft={reconDraft}
                            onDelete={handleDeleteActiveRecon}
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
                {!isReadOnly && (
                    <button
                        onClick={() => void handleSave()}
                        disabled={isSaving || selection.type === "dose"}
                        className="h-[36px] px-6 bg-[#4D94FF] rounded-md text-[13px] font-bold text-white hover:bg-[#1E88E5] transition-colors disabled:bg-[#B0C4DE] disabled:cursor-not-allowed"
                    >
                        {isSaving ? "保存中..." : "保存"}
                    </button>
                )}
            </footer>
        </div>
    );
}