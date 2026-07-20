import type { DailyQaRecord } from "./types";

const STORAGE_KEY = "serviceDailyQaRecords";
const API_URL = "/api/service-state/daily_qa_records";

const readLegacyRecords = (): DailyQaRecord[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as DailyQaRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const loadDailyQaRecords = async (): Promise<DailyQaRecord[]> => {
  const legacy = readLegacyRecords();
  try {
    const response = await fetch(API_URL);
    if (!response.ok) return legacy;
    const body = await response.json() as { payload?: unknown };
    if (Array.isArray(body.payload) && body.payload.length > 0) return body.payload as DailyQaRecord[];
    if (legacy.length > 0) {
      await saveDailyQaRecords(legacy);
      return legacy;
    }
    return Array.isArray(body.payload) ? body.payload as DailyQaRecord[] : [];
  } catch {
    return legacy;
  }
};

export const saveDailyQaRecords = async (records: DailyQaRecord[]): Promise<void> => {
  const response = await fetch(API_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(records),
  });
  if (!response.ok) throw new Error("Failed to save daily QA records");
  localStorage.removeItem(STORAGE_KEY);
};
