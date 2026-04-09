import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  BookCopy,
  Pencil,
  Eye,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Power,
  ArrowUpDown,
} from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";

// ── API types ──────────────────────────────────────────────────────────────

type AgeGroup = "adult" | "child" | "infant";
type PatientPosition = "HFS" | "FFS" | "HFP" | "FFP";
type TableDirection = "in" | "out";
type ScanMode = "plain" | "contrast" | "4d";

type ApiProtocolSummary = {
  id: number;
  name: string;
  body_part: string;
  age_group: AgeGroup;
  patient_weight: string;
  patient_position: PatientPosition;
  table_direction: TableDirection;
  scan_mode: ScanMode;
  description?: string | null;
  is_factory: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at?: string | null;
  series_count: number;
  supported_modes: string[];
};

// Removed ProtocolFormData as it is now handled in WT32ProtocolDetailScreen

// ── Constants ──────────────────────────────────────────────────────────────

const API_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(/\/$/, "");
const buildApiUrl = (path: string) => `${API_BASE_URL}${path}`;

const AGE_GROUP_LABELS: Record<AgeGroup, string> = { adult: "成人", child: "儿童", infant: "婴幼儿" };
const SCAN_MODE_LABELS: Record<ScanMode, string> = { plain: "平扫", contrast: "增强", "4d": "4D" };

// Removed EMPTY_FORM

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type SortKey = "name" | "id" | "created_at" | "updated_at" | "is_enabled";
type SortDir = "asc" | "desc";
type SourceFilter = "all" | "custom" | "factory";
type ModalState =
  | { type: "delete"; protocol: ApiProtocolSummary }
  | null;

const PAGE_SIZE_OPTIONS = [10, 20, 50];

// ── Scan mode badge ────────────────────────────────────────────────────────

const SCAN_MODE_STYLE: Record<ScanMode, string> = {
  plain: "bg-[#E8F1FF] text-[#1565C0]",
  contrast: "bg-[#FFF3E0] text-[#BF360C]",
  "4d": "bg-[#F3E5F5] text-[#6A1B9A]",
};

function ScanModeBadge({ mode }: { mode: ScanMode }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide ${SCAN_MODE_STYLE[mode]}`}>
      {SCAN_MODE_LABELS[mode]}
    </span>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${
      enabled ? "bg-[#E6F4EA] text-[#1B5E20]" : "bg-[#F1F5F9] text-[#78909C]"
    }`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${enabled ? "bg-[#43A047]" : "bg-[#B0BEC5]"}`} />
      {enabled ? "启用" : "禁用"}
    </span>
  );
}

// ── Icon button ────────────────────────────────────────────────────────────

function IconBtn({
  icon: Icon,
  label,
  onClick,
  variant = "default",
  size = 15,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  variant?: "default" | "primary" | "danger" | "warning";
  size?: number;
}) {
  const variantCls = {
    default: "text-[#546E7A] hover:bg-[#EEF2F9] hover:text-[#37474F]",
    primary: "text-[#1565C0] hover:bg-[#E3F2FD] hover:text-[#0D47A1]",
    danger: "text-[#C62828] hover:bg-[#FFEBEE] hover:text-[#B71C1C]",
    warning: "text-[#E65100] hover:bg-[#FFF3E0] hover:text-[#BF360C]",
  }[variant];

  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-90 ${variantCls}`}
    >
      <Icon size={size} strokeWidth={1.8} />
    </button>
  );
}

// Removed FormModal component

// ── Delete Confirm ─────────────────────────────────────────────────────────

