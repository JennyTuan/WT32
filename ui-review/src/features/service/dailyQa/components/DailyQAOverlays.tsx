import { AlertTriangle } from "lucide-react";

import type { PhantomType } from "../types";

type DailyQAOverlaysProps = {
  onCancel: () => void;
  onConfirm: () => void;
  phantomType: PhantomType;
  showAnalyzeConfirm: boolean;
};

export function DailyQAOverlays({
  onCancel,
  onConfirm,
  phantomType,
  showAnalyzeConfirm,
}: DailyQAOverlaysProps) {
  if (!showAnalyzeConfirm) {
    return null;
  }

  return (
    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-[100] flex items-center justify-center animate-in fade-in duration-300">
      <div className="bg-white w-[560px] rounded-[32px] shadow-2xl p-10 flex flex-col relative animate-in zoom-in-95 duration-300">
        <div className="flex gap-6 mb-8">
          <div className="w-14 h-14 rounded-full bg-[#FFF7E6] flex items-center justify-center shrink-0 border border-[#FFE7BA]">
            <AlertTriangle size={32} className="text-[#FA8C16]" />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-[22px] font-black text-[#263238] leading-tight">
              开始日常 QA 前请确认{phantomType}是否摆放正确
            </h3>
            <p className="text-[16px] text-[#90A4AE] font-bold leading-relaxed">
              激光定位应对齐{phantomType}中心点。确认后点击“扫描”开始采集与分析。
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
            className="px-10 h-12 bg-[#2F54EB] text-white font-black rounded-xl hover:bg-[#1D39C4] transition-all active:scale-95 shadow-lg flex items-center justify-center"
          >
            扫描
          </button>
        </div>
      </div>
    </div>
  );
}
