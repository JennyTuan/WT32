import { MAX_TARGET_HEAT, MIN_TARGET_HEAT } from "./constants";
import type { WarmupLog, WarmupPhase } from "./types";

export const formatClock = (date: Date) =>
  date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const clampHeat = (value: number) =>
  Math.min(MAX_TARGET_HEAT, Math.max(MIN_TARGET_HEAT, value));

export const getWarmupPhase = (progress: number, phases: WarmupPhase[]) =>
  phases.find((phase) => progress >= phase.range[0] && progress < phase.range[1]) ??
  phases[phases.length - 1];

export const getPhaseDotClass = (phase: WarmupPhase, progress: number) => {
  if (progress >= phase.range[1]) return "bg-[#4CAF50] shadow-[0_0_12px_rgba(76,175,80,0.45)]";
  if (progress >= phase.range[0]) return "bg-[#4D94FF] shadow-[0_0_12px_rgba(77,148,255,0.45)]";
  return "bg-[#CFD8DC]";
};

export const getLogToneClass = (tone: WarmupLog["tone"]) => {
  if (tone === "success") return "text-[#52C41A]";
  if (tone === "warning") return "text-[#FA8C16]";
  return "text-white";
};
