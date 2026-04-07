import type {
  AirCalibrationPersistedState,
  CalibrationCombo,
  CalibrationSelections,
} from "./types";

const STORAGE_KEY = "serviceAirCalibrationState";

export const createCalibrationComboKey = (combo: CalibrationCombo) =>
  [
    `speed:${combo.rotationSpeed}`,
    `focus:${combo.focus}`,
    `kv:${combo.voltage}`,
    `collimator:${combo.collimator}`,
  ].join("|");

export const buildCalibrationCombos = (selections: CalibrationSelections): CalibrationCombo[] => {
  const combos: CalibrationCombo[] = [];

  selections.rotationSpeeds.forEach((rotationSpeed) => {
    selections.focuses.forEach((focus) => {
      selections.voltages.forEach((voltage) => {
        selections.collimators.forEach((collimator) => {
          combos.push({
            rotationSpeed,
            voltage,
            focus,
            collimator,
          });
        });
      });
    });
  });

  return combos;
};

export const loadAirCalibrationState = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AirCalibrationPersistedState;
  } catch {
    return null;
  }
};

export const saveAirCalibrationState = (state: AirCalibrationPersistedState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const clearAirCalibrationState = () => {
  localStorage.removeItem(STORAGE_KEY);
};
