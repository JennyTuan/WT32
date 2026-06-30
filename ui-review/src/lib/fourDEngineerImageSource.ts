import type { BedPhaseCell, FourDScanResult, PhaseSelections } from "./fourDTypes";

export interface FourDEngineerVolumeUrls {
  axialPreview: string;
  coronalPreview: string;
  sagittalPreview: string;
  coronalStrip?: string;
  sagittalStrip?: string;
  mha: string;
  axialSlices: string[];
}

export interface FourDEngineerVolume {
  id: string;
  groupIndex: number;
  bedIndex: number;
  bedNumber: number;
  phaseIndex: number;
  phaseValue: number;
  phaseLabel: string;
  candidateIndex: number;
  sliceCount: number;
  sourceSliceCount?: number;
  fileStart: number;
  fileEnd: number;
  rangeMm: [number, number];
  acquisitionTime: string;
  urls: FourDEngineerVolumeUrls;
}

export interface FourDEngineerManifest {
  version: number;
  source: string;
  generatedBy: string;
  bedCount: number;
  phaseCount: number;
  phaseLabels: string[];
  sliceCountPerVolume: number;
  rescaleIntercept?: number;
  windowLevel?: number;
  windowWidth?: number;
  rows: number;
  columns: number;
  volumes: FourDEngineerVolume[];
}

const MANIFEST_URL = "/fourd-engineer/manifest.json";

let manifestPromise: Promise<FourDEngineerManifest | null> | null = null;

export function loadFourDEngineerManifest(): Promise<FourDEngineerManifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then((response) => {
        if (!response.ok) return null;
        return response.json() as Promise<FourDEngineerManifest>;
      })
      .catch(() => null);
  }
  return manifestPromise;
}

export function resetFourDEngineerManifestCache() {
  manifestPromise = null;
}

export function getEngineerVolumesForBedPhase(
  manifest: FourDEngineerManifest,
  bedIndex: number,
  phaseIndex: number,
): FourDEngineerVolume[] {
  return manifest.volumes
    .filter((volume) => volume.bedIndex === bedIndex && volume.phaseIndex === phaseIndex)
    .sort((left, right) => left.candidateIndex - right.candidateIndex);
}

export function getPrimaryEngineerVolume(
  manifest: FourDEngineerManifest,
  bedIndex: number,
  phaseIndex: number,
) {
  return getEngineerVolumesForBedPhase(manifest, bedIndex, phaseIndex)[0] ?? null;
}

export function getSelectedEngineerVolume(
  manifest: FourDEngineerManifest,
  bedIndex: number,
  phaseIndex: number,
  phaseSelections?: PhaseSelections,
) {
  const volumes = getEngineerVolumesForBedPhase(manifest, bedIndex, phaseIndex);
  if (!volumes.length) return null;
  const selectedIndex = phaseSelections?.[`${bedIndex}-${phaseIndex}`] ?? 0;
  return volumes.find((volume) => volume.candidateIndex === selectedIndex) ?? volumes[0];
}

export function buildEngineerLoadPlan(manifest: FourDEngineerManifest): FourDEngineerVolume[] {
  const plan: FourDEngineerVolume[] = [];
  for (let bedIndex = 0; bedIndex < manifest.bedCount; bedIndex += 1) {
    for (let phaseIndex = 0; phaseIndex < manifest.phaseCount; phaseIndex += 1) {
      plan.push(...getEngineerVolumesForBedPhase(manifest, bedIndex, phaseIndex));
    }
  }
  return plan;
}

export function buildEngineerScanResult(
  manifest: FourDEngineerManifest,
  baseScanResult?: FourDScanResult | null,
): FourDScanResult {
  const phaseMatrix: BedPhaseCell[][] = Array.from({ length: manifest.bedCount }, (_, bedIndex) =>
    Array.from({ length: manifest.phaseCount }, (_, phaseIndex) => ({
      frameCount: Math.max(1, getEngineerVolumesForBedPhase(manifest, bedIndex, phaseIndex).length),
      selectedFrame: 0,
    })),
  );

  return {
    bedCount: manifest.bedCount,
    phaseCount: manifest.phaseCount,
    scanLength: manifest.bedCount * 19.2,
    phaseMatrix,
    // The provided engineer dataset demonstrates duplicate phase candidates,
    // not a second complete exposure set for a rescan region.
    rescanOccurred: baseScanResult?.rescanOccurred ?? false,
    rescanBedRange: baseScanResult?.rescanBedRange ?? null,
  };
}
