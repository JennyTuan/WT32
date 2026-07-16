import { loadSelectedPatient, type SelectedPatientSession } from "./patientSession";

import { buildApiUrl } from "./apiClient";

const STORAGE_KEY = "selectedScanSessionId";
const DETAIL_CACHE_KEY = "selectedScanSessionDetail";
const PATIENT_CACHE_KEY = "selectedBackendPatient";
const AD_HOC_SESSION_IDS_KEY = "adHocScanSessionIds";


type ApiPatient = {
    id: number;
    patient_id: string;
    age: number;
};

export type ApiScanSessionTopogramParam = {
    id: number;
    kv: number;
    ma: number;
    scan_length: number;
    tube_angle: number;
    fov: number;
    collimator?: string | null;
    scan_direction?: string | null;
    dom?: string | null;
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
    collimator?: string | null;
    scan_direction?: string | null;
    dom?: string | null;
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
    collimator?: string | null;
    scan_direction?: string | null;
    dom?: string | null;
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
    recon_fov?: number | null;
    center_x?: number | null;
    center_y?: number | null;
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

export type ApiScanSessionGatingConfig = {
    id: number;
    breathing_mode: "free_breathing" | "breath_hold_inspiration" | "breath_hold_expiration";
    target_phase?: "max_inspiration" | "max_expiration" | "custom" | null;
    threshold_normalized?: number | null;
    trigger_direction?: "rising" | "falling" | null;
    wait_timeout_s?: number | null;
    trigger_delay_ms: number;
    stability_cv_threshold: number;
    baseline_drift_mm_threshold: number;
    breath_hold_timeout_s?: number | null;
    breath_hold_amplitude_tolerance_mm?: number | null;
};

export type ApiScanSeriesImageSourceId =
    | "head-stroke-topogram"
    | "head-dual-scout-demo"
    | "brain-helical-demo"
    | "limbs-helical-demo"
    | "qin-lung-topogram"
    | "qin-lung-helical-demo"
    | "fourd-scout-demo";

export type ApiScanSeriesImageSourceVersion = 1;

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
    execution_status: "pending" | "running" | "image_ready" | "failed" | "interrupted";
    failure_reason?: string | null;
    range_confirmed: boolean;
    image_source_id?: ApiScanSeriesImageSourceId | null;
    image_source_version?: ApiScanSeriesImageSourceVersion | null;
    topogram_param?: ApiScanSessionTopogramParam | null;
    helical_param?: ApiScanSessionHelicalParam | null;
    axial_param?: ApiScanSessionAxialParam | null;
    recon_series: ApiScanSessionReconSeries[];
    fourd_config?: ApiScanSessionFourDConfig | null;
    gating_config?: ApiScanSessionGatingConfig | null;
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
    acquisition_type: "regular" | "gating" | "four_d";
    scan_mode: "plain" | "contrast" | "4d";
    description?: string | null;
    series: ApiScanSessionSeries[];
};

export type CreateAdHocScanSessionPayload = {
    source_protocol_id: number;
    session_name?: string;
    name: string;
    body_part: string;
    age_group: "adult" | "child" | "infant";
    patient_weight: string;
    patient_position: string;
    table_direction: string;
    acquisition_type?: "regular" | "gating" | "four_d";
    scan_mode?: "plain" | "contrast" | "4d";
    description?: string | null;
};

export type CreateScanSessionSeriesPayload = {
    series_order: number;
    series_type: "topogram" | "helical" | "axial" | "4d";
    series_label: string;
    contrast_delay?: number | null;
    trigger_mode?: "manual" | "auto_timing" | "bolus_tracking" | null;
    tracking_threshold?: number | null;
    topogram_param?: Partial<Omit<ApiScanSessionTopogramParam, "id">> | null;
    helical_param?: Partial<Omit<ApiScanSessionHelicalParam, "id">> | null;
    axial_param?: Partial<Omit<ApiScanSessionAxialParam, "id">> | null;
    recon_series?: Array<Partial<Omit<ApiScanSessionReconSeries, "id">>>;
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
    localStorage.removeItem(DETAIL_CACHE_KEY);
};

const readAdHocScanSessionIds = () => {
    const raw = localStorage.getItem(AD_HOC_SESSION_IDS_KEY);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value));
    } catch {
        return [];
    }
};

const writeAdHocScanSessionIds = (scanSessionIds: number[]) => {
    localStorage.setItem(AD_HOC_SESSION_IDS_KEY, JSON.stringify(Array.from(new Set(scanSessionIds))));
};

export const markAdHocScanSessionId = (scanSessionId: number) => {
    const currentIds = readAdHocScanSessionIds();
    if (currentIds.includes(scanSessionId)) return;
    writeAdHocScanSessionIds([...currentIds, scanSessionId]);
};

export const isAdHocScanSessionId = (scanSessionId: number) => {
    return readAdHocScanSessionIds().includes(scanSessionId);
};

