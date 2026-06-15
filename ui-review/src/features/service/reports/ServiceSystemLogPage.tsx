import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";
import { listSystemLogs, type ApiSystemLog, type LogLevel } from "../../../lib/logsApi";
import { buildCsv, downloadCsv, timestampSuffix } from "../../../lib/csvExport";
import { useI18n } from "../../../lib/i18nContext";
import LogDetailModal, { type DetailSection } from "./LogDetailModal";

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];
const PAGE_SIZE = 50;
const ALL_FILTER = "all";
type Translate = ReturnType<typeof useI18n>["t"];

const LEVEL_STYLES: Record<LogLevel, string> = {
  DEBUG: "bg-[#ECEFF1] text-[#546E7A] border border-[#CFD8DC]",
  INFO: "bg-[#E3F2FD] text-[#1E88E5] border border-[#BBDEFB]",
  WARNING: "bg-[#FFF3E0] text-[#EF6C00] border border-[#FFCC80]",
  ERROR: "bg-[#FFEBEE] text-[#D32F2F] border border-[#FFCDD2]",
  CRITICAL: "bg-[#4A148C] text-white border border-[#4A148C]",
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

export default function ServiceSystemLogPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<ApiSystemLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [levelFilter, setLevelFilter] = useState<typeof ALL_FILTER | LogLevel>(ALL_FILTER);
  const [sourceFilter, setSourceFilter] = useState<string>(ALL_FILTER);
  const [eventFilter, setEventFilter] = useState<string>(ALL_FILTER);
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ApiSystemLog | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSystemLogs({ limit: 2000 });
      setLogs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("service.logs.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const sources = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.source))).sort();
  }, [logs]);

  const events = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.event))).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const from = toIsoDayStart(dateFrom);
    const to = toIsoDayEnd(dateTo);
    const q = searchText.trim().toLowerCase();

    return logs.filter((l) => {
      if (levelFilter !== ALL_FILTER && l.level !== levelFilter) return false;
      if (sourceFilter !== ALL_FILTER && l.source !== sourceFilter) return false;
      if (eventFilter !== ALL_FILTER && l.event !== eventFilter) return false;
      if (from || to) {
        const t = new Date(l.timestamp).getTime();
        if (from && t < from.getTime()) return false;
        if (to && t > to.getTime()) return false;
      }
      if (q) {
        const hay = `${l.message} ${l.source} ${l.event} ${l.details ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, levelFilter, sourceFilter, eventFilter, dateFrom, dateTo, searchText]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [levelFilter, sourceFilter, eventFilter, dateFrom, dateTo, searchText]);

  const handleExport = useCallback(() => {
    const csv = buildCsv(filtered, [
      { header: t("service.logs.time"), value: (l) => l.timestamp },
      { header: t("service.logs.level"), value: (l) => l.level },
      { header: t("service.logs.source"), value: (l) => l.source },
      { header: t("service.logs.event"), value: (l) => l.event },
      { header: t("service.logs.description"), value: (l) => l.message },
      { header: t("service.logs.session"), value: (l) => l.scan_session_id ?? "" },
      { header: t("service.logs.details"), value: (l) => l.details ?? "" },
    ]);
    downloadCsv(`system-log-${timestampSuffix()}.csv`, csv);
  }, [filtered, t]);

  return (
    <ServiceModeShell currentRoute="/service/reports/system-log">
      <section className="flex-1 flex flex-col relative overflow-hidden h-full">
        <div className="p-4 border-b border-[#E2EBF5]">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
              <input
                type="text"
                placeholder={t("service.logs.systemSearchPlaceholder")}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-9 pr-4 h-10 border border-[#D6E2EF] rounded-lg text-[14px] text-[#37474F] placeholder:text-[#B0C4DE] focus:outline-none focus:border-[#4D94FF]"
              />
            </div>
            <button
              onClick={handleExport}
              disabled={loading || filtered.length === 0}
              className="px-4 h-10 bg-white border border-[#D6E2EF] text-[#37474F] font-bold rounded-lg flex items-center gap-2 text-[14px] hover:bg-[#F5F8FC] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} />
              {t("service.logs.exportCsv")}
            </button>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="px-4 h-10 bg-[#4D94FF] text-white font-bold rounded-lg flex items-center gap-2 text-[14px] hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("common.refresh")}
            </button>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#263238]">{t("service.logs.dateRange")}</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 px-3 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF]"
              />
              <span className="text-[#90A4AE]">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 px-3 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF]"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#263238]">{t("service.logs.level")}</span>
              <div className="relative">
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value as typeof ALL_FILTER | LogLevel)}
                  className="appearance-none h-9 pl-3 pr-8 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF] bg-white cursor-pointer"
                >
                  <option value={ALL_FILTER}>{t("service.logs.all")}</option>
                  {LEVELS.map((lv) => (
                    <option key={lv} value={lv}>{lv}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#263238]">{t("service.logs.source")}</span>
              <div className="relative">
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="appearance-none h-9 pl-3 pr-8 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF] bg-white cursor-pointer"
                >
                  <option value={ALL_FILTER}>{t("service.logs.all")}</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#263238]">{t("service.logs.event")}</span>
              <div className="relative">
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  className="appearance-none h-9 pl-3 pr-8 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF] bg-white cursor-pointer"
                >
                  <option value={ALL_FILTER}>{t("service.logs.all")}</option>
                  {events.map((ev) => (
                    <option key={ev} value={ev}>{ev}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto">
            <table className="w-full table-fixed text-[13px]">
              <colgroup>
                <col className="w-[136px]" />
                <col className="w-[92px]" />
                <col className="w-[112px]" />
                <col className="w-[150px]" />
                <col />
                <col className="w-[74px]" />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#F5F8FC] text-[#37474F] font-black border-b border-[#E2EBF5]">
                  <th className="text-left px-3 py-3">{t("service.logs.time")}</th>
                  <th className="text-left px-3 py-3">{t("service.logs.level")}</th>
                  <th className="text-left px-3 py-3">{t("service.logs.source")}</th>
                  <th className="text-left px-3 py-3">{t("service.logs.event")}</th>
                  <th className="text-left px-3 py-3">{t("service.logs.description")}</th>
                  <th className="text-left px-3 py-3">{t("service.logs.session")}</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-[#D32F2F] text-[14px]">
                      {error}
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-[#90A4AE] text-[14px]">
                      {loading ? t("service.logs.loading") : t("service.logs.noSystemLogs")}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => setSelectedLog(l)}
                      className="cursor-pointer border-t border-[#E2EBF5] hover:bg-[#F9FBFC]"
                    >
                      <td className="px-3 py-3 text-[#37474F] font-mono text-[12px] whitespace-nowrap">
                        {(() => {
                          const t = formatTimestamp(l.timestamp);
                          return (
                            <>
                              <div className="text-[13px] text-[#37474F] font-mono leading-tight">{t.date}</div>
                              <div className="text-[11px] text-[#90A4AE] font-mono leading-tight mt-0.5">{t.time}</div>
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center justify-center min-w-[58px] h-[22px] px-2 rounded-full text-[11px] font-bold ${LEVEL_STYLES[l.level]}`}>
                          {l.level}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[#546E7A] font-mono text-[12px]">
                        <div className="truncate" title={l.source}>{l.source}</div>
                      </td>
                      <td className="px-3 py-3 text-[#37474F]">
                        <div className="truncate" title={l.event}>{l.event}</div>
                      </td>
                      <td className="px-3 py-3 text-[#37474F]">
                        <div className="max-w-full break-words leading-snug">{l.message}</div>
                      </td>
                      <td className="px-3 py-3 text-[#546E7A] font-mono text-[12px]">
                        {l.scan_session_id ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[#E2EBF5] px-4 py-2 flex items-center justify-between text-[12px] text-[#546E7A]">
            <div>
              {t("service.logs.totalRecords", { count: filtered.length })}
              {filtered.length !== logs.length && (
                <span className="text-[#90A4AE]">{t("service.logs.filteredFrom", { count: logs.length })}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span>{t("service.logs.page", { page: safePage + 1, total: pageCount })}</span>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="w-7 h-7 rounded border border-[#D6E2EF] bg-white text-[#546E7A] hover:bg-[#F5F8FC] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="w-7 h-7 rounded border border-[#D6E2EF] bg-white text-[#546E7A] hover:bg-[#F5F8FC] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {selectedLog && (
          <LogDetailModal
            title={`${selectedLog.level} · ${selectedLog.event}`}
            subtitle={formatTimestamp(selectedLog.timestamp).date + " " + formatTimestamp(selectedLog.timestamp).time}
            sections={buildSystemLogSections(selectedLog, t)}
            rawJson={parseDetails(selectedLog.details)}
            onClose={() => setSelectedLog(null)}
          />
        )}
      </section>
    </ServiceModeShell>
  );
}

function parseDetails(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function buildSystemLogSections(log: ApiSystemLog, t: Translate): DetailSection[] {
  return [
    {
      title: t("service.logs.basicInfo"),
      fields: [
        { label: t("service.logs.level"), value: log.level, mono: true },
        { label: t("service.logs.source"), value: log.source, mono: true },
        { label: t("service.logs.event"), value: log.event, mono: true },
        { label: t("service.logs.session"), value: log.scan_session_id ?? "—", mono: true },
        { label: t("service.logs.time"), value: log.timestamp, mono: true, span: "full" },
      ],
    },
    {
      title: t("service.logs.description"),
      fields: [
        { label: "Message", value: log.message, span: "full" },
      ],
    },
  ];
}
