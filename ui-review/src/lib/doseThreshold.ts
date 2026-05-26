// Shared dose-threshold helpers used by the dose log page and the scan
// confirmation guard.
//
// Backend stores body_part in English lowercase (head / chest / abdomen / ...)
// while the dose-settings UI presents Chinese labels (头颅 / 胸部 / ...).
// Both forms can show up in the data, so we normalize before matching DRL.

import type { AgeGroup, ApiDrlEntry } from "./doseSettingsApi";

const BODY_PART_EN_TO_ZH: Record<string, string> = {
  head: "头颅",
  brain: "头颅",
  neck: "颈部",
  chest: "胸部",
  thorax: "胸部",
  abdomen: "腹部",
  pelvis: "盆腔",
  spine: "脊柱",
  heart: "心脏",
  extremity: "四肢",
  limbs: "四肢",
};

export const normalizeBodyPart = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return BODY_PART_EN_TO_ZH[lower] ?? trimmed;
};

// Protocol/session use "child", DRL uses "pediatric". Map either way.
export const normalizeAgeGroup = (raw: string | null | undefined): AgeGroup | null => {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "child" || v === "pediatric") return "pediatric";
  if (v === "infant") return "infant";
  if (v === "adult") return "adult";
  return null;
};

export type ThresholdInput = {
  body_part: string | null | undefined;
  age_group?: string | null | undefined;
  ctdi_vol: number | null | undefined;
  dlp: number | null | undefined;
};

export type ThresholdMatch = {
  exceeded: boolean;
  drl: ApiDrlEntry | null;
  ctdiExceeded: boolean;
  dlpExceeded: boolean;
};

// Match a DRL entry by normalized body_part and (optionally) age_group.
// If age_group is unknown (e.g. on a dose log row), fall back to adult, then any.
const findDrl = (
  input: ThresholdInput,
  drlEntries: ApiDrlEntry[],
): ApiDrlEntry | null => {
  const part = normalizeBodyPart(input.body_part);
  if (!part) return null;
  const age = normalizeAgeGroup(input.age_group);

  const sameBodyPart = drlEntries.filter(
    (d) => normalizeBodyPart(d.body_part) === part,
  );
  if (sameBodyPart.length === 0) return null;

  if (age) {
    const exact = sameBodyPart.find((d) => d.age_group === age);
    if (exact) return exact;
  }
  return sameBodyPart.find((d) => d.age_group === "adult") ?? sameBodyPart[0];
};

export const evaluateThreshold = (
  input: ThresholdInput,
  drlEntries: ApiDrlEntry[],
): ThresholdMatch => {
  const drl = findDrl(input, drlEntries);
  if (!drl) {
    return { exceeded: false, drl: null, ctdiExceeded: false, dlpExceeded: false };
  }
  const ctdiExceeded = input.ctdi_vol != null && input.ctdi_vol >= drl.ctdi_ref;
  const dlpExceeded = input.dlp != null && input.dlp >= drl.dlp_ref;
  return {
    exceeded: ctdiExceeded || dlpExceeded,
    drl,
    ctdiExceeded,
    dlpExceeded,
  };
};
