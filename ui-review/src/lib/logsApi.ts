import { buildApiUrl } from "./apiClient";

export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type ApiSystemLog = {
    id: number;
    timestamp: string;
    level: LogLevel;
    source: string;
    event: string;
    message: string;
    details: string | null;
    scan_session_id: number | null;
};

export type ListSystemLogsParams = {
    level?: LogLevel;
    source?: string;
    event?: string;
    scan_session_id?: number;
    limit?: number;
    offset?: number;
};

export async function listSystemLogs(params: ListSystemLogsParams = {}): Promise<ApiSystemLog[]> {
    const search = new URLSearchParams();
    if (params.level) search.set("level", params.level);
    if (params.source) search.set("source", params.source);
    if (params.event) search.set("event", params.event);
    if (params.scan_session_id != null) search.set("scan_session_id", String(params.scan_session_id));
    if (params.limit != null) search.set("limit", String(params.limit));
    if (params.offset != null) search.set("offset", String(params.offset));

    const qs = search.toString();
    const path = qs ? `/api/logs/system?${qs}` : `/api/logs/system`;
    const res = await fetch(buildApiUrl(path));
    if (!res.ok) throw new Error(`Failed to list system logs (${res.status})`);
    return res.json();
}

export type ApiDoseLog = {
    id: number;
    created_at: string;
    scanned_at: string;
    patient_id: number | null;
    scan_session_id: number | null;
    scan_session_series_id: number | null;
    patient_name_snapshot: string | null;
    patient_id_snapshot: string | null;
    protocol_name_snapshot: string | null;
    series_order: number | null;
    series_type: string;
    series_label: string | null;
    body_part: string | null;
    acquisition_type: string | null;
    scan_mode: string | null;
    kv: number | null;
    ma: number | null;
    rotation_time: number | null;
    pitch: number | null;
    scan_length: number | null;
    collimator: string | null;
    ctdi_vol: number | null;
    dlp: number | null;
    operator: string | null;
};

export type ListDoseLogsParams = {
    patient_id?: number;
    patient_id_snapshot?: string;
    scan_session_id?: number;
    series_type?: string;
    body_part?: string;
    acquisition_type?: string;
    limit?: number;
    offset?: number;
};

export async function listDoseLogs(params: ListDoseLogsParams = {}): Promise<ApiDoseLog[]> {
    const search = new URLSearchParams();
    if (params.patient_id != null) search.set("patient_id", String(params.patient_id));
    if (params.patient_id_snapshot) search.set("patient_id_snapshot", params.patient_id_snapshot);
    if (params.scan_session_id != null) search.set("scan_session_id", String(params.scan_session_id));
    if (params.series_type) search.set("series_type", params.series_type);
    if (params.body_part) search.set("body_part", params.body_part);
    if (params.acquisition_type) search.set("acquisition_type", params.acquisition_type);
    if (params.limit != null) search.set("limit", String(params.limit));
    if (params.offset != null) search.set("offset", String(params.offset));

    const qs = search.toString();
    const path = qs ? `/api/logs/dose?${qs}` : `/api/logs/dose`;
    const res = await fetch(buildApiUrl(path));
    if (!res.ok) throw new Error(`Failed to list dose logs (${res.status})`);
    return res.json();
}

export type ApiAuditLog = {
    timestamp: string;
    action: string;
    partition: string | null;
    file_ids: string[];
    result: string | null;
    detail: Record<string, unknown>;
};

export type ListAuditLogsParams = {
    action?: string;
    partition?: string;
    result?: string;
    limit?: number;
    offset?: number;
};

export async function listAuditLogs(params: ListAuditLogsParams = {}): Promise<ApiAuditLog[]> {
    const search = new URLSearchParams();
    if (params.action) search.set("action", params.action);
    if (params.partition) search.set("partition", params.partition);
    if (params.result) search.set("result", params.result);
    if (params.limit != null) search.set("limit", String(params.limit));
    if (params.offset != null) search.set("offset", String(params.offset));

    const qs = search.toString();
    const path = qs ? `/api/disk-manager/audit?${qs}` : `/api/disk-manager/audit`;
    const res = await fetch(buildApiUrl(path));
    if (!res.ok) throw new Error(`Failed to list audit logs (${res.status})`);
    return res.json();
}
