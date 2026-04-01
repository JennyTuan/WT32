import { loadSelectedPatient, type SelectedPatientSession } from "./patientSession";

const API_BASE_URL = (
    (import.meta.env.VITE_API_BASE_URL as string | undefined)
    ?? (import.meta.env.DEV ? "http://127.0.0.1:8000" : "")
).replace(/\/$/, "");
const STORAGE_KEY = "selectedScanSessionId";

const buildApiUrl = (path: string) => {
    if (!API_BASE_URL) return path;
    return `${API_BASE_URL}${path}`;
};

type ApiPatient = {
    id: number;
    patient_id: string;
};

export type ApiScanSessionTopogramParam = {
    id: number;
    kv: number;
    ma: number;
    scan_length: number;
    tube_angle: number;
    fov: number;
    ctdi_vol?: number | null;
    dlp?: number | null;
};

export type ApiScanSessionHelicalParam = {
    id: number;
    kv: number;
    ma: number;
    slice_thickness: number;
    pitch: number;
    rotation_time: number;
    scan_length: number;
    fov: number;
    ctdi_vol?: number | null;
    dlp?: number | null;
    auto_ma?: boolean;
    ma_min?: number | null;
    ma_max?: number | null;
};

export type ApiScanSessionAxialParam = {
    id: number;
    kv: number;
    ma: number;
    slice_thickness: number;
    slice_interval: number;
    rotation_time: number;
    scan_length: number;
    fov: number;
    ctdi_vol?: number | null;
    dlp?: number | null;
    auto_ma?: boolean;
    ma_min?: number | null;
    ma_max?: number | null;
    step_count?: number | null;
};

export type ApiScanSessionReconSeries = {
    id: number;
    recon_name: string;
    recon_type: "soft" | "bone" | "lung" | "vascular";
    kernel: string;
    matrix: number;
    window_width: number;
    window_level: number;
    slice_thickness: number;
    increment?: number | null;
};

export type ApiScanSessionFourDConfig = {
    id: number;
    breathing_mode: "free_breathing" | "gating" | "trigger";
    phase_count: number;
    acquisition_time: number;
    trigger_threshold?: number | null;
    breathing_training_param?: {
        id: number;
        training_duration: number;
        target_amplitude: number;
        tolerance_range: number;
    } | null;
};

export type ApiScanSessionSeries = {
    id: number;
    scan_session_id: number;
    template_series_id?: number | null;
    series_order: number;
    series_type: "topogram" | "helical" | "axial" | "4d";
    series_label: string;
    contrast_delay?: number | null;
    trigger_mode?: "manual" | "auto_timing" | "bolus_tracking" | null;
    tracking_threshold?: number | null;
    topogram_param?: ApiScanSessionTopogramParam | null;
    helical_param?: ApiScanSessionHelicalParam | null;
    axial_param?: ApiScanSessionAxialParam | null;
    recon_series: ApiScanSessionReconSeries[];
    fourd_config?: ApiScanSessionFourDConfig | null;
};

export type ApiScanSessionDetail = {
    id: number;
    patient_id: number;
    protocol_id: number;
    status: "draft" | "in_progress" | "completed" | "cancelled";
    session_name?: string | null;
    name: string;
    body_part: string;
    age_group: "adult" | "child" | "infant";
    patient_weight: string;
    patient_position: string;
    table_direction: string;
    scan_mode: "plain" | "contrast" | "4d";
    description?: string | null;
    series: ApiScanSessionSeries[];
};

export const saveSelectedScanSessionId = (scanSessionId: number) => {
    localStorage.setItem(STORAGE_KEY, String(scanSessionId));
};

export const loadSelectedScanSessionId = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
};

export const clearSelectedScanSessionId = () => {
    localStorage.removeItem(STORAGE_KEY);
};

const inferBirthDate = (age: number) => {
    const today = new Date();
    const birthYear = today.getFullYear() - Math.max(0, age);
    return `${birthYear}-01-01`;
};

