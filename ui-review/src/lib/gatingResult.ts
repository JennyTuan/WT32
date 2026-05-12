// Mock gating-acquisition result used by the post-scan image viewer to drive
// the bottom "门控回放" panel (waveform + window + triggers + slice cursor + stats).
//
// Prospective gating produces a single phase per trigger. For axial gating each
// bed contributes one trigger; for helical gated DIBH the whole hold yields one
// long exposure interval covering all slices.

export type GatingMode = "gated_helical" | "gated_axial";
export type GatingBreathingMode =
    | "free_breathing"
    | "breath_hold_inspiration"
    | "breath_hold_expiration";
export type TriggerDirection = "rising" | "falling";

export type GatingWindow =
    | {
          kind: "threshold";
          threshold: number;
          direction: TriggerDirection;
          /** Half-width of the accept band (normalized amplitude). */
          toleranceBand: number;
      }
    | {
          kind: "breath_hold";
          /** Sample index where the stable plateau begins. */
          plateauStart: number;
          /** Sample index where the stable plateau ends. */
          plateauEnd: number;
          /** Plateau target amplitude (normalized). */
          plateauTarget: number;
          /** Tolerance band around plateauTarget (normalized). */
          toleranceBand: number;
      };

export interface GatingTrigger {
    /** 1-based sequence index for display. */
    index: number;
    /** Sample index into the waveform. */
    sampleIndex: number;
    /** Amplitude at fire moment (normalized). */
    amplitude: number;
    /** Absolute deviation from target phase amplitude (normalized). */
    deviation: number;
    /** Whether this trigger was accepted by the gating window. */
    accepted: boolean;
    /** First slice index produced by this trigger (inclusive). */
    sliceStart: number;
    /** Last slice index produced by this trigger (inclusive). */
    sliceEnd: number;
    /** When this trigger was superseded by a 补扫 trigger, its index. */
    supersededBy?: number;
    /** True when this trigger itself is a 补扫 result. */
    isSupplemental?: boolean;
}

export interface GatingResult {
    mode: GatingMode;
    breathingMode: GatingBreathingMode;
    /** Total recording time in seconds. */
    durationSec: number;
    /** Hz. */
    sampleRate: number;
    /** Normalized respiratory waveform samples (length = durationSec * sampleRate). */
    waveform: number[];
    /** Effective gating window overlaid on the waveform. */
    window: GatingWindow;
    /** All recorded triggers (accepted + rejected). */
    triggers: GatingTrigger[];
    /** Total slices produced (= sum of slices over all accepted triggers). */
    totalSlices: number;
    /** Acquisition acceptance ratio (accepted / total triggers); for DIBH = plateau time / total hold time. */
    acceptance: number;
    /** Captured at scan-end time. */
    capturedAt: string;
}

const STORAGE_KEY = "gatingResult.v1";

// ─────────────────────────────────────────────────────────────────────────────
// Mock generator
// ─────────────────────────────────────────────────────────────────────────────

interface GenerateOptions {
    mode: GatingMode;
    breathingMode: GatingBreathingMode;
    /** Total slices to be produced by the scan. */
    totalSlices: number;
    /** For axial gating: slices per bed (= triggers count). */
    slicesPerBed?: number;
    /** Gating threshold (normalized). */
    threshold?: number;
    direction?: TriggerDirection;
}

const SAMPLE_RATE = 25; // Hz — keeps waveform array bounded (~ a few hundred pts).

function generateFreeBreathingWaveform(durationSec: number, sampleRate: number): number[] {
    const samples: number[] = [];
    const total = Math.round(durationSec * sampleRate);
    // ~ 15 breaths per minute → 4s per cycle.
    const period = 4.0;
    for (let i = 0; i < total; i++) {
        const t = i / sampleRate;
        const base = -Math.cos((2 * Math.PI * t) / period);
        const jitter = Math.sin(t * 7.1) * 0.05 + Math.sin(t * 13.7) * 0.03;
        const drift = (t / durationSec) * 0.08 - 0.04;
        samples.push(base + jitter + drift);
    }
    return samples;
}

function generateBreathHoldWaveform(durationSec: number, sampleRate: number): number[] {
    const samples: number[] = [];
    const total = Math.round(durationSec * sampleRate);
    // 0–2s: ramp from 0 to +1.0 (deep inspiration)
    // 2–N-1s: hold plateau ~ +1.0
    // last 1s: release back toward 0.
    const rampEnd = 2.0;
    const holdEnd = durationSec - 1.0;
    for (let i = 0; i < total; i++) {
        const t = i / sampleRate;
        let v: number;
        if (t < rampEnd) {
            v = (t / rampEnd) * 1.0;
        } else if (t < holdEnd) {
            // tiny noise + slow drift on plateau
            const localT = t - rampEnd;
            v = 1.0 + Math.sin(localT * 2.3) * 0.04 + Math.sin(localT * 5.1) * 0.02 - localT * 0.004;
        } else {
            const release = (t - holdEnd) / 1.0;
            v = 1.0 - release * 1.0;
        }
        samples.push(v);
    }
    return samples;
}

