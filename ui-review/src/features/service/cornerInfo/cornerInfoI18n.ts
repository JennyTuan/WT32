import type { TranslationKey, TranslationValues } from "../../../lib/i18n";

type Translate = (key: TranslationKey, values?: TranslationValues) => string;

export const CORNER_FIELD_LABEL_KEYS: Record<string, TranslationKey> = {
  accession_number: "service.corner.field.accessionNumber",
  device_model: "service.corner.field.deviceModel",
  image_index: "service.corner.field.imageIndex",
  image_number: "service.corner.field.imageNumber",
  increment: "service.corner.field.increment",
  institution_name: "service.corner.field.institutionName",
  kernel: "service.corner.field.kernel",
  kv: "service.corner.field.kv",
  kvp: "service.corner.field.kvp",
  ma: "service.corner.field.ma",
  mas: "service.corner.field.mas",
  patient_age: "service.corner.field.patientAge",
  patient_dob: "service.corner.field.patientDob",
  patient_gender: "service.corner.field.patientGender",
  patient_id: "service.corner.field.patientId",
  patient_name: "service.corner.field.patientName",
  protocol_name: "service.corner.field.protocolName",
  recon_fov: "service.corner.field.reconFov",
  scan_time: "service.corner.field.scanTime",
  series_description: "service.corner.field.seriesDescription",
  series_number: "service.corner.field.seriesNumber",
  slice_location: "service.corner.field.sliceLocation",
  slice_thickness: "service.corner.field.sliceThickness",
  study_datetime: "service.corner.field.studyDateTime",
  study_description: "service.corner.field.studyDescription",
  window: "service.corner.field.window",
  window_level: "service.corner.field.windowLevel",
  window_width: "service.corner.field.windowWidth",
  zoom: "service.corner.field.zoom",
};

export function getCornerFieldLabel(key: string, fallback: string, t: Translate): string {
  const labelKey = CORNER_FIELD_LABEL_KEYS[key];
  return labelKey ? t(labelKey) : fallback;
}
