export type ScoutPositioningRange = {
    start: number;
    end: number;
};

const STORAGE_KEY = "scoutPositioningRange";
const BED_POSITION_MIN = 320;
const BED_POSITION_MAX = 780;
const DEFAULT_CROP_BOX = {
    x: 0.18,
    y: 0.2,
    width: 0.54,
    height: 0.46,
};

export const DEFAULT_SCOUT_CROP_BOX = DEFAULT_CROP_BOX;

export const saveScoutPositioningRange = (range: ScoutPositioningRange) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
};

export const loadScoutPositioningRange = (): ScoutPositioningRange | null => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as ScoutPositioningRange;
        if (!Number.isFinite(parsed.start) || !Number.isFinite(parsed.end)) return null;
        return parsed;
    } catch {
        return null;
    }
};

export const clearScoutPositioningRange = () => {
    localStorage.removeItem(STORAGE_KEY);
};

export const mapScoutRangeToCropBox = (range: ScoutPositioningRange) => {
    const totalSpan = BED_POSITION_MAX - BED_POSITION_MIN;
    if (totalSpan <= 0) return DEFAULT_CROP_BOX;

    const rangeStart = Math.min(range.start, range.end);
    const rangeEnd = Math.max(range.start, range.end);
    const normalizedStart = (rangeStart - BED_POSITION_MIN) / totalSpan;
    const normalizedEnd = (rangeEnd - BED_POSITION_MIN) / totalSpan;

    const y = Math.min(0.92, Math.max(0, normalizedStart));
    const height = Math.min(0.92 - y, Math.max(0.08, normalizedEnd - normalizedStart));

    return {
        ...DEFAULT_CROP_BOX,
        y,
        height,
    };
};

export const applyMeasurementsToCropBox = (
    cropBox: { x: number; y: number; width: number; height: number },
    metrics: { scanLength?: number | null; scoutFov?: number | null },
    meta: { width: number; height: number; pixelSpacingX: number; sliceThickness: number }
) => {
    const totalHeightMm = meta.height * meta.sliceThickness;
    const totalWidthMm = meta.width * meta.pixelSpacingX;
    const next = { ...cropBox };

    if (Number.isFinite(metrics.scanLength) && metrics.scanLength && totalHeightMm > 0) {
        next.height = Math.min(0.92 - next.y, Math.max(0.08, metrics.scanLength / totalHeightMm));
    }

    if (Number.isFinite(metrics.scoutFov) && metrics.scoutFov && totalWidthMm > 0) {
        const width = Math.min(0.92, Math.max(0.08, metrics.scoutFov / totalWidthMm));
        const centerX = next.x + next.width / 2;
        next.width = width;
        next.x = Math.min(1 - width, Math.max(0, centerX - width / 2));
    }

    return next;
};