const readCachedSelectedScanSession = () => {
    const scanSessionId = loadSelectedScanSessionId();
    if (!scanSessionId) return null;

    const raw = localStorage.getItem(DETAIL_CACHE_KEY);
    if (!raw) return null;

    try {
        const cached = JSON.parse(raw) as ApiScanSessionDetail;
        return cached.id === scanSessionId ? cached : null;
    } catch {
        return null;
    }
};

const cacheSelectedScanSession = (scanSession: ApiScanSessionDetail) => {
    saveSelectedScanSessionId(scanSession.id);
    localStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(scanSession));
};

export const cacheScanSessionIfSelected = (scanSession: ApiScanSessionDetail) => {
    if (loadSelectedScanSessionId() === scanSession.id) {
        cacheSelectedScanSession(scanSession);
    }
};

const cacheBackendPatientId = (patientId: string, backendPatientId: number) => {
    localStorage.setItem(PATIENT_CACHE_KEY, JSON.stringify({ patientId, backendPatientId }));
};

const clearCachedBackendPatientId = () => {
    localStorage.removeItem(PATIENT_CACHE_KEY);
};

const resolveBackendPatientId = async (selectedPatient: SelectedPatientSession) => {
    const response = await fetch(
        buildApiUrl(`/api/patients/lookup/${encodeURIComponent(selectedPatient.patientId)}`)
    );
    if (response.ok) {
        const existing = (await response.json()) as ApiPatient;
        cacheBackendPatientId(selectedPatient.patientId, existing.id);
        return existing.id;
    }
    if (response.status !== 404) {
        throw new Error(`Failed to lookup patient: ${response.status}`);
    }

    clearCachedBackendPatientId();
    const createResponse = await fetch(buildApiUrl("/api/patients/"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: selectedPatient.name,
            patient_id: selectedPatient.patientId,
            gender: selectedPatient.gender,
            age: selectedPatient.age,
            birth_date: null,
            height: null,
            weight: null,
        }),
    });

    if (!createResponse.ok) {
        throw new Error(`Failed to create patient: ${createResponse.status}`);
    }

    const created = (await createResponse.json()) as ApiPatient;
    cacheBackendPatientId(selectedPatient.patientId, created.id);
    return created.id;
};

export const createAdHocScanSessionForSelectedPatient = async (payload: CreateAdHocScanSessionPayload) => {
    const selectedPatient = loadSelectedPatient();
    if (!selectedPatient) {
        throw new Error("No patient selected");
    }

    const backendPatientId = await resolveBackendPatientId(selectedPatient);
    const response = await fetch(buildApiUrl("/api/scan-sessions/ad-hoc"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            patient_id: backendPatientId,
            ...payload,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create ad hoc scan session: ${response.status}`);
    }

    const scanSession = (await response.json()) as ApiScanSessionDetail;
    markAdHocScanSessionId(scanSession.id);
    cacheSelectedScanSession(scanSession);
    return scanSession;
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
    cacheSelectedScanSession(scanSession);
    return scanSession;
};

export const fetchSelectedScanSession = async (options?: { preferCache?: boolean }) => {
    const scanSessionId = loadSelectedScanSessionId();
    if (!scanSessionId) return null;

    if (options?.preferCache !== false) {
        const cached = readCachedSelectedScanSession();
        if (cached) return cached;
    }

    return fetchScanSessionById(scanSessionId);
};

export const fetchScanSessionById = async (scanSessionId: number) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/${scanSessionId}`));
    if (!response.ok) {
        throw new Error(`Failed to fetch scan session: ${response.status}`);
    }

    const scanSession = (await response.json()) as ApiScanSessionDetail;
    if (loadSelectedScanSessionId() === scanSession.id) {
        cacheSelectedScanSession(scanSession);
    }
    return scanSession;
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
    updateSelectedScanSessionEntity<ApiScanSessionDetail>(`/api/scan-sessions/${scanSessionId}`, payload).then((scanSession) => {
        if (loadSelectedScanSessionId() === scanSession.id) {
            cacheSelectedScanSession(scanSession);
        }
        return scanSession;
    });

export const createScanSessionSeries = async (scanSessionId: number, payload: CreateScanSessionSeriesPayload) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/${scanSessionId}/series`), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Failed to create scan session series: ${response.status}`);
    }

    const scanSession = (await response.json()) as ApiScanSessionDetail;
    if (loadSelectedScanSessionId() === scanSession.id) {
        cacheSelectedScanSession(scanSession);
    }
    return scanSession;
};

export const updateSelectedScanSessionSeries = async (sessionSeriesId: number, payload: UpdatePayload) =>
    updateSelectedScanSessionEntity<ApiScanSessionSeries>(`/api/scan-sessions/series/${sessionSeriesId}`, payload);

