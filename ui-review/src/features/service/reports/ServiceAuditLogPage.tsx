import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, RefreshCw, Search } from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";
import {
  listAuditLogs,
  listSystemLogs,
  type ApiAuditLog,
  type ApiSystemLog,
  type LogLevel,
} from "../../../lib/logsApi";
import type { TranslationKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/i18nContext";
import { buildCsv, downloadCsv, timestampSuffix } from "../../../lib/csvExport";
import LogDetailModal, { type DetailField, type DetailSection } from "./LogDetailModal";

const PAGE_SIZE = 50;
const ALL = "all";
type Translate = ReturnType<typeof useI18n>["t"];

type AuditStatus = "success" | "attention" | "failed" | "cancelled" | "info";

type NormalizedAuditLog = {
  id: string;
  timestamp: string;
  module: string;
  moduleStyle: string;
  event: string;
  status: AuditStatus;
  actor: string;
  targetType: string;
  targetName: string;
  detail: string;
  rawSearchText: string;
  source: "system" | "disk";
  raw: ApiSystemLog | ApiAuditLog;
};

const STATUS_LABELS: Record<AuditStatus, TranslationKey> = {
  success: "service.audit.status.success",
  attention: "service.audit.status.attention",
  failed: "service.audit.status.failed",
  cancelled: "service.audit.status.cancelled",
  info: "service.audit.status.info",
};

const STATUS_STYLES: Record<AuditStatus, string> = {
  success: "bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9]",
  attention: "bg-[#FFF3E0] text-[#EF6C00] border border-[#FFE0B2]",
  failed: "bg-[#FFEBEE] text-[#C62828] border border-[#FFCDD2]",
  cancelled: "bg-[#ECEFF1] text-[#546E7A] border border-[#CFD8DC]",
  info: "bg-[#E3F2FD] text-[#1565C0] border border-[#BBDEFB]",
};

const MODULE_STYLES = {
  scan: "bg-[#E3F2FD] text-[#1565C0] border border-[#BBDEFB]",
  data: "bg-[#F3E5F5] text-[#8E24AA] border border-[#E1BEE7]",
  runtime: "bg-[#ECEFF1] text-[#546E7A] border border-[#CFD8DC]",
  settings: "bg-[#FFF3E0] text-[#EF6C00] border border-[#FFE0B2]",
};

const DISK_ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
  RESERVE: "service.audit.diskAction.reserve",
  RELEASE: "service.audit.diskAction.release",
  PURGE: "service.audit.diskAction.purge",
  UPDATE_THRESHOLD: "service.audit.diskAction.updateThreshold",
  UPDATE_CONFIG: "service.audit.diskAction.updateConfig",
};

const SYSTEM_EVENT_LABEL_KEYS: Record<string, TranslationKey> = {
  app_started: "service.audit.systemEvent.appStarted",
  scan_started: "service.audit.systemEvent.scanStarted",
  scan_completed: "service.audit.systemEvent.scanCompleted",
  scan_cancelled: "service.audit.systemEvent.scanCancelled",
};

const formatTimestamp = (iso: string): { date: string; time: string } => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
};

