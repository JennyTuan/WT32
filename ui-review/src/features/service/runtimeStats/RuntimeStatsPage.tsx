import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Clock4, Download, RefreshCcw, Scan, Zap } from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";
import { useI18n } from "../../../lib/i18nContext";

// ─── Mock runtime data ──────────────────────────────────────────────────────
const POWER_ON_HOURS = 4126.5;
const TUBE_EXPOSURE_HOURS = 612.8;
const TOTAL_SCANS = 18342;
const FAULT_COUNT_30D = 7;
const WARNING_COUNT_30D = 23;

const SCAN_MIX = [
    { key: "helical", color: "#2F67D8", value: 9821 },
    { key: "axial", color: "#10B981", value: 3450 },
    { key: "scout", color: "#F59E0B", value: 4220 },
    { key: "fourD", color: "#A855F7", value: 851 },
];

// last 14 days scan counts
const DAILY_SCANS = [42, 58, 51, 63, 47, 71, 88, 39, 55, 67, 74, 81, 62, 73];

type ComponentUsageRow = {
    key: string;
    cumulative: number;
    rated: number;
    unitKey: string;
    percentRaw: number;
};

const COMPONENT_USAGE: ComponentUsageRow[] = [
    { key: "tube", cumulative: 612.8, rated: 1500, unitKey: "service.runtimeStats.unit.hours", percentRaw: 0.408 },
    { key: "detector", cumulative: 4126.5, rated: 12000, unitKey: "service.runtimeStats.unit.hours", percentRaw: 0.344 },
    { key: "gantry", cumulative: 186420, rated: 500000, unitKey: "service.runtimeStats.unit.rotations", percentRaw: 0.373 },
    { key: "table", cumulative: 9874, rated: 60000, unitKey: "service.runtimeStats.unit.cycles", percentRaw: 0.165 },
    { key: "hv", cumulative: 612.8, rated: 2000, unitKey: "service.runtimeStats.unit.hours", percentRaw: 0.306 },
    { key: "ups", cumulative: 4126.5, rated: 20000, unitKey: "service.runtimeStats.unit.hours", percentRaw: 0.206 },
];

type KPI = {
    icon: typeof Clock4;
    labelKey: string;
    value: string;
    sublabelKey: string;
    accent: string;
};

const formatNumber = (value: number) => value.toLocaleString();

