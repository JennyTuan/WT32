import {
  DEFAULT_LANGUAGE,
  translate,
  type TranslationKey,
  type TranslationValues,
} from "../../../lib/i18n";
import type { LanguageCode } from "../../../lib/systemSettingsApi";
import { PHANTOM_LABEL_KEYS, QA_STATUS_LABEL_KEYS } from "../dailyQa/dailyQaI18n";
import type { DailyQaRecord, PhantomType } from "../dailyQa/types";

const DEVICE_NAME = "CT-Scanner-Alpha";
const DEVICE_SN = "8839201";
const NOISE_LIMIT = 3.0;
const UNIFORMITY_LIMIT = 4.0;

type QaReportPrintContext = {
  records: DailyQaRecord[];
  language?: LanguageCode;
};

const escapeHtml = (value: string | number): string => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const formatPrintedAt = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function printQaReport({ records, language = DEFAULT_LANGUAGE }: QaReportPrintContext): void {
  const t = (key: TranslationKey, values?: TranslationValues) => translate(language, key, values);
  const printedAt = formatPrintedAt(new Date());
  const passCount = records.filter((record) => record.judgment === "PASS").length;
  const passRate = records.length ? Math.round((passCount / records.length) * 100) : 0;
  const distribution = records.reduce<Map<PhantomType, number>>((counts, record) => {
    counts.set(record.phantomType, (counts.get(record.phantomType) ?? 0) + 1);
    return counts;
  }, new Map());
  const distributionText = Array.from(distribution.entries())
    .map(([type, count]) => `${t(PHANTOM_LABEL_KEYS[type])} ${t("service.qaReport.times", { count })}`)
    .join(" · ") || t("service.qaReport.noData");

  const rows = records.length
    ? records.map((record) => `
      <tr>
        <td>${escapeHtml(`${record.date} ${record.time}`)}</td>
        <td>${escapeHtml(t(PHANTOM_LABEL_KEYS[record.phantomType]))}</td>
        <td>${escapeHtml(record.noiseVal.toFixed(2))}</td>
        <td>${escapeHtml(record.uniformityVal.toFixed(2))}</td>
        <td>${escapeHtml(record.accuracyVal.toFixed(2))}</td>
        <td><span class="status ${record.judgment === "PASS" ? "pass" : "fail"}">${escapeHtml(t(QA_STATUS_LABEL_KEYS[record.judgment]))}</span></td>
        <td>${escapeHtml(record.operator)}</td>
      </tr>`).join("")
    : `<tr><td class="empty" colspan="7">${escapeHtml(t("service.qaReport.emptyQcRecords"))}</td></tr>`;

  const printWindow = window.open("", "_blank", "width=960,height=720");
  if (!printWindow) return;

  printWindow.document.write(`<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(t("service.qaReport.reportTitle"))}</title>
  <style>
    @page { size: A4; margin: 14mm 14mm 18mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { color: #263238; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif; font-size: 11px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { max-width: 182mm; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding-bottom: 10px; border-bottom: 2px solid #263238; }
    .title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: .5px; }
    .device { margin-top: 4px; color: #607d8b; }
    .generated { text-align: right; color: #607d8b; }
    .generated strong { display: block; margin-top: 3px; color: #263238; font-size: 12px; }
    h2 { margin: 18px 0 8px; font-size: 13px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .stat { min-height: 62px; border: 1px solid #d6e2ef; border-radius: 5px; padding: 9px; }
    .stat-label { color: #6b85a0; font-weight: 600; }
    .stat-value { margin-top: 7px; color: #263238; font-size: 21px; font-weight: 700; }
    .stat-value.pass { color: #2e7d32; }
    .stat-value.distribution { font-size: 12px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { padding: 7px 8px; border: 1px solid #d6e2ef; text-align: left; vertical-align: middle; }
    th { background: #f1f5f9; color: #52677c; font-weight: 700; }
    td.empty { padding: 26px; color: #78909c; text-align: center; }
    .status { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; }
    .status.pass { background: #e8f5e9; color: #2e7d32; }
    .status.fail { background: #ffebee; color: #c62828; }
    .standards { display: flex; justify-content: space-between; gap: 18px; margin-top: 18px; padding-top: 10px; border-top: 1px solid #d6e2ef; }
    .standards h3 { margin: 0 0 5px; font-size: 12px; }
    .standards ul { margin: 0; padding-left: 16px; color: #607d8b; }
    .footer { text-align: right; color: #78909c; }
    .footer strong { color: #455a64; }
    @media screen { body { background: #f1f5f9; padding: 24px; } .page { background: #fff; padding: 18mm 14mm; box-shadow: 0 4px 20px rgba(15, 23, 42, .12); } }
    @media print { .page { max-width: none; } }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div><h1 class="title">${escapeHtml(t("service.qaReport.reportTitle"))}</h1><div class="device">${escapeHtml(`${DEVICE_NAME} (SN: ${DEVICE_SN})`)}</div></div>
      <div class="generated">${escapeHtml(t("service.qaReport.generatedAt"))}<strong>${escapeHtml(printedAt)}</strong></div>
    </header>
    <h2>${escapeHtml(t("service.qaReport.qcSummary"))}</h2>
    <section class="summary">
      <div class="stat"><div class="stat-label">${escapeHtml(t("service.qaReport.totalTests"))}</div><div class="stat-value">${records.length}</div></div>
      <div class="stat"><div class="stat-label">${escapeHtml(t("service.qaReport.passCount"))}</div><div class="stat-value pass">${passCount}</div></div>
      <div class="stat"><div class="stat-label">${escapeHtml(t("service.qaReport.passRate"))}</div><div class="stat-value">${passRate}%</div></div>
      <div class="stat"><div class="stat-label">${escapeHtml(t("service.qaReport.phantomDistribution"))}</div><div class="stat-value distribution">${escapeHtml(distributionText)}</div></div>
    </section>
    <h2>${escapeHtml(t("service.qaReport.qcDetail"))}</h2>
    <table><thead><tr><th>${escapeHtml(t("service.qaReport.dateTime"))}</th><th>${escapeHtml(t("service.qaReport.phantom"))}</th><th>${escapeHtml(t("service.qaReport.noise"))}</th><th>${escapeHtml(t("service.qaReport.uniformity"))}</th><th>${escapeHtml(t("service.qaReport.accuracy"))}</th><th>${escapeHtml(t("service.qaReport.judgment"))}</th><th>${escapeHtml(t("service.qaReport.operator"))}</th></tr></thead><tbody>${rows}</tbody></table>
    <section class="standards"><div><h3>${escapeHtml(t("service.qaReport.judgmentStandards"))}</h3><ul><li>${escapeHtml(t("service.qaReport.noiseStandard", { value: NOISE_LIMIT.toFixed(1) }))}</li><li>${escapeHtml(t("service.qaReport.uniformityStandard", { value: UNIFORMITY_LIMIT.toFixed(1) }))}</li></ul></div><div class="footer"><strong>QA Master System V3.1</strong><br />&copy; 2026 Central Hospital Radiology Dept.</div></section>
  </main>
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 200);
}
