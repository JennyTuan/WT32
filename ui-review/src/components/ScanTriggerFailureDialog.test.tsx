import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScanTriggerFailureDialog from "./ScanTriggerFailureDialog";

const mountedRoots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
    await act(async () => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
});

const renderDialog = async (busy = false) => {
    const host = document.createElement("div");
    const root = createRoot(host);
    mountedRoots.push(root);
    const onRetry = vi.fn();
    const onReturnToConfirm = vi.fn();

    await act(async () => {
        root.render(
            <ScanTriggerFailureDialog
                failure={{ title: "扫描下发失败", message: "模拟失败" }}
                busy={busy}
                onRetry={onRetry}
                onReturnToConfirm={onReturnToConfirm}
            />,
        );
    });

    return { host, onRetry, onReturnToConfirm };
};

describe("ScanTriggerFailureDialog", () => {
    it("exposes separate return-to-confirmation and physical-trigger retry actions", async () => {
        const { host, onRetry, onReturnToConfirm } = await renderDialog();
        const buttons = Array.from(host.querySelectorAll("button"));

        expect(buttons.map((button) => button.textContent?.trim())).toEqual(["返回确认", "重新尝试"]);

        await act(async () => {
            buttons[0].click();
            buttons[1].click();
        });
        expect(onReturnToConfirm).toHaveBeenCalledOnce();
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it("shows recovery progress and prevents duplicate actions", async () => {
        const { host, onRetry, onReturnToConfirm } = await renderDialog(true);
        const dialog = host.querySelector('[role="alertdialog"]');
        const buttons = Array.from(host.querySelectorAll("button"));

        expect(dialog?.getAttribute("aria-busy")).toBe("true");
        expect(buttons.every((button) => button.disabled)).toBe(true);
        expect(buttons.map((button) => button.textContent?.trim())).toEqual(["处理中…", "处理中…"]);

        await act(async () => {
            buttons[0].click();
            buttons[1].click();
        });
        expect(onReturnToConfirm).not.toHaveBeenCalled();
        expect(onRetry).not.toHaveBeenCalled();
    });
});
