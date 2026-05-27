// Default to relative URLs so requests go through the Vite dev proxy (configured
// in vite.config.ts) in development and same-origin in production. This keeps
// the auth session cookie working without cross-origin SameSite headaches.
// Set VITE_API_BASE_URL to override (e.g. when the SPA is hosted separately).
export const API_BASE_URL = (
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ""
).replace(/\/$/, "");

export const buildApiUrl = (path: string): string => {
    if (!API_BASE_URL) return path;
    return `${API_BASE_URL}${path}`;
};

// Wrapper around fetch that:
//  - prepends API_BASE_URL when the input is a path (string starting with "/")
//  - sends cookies cross-origin (required for the auth session cookie in dev)
export const apiFetch = (input: string, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" && input.startsWith("/") ? buildApiUrl(input) : input;
    return fetch(url, { credentials: "include", ...init });
};