function DeleteConfirm({
  protocol,
  onConfirm,
  onCancel,
}: {
  protocol: ApiProtocolSummary;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0F172A]/40 backdrop-blur-[2px]">
      <div className="w-[360px] rounded-xl bg-white shadow-2xl border border-[#E0E8F2] overflow-hidden">
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFEBEE]">
              <Trash2 size={16} className="text-[#C62828]" />
            </div>
            <div>
              <h3 className="text-[14px] font-black text-[#1A2332]">确认删除协议</h3>
              <p className="mt-1 text-[12px] text-[#546E7A] leading-relaxed">
                将永久删除「<span className="font-bold text-[#263238]">{protocol.name}</span>」，此操作无法撤销。
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#EEF2F9] bg-[#F8FBFF]">
          <button type="button" onClick={onCancel}
            className="h-9 px-5 rounded-lg border border-[#CFD8DC] text-[13px] font-bold text-[#546E7A] hover:bg-[#EEF2F9] transition-colors active:scale-95">
            取消
          </button>
          <button type="button" disabled={loading}
            onClick={async () => { setLoading(true); await onConfirm(); }}
            className="h-9 px-5 rounded-lg bg-[#EF5350] text-[13px] font-bold text-white hover:bg-[#C62828] disabled:opacity-50 transition-all active:scale-95">
            {loading ? "删除中…" : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ProtocolManagementPage() {
  const navigate = useNavigate();
  const [protocols, setProtocols] = useState<ApiProtocolSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("custom");
  const [bodyPartFilter, setBodyPartFilter] = useState("all");
  const [ageGroupFilter, setAgeGroupFilter] = useState<AgeGroup | "all">("all");
  const [scanModeFilter, setScanModeFilter] = useState<ScanMode | "all">("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, ok = true) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, ok });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const fetchProtocols = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("/api/protocols/catalog"));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setProtocols(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProtocols(); }, [fetchProtocols]);

  const handleSort = (key: SortKey) => {
    setSortDir(sortKey === key ? (d) => (d === "asc" ? "desc" : "asc") : "asc");
    setSortKey(key);
    setPage(1);
  };

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return protocols
      .filter((p) => {
        if (sourceFilter === "all") return true;
        return sourceFilter === "factory" ? p.is_factory : !p.is_factory;
      })
      .filter((p) => bodyPartFilter === "all" || p.body_part === bodyPartFilter)
      .filter((p) => ageGroupFilter === "all" || p.age_group === ageGroupFilter)
      .filter((p) => scanModeFilter === "all" || p.scan_mode === scanModeFilter)
      .filter((p) => !kw || p.name.toLowerCase().includes(kw) || p.body_part.toLowerCase().includes(kw))
      .sort((a, b) => {
        const get = (p: ApiProtocolSummary): string | number => {
          if (sortKey === "name") return p.name;
          if (sortKey === "id") return p.id;
          if (sortKey === "created_at") return p.created_at;
          if (sortKey === "updated_at") return p.updated_at ?? "";
          return p.is_enabled ? 1 : 0;
        };
        const [va, vb] = [get(a), get(b)];
        return (va < vb ? -1 : va > vb ? 1 : 0) * (sortDir === "asc" ? 1 : -1);
      });
  }, [protocols, sourceFilter, bodyPartFilter, ageGroupFilter, scanModeFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);

  const customCount = protocols.filter((p) => !p.is_factory).length;
  const factoryCount = protocols.filter((p) => p.is_factory).length;
  const bodyPartOptions = useMemo(
    () => Array.from(new Set(protocols.map((p) => p.body_part).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [protocols]
  );

  // createProtocol and updateProtocol moved to WT32ProtocolDetailScreen

  const toggleEnabled = async (p: ApiProtocolSummary) => {
    const res = await fetch(buildApiUrl(`/api/protocols/${p.id}/toggle-enabled`), { method: "PATCH" });
    if (!res.ok) { showToast("操作失败", false); return; }
    await fetchProtocols();
    showToast(p.is_enabled ? "协议已禁用" : "协议已启用");
  };

  const deleteProtocol = async (id: number) => {
    const res = await fetch(buildApiUrl(`/api/protocols/${id}`), { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as { detail?: string }).detail ?? `HTTP ${res.status}`); }
    await fetchProtocols();
    setModal(null);
    showToast("协议已删除");
  };

// handleModalSubmit and toForm removed

  // Sort header
  const Th = ({ col, children, width }: { col: SortKey; children: React.ReactNode; width?: string }) => (
    <th
      style={width ? { width } : undefined}
      onClick={() => handleSort(col)}
      className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-[#78909C] cursor-pointer select-none hover:text-[#1E88E5] transition-colors group"
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === col
          ? (sortDir === "asc" ? <ChevronUp size={11} className="text-[#1E88E5]" /> : <ChevronDown size={11} className="text-[#1E88E5]" />)
          : <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-40 transition-opacity" />
        }
      </span>
    </th>
  );

  return (
    <ServiceModeShell currentRoute="/service/settings/protocol-management">
      <div className="flex min-h-0 flex-1 flex-col gap-3 pr-0.5">

        {/* ── Tab + Toolbar ─────────────────────────────────── */}
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden rounded-xl border border-[#DDEAF8] bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF2F9] px-4 py-3">
            <div className="min-w-[160px]">
              <select
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value as SourceFilter); setPage(1); }}
                className="h-9 w-full rounded-lg border border-[#CFD8DC] bg-white px-3 text-[13px] text-[#263238] outline-none transition-all hover:border-[#90A4AE] focus:border-[#1E88E5] focus:ring-2 focus:ring-[#1E88E5]/15"
              >
                <option value="all">全部协议 ({protocols.length})</option>
                <option value="custom">自设协议 ({customCount})</option>
                <option value="factory">出厂协议 ({factoryCount})</option>
              </select>
            </div>

            <div className="min-w-[140px]">
              <select
                value={bodyPartFilter}
                onChange={(e) => { setBodyPartFilter(e.target.value); setPage(1); }}
                className="h-9 w-full rounded-lg border border-[#CFD8DC] bg-white px-3 text-[13px] text-[#263238] outline-none transition-all hover:border-[#90A4AE] focus:border-[#1E88E5] focus:ring-2 focus:ring-[#1E88E5]/15"
              >
                <option value="all">全部部位</option>
                {bodyPartOptions.map((part) => (
                  <option key={part} value={part}>{part}</option>
                ))}
              </select>
            </div>

            <div className="min-w-[120px]">
              <select
                value={ageGroupFilter}
                onChange={(e) => { setAgeGroupFilter(e.target.value as AgeGroup | "all"); setPage(1); }}
                className="h-9 w-full rounded-lg border border-[#CFD8DC] bg-white px-3 text-[13px] text-[#263238] outline-none transition-all hover:border-[#90A4AE] focus:border-[#1E88E5] focus:ring-2 focus:ring-[#1E88E5]/15"
              >
                <option value="all">全年龄</option>
                <option value="adult">{AGE_GROUP_LABELS.adult}</option>
                <option value="child">{AGE_GROUP_LABELS.child}</option>
                <option value="infant">{AGE_GROUP_LABELS.infant}</option>
              </select>
            </div>

            <div className="min-w-[120px]">
              <select
                value={scanModeFilter}
                onChange={(e) => { setScanModeFilter(e.target.value as ScanMode | "all"); setPage(1); }}
                className="h-9 w-full rounded-lg border border-[#CFD8DC] bg-white px-3 text-[13px] text-[#263238] outline-none transition-all hover:border-[#90A4AE] focus:border-[#1E88E5] focus:ring-2 focus:ring-[#1E88E5]/15"
              >
                <option value="all">全部模式</option>
                <option value="plain">{SCAN_MODE_LABELS.plain}</option>
                <option value="contrast">{SCAN_MODE_LABELS.contrast}</option>
                <option value="4d">{SCAN_MODE_LABELS["4d"]}</option>
              </select>
            </div>

            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B0BEC5]" size={14} />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="搜索协议名称、部位"
                className="h-9 w-full rounded-lg border border-[#CFD8DC] bg-[#F8FBFF] pl-9 pr-3 text-[13px] outline-none transition-all focus:border-[#1E88E5] focus:ring-2 focus:ring-[#1E88E5]/15 placeholder:text-[#B0BEC5]"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={fetchProtocols} title="刷新"
                className={`flex h-9 w-9 items-center justify-center rounded-lg border border-[#CFD8DC] text-[#78909C] hover:bg-[#F5F8FF] hover:text-[#1E88E5] hover:border-[#90CAF9] transition-all active:scale-90 ${loading ? "animate-spin text-[#1E88E5]" : ""}`}>
                <RefreshCcw size={14} />
              </button>

              {sourceFilter !== "factory" && (
                <button type="button" onClick={() => navigate("/protocol-detail?mode=new&source=catalog")}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-[#1E88E5] px-4 text-[13px] font-bold text-white shadow-sm hover:bg-[#1565C0] transition-all active:scale-95">
                  <Plus size={15} strokeWidth={2.5} />
                  新建协议
                </button>
              )}
            </div>
          </div>

        {toast && (
          <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] font-semibold shadow-sm border transition-all ${
            toast.ok
              ? "bg-[#E8F5E9] border-[#C8E6C9] text-[#1B5E20]"
              : "bg-[#FFEBEE] border-[#FFCDD2] text-[#C62828]"
          }`}>
            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${toast.ok ? "bg-[#43A047]" : "bg-[#EF5350]"}`} />
            {toast.msg}
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar border-b border-[#EEF2F9]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-[#B0BEC5]">
              <RefreshCcw size={22} className="animate-spin" />
              <span className="text-[13px]">正在加载协议数据…</span>
            </div>
          ) : error ? (
            <div className="py-14 text-center">
              <p className="text-[13px] font-semibold text-[#EF5350]">加载失败</p>
              <p className="mt-1 text-[12px] text-[#90A4AE]">{error}</p>
              <button type="button" onClick={fetchProtocols}
                className="mt-4 h-8 px-4 rounded-lg border border-[#CFD8DC] text-[12px] font-bold text-[#546E7A] hover:bg-[#F5F8FF] transition-colors">
                重试
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-2">
              <div className="w-10 h-10 rounded-full bg-[#EEF2F9] flex items-center justify-center text-[#B0BEC5]">
                {search ? <Search size={18} /> : <Plus size={18} />}
              </div>
              <p className="text-[13px] font-semibold text-[#546E7A]">
                {search
                  ? `未找到包含"${search}"的协议`
                  : sourceFilter === "custom"
                    ? "暂无自设协议"
                    : sourceFilter === "factory"
                      ? "暂无出厂协议"
                      : "暂无协议"}
              </p>
              {!search && sourceFilter !== "factory" && (
                <button type="button" onClick={() => navigate("/protocol-detail?mode=new&source=catalog")}
                  className="mt-1 h-8 px-4 rounded-lg bg-[#1E88E5] text-[12px] font-bold text-white hover:bg-[#1565C0] transition-colors active:scale-95">
                  + 新建协议
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed min-w-[760px]">
                <colgroup>
                  <col style={{ width: "56px" }} />
                  <col />
                  <col style={{ width: "72px" }} />
                  <col style={{ width: "112px" }} />
                  <col style={{ width: "92px" }} />
                  <col style={{ width: sourceFilter === "factory" ? "140px" : "120px" }} />
                </colgroup>
                <thead className="border-b border-[#EEF2F9] bg-[#F8FBFF] sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-3 py-3 text-center text-[11px] font-black uppercase tracking-wide text-[#78909C]">序号</th>
                    <Th col="name">协议名称</Th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-[#78909C]">模式</th>
                    <Th col="created_at">创建时间</Th>
                    <Th col="is_enabled">状态</Th>
                    <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wide text-[#78909C]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {pageRows.map((p, index) => {
                    const created = formatDate(p.created_at);
                    return (
                      <tr key={p.id}
                        className={`group transition-colors hover:bg-[#F5F9FF] ${!p.is_enabled ? "opacity-60" : ""}`}>
                        <td className="px-3 py-3.5 text-center text-[12px] font-semibold text-[#90A4AE]">
                          {(curPage - 1) * pageSize + index + 1}
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[13px] font-bold text-[#1A2332] truncate leading-tight" title={p.name}>
                              {p.name}
                            </span>
                            <span className="text-[11px] text-[#90A4AE]">
                              {AGE_GROUP_LABELS[p.age_group]} · {p.body_part}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5"><ScanModeBadge mode={p.scan_mode} /></td>

                        <td className="px-3 py-3.5 whitespace-nowrap">
                          {created ? (
                            <span className="text-[12px] text-[#546E7A] font-medium">{created}</span>
                          ) : <span className="text-[12px] text-[#CFD8DC]">—</span>}
                        </td>

                        <td className="px-3 py-3.5 whitespace-nowrap"><StatusBadge enabled={p.is_enabled} /></td>

                        <td className="px-3 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            {!p.is_factory ? (
                              <>
                                <IconBtn icon={Pencil} label="编辑" variant="primary"
                                  onClick={() => navigate(`/protocol-detail?mode=edit&id=${p.id}&source=catalog`)} />
                                <IconBtn icon={Power} label={p.is_enabled ? "禁用" : "启用"}
                                  variant={p.is_enabled ? "warning" : "default"}
                                  onClick={() => toggleEnabled(p)} />
                                <IconBtn icon={Trash2} label="删除" variant="danger"
                                  onClick={() => setModal({ type: "delete", protocol: p })} />
                              </>
                            ) : (
                              <>
                                <IconBtn icon={Eye} label="查看详情"
                                  onClick={() => navigate(`/protocol-detail?mode=view&id=${p.id}&source=catalog`)} />
                                <button type="button"
                                  onClick={() => navigate(`/protocol-detail?mode=new&id=${p.id}&source=catalog`)}
                                  className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold text-[#1565C0] hover:bg-[#E3F2FD] transition-all active:scale-90 whitespace-nowrap">
                                  <BookCopy size={13} strokeWidth={1.8} />
                                  另存为
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && !error && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0 bg-[#F8FBFF] border-t border-[#EEF2F9]">
            <div className="flex items-center gap-2 text-[12px] text-[#78909C]">
              每页
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="h-7 rounded-md border border-[#CFD8DC] px-1.5 text-[12px] font-bold text-[#546E7A] outline-none focus:border-[#1E88E5] bg-white">
                {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              条 &nbsp;·&nbsp; 共 <span className="font-bold text-[#546E7A]">{filtered.length}</span> 条
            </div>

            <div className="flex items-center gap-1">
              <button type="button" disabled={curPage <= 1} onClick={() => setPage((p) => p - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[#CFD8DC] text-[#78909C] hover:bg-[#F5F8FF] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm">
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - curPage) <= 1)
                .reduce<(number | "…")[]>((acc, n, i, arr) => {
                  if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("…");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === "…" ? (
                    <span key={`e${i}`} className="px-1 text-[12px] text-[#B0BEC5]">…</span>
                  ) : (
                    <button key={n} type="button" onClick={() => setPage(n as number)}
                      className={`flex h-7 w-7 items-center justify-center rounded-md border text-[12px] font-bold transition-all active:scale-90 ${
                        curPage === n
                          ? "bg-[#1E88E5] border-[#1E88E5] text-white shadow-sm"
                          : "border-[#CFD8DC] text-[#546E7A] hover:bg-[#F5F8FF] hover:border-[#90CAF9]"
                      }`}>
                      {n}
                    </button>
                  )
                )}
              <button type="button" disabled={curPage >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[#CFD8DC] text-[#78909C] hover:bg-[#F5F8FF] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm">
                ›
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* ── Overlays ──────────────────────────────────────────── */}
      {modal?.type === "delete" && (
        <DeleteConfirm
          protocol={modal.protocol}
          onConfirm={() => deleteProtocol(modal.protocol.id)}
          onCancel={() => setModal(null)}
        />
      )}
    </ServiceModeShell>
  );
}
