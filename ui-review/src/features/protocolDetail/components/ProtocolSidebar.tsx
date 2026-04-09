import { Info, Plus, ChevronRight } from "lucide-react";
import type { 
    ApiProtocolDetail, 
    ApiSeriesDetail, 
    Selection 
} from "../types";
import { SERIES_TYPE_LABEL } from "../constants";

interface ProtocolSidebarProps {
    protocol: ApiProtocolDetail | null;
    isNewMode: boolean;
    selection: Selection;
    onSelect: (selection: Selection) => void;
    onAppendSeries: (type: ApiSeriesDetail["series_type"]) => void;
    onAppendRecon: (seriesId: number) => void;
    ageLabel: string;
}

export function ProtocolSidebar({
    protocol,
    isNewMode,
    selection,
    onSelect,
    onAppendSeries,
    onAppendRecon,
    ageLabel
}: ProtocolSidebarProps) {
    const series = protocol?.series ?? [];
    const topograms = series.filter((item) => item.series_type === "topogram");
    const acquisitions = series.filter((item) => item.series_type !== "topogram");

    const isSeriesSelected = (id: number) => selection.type === "series" && selection.seriesId === id;
    const isReconSelected = (seriesId: number, reconId: number) =>
        selection.type === "recon" && selection.seriesId === seriesId && selection.reconId === reconId;

    return (
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
                        onClick={() => onSelect({ type: "basic" })}
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
                                onClick={() => onAppendSeries("helical")}
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
                                            onSelect({ type: "series", seriesId: seriesItem.id });
                                            return;
                                        }
                                        onAppendSeries("topogram");
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
                                        onClick={() => onSelect({ type: "series", seriesId: seriesItem.id })}
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
                                                onClick={() => onSelect({ type: "recon", seriesId: seriesItem.id, reconId: recon.id })}
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
                                            onClick={() => onAppendRecon(seriesItem.id)}
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
                        onClick={() => onSelect({ type: "dose" })}
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
    );
}
