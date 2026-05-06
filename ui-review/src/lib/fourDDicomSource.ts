export const FIXED_FOUR_D_DICOM_CASE_ID = "P113" as const;
export const FOUR_D_DICOM_MP_IDS = ["MP1", "MP2", "MP3", "MP4", "MP5"] as const;
export const FOUR_D_DICOM_PHASE_COUNT = 10;
export const FOUR_D_DICOM_SLICES_PER_PHASE = 99;
const FOUR_D_DICOM_BASE_URL = import.meta.env.DEV
  ? "http://127.0.0.1:8000/dicom-out"
  : "/dicom-out";

export type FourDDicomMpId = (typeof FOUR_D_DICOM_MP_IDS)[number];

export function getFourDDicomSeriesUrls(
  phaseIndex: number,
  mpId: FourDDicomMpId = "MP1",
) {
  const safePhase = Math.max(0, Math.min(FOUR_D_DICOM_PHASE_COUNT - 1, Math.round(phaseIndex)));
  return Array.from({ length: FOUR_D_DICOM_SLICES_PER_PHASE }, (_, sliceIndex) => {
    const imageNumber = String(sliceIndex + 1).padStart(4, "0");
    return `${FOUR_D_DICOM_BASE_URL}/${FIXED_FOUR_D_DICOM_CASE_ID}/${mpId}/ph${safePhase}/IM_${imageNumber}.dcm`;
  });
}