const resolveBackendPatientId = async (selectedPatient: SelectedPatientSession) => {
    const response = await fetch(buildApiUrl("/api/patients/"));
    if (!response.ok) {
        throw new Error(`Failed to list patients: ${response.status}`);
    }

    const patients = (await response.json()) as ApiPatient[];
    const existing = patients.find((patient) => patient.patient_id === selectedPatient.patientId);
    if (existing) return existing.id;

    const createResponse = await fetch(buildApiUrl("/api/patients/"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: selectedPatient.name,
            patient_id: selectedPatient.patientId,
            gender: selectedPatient.gender,
            birth_date: inferBirthDate(selectedPatient.age),
            height: null,
            weight: null,
        }),
    });

    if (!createResponse.ok) {
        throw new Error(`Failed to create patient: ${createResponse.status}`);
    }

    const created = (await createResponse.json()) as ApiPatient;
    return created.id;
};

export const createScanSessionForSelectedPatient = async (protocolId: number, sessionName?: string) => {
    const selectedPatient = loadSelectedPatient();
    if (!selectedPatient) {
        throw new Error("No patient selected");
    }

    const backendPatientId = await resolveBackendPatientId(selectedPatient);
    const response = await fetch(buildApiUrl("/api/scan-sessions/"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            patient_id: backendPatientId,
            protocol_id: protocolId,
            session_name: sessionName ?? `${selectedPatient.name}-${Date.now()}`,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create scan session: ${response.status}`);
    }

    const scanSession = (await response.json()) as ApiScanSessionDetail;
    saveSelectedScanSessionId(scanSession.id);
    return scanSession;
};

export const fetchSelectedScanSession = async () => {
    const scanSessionId = loadSelectedScanSessionId();
    if (!scanSessionId) return null;

    return fetchScanSessionById(scanSessionId);
};

export const fetchScanSessionById = async (scanSessionId: number) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/${scanSessionId}`));
    if (!response.ok) {
        throw new Error(`Failed to fetch scan session: ${response.status}`);
    }

    return (await response.json()) as ApiScanSessionDetail;
};

type UpdatePayload = Record<string, string | number | boolean | null>;

const updateSelectedScanSessionEntity = async <T>(path: string, payload: UpdatePayload) => {
    const response = await fetch(buildApiUrl(path), {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Failed to update scan session entity: ${response.status}`);
    }

    return (await response.json()) as T;
};

export const updateSelectedScanSession = async (payload: UpdatePayload) => {
    const scanSessionId = loadSelectedScanSessionId();
    if (!scanSessionId) {
        throw new Error("No selected scan session");
    }
    return updateScanSessionById(scanSessionId, payload);
};

export const updateScanSessionById = async (scanSessionId: number, payload: UpdatePayload) =>
    updateSelectedScanSessionEntity<ApiScanSessionDetail>(`/api/scan-sessions/${scanSessionId}`, payload);

export const updateSelectedScanSessionSeries = async (sessionSeriesId: number, payload: UpdatePayload) =>
    updateSelectedScanSessionEntity<ApiScanSessionSeries>(`/api/scan-sessions/series/${sessionSeriesId}`, payload);

export const duplicateSelectedScanSessionSeries = async (sessionSeriesId: number) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/series/${sessionSeriesId}/duplicate`), {
        method: "POST",
    });

    if (!response.ok) {
        throw new Error(`Failed to duplicate scan session series: ${response.status}`);
    }

    return (await response.json()) as ApiScanSessionDetail;
};

export const deleteSelectedScanSessionSeries = async (sessionSeriesId: number) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/series/${sessionSeriesId}`), {
        method: "DELETE",
    });

    if (!response.ok) {
        throw new Error(`Failed to delete scan session series: ${response.status}`);
    }

    return (await response.json()) as ApiScanSessionDetail;
};

export const updateSelectedScanSessionTopogramParam = async (paramId: number, payload: UpdatePayload) =>
    updateSelectedScanSessionEntity<ApiScanSessionTopogramParam>(`/api/scan-sessions/topogram/${paramId}`, payload);

export const updateSelectedScanSessionHelicalParam = async (paramId: number, payload: UpdatePayload) =>
    updateSelectedScanSessionEntity<ApiScanSessionHelicalParam>(`/api/scan-sessions/helical/${paramId}`, payload);

export const updateSelectedScanSessionAxialParam = async (paramId: number, payload: UpdatePayload) =>
    updateSelectedScanSessionEntity<ApiScanSessionAxialParam>(`/api/scan-sessions/axial/${paramId}`, payload);

export const updateSelectedScanSessionReconSeries = async (reconId: number, payload: UpdatePayload) =>
    updateSelectedScanSessionEntity<ApiScanSessionReconSeries>(`/api/scan-sessions/recon-series/${reconId}`, payload);
