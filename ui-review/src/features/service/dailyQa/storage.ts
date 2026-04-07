import type { DailyQaRecord } from "./types";

const STORAGE_KEY = "serviceDailyQaRecords";

export const loadDailyQaRecords = (): DailyQaRecord[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as DailyQaRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveDailyQaRecords = (records: DailyQaRecord[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};
