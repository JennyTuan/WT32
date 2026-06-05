import { apiFetch } from "./apiClient";

export type CurrentUser = {
  id: number;
  username: string;
  display_name: string;
  employee_id: string | null;
  department: string | null;
  title: string | null;
  role_code: string;
  role_name: string | null;
  status: string;
  login_allowed: boolean;
  password_reset_required: boolean;
  last_login_at: string | null;
};

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = (await response.json()) as { detail?: string };
    return new Error(data.detail || fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function login(username: string, password: string): Promise<CurrentUser> {
  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw await parseError(response, "登录失败");
  return response.json();
}

export async function emergencyLogin(): Promise<CurrentUser> {
  const response = await apiFetch("/api/auth/emergency-login", { method: "POST" });
  if (!response.ok) throw await parseError(response, "紧急登录失败");
  return response.json();
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

export async function fetchMe(): Promise<CurrentUser | null> {
  const response = await apiFetch("/api/auth/me");
  if (response.status === 401) return null;
  if (!response.ok) throw await parseError(response, "获取当前用户失败");
  return response.json();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<CurrentUser> {
  const response = await apiFetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!response.ok) throw await parseError(response, "修改密码失败");
  return response.json();
}
