import { Calendar as CalendarIcon, History } from "lucide-react";

import type { PhantomType, QACardItem } from "../types";

const QACard = ({ title, limit, actual, status }: QACardItem) => (
  <div className="bg-white border border-[#C8D8EB] rounded-xl px-6 py-5 flex flex-col shadow-sm min-h-[392px]">
    <h3 className="text-[16px] font-black text-[#37474F] mb-5">{title}</h3>

    <div className="bg-black rounded-lg flex items-center justify-center text-white mb-5 min-h-[180px]">
      <span className="text-[12px] text-gray-400 font-bold">等待分析图像</span>
    </div>

    <div className="space-y-3 mb-5">
      <div className="flex justify-between text-[12px] font-bold pb-1 border-b border-[#EEF2F9]">
        <span className="text-[#90A4AE]">limit</span>
        <span className="text-[#90A4AE]">actual</span>
      </div>
      <div className="flex justify-between items-center text-[14px] font-bold">
        <span className="text-[#37474F] leading-tight">{limit}</span>
        <span className="text-[#37474F]">{actual}</span>
      </div>
    </div>

    <div className="mt-auto flex justify-between items-center pt-4 border-t border-[#EEF2F9]">
      <span className="text-[13px] font-bold text-[#37474F]">判定结果</span>
      <div className="px-4 py-1.5 bg-[#CF1322] text-white rounded-full text-[12px] font-black shadow-sm">{status}</div>
    </div>
  </div>
);

type DailyQAContentProps = {
  cards: QACardItem[];
  onAnalyze: () => void;
  onPhantomTypeChange: (value: PhantomType) => void;
  phantomType: PhantomType;
};

export function DailyQAContent({
  cards,
  onAnalyze,
  onPhantomTypeChange,
  phantomType,
}: DailyQAContentProps) {
  return (
    <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm p-6 flex flex-col relative overflow-hidden h-full">
      <div className="flex items-center justify-between mb-5 bg-[#F8FAFC] px-5 py-4 rounded-xl border border-[#E7EEF8] shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-[14px] text-[#90A4AE] font-black">日期</span>
            <div className="flex items-center gap-3 px-4 py-2 bg-white border border-[#B0C4DE] rounded-lg text-[14px] font-bold text-[#37474F] cursor-pointer hover:border-[#4D94FF] transition-all min-w-[162px]">
              2026 / 03 / 02
              <CalendarIcon size={16} className="text-[#4D94FF] ml-auto" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[14px] text-[#90A4AE] font-black">模体</span>
            <div className="relative group">
              <select
                value={phantomType}
                onChange={(event) => onPhantomTypeChange(event.target.value as PhantomType)}
                className="appearance-none bg-white border border-[#B0C4DE] rounded-lg px-4 py-2 text-[14px] font-bold text-[#37474F] focus:outline-none focus:border-[#4D94FF] cursor-pointer pr-10 hover:border-[#4D94FF] transition-all min-w-[100px]"
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%234D94FF%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")',
                  backgroundPosition: "right 0.5rem center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "1rem",
                }}
              >
                <option>水模</option>
                <option>空气模</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onAnalyze}
            className="px-7 h-9 bg-[#4D94FF] text-white font-black rounded-full shadow-lg hover:bg-[#3B82F6] active:bg-[#2563EB] transition-all active:scale-95 text-[14px] flex items-center justify-center"
          >
            一键分析
          </button>
          <button className="px-6 h-9 bg-white border-2 border-[#4D94FF] text-[#4D94FF] font-black rounded-full hover:bg-[#F9FBFC] active:bg-[#E3F2FD] transition-all active:scale-95 text-[14px] flex items-center gap-2 shadow-sm">
            <History size={14} strokeWidth={3} />
            历史记录
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[#F8FAFC] border border-[#E7EEF8] rounded-xl p-4 overflow-hidden">
        <div className="h-full grid grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar">
          {cards.map((card) => (
            <QACard key={card.title} {...card} />
          ))}
        </div>
      </div>
    </section>
  );
}
