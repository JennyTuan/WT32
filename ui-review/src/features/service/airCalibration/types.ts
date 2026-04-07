export type CalibrationSelections = {
  rotationSpeeds: string[];
  voltages: string[];
  focuses: string[];
  collimators: string[];
};

export type CalibrationCombo = {
  rotationSpeed: string;
  voltage: string;
  focus: string;
  collimator: string;
};

export type CalibrationExecutionStage =
  | "idle"
  | "validating"
  | "configuring"
  | "scanning"
  | "waiting-data"
  | "computing"
  | "saving"
  | "paused"
  | "completed";

export type CalibrationRunStatus = "idle" | "running" | "paused" | "completed";

export type CalibrationResultStatus = "success" | "failed";

export type CalibrationComboRecord = {
  combo: CalibrationCombo;
  status: CalibrationResultStatus;
  timestamp: string;
  resultSummary: string;
  error?: string;
};

export type CalibrationCompletedMap = Record<string, CalibrationComboRecord>;

export type AirCalibrationPersistedState = {
  selections: CalibrationSelections;
  completedCombos: CalibrationCompletedMap;
  currentComboKey: string | null;
  runStatus: CalibrationRunStatus;
  lastUpdatedAt: string;
};
