import { apiFetch } from "./apiClient";
import type { BedPhaseCell, FourDDataReview } from "./fourDTypes";

export interface FourDReferenceWaveformSample {
  t: number;
  value: number;
}

export interface FourDDataReviewCandidate {
  id: string;
  label: string;
  sourceKind: "simulation_reference";
  previewUrl: string;
  sliceCount: number;
  waveform: FourDReferenceWaveformSample[];
}

export interface FourDDataReviewBed {
  bedIndex: number;
  bedNumber: number;
  candidateIds: string[];
}

export interface FourDDataReviewManifest {
  version: number;
  sourceKind: "simulation_reference";
  note: string;
  beds: FourDDataReviewBed[];
  candidates: FourDDataReviewCandidate[];
}

let reviewManifestPromise: Promise<FourDDataReviewManifest | null> | null = null;

export function loadFourDDataReviewManifest() {
  if (!reviewManifestPromise) {
    reviewManifestPromise = apiFetch("/api/demo-dicom/fourd-data-review")
      .then((response) => response.ok ? response.json() as Promise<FourDDataReviewManifest> : null)
      .catch(() => null);
  }
  return reviewManifestPromise;
}

// ponytail: duplicate frames are a deterministic reference-demo outcome; replace with raw-projection binning when scanner data is integrated.
export function buildReferencePhaseMatrix(
  phaseCount: number,
  review: Pick<FourDDataReview, "bedSelections">,
): BedPhaseCell[][] {
  return Object.entries(review.bedSelections)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, selection]) => {
      const duplicatePhases = selection.candidateId === "trace5_irregular"
        ? [2, 5, 7]
        : selection.candidateId === "trace3_large"
          ? [1, 6]
          : selection.candidateId === "trace4_slow"
            ? [4]
            : [];
      const disabledOffset = selection.disabledCycleIds.length % Math.max(phaseCount, 1);
      return Array.from({ length: phaseCount }, (_, phaseIndex) => ({
        frameCount: duplicatePhases.includes((phaseIndex + disabledOffset) % phaseCount) ? 2 : 1,
        selectedFrame: 0,
      }));
    });
}
