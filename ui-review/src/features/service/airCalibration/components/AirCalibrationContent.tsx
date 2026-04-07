import type { ReactNode } from "react";

import type {
  CalibrationRunStatus,
  CalibrationSelections,
} from "../types";

const OptionButton = ({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-3.5 h-[38px] rounded-full border transition-all inline-flex items-center gap-1.5 ${
      active
        ? "bg-[#4D94FF] text-white border-[#4D94FF] shadow-sm"
        : disabled
          ? "bg-[#F8FAFC] text-[#94A3B8] border-[#D7E3F0] cursor-not-allowed"
          : "bg-white text-[#546E7A] border-[#B0C4DE] hover:bg-gray-50"
    }`}
  >
    <div className={`w-2.5 h-2.5 rounded-full ${active ? "bg-white/95" : "bg-[#D9E2EC]"}`} />
    <span className="font-semibold text-[12px] leading-none">{label}</span>
  </button>
);

const ParameterGroup = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div className="px-1 py-1">
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-1.5 h-4.5 bg-[#4D94FF] rounded-full" />
      <h3 className="text-[15px] font-black tracking-[0.01em] text-[#31485E]">{title}</h3>
    </div>
    <div className="flex flex-wrap gap-3">{children}</div>
  </div>
);

type AirCalibrationContentProps = {
  completedCount: number;
  failedCount: number;
  handleStartCalibration: () => void | Promise<void>;
  isCalibrating: boolean;
  pendingCount: number;
  resetSelections: () => void;
  runStatus: CalibrationRunStatus;
  selectionState: CalibrationSelections;
  toggleSelection: (key: keyof CalibrationSelections, value: string) => void;
  totalCombinations: number;
};

export function AirCalibrationContent({
  completedCount,
  failedCount,
  handleStartCalibration,
  isCalibrating,
  pendingCount,
  resetSelections,
  runStatus,
  selectionState,
  toggleSelection,
  totalCombinations,
}: AirCalibrationContentProps) {
  const startButtonLabel =
    runStatus === "paused" ? "Resume Calibration" : runStatus === "completed" ? "Retry Incomplete" : "Start Calibration";

  return (
    <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm p-8 flex flex-col relative overflow-hidden h-full">
      <div className="flex-1 min-h-0">
        <div className="h-full flex flex-col">
          <div className="flex items-end justify-between gap-6 pb-4 border-b border-[#E7EEF7]">
            <div>
              <div className="text-[20px] font-black text-[#31485E] tracking-[0.01em]">Calibration Parameters</div>
              <div className="text-[13px] text-[#7B92A8] mt-1">
                Select parameter combinations for the current air calibration run.
              </div>
            </div>
            <div className="px-3 py-1.5 text-[12px] font-bold text-[#6B85A0]">
              {totalCombinations} combos queued
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-8 mt-6 pb-2">
            <ParameterGroup title="Rotation Speed">
              {["1", "2", "0.75"].map((value) => (
                <OptionButton
                  key={value}
                  label={value}
                  active={selectionState.rotationSpeeds.includes(value)}
                  disabled={isCalibrating}
                  onClick={() => toggleSelection("rotationSpeeds", value)}
                />
              ))}
            </ParameterGroup>

            <ParameterGroup title="Focus">
              {["small", "big"].map((value) => (
                <OptionButton
                  key={value}
                  label={value}
                  active={selectionState.focuses.includes(value)}
                  disabled={isCalibrating}
                  onClick={() => toggleSelection("focuses", value)}
                />
              ))}
            </ParameterGroup>

            <ParameterGroup title="Voltage">
              {["80", "100", "120", "140"].map((value) => (
                <OptionButton
                  key={value}
                  label={value}
                  active={selectionState.voltages.includes(value)}
                  disabled={isCalibrating}
                  onClick={() => toggleSelection("voltages", value)}
                />
              ))}
            </ParameterGroup>

            <ParameterGroup title="Collimator">
              {["32*0.6"].map((value) => (
                <OptionButton
                  key={value}
                  label={value}
                  active={selectionState.collimators.includes(value)}
                  disabled={isCalibrating}
                  onClick={() => toggleSelection("collimators", value)}
                />
              ))}
            </ParameterGroup>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[#E7EEF7] flex items-center justify-between">
        <div className="text-[14px] font-bold text-[#546E7A] leading-relaxed">
          Queue Size:
          <span className="text-[#1E88E5] text-[18px] ml-1.5">{totalCombinations}</span>
          <span className="text-[#90A4AE] ml-2 text-[13px]">
            ({completedCount} completed, {failedCount} failed, {pendingCount} pending)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={resetSelections}
            disabled={isCalibrating}
            className={`px-5 h-[42px] min-w-[136px] border font-semibold rounded-md transition-all shadow-sm text-[14px] ${
              isCalibrating
                ? "bg-[#F1F5F9] border-[#D7E3F0] text-[#94A3B8] cursor-not-allowed"
                : "bg-white border-[#B0C4DE] text-[#546E7A] hover:bg-gray-50 active:scale-95"
            }`}
          >
            Clear
          </button>
          <button
            onClick={handleStartCalibration}
            disabled={isCalibrating || totalCombinations === 0}
            className={`flex items-center justify-center gap-2 px-6 h-[44px] min-w-[188px] font-semibold rounded-md text-[14px] transition-all ${
              isCalibrating || totalCombinations === 0
                ? "bg-[#CBD5E1] text-white cursor-not-allowed shadow-none"
                : "bg-[#4D94FF] text-white shadow-[0_8px_18px_rgba(77,148,255,0.14)] hover:bg-blue-600 active:scale-95"
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-white/55" />
            <span>{startButtonLabel}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
