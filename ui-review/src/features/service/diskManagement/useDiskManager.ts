import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DiskManagerConfig,
  DiskPartition,
  DiskPartitionId,
  PartitionsResponse,
  ScanFile,
} from "./types";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "")
).replace(/\/$/, "");

const api = (path: string, init?: RequestInit) =>
  fetch(`${API_BASE_URL}/api/disk-manager${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useDiskManager() {
  const [partitions, setPartitions] = useState<DiskPartition[]>([]);
  const [config, setConfig] = useState<DiskManagerConfig>({
    retention_days: 7,
    retention_time: "00:00",
    auto_cleanup: false,
  });
  const [loading, setLoading] = useState(true);
  const [expandedPartition, setExpandedPartition] =
    useState<DiskPartitionId | null>("RawData");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<
    Record<DiskPartitionId, Set<string>>
  >({
    RawData: new Set(),
    DICOM: new Set(),
    PACS: new Set(),
    Phantom: new Set(),
  });
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchPartitions = useCallback(async () => {
    try {
      const res = await api("/partitions");
      if (!res.ok) throw new Error("Failed to fetch");
      const data: PartitionsResponse = await res.json();
      setPartitions(data.partitions);
      setConfig(data.config);
    } catch {
      // keep stale data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPartitions();
  }, [fetchPartitions]);

  // ── Filtered files ───────────────────────────────────────────────────
  const getFilteredFiles = useCallback(
    (partitionId: DiskPartitionId): ScanFile[] => {
      const p = partitions.find((d) => d.id === partitionId);
      if (!p) return [];
      if (!searchQuery.trim()) return p.files;
      const q = searchQuery.trim().toLowerCase();
      return p.files.filter((f) => f.patient_id.toLowerCase().includes(q));
    },
    [partitions, searchQuery],
  );

  // ── Selection helpers ────────────────────────────────────────────────
  const toggleFileSelection = useCallback(
    (partitionId: DiskPartitionId, fileId: string) => {
      setSelectedFiles((prev) => {
        const next = new Set(prev[partitionId]);
        if (next.has(fileId)) next.delete(fileId);
        else next.add(fileId);
        return { ...prev, [partitionId]: next };
      });
    },
    [],
  );

  const toggleAllFiles = useCallback(
    (partitionId: DiskPartitionId, files: ScanFile[]) => {
      setSelectedFiles((prev) => {
        const current = prev[partitionId];
        const allSelected = files.length > 0 && files.every((f) => current.has(f.id));
        const next = allSelected
          ? new Set<string>()
          : new Set(files.map((f) => f.id));
        return { ...prev, [partitionId]: next };
      });
    },
    [],
  );

  const clearSelection = useCallback((partitionId: DiskPartitionId) => {
    setSelectedFiles((prev) => ({ ...prev, [partitionId]: new Set() }));
  }, []);

  // ── Constraint checks ────────────────────────────────────────────────
  const getSelectedScanFiles = useCallback(
    (partitionId: DiskPartitionId): ScanFile[] => {
      const p = partitions.find((d) => d.id === partitionId);
      if (!p) return [];
      const sel = selectedFiles[partitionId];
      return p.files.filter((f) => sel.has(f.id));
    },
    [partitions, selectedFiles],
  );

  const canRelease = useCallback(
    (partitionId: DiskPartitionId): { ok: boolean; reason?: string } => {
      const files = getSelectedScanFiles(partitionId);
      if (files.length === 0) return { ok: false, reason: "未选择文件" };
      const blocked = files.filter((f) => f.active_recon_jobs > 0);
      if (blocked.length > 0)
        return {
          ok: false,
          reason: `${blocked.length} 个文件有活跃重建任务`,
        };
      return { ok: true };
    },
    [getSelectedScanFiles],
  );

  const canPurge = useCallback(
    (partitionId: DiskPartitionId): { ok: boolean; reason?: string } => {
      const files = getSelectedScanFiles(partitionId);
      if (files.length === 0) return { ok: false, reason: "未选择文件" };
      const reconBlocked = files.filter((f) => f.active_recon_jobs > 0);
      if (reconBlocked.length > 0)
        return {
          ok: false,
          reason: `${reconBlocked.length} 个文件有活跃重建任务`,
        };
      const reserved = files.filter((f) => f.status === "RESERVED");
      if (reserved.length > 0)
        return {
          ok: false,
          reason: `${reserved.length} 个文件已保留，需先释放`,
        };
      return { ok: true };
    },
    [getSelectedScanFiles],
  );

  // ── Flash message ────────────────────────────────────────────────────
  const flash = useCallback(
    (type: "success" | "error", text: string) => {
      setMessage({ type, text });
      setTimeout(() => setMessage(null), 3000);
    },
    [],
  );

  // ── Operations ───────────────────────────────────────────────────────
  const reserveFiles = useCallback(
    async (partitionId: DiskPartitionId, fileIds: string[]) => {
      try {
        const res = await api("/files/reserve", {
          method: "POST",
          body: JSON.stringify({ file_ids: fileIds, partition: partitionId }),
        });
        if (!res.ok) {
          const err = await res.json();
          flash("error", err.detail?.message ?? "保留失败");
          return;
        }
        const data = await res.json();
        flash("success", `已保留 ${data.count} 个文件`);
        clearSelection(partitionId);
        await fetchPartitions();
      } catch {
        flash("error", "网络错误");
      }
    },
    [fetchPartitions, clearSelection, flash],
  );

  const releaseFiles = useCallback(
    async (partitionId: DiskPartitionId, fileIds: string[]) => {
      try {
        const res = await api("/files/release", {
          method: "POST",
          body: JSON.stringify({ file_ids: fileIds, partition: partitionId }),
        });
        if (!res.ok) {
          const err = await res.json();
          flash("error", err.detail?.message ?? "释放失败");
          return;
        }
        const data = await res.json();
        flash(
          data.blocked?.length
            ? "error"
            : "success",
          data.blocked?.length
            ? `已释放 ${data.count} 个，${data.blocked.length} 个被阻止`
            : `已释放 ${data.count} 个文件`,
        );
        clearSelection(partitionId);
        await fetchPartitions();
      } catch {
        flash("error", "网络错误");
      }
    },
    [fetchPartitions, clearSelection, flash],
  );

  const purgeFiles = useCallback(
    async (partitionId: DiskPartitionId, fileIds: string[]) => {
      try {
        const res = await api("/files/purge", {
          method: "POST",
          body: JSON.stringify({ file_ids: fileIds, partition: partitionId }),
        });
        if (!res.ok) {
          const err = await res.json();
          flash("error", err.detail?.message ?? "删除失败");
          return;
        }
        const data = await res.json();
        flash(
          data.blocked?.length
            ? "error"
            : "success",
          data.blocked?.length
            ? `已删除 ${data.count} 个，${data.blocked.length} 个被阻止`
            : `已删除 ${data.count} 个文件`,
        );
        clearSelection(partitionId);
        await fetchPartitions();
      } catch {
        flash("error", "网络错误");
      }
    },
    [fetchPartitions, clearSelection, flash],
  );

  const updateThreshold = useCallback(
    async (partitionId: DiskPartitionId, threshold: number) => {
      try {
        await api(`/partitions/${partitionId}/threshold`, {
          method: "PATCH",
          body: JSON.stringify({ threshold }),
        });
        await fetchPartitions();
      } catch {
        // silent
      }
    },
    [fetchPartitions],
  );

  const updateConfig = useCallback(
    async (patch: Partial<DiskManagerConfig>) => {
      try {
        const res = await api("/config", {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch {
        // silent
      }
    },
    [],
  );

  // ── Derived ──────────────────────────────────────────────────────────
  const getUsagePercent = useCallback(
    (partitionId: DiskPartitionId): number => {
      const p = partitions.find((d) => d.id === partitionId);
      if (!p || p.capacity_mb === 0) return 0;
      return Math.round((p.used_mb / p.capacity_mb) * 10000) / 100;
    },
    [partitions],
  );

  const isOverThreshold = useCallback(
    (partitionId: DiskPartitionId): boolean => {
      const p = partitions.find((d) => d.id === partitionId);
      if (!p) return false;
      return getUsagePercent(partitionId) > p.threshold;
    },
    [partitions, getUsagePercent],
  );

  const selectedCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(selectedFiles)) {
      counts[k] = v.size;
    }
    return counts;
  }, [selectedFiles]);

  return {
    partitions,
    config,
    loading,
    expandedPartition,
    setExpandedPartition,
    searchQuery,
    setSearchQuery,
    selectedFiles,
    selectedCount,
    message,
    // per-partition
    getFilteredFiles,
    getUsagePercent,
    isOverThreshold,
    // selection
    toggleFileSelection,
    toggleAllFiles,
    clearSelection,
    // constraints
    canRelease,
    canPurge,
    // operations
    reserveFiles,
    releaseFiles,
    purgeFiles,
    updateThreshold,
    updateConfig,
    refreshData: fetchPartitions,
  };
}
