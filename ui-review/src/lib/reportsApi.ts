import { buildApiUrl } from "./apiClient";
import type { ApiAuditLog, ApiSystemLog } from "./logsApi";
import type { DailyQaRecord } from "../features/service/dailyQa/types";

export type QaReportParams = {
  dateFrom?: string;
  dateTo?: string;
  operator?: string;
  search?: string;
};

export type QaReportResponse = {
  items: DailyQaRecord[];
  total: number;
  operators: string[];
};

export async function listQaReportRecords(params: QaReportParams = {}): Promise<QaReportResponse> {
  const search = new URLSearchParams();
  if (params.dateFrom) search.set("date_from", params.dateFrom);
  if (params.dateTo) search.set("date_to", params.dateTo);
  if (params.operator) search.set("operator", params.operator);
  if (params.search) search.set("search", params.search);
  const suffix = search.toString();
  const response = await fetch(buildApiUrl(`/api/reports/qa${suffix ? `?${suffix}` : ""}`));
  if (!response.ok) throw new Error(`Failed to list QA report records (${response.status})`);
  return response.json();
}

export type RuntimeStats = {
  period: { from: string; to: string };
  completed_scans: number;
  completed_scans_all_time: number;
  scan_mix: Record<string, number>;
  daily_scans: Array<{ date: string; count: number }>;
  alerts: { errors: number; warnings: number };
  telemetry: {
    power_on_hours: number | null;
    tube_exposure_hours: number | null;
    component_usage: Array<{
      key: string;
      cumulative: number;
      rated: number;
      unit: string;
    }>;
    availability_note: string;
  };
};

export async function getRuntimeStats(dateFrom: string, dateTo: string): Promise<RuntimeStats> {
  const search = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  const response = await fetch(buildApiUrl(`/api/reports/runtime-stats?${search}`));
  if (!response.ok) throw new Error(`Failed to load runtime statistics (${response.status})`);
  return response.json();
}

export type ReportAuditResponse = {
  system_logs: ApiSystemLog[];
  disk_logs: ApiAuditLog[];
};

export async function listReportAuditLogs(): Promise<ReportAuditResponse> {
  const response = await fetch(buildApiUrl("/api/reports/audit"));
  if (!response.ok) throw new Error(`Failed to list audit logs (${response.status})`);
  return response.json();
}
