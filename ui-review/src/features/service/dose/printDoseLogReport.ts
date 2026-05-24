import type { ApiDoseLog } from "../../../lib/logsApi";

type DoseScanKind = "regular" | "contrast" | "gating" | "four_d";

const SCAN_KIND_LABELS: Record<DoseScanKind, string> = {
  regular: "常规",
  contrast: "增强",
  gating: "门控",
  four_d: "4D",
};

const SERIES_TYPE_LABEL: Record<string, string> = {
  topogram: "Scout",
  helical: "螺旋",
  axial: "轴扫",
};

const getDoseScanKind = (log: ApiDoseLog): DoseScanKind => {
  if (log.acquisition_type === "four_d" || log.scan_mode === "4d") return "four_d";
  if (log.acquisition_type === "gating") return "gating";
  if (log.scan_mode === "contrast") return "contrast";
  return "regular";
};

const pad = (n: number) => n.toString().padStart(2, "0");

const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const fmt = (v: number | null | undefined, digits = 2): string => {
  if (v == null) return "—";
  return v.toFixed(digits);
};

const fmtInt = (v: number | null | undefined): string => {
  if (v == null) return "—";
  return String(v);
};

const escapeHtml = (raw: string | number | null | undefined): string => {
  if (raw == null) return "";
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

export type DoseReportContext = {
  rows: ApiDoseLog[];
  totalDlp: number;
  dateFrom?: string;
  dateTo?: string;
  filtersDescription?: string;
  organization?: string;
  deviceModel?: string;
};

export function printDoseLogReport(ctx: DoseReportContext): void {
  const org = ctx.organization ?? "—";
  const device = ctx.deviceModel ?? "—";
  const now = new Date();
  const printedAt = formatDateTime(now.toISOString());

  const dateRangeText = (() => {
    if (ctx.dateFrom && ctx.dateTo) return `${ctx.dateFrom} 至 ${ctx.dateTo}`;
    if (ctx.dateFrom) return `自 ${ctx.dateFrom}`;
    if (ctx.dateTo) return `至 ${ctx.dateTo}`;
    if (ctx.rows.length === 0) return "—";
    const sorted = ctx.rows.map((r) => r.scanned_at).sort();
    return `${formatDate(sorted[0])} 至 ${formatDate(sorted[sorted.length - 1])}`;
  })();

  const totalKvAvg = (() => {
    const vals = ctx.rows.map((r) => r.kv).filter((v): v is number => v != null);
    if (vals.length === 0) return "—";
    return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(0);
  })();

  const tableRows = ctx.rows
    .map((l) => {
      const t = formatDateTime(l.scanned_at);
      const scanKind = SCAN_KIND_LABELS[getDoseScanKind(l)];
      const seriesLabel = SERIES_TYPE_LABEL[l.series_type] ?? l.series_type;
      return `
        <tr>
          <td class="mono">${escapeHtml(t)}</td>
          <td>
            <div class="cell-primary">${escapeHtml(l.patient_name_snapshot ?? "—")}</div>
            <div class="cell-sub mono">${escapeHtml(l.patient_id_snapshot ?? "—")}</div>
          </td>
          <td>${escapeHtml(l.protocol_name_snapshot ?? "—")}</td>
          <td class="center">${escapeHtml(scanKind)}</td>
          <td class="center">${escapeHtml(seriesLabel)}</td>
          <td class="center">${escapeHtml(l.body_part ?? "—")}</td>
          <td class="num mono">${escapeHtml(fmtInt(l.kv))} / ${escapeHtml(fmt(l.ma, 0))}</td>
          <td class="num mono">${escapeHtml(fmt(l.ctdi_vol))}</td>
          <td class="num mono">${escapeHtml(fmt(l.dlp))}</td>
          <td class="num mono">${escapeHtml(fmt(l.scan_length, 1))}</td>
        </tr>`;
    })
    .join("");

  const emptyState = ctx.rows.length === 0
    ? `<tr><td colspan="10" class="empty">没有符合条件的剂量记录</td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>剂量日志报告 ${printedAt}</title>
<style>
  @page { size: A4; margin: 14mm 12mm 18mm 12mm; }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
    color: #1f2937;
    font-size: 11px;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-bottom: 8px;
    border-bottom: 2px solid #263238;
    margin-bottom: 14px;
  }
  .org-name { font-size: 16px; font-weight: 700; color: #263238; }
  .device-info { font-size: 11px; color: #546e7a; text-align: right; }
  .device-info .label { color: #90a4ae; }

  .report-title {
    text-align: center;
    margin-bottom: 12px;
  }
  .report-title h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #263238;
    letter-spacing: 2px;
  }
  .report-title .subtitle {
    margin-top: 4px;
    font-size: 11px;
    color: #90a4ae;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px 16px;
    border: 1px solid #cfd8dc;
    padding: 8px 12px;
    margin-bottom: 12px;
    font-size: 11px;
  }
  .meta-grid .field { display: flex; gap: 6px; }
  .meta-grid .label { color: #90a4ae; min-width: 60px; }
  .meta-grid .value { color: #263238; font-weight: 600; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
  }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td {
    border: 1px solid #cfd8dc;
    padding: 5px 6px;
    vertical-align: top;
    text-align: left;
  }
  th {
    background: #eceff1;
    font-weight: 700;
    color: #37474f;
    font-size: 10.5px;
  }
  th .unit { display: block; font-size: 9px; color: #90a4ae; font-weight: 400; }
  td.center, th.center { text-align: center; }
  td.num, th.num { text-align: right; }
  td.mono, .mono { font-family: "SFMono-Regular", Menlo, Consolas, monospace; }
  .cell-primary { font-weight: 600; color: #263238; }
  .cell-sub { color: #90a4ae; font-size: 9.5px; margin-top: 1px; }
  td.empty { text-align: center; color: #90a4ae; padding: 32px; font-style: italic; }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding: 8px 12px;
    border: 1px solid #cfd8dc;
    background: #f8fafc;
    font-size: 11px;
  }
  .summary-row .stat { display: flex; gap: 6px; }
  .summary-row .stat .label { color: #90a4ae; }
  .summary-row .stat .value { font-weight: 700; color: #263238; font-family: monospace; }
  .summary-row .stat.highlight .value { color: #1565c0; font-size: 13px; }

  .signature-block {
    margin-top: 32px;
    page-break-inside: avoid;
  }
  .signature-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
  }
  .sig-cell {
    border-top: 1px solid #263238;
    padding-top: 4px;
    font-size: 10.5px;
    color: #546e7a;
    text-align: center;
    min-height: 50px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
  .sig-cell .role { font-weight: 700; color: #263238; }
  .sig-cell .date-line { margin-top: auto; color: #90a4ae; font-size: 9.5px; }

  .page-number {
    position: fixed;
    bottom: 4mm;
    right: 8mm;
    font-size: 9.5px;
    color: #90a4ae;
  }
  .page-number::after {
    content: "第 " counter(page) " 页 / 共 " counter(pages) " 页";
  }

  @media screen {
    body { padding: 24px; background: #f5f7fa; }
    .page-shell { max-width: 794px; margin: 0 auto; background: white; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .toolbar { max-width: 794px; margin: 0 auto 16px; display: flex; justify-content: flex-end; gap: 8px; }
    .toolbar button {
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      border: 1px solid #4D94FF;
      background: #4D94FF;
      color: white;
      cursor: pointer;
    }
    .toolbar button.secondary { background: white; color: #37474f; border-color: #cfd8dc; }
    .toolbar button:hover { opacity: 0.85; }
  }
  @media print {
    .toolbar { display: none; }
    .page-shell { box-shadow: none; padding: 0; max-width: none; }
    body { padding: 0; background: white; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="secondary" onclick="window.close()">关闭</button>
    <button onclick="window.print()">打印 / 另存为 PDF</button>
  </div>
  <div class="page-shell">
    <header class="report-header">
      <div class="org-name">${escapeHtml(org)}</div>
      <div class="device-info">
        <div><span class="label">设备型号：</span>${escapeHtml(device)}</div>
        <div><span class="label">报告类型：</span>剂量日志</div>
      </div>
    </header>

    <div class="report-title">
      <h1>剂量日志报告</h1>
      <div class="subtitle">CT Dose Log Report</div>
    </div>

    <div class="meta-grid">
      <div class="field"><span class="label">数据范围：</span><span class="value">${escapeHtml(dateRangeText)}</span></div>
      <div class="field"><span class="label">记录数：</span><span class="value">${ctx.rows.length} 条</span></div>
      <div class="field"><span class="label">平均 kV：</span><span class="value">${escapeHtml(totalKvAvg)}</span></div>
      <div class="field"><span class="label">打印时间：</span><span class="value">${escapeHtml(printedAt)}</span></div>
      <div class="field" style="grid-column: span 2;"><span class="label">筛选条件：</span><span class="value">${escapeHtml(ctx.filtersDescription ?? "全部")}</span></div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 78px;">扫描时间</th>
          <th style="width: 90px;">患者</th>
          <th>协议</th>
          <th class="center" style="width: 42px;">模式</th>
          <th class="center" style="width: 42px;">序列</th>
          <th class="center" style="width: 50px;">部位</th>
          <th class="num" style="width: 60px;">kV / mA</th>
          <th class="num" style="width: 50px;">CTDIvol<span class="unit">mGy</span></th>
          <th class="num" style="width: 56px;">DLP<span class="unit">mGy·cm</span></th>
          <th class="num" style="width: 54px;">扫描长度<span class="unit">mm</span></th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}${emptyState}
      </tbody>
    </table>

    <div class="summary-row">
      <div class="stat"><span class="label">记录总数：</span><span class="value">${ctx.rows.length}</span></div>
      <div class="stat highlight"><span class="label">合计 DLP：</span><span class="value">${ctx.totalDlp.toFixed(2)} mGy·cm</span></div>
    </div>

    <div class="signature-block">
      <div class="signature-row">
        <div class="sig-cell">
          <div class="role">操作员签字</div>
          <div class="date-line">日期：____ 年 __ 月 __ 日</div>
        </div>
        <div class="sig-cell">
          <div class="role">审核员签字</div>
          <div class="date-line">日期：____ 年 __ 月 __ 日</div>
        </div>
        <div class="sig-cell">
          <div class="role">科室主任签字</div>
          <div class="date-line">日期：____ 年 __ 月 __ 日</div>
        </div>
      </div>
    </div>
  </div>

  <div class="page-number"></div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) {
    alert("浏览器拦截了弹出窗口，请允许弹出后再次尝试。");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}