export function generateMockGatingResult(opts: GenerateOptions): GatingResult {
    const {
        mode,
        breathingMode,
        totalSlices,
        slicesPerBed = mode === "gated_axial" ? 12 : totalSlices,
        threshold = 1.0,
        direction = "rising",
    } = opts;

    const isFreeBreathing = breathingMode === "free_breathing";

    if (isFreeBreathing) {
        // Axial free-breathing: 1 trigger per bed; assume ~ 4s cycle, trigger near each inspiration peak.
        const triggerCount = Math.max(1, Math.ceil(totalSlices / slicesPerBed));
        const durationSec = Math.max(triggerCount * 4 + 4, 12);
        const waveform = generateFreeBreathingWaveform(durationSec, SAMPLE_RATE);
        const triggers: GatingTrigger[] = [];
        const cyclePeriodSec = 4.0;
        const targetAmp = direction === "rising" ? 1.0 : -1.0;

        for (let i = 0; i < triggerCount; i++) {
            // Trigger near each cycle's peak (or valley) — peak of -cos(2πt/4) is at t = 2, 6, 10 …
            const tSec =
                direction === "rising"
                    ? 2.0 + i * cyclePeriodSec
                    : 0.0 + i * cyclePeriodSec + cyclePeriodSec / 2;
            const sampleIndex = Math.min(waveform.length - 1, Math.round(tSec * SAMPLE_RATE));
            const amplitude = waveform[sampleIndex];
            const deviation = Math.abs(amplitude - targetAmp);
            // Reject if deviation > 0.18 (mock realism: ~ 1 in 6 beds drifts).
            const jitterDev = ((i * 37) % 100) / 500; // pseudo-deterministic jitter ≈ 0…0.2
            const totalDev = deviation + jitterDev;
            const accepted = totalDev < 0.18;
            triggers.push({
                index: i + 1,
                sampleIndex,
                amplitude: amplitude + (accepted ? 0 : jitterDev * (direction === "rising" ? -1 : 1)),
                deviation: totalDev,
                accepted,
                sliceStart: i * slicesPerBed,
                sliceEnd: Math.min(totalSlices - 1, (i + 1) * slicesPerBed - 1),
            });
        }
        const acceptedTriggers = triggers.filter((t) => t.accepted);
        return {
            mode,
            breathingMode,
            durationSec,
            sampleRate: SAMPLE_RATE,
            waveform,
            window: { kind: "threshold", threshold, direction, toleranceBand: 0.15 },
            triggers,
            totalSlices,
            acceptance: acceptedTriggers.length / Math.max(1, triggers.length),
            capturedAt: new Date().toISOString(),
        };
    }

    // Breath-hold (DIBH) — single exposure interval covering the whole scan.
    // For helical gated: 1 trigger, slices span the plateau.
    // For axial gated DIBH: 1 trigger per bed, but all within the same hold plateau.
    const triggerCount = mode === "gated_helical" ? 1 : Math.max(1, Math.ceil(totalSlices / slicesPerBed));
    // Hold length ~ 18 s plateau + 2s ramp + 1s release = 21s; expand if many beds.
    const plateauSec = Math.max(15, triggerCount * 2 + 6);
    const durationSec = 2 + plateauSec + 1;
    const waveform = generateBreathHoldWaveform(durationSec, SAMPLE_RATE);
    const plateauStartIdx = Math.round(2 * SAMPLE_RATE);
    const plateauEndIdx = Math.round((2 + plateauSec) * SAMPLE_RATE);
    const triggers: GatingTrigger[] = [];
    for (let i = 0; i < triggerCount; i++) {
        const fracAcross = triggerCount === 1 ? 0.5 : i / (triggerCount - 1);
        const sampleIndex = Math.round(
            plateauStartIdx + fracAcross * (plateauEndIdx - plateauStartIdx)
        );
        const amplitude = waveform[sampleIndex];
        const deviation = Math.abs(amplitude - 1.0);
        triggers.push({
            index: i + 1,
            sampleIndex,
            amplitude,
            deviation,
            accepted: true,
            sliceStart:
                mode === "gated_helical"
                    ? 0
                    : Math.min(totalSlices - 1, i * slicesPerBed),
            sliceEnd:
                mode === "gated_helical"
                    ? totalSlices - 1
                    : Math.min(totalSlices - 1, (i + 1) * slicesPerBed - 1),
        });
    }
    return {
        mode,
        breathingMode,
        durationSec,
        sampleRate: SAMPLE_RATE,
        waveform,
        window: {
            kind: "breath_hold",
            plateauStart: plateauStartIdx,
            plateauEnd: plateauEndIdx,
            plateauTarget: 1.0,
            toleranceBand: 0.1,
        },
        triggers,
        totalSlices,
        acceptance: 1.0,
        capturedAt: new Date().toISOString(),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────

export function saveGatingResult(result: GatingResult) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch {
        // ignore
    }
}

export function loadGatingResult(): GatingResult | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as GatingResult;
    } catch {
        return null;
    }
}

