import type { TranslationKey } from "../../../lib/i18n";
import type { PhantomType, QAStatus } from "./types";

export const PHANTOM_LABEL_KEYS: Record<PhantomType, TranslationKey> = {
  水模: "service.dailyQa.phantom.water",
  气模: "service.dailyQa.phantom.air",
};

export const QA_STATUS_LABEL_KEYS: Record<QAStatus, TranslationKey> = {
  PASS: "service.dailyQa.status.pass",
  FAIL: "service.dailyQa.status.fail",
};
