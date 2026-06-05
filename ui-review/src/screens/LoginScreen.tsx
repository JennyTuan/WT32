import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, Eye, EyeOff, KeyRound, Siren, User as UserIcon, AlertCircle } from "lucide-react";

import { useAuth } from "../lib/authContext";
import { useI18n } from "../lib/i18nContext";
import type { LanguageCode } from "../lib/systemSettingsApi";

type LocationState = { from?: string } | null;

const LANGUAGE_OPTIONS: { code: LanguageCode; short: string }[] = [
    { code: "zh-CN", short: "中" },
    { code: "en-US", short: "EN" },
];

export default function LoginScreen() {
    const { login, emergencyLogin, isAuthenticated, sessionExpired, clearSessionExpired } = useAuth();
    const { t, language, setLanguage } = useI18n();
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as LocationState)?.from || "/";

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
    const [emergencySubmitting, setEmergencySubmitting] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            navigate(from === "/login" ? "/" : from, { replace: true });
        }
    }, [isAuthenticated, navigate, from]);

    const handleEmergencyConfirm = async () => {
        if (emergencySubmitting) return;
        setEmergencySubmitting(true);
        setError(null);
        clearSessionExpired();
        try {
            await emergencyLogin();
            setShowEmergencyConfirm(false);
            navigate("/patients", { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : t("login.errorFailed"));
            setShowEmergencyConfirm(false);
        } finally {
            setEmergencySubmitting(false);
        }
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (submitting) return;
        if (!username.trim() || !password) {
            setError(t("login.errorMissing"));
            return;
        }
        setSubmitting(true);
        setError(null);
        clearSessionExpired();
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
        <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-[#E8EAF1] via-[#F4F6FA] to-[#DCE6F2] px-8">
            <div className="absolute right-6 top-6 flex items-center gap-1 rounded-full border border-[#B0C4DE] bg-white/80 p-1 shadow-sm backdrop-blur">
                {LANGUAGE_OPTIONS.map((option) => {
                    const active = option.code === language;
                    return (
                        <button
                            key={option.code}
                            type="button"
                            onClick={() => setLanguage(option.code)}
                            className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
                                active
                                    ? "bg-[#4A6982] text-white shadow"
                                    : "text-[#546E7A] hover:bg-[#E8EAF1]"
                            }`}
                            aria-pressed={active}
                            aria-label={t(option.code === "zh-CN" ? "language.zh-CN" : "language.en-US")}
                        >
                            {option.short}
                        </button>
                    );
                })}
            </div>

            <div className="w-[420px] rounded-2xl border border-[#B0C4DE] bg-white p-8 shadow-xl">
                <div className="mb-6 flex flex-col items-center">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#4A6982] text-white">
                        <UserIcon size={28} strokeWidth={1.8} />
                    </div>
                    <h1 className="text-[20px] font-bold text-[#37474F]">{t("login.title")}</h1>
                    <p className="mt-1 text-[12px] text-[#90A4AE]">{t("login.subtitle")}</p>
                </div>

                {sessionExpired && (
                    <div className="mb-4 flex items-center gap-2 rounded-md border border-[#FCD34D] bg-[#FEF3C7] px-3 py-2 text-[12px] text-[#92400E]">
                        <Clock size={14} />
                        <span>{t("login.sessionExpired")}</span>
                    </div>
                )}

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
                </form>

                <button
                    type="button"
                    onClick={() => setShowEmergencyConfirm(true)}
                    disabled={submitting || emergencySubmitting}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-[#F59E0B] bg-[#FFFBEB] py-2 text-[13px] font-semibold text-[#B45309] transition hover:bg-[#FEF3C7] disabled:opacity-50"
                >
                    <Siren size={14} />
                    {t("login.emergencyButton")}
                </button>
            </div>

            {showEmergencyConfirm && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 px-8">
                    <div className="w-[440px] rounded-2xl border border-[#F59E0B] bg-white p-6 shadow-2xl">
                        <div className="mb-3 flex items-center gap-2 text-[#B45309]">
                            <AlertTriangle size={20} />
                            <h2 className="text-[16px] font-bold">{t("login.emergencyConfirmTitle")}</h2>
                        </div>
                        <p className="text-[13px] leading-relaxed text-[#546E7A]">
                            {t("login.emergencyConfirmBody")}
                        </p>
                        <div className="mt-5 flex justify-end gap-3">
                            <button
                                type="button"
                                autoFocus
                                onClick={() => setShowEmergencyConfirm(false)}
                                disabled={emergencySubmitting}
                                className="rounded-md border border-[#B0C4DE] bg-white px-4 py-2 text-[13px] font-semibold text-[#37474F] hover:bg-[#F8FAFC] disabled:opacity-50"
                            >
                                {t("login.emergencyConfirmCancel")}
                            </button>
                            <button
                                type="button"
                                onClick={handleEmergencyConfirm}
                                disabled={emergencySubmitting}
                                className="rounded-md bg-[#D97706] px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-[#B45309] disabled:opacity-50"
                            >
                                {emergencySubmitting
                                    ? t("login.emergencySubmitting")
                                    : t("login.emergencyConfirmOk")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
