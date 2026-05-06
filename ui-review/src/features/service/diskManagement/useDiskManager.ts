import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DiskActionResponse,
  DiskManagerConfig,
  DiskPartition,
  DiskPartitionId,
  FlashMessage,
  PartitionsResponse,
  ScanFile,
} from "./types";

import { API_BASE_URL } from "../../../lib/apiClient";

const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}/api/disk-manager${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const detail = data?.detail;
    if (typeof detail === "string") {
      throw new Error(detail);
    }
    if (detail?.message) {
      throw new Error(detail.message);
    }
    throw new Error("请求失败");
  }

  return data as T;
};

const createEmptySelection = (): Record<DiskPartitionId, Set<string>> => ({
  RawData: new Set(),
  DICOM: new Set(),
  PACS: new Set(),
  Phantom: new Set(),
});

const getBlockedReason = (file: ScanFile, action: "reserve" | "release" | "purge") => {
  if (action === "reserve" && file.status === "RESERVED") {
    return "文件已保留";
  }
  if (action === "release" && file.status !== "RESERVED") {
    return "文件当前未保留";
  }
  if (file.active_recon_jobs > 0) {
    return `存在 ${file.active_recon_jobs} 个重建任务`;
  }
  if (action === "purge" && file.status === "RESERVED") {
    return "文件已保留，请先释放";
  }
  return null;
};

