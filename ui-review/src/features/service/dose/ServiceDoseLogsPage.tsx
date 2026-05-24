import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";
import { listDoseLogs, type ApiDoseLog } from "../../../lib/logsApi";
import { buildCsv, downloadCsv, timestampSuffix } from "../../../lib/csvExport";

const PAGE_SIZE = 50;

const SERIES_TYPE_LABEL: Record<string, string> = {
  topogram: "Scout",
  helical: "螺旋",
  axial: "轴扫",
};

const SERIES_TYPE_STYLES: Record<string, string> = {
  topogram: "bg-[#ECEFF1] text-[#546E7A] border border-[#CFD8DC]",
  helical: "bg-[#E3F2FD] text-[#1E88E5] border border-[#BBDEFB]",
  axial: "bg-[#F3E5F5] text-[#8E24AA] border border-[#E1BEE7]",
};

type DoseScanKind = "regular" | "contrast" | "gating" | "four_d";

const SCAN_KIND_LABELS: Record<DoseScanKind, string> = {
  regular: "常规",
  contrast: "增强",
  gating: "门控",
  four_d: "4D",
};

const SCAN_KIND_STYLES: Record<DoseScanKind, string> = {
  regular: "bg-[#ECEFF1] text-[#546E7A] border border-[#CFD8DC]",
  contrast: "bg-[#FFF3E0] text-[#EF6C00] border border-[#FFE0B2]",
  gating: "bg-[#E0F7FA] text-[#00838F] border border-[#B2EBF2]",
  four_d: "bg-[#F3E5F5] text-[#8E24AA] border border-[#E1BEE7]",
};

