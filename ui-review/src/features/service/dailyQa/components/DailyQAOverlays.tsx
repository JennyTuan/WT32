import { AlertTriangle, Printer } from "lucide-react";

import type { DailyQaRecord, PhantomType } from "../types";

type DailyQAOverlaysProps = {
  analysisStage: string;
  isRunningQa: boolean;
  onCancel: () => void;
  onClosePreview: () => void;
  onConfirm: () => void;
  onPrintPreview: () => void;
  phantomType: PhantomType;
  previewRecord: DailyQaRecord | null;
  showAnalyzeConfirm: boolean;
};

export function DailyQAOverlays({
  analysisStage,
  isRunningQa,
  onCancel,
  onClosePreview,
  onConfirm,
  onPrintPreview,
  phantomType,
  previewRecord,
  showAnalyzeConfirm,
}: DailyQAOverlaysProps) {
  return (
    <>
      {showAnalyzeConfirm && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-[100] flex items-center justify-center animate-in fade-in duration-300">
          <div className="bg-white w-[560px] rounded-[32px] shadow-2xl p-10 flex flex-col relative animate-in zoom-in-95 duration-300">
            <div className="flex gap-6 mb-8">
              <div className="w-14 h-14 rounded-full bg-[#FFF7E6] flex items-center justify-center shrink-0 border border-[#FFE7BA]">
                <AlertTriangle size={32} className="text-[#FA8C16]" />
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="text-[22px] font-black text-[#263238] leading-tight">
                  开始日常 QA 前请确认 {phantomType} 已摆放正确
                </h3>
                <p className="text-[16px] text-[#90A4AE] font-bold leading-relaxed">
                  点击“确认运行”后将模拟采集模体图像、自动生成 ROI、分析指标并写入 QA 报告。
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-4">
              <button
                onClick={onCancel}
                className="px-10 h-12 bg-white border border-[#B0C4DE] text-[#263238] font-black rounded-xl hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
              >
                取消
              </button>
              <button
                onClick={onConfirm}
                className="px-10 h-12 bg-[#2F54EB] text-white font-black rounded-xl hover:bg-[#1D39C4] transition-all active:scale-95 shadow-lg"
              >
                确认运行
              </button>
            </div>
          </div>
        </div>
      )}

      {isRunningQa && (
        <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px] z-[105] flex items-center justify-center">
          <div className="w-[420px] rounded-[28px] bg-white p-10 shadow-2xl text-center">
            <div className="text-[28px] font-black text-[#263238]">日常 QA 运行中</div>
            <div className="mt-4 text-[16px] font-bold text-[#4D94FF]">{analysisStage}</div>
            <div className="mt-6 h-2 rounded-full bg-[#E7EEF8] overflow-hidden">
              <div className="h-full w-[70%] bg-[#4D94FF] animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {previewRecord && (
        <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px] z-[110] flex items-center justify-center">
          <div className="w-[720px] rounded-[28px] bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[24px] font-black text-[#263238]">日常 QA 报告预览</div>
                <div className="mt-2 text-[13px] text-[#6B85A0]">
                  {previewRecord.date} {previewRecord.time} · {previewRecord.phantomType} · {previewRecord.deviceName} · {previewRecord.operator}
                </div>
              </div>
              <div className={`px-4 py-2 rounded-full text-[12px] font-black ${previewRecord.judgment === "PASS" ? "bg-[#E8F5E9] text-[#2E7D32]" : "bg-[#FFEBEE] text-[#C62828]"}`}>
                综合判定 {previewRecord.judgment}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4">
              {previewRecord.cards.map((card) => (
                <div key={card.key} className="rounded-xl border border-[#D6E2EF] bg-[#F8FAFC] p-4">
                  <div className="text-[16px] font-black text-[#37474F]">{card.title}</div>
                  <div className="mt-3 text-[13px] text-[#6B85A0]">Limit</div>
                  <div className="mt-1 text-[14px] font-bold text-[#37474F]">{card.limit}</div>
                  <div className="mt-3 text-[13px] text-[#6B85A0]">Actual</div>
                  <div className="mt-1 text-[14px] font-bold text-[#37474F]">{card.actual}</div>
                  <div className="mt-3 text-[13px] text-[#6B85A0]">{card.summary}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClosePreview}
                className="px-6 h-10 rounded-lg border border-[#B0C4DE] bg-white text-[#37474F] font-bold hover:bg-gray-50"
              >
                关闭
              </button>
              <button
                onClick={onPrintPreview}
                className="px-6 h-10 rounded-lg bg-[#4D94FF] text-white font-bold hover:bg-blue-600 flex items-center gap-2"
              >
                <Printer size={14} />
                打印
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
