export type FocusSize = "small" | "large";

export const KV_OPTIONS = ["80", "100", "120", "140"];

const MA_LIMITS: Record<FocusSize, Record<string, number>> = {
    small: { "80": 310, "100": 280, "120": 240, "140": 200 },
    large: { "80": 350, "100": 350, "120": 350, "140": 300 },
};

export const getMaLimit = (kv: string | number, focusSize: FocusSize = "small") =>
    MA_LIMITS[focusSize][String(kv)] ?? MA_LIMITS.small["120"];

export const clampMa = (ma: string | number, kv: string | number, focusSize: FocusSize = "small") =>
    Math.max(1, Math.min(getMaLimit(kv, focusSize), Math.round(Number(ma) || 1)));

/** Compact touch-screen mA presets; typed values are clamped by clampMa. */
export const getMaOptions = (kv: string | number, focusSize: FocusSize = "small") => {
    const limit = getMaLimit(kv, focusSize);
    return [...new Set([50, 100, 150, 200, 215, limit])]
        .filter((value) => value <= limit)
        .sort((left, right) => left - right)
        .map(String);
};
