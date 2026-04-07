export type WarmupStatus = "idle" | "warming" | "completed";

export type WarmupPhase = {
  title: string;
  range: [number, number];
  description: string;
};

export type WarmupLog = {
  time: string;
  message: string;
  tone: "info" | "success" | "warning";
};
