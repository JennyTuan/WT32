import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "./apiClient";

export type RespiraScopeStatus = "idle" | "connecting" | "waiting" | "receiving" | "unavailable" | "error";

export type RespiraScopePoint = [sequence: number, value: number];

export type RespiraScopeMetrics = {
    bpm: number | null;
    quality: string;
    breathCount: number;
    intervalCv: number | null;
};

export type RespiraScopeSignalQuality = {
    sequence: number | null;
    value: number | null;
    quality: string;
    details: Record<string, unknown> | null;
};

type UseRespiraScopeBreathingOptions = {
    enabled: boolean;
    maxPoints?: number;
};

const DEFAULT_MAX_POINTS = 500;
const BREATH_NAMESPACE = "/breath";
const SOCKET_PREFIX = `42${BREATH_NAMESPACE},`;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === "object" && value !== null && !Array.isArray(value)
);

const finiteNumber = (value: unknown): number | null => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeApiBase = (value: string) => value.replace(/\/$/, "");

export const resolveRespiraScopeApiBase = () => {
    const configured = import.meta.env.VITE_RESPIRASCOPE_API_BASE_URL as string | undefined;
    if (configured) return normalizeApiBase(configured);

    if (API_BASE_URL) return API_BASE_URL;
    // 默认走当前站点：开发环境由 Vite 代理到后端，部署时则使用同源后端。
    return typeof window === "undefined" ? "" : window.location.origin;
};

