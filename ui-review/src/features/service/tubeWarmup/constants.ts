import type { TranslationKey } from "../../../lib/i18n";
import type { WarmupLog, WarmupPhase, WarmupPhaseId } from "./types";

export const MIN_TARGET_HEAT = 20;
export const MAX_TARGET_HEAT = 100;

type WarmupPhaseDefinition = {
  id: WarmupPhaseId;
  range: [number, number];
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
};

export const WARMUP_PHASE_DEFS: WarmupPhaseDefinition[] = [
  {
    id: "selfCheck",
    range: [0, 20],
    titleKey: "service.tubeWarmup.phase.selfCheck.title",
    descriptionKey: "service.tubeWarmup.phase.selfCheck.description",
  },
  {
    id: "rotorStart",
    range: [20, 45],
    titleKey: "service.tubeWarmup.phase.rotorStart.title",
    descriptionKey: "service.tubeWarmup.phase.rotorStart.description",
  },
  {
    id: "rampUp",
    range: [45, 80],
    titleKey: "service.tubeWarmup.phase.rampUp.title",
    descriptionKey: "service.tubeWarmup.phase.rampUp.description",
  },
  {
    id: "stabilize",
    range: [80, 100],
    titleKey: "service.tubeWarmup.phase.stabilize.title",
    descriptionKey: "service.tubeWarmup.phase.stabilize.description",
  },
];

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

export const createWarmupPhases = (t: Translate): WarmupPhase[] =>
  WARMUP_PHASE_DEFS.map((phase) => ({
    id: phase.id,
    range: phase.range,
    title: t(phase.titleKey),
    description: t(phase.descriptionKey),
  }));

export const createInitialWarmupLogs = (t: Translate): WarmupLog[] => [
  { time: "15:06", message: t("service.tubeWarmup.log.initialStandby"), tone: "info" },
  { time: "15:06", message: t("service.tubeWarmup.log.initialCooling"), tone: "success" },
];
