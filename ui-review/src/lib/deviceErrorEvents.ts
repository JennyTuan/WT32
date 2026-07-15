import { API_BASE_URL } from "./apiClient";

export type DeviceErrorSeverity = "fatal" | "error" | "warning";
export type DeviceErrorOccurrence = "raised" | "acknowledged" | "cleared";

export type DeviceErrorInfo = {
    code: string;
    known: boolean;
    module: string;
    severity: DeviceErrorSeverity;
    message: string;
    meaning: string;
    action: string;
    has_hardware_detail: boolean;
};

export type DeviceErrorEvent = {
    event: "DEVICE_ERROR";
    timestamp: string;
    occurrence: DeviceErrorOccurrence;
    source: "command_response" | "status_report" | "hardware_detail" | "history" | "simulation";
    command: string | null;
    scan_session_id: number | null;
    error: DeviceErrorInfo;
    raw_payload: Record<string, unknown>;
};

export const DEVICE_ERROR_RAISED_EVENT = "wt32:device-error-raised";

export const notifyDeviceErrorRaised = (event: DeviceErrorEvent) => {
    if (event.occurrence !== "raised" || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<DeviceErrorEvent>(DEVICE_ERROR_RAISED_EVENT, { detail: event }));
};

export const scanControlSocketUrl = () => {
    const base = API_BASE_URL
        ? new URL(API_BASE_URL, window.location.origin)
        : new URL(window.location.origin);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    base.pathname = "/ws/scan-control";
    base.search = "";
    base.hash = "";
    return base.toString();
};

export const isDeviceErrorEvent = (value: unknown): value is DeviceErrorEvent => {
    if (!value || typeof value !== "object") return false;
    const event = value as Partial<DeviceErrorEvent>;
    return event.event === "DEVICE_ERROR"
        && typeof event.occurrence === "string"
        && !!event.error
        && typeof event.error.code === "string"
        && typeof event.error.message === "string";
};
