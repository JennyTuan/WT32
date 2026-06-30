export const FIXED_FOUR_D_DICOM_CASE_ID = "P113" as const;
export const FOUR_D_DICOM_MP_IDS = ["MP1", "MP2", "MP3", "MP4", "MP5"] as const;
export const FOUR_D_DICOM_PHASE_COUNT = 10;
export const FOUR_D_DICOM_SLICES_PER_PHASE = 99;

export type FourDDicomMpId = (typeof FOUR_D_DICOM_MP_IDS)[number];

// Preprocessed WebP slice set under public/dicom-4d/. Deployed with the
// frontend, so the loading-screen simulation works without the local backend.
// All beds share the same WebP set (the bed dimension has no counterpart in
// the WebP dataset — it's a visual simulation only).
const FOUR_D_WEBP_BASE_URL = "/dicom-4d";

// Raw DICOMs live only on the local backend (/dicom-out/P113/...). Required
// for the View screen's 4D MPR which must run through Cornerstone's DICOM
// loader — WebP would fail to parse and crash the MPR.
const FOUR_D_DICOM_BASE_URL = import.meta.env.DEV
  ? "http://127.0.0.1:8000/dicom-out"
  : "/dicom-out";

// WebP preview URLs for the 4D loading screen (lightweight, deploy-friendly).
export function getFourDPreviewUrls(
  phaseIndex: number,
  mpId: FourDDicomMpId = "MP1",
) {
  void mpId;
  const safePhase = Math.max(0, Math.min(FOUR_D_DICOM_PHASE_COUNT - 1, Math.round(phaseIndex)));
  return Array.from({ length: FOUR_D_DICOM_SLICES_PER_PHASE }, (_, sliceIndex) => {
    const imageNumber = String(sliceIndex + 1).padStart(3, "0");
    return `${FOUR_D_WEBP_BASE_URL}/phase-${safePhase}/axial/${imageNumber}.webp`;
  });
}

// Raw DICOM URLs for the View screen's 4D MPR (Cornerstone wadouri).
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
