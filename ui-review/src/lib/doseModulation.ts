// CT 智能剂量调节 (Dose Modulation, a.k.a. DOM / Auto-mA / CARE Dose 4D).
//
// Computes a position-dependent tube current mA(z) curve from a real scout
// (topogram) image using the AAPM TG-220 water-equivalent diameter (WED)
// framework. Steps:
//
//   1. HU → μ/μ_water linear water model: μ/μ_water = 1 + HU/1000.
//   2. For each scout row inside the user crop box, integrate the
//      water-equivalent path length t_eq(z) along the lateral (column)
//      direction, and measure the lateral extent D_lat(z) of the patient.
//   3. AAPM TG-220 projection-based WED, circular cross-section closure:
//        A_water(z) ≈ t_eq(z) · D_lat(z)        (single AP/PA topogram)
//        WED(z)    = 2·sqrt(A_water(z) / π)
//   4. Reference WED: 16 cm (head) or 30 cm (body) phantom, auto-picked
//      from the median scan WED unless caller forces a region.
//   5. mA(z) = mA_ref · (WED(z)/WED_ref)^n · f_kV · f_noise · (μ_kV / μ_120)
//      where:
//        n      = 2.5     industry-typical noise-equivalent exponent
//        f_kV   = (120/kV)^3.5    (Siemens CARE kV style mA compensation)
//        f_noise scales mA_ref so the predicted image-noise σ matches the
//                selected target (low / medium / high).
//   6. Clamp to [maMin, maMax] and resample to the caller's step count
//      (axial bed count or helical sample count).

// Opaque slider value, see AutoMaPanel for the active range / step / default.
// Concrete physical meaning (target image-noise σ etc.) is still pending from
// R&D — for now AutoMaPanel applies the noise-driven mA scale itself, and
// this lib treats noise as a pass-through.
export type NoiseLevel = number;

// μ_water (cm⁻¹) at the effective energy of common CT kV settings,
// derived from NIST XCOM with a typical CT spectrum. Used both for the
// HU→μ correction and the kV-scaling factor.
const MU_WATER_BY_KV: ReadonlyArray<readonly [number, number]> = [
    [80, 0.2190],
    [100, 0.2070],
    [120, 0.1930],
    [140, 0.1800],
];
const REF_KV = 120;
const MU_WATER_REF = 0.1930;

// Reference WED for the two clinically standard phantoms (AAPM CT TG-220).
const WED_REF_HEAD_MM = 160;
const WED_REF_BODY_MM = 300;
const HEAD_BODY_SPLIT_MM = 220;

// mA exponent. Industry range 1.5..3.0 — 2.5 is the AAPM-recommended
// default for routine body protocols (CARE Dose 4D ≈ 2.4, GE ≈ 2.7).
const DOSE_EXPONENT = 2.5;

// HU above which a column is considered part of the patient (vs. air bed).
const HU_AIR_THRESHOLD = -300;

// Hard safety bounds (matches AutoMaPanel HARD_MIN/HARD_MAX).
const HARD_MIN_MA = 20;
const HARD_MAX_MA = 800;

export type ScoutHuData = {
    hu: Float32Array;
    rows: number;
    cols: number;
    pixelSpacingX: number; // mm per column (lateral / x)
    pixelSpacingY: number; // mm per row (cranio-caudal / z)
};

export type DoseModulationOptions = {
    scoutData: ScoutHuData;
    cropBox: { x: number; y: number; width: number; height: number }; // normalised 0..1
    kv: number;
    maRef: number;
    maMin: number;
    maMax: number;
    steps: number;
    bodyRegion?: "head" | "body";
};