export const updateScanSessionSeriesExecution = async (
    sessionSeriesId: number,
    payload: {
        execution_status?: "pending" | "running" | "image_ready" | "failed" | "interrupted";
        failure_reason?: string | null;
        range_confirmed?: boolean;
        image_source_id?: ApiScanSeriesImageSourceId | null;
        image_source_version?: ApiScanSeriesImageSourceVersion | null;
    },
) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/series/${sessionSeriesId}/execution`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail || `Failed to update scan series execution: ${response.status}`);
    }
    const updatedSeries = (await response.json()) as ApiScanSessionSeries;
    const cachedSession = readCachedSelectedScanSession();
    if (cachedSession?.id === updatedSeries.scan_session_id) {
        cacheSelectedScanSession({
            ...cachedSession,
            series: cachedSession.series.map((series) => series.id === updatedSeries.id ? updatedSeries : series),
        });
    }
    return updatedSeries;
};

export const duplicateSelectedScanSessionSeries = async (sessionSeriesId: number) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/series/${sessionSeriesId}/duplicate`), {
        method: "POST",
    });

    if (!response.ok) {
        throw new Error(`Failed to duplicate scan session series: ${response.status}`);
    }

    const scanSession = (await response.json()) as ApiScanSessionDetail;
    if (loadSelectedScanSessionId() === scanSession.id) {
        cacheSelectedScanSession(scanSession);
    }
    return scanSession;
};

export const deleteSelectedScanSessionSeries = async (sessionSeriesId: number) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/series/${sessionSeriesId}`), {
        method: "DELETE",
    });

    if (!response.ok) {
        throw new Error(`Failed to delete scan session series: ${response.status}`);
    }

    const scanSession = (await response.json()) as ApiScanSessionDetail;
    if (loadSelectedScanSessionId() === scanSession.id) {
        cacheSelectedScanSession(scanSession);
    }
    return scanSession;
};

export const createScanSessionReconSeries = async (sessionSeriesId: number, payload: {
    recon_name?: string;
    recon_type?: "soft" | "bone" | "lung" | "vascular";
    kernel?: string;
    matrix?: number;
    window_width?: number;
    window_level?: number;
    slice_thickness?: number;
    increment?: number | null;
    recon_fov?: number | null;
}) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/series/${sessionSeriesId}/recon-series`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Failed to create recon series: ${response.status}`);
    const scanSession = (await response.json()) as ApiScanSessionDetail;
    if (loadSelectedScanSessionId() === scanSession.id) cacheSelectedScanSession(scanSession);
    return scanSession;
};

export const deleteSelectedScanSessionReconSeries = async (reconId: number) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/recon-series/${reconId}`), {
        method: "DELETE",
    });
    if (!response.ok) throw new Error(`Failed to delete recon series: ${response.status}`);
    const scanSession = (await response.json()) as ApiScanSessionDetail;
    if (loadSelectedScanSessionId() === scanSession.id) cacheSelectedScanSession(scanSession);
    return scanSession;
};

export const updateSelectedScanSessionTopogramParam = async (paramId: number, payload: UpdatePayload) =>
    updateSelectedScanSessionEntity<ApiScanSessionTopogramParam>(`/api/scan-sessions/topogram/${paramId}`, payload);

export const updateSelectedScanSessionHelicalParam = async (paramId: number, payload: UpdatePayload) =>
    updateSelectedScanSessionEntity<ApiScanSessionHelicalParam>(`/api/scan-sessions/helical/${paramId}`, payload);

export const updateSelectedScanSessionAxialParam = async (paramId: number, payload: UpdatePayload) =>
    updateSelectedScanSessionEntity<ApiScanSessionAxialParam>(`/api/scan-sessions/axial/${paramId}`, payload);

export const updateSelectedScanSessionReconSeries = async (reconId: number, payload: UpdatePayload) =>
    updateSelectedScanSessionEntity<ApiScanSessionReconSeries>(`/api/scan-sessions/recon-series/${reconId}`, payload);

export const startScanSession = async (scanSessionId: number) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/${scanSessionId}/start`), {
        method: "POST",
    });
    if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail || `Failed to start scan session: ${response.status}`);
    }
    const scanSession = (await response.json()) as ApiScanSessionDetail;
    if (loadSelectedScanSessionId() === scanSession.id) cacheSelectedScanSession(scanSession);
    return scanSession;
};

export const completeScanSession = async (scanSessionId: number) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/${scanSessionId}/complete`), {
        method: "POST",
    });
    if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail || `Failed to complete scan session: ${response.status}`);
    }
    const scanSession = (await response.json()) as ApiScanSessionDetail;
    if (loadSelectedScanSessionId() === scanSession.id) cacheSelectedScanSession(scanSession);
    return scanSession;
};

export const cancelScanSession = async (scanSessionId: number) => {
    const response = await fetch(buildApiUrl(`/api/scan-sessions/${scanSessionId}/cancel`), {
        method: "POST",
    });
    if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail || `Failed to cancel scan session: ${response.status}`);
    }
    const scanSession = (await response.json()) as ApiScanSessionDetail;
    if (loadSelectedScanSessionId() === scanSession.id) cacheSelectedScanSession(scanSession);
    return scanSession;
};
