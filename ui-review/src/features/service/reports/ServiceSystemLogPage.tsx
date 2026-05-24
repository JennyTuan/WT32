import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";
import { listSystemLogs, type ApiSystemLog, type LogLevel } from "../../../lib/logsApi";
import { buildCsv, downloadCsv, timestampSuffix } from "../../../lib/csvExport";
import LogDetailModal, { type DetailSection } from "./LogDetailModal";

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];
const PAGE_SIZE = 50;

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
  const [logs, setLogs] = useState<ApiSystemLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [levelFilter, setLevelFilter] = useState<"全部" | LogLevel>("全部");
  const [sourceFilter, setSourceFilter] = useState<string>("全部");
  const [eventFilter, setEventFilter] = useState<string>("全部");
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
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

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
      if (levelFilter !== "全部" && l.level !== levelFilter) return false;
      if (sourceFilter !== "全部" && l.source !== sourceFilter) return false;
      if (eventFilter !== "全部" && l.event !== eventFilter) return false;
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
      { header: "时间", value: (l) => l.timestamp },
      { header: "级别", value: (l) => l.level },
      { header: "来源", value: (l) => l.source },
      { header: "事件", value: (l) => l.event },
      { header: "描述", value: (l) => l.message },
      { header: "会话", value: (l) => l.scan_session_id ?? "" },
      { header: "详情", value: (l) => l.details ?? "" },
    ]);
    downloadCsv(`system-log-${timestampSuffix()}.csv`, csv);
  }, [filtered]);

  return (
    <ServiceModeShell currentRoute="/service/reports/system-log" footerStatus={{ label: "IDLE", tone: "idle" }}>
      <section className="flex-1 flex flex-col relative overflow-hidden h-full">
        {/* toolbar */}
        <div className="p-4 border-b border-[#E2EBF5]">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
              <input
                type="text"
                placeholder="搜索描述 / 来源 / 事件..."
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
              导出 CSV
            </button>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="px-4 h-10 bg-[#4D94FF] text-white font-bold rounded-lg flex items-center gap-2 text-[14px] hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              刷新
            </button>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#263238]">日期范围</span>
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
              <span className="text-[13px] font-bold text-[#263238]">级别</span>
              <div className="relative">
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value as "全部" | LogLevel)}
                  className="appearance-none h-9 pl-3 pr-8 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF] bg-white cursor-pointer"
                >
                  <option value="全部">全部</option>
                  {LEVELS.map((lv) => (
                    <option key={lv} value={lv}>{lv}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#263238]">来源</span>
              <div className="relative">
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="appearance-none h-9 pl-3 pr-8 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF] bg-white cursor-pointer"
                >
                  <option value="全部">全部</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#263238]">事件</span>
              <div className="relative">
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  className="appearance-none h-9 pl-3 pr-8 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF] bg-white cursor-pointer"
                >
                  <option value="全部">全部</option>
                  {events.map((ev) => (
                    <option key={ev} value={ev}>{ev}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* table */}
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
                  <th className="text-left px-3 py-3">时间</th>
                  <th className="text-left px-3 py-3">级别</th>
                  <th className="text-left px-3 py-3">来源</th>
                  <th className="text-left px-3 py-3">事件</th>
                  <th className="text-left px-3 py-3">描述</th>
                  <th className="text-left px-3 py-3">会话</th>
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
                      {loading ? "加载中..." : "没有找到日志记录"}
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

          {/* pagination */}
          <div className="border-t border-[#E2EBF5] px-4 py-2 flex items-center justify-between text-[12px] text-[#546E7A]">
            <div>
              共 <span className="font-bold text-[#263238]">{filtered.length}</span> 条记录
              {filtered.length !== logs.length && (
                <span className="text-[#90A4AE]">（已过滤自 {logs.length} 条）</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span>
                第 <span className="font-bold text-[#263238]">{safePage + 1}</span> / {pageCount} 页
              </span>
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
            sections={buildSystemLogSections(selectedLog)}
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

function buildSystemLogSections(log: ApiSystemLog): DetailSection[] {
  return [
    {
      title: "基本信息",
      fields: [
        { label: "级别", value: log.level, mono: true },
        { label: "来源", value: log.source, mono: true },
        { label: "事件", value: log.event, mono: true },
        { label: "会话", value: log.scan_session_id ?? "—", mono: true },
        { label: "时间", value: log.timestamp, mono: true, span: "full" },
      ],
    },
    {
      title: "描述",
      fields: [
        { label: "Message", value: log.message, span: "full" },
      ],
    },
  ];
}
