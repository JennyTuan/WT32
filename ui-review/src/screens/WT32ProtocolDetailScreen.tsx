import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    Plus,
    ChevronRight,
    Info,
    CircleDot,
    ChevronDown,
    X,
} from "lucide-react";

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
        kv: number; ma: number; scan_length: number; tube_angle: number; fov: number;
        ctdi_vol?: number | null; dlp?: number | null;
    } | null;
    helical_param?: {
        kv: number; ma: number; slice_thickness: number; pitch: number;
        rotation_time: number; scan_length: number; fov: number; auto_ma?: boolean;
        ctdi_vol?: number | null; dlp?: number | null;
    } | null;
    axial_param?: {
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

// ── Selection state ────────────────────────────────────────────────────────

type Selection =
    | { type: "basic" }
    | { type: "dose" }
    | { type: "series"; seriesId: number }
    | { type: "recon"; seriesId: number; reconId: number };

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

function FieldInput({ label, value, placeholder, required }: {
    label: string; value?: string | number; placeholder?: string; required?: boolean;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight flex items-center gap-0.5">
                {label}
                {required && <span className="text-red-500 text-[12px] leading-none select-none">*</span>}
            </label>
            <input
                type="text"
                defaultValue={value !== undefined && value !== null ? String(value) : ""}
                placeholder={placeholder}
                key={String(value)}
                className="w-full h-[40px] px-3 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none placeholder:font-normal placeholder:text-[#90A4AE]/40 focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10 shadow-sm"
            />
        </div>
    );
}

function FieldSelect({ label, value, options, required }: {
    label: string; value?: string | number; options: string[]; required?: boolean;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight flex items-center gap-0.5">
                {label}
                {required && <span className="text-red-500 text-[12px] leading-none select-none">*</span>}
            </label>
            <div className="relative">
                <select
                    defaultValue={value !== undefined ? String(value) : options[0]}
                    key={String(value)}
                    className="w-full h-[40px] px-3 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none appearance-none cursor-pointer focus:border-[#4D94FF] shadow-sm"
                >
                    {options.map((o) => <option key={o}>{o}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
            </div>
        </div>
    );
}

function FieldSpinner({ label, value }: { label: string; value?: string | number }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">{label}</label>
            <div className="relative">
                <input
                    type="text"
                    defaultValue={value !== undefined && value !== null ? String(value) : ""}
                    key={String(value)}
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

// ── Right panels ───────────────────────────────────────────────────────────

function BasicInfoPanel({ protocol, selectedPos, onPosChange }: {
    protocol: ApiProtocolDetail | null;
    selectedPos: string;
    onPosChange: (pos: string) => void;
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
                    <FieldInput label="协议名称" value={protocol?.name} required />
                    <FieldSelect label="部位" value={protocol?.body_part} options={[protocol?.body_part ?? "-"]} required />
                    <FieldInput label="体型范围（KG）" value={protocol?.patient_weight} />
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
                                onClick={() => onPosChange(pos.id)}
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

function ScoutParamsPanel({ series }: { series: ApiSeriesDetail }) {
    const p = series.topogram_param;
    return (
        <>
            <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">定位像采集参数 (Scout Params)</span>
                <button className="flex items-center gap-1.5 text-[#94A3B8] hover:text-[#D32F2F] transition-colors group">
                    <X size={14} className="opacity-70 group-hover:opacity-100" />
                    <span className="text-[11px] font-bold">删除该采集队列</span>
                </button>
            </div>
            <div className="flex-1 p-5 overflow-y-auto bg-white">
                <div className="bg-[#EEF6FF] border border-[#BFDBFE] rounded-md px-3 py-2 flex items-center gap-2.5 mb-4 shadow-sm">
                    <div className="w-5 h-5 rounded-full bg-[#4D94FF]/10 flex items-center justify-center shrink-0">
                        <Info size={12} className="text-[#4D94FF]" />
                    </div>
                    <p className="text-[10px] text-[#546E7A] leading-[1.5] font-medium">
                        定位像用于确定扫描区域，通常使用
                        <span className="text-[#4D94FF] font-bold mx-1 underline decoration-dotted underline-offset-2">较低剂量</span>
                        参数以保障患者安全与减少辐射。
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <FieldInput label="名称" value={series.series_label} />
                    <FieldSelect label="模式" value="定位像" options={["定位像", "螺旋扫描", "断层扫描"]} />
                    <Divider />
                    <FieldSelect label="KV" value={p?.kv} options={[String(p?.kv ?? 120), "100", "80"]} required />
                    <FieldInput label="MA (MAX: 240 [SMALL])" value={p?.ma} required />
                    <FieldSelect label="旋转时间 (S)" value="1" options={["1", "0.5", "1.5"]} required />
                    <FieldInput label="准直器 (COLLIMATION)" placeholder="例如: 320.6" />
                    <FieldInput label="扫描长度 (MM)" value={p?.scan_length} required />
                    <FieldSelect label="扫描方向" value="OUT" options={["OUT", "IN"]} required />
                    <FieldInput label="定位像 FOV" value={p?.fov} required />
                    <FieldInput label="DOM (动态扫描)" placeholder="0 或 1" />
                    <FieldInput label="床角度 (ANGLE)" value={p?.tube_angle} required />
                </div>
            </div>
        </>
    );
}

function HelicalParamsPanel({ series }: { series: ApiSeriesDetail }) {
    const p = series.helical_param ?? series.axial_param;
    const typeLabel = SERIES_TYPE_LABEL[series.series_type]?.zh ?? series.series_type;
    const typeKey = series.series_type === "helical" ? "HELICAL PARAMS" : "AXIAL PARAMS";
    return (
        <>
            <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">
                    扫描采集：{series.series_label} ({typeKey})
                </span>
                <button className="flex items-center gap-1.5 text-[#94A3B8] hover:text-[#D32F2F] transition-colors group">
                    <X size={14} className="opacity-70 group-hover:opacity-100" />
                    <span className="text-[11px] font-bold">删除该采集队列</span>
                </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto bg-white">
                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                    <FieldInput label="名称" value={series.series_label} />
                    <FieldSelect label="模式" value={typeLabel} options={[typeLabel, "定位像", "断层扫描"]} />
                    <Divider />
                    <FieldSelect label="KV" value={p?.kv} options={[String(p?.kv ?? 120), "100", "80"]} required />
                    <FieldInput label="MA (MAX: 240 [SMALL])" value={p?.ma} required />
                    <FieldSelect label="旋转时间 (S)" value={p && "rotation_time" in p ? String(p.rotation_time) : "1"} options={["1", "0.5", "1.5"]} required />
                    <FieldInput label="准直器 (COLLIMATION)" placeholder="例如: 32x0.6" required />
                    <FieldInput label="扫描长度 (MM)" value={p?.scan_length} required />
                    <FieldSelect label="扫描方向" value="OUT" options={["OUT", "IN"]} required />
                    <FieldInput label="定位像 FOV" value={p?.fov} required />
                    <FieldInput label="DOM (动态扫描)" value="0" required />
                    {series.series_type === "helical" && series.helical_param && (
                        <FieldInput label="PITCH (螺距)" value={series.helical_param.pitch} required />
                    )}
                    {series.series_type === "axial" && series.axial_param && (
                        <FieldInput label="扫描增量 (MM)" value={series.axial_param.slice_interval} required />
                    )}
                    <FieldInput label="床倾角 (ANGLE)" value="0" required />
                </div>
            </div>
        </>
    );
}

function ReconParamsPanel({ series, recon }: { series: ApiSeriesDetail; recon: ApiReconSeries }) {
    return (
        <>
            <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center justify-between px-6 shrink-0">
                <div className="flex flex-col justify-center">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">
                        所属采集：{series.series_label} / 重建系列：{recon.recon_name}
                    </span>
                    <span className="text-[10px] text-[#94A3B8] font-bold">对应当前采集队列下的一个重建系列</span>
                </div>
                <button className="flex items-center gap-1.5 text-[#94A3B8] hover:text-[#D32F2F] transition-colors group">
                    <X size={14} className="opacity-70 group-hover:opacity-100" />
                    <span className="text-[11px] font-bold">删除该重建系列</span>
                </button>
            </div>
            <div className="flex-1 p-8 overflow-y-auto bg-white">
                <div className="grid grid-cols-2 gap-x-12 gap-y-5">
                    <FieldInput label="系列名称 (组织类型)" value={recon.recon_name} />
                    <FieldInput label="KERNEL (滤波器)" value={recon.kernel} />
                    <FieldSpinner label="层厚 (MM)" value={recon.slice_thickness} />
                    <FieldSpinner label="重建增量 (MM)" value={recon.increment ?? recon.slice_thickness} />
                    <FieldSpinner label="重建 FOV (MM)" value={250} />
                    <FieldSpinner label="MATRIX" value={recon.matrix} />
                    <FieldSpinner label="窗位 (WL)" value={recon.window_level} />
                    <FieldSpinner label="窗宽 (WW)" value={recon.window_width} />
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
    const [protocol, setProtocol] = useState<ApiProtocolDetail | null>(null);
    const [selectedPos, setSelectedPos] = useState("HFS");
    const [selection, setSelection] = useState<Selection>({ type: "basic" });

    useEffect(() => {
        const raw = localStorage.getItem("selectedProtocol");
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as ApiProtocolDetail;
                setProtocol(parsed);
                if (parsed.patient_position) setSelectedPos(parsed.patient_position);
            } catch {
                // leave null
            }
        }
    }, []);

    const series = protocol?.series ?? [];
    const topograms = series.filter((s) => s.series_type === "topogram");
    const acquisitions = series.filter((s) => s.series_type !== "topogram");
    const ageLabel = protocol ? (AGE_LABEL[protocol.age_group] ?? protocol.age_group) : "-";

    // Find the active series/recon for right panel
    const activeSeries = (selection.type === "series" || selection.type === "recon")
        ? series.find((s) => s.id === selection.seriesId) ?? null
        : null;
    const activeRecon = selection.type === "recon" && activeSeries
        ? activeSeries.recon_series.find((r) => r.id === selection.reconId) ?? null
        : null;

    const isSeriesSelected = (id: number) =>
        selection.type === "series" && selection.seriesId === id;
    const isReconSelected = (sid: number, rid: number) =>
        selection.type === "recon" && selection.seriesId === sid && selection.reconId === rid;

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl text-[#37474F] font-sans select-none">
            {/* Header */}
            <header className="flex items-center px-5 h-[52px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <span className="text-[16px] font-bold text-[#37474F]">协议编辑器 (Session Detail)</span>
            </header>

            {/* Main */}
            <main className="flex-1 overflow-hidden p-2 flex gap-3">
                {/* Left Sidebar */}
                <aside className="w-[310px] flex flex-col bg-white border border-[#B0C4DE] rounded-md shadow-sm overflow-hidden shrink-0">
                    <div className="h-[44px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center px-4 shrink-0">
                        <span className="text-[11px] font-black uppercase tracking-wider text-[#37474F]">协议队列 (Protocols)</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
                        {/* Protocol info card */}
                        <div className="p-3 bg-[#F8FAFC] border border-[#EEF2F9] rounded-md">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="font-bold text-sm text-[#37474F]">{protocol?.name ?? "-"}</span>
                                {protocol?.body_part && (
                                    <span className="bg-[#EEF2F9] text-[#546E7A] text-[10px] px-1.5 py-0.5 rounded">{protocol.body_part}</span>
                                )}
                                <span className="bg-[#EEF2F9] text-[#546E7A] text-[10px] px-1.5 py-0.5 rounded">{ageLabel}</span>
                            </div>
                            <div className="flex items-start gap-2 text-[#4D94FF]">
                                <Info size={12} className="shrink-0 mt-0.5" />
                                <p className="text-[10px] leading-tight font-bold">出厂模板：您的修改仅对本次扫描生效。</p>
                            </div>
                        </div>

                        <nav className="flex flex-col gap-2">
                            {/* Basic info */}
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

                            {/* Series list */}
                            <div className="mt-1 flex flex-col">
                                <div className="flex justify-between items-center px-1 mb-2">
                                    <span className="text-[10px] text-[#94A3B8] font-black uppercase tracking-widest">采集队列</span>
                                    <button className="text-[#4D94FF] flex items-center gap-1 text-[11px] hover:underline font-bold px-2 py-1 rounded hover:bg-blue-50 transition-colors">
                                        <Plus size={12} /> 新增
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {/* Topograms */}
                                    {(topograms.length > 0 ? topograms : [{ id: -1, series_label: "定位像", series_type: "topogram" as const, recon_series: [] }]).map((s) => (
                                        <div
                                            key={s.id}
                                            onClick={() => s.id !== -1 && setSelection({ type: "series", seriesId: s.id })}
                                            className={`rounded-md px-3 py-2 cursor-pointer transition-colors shadow-sm flex justify-between items-start ${
                                                isSeriesSelected(s.id)
                                                    ? "bg-[#4D94FF] text-white"
                                                    : "bg-[#F8FAFC] border border-[#EEF2F9] hover:bg-[#F3F8FF]"
                                            }`}
                                        >
                                            <span className={`text-[11px] font-bold ${isSeriesSelected(s.id) ? "text-white" : "text-[#37474F]"}`}>{s.series_label}</span>
                                            <span className={`text-[10px] mt-0.5 ${isSeriesSelected(s.id) ? "text-white/80" : "opacity-50"}`}>
                                                {SERIES_TYPE_LABEL[s.series_type]?.en ?? s.series_type.toUpperCase()}
                                            </span>
                                        </div>
                                    ))}

                                    {/* Acquisitions */}
                                    {acquisitions.map((s) => (
                                        <div key={s.id} className="flex flex-col rounded-md border border-[#EEF2F9] bg-[#F8FAFC] overflow-hidden shadow-sm">
                                            <div
                                                onClick={() => setSelection({ type: "series", seriesId: s.id })}
                                                className={`px-3 py-2.5 flex justify-between items-center border-b border-[#EEF2F9] cursor-pointer transition-colors ${
                                                    isSeriesSelected(s.id)
                                                        ? "bg-[#4D94FF] border-[#4D94FF]/20"
                                                        : "hover:bg-[#F3F8FF]"
                                                }`}
                                            >
                                                <span className={`text-[11px] font-bold ${isSeriesSelected(s.id) ? "text-white" : "text-[#546E7A]"}`}>{s.series_label}</span>
                                                <span className={`text-[10px] font-medium uppercase tracking-tight ${isSeriesSelected(s.id) ? "text-white/80" : "text-[#94A3B8]"}`}>
                                                    {SERIES_TYPE_LABEL[s.series_type]?.zh ?? s.series_type}
                                                </span>
                                            </div>

                                            <div className="p-2 flex flex-col gap-1">
                                                {s.recon_series.map((recon) => (
                                                    <div
                                                        key={recon.id}
                                                        onClick={() => setSelection({ type: "recon", seriesId: s.id, reconId: recon.id })}
                                                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                                                            isReconSelected(s.id, recon.id)
                                                                ? "bg-[#E3F2FD] shadow-sm"
                                                                : "hover:bg-[#E3F2FD]/50"
                                                        }`}
                                                    >
                                                        <div className={`w-1 h-3 bg-[#4D94FF] rounded-full transition-opacity ${isReconSelected(s.id, recon.id) ? "opacity-100" : "opacity-30"}`}></div>
                                                        <span className={`text-[11px] font-bold ${isReconSelected(s.id, recon.id) ? "text-[#1E88E5]" : "text-[#546E7A]"}`}>{recon.recon_name}</span>
                                                        {isReconSelected(s.id, recon.id) && <ChevronRight size={12} className="ml-auto text-[#1E88E5]" />}
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

                {/* Right Panel */}
                <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm flex flex-col overflow-hidden">
                    {selection.type === "basic" && (
                        <BasicInfoPanel protocol={protocol} selectedPos={selectedPos} onPosChange={setSelectedPos} />
                    )}
                    {selection.type === "series" && activeSeries?.series_type === "topogram" && (
                        <ScoutParamsPanel series={activeSeries} />
                    )}
                    {selection.type === "series" && activeSeries && activeSeries.series_type !== "topogram" && (
                        <HelicalParamsPanel series={activeSeries} />
                    )}
                    {selection.type === "recon" && activeSeries && activeRecon && (
                        <ReconParamsPanel series={activeSeries} recon={activeRecon} />
                    )}
                    {selection.type === "dose" && (
                        <DoseParamsPanel protocol={protocol} />
                    )}
                </section>
            </main>

            {/* Footer */}
            <footer className="flex items-center justify-end gap-3 px-5 h-[56px] bg-[#E8EAF1] border-t border-[#B0C4DE] shrink-0">
                <button
                    onClick={() => navigate(-1)}
                    className="h-[36px] px-6 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#546E7A] hover:bg-[#DCE6F2] transition-colors"
                >
                    取消
                </button>
                <button className="h-[36px] px-6 bg-[#4D94FF] rounded-md text-[13px] font-bold text-white hover:bg-[#1E88E5] transition-colors">
                    保存
                </button>
            </footer>
        </div>
    );
}
