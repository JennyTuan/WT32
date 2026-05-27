import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, KeyRound, ShieldCheck } from "lucide-react";

import { useAuth } from "../lib/authContext";

export default function ChangePasswordScreen() {
    const { user, changePassword, logout } = useAuth();
    const navigate = useNavigate();

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const forced = Boolean(user?.password_reset_required);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (submitting) return;
        if (newPassword.length < 6) {
            setError("新密码长度至少 6 位");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("两次输入的新密码不一致");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await changePassword(currentPassword, newPassword);
            navigate("/", { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : "修改密码失败");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#E8EAF1] via-[#F4F6FA] to-[#DCE6F2] px-8">
            <div className="w-[440px] rounded-2xl border border-[#B0C4DE] bg-white p-8 shadow-xl">
                <div className="mb-6 flex flex-col items-center">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#43A047] text-white">
                        <ShieldCheck size={28} strokeWidth={1.8} />
                    </div>
                    <h1 className="text-[20px] font-bold text-[#37474F]">
                        {forced ? "首次登录，请修改密码" : "修改密码"}
                    </h1>
                    {user && (
                        <p className="mt-1 text-[12px] text-[#90A4AE]">
                            当前账号：<span className="font-semibold text-[#546E7A]">{user.display_name} ({user.username})</span>
                        </p>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <Field
                        label="当前密码"
                        value={currentPassword}
                        onChange={setCurrentPassword}
                        disabled={submitting}
                        autoFocus
                    />
                    <Field
                        label="新密码"
                        value={newPassword}
                        onChange={setNewPassword}
                        disabled={submitting}
                        hint="至少 6 位"
                    />
                    <Field
                        label="确认新密码"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        disabled={submitting}
                    />

                    {error && (
                        <div className="flex items-center gap-2 rounded-md border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">
                            <AlertCircle size={14} />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="mt-2 flex gap-3">
                        {!forced && (
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                disabled={submitting}
                                className="flex-1 rounded-md border border-[#B0C4DE] py-2.5 text-[14px] font-semibold text-[#546E7A] hover:bg-[#F4F6FA]"
                            >
                                取消
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 rounded-md bg-[#4A6982] py-2.5 text-[14px] font-semibold tracking-wider text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                        >
                            {submitting ? "提交中…" : "确认修改"}
                        </button>
                    </div>

                    {forced && (
                        <button
                            type="button"
                            onClick={() => void logout()}
                            className="text-center text-[11px] text-[#90A4AE] underline hover:text-[#546E7A]"
                        >
                            取消并登出
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
}

type FieldProps = {
    label: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    autoFocus?: boolean;
    hint?: string;
};

function Field({ label, value, onChange, disabled, autoFocus, hint }: FieldProps) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold tracking-wider text-[#546E7A]">
                {label}
                {hint && <span className="ml-2 font-normal text-[#90A4AE]">({hint})</span>}
            </span>
            <div className="flex items-center gap-2 rounded-md border border-[#B0C4DE] bg-[#F8FAFC] px-3 py-2 focus-within:border-[#4A6982]">
                <KeyRound size={16} className="text-[#90A4AE]" />
                <input
                    type="password"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    className="w-full bg-transparent text-[14px] text-[#37474F] outline-none placeholder:text-[#B0BEC5]"
                />
            </div>
        </label>
    );
}
