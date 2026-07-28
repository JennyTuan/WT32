import { describe, expect, it, vi } from "vitest";

import {
    cancelScanSession,
    completeScanSession,
    fetchScanSessionById,
    fetchSelectedScanSession,
    saveSelectedScanSessionId,
    startScanSession,
    updateSelectedScanSessionHelicalParam,
    updateScanSessionSeriesExecution,
    type ApiScanSessionDetail,
    type ApiScanSessionSeries,
} from "./scanSession";

const createScanSession = (id: number): ApiScanSessionDetail => ({
    id,
    patient_id: 5,
    protocol_id: 42,
    status: "draft",
    session_name: `scan-session-${id}`,
    name: "Chest routine protocol",
    body_part: "CHEST",
    age_group: "adult",
    patient_weight: "70-90kg",
    patient_position: "HFS",
    table_direction: "head_first",
    acquisition_type: "regular",
    scan_mode: "plain",
    description: null,
    series: [
        {
            id: id * 10,
            scan_session_id: id,
            template_series_id: 101,
            series_order: 1,
            series_type: "helical",
            series_label: "Chest helical",
            execution_status: "pending",
            range_confirmed: false,
            image_source_id: null,
            image_source_version: null,
            helical_param: {
                id: id * 100,
                kv: 120,
                ma: 180,
                slice_thickness: 1,
                pitch: 0.8,
                rotation_time: 0.75,
                scan_length: 220,
                fov: 260,
            },
            recon_series: [],
        },
    ],
});

const jsonResponse = <T,>(body: T, status = 200): Response => ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
} as unknown as Response);

const errorResponse = (detail: string, status = 409): Response =>
    jsonResponse({ detail }, status);

const lifecycleCases = [
    ["start", startScanSession, "in_progress"],
    ["complete", completeScanSession, "completed"],
    ["cancel", cancelScanSession, "cancelled"],
] as const;

