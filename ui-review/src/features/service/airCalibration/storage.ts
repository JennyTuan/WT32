import type {
  AirCalibrationPersistedState,
  CalibrationCombo,
  CalibrationSelections,
} from "./types";

const STORAGE_KEY = "serviceAirCalibrationState";
const API_URL = "/api/service-state/air_calibration";

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
  void fetch(API_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  }).then((response) => {
    if (response.ok) localStorage.removeItem(STORAGE_KEY);
  }).catch(() => undefined);
};

export const clearAirCalibrationState = () => {
  localStorage.removeItem(STORAGE_KEY);
  void fetch(API_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).catch(() => undefined);
};

export const loadAirCalibrationStateFromApi = async (): Promise<AirCalibrationPersistedState | null> => {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) return null;
    const body = await response.json() as { payload?: unknown };
    if (body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)) {
      return body.payload as AirCalibrationPersistedState;
    }
  } catch {
    // Keep the browser copy available while offline.
  }
  return null;
};