export function useDiskManager() {
  const [partitions, setPartitions] = useState<DiskPartition[]>([]);
  const [config, setConfig] = useState<DiskManagerConfig>({
    retention_days: 7,
    retention_time: "00:00",
    auto_cleanup: false,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPartition, setExpandedPartition] = useState<DiskPartitionId | null>("RawData");
  const [selectedFiles, setSelectedFiles] = useState<Record<DiskPartitionId, Set<string>>>(createEmptySelection);
  const [message, setMessage] = useState<FlashMessage | null>(null);
  const [busyPartition, setBusyPartition] = useState<DiskPartitionId | null>(null);

  const flash = useCallback((next: FlashMessage | null) => {
    setMessage(next);
    if (next) {
      window.setTimeout(() => setMessage(null), 3200);
    }
  }, []);

  const fetchPartitions = useCallback(async () => {
    try {
      const data = await api<PartitionsResponse>("/partitions");
      setPartitions(data.partitions);
      setConfig(data.config);
    } catch (error) {
      flash({ type: "error", text: error instanceof Error ? error.message : "加载磁盘数据失败" });
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    fetchPartitions();
  }, [fetchPartitions]);

  const getPartition = useCallback(
    (partitionId: DiskPartitionId) => partitions.find((item) => item.id === partitionId) ?? null,
    [partitions],
  );

  const getFilteredFiles = useCallback(
    (partitionId: DiskPartitionId) => {
      const partition = getPartition(partitionId);
      if (!partition) return [];
      const keyword = searchQuery.trim().toLowerCase();
      if (!keyword) return partition.files;
      return partition.files.filter((file) => file.patient_id.toLowerCase().includes(keyword));
    },
    [getPartition, searchQuery],
  );

  const toggleFileSelection = useCallback((partitionId: DiskPartitionId, fileId: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev[partitionId]);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return { ...prev, [partitionId]: next };
    });
  }, []);

  const toggleAllFiles = useCallback((partitionId: DiskPartitionId, files: ScanFile[]) => {
    setSelectedFiles((prev) => {
      const current = prev[partitionId];
      const allSelected = files.length > 0 && files.every((file) => current.has(file.id));
      return {
        ...prev,
        [partitionId]: allSelected ? new Set() : new Set(files.map((file) => file.id)),
      };
    });
  }, []);

  const clearSelection = useCallback((partitionId: DiskPartitionId) => {
    setSelectedFiles((prev) => ({ ...prev, [partitionId]: new Set() }));
  }, []);

  const getSelectedScanFiles = useCallback(
    (partitionId: DiskPartitionId) => {
      const partition = getPartition(partitionId);
      if (!partition) return [];
      const selection = selectedFiles[partitionId];
      return partition.files.filter((file) => selection.has(file.id));
    },
    [getPartition, selectedFiles],
  );

  const canRelease = useCallback(
    (partitionId: DiskPartitionId) => {
      const files = getSelectedScanFiles(partitionId);
      if (files.length === 0) return { ok: false, reason: "未选择文件" };
      const blocked = files.find((file) => getBlockedReason(file, "release"));
      return blocked
        ? { ok: false, reason: getBlockedReason(blocked, "release") ?? "当前无法释放" }
        : { ok: true };
    },
    [getSelectedScanFiles],
  );

  const canReserve = useCallback(
    (partitionId: DiskPartitionId) => {
      const files = getSelectedScanFiles(partitionId);
      if (files.length === 0) return { ok: false, reason: "未选择文件" };
      const blocked = files.find((file) => getBlockedReason(file, "reserve"));
      return blocked
        ? { ok: false, reason: getBlockedReason(blocked, "reserve") ?? "当前无法保留" }
        : { ok: true };
    },
    [getSelectedScanFiles],
  );

  const canPurge = useCallback(
    (partitionId: DiskPartitionId) => {
      const files = getSelectedScanFiles(partitionId);
      if (files.length === 0) return { ok: false, reason: "未选择文件" };
      const blocked = files.find((file) => getBlockedReason(file, "purge"));
      return blocked
        ? { ok: false, reason: getBlockedReason(blocked, "purge") ?? "当前无法删除" }
        : { ok: true };
    },
    [getSelectedScanFiles],
  );

  const runAction = useCallback(
    async (
      partitionId: DiskPartitionId,
      fileIds: string[],
      action: "reserve" | "release" | "purge",
      successText: string,
    ) => {
      setBusyPartition(partitionId);
      try {
        const method = action === "purge" ? "DELETE" : "POST";
        const data = await api<DiskActionResponse>(`/files/${action}`, {
          method,
          body: JSON.stringify({ file_ids: fileIds, partition: partitionId }),
        });

        const blockedCount = data.blocked?.length ?? 0;
        const text = blockedCount > 0 ? `${successText}${data.count} 个，阻止 ${blockedCount} 个` : `${successText}${data.count} 个`;
        flash({ type: blockedCount > 0 ? "error" : "success", text });
        clearSelection(partitionId);
        await fetchPartitions();
      } catch (error) {
        flash({ type: "error", text: error instanceof Error ? error.message : "操作失败" });
      } finally {
        setBusyPartition(null);
      }
    },
    [clearSelection, fetchPartitions, flash],
  );

  const reserveFiles = useCallback(
    (partitionId: DiskPartitionId, fileIds: string[]) => runAction(partitionId, fileIds, "reserve", "已保留 "),
    [runAction],
  );

  const releaseFiles = useCallback(
    (partitionId: DiskPartitionId, fileIds: string[]) => runAction(partitionId, fileIds, "release", "已释放 "),
    [runAction],
  );

  const purgeFiles = useCallback(
    (partitionId: DiskPartitionId, fileIds: string[]) => runAction(partitionId, fileIds, "purge", "已删除 "),
    [runAction],
  );

  const updateThreshold = useCallback(
    async (partitionId: DiskPartitionId, threshold: number) => {
      try {
        await api(`/partitions/${partitionId}/threshold`, {
          method: "PATCH",
          body: JSON.stringify({ threshold }),
        });
        await fetchPartitions();
      } catch (error) {
        flash({ type: "error", text: error instanceof Error ? error.message : "阈值更新失败" });
      }
    },
    [fetchPartitions, flash],
  );

  const updateConfig = useCallback(
    async (patch: Partial<DiskManagerConfig>) => {
      try {
        const data = await api<DiskManagerConfig>("/config", {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        setConfig(data);
        flash({ type: "success", text: "配置已更新" });
      } catch (error) {
        flash({ type: "error", text: error instanceof Error ? error.message : "配置更新失败" });
      }
    },
    [flash],
  );

  const getUsagePercent = useCallback(
    (partitionId: DiskPartitionId) => {
      const partition = getPartition(partitionId);
      if (!partition || partition.capacity_mb === 0) return 0;
      return (partition.used_mb / partition.capacity_mb) * 100;
    },
    [getPartition],
  );

  const isOverThreshold = useCallback(
    (partitionId: DiskPartitionId) => {
      const partition = getPartition(partitionId);
      if (!partition) return false;
      return getUsagePercent(partitionId) >= partition.threshold;
    },
    [getPartition, getUsagePercent],
  );

  const selectedCount = useMemo(() => {
    return Object.fromEntries(
      Object.entries(selectedFiles).map(([partitionId, fileIds]) => [partitionId, fileIds.size]),
    ) as Record<DiskPartitionId, number>;
  }, [selectedFiles]);

  return {
    busyPartition,
    canPurge,
    canReserve,
    canRelease,
    clearSelection,
    config,
    expandedPartition,
    getFilteredFiles,
    getSelectedScanFiles,
    getUsagePercent,
    isOverThreshold,
    loading,
    message,
    partitions,
    purgeFiles,
    refreshData: fetchPartitions,
    releaseFiles,
    reserveFiles,
    searchQuery,
    selectedCount,
    selectedFiles,
    setExpandedPartition,
    setSearchQuery,
    toggleAllFiles,
    toggleFileSelection,
    updateConfig,
    updateThreshold,
  };
}
