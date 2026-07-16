import type { PhaseSelections } from "./fourDTypes";

export const arePhaseSelectionsEqual = (
    left: PhaseSelections | undefined,
    right: PhaseSelections | undefined,
) => {
    const leftEntries = Object.entries(left ?? {}).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
    const rightEntries = Object.entries(right ?? {}).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
    return leftEntries.length === rightEntries.length
        && leftEntries.every(([key, value], index) => (
            rightEntries[index]?.[0] === key && rightEntries[index]?.[1] === value
        ));
};
