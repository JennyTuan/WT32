import { describe, expect, it, vi } from "vitest";

import { ScanParamWriteCoordinator } from "./scanParamWriteCoordinator";

describe("ScanParamWriteCoordinator", () => {
    it("flushes the latest debounced write before returning", async () => {
        vi.useFakeTimers();
        const coordinator = new ScanParamWriteCoordinator();
        const first = vi.fn().mockResolvedValue(undefined);
        const latest = vi.fn().mockResolvedValue(undefined);

        coordinator.schedule(first, 180);
        coordinator.schedule(latest, 180);
        await coordinator.flush();

        expect(first).not.toHaveBeenCalled();
        expect(latest).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });

    it("waits for an in-flight API write before flush returns", async () => {
        const coordinator = new ScanParamWriteCoordinator();
        let releaseWrite!: () => void;
        const inFlight = coordinator.write(() => new Promise<void>((resolve) => {
            releaseWrite = resolve;
        }));
        let flushed = false;
        const flushing = coordinator.flush().then(() => { flushed = true; });

        await Promise.resolve();
        expect(flushed).toBe(false);
        releaseWrite();
        await Promise.all([inFlight, flushing]);
        expect(flushed).toBe(true);
    });

    it("does not drain later writes past a failure and retries in order on flush", async () => {
        const coordinator = new ScanParamWriteCoordinator();
        const order: string[] = [];
        const first = vi.fn()
            .mockRejectedValueOnce(new Error("save failed"))
            .mockImplementationOnce(async () => { order.push("first"); });
        const second = vi.fn().mockImplementation(async () => { order.push("second"); });

        await expect(coordinator.write(first)).rejects.toThrow("save failed");
        await expect(coordinator.write(second)).rejects.toThrow("save failed");
        expect(second).not.toHaveBeenCalled();

        await coordinator.flush();

        expect(order).toEqual(["first", "second"]);
    });
});
