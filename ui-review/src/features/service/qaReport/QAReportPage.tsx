import { useMemo, useState } from "react";
import { Search, FileBarChart2, Calendar, Printer, ChevronDown } from "lucide-react";

import { useI18n } from "../../../lib/i18nContext";
import ServiceModeShell from "../shared/ServiceModeShell";
import { PHANTOM_LABEL_KEYS, QA_STATUS_LABEL_KEYS } from "../dailyQa/dailyQaI18n";
import { loadDailyQaRecords } from "../dailyQa/storage";
import type { DailyQaRecord, PhantomType } from "../dailyQa/types";

const DEVICE_NAME = "CT-Scanner-Alpha";
const DEVICE_SN = "8839201";

const NOISE_LIMIT = 3.0;
const UNIFORMITY_LIMIT = 4.0;
const ALL_OPERATOR_FILTER = "all";

const TODAY = new Date().toISOString().slice(0, 10);
const ONE_MONTH_AGO = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
})();

type PhantomDistribution = { type: PhantomType; count: number };

function RecordListView({
  records,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onPreview,
  searchText,
  onSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  operatorFilter,
  onOperatorFilterChange,
  operators,
}: {
  records: DailyQaRecord[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onPreview: () => void;
  searchText: string;
  onSearchChange: (v: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  operatorFilter: string;
  onOperatorFilterChange: (v: string) => void;
  operators: string[];
}) {
  const { t } = useI18n();
  const allSelected = records.length > 0 && records.every((r) => selectedIds.has(r.id));
  const tableHeaders = [
    t("service.qaReport.dateTime"),
    t("service.qaReport.phantom"),
    t("service.qaReport.noise"),
    t("service.qaReport.uniformity"),
    t("service.qaReport.accuracy"),
    t("service.qaReport.operator"),
  ];

  return (
    <section className="flex-1 bg-white border border-[#B0C4DE] rounded-md shadow-sm p-5 flex flex-col relative overflow-hidden h-full">
      <div className="border border-[#D6E2EF] rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
            <input
              type="text"
              placeholder={t("service.qaReport.searchPlaceholder")}
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 h-10 border border-[#D6E2EF] rounded-lg text-[14px] text-[#37474F] placeholder:text-[#B0C4DE] focus:outline-none focus:border-[#4D94FF]"
            />
          </div>
          <button
            onClick={onPreview}
            disabled={selectedIds.size === 0}
            className="px-5 h-10 bg-[#263238] text-white font-black rounded-lg flex items-center gap-2 text-[14px] hover:bg-[#37474F] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer size={14} />
            {t("service.qaReport.preview")}
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[#263238]">{t("service.qaReport.dateRange")}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="h-9 px-3 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF]"
            />
            <span className="text-[#90A4AE]">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="h-9 px-3 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF]"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[13px] font-bold text-[#263238]">{t("service.qaReport.operator")}</span>
            <div className="relative">
              <select
                value={operatorFilter}
                onChange={(e) => onOperatorFilterChange(e.target.value)}
                className="appearance-none h-9 pl-3 pr-8 border border-[#D6E2EF] rounded-lg text-[13px] text-[#37474F] focus:outline-none focus:border-[#4D94FF] bg-white cursor-pointer"
              >
                <option value={ALL_OPERATOR_FILTER}>{t("service.qaReport.all")}</option>
                {operators.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 border border-[#D6E2EF] rounded-xl overflow-hidden flex flex-col">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#F5F8FC] text-[#37474F] font-black border-b border-[#D6E2EF]">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="w-4 h-4 accent-[#4D94FF] cursor-pointer"
                />
              </th>
              {tableHeaders.map((header) => (
                <th key={header} className="text-left px-4 py-3">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-[#90A4AE] text-[14px]">
                  {t("service.qaReport.noRecords")}
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-[#E2EBF5] hover:bg-[#F9FBFC] cursor-pointer"
                  onClick={() => onToggleSelect(r.id)}
                >
                  <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggleSelect(r.id)}
                      className="w-4 h-4 accent-[#4D94FF] cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 text-[#37474F] font-medium">{r.date} {r.time}</td>
                  <td className="px-4 py-3 text-[#37474F]">{t(PHANTOM_LABEL_KEYS[r.phantomType])}</td>
                  <td className="px-4 py-3 text-[#37474F]">{r.noiseVal.toFixed(2)}</td>
                  <td className="px-4 py-3 text-[#37474F]">{r.uniformityVal.toFixed(2)}</td>
                  <td className="px-4 py-3 text-[#37474F]">{r.accuracyVal.toFixed(2)}</td>
                  <td className="px-4 py-3 text-[#37474F]">{r.operator}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportHeader() {
  const { t } = useI18n();

  return (
    <div className="bg-[#1A2332] rounded-t-2xl px-8 py-6 flex items-start justify-between">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#2A3A4E] flex items-center justify-center">
          <FileBarChart2 size={24} className="text-[#4ECDC4]" />
        </div>
        <div>
          <h1 className="text-[22px] font-black text-white tracking-tight">
            {t("service.qaReport.reportTitle")}
          </h1>
          <p className="text-[14px] text-[#8899AA] mt-1">
            {DEVICE_NAME} (SN: {DEVICE_SN})
          </p>
        </div>
      </div>
      <div className="text-right">
        <div className="flex items-center gap-2 text-[#8899AA] text-[13px]">
          <Calendar size={14} />
          {t("service.qaReport.generatedAt")}
        </div>
        <div className="text-[#4ECDC4] text-[18px] font-bold mt-1">{TODAY}</div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div className="flex-1 border border-[#E2EBF5] rounded-xl px-5 py-4">
      <div className="text-[13px] text-[#90A4AE] font-bold">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`text-[28px] font-black ${color ?? "text-[#263238]"}`}>{value}</span>
        {unit && <span className="text-[13px] text-[#90A4AE] font-bold">{unit}</span>}
      </div>
    </div>
  );
}

function PhantomDistributionCard({ distribution }: { distribution: PhantomDistribution[] }) {
  const { t } = useI18n();

  return (
    <div className="flex-1 border border-[#E2EBF5] rounded-xl px-5 py-4">
      <div className="text-[13px] text-[#90A4AE] font-bold">{t("service.qaReport.phantomDistribution")}</div>
      <div className="mt-3 flex flex-col gap-1.5">
        {distribution.length === 0 ? (
          <span className="text-[13px] text-[#BDC8D4]">{t("service.qaReport.noData")}</span>
        ) : (
          distribution.map((d) => (
            <div key={d.type} className="flex items-center justify-between text-[13px]">
              <span className="text-[#37474F] font-bold">{t(PHANTOM_LABEL_KEYS[d.type])}</span>
              <span className="text-[#6B85A0]">{t("service.qaReport.times", { count: d.count })}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ReportPreviewModal({
  records,
  onClose,
}: {
  records: DailyQaRecord[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const totalTests = records.length;
  const passCount = records.filter((r) => r.judgment === "PASS").length;
  const passRate = totalTests > 0 ? Math.round((passCount / totalTests) * 100) : 0;

  const phantomDistribution = useMemo<PhantomDistribution[]>(() => {
    const map = new Map<PhantomType, number>();
    for (const r of records) {
      map.set(r.phantomType, (map.get(r.phantomType) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([type, count]) => ({ type, count }));
  }, [records]);

  return (
    <div className="qa-report-overlay absolute inset-0 bg-black/40 backdrop-blur-[2px] z-[100] flex items-center justify-center overflow-auto py-6">
      <div className="qa-report-content w-full max-w-[960px] bg-white rounded-2xl shadow-2xl flex flex-col mx-4 my-auto">
        <ReportHeader />

        <div className="px-8 py-6">
          <h2 className="text-[16px] font-black text-[#263238] flex items-center gap-2">
            <span className="text-[#4D94FF]">|||</span> {t("service.qaReport.qcSummary")}
          </h2>
          <div className="mt-4 flex gap-4">
            <SummaryCard label={t("service.qaReport.totalTests")} value={totalTests} unit={t("service.qaReport.unitTimes")} />
            <SummaryCard label={t("service.qaReport.passCount")} value={passCount} color="text-[#2E7D32]" />
            <SummaryCard label={t("service.qaReport.passRate")} value={`${passRate}%`} />
            <PhantomDistributionCard distribution={phantomDistribution} />
          </div>
        </div>

        <div className="px-8 py-4">
          <h2 className="text-[16px] font-black text-[#263238] flex items-center gap-2 mb-4">
            <span className="text-[#4D94FF]">&#x1F4CB;</span> {t("service.qaReport.qcDetail")}
          </h2>
          <div className="border border-[#E2EBF5] rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#F5F8FC] text-[#6B85A0] font-bold">
                  <th className="text-left px-4 py-3">{t("service.qaReport.dateTime")}</th>
                  <th className="text-left px-4 py-3">{t("service.qaReport.phantom")}</th>
                  <th className="text-left px-4 py-3">{t("service.qaReport.noise")}</th>
                  <th className="text-left px-4 py-3">{t("service.qaReport.uniformity")}</th>
                  <th className="text-left px-4 py-3">{t("service.qaReport.accuracy")}</th>
                  <th className="text-left px-4 py-3">{t("service.qaReport.judgment")}</th>
                  <th className="text-left px-4 py-3">{t("service.qaReport.operator")}</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-[#BDC8D4]">
                      {t("service.qaReport.emptyQcRecords")}
                    </td>
                  </tr>
                ) : (
                  records.map((r) => (
                    <tr key={r.id} className="border-t border-[#E2EBF5]">
                      <td className="px-4 py-3 text-[#37474F] font-medium">{r.date} {r.time}</td>
                      <td className="px-4 py-3 text-[#37474F]">{t(PHANTOM_LABEL_KEYS[r.phantomType])}</td>
                      <td className="px-4 py-3 text-[#37474F]">{r.noiseVal.toFixed(2)}</td>
                      <td className="px-4 py-3 text-[#37474F]">{r.uniformityVal.toFixed(2)}</td>
                      <td className="px-4 py-3 text-[#37474F]">{r.accuracyVal.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black ${
                            r.judgment === "PASS"
                              ? "bg-[#E8F5E9] text-[#2E7D32]"
                              : "bg-[#FFEBEE] text-[#C62828]"
                          }`}
                        >
                          {t(QA_STATUS_LABEL_KEYS[r.judgment])}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#37474F]">{r.operator}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-8 py-4 pb-6">
          <div className="border-t border-[#E2EBF5] pt-4 flex items-start justify-between">
            <div>
              <h3 className="text-[14px] font-black text-[#263238]">
                {t("service.qaReport.judgmentStandards")}
              </h3>
              <ul className="mt-2 text-[13px] text-[#6B85A0] list-disc list-inside space-y-1">
                <li>{t("service.qaReport.noiseStandard", { value: NOISE_LIMIT.toFixed(1) })}</li>
                <li>{t("service.qaReport.uniformityStandard", { value: UNIFORMITY_LIMIT.toFixed(1) })}</li>
              </ul>
            </div>
            <div className="text-right text-[12px] text-[#90A4AE]">
              <div className="font-black text-[#37474F]">QA Master System V3.1</div>
              <div className="mt-1">&copy; 2026 Central Hospital Radiology Dept.</div>
            </div>
          </div>
        </div>

        <div className="px-8 py-4 border-t border-[#E2EBF5] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 h-10 rounded-lg border border-[#B0C4DE] bg-white text-[#37474F] font-bold hover:bg-gray-50 transition-colors"
          >
            {t("service.qaReport.close")}
          </button>
          <button
            onClick={() => window.print()}
            className="px-6 h-10 rounded-lg bg-[#4D94FF] text-white font-bold hover:bg-blue-600 transition-colors flex items-center gap-2"
          >
            <Printer size={14} />
            {t("service.qaReport.confirmPrint")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QAReportPage() {
  const { t } = useI18n();
  const allRecords = useMemo(() => loadDailyQaRecords(), []);

  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState(ONE_MONTH_AGO);
  const [dateTo, setDateTo] = useState(TODAY);
  const [operatorFilter, setOperatorFilter] = useState(ALL_OPERATOR_FILTER);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);

  const operators = useMemo(() => {
    const set = new Set(allRecords.map((r) => r.operator));
    return Array.from(set);
  }, [allRecords]);

  const filteredRecords = useMemo(() => {
    return allRecords.filter((r) => {
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      if (operatorFilter !== ALL_OPERATOR_FILTER && r.operator !== operatorFilter) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        const phantomLabel = t(PHANTOM_LABEL_KEYS[r.phantomType]).toLowerCase();
        if (
          !r.phantomType.toLowerCase().includes(q) &&
          !phantomLabel.includes(q) &&
          !r.operator.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [allRecords, dateFrom, dateTo, operatorFilter, searchText, t]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allVisible = filteredRecords.map((r) => r.id);
    const allSelected = allVisible.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisible));
    }
  };

  const previewRecords = useMemo(
    () => filteredRecords.filter((r) => selectedIds.has(r.id)),
    [filteredRecords, selectedIds],
  );

  return (
    <ServiceModeShell currentRoute="/service/reports/qa-report">
      <RecordListView
        records={filteredRecords}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        onPreview={() => setShowPreview(true)}
        searchText={searchText}
        onSearchChange={setSearchText}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        operatorFilter={operatorFilter}
        onOperatorFilterChange={setOperatorFilter}
        operators={operators}
      />
      {showPreview && (
        <ReportPreviewModal
          records={previewRecords}
          onClose={() => setShowPreview(false)}
        />
      )}
    </ServiceModeShell>
  );
}