export default function RuntimeStatsPage() {
    const { t } = useI18n();

    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const [dateFrom, setDateFrom] = useState(defaultStart);
    const [dateTo, setDateTo] = useState(defaultEnd);

    const totalScanMix = SCAN_MIX.reduce((sum, item) => sum + item.value, 0);
    const maxDaily = Math.max(...DAILY_SCANS);

    const kpis: KPI[] = useMemo(
        () => [
            {
                icon: Clock4,
                labelKey: "service.runtimeStats.kpi.powerOn",
                value: `${formatNumber(POWER_ON_HOURS)} h`,
                sublabelKey: "service.runtimeStats.kpi.powerOn.sub",
                accent: "bg-[#E8F0FE] text-[#2F67D8]",
            },
            {
                icon: Scan,
                labelKey: "service.runtimeStats.kpi.scans",
                value: formatNumber(TOTAL_SCANS),
                sublabelKey: "service.runtimeStats.kpi.scans.sub",
                accent: "bg-[#E6F8EE] text-[#15803D]",
            },
            {
                icon: Zap,
                labelKey: "service.runtimeStats.kpi.exposure",
                value: `${formatNumber(TUBE_EXPOSURE_HOURS)} h`,
                sublabelKey: "service.runtimeStats.kpi.exposure.sub",
                accent: "bg-[#FFF5E2] text-[#B45309]",
            },
            {
                icon: AlertTriangle,
                labelKey: "service.runtimeStats.kpi.alerts",
                value: `${FAULT_COUNT_30D} / ${WARNING_COUNT_30D}`,
                sublabelKey: "service.runtimeStats.kpi.alerts.sub",
                accent: "bg-[#FEE7E7] text-[#B91C1C]",
            },
        ],
        [],
    );

    // SVG ring chart geometry
    const ringRadius = 56;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const { segments: ringSegments } = SCAN_MIX.reduce<{
        offset: number;
        segments: Array<(typeof SCAN_MIX)[number] & { fraction: number; length: number; offset: number }>;
    }>((acc, item) => {
        const fraction = item.value / totalScanMix;
        const length = fraction * ringCircumference;
        return {
            offset: acc.offset + length,
            segments: [...acc.segments, { ...item, fraction, length, offset: acc.offset }],
        };
    }, { offset: 0, segments: [] });

    return (
        <ServiceModeShell currentRoute="/service/reports/runtime-stats">
            <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#B0C4DE] bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2 text-[12px] font-bold text-[#4F6479]">
                        <span>{t("service.runtimeStats.dateRange")}</span>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-9 rounded-lg border border-[#D7E3F0] px-2 text-[13px] font-bold text-[#223547] outline-none focus:border-[#93C5FD]"
                        />
                        <span className="text-[#90A4AE]">→</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-9 rounded-lg border border-[#D7E3F0] px-2 text-[13px] font-bold text-[#223547] outline-none focus:border-[#93C5FD]"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D7E3F0] bg-white px-3 text-[12px] font-black text-[#31485E] hover:bg-[#F8FAFC]"
                        >
                            <RefreshCcw size={14} className="text-[#2F67D8]" /> {t("service.runtimeStats.refresh")}
                        </button>
                        <button
                            type="button"
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2F67D8] px-3 text-[12px] font-black text-white hover:bg-[#2654B0]"
                        >
                            <Download size={14} /> {t("service.runtimeStats.export")}
                        </button>
                    </div>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-4 gap-3">
                    {kpis.map(({ icon: Icon, labelKey, value, sublabelKey, accent }) => (
                        <div key={labelKey} className="rounded-md border border-[#B0C4DE] bg-white p-4 shadow-sm">
                            <div className="flex items-center gap-2">
                                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent}`}>
                                    <Icon size={16} />
                                </span>
                                <span className="text-[12px] font-bold text-[#6B85A0]">{t(labelKey as never)}</span>
                            </div>
                            <div className="mt-3 text-[26px] font-black tracking-tight text-[#223547]">{value}</div>
                            <div className="mt-1 text-[11px] font-bold text-[#90A4AE]">{t(sublabelKey as never)}</div>
                        </div>
                    ))}
                </div>

                {/* Middle row: ring + bar trend */}
                <div className="grid grid-cols-12 gap-3">
                    {/* Scan mix ring */}
                    <div className="col-span-5 rounded-md border border-[#B0C4DE] bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="text-[14px] font-black text-[#223547]">{t("service.runtimeStats.scanMix.title")}</div>
                            <div className="text-[11px] font-bold text-[#90A4AE]">{t("service.runtimeStats.scanMix.subtitle")}</div>
                        </div>
                        <div className="mt-3 flex items-center gap-5">
                            <svg width="150" height="150" viewBox="0 0 150 150" className="shrink-0">
                                <g transform="translate(75 75) rotate(-90)">
                                    <circle r={ringRadius} fill="none" stroke="#EEF2F9" strokeWidth="16" />
                                    {ringSegments.map((seg) => (
                                        <circle
                                            key={seg.key}
                                            r={ringRadius}
                                            fill="none"
                                            stroke={seg.color}
                                            strokeWidth="16"
                                            strokeDasharray={`${seg.length} ${ringCircumference - seg.length}`}
                                            strokeDashoffset={-seg.offset}
                                            strokeLinecap="butt"
                                        />
                                    ))}
                                </g>
                                <text x="75" y="72" textAnchor="middle" className="fill-[#223547]" style={{ fontSize: 18, fontWeight: 900 }}>
                                    {formatNumber(totalScanMix)}
                                </text>
                                <text x="75" y="92" textAnchor="middle" className="fill-[#90A4AE]" style={{ fontSize: 10, fontWeight: 700 }}>
                                    {t("service.runtimeStats.scanMix.center")}
                                </text>
                            </svg>
                            <ul className="flex-1 space-y-2">
                                {ringSegments.map((seg) => (
                                    <li key={seg.key} className="flex items-center justify-between text-[12px]">
                                        <span className="flex items-center gap-2 text-[#4F6479] font-bold">
                                            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
                                            {t(`service.runtimeStats.scanMix.${seg.key}` as never)}
                                        </span>
                                        <span className="font-black text-[#223547]">
                                            {formatNumber(seg.value)}
                                            <span className="ml-1 text-[10px] font-bold text-[#90A4AE]">
                                                {(seg.fraction * 100).toFixed(1)}%
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* 14d trend */}
                    <div className="col-span-7 rounded-md border border-[#B0C4DE] bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[14px] font-black text-[#223547]">
                                <Activity size={16} className="text-[#2F67D8]" />
                                {t("service.runtimeStats.trend.title")}
                            </div>
                            <div className="text-[11px] font-bold text-[#90A4AE]">{t("service.runtimeStats.trend.subtitle")}</div>
                        </div>
                        <div className="mt-4 flex h-[160px] items-end gap-1.5">
                            {DAILY_SCANS.map((count, idx) => {
                                const heightPct = (count / maxDaily) * 100;
                                const dayLabel = new Date(today.getTime() - (DAILY_SCANS.length - 1 - idx) * 86400000)
                                    .toISOString()
                                    .slice(5, 10);
                                return (
                                    <div key={idx} className="flex flex-1 flex-col items-center gap-1">
                                        <div className="text-[10px] font-bold text-[#90A4AE]">{count}</div>
                                        <div
                                            className="w-full rounded-t-md bg-gradient-to-t from-[#2F67D8] to-[#74A3FF]"
                                            style={{ height: `${heightPct}%`, minHeight: 6 }}
                                        />
                                        <div className="text-[10px] font-bold text-[#B0BEC5]">{dayLabel}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Component usage table */}
                <div className="rounded-md border border-[#B0C4DE] bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#E2EBF5] px-4 py-3">
                        <div className="text-[14px] font-black text-[#223547]">{t("service.runtimeStats.components.title")}</div>
                        <div className="text-[11px] font-bold text-[#90A4AE]">{t("service.runtimeStats.components.subtitle")}</div>
                    </div>
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="bg-[#F4F7FB] text-[11px] font-black uppercase tracking-wide text-[#6B85A0]">
                                <th className="px-4 py-2 text-left">{t("service.runtimeStats.components.col.name")}</th>
                                <th className="px-4 py-2 text-left">{t("service.runtimeStats.components.col.cumulative")}</th>
                                <th className="px-4 py-2 text-left">{t("service.runtimeStats.components.col.rated")}</th>
                                <th className="px-4 py-2 text-left">{t("service.runtimeStats.components.col.usage")}</th>
                                <th className="px-4 py-2 text-left">{t("service.runtimeStats.components.col.status")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {COMPONENT_USAGE.map((row) => {
                                const pct = Math.round(row.percentRaw * 100);
                                const status =
                                    row.percentRaw >= 0.8 ? "alert" : row.percentRaw >= 0.5 ? "warn" : "ok";
                                const statusStyle =
                                    status === "alert"
                                        ? "bg-[#FEE7E7] text-[#B91C1C]"
                                        : status === "warn"
                                          ? "bg-[#FFF5E2] text-[#B45309]"
                                          : "bg-[#E6F8EE] text-[#15803D]";
                                const barColor =
                                    status === "alert" ? "#DC2626" : status === "warn" ? "#D97706" : "#15803D";
                                return (
                                    <tr key={row.key} className="border-t border-[#EEF2F9]">
                                        <td className="px-4 py-3 font-bold text-[#223547]">{t(`service.runtimeStats.components.row.${row.key}` as never)}</td>
                                        <td className="px-4 py-3 font-bold text-[#37474F]">{formatNumber(row.cumulative)} {t(row.unitKey as never)}</td>
                                        <td className="px-4 py-3 text-[#6B85A0]">{formatNumber(row.rated)} {t(row.unitKey as never)}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-32 overflow-hidden rounded-full bg-[#EEF2F9]">
                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                                                </div>
                                                <span className="text-[11px] font-black text-[#37474F]">{pct}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${statusStyle}`}>
                                                {t(`service.runtimeStats.components.status.${status}` as never)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </ServiceModeShell>
    );
}
