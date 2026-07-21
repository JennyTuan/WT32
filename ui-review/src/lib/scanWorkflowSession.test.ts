import { describe, expect, it } from "vitest";

import {
    clearSelectedScanWorkflowPlans,
    findNextWorkflowPlan,
    loadSelectedScanWorkflowPlans,
    saveSelectedScanWorkflowPlans,
    type WorkflowPlan,
} from "./scanWorkflowSession";

const STORAGE_KEY = "selectedScanWorkflowPlans";

const createWorkflowPlan = (): WorkflowPlan => ({
    id: "plan-101",
    protocolId: 42,
    title: "Chest routine protocol",
    sourceSessionId: 701,
    sequences: [
        {
            id: "scout-1",
            sourceSeriesId: 101,
            name: "AP scout",
            type: "scout",
        },
        {
            id: "helical-1",
            sourceSeriesId: 102,
            sourceReconIds: [201, 202],
            name: "Chest helical",
            type: "helical",
        },
    ],
});

describe("selected scan workflow plans", () => {
    it("returns an empty plan list when no workflow is selected", () => {
        expect(loadSelectedScanWorkflowPlans()).toEqual([]);
    });

    it("saves and restores workflow source identifiers", () => {
        const plans = [createWorkflowPlan()];

        saveSelectedScanWorkflowPlans(plans);

        expect(loadSelectedScanWorkflowPlans()).toEqual(plans);
    });

    it("continues multi-plan examinations with the next bound scan session", () => {
        const firstPlan = createWorkflowPlan();
        const secondPlan = { ...createWorkflowPlan(), id: "plan-2", sourceSessionId: 702 };
        const thirdPlan = { ...createWorkflowPlan(), id: "plan-3", sourceSessionId: 703 };

        expect(findNextWorkflowPlan([firstPlan, secondPlan, thirdPlan], 701)).toEqual(secondPlan);
        expect(findNextWorkflowPlan([firstPlan, secondPlan, thirdPlan], 702)).toEqual(thirdPlan);
        expect(findNextWorkflowPlan([firstPlan, secondPlan, thirdPlan], 703)).toBeNull();
    });

    it("stores a snapshot instead of retaining mutable protocol-plan references", () => {
        const plans = [createWorkflowPlan()];
        const expectedSnapshot = [createWorkflowPlan()];

        saveSelectedScanWorkflowPlans(plans);
        plans[0]!.title = "Changed after selection";
        plans[0]!.sequences[1]!.sourceReconIds!.push(999);

        expect(loadSelectedScanWorkflowPlans()).toEqual(expectedSnapshot);
    });

    it("does not persist session-local edits until the workflow is saved again", () => {
        saveSelectedScanWorkflowPlans([createWorkflowPlan()]);

        const sessionCopy = loadSelectedScanWorkflowPlans();
        sessionCopy[0]!.sequences[1]!.name = "Session-local helical edit";

        expect(loadSelectedScanWorkflowPlans()[0]!.sequences[1]!.name).toBe("Chest helical");
    });

    it.each([
        ["malformed JSON", "{not-json"],
        ["a non-array JSON value", JSON.stringify({ id: "not-a-plan-list" })],
    ])("falls back to an empty plan list for %s", (_caseName, storedValue) => {
        localStorage.setItem(STORAGE_KEY, storedValue);

        expect(loadSelectedScanWorkflowPlans()).toEqual([]);
    });

    it("clears only the selected workflow plans", () => {
        saveSelectedScanWorkflowPlans([createWorkflowPlan()]);
        localStorage.setItem("unrelatedPreference", "keep-me");

        clearSelectedScanWorkflowPlans();

        expect(loadSelectedScanWorkflowPlans()).toEqual([]);
        expect(localStorage.getItem("unrelatedPreference")).toBe("keep-me");
    });
});
