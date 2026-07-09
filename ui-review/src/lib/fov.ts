export const FOV_MIN_MM = 50;
export const FOV_MAX_MM = 750;

export const clampFov = (value: number) => {
    if (!Number.isFinite(value)) return FOV_MIN_MM;
    return Math.min(FOV_MAX_MM, Math.max(FOV_MIN_MM, value));
};

export const parseFovValue = (value: string | number | null | undefined, fallback: number) => {
    if (typeof value === "number") return clampFov(value);

    const normalized = String(value ?? "").replace(/[^\d.-]/g, "").trim();
    if (!normalized) return clampFov(fallback);

    const parsed = Number(normalized);
    return clampFov(Number.isFinite(parsed) ? parsed : fallback);
};
