import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, User as UserIcon, KeyRound, AlertCircle } from "lucide-react";

import { useAuth } from "../lib/authContext";
import { useI18n } from "../lib/i18nContext";

type LocationState = { from?: string } | null;

export default function LoginScreen() {
    const { login } = useAuth();
    const { t } = useI18n();
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as LocationState)?.from || "/";

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (submitting) return;
        if (!username.trim() || !password) {
            setError(t("login.errorMissing"));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const user = await login(username.trim(), password);
            navigate(user.password_reset_required ? "/change-password" : from, { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : t("login.errorFailed"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#E8EAF1] via-[#F4F6FA] to-[#DCE6F2] px-8">
            <div className="w-[420px] rounded-2xl border border-[#B0C4DE] bg-white p-8 shadow-xl">
                <div className="mb-6 flex flex-col items-center">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#4A6982] text-white">
                        <UserIcon size={28} strokeWidth={1.8} />
                    </div>
                    <h1 className="text-[20px] font-bold text-[#37474F]">{t("login.title")}</h1>
                    <p className="mt-1 text-[12px] text-[#90A4AE]">{t("login.subtitle")}</p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-semibold tracking-wider text-[#546E7A]">{t("login.username")}</span>
                        <div className="flex items-center gap-2 rounded-md border border-[#B0C4DE] bg-[#F8FAFC] px-3 py-2 focus-within:border-[#4A6982]">
                            <UserIcon size={16} className="text-[#90A4AE]" />
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder={t("login.usernamePlaceholder")}
                                autoComplete="username"
                                disabled={submitting}
                                className="w-full bg-transparent text-[14px] text-[#37474F] outline-none placeholder:text-[#B0BEC5]"
                                autoFocus
                            />
                        </div>
                    </label>

                    <label className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-semibold tracking-wider text-[#546E7A]">{t("login.password")}</span>
                        <div className="flex items-center gap-2 rounded-md border border-[#B0C4DE] bg-[#F8FAFC] px-3 py-2 focus-within:border-[#4A6982]">
                            <KeyRound size={16} className="text-[#90A4AE]" />
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t("login.passwordPlaceholder")}
                                autoComplete="current-password"
                                disabled={submitting}
                                className="w-full bg-transparent text-[14px] text-[#37474F] outline-none placeholder:text-[#B0BEC5]"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="text-[#90A4AE] hover:text-[#546E7A]"
                                aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </label>

                    {error && (
                        <div className="flex items-center gap-2 rounded-md border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">
                            <AlertCircle size={14} />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="mt-2 rounded-md bg-[#4A6982] py-2.5 text-[14px] font-semibold tracking-wider text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {submitting ? t("login.submitting") : t("login.submit")}
                    </button>

                    <p className="text-center text-[11px] text-[#90A4AE]">
                        {t("login.defaultPasswordHint")}
                    </p>
                </form>
            </div>
        </div>
    );
}
