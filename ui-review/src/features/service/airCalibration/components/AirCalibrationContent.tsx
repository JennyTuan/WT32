import type { CalibrationSelections } from "../types";

const OptionButton = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-full border transition-all flex items-center gap-2 ${active ? "bg-[#4D94FF] text-white border-[#4D94FF] shadow-md" : "bg-white text-[#546E7A] border-[#B0C4DE] hover:bg-gray-50"}`}
  >
    <div className={`w-3 h-3 rounded-full ${active ? "bg-white" : "bg-[#E8EAF1]"}`} />
    <span className="font-bold text-[14px]">{label}</span>
  </button>
);

type AirCalibrationContentProps = {
  handleStartCalibration: () => void;
  resetSelections: () => void;
  selectionState: CalibrationSelections;
  toggleSelection: (key: keyof CalibrationSelections, value: string) => void;
  totalCombinations: number;
};

export function AirCalibrationContent({
  handleStartCalibration,
  resetSelections,
  selectionState,
  toggleSelection,
  totalCombinations,
}: AirCalibrationContentProps) {
  return (
    <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm p-8 flex flex-col relative overflow-hidden h-full">
      <div className="grid grid-cols-2 gap-6 flex-1 h-full overflow-y-auto pr-2 custom-scrollbar">
        <div className="bg-[#F8FAFC] border border-[#B0C4DE] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1.5 h-6 bg-[#4D94FF] rounded-full" />
            <h3 className="text-[18px] font-black text-[#37474F]">旋转速度</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {["1", "2", "0.75"].map((value) => (
              <OptionButton
                key={value}
                label={value}
                active={selectionState.rotationSpeeds.includes(value)}
                onClick={() => toggleSelection("rotationSpeeds", value)}
              />
            ))}
          </div>
        </div>

        <div className="bg-[#F8FAFC] border border-[#B0C4DE] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1.5 h-6 bg-[#4D94FF] rounded-full" />
            <h3 className="text-[18px] font-black text-[#37474F]">焦点</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {["small", "big"].map((value) => (
              <OptionButton
                key={value}
                label={value}
                active={selectionState.focuses.includes(value)}
                onClick={() => toggleSelection("focuses", value)}
              />
            ))}
          </div>
        </div>

        <div className="bg-[#F8FAFC] border border-[#B0C4DE] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1.5 h-6 bg-[#4D94FF] rounded-full" />
            <h3 className="text-[18px] font-black text-[#37474F]">电压</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {["80", "100", "120", "140"].map((value) => (
              <OptionButton
                key={value}
                label={value}
                active={selectionState.voltages.includes(value)}
                onClick={() => toggleSelection("voltages", value)}
              />
            ))}
          </div>
        </div>

        <div className="bg-[#F8FAFC] border border-[#B0C4DE] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1.5 h-6 bg-[#4D94FF] rounded-full" />
            <h3 className="text-[18px] font-black text-[#37474F]">准直器宽度</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {["32*0.6"].map((value) => (
              <OptionButton
                key={value}
                label={value}
                active={selectionState.collimators.includes(value)}
                onClick={() => toggleSelection("collimators", value)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between">
        <div className="text-[14px] font-bold text-[#546E7A]">
          当前组合数：<span className="text-[#1E88E5] text-[18px]">{totalCombinations}</span>
          <span className="text-[#90A4AE] ml-2">(已完成 0, 待校正 {totalCombinations})</span>
        </div>
        <div className="flex items-end gap-4">
          <button
            onClick={resetSelections}
            className="px-6 h-[48px] bg-white border border-[#B0C4DE] text-[#546E7A] font-bold rounded-lg hover:bg-gray-50 transition-all shadow-sm active:scale-95"
          >
            清空记录
          </button>
          <button
            onClick={handleStartCalibration}
            className="flex items-center gap-3 px-12 h-[64px] bg-[#4D94FF] text-white font-black rounded-xl shadow-lg hover:bg-blue-600 transition-all active:scale-95"
          >
            <div className="w-4 h-4 rounded-full bg-white opacity-40" />
            <span className="text-[20px]">开始校正</span>
          </button>
        </div>
      </div>
    </section>
  );
}
