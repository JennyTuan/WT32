export const FIXED_LUNG_MHA_CASE_ID = "P113" as const;
export const LUNG_MHA_MP_IDS = ["MP1", "MP2", "MP3", "MP4", "MP5"] as const;
export const LUNG_MHA_PHASE_COUNT = 10;

export type LungMhaMpId = (typeof LUNG_MHA_MP_IDS)[number];

export function getLungMhaVolumeUrl(
  mpId: LungMhaMpId,
  phaseIndex: number,
) {
  const safePhase = Math.max(0, Math.min(LUNG_MHA_PHASE_COUNT - 1, Math.round(phaseIndex)));
  return `/Lung-Dicom/${FIXED_LUNG_MHA_CASE_ID}/${mpId}_ph${safePhase}_masked.mha`;
}

export function getStitchedLungMhaVolumeUrls(phaseIndex: number) {
  return LUNG_MHA_MP_IDS.map((mpId) => getLungMhaVolumeUrl(mpId, phaseIndex));
}
