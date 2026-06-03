import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, FileText, Printer, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";

import type { TranslationKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/i18nContext";
import ServiceModeShell from "../shared/ServiceModeShell";
import { listDoseLogs, type ApiDoseLog } from "../../../lib/logsApi";
import { listDrlEntries, type ApiDrlEntry } from "../../../lib/doseSettingsApi";
import { evaluateThreshold } from "../../../lib/doseThreshold";
import { estimateDose } from "../../../lib/doseEstimate";
import { buildApiUrl } from "../../../lib/apiClient";
import { buildCsv, downloadCsv, timestampSuffix } from "../../../lib/csvExport";
import { printDoseLogReport } from "./printDoseLogReport";

type ProtocolSeedSeries = {
  series_type: string;
  helical_param?: SeedParam | null;
  axial_param?: SeedParam | null;
  topogram_param?: SeedParam | null;
};

type SeedParam = {
  ma?: number | null;
  kv?: number | null;
  rotation_time?: number | null;
  pitch?: number | null;
  scan_length?: number | null;
  ctdi_vol?: number | null;
  dlp?: number | null;
};

type ProtocolListItem = {
  name: string;
  series: ProtocolSeedSeries[];
};

// Build a lookup: protocol_name + series_type → seed dose parameters.
// We use this to re-estimate CTDIvol/DLP for dose log rows whose stored values
// were never updated to reflect parameter edits (older records, or backend
// without on-execute recompute).
const buildSeedMap = (protocols: ProtocolListItem[]): Map<string, SeedParam> => {
  const map = new Map<string, SeedParam>();
  for (const proto of protocols) {
    for (const series of proto.series ?? []) {
      const seed = series.helical_param ?? series.axial_param ?? series.topogram_param ?? null;
      if (!seed) continue;
      map.set(`${proto.name}::${series.series_type}`, seed);
    }
  }
  return map;
};

const PAGE_SIZE = 50;
const ALL_FILTER = "all";

const SERIES_TYPE_LABEL_KEYS: Record<string, TranslationKey> = {
  topogram: "service.doseLogs.series.topogram",
  helical: "service.doseLogs.series.helical",
  axial: "service.doseLogs.series.axial",
};

const SERIES_TYPE_STYLES: Record<string, string> = {
  topogram: "bg-[#ECEFF1] text-[#546E7A] border border-[#CFD8DC]",
  helical: "bg-[#E3F2FD] text-[#1E88E5] border border-[#BBDEFB]",
  axial: "bg-[#F3E5F5] text-[#8E24AA] border border-[#E1BEE7]",
};

type DoseScanKind = "regular" | "contrast" | "gating" | "four_d";

const SCAN_KIND_LABEL_KEYS: Record<DoseScanKind, TranslationKey> = {
  regular: "service.doseLogs.scanKind.regular",
  contrast: "service.doseLogs.scanKind.contrast",
  gating: "service.doseLogs.scanKind.gating",
  four_d: "service.doseLogs.scanKind.fourD",
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

// Dose logs don't carry age_group, so the shared evaluator falls back to the
// adult DRL entry for the matching body_part (after EN↔ZH normalization).
// When a protocol seed is available, we recompute CTDIvol/DLP from the log's
// stored ma/kv/scan_length so historical records whose stored dose was never
// updated still flag correctly.
const isOverThreshold = (
  log: ApiDoseLog,
  drlEntries: ApiDrlEntry[],
  seedMap: Map<string, SeedParam>,
): boolean => {
  let ctdi = log.ctdi_vol;
  let dlp = log.dlp;

  if (log.protocol_name_snapshot) {
    const seed = seedMap.get(`${log.protocol_name_snapshot}::${log.series_type}`);
    if (seed && (log.ma != null || log.kv != null)) {
      const estimated = estimateDose({
        current: {
          ma: log.ma,
          kv: log.kv,
          rotation_time: log.rotation_time,
          pitch: log.pitch,
          scan_length: log.scan_length,
        },
        reference: seed,
      });
      ctdi = estimated.ctdi_vol;
      dlp = estimated.dlp;
    }
  }

  return evaluateThreshold(
    { body_part: log.body_part, ctdi_vol: ctdi, dlp },
    drlEntries,
  ).exceeded;
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

const BODY_PART_LABEL_KEYS: Record<string, TranslationKey> = {
  头颅: "service.doseSettings.bodyPart.head",
  颈部: "service.doseSettings.bodyPart.neck",
  胸部: "service.doseSettings.bodyPart.chest",
  腹部: "service.doseSettings.bodyPart.abdomen",
  盆腔: "service.doseSettings.bodyPart.pelvis",
  脊柱: "service.doseSettings.bodyPart.spine",
  心脏: "service.doseSettings.bodyPart.cardiac",
  四肢: "service.doseSettings.bodyPart.extremities",
};

type Translate = ReturnType<typeof useI18n>["t"];

const translateMaybe = (value: string | null | undefined, keyMap: Record<string, TranslationKey>, t: Translate): string => {
  if (!value) return "—";
  const key = keyMap[value];
  return key ? t(key) : value;
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
  const { language, t } = useI18n();
  const [logs, setLogs] = useState<ApiDoseLog[]>([]);
  const [drlEntries, setDrlEntries] = useState<ApiDrlEntry[]>([]);
  const [seedMap, setSeedMap] = useState<Map<string, SeedParam>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seriesTypeFilter, setSeriesTypeFilter] = useState<string>(ALL_FILTER);
  const [bodyPartFilter, setBodyPartFilter] = useState<string>(ALL_FILTER);
  const [onlyOverThreshold, setOnlyOverThreshold] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [exportMenuOpen]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, drl, protos] = await Promise.all([
        listDoseLogs({ limit: 2000 }),
        listDrlEntries().catch(() => [] as ApiDrlEntry[]),
        fetch(buildApiUrl("/api/protocols/"))
          .then((r) => (r.ok ? r.json() : []) as Promise<ProtocolListItem[]>)
          .catch(() => [] as ProtocolListItem[]),
      ]);
      setLogs(data);
      setDrlEntries(drl);
      setSeedMap(buildSeedMap(protos));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("service.doseLogs.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const seriesTypes = useMemo(() => Array.from(new Set(logs.map((l) => l.series_type))).sort(), [logs]);
  const bodyParts = useMemo(
    () => Array.from(new Set(logs.map((l) => l.body_part).filter((v): v is string => !!v))).sort(),
    [logs],
  );

  const logsWithFlag = useMemo(
    () => logs.map((l) => ({ log: l, overThreshold: isOverThreshold(l, drlEntries, seedMap) })),
    [logs, drlEntries, seedMap],
  );

  const filtered = useMemo(() => {
    const from = toIsoDayStart(dateFrom);
    const to = toIsoDayEnd(dateTo);
    const q = searchText.trim().toLowerCase();

    return logsWithFlag.filter(({ log: l, overThreshold }) => {
      if (seriesTypeFilter !== ALL_FILTER && l.series_type !== seriesTypeFilter) return false;
      if (bodyPartFilter !== ALL_FILTER && l.body_part !== bodyPartFilter) return false;
      if (onlyOverThreshold && !overThreshold) return false;
      if (from || to) {
        const t = new Date(l.scanned_at).getTime();
        if (from && t < from.getTime()) return false;
        if (to && t > to.getTime()) return false;
      }
      if (q) {
        const scanKind = t(SCAN_KIND_LABEL_KEYS[getDoseScanKind(l)]);
        const hay = `${l.patient_id_snapshot ?? ""} ${l.patient_name_snapshot ?? ""} ${l.protocol_name_snapshot ?? ""} ${l.series_label ?? ""} ${scanKind}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logsWithFlag, seriesTypeFilter, bodyPartFilter, onlyOverThreshold, dateFrom, dateTo, searchText, t]);

  const exceededCount = useMemo(
    () => filtered.filter((r) => r.overThreshold).length,
    [filtered],
  );

  const totalDlp = useMemo(
    () => filtered.reduce((sum, r) => sum + (r.log.dlp ?? 0), 0),
    [filtered],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [seriesTypeFilter, bodyPartFilter, onlyOverThreshold, dateFrom, dateTo, searchText]);

  const handleExport = useCallback(() => {
    const csv = buildCsv(filtered, [
      { header: t("service.doseLogs.acquiredAt"), value: ({ log: l }) => l.scanned_at },
      { header: t("service.doseLogs.patientName"), value: ({ log: l }) => l.patient_name_snapshot ?? "" },
      { header: t("service.doseLogs.patientId"), value: ({ log: l }) => l.patient_id_snapshot ?? "" },
      { header: t("service.doseLogs.protocol"), value: ({ log: l }) => l.protocol_name_snapshot ?? "" },
      { header: t("service.doseLogs.scanMode"), value: ({ log: l }) => t(SCAN_KIND_LABEL_KEYS[getDoseScanKind(l)]) },
      { header: t("service.doseLogs.series"), value: ({ log: l }) => translateMaybe(l.series_type, SERIES_TYPE_LABEL_KEYS, t) },
      { header: t("service.doseLogs.bodyPart"), value: ({ log: l }) => translateMaybe(l.body_part, BODY_PART_LABEL_KEYS, t) },
      { header: t("service.doseLogs.overThreshold"), value: ({ overThreshold }) => (overThreshold ? t("service.doseLogs.csv.overThreshold") : "") },
      { header: "kV", value: ({ log: l }) => l.kv ?? "" },
      { header: "mA", value: ({ log: l }) => l.ma ?? "" },
      { header: "CTDIvol (mGy)", value: ({ log: l }) => l.ctdi_vol ?? "" },
      { header: "DLP (mGy·cm)", value: ({ log: l }) => l.dlp ?? "" },
      { header: t("service.doseLogs.scanLengthWithUnit"), value: ({ log: l }) => l.scan_length ?? "" },
      { header: t("service.doseLogs.rotationTime"), value: ({ log: l }) => l.rotation_time ?? "" },
      { header: "Pitch", value: ({ log: l }) => l.pitch ?? "" },
      { header: t("service.doseLogs.collimator"), value: ({ log: l }) => l.collimator ?? "" },
      { header: t("service.doseLogs.operator"), value: ({ log: l }) => l.operator ?? "" },
    ]);
    downloadCsv(`dose-log-${timestampSuffix()}.csv`, csv);
    setExportMenuOpen(false);
  }, [filtered, t]);

  const handlePrintReport = useCallback(() => {
    const filterParts: string[] = [];
    if (seriesTypeFilter !== ALL_FILTER) {
      filterParts.push(t("service.doseLogs.filterSeries", { value: translateMaybe(seriesTypeFilter, SERIES_TYPE_LABEL_KEYS, t) }));
    }
    if (bodyPartFilter !== ALL_FILTER) filterParts.push(t("service.doseLogs.filterBodyPart", { value: translateMaybe(bodyPartFilter, BODY_PART_LABEL_KEYS, t) }));
    if (onlyOverThreshold) filterParts.push(t("service.doseLogs.filterOverThreshold"));
    if (searchText.trim()) filterParts.push(t("service.doseLogs.filterKeyword", { value: searchText.trim() }));

    printDoseLogReport({
      rows: filtered.map((r) => ({ ...r.log, over_threshold: r.overThreshold })),
      totalDlp,
      exceededCount,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      filtersDescription: filterParts.length > 0 ? filterParts.join(" / ") : t("service.doseLogs.filterAll"),
      language,
    });
    setExportMenuOpen(false);
  }, [filtered, totalDlp, exceededCount, dateFrom, dateTo, seriesTypeFilter, bodyPartFilter, onlyOverThreshold, searchText, language, t]);

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
                placeholder={t("service.doseLogs.searchPlaceholder")}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-9 pr-4 h-10 border border-[#D6E2EF] rounded-lg text-[14px] text-[#37474F] placeholder:text-[#B0C4DE] focus:outline-none focus:border-[#4D94FF]"
              />
            </div>
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setExportMenuOpen((v) => !v)}
                disabled={loading || filtered.length === 0}
                className="px-4 h-10 bg-white border border-[#D6E2EF] text-[#37474F] font-bold rounded-lg flex items-center gap-2 text-[14px] hover:bg-[#F5F8FC] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={14} />
                {t("service.doseLogs.export")}
                <ChevronDown size={14} className={`transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {exportMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-[#D6E2EF] bg-white shadow-lg">
                  <button
                    onClick={handleExport}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#37474F] hover:bg-[#F5F8FC]"
                  >
                    <FileText size={14} className="text-[#90A4AE]" />
                    <div>
                      <div className="font-bold">{t("service.doseLogs.exportCsv")}</div>
                      <div className="text-[11px] text-[#90A4AE]">{t("service.doseLogs.exportCsvDesc")}</div>
                    </div>
                  </button>
                  <div className="h-px bg-[#E2EBF5]" />
                  <button
                    onClick={handlePrintReport}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#37474F] hover:bg-[#F5F8FC]"
                  >
                    <Printer size={14} className="text-[#90A4AE]" />
                    <div>
                      <div className="font-bold">{t("service.doseLogs.printReport")}</div>
                      <div className="text-[11px] text-[#90A4AE]">{t("service.doseLogs.printReportDesc")}</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="px-4 h-10 bg-[#4D94FF] text-white font-bold rounded-lg flex items-center gap-2 text-[14px] hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("service.doseLogs.refresh")}
            </button>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#263238]">{t("service.doseLogs.dateRange")}</span>
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
              <span className="text-[13px] font-bold text-[#263238]">{t("service.doseLogs.seriesType")}</span>
              <div className="relative">
                <select
                  value={seriesTypeFilter}
                  onChange={(e) => setSeriesTypeFilter(e.target.value)}
                  className="appearance-none h-9 pl-3 pr-8 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF] bg-white cursor-pointer"
                >
                  <option value={ALL_FILTER}>{t("service.doseLogs.all")}</option>
                  {seriesTypes.map((s) => (
                    <option key={s} value={s}>{translateMaybe(s, SERIES_TYPE_LABEL_KEYS, t)}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#263238]">{t("service.doseLogs.bodyPart")}</span>
              <div className="relative">
                <select
                  value={bodyPartFilter}
                  onChange={(e) => setBodyPartFilter(e.target.value)}
                  className="appearance-none h-9 pl-3 pr-8 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF] bg-white cursor-pointer"
                >
                  <option value={ALL_FILTER}>{t("service.doseLogs.all")}</option>
                  {bodyParts.map((b) => (
                    <option key={b} value={b}>{translateMaybe(b, BODY_PART_LABEL_KEYS, t)}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none h-9 px-3 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] hover:bg-[#F5F8FC]">
              <input
                type="checkbox"
                checked={onlyOverThreshold}
                onChange={(e) => setOnlyOverThreshold(e.target.checked)}
                className="accent-[#C62828]"
              />
              <span className="font-bold">{t("service.doseLogs.showOnlyOverThreshold")}</span>
            </label>
          </div>
        </div>

        {/* table */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#F5F8FC] text-[#37474F] font-black border-b border-[#E2EBF5]">
                  <th className="text-left px-3 py-3 w-[110px]">{t("service.doseLogs.acquiredAt")}</th>
                  <th className="text-left px-3 py-3 w-[160px]">{t("service.doseLogs.patient")}</th>
                  <th className="text-left px-3 py-3">{t("service.doseLogs.protocol")}</th>
                  <th className="text-left px-3 py-3 w-[68px]">{t("service.doseLogs.scanMode")}</th>
                  <th className="text-left px-3 py-3 w-[72px]">{t("service.doseLogs.series")}</th>
                  <th className="text-left px-3 py-3 w-[80px]">{t("service.doseLogs.bodyPart")}</th>
                  <th className="text-left px-3 py-3 w-[78px]">{t("service.doseLogs.marker")}</th>
                  <th className="text-right px-3 py-3 w-[90px]">kV / mA</th>
                  <th className="text-right px-3 py-3 w-[88px]">
                    CTDIvol<span className="block text-[10px] text-[#90A4AE] font-normal">mGy</span>
                  </th>
                  <th className="text-right px-3 py-3 w-[96px]">
                    DLP<span className="block text-[10px] text-[#90A4AE] font-normal">mGy·cm</span>
                  </th>
                  <th className="text-right px-3 py-3 w-[96px]">
                    {t("service.doseLogs.scanLength")}<span className="block text-[10px] text-[#90A4AE] font-normal">mm</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr>
                    <td colSpan={11} className="text-center py-16 text-[#D32F2F] text-[14px]">
                      {error}
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-16 text-[#90A4AE] text-[14px]">
                      {loading ? t("service.doseLogs.loading") : t("service.doseLogs.empty")}
                    </td>
                  </tr>
                ) : (
                  pageRows.map(({ log: l, overThreshold }) => (
                    <tr
                      key={l.id}
                      className={`border-t border-[#E2EBF5] hover:bg-[#F9FBFC] ${overThreshold ? "bg-[#FFF5F5]" : ""}`}
                    >
                      <td className="px-3 py-3 whitespace-nowrap">
                        {(() => {
                          const ts = formatTimestamp(l.scanned_at);
                          return (
                            <>
                              <div className="text-[13px] text-[#37474F] font-mono leading-tight">{ts.date}</div>
                              <div className="text-[11px] text-[#90A4AE] font-mono leading-tight mt-0.5">{ts.time}</div>
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
                              {t(SCAN_KIND_LABEL_KEYS[scanKind])}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center min-w-[50px] h-[22px] px-2 rounded-full text-[11px] font-bold ${SERIES_TYPE_STYLES[l.series_type] ?? "bg-[#ECEFF1] text-[#546E7A] border border-[#CFD8DC]"}`}
                        >
                          {translateMaybe(l.series_type, SERIES_TYPE_LABEL_KEYS, t)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[#37474F] whitespace-nowrap">{translateMaybe(l.body_part, BODY_PART_LABEL_KEYS, t)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {overThreshold ? (
                          <span
                            className="inline-flex items-center justify-center h-[22px] px-2 rounded-md text-[11px] font-bold bg-[#FFEBEE] text-[#C62828] border border-[#FFCDD2]"
                            title={t("service.doseLogs.overThresholdTitle")}
                          >
                            {t("service.doseLogs.overThreshold")}
                          </span>
                        ) : (
                          <span className="text-[#CFD8DC]">—</span>
                        )}
                      </td>
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
                {t("service.doseLogs.totalRecords", { count: filtered.length })}
                {filtered.length !== logs.length && (
                  <span className="text-[#90A4AE]">{t("service.doseLogs.filteredFrom", { count: logs.length })}</span>
                )}
              </span>
              <span className="text-[#90A4AE]">·</span>
              <span>
                {t("service.doseLogs.totalDlp", { value: totalDlp.toFixed(2) })}
                <span className="text-[10px] text-[#90A4AE] ml-1">mGy·cm</span>
              </span>
              {exceededCount > 0 && (
                <>
                  <span className="text-[#90A4AE]">·</span>
                  <span>
                    {t("service.doseLogs.exceededCount", { count: exceededCount })}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span>
                {t("service.doseLogs.page", { page: safePage + 1, total: pageCount })}
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