const getDoseScanKind = (log: ApiDoseLog): DoseScanKind => {
  if (log.acquisition_type === "four_d" || log.scan_mode === "4d") return "four_d";
  if (log.acquisition_type === "gating") return "gating";
  if (log.scan_mode === "contrast") return "contrast";
  return "regular";
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

const fmt = (v: number | null, digits = 2): string => {
  if (v == null) return "—";
  return v.toFixed(digits);
};

const fmtInt = (v: number | null): string => {
  if (v == null) return "—";
  return String(v);
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

export default function ServiceDoseLogsPage() {
  const [logs, setLogs] = useState<ApiDoseLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seriesTypeFilter, setSeriesTypeFilter] = useState<string>("全部");
  const [bodyPartFilter, setBodyPartFilter] = useState<string>("全部");
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDoseLogs({ limit: 2000 });
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

  const seriesTypes = useMemo(() => Array.from(new Set(logs.map((l) => l.series_type))).sort(), [logs]);
  const bodyParts = useMemo(
    () => Array.from(new Set(logs.map((l) => l.body_part).filter((v): v is string => !!v))).sort(),
    [logs],
  );

  const filtered = useMemo(() => {
    const from = toIsoDayStart(dateFrom);
    const to = toIsoDayEnd(dateTo);
    const q = searchText.trim().toLowerCase();

    return logs.filter((l) => {
      if (seriesTypeFilter !== "全部" && l.series_type !== seriesTypeFilter) return false;
      if (bodyPartFilter !== "全部" && l.body_part !== bodyPartFilter) return false;
      if (from || to) {
        const t = new Date(l.scanned_at).getTime();
        if (from && t < from.getTime()) return false;
        if (to && t > to.getTime()) return false;
      }
      if (q) {
        const scanKind = SCAN_KIND_LABELS[getDoseScanKind(l)];
        const hay = `${l.patient_id_snapshot ?? ""} ${l.patient_name_snapshot ?? ""} ${l.protocol_name_snapshot ?? ""} ${l.series_label ?? ""} ${scanKind}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, seriesTypeFilter, bodyPartFilter, dateFrom, dateTo, searchText]);

  const totalDlp = useMemo(
    () => filtered.reduce((sum, l) => sum + (l.dlp ?? 0), 0),
    [filtered],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [seriesTypeFilter, bodyPartFilter, dateFrom, dateTo, searchText]);

  const handleExport = useCallback(() => {
    const csv = buildCsv(filtered, [
      { header: "扫描时间", value: (l) => l.scanned_at },
      { header: "患者姓名", value: (l) => l.patient_name_snapshot ?? "" },
      { header: "患者ID", value: (l) => l.patient_id_snapshot ?? "" },
      { header: "协议", value: (l) => l.protocol_name_snapshot ?? "" },
      { header: "扫描模式", value: (l) => SCAN_KIND_LABELS[getDoseScanKind(l)] },
      { header: "序列", value: (l) => SERIES_TYPE_LABEL[l.series_type] ?? l.series_type },
      { header: "部位", value: (l) => l.body_part ?? "" },
      { header: "kV", value: (l) => l.kv ?? "" },
      { header: "mA", value: (l) => l.ma ?? "" },
      { header: "CTDIvol (mGy)", value: (l) => l.ctdi_vol ?? "" },
      { header: "DLP (mGy·cm)", value: (l) => l.dlp ?? "" },
      { header: "扫描长度 (mm)", value: (l) => l.scan_length ?? "" },
      { header: "旋转时间 (s)", value: (l) => l.rotation_time ?? "" },
      { header: "Pitch", value: (l) => l.pitch ?? "" },
      { header: "准直", value: (l) => l.collimator ?? "" },
      { header: "操作者", value: (l) => l.operator ?? "" },
    ]);
    downloadCsv(`dose-log-${timestampSuffix()}.csv`, csv);
  }, [filtered]);

  return (
    <ServiceModeShell currentRoute="/service/dose/logs" footerStatus={{ label: "IDLE", tone: "idle" }}>
      <section className="flex-1 flex flex-col relative overflow-hidden h-full">
        {/* toolbar */}
        <div className="p-4 border-b border-[#E2EBF5]">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
              <input
                type="text"
                placeholder="搜索患者ID / 姓名 / 协议..."
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
              <span className="text-[13px] font-bold text-[#263238]">序列类型</span>
              <div className="relative">
                <select
                  value={seriesTypeFilter}
                  onChange={(e) => setSeriesTypeFilter(e.target.value)}
                  className="appearance-none h-9 pl-3 pr-8 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF] bg-white cursor-pointer"
                >
                  <option value="全部">全部</option>
                  {seriesTypes.map((s) => (
                    <option key={s} value={s}>{SERIES_TYPE_LABEL[s] ?? s}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#263238]">部位</span>
              <div className="relative">
                <select
                  value={bodyPartFilter}
                  onChange={(e) => setBodyPartFilter(e.target.value)}
                  className="appearance-none h-9 pl-3 pr-8 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF] bg-white cursor-pointer"
                >
                  <option value="全部">全部</option>
                  {bodyParts.map((b) => (
                    <option key={b} value={b}>{b}</option>
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
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#F5F8FC] text-[#37474F] font-black border-b border-[#E2EBF5]">
                  <th className="text-left px-3 py-3 w-[110px]">扫描时间</th>
                  <th className="text-left px-3 py-3 w-[160px]">患者</th>
                  <th className="text-left px-3 py-3">协议</th>
                  <th className="text-left px-3 py-3 w-[68px]">扫描模式</th>
                  <th className="text-left px-3 py-3 w-[72px]">序列</th>
                  <th className="text-left px-3 py-3 w-[80px]">部位</th>
                  <th className="text-right px-3 py-3 w-[90px]">kV / mA</th>
                  <th className="text-right px-3 py-3 w-[88px]">
                    CTDIvol<span className="block text-[10px] text-[#90A4AE] font-normal">mGy</span>
                  </th>
                  <th className="text-right px-3 py-3 w-[96px]">
                    DLP<span className="block text-[10px] text-[#90A4AE] font-normal">mGy·cm</span>
                  </th>
                  <th className="text-right px-3 py-3 w-[96px]">
                    扫描长度<span className="block text-[10px] text-[#90A4AE] font-normal">mm</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-[#D32F2F] text-[14px]">
                      {error}
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-[#90A4AE] text-[14px]">
                      {loading ? "加载中..." : "没有找到剂量记录"}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((l) => (
                    <tr key={l.id} className="border-t border-[#E2EBF5] hover:bg-[#F9FBFC]">
                      <td className="px-3 py-3 whitespace-nowrap">
                        {(() => {
                          const t = formatTimestamp(l.scanned_at);
                          return (
                            <>
                              <div className="text-[13px] text-[#37474F] font-mono leading-tight">{t.date}</div>
                              <div className="text-[11px] text-[#90A4AE] font-mono leading-tight mt-0.5">{t.time}</div>
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-[13px] font-bold text-[#37474F] leading-tight">
                          {l.patient_name_snapshot ?? "—"}
                        </div>
                        <div className="text-[11px] text-[#90A4AE] font-mono leading-tight mt-0.5">
                          {l.patient_id_snapshot ?? "—"}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#37474F]">
                        <div className="max-w-[200px] truncate" title={l.protocol_name_snapshot ?? ""}>
                          {l.protocol_name_snapshot ?? "—"}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {(() => {
                          const scanKind = getDoseScanKind(l);
                          return (
                            <span
                              className={`inline-flex items-center justify-center min-w-[54px] h-[22px] px-2 rounded-md text-[11px] font-bold ${SCAN_KIND_STYLES[scanKind]}`}
                            >
                              {SCAN_KIND_LABELS[scanKind]}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center min-w-[50px] h-[22px] px-2 rounded-full text-[11px] font-bold ${SERIES_TYPE_STYLES[l.series_type] ?? "bg-[#ECEFF1] text-[#546E7A] border border-[#CFD8DC]"}`}
                        >
                          {SERIES_TYPE_LABEL[l.series_type] ?? l.series_type}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[#37474F] whitespace-nowrap">{l.body_part ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-mono text-[#37474F] whitespace-nowrap">
                        {fmtInt(l.kv)}<span className="text-[#90A4AE] mx-1">/</span>{fmt(l.ma, 0)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[#37474F] whitespace-nowrap">{fmt(l.ctdi_vol)}</td>
                      <td className="px-3 py-3 text-right font-mono text-[#37474F] whitespace-nowrap">{fmt(l.dlp)}</td>
                      <td className="px-3 py-3 text-right font-mono text-[#37474F] whitespace-nowrap">{fmt(l.scan_length, 1)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* footer: pagination + total DLP */}
          <div className="border-t border-[#E2EBF5] px-4 py-2 flex items-center justify-between text-[12px] text-[#546E7A]">
            <div className="flex items-center gap-4">
              <span>
                共 <span className="font-bold text-[#263238]">{filtered.length}</span> 条记录
                {filtered.length !== logs.length && (
                  <span className="text-[#90A4AE]">（已过滤自 {logs.length} 条）</span>
                )}
              </span>
              <span className="text-[#90A4AE]">·</span>
              <span>
                合计 DLP <span className="font-bold text-[#1E88E5] font-mono">{totalDlp.toFixed(2)}</span>
                <span className="text-[10px] text-[#90A4AE] ml-1">mGy·cm</span>
              </span>
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
      </section>
    </ServiceModeShell>
  );
}