const toIsoDayStart = (yyyyMmDd: string): Date | null => {
  if (!yyyyMmDd) return null;
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toIsoDayEnd = (yyyyMmDd: string): Date | null => {
  if (!yyyyMmDd) return null;
  const d = new Date(`${yyyyMmDd}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const statusFromLevel = (level: LogLevel): AuditStatus => {
  if (level === "ERROR" || level === "CRITICAL") return "failed";
  if (level === "WARNING") return "attention";
  return "info";
};

const systemModule = (log: ApiSystemLog, t: Translate): { label: string; style: string } => {
  if (log.source === "scan_sessions") {
    return { label: t("service.audit.module.scanWorkflow"), style: MODULE_STYLES.scan };
  }
  return { label: t("service.audit.module.systemRuntime"), style: MODULE_STYLES.runtime };
};

const systemStatus = (log: ApiSystemLog): AuditStatus => {
  if (log.event === "scan_completed") return "success";
  if (log.event === "scan_cancelled") return "cancelled";
  if (log.event === "scan_started") return "info";
  return statusFromLevel(log.level);
};

const normalizeSystemLog = (log: ApiSystemLog, t: Translate): NormalizedAuditLog => {
  const event = SYSTEM_EVENT_LABEL_KEYS[log.event] ? t(SYSTEM_EVENT_LABEL_KEYS[log.event]) : log.event;
  const module = systemModule(log, t);
  const targetType = log.scan_session_id == null ? t("service.audit.target.system") : t("service.audit.target.examSession");
  const targetName = log.scan_session_id == null ? t("service.audit.target.ctConsole") : `Session #${log.scan_session_id}`;
  const detail = log.message || log.details || "—";

  return {
    id: `system-${log.id}`,
    timestamp: log.timestamp,
    module: module.label,
    moduleStyle: module.style,
    event,
    status: systemStatus(log),
    actor: log.source === "main" ? t("service.audit.actor.system") : t("service.audit.actor.localOperator"),
    targetType,
    targetName,
    detail,
    rawSearchText: [module.label, event, targetType, targetName, detail, log.source, log.details ?? ""].join(" "),
    source: "system",
    raw: log,
  };
};

const fileListLabel = (fileIds: string[]): string => {
  if (fileIds.length === 0) return "—";
  if (fileIds.length <= 3) return fileIds.join(", ");
  return `${fileIds.slice(0, 3).join(", ")} +${fileIds.length - 3}`;
};

const normalizeDiskAudit = (log: ApiAuditLog, index: number, t: Translate): NormalizedAuditLog => {
  const event = DISK_ACTION_LABEL_KEYS[log.action] ? t(DISK_ACTION_LABEL_KEYS[log.action]) : log.action;
  const status: AuditStatus = log.result === "blocked" ? "attention" : log.result === "failed" ? "failed" : "success";
  const isConfig = log.action === "UPDATE_CONFIG";
  const isThreshold = log.action === "UPDATE_THRESHOLD";
  const targetType = isConfig ? t("service.audit.target.storagePolicy") : isThreshold ? t("service.audit.target.storageThreshold") : t("service.audit.target.scanFiles");
  const targetName = isConfig ? t("service.audit.target.retentionRules") : isThreshold ? (log.partition ?? t("service.audit.target.storagePartition")) : fileListLabel(log.file_ids);
  const detail = formatDiskAuditDetail(log, t);
  const moduleLabel = isConfig || isThreshold ? t("service.audit.module.systemSettings") : t("service.audit.module.dataManagement");

  return {
    id: `disk-${log.timestamp}-${log.action}-${index}`,
    timestamp: log.timestamp,
    module: moduleLabel,
    moduleStyle: isConfig || isThreshold ? MODULE_STYLES.settings : MODULE_STYLES.data,
    event,
    status,
    actor: t("service.audit.actor.localOperator"),
    targetType,
    targetName,
    detail,
    rawSearchText: [
      event,
      log.action,
      log.partition ?? "",
      log.result ?? "",
      targetType,
      targetName,
      detail,
      ...log.file_ids,
      JSON.stringify(log.detail),
    ].join(" "),
    source: "disk",
    raw: log,
  };
};

const formatDiskAuditDetail = (log: ApiAuditLog, t: Translate): string => {
  if (log.action === "UPDATE_CONFIG" && typeof log.detail.config === "object" && log.detail.config !== null) {
    const config = log.detail.config as Record<string, unknown>;
    return t("service.audit.detail.updateConfig", {
      days: String(config.retention_days ?? "-"),
      time: String(config.retention_time ?? "-"),
      autoCleanup: config.auto_cleanup ? t("service.audit.on") : t("service.audit.off"),
    });
  }
  if (log.action === "UPDATE_THRESHOLD") {
    return t("service.audit.detail.updateThreshold", {
      partition: log.partition ?? "-",
      threshold: String(log.detail.threshold ?? "-"),
    });
  }
  const blocked = Array.isArray(log.detail.blocked) ? log.detail.blocked.length : 0;
  return blocked > 0
    ? t("service.audit.detail.filesBlocked", { partition: log.partition ?? "-", count: log.file_ids.length, blocked })
    : t("service.audit.detail.files", { partition: log.partition ?? "-", count: log.file_ids.length });
};

export default function ServiceAuditLogPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<NormalizedAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [moduleFilter, setModuleFilter] = useState(ALL);
  const [eventFilter, setEventFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<NormalizedAuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [systemRows, diskRows] = await Promise.all([
        listSystemLogs({ limit: 2000 }),
        listAuditLogs({ limit: 2000 }),
      ]);
      const auditedSystemRows = systemRows.filter((log) => log.source === "scan_sessions");
      const normalized = [
        ...auditedSystemRows.map((row) => normalizeSystemLog(row, t)),
        ...diskRows.map((row, index) => normalizeDiskAudit(row, index, t)),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLogs(normalized);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("service.logs.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const modules = useMemo(() => Array.from(new Set(logs.map((log) => log.module))).sort(), [logs]);
  const events = useMemo(
    () => Array.from(new Set(logs.filter((log) => moduleFilter === ALL || log.module === moduleFilter).map((log) => log.event))).sort(),
    [logs, moduleFilter],
  );
  const statuses = useMemo(() => Array.from(new Set(logs.map((log) => log.status))).sort(), [logs]);

  const filtered = useMemo(() => {
    const from = toIsoDayStart(dateFrom);
    const to = toIsoDayEnd(dateTo);
    const q = searchText.trim().toLowerCase();

    return logs.filter((log) => {
      if (moduleFilter !== ALL && log.module !== moduleFilter) return false;
      if (eventFilter !== ALL && log.event !== eventFilter) return false;
      if (statusFilter !== ALL && log.status !== statusFilter) return false;
      if (from || to) {
        const t = new Date(log.timestamp).getTime();
        if (from && t < from.getTime()) return false;
        if (to && t > to.getTime()) return false;
      }
      if (q && !log.rawSearchText.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, moduleFilter, eventFilter, statusFilter, dateFrom, dateTo, searchText]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [moduleFilter, eventFilter, statusFilter, dateFrom, dateTo, searchText]);

  useEffect(() => {
    if (eventFilter !== ALL && !events.includes(eventFilter)) {
      setEventFilter(ALL);
    }
  }, [eventFilter, events]);

  const handleExport = useCallback(() => {
    const csv = buildCsv(filtered, [
      { header: t("service.logs.time"), value: (l) => l.timestamp },
      { header: t("service.audit.module"), value: (l) => l.module },
      { header: t("service.logs.event"), value: (l) => l.event },
      { header: t("service.audit.status"), value: (l) => t(STATUS_LABELS[l.status]) },
      { header: t("service.audit.actor"), value: (l) => l.actor },
      { header: t("service.audit.targetType"), value: (l) => l.targetType },
      { header: t("service.audit.target"), value: (l) => l.targetName },
      { header: t("service.logs.details"), value: (l) => l.detail },
    ]);
    downloadCsv(`audit-log-${timestampSuffix()}.csv`, csv);
  }, [filtered, t]);

  return (
    <ServiceModeShell currentRoute="/service/reports/audit-log" footerStatus={{ label: "IDLE", tone: "idle" }}>
      <section className="flex-1 flex flex-col relative overflow-hidden h-full">
        <div className="border-b border-[#E2EBF5] p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
              <input
                type="text"
                placeholder={t("service.audit.searchPlaceholder")}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="h-10 w-full rounded-lg border border-[#D6E2EF] pl-9 pr-4 text-[14px] text-[#37474F] placeholder:text-[#B0C4DE] focus:border-[#4D94FF] focus:outline-none"
              />
            </div>
            <button
              onClick={handleExport}
              disabled={loading || filtered.length === 0}
              className="flex h-10 items-center gap-2 rounded-lg border border-[#D6E2EF] bg-white px-4 text-[14px] font-bold text-[#37474F] transition-colors hover:bg-[#F5F8FC] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={14} />
              {t("service.logs.exportCsv")}
            </button>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex h-10 items-center gap-2 rounded-lg bg-[#4D94FF] px-4 text-[14px] font-bold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("common.refresh")}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#263238]">{t("service.logs.dateRange")}</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 rounded-lg border border-[#D6E2EF] px-3 text-[13px] text-[#37474F] focus:border-[#4D94FF] focus:outline-none"
              />
              <span className="text-[#90A4AE]">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 rounded-lg border border-[#D6E2EF] px-3 text-[13px] text-[#37474F] focus:border-[#4D94FF] focus:outline-none"
              />
            </div>

            <FilterSelect label={t("service.audit.module")} value={moduleFilter} onChange={setModuleFilter}>
              <option value={ALL}>{t("service.logs.all")}</option>
              {modules.map((module) => (
                <option key={module} value={module}>{module}</option>
              ))}
            </FilterSelect>

            <FilterSelect label={t("service.logs.event")} value={eventFilter} onChange={setEventFilter}>
              <option value={ALL}>{t("service.logs.all")}</option>
              {events.map((event) => (
                <option key={event} value={event}>{event}</option>
              ))}
            </FilterSelect>

            <FilterSelect label={t("service.audit.status")} value={statusFilter} onChange={setStatusFilter}>
              <option value={ALL}>{t("service.logs.all")}</option>
              {statuses.map((status) => (
                <option key={status} value={status}>{t(STATUS_LABELS[status])}</option>
              ))}
            </FilterSelect>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[#E2EBF5] bg-[#F5F8FC] font-black text-[#37474F]">
                  <th className="w-[120px] px-3 py-3 text-left">{t("service.logs.time")}</th>
                  <th className="w-[86px] px-3 py-3 text-left">{t("service.audit.module")}</th>
                  <th className="w-[120px] px-3 py-3 text-left">{t("service.logs.event")}</th>
                  <th className="w-[78px] px-3 py-3 text-left">{t("service.audit.status")}</th>
                  <th className="w-[90px] px-3 py-3 text-left">{t("service.audit.actor")}</th>
                  <th className="w-[105px] px-3 py-3 text-left">{t("service.audit.targetType")}</th>
                  <th className="px-3 py-3 text-left">{t("service.audit.target")}</th>
                  <th className="w-[230px] px-3 py-3 text-left">{t("service.logs.details")}</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-[14px] text-[#D32F2F]">{error}</td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-[14px] text-[#90A4AE]">
                      {loading ? t("service.logs.loading") : t("service.audit.noRecords")}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((log) => {
                    const timestamp = formatTimestamp(log.timestamp);
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className="cursor-pointer border-t border-[#E2EBF5] hover:bg-[#F9FBFC]"
                      >
                        <td className="whitespace-nowrap px-3 py-3">
                          <div className="font-mono text-[13px] leading-tight text-[#37474F]">{timestamp.date}</div>
                          <div className="mt-0.5 font-mono text-[11px] leading-tight text-[#90A4AE]">{timestamp.time}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex h-[22px] min-w-[64px] items-center justify-center rounded-md px-2 text-[11px] font-bold ${log.moduleStyle}`}>
                            {log.module}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[#37474F]">{log.event}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex h-[22px] min-w-[54px] items-center justify-center rounded-full px-2 text-[11px] font-bold ${STATUS_STYLES[log.status]}`}>
                            {t(STATUS_LABELS[log.status])}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-[#546E7A]">{log.actor}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-[#546E7A]">{log.targetType}</td>
                        <td className="px-3 py-3 text-[#37474F]">
                          <div className="max-w-[200px] truncate" title={log.targetName}>{log.targetName}</div>
                        </td>
                        <td className="px-3 py-3 text-[#37474F]">
                          <div className="max-w-[230px] truncate" title={log.detail}>{log.detail}</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[#E2EBF5] px-4 py-2 text-[12px] text-[#546E7A]">
            <div>
              {t("service.logs.totalRecords", { count: filtered.length })}
              {filtered.length !== logs.length && <span className="text-[#90A4AE]">{t("service.logs.filteredFrom", { count: logs.length })}</span>}
            </div>
            <div className="flex items-center gap-3">
              <span>{t("service.logs.page", { page: safePage + 1, total: pageCount })}</span>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex h-7 w-7 items-center justify-center rounded border border-[#D6E2EF] bg-white text-[#546E7A] hover:bg-[#F5F8FC] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="flex h-7 w-7 items-center justify-center rounded border border-[#D6E2EF] bg-white text-[#546E7A] hover:bg-[#F5F8FC] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {selectedLog && (
          <LogDetailModal
            title={`${selectedLog.module} · ${selectedLog.event}`}
            subtitle={`${formatTimestamp(selectedLog.timestamp).date} ${formatTimestamp(selectedLog.timestamp).time} · ${t(STATUS_LABELS[selectedLog.status])}`}
            sections={buildAuditDetailSections(selectedLog, t)}
            rawJson={selectedLog.raw}
            onClose={() => setSelectedLog(null)}
          />
        )}
      </section>
    </ServiceModeShell>
  );
}

function buildAuditDetailSections(log: NormalizedAuditLog, t: Translate): DetailSection[] {
  const baseFields: DetailField[] = [
    { label: t("service.logs.time"), value: log.timestamp, mono: true, span: "full" },
    { label: t("service.audit.module"), value: log.module },
    { label: t("service.logs.event"), value: log.event },
    { label: t("service.audit.status"), value: t(STATUS_LABELS[log.status]) },
    { label: t("service.audit.actor"), value: log.actor },
    { label: t("service.audit.targetType"), value: log.targetType },
    { label: t("service.audit.target"), value: log.targetName },
    { label: t("service.logs.details"), value: log.detail, span: "full" },
  ];

  const sections: DetailSection[] = [{ title: t("service.logs.basicInfo"), fields: baseFields }];

  if (log.source === "disk") {
    const raw = log.raw as ApiAuditLog;
    const extraFields: DetailField[] = [
      { label: "Action", value: raw.action, mono: true },
      { label: "Result", value: raw.result ?? "—", mono: true },
      { label: "Partition", value: raw.partition ?? "—", mono: true },
    ];
    if (raw.file_ids.length > 0) {
      extraFields.push({
        label: t("service.audit.fileIds", { count: raw.file_ids.length }),
        value: (
          <div className="max-h-[160px] overflow-auto font-mono text-[12px] leading-relaxed">
            {raw.file_ids.join(", ")}
          </div>
        ),
        span: "full",
      });
    }
    sections.push({ title: t("service.audit.diskOperation"), fields: extraFields });
  } else {
    const raw = log.raw as ApiSystemLog;
    sections.push({
      title: t("service.audit.systemLog"),
      fields: [
        { label: t("service.logs.level"), value: raw.level, mono: true },
        { label: t("service.logs.source"), value: raw.source, mono: true },
        { label: t("service.audit.rawEvent"), value: raw.event, mono: true },
        { label: t("service.logs.session"), value: raw.scan_session_id ?? "—", mono: true },
        { label: "Message", value: raw.message, span: "full" },
      ],
    });
  }

  return sections;
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] font-bold text-[#263238]">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 cursor-pointer appearance-none rounded-lg border border-[#D6E2EF] bg-white pl-3 pr-8 text-[13px] text-[#37474F] focus:border-[#4D94FF] focus:outline-none"
        >
          {children}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
      </div>
    </div>
  );
}
