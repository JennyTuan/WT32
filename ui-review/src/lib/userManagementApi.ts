import { buildApiUrl } from "./apiClient";

export type UserStatus = "active" | "locked" | "disabled";

export type UserRole = {
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  created_at: string;
  updated_at: string | null;
  user_count: number;
};

export type UserAccount = {
  id: number;
  username: string;
  display_name: string;
  employee_id: string | null;
  department: string | null;
  title: string | null;
  role_code: string;
  role_name: string | null;
  status: UserStatus;
  phone: string | null;
  email: string | null;
  login_allowed: boolean;
  password_reset_required: boolean;
  credential_version: number;
  failed_attempts: number;
  last_login_at: string | null;
  password_updated_at: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type UserManagementSnapshot = {
  users: UserAccount[];
  roles: UserRole[];
};

export type GeneratedUserCode = {
  code: string;
};

export type UserAccountPayload = {
  username: string;
  display_name: string;
  employee_id?: string | null;
  department?: string | null;
  title?: string | null;
  role_code: string;
  status: UserStatus;
  phone?: string | null;
  email?: string | null;
  login_allowed: boolean;
  password_reset_required?: boolean;
  failed_attempts?: number;
};

export type UserRolePayload = {
  name?: string;
  description?: string | null;
  permissions?: string[];
};

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = (await response.json()) as { detail?: string };
    return new Error(data.detail || fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function getUserManagementSnapshot(): Promise<UserManagementSnapshot> {
  const response = await fetch(buildApiUrl("/api/user-management/"));
  if (!response.ok) throw await parseError(response, `Failed to load users (${response.status})`);
  return response.json();
}

export async function getNextUserCode(): Promise<GeneratedUserCode> {
  const response = await fetch(buildApiUrl("/api/user-management/next-user-code"));
  if (!response.ok) throw await parseError(response, `Failed to generate user code (${response.status})`);
  return response.json();
}

export async function createUser(payload: UserAccountPayload): Promise<UserAccount> {
  const response = await fetch(buildApiUrl("/api/user-management/users"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, `Failed to create user (${response.status})`);
  return response.json();
}

export async function updateUser(id: number, payload: Partial<UserAccountPayload>): Promise<UserAccount> {
  const response = await fetch(buildApiUrl(`/api/user-management/users/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, `Failed to update user (${response.status})`);
  return response.json();
}

export async function deleteUser(id: number): Promise<void> {
  const response = await fetch(buildApiUrl(`/api/user-management/users/${id}`), {
    method: "DELETE",
  });
  if (!response.ok) throw await parseError(response, `Failed to delete user (${response.status})`);
}

export async function resetUserPassword(id: number): Promise<UserAccount> {
  const response = await fetch(buildApiUrl(`/api/user-management/users/${id}/reset-password`), {
    method: "POST",
  });
  if (!response.ok) throw await parseError(response, `Failed to reset credential (${response.status})`);
  return response.json();
}

export async function updateRole(code: string, payload: UserRolePayload): Promise<UserRole> {
  const response = await fetch(buildApiUrl(`/api/user-management/roles/${code}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, `Failed to update role (${response.status})`);
  return response.json();
}
