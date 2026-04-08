export type HardwareTestTab = "gantry" | "rail" | "imaging";

export type HardwareTestTabOption = {
  id: HardwareTestTab;
  label: string;
};

export type HardwareActionControl = "toggle" | "trigger" | "reset";

export type HardwareActionTone = "primary" | "neutral";

export type HardwareTestParam = {
  key: string;
  label: string;
  value: string;
  widthClass?: string;
};

export type HardwareTestAction = {
  id: string;
  name: string;
  code?: string;
  control: HardwareActionControl;
  idleLabel: string;
  runningLabel?: string;
  runningResult?: string;
  stoppedResult?: string;
  completedResult?: string;
  buttonTone?: HardwareActionTone;
  params?: HardwareTestParam[];
};

export type HardwareTestLog = {
  id: string;
  actionName: string;
  module: string;
  paramsSnapshot: string;
  result: string;
  time: string;
};

export type EditingField = {
  paramKey: string;
  rowId: string;
  tab: HardwareTestTab;
};
