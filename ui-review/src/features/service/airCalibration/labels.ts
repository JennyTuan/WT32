import type { TranslationKey, TranslationValues } from "../../../lib/i18n";
import type { CalibrationCombo } from "./types";

type Translate = (key: TranslationKey, values?: TranslationValues) => string;

const FOCUS_LABEL_KEYS: Record<string, TranslationKey> = {
  small: "service.airCalibration.focus.small",
  big: "service.airCalibration.focus.big",
};

export const formatCalibrationFocusLabel = (t: Translate, focus: string) => {
  const labelKey = FOCUS_LABEL_KEYS[focus];
  return labelKey ? t(labelKey) : focus;
};

export const formatCalibrationCombo = (t: Translate, combo: CalibrationCombo) =>
  t("service.airCalibration.comboDisplay", {
    rotationSpeed: combo.rotationSpeed,
    focus: formatCalibrationFocusLabel(t, combo.focus),
    voltage: combo.voltage,
    collimator: combo.collimator,
  });
