import { useEffect, useMemo, useState } from "react";

import type { CalibrationSelections } from "./types";

const INITIAL_SELECTIONS: CalibrationSelections = {
  rotationSpeeds: ["1"],
  voltages: ["100", "140"],
  focuses: ["small"],
  collimators: ["32*0.6"],
};

export function useAirCalibration() {
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [selectionState, setSelectionState] = useState<CalibrationSelections>(INITIAL_SELECTIONS);

  useEffect(() => {
    let interval: number | undefined;

    if (isCalibrating && !showAbortConfirm) {
      interval = window.setInterval(() => {
        setCalibrationProgress((prev) => {
          if (prev >= 100) {
            setIsCalibrating(false);
            return 100;
          }
          return prev + 0.5;
        });
      }, 100);
    }

    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [isCalibrating, showAbortConfirm]);

  const totalCombinations = useMemo(
    () =>
      selectionState.rotationSpeeds.length *
      selectionState.focuses.length *
      selectionState.voltages.length *
      selectionState.collimators.length,
    [selectionState],
  );

  const toggleSelection = (key: keyof CalibrationSelections, value: string) => {
    setSelectionState((prev) => {
      const current = prev[key];
      if (current.includes(value)) {
        if (current.length === 1) return prev;
        return { ...prev, [key]: current.filter((item) => item !== value) };
      }

      return { ...prev, [key]: [...current, value] };
    });
  };

  const resetSelections = () => setSelectionState(INITIAL_SELECTIONS);

  return {
    calibrationProgress,
    confirmAbort: () => {
      setIsCalibrating(false);
      setShowAbortConfirm(false);
      setCalibrationProgress(0);
    },
    handleAbort: () => setShowAbortConfirm(true),
    handleStartCalibration: () => {
      setCalibrationProgress(0);
      setIsCalibrating(true);
    },
    isCalibrating,
    resetSelections,
    selectionState,
    setShowAbortConfirm,
    showAbortConfirm,
    toggleSelection,
    totalCombinations,
  };
}
