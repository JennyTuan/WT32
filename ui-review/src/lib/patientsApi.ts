import { buildApiUrl } from "./apiClient";

export type ApiPatient = {
    id: number;
    name: string;
    last_name: string | null;
    first_name: string | null;
    patient_id: string;
    id_number: string | null;
    gender: string;
    age: number;
    birth_date: string | null; // YYYY-MM-DD
    height: number | null;
    weight: number | null;
    created_at: string;
    latest_scan_status: "draft" | "in_progress" | "completed" | "cancelled" | null;
    latest_scan_session_id: number | null;
    latest_scan_acquisition_type: "regular" | "gating" | "four_d" | null;
    latest_scan_mode: "plain" | "contrast" | "4d" | null;
    latest_scan_name: string | null;
    latest_scan_completed_at: string | null;
};

export type CreatePatientPayload = {
    last_name?: string;
    first_name?: string;
    name?: string;
    patient_id: string;
    id_number?: string;
    gender: string;
    age: number;
    birth_date?: string | null;
    height?: number | null;
    weight?: number | null;
};

export async function listPatients(): Promise<ApiPatient[]> {
    const res = await fetch(buildApiUrl("/api/patients/"));
    if (!res.ok) throw new Error(`Failed to list patients (${res.status})`);
    return res.json();
}

export async function createPatient(payload: CreatePatientPayload): Promise<ApiPatient> {
    const res = await fetch(buildApiUrl("/api/patients/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        let detail = "";
        try {
            const body = await res.json();
            detail = body?.detail ?? "";
        } catch {
            // ignore
        }
        throw new Error(detail || `Failed to create patient (${res.status})`);
    }
    return res.json();
}

export function calcAgeFromBirthDate(birthDate: string): number {
    const [year, month, day] = birthDate.split("-").map(Number);
    const dob = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDelta = today.getMonth() - dob.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
        age -= 1;
    }
    return Math.max(0, age);
}

export function mapGenderToZh(gender: string): string {
    const g = gender.toLowerCase();
    if (g === "male" || g === "m" || g === "男") return "男";
    if (g === "female" || g === "f" || g === "女") return "女";
    return gender;
}

export function mapStatusToZh(status: ApiPatient["latest_scan_status"]): "待进行" | "已完成" | "已终止" {
    if (status === "completed") return "已完成";
    if (status === "cancelled") return "已终止";
    return "待进行"; // null / draft / in_progress
}
