// Lightweight CTDIvol / DLP estimator used to keep the displayed dose values
// in sync with the user's parameter edits in the demo. This is not a calibrated
// dosimetry model; it captures the dominant first-order relationships:
//
//   CTDIvol ∝ mAs (mA × rotation_time / pitch)
//   CTDIvol ∝ kV^2.5
//   DLP    = CTDIvol × scan_length(cm)
//
// Given a reference operating point (the seed values for the series), we
// rescale CTDIvol/DLP to whatever the user has currently dialed in. If the
// reference is missing or zero we fall back to absolute estimates using a
// rough constant so the values still update directionally instead of staying
// frozen at the seed.

export type DoseEstimateInputs = {
  current: {
    ma?: number | null;
    kv?: number | null;
    rotation_time?: number | null;
    pitch?: number | null;
    scan_length?: number | null;
  };
  reference: {
    ma?: number | null;
    kv?: number | null;
    rotation_time?: number | null;
    pitch?: number | null;
    scan_length?: number | null;
    ctdi_vol?: number | null;
    dlp?: number | null;
  };
};

const safe = (v: number | null | undefined, fallback: number): number =>
  v != null && Number.isFinite(v) && v > 0 ? v : fallback;

export const estimateDose = ({
  current,
  reference,
}: DoseEstimateInputs): { ctdi_vol: number; dlp: number } => {
  // Reference operating point. Use sensible CT defaults when missing.
  const refMa = safe(reference.ma, 120);
  const refKv = safe(reference.kv, 120);
  const refRot = safe(reference.rotation_time, 1);
  const refPitch = safe(reference.pitch, 1);
  const refLength = safe(reference.scan_length, 120);
  // If we have no seed CTDIvol fall back to a plausible head-like baseline.
  const refCtdi = safe(reference.ctdi_vol, 25);

  const curMa = safe(current.ma, refMa);
  const curKv = safe(current.kv, refKv);
  const curRot = safe(current.rotation_time, refRot);
  const curPitch = safe(current.pitch, refPitch);
  const curLength = safe(current.scan_length, refLength);

  const mAsRatio = (curMa * curRot) / curPitch / ((refMa * refRot) / refPitch);
  const kvRatio = Math.pow(curKv / refKv, 2.5);

  const ctdi = refCtdi * mAsRatio * kvRatio;
  // DLP = CTDIvol × scan_length(cm). Scan length is stored in mm.
  const dlp = ctdi * (curLength / 10);

  return {
    ctdi_vol: Math.round(ctdi * 100) / 100,
    dlp: Math.round(dlp * 100) / 100,
  };
};
