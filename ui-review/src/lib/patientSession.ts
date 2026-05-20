export type SelectedPatientSession = {
    id: number;
    serial?: number;
    patientId: string;
    name: string;
    gender: string;
    age: number;
    checkType?: string;
};

const STORAGE_KEY = "selectedPatient";

const isSelectedPatientSession = (value: unknown): value is SelectedPatientSession => {
    if (!value || typeof value !== "object") return false;
    const patient = value as Record<string, unknown>;
    return (
        typeof patient.id === "number"
        && typeof patient.patientId === "string"
        && typeof patient.name === "string"
        && typeof patient.gender === "string"
        && typeof patient.age === "number"
    );
};

export const saveSelectedPatient = (patient: SelectedPatientSession) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patient));
};

export const loadSelectedPatient = (): SelectedPatientSession | null => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as unknown;
        return isSelectedPatientSession(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

export const formatPatientCardSubtitle = (patient: SelectedPatientSession | null) => {
    if (!patient) return "ID: --";
    return `ID: ${patient.patientId}`;
};
