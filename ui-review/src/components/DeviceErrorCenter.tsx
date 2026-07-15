import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";

import { FeedbackNotice } from "./FeedbackNotice";
import { FEEDBACK_TONE_STYLES, type FeedbackTone } from "./feedbackStyles";
import { useAuth } from "../lib/authContext";
import {
    isDeviceErrorEvent,
    notifyDeviceErrorRaised,
    scanControlSocketUrl,
    type DeviceErrorEvent,
    type DeviceErrorSeverity,
} from "../lib/deviceErrorEvents";
import { useI18n } from "../lib/i18nContext";

type ActiveDeviceError = DeviceErrorEvent & { acknowledged: boolean };

const SEVERITY_TONES: Record<DeviceErrorSeverity, FeedbackTone> = {
    fatal: "fatal",
    error: "error",
    warning: "warning",
};

export default function DeviceErrorCenter() {
    const { isEmergencySession } = useAuth();
    const { t } = useI18n();
    const socketRef = useRef<WebSocket | null>(null);
    const [activeErrors, setActiveErrors] = useState<ActiveDeviceError[]>([]);
    const [selectedCode, setSelectedCode] = useState<string | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);

    useEffect(() => {
        let disposed = false;
        let reconnectTimer: number | null = null;

        const connect = () => {
            if (disposed) return;
            const socket = new WebSocket(scanControlSocketUrl());
            socketRef.current = socket;

            socket.addEventListener("message", (message) => {
                if (typeof message.data !== "string") return;
                try {
                    const event = JSON.parse(message.data) as unknown;
                    if (!isDeviceErrorEvent(event)) return;
                    notifyDeviceErrorRaised(event);
                    setActiveErrors((current) => {
                        if (event.occurrence === "cleared") {
                            return current.filter((item) => item.error.code !== event.error.code);
                        }
                        if (event.occurrence === "acknowledged") {
                            return current.map((item) => item.error.code === event.error.code
                                ? { ...item, acknowledged: true }
                                : item);
                        }
                        const next = current.filter((item) => item.error.code !== event.error.code);
                        return [{ ...event, acknowledged: false }, ...next];
                    });
                } catch {
                    // 非 JSON 或非设备错误消息由其他扫描状态消费者处理。
                }
            });

            socket.addEventListener("close", () => {
                if (socketRef.current === socket) socketRef.current = null;
                if (!disposed) reconnectTimer = window.setTimeout(connect, 2000);
            });
        };

        connect();
        return () => {
            disposed = true;
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            socketRef.current?.close();
            socketRef.current = null;
        };
    }, []);

    const acknowledgeError = useCallback((error: ActiveDeviceError) => {
        const payload = JSON.stringify({
            command: "ACKNOWLEDGE_DEVICE_ERROR",
            error_code: error.error.code,
            scan_session_id: error.scan_session_id,
        });
        if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(payload);

        setActiveErrors((current) => current.map((item) => item.error.code === error.error.code
            ? { ...item, acknowledged: true }
            : item));
    }, []);

    const blockingError = useMemo(
        () => activeErrors.find((item) => !item.acknowledged && item.error.severity !== "warning") ?? null,
        [activeErrors],
    );
    const warning = useMemo(
        () => activeErrors.find((item) => !item.acknowledged && item.error.severity === "warning") ?? null,
        [activeErrors],
    );
    const selected = activeErrors.find((item) => item.error.code === selectedCode) ?? activeErrors[0] ?? null;

    return (
        <>
            {warning && !blockingError && (
                <FeedbackNotice
                    tone="warning"
                    title={t("deviceError.warningTitle", { code: warning.error.code })}
                    className={`absolute left-1/2 z-[110] w-[720px] -translate-x-1/2 shadow-xl ${isEmergencySession ? "top-14" : "top-3"}`}
                    action={(
                        <button
                            type="button"
                            onClick={() => acknowledgeError(warning)}
                            className="h-10 rounded-md bg-[#D97706] px-4 text-[12px] font-bold text-white transition-colors hover:bg-[#B45309]"
                        >
                            {t("deviceError.acknowledge")}
                        </button>
                    )}
                >
                    {warning.error.message}
                </FeedbackNotice>
            )}

            {activeErrors.length > 0 && !blockingError && (
                <button
                    type="button"
                    onClick={() => setPanelOpen((current) => !current)}
                    className="absolute right-4 top-4 z-[109] flex h-9 items-center gap-2 rounded-full border border-[#FCA5A5] bg-white px-3 text-[12px] font-bold text-[#B91C1C] shadow-lg"
                >
                    <ShieldAlert size={16} />
                    {t("deviceError.activeCount", { count: activeErrors.length })}
                </button>
            )}

            {blockingError && (
                <div className="absolute inset-0 z-[120] flex items-center justify-center bg-[#0F172A]/55 p-8 backdrop-blur-[1px]">
                    <ErrorCard
                        error={blockingError}
                        onAcknowledge={() => acknowledgeError(blockingError)}
                    />
                </div>
            )}

            {panelOpen && !blockingError && selected && (
                <div className="absolute inset-0 z-[115] flex items-center justify-center bg-[#0F172A]/35 p-8" onClick={() => setPanelOpen(false)}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="device-error-panel-title"
                        className="flex w-[660px] overflow-hidden rounded-xl bg-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="w-[210px] border-r border-[#E2E8F0] bg-[#F8FAFC] p-3">
                            <div id="device-error-panel-title" className="mb-2 px-2 text-[11px] font-black uppercase tracking-wider text-[#64748B]">{t("deviceError.currentAlerts")}</div>
                            <div className="flex max-h-[360px] flex-col gap-1 overflow-auto">
                                {activeErrors.map((item) => (
                                    <button
                                        key={item.error.code}
                                        type="button"
                                        onClick={() => setSelectedCode(item.error.code)}
                                        className={`rounded-md px-3 py-2 text-left ${selected.error.code === item.error.code ? "bg-white shadow-sm" : "hover:bg-white/70"}`}
                                    >
                                        <div className="font-mono text-[11px] font-bold text-[#334155]">{item.error.code}</div>
                                        <div className="mt-1 flex items-center gap-1.5">
                                            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.error.severity === "warning" ? "bg-[#D97706]" : "bg-[#DC2626]"}`} />
                                            <span className="min-w-0 truncate text-[11px] text-[#64748B]">{item.error.module}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1 p-5">
                            <ErrorDetails error={selected} />
                            <div className="mt-5 flex justify-end gap-2">
                                {!selected.acknowledged && (
                                    <button type="button" onClick={() => acknowledgeError(selected)} className="h-9 rounded-md bg-[#334155] px-4 text-[12px] font-bold text-white">
                                        {t("deviceError.acknowledge")}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function ErrorCard({ error, onAcknowledge }: { error: ActiveDeviceError; onAcknowledge: () => void }) {
    const { t } = useI18n();
    const tone = SEVERITY_TONES[error.error.severity];

    return (
        <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="blocking-device-error-title"
            aria-describedby="blocking-device-error-details"
            className={`w-[560px] rounded-xl border-t-4 bg-white p-6 shadow-2xl ${tone === "fatal" ? "border-[#991B1B]" : "border-[#DC2626]"}`}
        >
            <div className="flex items-start gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${FEEDBACK_TONE_STYLES[tone].badge}`}>
                    <ShieldAlert size={25} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <h2 id="blocking-device-error-title" className="text-[18px] font-black leading-snug text-[#1E293B]">{error.error.message}</h2>
                        <span className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-1 font-mono text-[11px] font-bold text-[#475569]">
                            {error.error.code}
                        </span>
                    </div>
                </div>
            </div>
            <div id="blocking-device-error-details" className="mt-5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <ErrorDetails error={error} />
            </div>
            <FeedbackNotice tone="warning" compact className="mt-4 shadow-none">
                {t("deviceError.safetyNotice")}
            </FeedbackNotice>
            <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={onAcknowledge} className="flex h-10 items-center gap-1.5 rounded-md bg-[#B91C1C] px-5 text-[12px] font-bold text-white">
                    <CheckCircle2 size={15} />
                    {t("deviceError.acknowledge")}
                </button>
            </div>
        </div>
    );
}

function ErrorDetails({ error }: { error: ActiveDeviceError }) {
    const { t } = useI18n();
    const sourceLabel = t(`deviceError.source.${error.source}`);

    return (
        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[12px] leading-relaxed">
            <dt className="font-bold text-[#64748B]">{t("deviceError.module")}</dt>
            <dd className="font-semibold text-[#334155]">{error.error.module}</dd>
            <dt className="font-bold text-[#64748B]">{t("deviceError.source")}</dt>
            <dd className="text-[#334155]">{sourceLabel}</dd>
            {error.error.meaning && (
                <>
                    <dt className="font-bold text-[#64748B]">{t("deviceError.technicalMeaning")}</dt>
                    <dd className="text-[#334155]">{error.error.meaning}</dd>
                </>
            )}
            {error.error.action && (
                <>
                    <dt className="font-bold text-[#64748B]">{t("deviceError.referenceAction")}</dt>
                    <dd className="text-[#334155]">{error.error.action}</dd>
                </>
            )}
        </dl>
    );
}