describe("selected scan-session cache", () => {
    it("keeps the cached session snapshot isolated from direct caller mutations", async () => {
        const scanSession = createScanSession(7);
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(scanSession));
        vi.stubGlobal("fetch", fetchMock);
        saveSelectedScanSessionId(scanSession.id);

        const fetchedSession = await fetchScanSessionById(scanSession.id);
        fetchedSession.series[0]!.series_label = "Unsaved session-local edit";

        const cachedSession = await fetchSelectedScanSession();
        expect(cachedSession?.series[0]?.series_label).toBe("Chest helical");
        expect(cachedSession?.series[0]?.template_series_id).toBe(101);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not replace the selected session cache when another session is fetched", async () => {
        const selectedSession = createScanSession(7);
        const otherSession = createScanSession(8);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(selectedSession))
            .mockResolvedValueOnce(jsonResponse(otherSession));
        vi.stubGlobal("fetch", fetchMock);
        saveSelectedScanSessionId(selectedSession.id);

        await fetchScanSessionById(selectedSession.id);
        await fetchScanSessionById(otherSession.id);

        await expect(fetchSelectedScanSession()).resolves.toEqual(selectedSession);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe("scan-session lifecycle helpers", () => {
    it.each(lifecycleCases)("refreshes the selected cache after %s", async (endpoint, action, status) => {
        const selectedSession = createScanSession(7);
        const updatedSession: ApiScanSessionDetail = {
            ...selectedSession,
            status,
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(selectedSession))
            .mockResolvedValueOnce(jsonResponse(updatedSession));
        vi.stubGlobal("fetch", fetchMock);
        saveSelectedScanSessionId(selectedSession.id);

        await fetchScanSessionById(selectedSession.id);
        await expect(action(selectedSession.id)).resolves.toEqual(updatedSession);

        await expect(fetchSelectedScanSession()).resolves.toEqual(updatedSession);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining(`/api/scan-sessions/${selectedSession.id}/${endpoint}`),
            { method: "POST" },
        );
    });

    it.each(lifecycleCases)("forwards the backend detail when %s fails", async (endpoint, action) => {
        const detail = `${endpoint} rejected for the current session state`;
        const fetchMock = vi.fn().mockResolvedValue(errorResponse(detail));
        vi.stubGlobal("fetch", fetchMock);

        await expect(action(7)).rejects.toThrow(detail);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(`/api/scan-sessions/7/${endpoint}`),
            { method: "POST" },
        );
    });

    it("does not replace the selected cache with another session's lifecycle response", async () => {
        const selectedSession = createScanSession(7);
        const otherSession: ApiScanSessionDetail = {
            ...createScanSession(8),
            status: "completed",
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(selectedSession))
            .mockResolvedValueOnce(jsonResponse(otherSession));
        vi.stubGlobal("fetch", fetchMock);
        saveSelectedScanSessionId(selectedSession.id);

        await fetchScanSessionById(selectedSession.id);
        await completeScanSession(otherSession.id);

        await expect(fetchSelectedScanSession()).resolves.toEqual(selectedSession);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe("scan-series execution helper", () => {
    it("refreshes only the updated series in the selected session cache", async () => {
        const selectedSession = createScanSession(7);
        const updatedSeries: ApiScanSessionSeries = {
            ...selectedSession.series[0]!,
            execution_status: "running",
            range_confirmed: true,
            failure_reason: null,
        };
        const payload = {
            execution_status: "running" as const,
            range_confirmed: true,
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(selectedSession))
            .mockResolvedValueOnce(jsonResponse(updatedSeries));
        vi.stubGlobal("fetch", fetchMock);
        saveSelectedScanSessionId(selectedSession.id);

        await fetchScanSessionById(selectedSession.id);
        await expect(updateScanSessionSeriesExecution(updatedSeries.id, payload)).resolves.toEqual(updatedSeries);

        await expect(fetchSelectedScanSession()).resolves.toEqual({
            ...selectedSession,
            series: [updatedSeries],
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining(`/api/scan-sessions/series/${updatedSeries.id}/execution`),
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            },
        );
    });

    it("sends and caches the persisted image-source binding", async () => {
        const selectedSession = createScanSession(7);
        const payload = {
            execution_status: "image_ready" as const,
            image_source_id: "qin-lung-helical-demo" as const,
            image_source_version: 1 as const,
        };
        const updatedSeries: ApiScanSessionSeries = {
            ...selectedSession.series[0]!,
            ...payload,
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(selectedSession))
            .mockResolvedValueOnce(jsonResponse(updatedSeries));
        vi.stubGlobal("fetch", fetchMock);
        saveSelectedScanSessionId(selectedSession.id);

        await fetchScanSessionById(selectedSession.id);
        await expect(updateScanSessionSeriesExecution(updatedSeries.id, payload)).resolves.toEqual(updatedSeries);

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining(`/api/scan-sessions/series/${updatedSeries.id}/execution`),
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            },
        );
        await expect(fetchSelectedScanSession()).resolves.toEqual({
            ...selectedSession,
            series: [updatedSeries],
        });
    });

    it("allows clearing an image-source binding and caches the nullable fields", async () => {
        const selectedSession = createScanSession(7);
        selectedSession.series[0] = {
            ...selectedSession.series[0]!,
            image_source_id: "brain-helical-demo",
            image_source_version: 1,
        };
        const payload = {
            image_source_id: null,
            image_source_version: null,
        };
        const updatedSeries: ApiScanSessionSeries = {
            ...selectedSession.series[0]!,
            ...payload,
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(selectedSession))
            .mockResolvedValueOnce(jsonResponse(updatedSeries));
        vi.stubGlobal("fetch", fetchMock);
        saveSelectedScanSessionId(selectedSession.id);

        await fetchScanSessionById(selectedSession.id);
        await updateScanSessionSeriesExecution(updatedSeries.id, payload);

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining(`/api/scan-sessions/series/${updatedSeries.id}/execution`),
            expect.objectContaining({ body: JSON.stringify(payload) }),
        );
        expect((await fetchSelectedScanSession())?.series[0]).toEqual(updatedSeries);
    });

    it("forwards the backend detail when an execution update fails", async () => {
        const detail = "The required topogram is not image-ready";
        const fetchMock = vi.fn().mockResolvedValue(errorResponse(detail, 422));
        vi.stubGlobal("fetch", fetchMock);

        await expect(updateScanSessionSeriesExecution(70, {
            execution_status: "running",
        })).rejects.toThrow(detail);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/scan-sessions/series/70/execution"),
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ execution_status: "running" }),
            },
        );
    });

    it("does not update the selected cache from a series belonging to another session", async () => {
        const selectedSession = createScanSession(7);
        const otherSeries: ApiScanSessionSeries = {
            ...createScanSession(8).series[0]!,
            execution_status: "running",
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(selectedSession))
            .mockResolvedValueOnce(jsonResponse(otherSeries));
        vi.stubGlobal("fetch", fetchMock);
        saveSelectedScanSessionId(selectedSession.id);

        await fetchScanSessionById(selectedSession.id);
        await updateScanSessionSeriesExecution(otherSeries.id, { execution_status: "running" });

        await expect(fetchSelectedScanSession()).resolves.toEqual(selectedSession);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe("scan-session child updates", () => {
    it("updates the selected cache when a helical parameter is saved", async () => {
        const selectedSession = createScanSession(7);
        const originalParam = selectedSession.series[0]!.helical_param!;
        const updatedParam = { ...originalParam, ma: 235 };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(selectedSession))
            .mockResolvedValueOnce(jsonResponse(updatedParam));
        vi.stubGlobal("fetch", fetchMock);
        saveSelectedScanSessionId(selectedSession.id);

        await fetchScanSessionById(selectedSession.id);
        await expect(updateSelectedScanSessionHelicalParam(originalParam.id, { ma: 235 }))
            .resolves.toEqual(updatedParam);

        await expect(fetchSelectedScanSession()).resolves.toEqual({
            ...selectedSession,
            series: [{ ...selectedSession.series[0]!, helical_param: updatedParam }],
        });
    });
});