const socketUrlFromApiBase = (apiBase: string) => {
    const url = new URL(apiBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/socket.io/";
    url.search = "EIO=4&transport=websocket";
    return url.toString();
};

const normalizePoint = (value: unknown): RespiraScopePoint | null => {
    if (Array.isArray(value)) {
        const sequence = finiteNumber(value[0]);
        const sample = finiteNumber(value[1]);
        return sequence === null || sample === null ? null : [sequence, sample];
    }

    if (isRecord(value)) {
        const sequence = finiteNumber(value.sequence);
        const sample = finiteNumber(value.value);
        return sequence === null || sample === null ? null : [sequence, sample];
    }

    return null;
};

const appendPoints = (current: RespiraScopePoint[], incoming: unknown, maxPoints: number) => {
    if (!Array.isArray(incoming)) return current;

    const next = [...current];
    const seenSequences = new Set(next.map(([sequence]) => sequence));

    for (const item of incoming) {
        const point = normalizePoint(item);
        if (!point || seenSequences.has(point[0])) continue;
        seenSequences.add(point[0]);
        next.push(point);
    }

    next.sort((left, right) => left[0] - right[0]);
    return next.slice(-maxPoints);
};

const normalizeMetrics = (incoming: unknown): RespiraScopeMetrics | null => {
    const latest = Array.isArray(incoming) ? incoming[incoming.length - 1] : incoming;
    if (!isRecord(latest)) return null;

    return {
        bpm: finiteNumber(latest.bpm),
        quality: typeof latest.quality === "string" ? latest.quality : "-",
        breathCount: finiteNumber(latest.breath_count ?? latest.breathCount) ?? 0,
        intervalCv: finiteNumber(latest.interval_cv ?? latest.intervalCv),
    };
};

const normalizeSignalQuality = (incoming: unknown): RespiraScopeSignalQuality | null => {
    const latest = Array.isArray(incoming) ? incoming[incoming.length - 1] : incoming;
    if (!isRecord(latest)) return null;

    return {
        sequence: finiteNumber(latest.sequence),
        value: finiteNumber(latest.value),
        quality: typeof latest.quality === "string" ? latest.quality : "-",
        details: isRecord(latest.details) ? latest.details : null,
    };
};

export const useRespiraScopeBreathing = ({
    enabled,
    maxPoints = DEFAULT_MAX_POINTS,
}: UseRespiraScopeBreathingOptions) => {
    const [status, setStatus] = useState<RespiraScopeStatus>("idle");
    const [rawPoints, setRawPoints] = useState<RespiraScopePoint[]>([]);
    const [filteredPoints, setFilteredPoints] = useState<RespiraScopePoint[]>([]);
    const [peakPoints, setPeakPoints] = useState<RespiraScopePoint[]>([]);
    const [valleyPoints, setValleyPoints] = useState<RespiraScopePoint[]>([]);
    const [metrics, setMetrics] = useState<RespiraScopeMetrics>({
        bpm: null,
        quality: "-",
        breathCount: 0,
        intervalCv: null,
    });
    const [signalQuality, setSignalQuality] = useState<RespiraScopeSignalQuality | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    const socketRef = useRef<WebSocket | null>(null);

    const apiBase = useMemo(() => resolveRespiraScopeApiBase(), []);

    const retry = useCallback(() => {
        socketRef.current?.close();
        socketRef.current = null;
        setRawPoints([]);
        setFilteredPoints([]);
        setPeakPoints([]);
        setValleyPoints([]);
        setMetrics({
            bpm: null,
            quality: "-",
            breathCount: 0,
            intervalCv: null,
        });
        setSignalQuality(null);
        setErrorMessage(null);
        setLastMessageAt(null);
        setStatus(enabled ? "connecting" : "idle");
        setRetryToken((current) => current + 1);
    }, [enabled]);

    useEffect(() => {
        if (!enabled) {
            socketRef.current?.close();
            socketRef.current = null;
            return;
        }

        let cancelled = false;
        const abortController = new AbortController();

        const handleBreathPayload = (payload: unknown) => {
            if (!isRecord(payload)) return;

            const type = payload.type;
            const data = payload.data;

            setLastMessageAt(Date.now());
            setStatus("receiving");
            setErrorMessage(null);

            if (type === "raw") {
                setRawPoints((current) => appendPoints(current, data, maxPoints));
                return;
            }
            if (type === "filtered") {
                setFilteredPoints((current) => appendPoints(current, data, maxPoints));
                return;
            }
            if (type === "peak") {
                setPeakPoints((current) => appendPoints(current, data, maxPoints));
                return;
            }
            if (type === "valley") {
                setValleyPoints((current) => appendPoints(current, data, maxPoints));
                return;
            }
            if (type === "metrics") {
                const nextMetrics = normalizeMetrics(data);
                if (nextMetrics) setMetrics(nextMetrics);
                return;
            }
            if (type === "signal_quality") {
                const nextSignalQuality = normalizeSignalQuality(data);
                if (nextSignalQuality) setSignalQuality(nextSignalQuality);
            }
        };

        const connectSocket = () => {
            const socket = new WebSocket(socketUrlFromApiBase(apiBase));
            socketRef.current = socket;

            socket.addEventListener("open", () => {
                if (!cancelled) setStatus("waiting");
            });

            socket.addEventListener("message", (event) => {
                if (cancelled || typeof event.data !== "string") return;

                const message = event.data;
                if (message.startsWith("0")) {
                    socket.send(`40${BREATH_NAMESPACE},`);
                    return;
                }
                if (message === "2") {
                    socket.send("3");
                    return;
                }
                if (message.startsWith(SOCKET_PREFIX)) {
                    const parsed = JSON.parse(message.slice(SOCKET_PREFIX.length)) as unknown;
                    if (Array.isArray(parsed) && parsed[0] === "breath") {
                        handleBreathPayload(parsed[1]);
                    }
                }
            });

            socket.addEventListener("close", () => {
                if (!cancelled) setStatus((current) => (current === "receiving" ? "error" : current));
            });

            socket.addEventListener("error", () => {
                if (!cancelled) {
                    setStatus("error");
                    setErrorMessage("RespiraScope WebSocket error");
                }
            });
        };

        const start = async () => {
            setStatus("connecting");
            setErrorMessage(null);

            const healthResponse = await fetch(`${apiBase}/health`, { signal: abortController.signal });
            if (!healthResponse.ok) {
                throw new Error(`RespiraScope health check failed: ${healthResponse.status}`);
            }

            const startResponse = await fetch(`${apiBase}/startReceive`, {
                method: "POST",
                signal: abortController.signal,
            });
            if (!startResponse.ok) {
                throw new Error(`RespiraScope startReceive failed: ${startResponse.status}`);
            }

            if (!cancelled) connectSocket();
        };

        start().catch((error: unknown) => {
            if (cancelled || abortController.signal.aborted) return;
            setStatus("unavailable");
            setErrorMessage(error instanceof Error ? error.message : "RespiraScope unavailable");
        });

        return () => {
            cancelled = true;
            abortController.abort();
            socketRef.current?.close();
            socketRef.current = null;
        };
    }, [apiBase, enabled, maxPoints, retryToken]);

    const rawValues = useMemo(() => rawPoints.map(([, value]) => value), [rawPoints]);
    const filteredValues = useMemo(() => filteredPoints.map(([, value]) => value), [filteredPoints]);
    const hasSamples = rawPoints.length > 0 || filteredPoints.length > 0;

    return {
        apiBase,
        status,
        rawPoints,
        filteredPoints,
        peakPoints,
        valleyPoints,
        rawValues,
        filteredValues,
        metrics,
        signalQuality,
        errorMessage,
        lastMessageAt,
        hasSamples,
        retry,
    };
};
