import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Clock4, Download, RefreshCcw, Scan, Wrench, Zap } from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";
import { useI18n } from "../../../lib/i18nContext";
import { getRuntimeStats, type RuntimeStats } from "../../../lib/reportsApi";
import { buildCsv, downloadCsv, timestampSuffix } from "../../../lib/csvExport";

// 扫描类型与显示颜色保持固定，数值由后端已完成会话汇总。
const SCAN_MIX_META = [
    { key: "helical", apiKey: "helical", color: "#2F67D8" },
    { key: "axial", apiKey: "axial", color: "#10B981" },
    { key: "scout", apiKey: "topogram", color: "#F59E0B" },
    { key: "fourD", apiKey: "4d", color: "#A855F7" },
];

type ComponentUsageRow = {
    key: string;
    cumulative: number;
    rated: number;
    unitKey: string;
    percentRaw: number;
};


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
    const [stats, setStats] = useState<RuntimeStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadStats = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setStats(await getRuntimeStats(dateFrom, dateTo));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "无法加载运行统计");
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo]);

    useEffect(() => {
        void loadStats();
    }, [loadStats]);

    const scanMix = useMemo(
        () => SCAN_MIX_META.map((item) => ({ ...item, value: stats?.scan_mix[item.apiKey] ?? 0 })),
        [stats],
    );
    const totalScanMix = scanMix.reduce((sum, item) => sum + item.value, 0);
    const dailyScans = stats?.daily_scans ?? [];
    const recentDailyScans = dailyScans.slice(-14);
    const maxDaily = Math.max(1, ...recentDailyScans.map((item) => item.count));
    const componentUsage: ComponentUsageRow[] = (stats?.telemetry.component_usage ?? []).map((item) => ({
        key: item.key,
        cumulative: item.cumulative,
        rated: item.rated,
        unitKey: item.unit,
        percentRaw: item.rated > 0 ? item.cumulative / item.rated : 0,
    }));

    const exportStats = () => {
        if (!stats) return;
        const csv = buildCsv(stats.daily_scans, [
            { header: "日期", value: (item) => item.date },
            { header: "已完成扫描次数（参考）", value: (item) => item.count },
        ]);
        downloadCsv(`runtime-stats-${timestampSuffix()}.csv`, csv);
    };

    const kpis: KPI[] = useMemo(
        () => [
            {
                icon: Clock4,
                labelKey: "service.runtimeStats.kpi.powerOn",
                value: stats?.telemetry.power_on_hours == null ? "—" : `${formatNumber(stats.telemetry.power_on_hours)} h`,
                sublabelKey: "service.runtimeStats.kpi.powerOn.sub",
                accent: "bg-[#E8F0FE] text-[#2F67D8]",
            },
            {
                icon: Scan,
                labelKey: "service.runtimeStats.kpi.scans",
                value: formatNumber(stats?.completed_scans_all_time ?? 0),
                sublabelKey: "service.runtimeStats.kpi.scans.sub",
                accent: "bg-[#E6F8EE] text-[#15803D]",
            },
            {
                icon: Zap,
                labelKey: "service.runtimeStats.kpi.exposure",
                value: stats?.telemetry.tube_exposure_hours == null ? "—" : `${formatNumber(stats.telemetry.tube_exposure_hours)} h`,
                sublabelKey: "service.runtimeStats.kpi.exposure.sub",
                accent: "bg-[#FFF5E2] text-[#B45309]",
            },
            {
                icon: AlertTriangle,
                labelKey: "service.runtimeStats.kpi.alerts",
                value: `${stats?.alerts.errors ?? 0} / ${stats?.alerts.warnings ?? 0}`,
                sublabelKey: "service.runtimeStats.kpi.alerts.sub",
                accent: "bg-[#FEE7E7] text-[#B91C1C]",
            },
        ],
        [stats],
    );

    // SVG ring chart geometry
    const ringRadius = 56;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const { segments: ringSegments } = scanMix.reduce<{
        offset: number;
        segments: Array<(typeof scanMix)[number] & { fraction: number; length: number; offset: number }>;
    }>((acc, item) => {
        const fraction = totalScanMix > 0 ? item.value / totalScanMix : 0;
        const length = fraction * ringCircumference;
        return {
            offset: acc.offset + length,
            segments: [...acc.segments, { ...item, fraction, length, offset: acc.offset }],
        };
    }, { offset: 0, segments: [] });

    return (
        <ServiceModeShell currentRoute="/service/reports/runtime-stats">
            <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[#F7FAFE] p-3 custom-scrollbar">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D6E4F5] bg-white px-3 py-2.5 shadow-[0_4px_14px_rgba(48,84,120,0.06)]">
                    <div className="flex items-center gap-2 text-[12px] font-bold text-[#4F6479]">
                        <span className="whitespace-nowrap text-[#223547]">{t("service.runtimeStats.dateRange")}</span>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-8 rounded-lg border border-[#D7E3F0] bg-[#FBFDFF] px-2 text-[12px] font-bold text-[#223547] outline-none focus:border-[#5794E8] focus:ring-2 focus:ring-[#5794E8]/10"
                        />
                        <span className="text-[#9FB2C7]">→</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-8 rounded-lg border border-[#D7E3F0] bg-[#FBFDFF] px-2 text-[12px] font-bold text-[#223547] outline-none focus:border-[#5794E8] focus:ring-2 focus:ring-[#5794E8]/10"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void loadStats()}
                            disabled={loading}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#D7E3F0] bg-white px-3 text-[12px] font-bold text-[#31485E] hover:border-[#A9C9EE] hover:bg-[#F7FBFF] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <RefreshCcw size={14} className={loading ? "animate-spin text-[#2F67D8]" : "text-[#2F67D8]"} /> {t("service.runtimeStats.refresh")}
                        </button>
                        <button
                            type="button"
                            onClick={exportStats}
                            disabled={!stats}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2F67D8] px-3 text-[12px] font-bold text-white shadow-sm shadow-[#2F67D8]/20 hover:bg-[#2654B0] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Download size={14} /> {t("service.runtimeStats.export")}
                        </button>
                    </div>
                </div>

                {error && <div className="rounded-lg border border-[#FFCDD2] bg-[#FFF5F5] px-3 py-2 text-[12px] font-bold text-[#C62828]">{error}</div>}
                <div className="grid grid-cols-4 gap-2.5">
                    {kpis.map(({ icon: Icon, labelKey, value, sublabelKey, accent }) => (
                        <div key={labelKey} className="min-w-0 rounded-xl border border-[#D9E6F4] bg-white p-3 shadow-[0_3px_10px_rgba(48,84,120,0.045)]">
                            <div className="flex items-center gap-2">
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accent}`}>
                                    <Icon size={15} />
                                </span>
                                <span className="truncate text-[11px] font-bold text-[#6B85A0]">{t(labelKey as never)}</span>
                            </div>
                            <div className="mt-2 text-[24px] font-black tracking-tight text-[#223547]">{value}</div>
                            <div className="mt-1 truncate text-[10px] font-medium text-[#91A4B9]">{t(sublabelKey as never)}</div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-[minmax(250px,0.9fr)_minmax(0,1.1fr)] gap-2.5">
                    <div className="min-w-0 rounded-xl border border-[#D9E6F4] bg-white p-3 shadow-[0_3px_10px_rgba(48,84,120,0.045)]">
                        <div className="flex items-center justify-between">
                            <div className="text-[14px] font-black text-[#223547]">{t("service.runtimeStats.scanMix.title")}</div>
                            <div className="text-[10px] font-medium text-[#91A4B9]">{t("service.runtimeStats.scanMix.subtitle")}</div>
                        </div>
                        <div className="mt-2.5 flex items-center gap-3">
                            <svg width="120" height="120" viewBox="0 0 150 150" className="shrink-0">
                                <g transform="translate(75 75) rotate(-90)">
                                    <circle r={ringRadius} fill="none" stroke="#EDF2F8" strokeWidth="16" />
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
                                <text x="75" y="72" textAnchor="middle" className="fill-[#223547]" style={{ fontSize: 20, fontWeight: 900 }}>
                                    {formatNumber(totalScanMix)}
                                </text>
                                <text x="75" y="92" textAnchor="middle" className="fill-[#90A4AE]" style={{ fontSize: 10, fontWeight: 600 }}>
                                    {t("service.runtimeStats.scanMix.center")}
                                </text>
                            </svg>
                            <ul className="min-w-0 flex-1 space-y-1.5">
                                {ringSegments.map((seg) => (
                                    <li key={seg.key} className="flex items-center justify-between gap-1 text-[11px]">
                                        <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-[#526B83]">
                                            <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: seg.color }} />
                                            {t(`service.runtimeStats.scanMix.${seg.key}` as never)}
                                        </span>
                                        <span className="shrink-0 font-black text-[#223547]">
                                            {formatNumber(seg.value)}
                                            <span className="ml-1 text-[9px] font-medium text-[#90A4AE]">
                                                {(seg.fraction * 100).toFixed(1)}%
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="min-w-0 rounded-xl border border-[#D9E6F4] bg-white p-3 shadow-[0_3px_10px_rgba(48,84,120,0.045)]">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[14px] font-black text-[#223547]">
                                <Activity size={16} className="text-[#2F67D8]" />
                                {t("service.runtimeStats.trend.title")}
                            </div>
                            <div className="text-[10px] font-medium text-[#91A4B9]">{t("service.runtimeStats.trend.subtitle")}</div>
                        </div>
                        <div className="mt-3 flex h-[134px] items-end gap-1.5 rounded-lg bg-[#F8FBFF] px-2 pb-1 pt-2">
                            {recentDailyScans.map((entry) => {
                                const heightPct = (entry.count / maxDaily) * 100;
                                const dayLabel = entry.date.slice(8);
                                return (
                                    <div key={entry.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                                        <div className="h-3 text-[9px] font-bold text-[#6F8AA7]">{entry.count || ""}</div>
                                        <div
                                            className="w-full rounded-t-sm bg-gradient-to-t from-[#2F67D8] to-[#80ADFF]"
                                            style={{ height: `${heightPct}%`, minHeight: entry.count > 0 ? 8 : 3 }}
                                        />
                                        <div className="text-[9px] font-medium text-[#9DB0C5]">{dayLabel}</div>
                                    </div>
                                );
                            })}
                            {recentDailyScans.length === 0 && (
                                <div className="flex h-full w-full items-center justify-center text-[12px] text-[#9DB0C5]">所选周期暂无已完成扫描</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-[#D9E6F4] bg-white shadow-[0_3px_10px_rgba(48,84,120,0.045)]">
                    <div className="flex items-center justify-between border-b border-[#E2EBF5] px-4 py-3">
                        <div className="text-[14px] font-black text-[#223547]">{t("service.runtimeStats.components.title")}</div>
                        <div className="text-[10px] font-medium text-[#91A4B9]">{t("service.runtimeStats.components.subtitle")}</div>
                    </div>
                    {componentUsage.length === 0 ? (
                        <div className="flex items-center gap-3 px-4 py-4">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EEF4FB] text-[#6E8CAB]">
                                <Wrench size={17} />
                            </div>
                            <div>
                                <div className="text-[12px] font-bold text-[#405A73]">设备遥测未接入</div>
                                <div className="mt-0.5 text-[11px] text-[#90A4AE]">接入模拟遥测后，将在这里展示部件累计使用与维护参考。</div>
                            </div>
                        </div>
                    ) : (
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
                            {componentUsage.map((row) => {
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
                    )}
                </div>
            </section>
        </ServiceModeShell>
    );
}
