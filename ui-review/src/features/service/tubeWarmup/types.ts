export type WarmupStatus = "idle" | "warming" | "completed";
export type WarmupPhaseId = "selfCheck" | "rotorStart" | "rampUp" | "stabilize";

export type WarmupPhase = {
  id: WarmupPhaseId;
  title: string;
  range: [number, number];
  description: string;
};

export type WarmupLog = {
  time: string;
  message: string;
  tone: "info" | "success" | "warning";
};
