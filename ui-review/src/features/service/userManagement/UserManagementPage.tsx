import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Edit3,
  KeyRound,
  Lock,
  LockOpen,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import ServiceModeShell from "../shared/ServiceModeShell";
import {
  createUser,
  deleteUser,
  getUserManagementSnapshot,
  getNextUserCode,
  resetUserPassword,
  updateRole,
  updateUser,
  type UserAccount,
  type UserAccountPayload,
  type UserManagementSnapshot,
  type UserRole,
  type UserStatus,
} from "../../../lib/userManagementApi";

type TabKey = "users" | "roles";
type ModalState =
  | { mode: "create"; initialValue: UserAccountPayload }
  | { mode: "edit"; user: UserAccount };

const ALL = "all";

const STATUS_LABELS: Record<UserStatus, string> = {
  active: "启用",
  locked: "锁定",
  disabled: "停用",
};

const STATUS_STYLES: Record<UserStatus, string> = {
  active: "bg-[#E8F5E9] text-[#1B5E20] border-[#C8E6C9]",
  locked: "bg-[#FFF3E0] text-[#E65100] border-[#FFE0B2]",
  disabled: "bg-[#ECEFF1] text-[#546E7A] border-[#CFD8DC]",
};

const PERMISSIONS = [
  { code: "scan.view", label: "检查查看", group: "扫描流程" },
  { code: "scan.execute", label: "执行扫描", group: "扫描流程" },
  { code: "patient.manage", label: "患者维护", group: "扫描流程" },
  { code: "protocol.view", label: "协议查看", group: "协议与剂量" },
  { code: "protocol.manage", label: "协议维护", group: "协议与剂量" },
  { code: "dose.manage", label: "剂量设置", group: "协议与剂量" },
  { code: "service.hardware", label: "硬件服务", group: "服务模式" },
  { code: "system.settings", label: "系统设置", group: "服务模式" },
  { code: "user.manage", label: "用户管理", group: "安全审计" },
  { code: "reports.view", label: "报告查看", group: "安全审计" },
  { code: "audit.view", label: "审计查看", group: "安全审计" },
];

const PERMISSION_GROUPS = Array.from(new Set(PERMISSIONS.map((permission) => permission.group)));

const formFromUser = (user: UserAccount): UserAccountPayload => ({
  username: user.username,
  display_name: user.display_name,
  employee_id: user.employee_id ?? "",
  department: user.department ?? "",
  title: user.title ?? "",
  role_code: user.role_code,
  status: user.status,
  phone: user.phone ?? "",
  email: user.email ?? "",
  login_allowed: user.login_allowed,
  password_reset_required: user.password_reset_required,
  failed_attempts: user.failed_attempts,
});

const generateFallbackUserCode = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `U${y}${m}${d}${rand}`;
};

const blankUserForm = (roles: UserRole[], accountCode: string): UserAccountPayload => ({
  username: accountCode,
  display_name: "",
  employee_id: accountCode,
  department: "",
  title: "",
  role_code: roles.find((role) => role.code === "technologist")?.code ?? roles[0]?.code ?? "",
  status: "active",
  phone: "",
  email: "",
  login_allowed: true,
  password_reset_required: true,
  failed_attempts: 0,
});

