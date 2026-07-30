import { apiFetch } from "./apiClient";

export type DiskRetentionConfig = {
  retention_days: number;
  retention_time: string;
  auto_cleanup: boolean;
};

type DiskPartitionsResponse = {
  config: DiskRetentionConfig;
};

const parseError = async (response: Response, fallback: string): Promise<Error> => {
  try {
    const data = await response.json();
    return new Error(data?.detail?.message ?? data?.detail ?? fallback);
  } catch {
    return new Error(fallback);
  }
};

export async function getDiskRetentionConfig(): Promise<DiskRetentionConfig> {
  const response = await apiFetch("/api/disk-manager/partitions");
  if (!response.ok) throw await parseError(response, `Failed to load disk retention settings (${response.status})`);
  return (await response.json() as DiskPartitionsResponse).config;
}

export async function updateDiskRetentionConfig(config: DiskRetentionConfig): Promise<DiskRetentionConfig> {
  const response = await apiFetch("/api/disk-manager/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!response.ok) throw await parseError(response, `Failed to update disk retention settings (${response.status})`);
  return response.json();
}
