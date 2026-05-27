import { apiFetch } from "./apiClient";

export type InstitutionType = "hospital" | "clinic" | "imaging_center" | "research" | "other";

export type InstitutionInfo = {
  name: string;
  short_name: string;
  code: string;
  type: InstitutionType;
  license_number: string;
  website: string;
  logo_url: string;
  stamp_url: string;
};

export type ContactInfo = {
  address: string;
  city: string;
  postal_code: string;
  phone: string;
  fax: string;
  email: string;
  emergency_phone: string;
};

export type DepartmentInfo = {
  name: string;
  code: string;
  head: string;
  head_title: string;
  phone: string;
  room: string;
};

export type ReportDisplay = {
  header_text: string;
  footer_text: string;
  show_logo: boolean;
  show_stamp: boolean;
  show_qr_code: boolean;
  confidential_label: string;
};

export type OrganizationInfoSnapshot = {
  updated_at: string;
  institution: InstitutionInfo;
  contact: ContactInfo;
  department: DepartmentInfo;
  report: ReportDisplay;
};

async function parseError(res: Response, fallback: string): Promise<Error> {
  try {
    const data = await res.json();
    return new Error(data?.detail ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function getOrganizationInfo(): Promise<OrganizationInfoSnapshot> {
  const res = await apiFetch("/api/organization-info/");
  if (!res.ok) throw await parseError(res, `Failed to load organization info (${res.status})`);
  return res.json();
}

export async function updateOrganizationInfo(payload: OrganizationInfoSnapshot): Promise<OrganizationInfoSnapshot> {
  const res = await apiFetch("/api/organization-info/", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseError(res, `Failed to update organization info (${res.status})`);
  return res.json();
}

export async function resetOrganizationInfo(): Promise<OrganizationInfoSnapshot> {
  const res = await apiFetch("/api/organization-info/reset", { method: "POST" });
  if (!res.ok) throw await parseError(res, `Failed to reset organization info (${res.status})`);
  return res.json();
}
