export type ScanParamWrite = () => Promise<unknown>;

type ScheduledWrite = {
    write: ScanParamWrite;
    onError?: (error: unknown) => void;
};

/**
 * Serializes partial parameter writes and lets the execute path synchronously
 * drain the debounce queue before confirming a scan range.
 */
export class ScanParamWriteCoordinator {
    private readonly writes: ScanParamWrite[] = [];
    private scheduled: ScheduledWrite | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private processing: Promise<void> | null = null;
    private blockedError: unknown = null;

    schedule(write: ScanParamWrite, delayMs: number, onError?: (error: unknown) => void) {
        if (this.timer !== null) clearTimeout(this.timer);
        this.scheduled = { write, onError };
        this.timer = setTimeout(() => {
            const scheduled = this.takeScheduled();
            if (!scheduled) return;
            this.writes.push(scheduled.write);
            void this.process().catch((error) => scheduled.onError?.(error));
        }, delayMs);
    }

    write(write: ScanParamWrite) {
        this.writes.push(write);
        return this.process();
    }

    async flush() {
        const scheduled = this.takeScheduled();
        if (scheduled) this.writes.push(scheduled.write);

        if (this.processing) {
            try {
                await this.processing;
            } catch {
                // The failed write remains at the queue head and is retried below.
            }
        }

        this.blockedError = null;
        await this.process();
    }

    dispose() {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.scheduled = null;
    }

    private takeScheduled() {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        const scheduled = this.scheduled;
        this.scheduled = null;
        return scheduled;
    }

    private process() {
        if (this.processing) return this.processing;
        if (this.blockedError !== null) return Promise.reject(this.blockedError);

        const processing = (async () => {
            while (this.writes.length > 0) {
                try {
                    await this.writes[0]!();
                    this.writes.shift();
                } catch (error) {
                    this.blockedError = error;
                    throw error;
                }
            }
        })();

        this.processing = processing.finally(() => {
            this.processing = null;
        });
        return this.processing;
    }
}