export type DoseModulationResult = {
    maCurve: number[];   // length = steps, integer mA values clamped to [maMin,maMax]
    wedCurve: number[];  // length = steps, WED in mm at each z bin
    wedRef: number;      // reference WED used (mm)
    kvScale: number;     // applied kV mA-compensation factor
    region: "head" | "body";
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function muWaterAtKv(kv: number): number {
    if (!Number.isFinite(kv) || kv <= 0) return MU_WATER_REF;
    const first = MU_WATER_BY_KV[0];
    const last = MU_WATER_BY_KV[MU_WATER_BY_KV.length - 1];
    if (kv <= first[0]) return first[1];
    if (kv >= last[0]) return last[1];
    for (let i = 0; i < MU_WATER_BY_KV.length - 1; i += 1) {
        const [k0, m0] = MU_WATER_BY_KV[i];
        const [k1, m1] = MU_WATER_BY_KV[i + 1];
        if (kv >= k0 && kv <= k1) {
            const t = (kv - k0) / (k1 - k0);
            return m0 + (m1 - m0) * t;
        }
    }
    return MU_WATER_REF;
}

// CARE-kV style mA compensation: to keep contrast-to-noise constant when kV
// changes, mA must scale roughly as (REF_KV/kV)^3.5. Clamped to a sane band
// so a stale or absent kV value can't blow the curve up.
function kvMaScale(kv: number): number {
    if (!Number.isFinite(kv) || kv <= 0) return 1;
    return clamp(Math.pow(REF_KV / kv, 3.5), 0.4, 3);
}

export function computeDoseModulation(opts: DoseModulationOptions): DoseModulationResult {
    const { scoutData, cropBox, kv, maRef, maMin, maMax, steps } = opts;
    const { hu, rows, cols, pixelSpacingX, pixelSpacingY: _pixelSpacingY } = scoutData;

    const safeSteps = Math.max(1, Math.floor(steps));
    const safeMaRef = Math.max(1, maRef);

    const rowStart = clamp(Math.floor(cropBox.y * rows), 0, rows - 1);
    const rowEnd = clamp(Math.ceil((cropBox.y + cropBox.height) * rows), rowStart + 1, rows);
    const colStart = clamp(Math.floor(cropBox.x * cols), 0, cols - 1);
    const colEnd = clamp(Math.ceil((cropBox.x + cropBox.width) * cols), colStart + 1, cols);
    const rowCount = rowEnd - rowStart;

    // μ correction: HU values were measured at the scanner's reference kV,
    // but mA is delivered at the prescribed kV — the attenuation actually
    // seen by the beam scales with μ_water(kV)/μ_water(120).
    const muScale = muWaterAtKv(kv) / MU_WATER_REF;

    const tEq = new Float32Array(rowCount);   // mm of water per row
    const dLat = new Float32Array(rowCount);  // mm patient lateral extent per row

    for (let r = 0; r < rowCount; r += 1) {
        const rowIndex = rowStart + r;
        const rowBase = rowIndex * cols;
        let sumRatio = 0;
        let leftCol = -1;
        let rightCol = -1;
        for (let c = colStart; c < colEnd; c += 1) {
            const huVal = hu[rowBase + c];
            // HU → μ/μ_water = 1 + HU/1000. Air ≈ -1000 → 0. Bone +1000 → 2.
            const ratio = Math.max(0, 1 + huVal / 1000);
            sumRatio += ratio;
            if (huVal > HU_AIR_THRESHOLD) {
                if (leftCol < 0) leftCol = c;
                rightCol = c;
            }
        }
        tEq[r] = sumRatio * pixelSpacingX;
        dLat[r] = leftCol < 0 ? 0 : (rightCol - leftCol + 1) * pixelSpacingX;
    }

    // Smooth the per-row WED with a small box filter (~7 mm) to suppress
    // ribcage striping and individual vertebra spikes; matches what real
    // scanners do before driving the mA generator.
    const smoothWindowRows = Math.max(1, Math.round(7 / Math.max(0.1, _pixelSpacingY)));
    const wedRaw = new Float32Array(rowCount);
    for (let r = 0; r < rowCount; r += 1) {
        let areaSum = 0;
        let n = 0;
        const a = Math.max(0, r - smoothWindowRows);
        const b = Math.min(rowCount - 1, r + smoothWindowRows);
        for (let k = a; k <= b; k += 1) {
            areaSum += tEq[k] * dLat[k];
            n += 1;
        }
        const area = n > 0 ? areaSum / n : 0;
        wedRaw[r] = 2 * Math.sqrt(Math.max(0, area) / Math.PI);
    }

    const sorted = Array.from(wedRaw).filter((v) => v > 0).sort((a, b) => a - b);
    const medianWed = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : WED_REF_BODY_MM;
    const region: "head" | "body" =
        opts.bodyRegion ?? (medianWed < HEAD_BODY_SPLIT_MM ? "head" : "body");
    const wedRef = region === "head" ? WED_REF_HEAD_MM : WED_REF_BODY_MM;

    // Noise-driven mA scaling is applied separately by AutoMaPanel (the panel
    // owns the slider). Here we only do the WED + kV + μ part.
    const kvScale = kvMaScale(kv);

    const dense = new Float32Array(rowCount);
    for (let r = 0; r < rowCount; r += 1) {
        // Floor the WED ratio so a sparsely-cropped row (mostly air) can't
        // drive mA below the protocol's minimum; the MIN/MAX clamp later
        // gives the operator the final word.
        const ratio = Math.max(0.2, wedRaw[r] / Math.max(1, wedRef));
        dense[r] = safeMaRef * Math.pow(ratio, DOSE_EXPONENT) * kvScale * muScale;
    }

    const safeMaMin = clamp(maMin, HARD_MIN_MA, HARD_MAX_MA);
    const safeMaMax = clamp(maMax, safeMaMin, HARD_MAX_MA);

    const maCurve = new Array<number>(safeSteps);
    const wedCurve = new Array<number>(safeSteps);
    for (let i = 0; i < safeSteps; i += 1) {
        const a = Math.floor((i / safeSteps) * rowCount);
        const b = Math.max(a + 1, Math.floor(((i + 1) / safeSteps) * rowCount));
        let sumMa = 0;
        let sumWed = 0;
        let n = 0;
        for (let k = a; k < b && k < rowCount; k += 1) {
            sumMa += dense[k];
            sumWed += wedRaw[k];
            n += 1;
        }
        const avgMa = n > 0 ? sumMa / n : safeMaRef;
        const avgWed = n > 0 ? sumWed / n : 0;
        maCurve[i] = Math.round(clamp(avgMa, safeMaMin, safeMaMax));
        wedCurve[i] = Math.round(avgWed);
    }

    return { maCurve, wedCurve, wedRef, kvScale, region };
}