export function clearGatingResult() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers consumed by the replay panel
// ─────────────────────────────────────────────────────────────────────────────

/** Trigger index whose slice range contains the given slice (or null if none). Prefers active triggers. */
export function findTriggerForSlice(
    result: GatingResult,
    sliceIndex: number
): GatingTrigger | null {
    // Active (non-superseded) trigger first.
    for (const t of result.triggers) {
        if (t.supersededBy) continue;
        if (sliceIndex >= t.sliceStart && sliceIndex <= t.sliceEnd) return t;
    }
    // Fallback: any trigger (e.g. all in this range are superseded but kept for history).
    for (const t of result.triggers) {
        if (sliceIndex >= t.sliceStart && sliceIndex <= t.sliceEnd) return t;
    }
    return null;
}

/** Mean ± SD of trigger interval, in seconds. Returns null when < 2 triggers. */
export function computeTriggerIntervalStats(
    result: GatingResult
): { meanSec: number; sdSec: number } | null {
    if (result.triggers.length < 2) return null;
    const intervals: number[] = [];
    for (let i = 1; i < result.triggers.length; i++) {
        const dt =
            (result.triggers[i].sampleIndex - result.triggers[i - 1].sampleIndex) /
            result.sampleRate;
        intervals.push(dt);
    }
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
        intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
    return { meanSec: mean, sdSec: Math.sqrt(variance) };
}

/**
 * Apply a 补扫 (supplemental) operation to a result: mark the selected triggers
 * as superseded and append new supplemental triggers covering the same slice
 * ranges. Acceptance is recomputed against active (non-superseded) triggers.
 *
 * Mock behavior: new supplemental triggers re-roll deviations such that they
 * land inside the accept band (assumes the operator re-coached the patient and
 * the supplemental acquisition succeeded — realistic majority case).
 */
export function applySupplementalScan(
    result: GatingResult,
    targetIndices: number[],
): GatingResult {
    if (targetIndices.length === 0) return result;
    const indexSet = new Set(targetIndices);
    const targetAmp =
        result.window.kind === "threshold"
            ? result.window.threshold
            : result.window.plateauTarget;
    let nextIndex =
        result.triggers.reduce((m, t) => Math.max(m, t.index), 0) + 1;

    const updatedExisting: GatingTrigger[] = result.triggers.map((t) => {
        if (!indexSet.has(t.index)) return t;
        return { ...t, supersededBy: nextIndex + targetIndices.indexOf(t.index) };
    });

    const supplemental: GatingTrigger[] = result.triggers
        .filter((t) => indexSet.has(t.index))
        .map((t, i) => {
            const idx = nextIndex + i;
            // Tight deviation (mock: re-coached patient hits target).
            const dev = 0.02 + ((idx * 13) % 5) / 100; // 0.02–0.06
            return {
                index: idx,
                sampleIndex: t.sampleIndex,
                amplitude: targetAmp + (Math.random() > 0.5 ? dev : -dev),
                deviation: dev,
                accepted: true,
                sliceStart: t.sliceStart,
                sliceEnd: t.sliceEnd,
                isSupplemental: true,
            };
        });

    const allTriggers = [...updatedExisting, ...supplemental];
    const active = allTriggers.filter((t) => !t.supersededBy);
    const accepted = active.filter((t) => t.accepted).length;
    return {
        ...result,
        triggers: allTriggers,
        acceptance: active.length === 0 ? 1 : accepted / active.length,
    };
}

/**
 * Map a slice index to a sample index on the waveform.
 *  - Helical DIBH: linear across the plateau, gives a sliding cursor.
 *  - Axial: snaps to the owning trigger's sample.
 */
export function sliceToSampleIndex(result: GatingResult, sliceIndex: number): number {
    if (result.mode === "gated_helical" && result.window.kind === "breath_hold") {
        const { plateauStart, plateauEnd } = result.window;
        const frac =
            result.totalSlices > 1 ? sliceIndex / (result.totalSlices - 1) : 0.5;
        return Math.round(plateauStart + frac * (plateauEnd - plateauStart));
    }
    const owning = findTriggerForSlice(result, sliceIndex);
    return owning ? owning.sampleIndex : 0;
}
