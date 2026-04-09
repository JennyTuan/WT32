import { Info, CircleDot, X } from "lucide-react";
import type { 
    ApiProtocolDetail, 
    ApiSeriesDetail, 
    BasicDraft, 
    SeriesDraft, 
    ReconDraft 
} from "../types";
import { AGE_LABEL, ALL_POSITIONS, SERIES_TYPE_LABEL, EDITABLE_SERIES_TYPE_OPTIONS } from "../constants";
import { FieldInput, FieldSelect, FieldSpinner, Divider } from "./SharedUI";

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
                    <FieldInput label="DOM" value={draft.dom} placeholder="0 或 1" onChange={(value) => onDraftChange({ dom: value })} />
                    <FieldInput label="床角度 (ANGLE)" value={draft.tubeAngle} required onChange={(value) => onDraftChange({ tubeAngle: value })} />
                </div>
            </div>
        </>
    );
}

export function HelicalParamsPanel({ series, draft, canEditMode, onModeChange, onDelete, onDraftChange }: {
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

export function DoseParamsPanel({ protocol }: { protocol: ApiProtocolDetail | null }) {
    const series = protocol?.series ?? [];

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

    return (
        <>
            <div className="h-[52px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex flex-col justify-center px-6 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#37474F]">剂量 / 通知阈值</span>
                <span className="text-[10px] text-[#94A3B8] font-bold">参考值可选填；通知阈值用于扫描前确认/告警</span>
            </div>
            <div className="flex-1 p-6 overflow-y-auto bg-white">
                <div className="flex flex-col gap-8">
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