const formatDateTime = (value: string | null): string => {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const normalizeText = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
const FORM_INPUT_CLASS = "h-10 w-full rounded-md border border-[#D6E2EF] bg-white px-3 text-[13px] font-semibold text-[#263238] outline-none transition focus:border-[#4D94FF] focus:ring-2 focus:ring-[#4D94FF]/15";

export default function UserManagementPage() {
  const [snapshot, setSnapshot] = useState<UserManagementSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("users");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | typeof ALL>(ALL);
  const [roleFilter, setRoleFilter] = useState<string>(ALL);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedRoleCode, setSelectedRoleCode] = useState("");
  const [roleDraft, setRoleDraft] = useState<Set<string>>(new Set());
  const [roleDirty, setRoleDirty] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);
  const toastTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUserManagementSnapshot();
      setSnapshot(data);
      setSelectedUserId((current) => (current && data.users.some((user) => user.id === current) ? current : data.users[0]?.id ?? null));
      setSelectedRoleCode((current) => (current && data.roles.some((role) => role.code === current) ? current : data.roles[0]?.code ?? ""));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "用户管理数据加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const users = snapshot?.users ?? [];
  const roles = snapshot?.roles ?? [];
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;
  const selectedRole = roles.find((role) => role.code === selectedRoleCode) ?? roles[0] ?? null;
  const selectedRolePermissionKey = selectedRole?.permissions.join("|") ?? "";

  useEffect(() => {
    if (!selectedRole) return;
    setRoleDraft(new Set(selectedRole.permissions));
    setRoleDirty(false);
  }, [selectedRole?.code, selectedRolePermissionKey, selectedRole]);

  const filteredUsers = useMemo(() => {
    const q = normalizeText(searchText);
    return users.filter((user) => {
      const matchesStatus = statusFilter === ALL || user.status === statusFilter;
      const matchesRole = roleFilter === ALL || user.role_code === roleFilter;
      const haystack = [
        user.username,
        user.display_name,
        user.employee_id,
        user.department,
        user.title,
        user.role_name,
      ].map(normalizeText).join(" ");
      return matchesStatus && matchesRole && (!q || haystack.includes(q));
    });
  }, [roleFilter, searchText, statusFilter, users]);

  const replaceUser = (updated: UserAccount) => {
    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        users: current.users.map((user) => (user.id === updated.id ? updated : user)),
      };
    });
  };

  const handleUserSubmit = async (payload: UserAccountPayload) => {
    setSaving(true);
    try {
      if (modal?.mode === "create") {
        const saved = await createUser(payload);
        setSnapshot((current) => current ? { ...current, users: [...current.users, saved] } : current);
        setSearchText("");
        setRoleFilter(ALL);
        setStatusFilter(ALL);
        setSelectedUserId(saved.id);
        setModal(null);
        showToast("用户已新增");
        await loadSnapshot();
        setSelectedUserId(saved.id);
        return;
      }
      if (modal?.mode === "edit") {
        const saved = await updateUser(modal.user.id, payload);
        replaceUser(saved);
        setModal(null);
        showToast("用户信息已保存");
        await loadSnapshot();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickUpdate = async (user: UserAccount, patch: Partial<UserAccountPayload>, message: string) => {
    setSaving(true);
    try {
      const saved = await updateUser(user.id, patch);
      replaceUser(saved);
      showToast(message);
      await loadSnapshot();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "操作失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleResetCredential = async (user: UserAccount) => {
    setSaving(true);
    try {
      const saved = await resetUserPassword(user.id);
      replaceUser(saved);
      showToast("凭证已重置");
      await loadSnapshot();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "重置失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteUser(deleteTarget.id);
      setSnapshot((current) => {
        if (!current) return current;
        const nextUsers = current.users.filter((user) => user.id !== deleteTarget.id);
        return { ...current, users: nextUsers };
      });
      setSelectedUserId((current) => (current === deleteTarget.id ? users.find((user) => user.id !== deleteTarget.id)?.id ?? null : current));
      setDeleteTarget(null);
      showToast("用户已删除");
      await loadSnapshot();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const openCreateUser = async () => {
    let accountCode = generateFallbackUserCode();
    try {
      const generated = await getNextUserCode();
      accountCode = generated.code;
    } catch {
      // Keep the modal usable if the preview endpoint is temporarily unavailable.
    }
    setModal({ mode: "create", initialValue: blankUserForm(roles, accountCode) });
  };

  const togglePermission = (code: string) => {
    setRoleDraft((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setRoleDirty(true);
  };

  const handleSaveRole = async () => {
    if (!selectedRole) return;
    setRoleSaving(true);
    try {
      const saved = await updateRole(selectedRole.code, {
        name: selectedRole.name,
        description: selectedRole.description,
        permissions: Array.from(roleDraft),
      });
      setSnapshot((current) => {
        if (!current) return current;
        return {
          ...current,
          roles: current.roles.map((role) => (role.code === saved.code ? saved : role)),
        };
      });
      setRoleDirty(false);
      showToast("角色权限已保存");
      await loadSnapshot();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存角色失败", "error");
    } finally {
      setRoleSaving(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <ServiceModeShell currentRoute="/service/settings/user-management" footerStatus={{ label: "IDLE", tone: "idle" }}>
        <section className="flex h-full items-center justify-center bg-white text-[14px] font-bold text-[#90A4AE]">
          用户管理加载中...
        </section>
      </ServiceModeShell>
    );
  }

  return (
    <ServiceModeShell currentRoute="/service/settings/user-management" footerStatus={{ label: "IDLE", tone: "idle" }}>
      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F6F9FC]">
        <div className="shrink-0 border-b border-[#E2EBF5] bg-[#F8FBFF] px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 rounded-md border border-[#D6E2EF] bg-white p-1">
              <TabButton active={activeTab === "users"} icon={Users} label="用户账号" onClick={() => setActiveTab("users")} />
              <TabButton active={activeTab === "roles"} icon={ShieldCheck} label="角色权限" onClick={() => setActiveTab("roles")} />
            </div>
            {activeTab === "users" && (
              <button
                type="button"
                onClick={() => void openCreateUser()}
                disabled={!roles.length || saving}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[#1E88E5] px-3 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-[#1565C0] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <UserPlus size={14} />
                新增用户
              </button>
            )}
          </div>
          {activeTab === "users" && (
            <div className="mt-2 flex items-center gap-2">
              <SelectBox value={roleFilter} onChange={setRoleFilter}>
                <option value={ALL}>全部角色</option>
                {roles.map((role) => (
                  <option key={role.code} value={role.code}>{role.name}</option>
                ))}
              </SelectBox>
              <SelectBox value={statusFilter} onChange={(value) => setStatusFilter(value as UserStatus | typeof ALL)}>
                <option value={ALL}>全部状态</option>
                <option value="active">启用</option>
                <option value="locked">锁定</option>
                <option value="disabled">停用</option>
              </SelectBox>
              <div className="relative min-w-[180px] flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="搜索姓名、账号、工号..."
                  className="h-9 w-full rounded-md border border-[#D6E2EF] bg-white pl-9 pr-3 text-[13px] text-[#263238] outline-none transition focus:border-[#4D94FF] focus:ring-2 focus:ring-[#4D94FF]/15"
                />
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab === "users" ? (
            <UsersPanel
              users={filteredUsers}
              selectedUser={selectedUser}
              roles={roles}
              onSelect={setSelectedUserId}
              onEdit={(user) => setModal({ mode: "edit", user })}
              onDelete={setDeleteTarget}
              onReset={handleResetCredential}
              onQuickUpdate={handleQuickUpdate}
              saving={saving}
            />
          ) : (
            <RolesPanel
              roles={roles}
              selectedRole={selectedRole}
              selectedRoleCode={selectedRoleCode}
              roleDraft={roleDraft}
              roleDirty={roleDirty}
              roleSaving={roleSaving}
              onSelectRole={setSelectedRoleCode}
              onTogglePermission={togglePermission}
              onSaveRole={handleSaveRole}
            />
          )}
        </div>

        {toast && (
          <div
            className={`absolute right-5 top-[78px] z-30 flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-bold shadow-lg ${
              toast.tone === "success"
                ? "border-[#C8E6C9] bg-[#E8F5E9] text-[#1B5E20]"
                : "border-[#FFCDD2] bg-[#FFEBEE] text-[#C62828]"
            }`}
          >
            {toast.tone === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {toast.message}
          </div>
        )}
      </section>

      {modal && (
        <UserFormModal
          mode={modal.mode}
          initialValue={modal.mode === "create" ? modal.initialValue : formFromUser(modal.user)}
          roles={roles}
          saving={saving}
          onClose={() => setModal(null)}
          onSubmit={handleUserSubmit}
        />
      )}

      {deleteTarget && (
        <ConfirmDelete
          user={deleteTarget}
          saving={saving}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </ServiceModeShell>
  );
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-bold transition-all ${
        active ? "bg-[#1E88E5] text-white shadow-sm" : "bg-transparent text-[#607D8B] hover:bg-[#F1F6FC]"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function SelectBox({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-[112px] appearance-none rounded-md border border-[#D6E2EF] bg-white pl-3 pr-8 text-[13px] font-semibold text-[#37474F] outline-none transition focus:border-[#4D94FF]"
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#90A4AE]" />
    </div>
  );
}

function UsersPanel({
  users,
  selectedUser,
  roles,
  onSelect,
  onEdit,
  onDelete,
  onReset,
  onQuickUpdate,
  saving,
}: {
  users: UserAccount[];
  selectedUser: UserAccount | null;
  roles: UserRole[];
  onSelect: (id: number) => void;
  onEdit: (user: UserAccount) => void;
  onDelete: (user: UserAccount) => void;
  onReset: (user: UserAccount) => void;
  onQuickUpdate: (user: UserAccount, patch: Partial<UserAccountPayload>, message: string) => void;
  saving: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-[#E2EBF5] bg-white">
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full table-fixed text-[13px]">
            <colgroup>
              <col style={{ width: "140px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "60px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "118px" }} />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-[#E2EBF5] bg-[#F5F8FC] text-[11px] font-black uppercase tracking-wide text-[#78909C] shadow-sm">
              <tr>
                <th className="px-3 py-3 text-left">用户</th>
                <th className="px-3 py-3 text-left">工号 / 科室</th>
                <th className="px-3 py-3 text-left">角色</th>
                <th className="px-3 py-3 text-left">状态</th>
                <th className="px-3 py-3 text-left">登录控制</th>
                <th className="px-3 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F9]">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-[13px] font-bold text-[#90A4AE]">
                    暂无匹配用户
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => onSelect(user.id)}
                    className={`cursor-pointer transition-colors hover:bg-[#F5F9FF] ${
                      selectedUser?.id === user.id ? "bg-[#EAF3FF]" : "bg-white"
                    }`}
                  >
                    <td className="px-3 py-3">
                      <div className="truncate text-[13px] font-black text-[#1A2332]" title={user.display_name}>{user.display_name}</div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-[#78909C]" title={user.username}>{user.username}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="truncate text-[12px] font-bold text-[#546E7A]" title={user.employee_id ?? ""}>{user.employee_id ?? "未登记"}</div>
                      <div className="mt-0.5 truncate text-[11px] text-[#90A4AE]" title={user.department ?? ""}>{user.department ?? "未分配"}</div>
                    </td>
                    <td className="px-3 py-3">
                      <RoleBadge role={roles.find((role) => role.code === user.role_code)} fallback={user.role_name ?? user.role_code} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-3 py-3">
                      <ControlPill active={user.login_allowed} label={user.login_allowed ? "允许" : "禁止"} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton title="删除" icon={Trash2} tone="danger" disabled={saving} onClick={(event) => { event.stopPropagation(); onDelete(user); }} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex h-10 shrink-0 items-center justify-between border-t border-[#E2EBF5] bg-[#F8FBFF] px-4 text-[12px] text-[#78909C]">
          <span>共 <b className="text-[#263238]">{users.length}</b> 个用户</span>
          <span>账号状态变更写入系统日志</span>
        </div>
      </div>

      <UserDetailPanel user={selectedUser} roles={roles} onEdit={onEdit} onQuickUpdate={onQuickUpdate} onReset={onReset} saving={saving} />
    </div>
  );
}

function UserDetailPanel({
  user,
  roles,
  onEdit,
  onQuickUpdate,
  onReset,
  saving,
}: {
  user: UserAccount | null;
  roles: UserRole[];
  onEdit: (user: UserAccount) => void;
  onQuickUpdate: (user: UserAccount, patch: Partial<UserAccountPayload>, message: string) => void;
  onReset: (user: UserAccount) => void;
  saving: boolean;
}) {
  if (!user) {
    return (
      <aside className="flex w-[240px] shrink-0 items-center justify-center bg-[#F8FBFF] px-5 text-center text-[13px] font-bold text-[#90A4AE]">
        未选择用户
      </aside>
    );
  }

  const role = roles.find((item) => item.code === user.role_code);
  const rolePermissions = role?.permissions ?? [];

  return (
    <aside className="flex w-[240px] shrink-0 flex-col overflow-y-auto bg-[#F8FBFF] p-3 custom-scrollbar">
      <div className="rounded-md border border-[#DDEAF8] bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[17px] font-black leading-tight text-[#1A2332]">{user.display_name}</div>
            <div className="mt-1 font-mono text-[12px] text-[#78909C]">{user.username}</div>
          </div>
          <StatusBadge status={user.status} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <RoleBadge role={role} fallback={user.role_name ?? user.role_code} />
          {user.password_reset_required && (
            <span className="rounded-full bg-[#FFEBEE] px-2 py-1 text-[11px] font-bold text-[#C62828]">需改密</span>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-[#DDEAF8] bg-white p-4">
        <div className="mb-3 text-[12px] font-black uppercase tracking-wide text-[#78909C]">登录访问</div>
        <DetailRow label="登录权限" value={user.login_allowed ? "允许登录" : "禁止登录"} />
        <DetailRow label="失败次数" value={`${user.failed_attempts} 次`} />
        <DetailRow label="最后登录" value={formatDateTime(user.last_login_at)} />
        <DetailRow label="凭证更新" value={formatDateTime(user.password_updated_at)} />
        {user.locked_at && <DetailRow label="锁定时间" value={formatDateTime(user.locked_at)} />}
      </div>

      <div className="mt-3 rounded-md border border-[#DDEAF8] bg-white p-4">
        <div className="mb-3 text-[12px] font-black uppercase tracking-wide text-[#78909C]">角色权限</div>
        <div className="flex flex-wrap gap-1.5">
          {rolePermissions.slice(0, 8).map((permission) => (
            <span key={permission} className="rounded-md bg-[#EEF6FF] px-2 py-1 text-[11px] font-bold text-[#1565C0]">
              {PERMISSIONS.find((item) => item.code === permission)?.label ?? permission}
            </span>
          ))}
          {rolePermissions.length > 8 && (
            <span className="rounded-md bg-[#ECEFF1] px-2 py-1 text-[11px] font-bold text-[#607D8B]">+{rolePermissions.length - 8}</span>
          )}
        </div>
      </div>

      <div className="mt-auto pt-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onEdit(user)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#CFD8DC] bg-white text-[12px] font-bold text-[#37474F] hover:bg-[#F5F9FF]"
          >
            <Edit3 size={14} />
            编辑
          </button>
          <button
            type="button"
            onClick={() => onReset(user)}
            disabled={saving}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#CFD8DC] bg-white text-[12px] font-bold text-[#37474F] hover:bg-[#F5F9FF] disabled:opacity-40"
          >
            <KeyRound size={14} />
            重置
          </button>
          <button
            type="button"
            onClick={() => onQuickUpdate(user, { status: user.status === "disabled" ? "active" : "disabled", login_allowed: user.status === "disabled" }, user.status === "disabled" ? "用户已启用" : "用户已停用")}
            disabled={saving}
            className="col-span-2 flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#1E88E5] text-[12px] font-bold text-white hover:bg-[#1565C0] disabled:opacity-40"
          >
            {user.status === "disabled" ? <LockOpen size={14} /> : <Lock size={14} />}
            {user.status === "disabled" ? "启用账号" : "停用账号"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function RolesPanel({
  roles,
  selectedRole,
  selectedRoleCode,
  roleDraft,
  roleDirty,
  roleSaving,
  onSelectRole,
  onTogglePermission,
  onSaveRole,
}: {
  roles: UserRole[];
  selectedRole: UserRole | null;
  selectedRoleCode: string;
  roleDraft: Set<string>;
  roleDirty: boolean;
  roleSaving: boolean;
  onSelectRole: (code: string) => void;
  onTogglePermission: (code: string) => void;
  onSaveRole: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 bg-white">
      <aside className="w-[250px] shrink-0 overflow-y-auto border-r border-[#E2EBF5] bg-[#F8FBFF] p-4 custom-scrollbar">
        <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-wide text-[#78909C]">
          <ShieldCheck size={15} />
          角色列表
        </div>
        <div className="space-y-2">
          {roles.map((role) => (
            <button
              key={role.code}
              type="button"
              onClick={() => onSelectRole(role.code)}
              className={`w-full rounded-md border p-3 text-left transition-all ${
                role.code === selectedRoleCode
                  ? "border-[#90CAF9] bg-[#EAF3FF] text-[#1565C0]"
                  : "border-[#DDEAF8] bg-white text-[#37474F] hover:bg-[#F5F9FF]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-black">{role.name}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#78909C]">{role.user_count}</span>
              </div>
              <div className="mt-1 truncate text-[11px] text-[#78909C]">{role.description ?? role.code}</div>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-start justify-between border-b border-[#E2EBF5] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={18} className="text-[#1565C0]" />
              <div className="text-[17px] font-black text-[#1A2332]">{selectedRole?.name ?? "未选择角色"}</div>
            </div>
            <div className="mt-1 text-[12px] text-[#78909C]">{selectedRole?.description ?? "请选择角色"}</div>
          </div>
          <button
            type="button"
            onClick={onSaveRole}
            disabled={!roleDirty || roleSaving || !selectedRole}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[#1E88E5] px-4 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-[#1565C0] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save size={14} />
            {roleSaving ? "保存中" : "保存权限"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            {PERMISSION_GROUPS.map((group) => (
              <section key={group} className="rounded-md border border-[#DDEAF8] bg-[#F8FBFF]">
                <div className="border-b border-[#E2EBF5] px-4 py-3 text-[12px] font-black text-[#37474F]">{group}</div>
                <div className="divide-y divide-[#E2EBF5]">
                  {PERMISSIONS.filter((permission) => permission.group === group).map((permission) => (
                    <label key={permission.code} className="flex h-11 cursor-pointer items-center justify-between px-4 hover:bg-white">
                      <span>
                        <span className="block text-[13px] font-bold text-[#263238]">{permission.label}</span>
                        <span className="block font-mono text-[10px] text-[#90A4AE]">{permission.code}</span>
                      </span>
                      <Toggle checked={roleDraft.has(permission.code)} onChange={() => onTogglePermission(permission.code)} />
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span className={`inline-flex h-[24px] items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-black ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function RoleBadge({ role, fallback }: { role: UserRole | undefined; fallback: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-md bg-[#EEF6FF] px-2 py-1 text-[11px] font-black text-[#1565C0]">
      <span className="truncate">{role?.name ?? fallback}</span>
    </span>
  );
}

function ControlPill({ active, label, muted = false }: { active: boolean; label: string; muted?: boolean }) {
  const className = active && !muted ? "bg-[#E8F5E9] text-[#1B5E20]" : "bg-[#ECEFF1] text-[#607D8B]";
  return <span className={`inline-flex w-fit whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-black ${className}`}>{label}</span>;
}

function IconButton({
  icon: Icon,
  title,
  onClick,
  tone = "default",
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  const className = tone === "danger"
    ? "text-[#C62828] hover:bg-[#FFEBEE]"
    : "text-[#546E7A] hover:bg-[#EEF6FF] hover:text-[#1565C0]";
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md bg-transparent transition-all active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      <Icon size={15} />
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-[#EEF2F9] py-2 first:border-t-0 first:pt-0 last:pb-0">
      <span className="shrink-0 text-[12px] font-bold text-[#78909C]">{label}</span>
      <span className="min-w-0 text-right text-[12px] font-semibold text-[#37474F]">{value}</span>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-[#1E88E5]" : "bg-[#CBD5E1]"}`}
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}

function UserFormModal({
  mode,
  initialValue,
  roles,
  saving,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  initialValue: UserAccountPayload;
  roles: UserRole[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: UserAccountPayload) => Promise<void>;
}) {
  const [form, setForm] = useState<UserAccountPayload>(initialValue);
  const [localError, setLocalError] = useState<string | null>(null);

  const patch = <K extends keyof UserAccountPayload>(key: K, value: UserAccountPayload[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setLocalError(null);
  };

  const patchAccount = (value: string) => {
    setForm((current) => ({ ...current, username: value, employee_id: value }));
    setLocalError(null);
  };

  const submit = async () => {
    if (!form.username.trim() || !form.display_name.trim()) {
      setLocalError("账号和姓名不能为空");
      return;
    }
    if (!form.role_code) {
      setLocalError("请选择角色");
      return;
    }
    await onSubmit({
      ...form,
      username: form.username.trim(),
      employee_id: form.username.trim(),
      display_name: form.display_name.trim(),
    });
  };

  const accountInputClass = `${FORM_INPUT_CLASS} ${mode === "create" ? "bg-[#F8FBFF] text-[#607D8B]" : ""}`;
  const mirroredInputClass = `${FORM_INPUT_CLASS} bg-[#F8FBFF] text-[#607D8B]`;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0F172A]/40 backdrop-blur-[2px]">
      <div className="w-[560px] overflow-hidden rounded-md border border-[#DDEAF8] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E2EBF5] px-5 py-4">
          <div>
            <div className="text-[16px] font-black text-[#1A2332]">{mode === "create" ? "新建用户" : "编辑用户"}</div>
            <div className="mt-0.5 text-[12px] text-[#78909C]">账号信息与登录控制</div>
          </div>
          <button type="button" title="关闭" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-[#78909C] hover:bg-[#EEF2F9]">
            <X size={17} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 px-5 py-5">
          <Field label="账号">
            <input
              value={form.username}
              onChange={(event) => patchAccount(event.target.value)}
              readOnly={mode === "create"}
              className={accountInputClass}
            />
          </Field>
          <Field label="姓名">
            <input value={form.display_name} onChange={(event) => patch("display_name", event.target.value)} className={FORM_INPUT_CLASS} />
          </Field>
          <Field label="工号">
            <input value={form.username} readOnly className={mirroredInputClass} />
          </Field>
          <Field label="科室">
            <input value={form.department ?? ""} onChange={(event) => patch("department", event.target.value)} className={FORM_INPUT_CLASS} />
          </Field>
          <Field label="职务">
            <input value={form.title ?? ""} onChange={(event) => patch("title", event.target.value)} className={FORM_INPUT_CLASS} />
          </Field>
          <Field label="角色">
            <select value={form.role_code} onChange={(event) => patch("role_code", event.target.value)} className={FORM_INPUT_CLASS}>
              {roles.map((role) => (
                <option key={role.code} value={role.code}>{role.name}</option>
              ))}
            </select>
          </Field>
          <Field label="电话">
            <input value={form.phone ?? ""} onChange={(event) => patch("phone", event.target.value)} className={FORM_INPUT_CLASS} />
          </Field>
          <Field label="邮箱">
            <input value={form.email ?? ""} onChange={(event) => patch("email", event.target.value)} className={FORM_INPUT_CLASS} />
          </Field>
          <Field label="状态">
            <select value={form.status} onChange={(event) => patch("status", event.target.value as UserStatus)} className={FORM_INPUT_CLASS}>
              <option value="active">启用</option>
              <option value="locked">锁定</option>
              <option value="disabled">停用</option>
            </select>
          </Field>
          <div className="pt-6">
            <ToggleRow label="允许登录" checked={form.login_allowed} onChange={(value) => patch("login_allowed", value)} />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#E2EBF5] bg-[#F8FBFF] px-5 py-4">
          <div className="text-[12px] font-bold text-[#C62828]">{localError}</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-md border border-[#CFD8DC] bg-white px-4 text-[13px] font-bold text-[#546E7A] hover:bg-[#EEF2F9]">
              取消
            </button>
            <button type="button" onClick={submit} disabled={saving} className="flex h-9 items-center gap-1.5 rounded-md bg-[#1E88E5] px-5 text-[13px] font-bold text-white hover:bg-[#1565C0] disabled:opacity-40">
              <Save size={14} />
              {saving ? "保存中" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-black text-[#546E7A]">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex h-10 items-center justify-between rounded-md border border-[#DDEAF8] bg-[#F8FBFF] px-3">
      <span className="text-[12px] font-black text-[#37474F]">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </label>
  );
}

function ConfirmDelete({
  user,
  saving,
  onCancel,
  onConfirm,
}: {
  user: UserAccount;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0F172A]/40 backdrop-blur-[2px]">
      <div className="w-[360px] rounded-md border border-[#DDEAF8] bg-white shadow-2xl">
        <div className="flex items-start gap-3 px-5 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFEBEE] text-[#C62828]">
            <Trash2 size={16} />
          </div>
          <div>
            <div className="text-[15px] font-black text-[#1A2332]">删除用户</div>
            <div className="mt-1 text-[13px] leading-6 text-[#607D8B]">
              确认删除 <span className="font-black text-[#263238]">{user.display_name}</span>？
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#E2EBF5] bg-[#F8FBFF] px-5 py-4">
          <button type="button" onClick={onCancel} className="h-9 rounded-md border border-[#CFD8DC] bg-white px-4 text-[13px] font-bold text-[#546E7A] hover:bg-[#EEF2F9]">
            取消
          </button>
          <button type="button" onClick={onConfirm} disabled={saving} className="h-9 rounded-md bg-[#EF5350] px-4 text-[13px] font-bold text-white hover:bg-[#C62828] disabled:opacity-40">
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
