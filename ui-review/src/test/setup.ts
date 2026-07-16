import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
});

afterEach(() => {
    vi.unstubAllGlobals();
});
