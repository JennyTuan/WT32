import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
    buildViewerBindingKey,
    isViewerBindingKeyVerified,
    type ViewerBindingIdentity,
} from "./viewerBinding";

const mountedRoots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
    await act(async () => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
});

function BindingGate({
    identity,
    verifiedBindingKey,
}: {
    identity: ViewerBindingIdentity;
    verifiedBindingKey: string | null;
}) {
    const currentBindingKey = buildViewerBindingKey(identity);
    return <div>{isViewerBindingKeyVerified(verifiedBindingKey, currentBindingKey) ? "open" : "closed"}</div>;
}

describe("viewer binding identity", () => {
    it("closes the authority gate on the same-path rerender from binding A to B", async () => {
        const host = document.createElement("div");
        const root = createRoot(host);
        mountedRoots.push(root);
        const identityA: ViewerBindingIdentity = {
            kind: "4d",
            patientId: 1,
            scanSessionId: 10,
            targetSeriesId: 100,
            resultVersion: 3,
        };
        const identityB: ViewerBindingIdentity = {
            kind: "4d",
            patientId: 2,
            scanSessionId: 20,
            targetSeriesId: 200,
            resultVersion: 1,
        };
        const verifiedBindingKey = buildViewerBindingKey(identityA);

        await act(async () => {
            root.render(<BindingGate identity={identityA} verifiedBindingKey={verifiedBindingKey} />);
        });
        expect(host.textContent).toBe("open");

        await act(async () => {
            root.render(<BindingGate identity={identityB} verifiedBindingKey={verifiedBindingKey} />);
        });
        expect(host.textContent).toBe("closed");
    });
});
