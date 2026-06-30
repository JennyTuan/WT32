import { useEffect, useState } from "react";

export type BreathHoldStage = "idle" | "countdown" | "holding" | "stable" | "scanning" | "release" | "aborted";

export interface BreathHoldStateMachineOptions {
    armed: boolean;
    timeoutSeconds: number;
    forceFailure: boolean;
    onStageChange?: (stage: BreathHoldStage) => void;
    onStableHold?: () => void;
    onAbort?: () => void;
}

export interface BreathHoldStateMachineState {
    stage: BreathHoldStage;
    countdown: number;
    holdElapsed: number;
}

type InternalBreathHoldState = BreathHoldStateMachineState & {
    armed: boolean;
    stableFired: boolean;
};

const createInitialState = (armed: boolean): InternalBreathHoldState => ({
    armed,
    stage: armed ? "countdown" : "idle",
    countdown: 3,
    holdElapsed: 0,
    stableFired: false,
});

export function useBreathHoldStateMachine(
    opts: BreathHoldStateMachineOptions,
): BreathHoldStateMachineState {
    const { armed, timeoutSeconds, forceFailure, onStageChange, onStableHold, onAbort } = opts;
    const [state, setState] = useState<InternalBreathHoldState>(() => createInitialState(armed));

    let currentState = state;
    if (state.armed !== armed) {
        currentState = createInitialState(armed);
        setState(currentState);
    }

    const { stage, countdown, holdElapsed } = currentState;

    useEffect(() => {
        onStageChange?.(stage);
    }, [stage, onStageChange]);

    useEffect(() => {
        if (stage !== "countdown") return;
        const timerId = window.setTimeout(() => {
            setState((prev) => {
                if (!prev.armed || prev.stage !== "countdown") return prev;
                if (prev.countdown <= 1) {
                    return { ...prev, stage: "holding", countdown: 0, holdElapsed: 0 };
                }
                return { ...prev, countdown: prev.countdown - 1 };
            });
        }, 800);
        return () => window.clearTimeout(timerId);
    }, [stage, countdown]);

    useEffect(() => {
        if (stage !== "holding" && stage !== "stable" && stage !== "scanning") return;
        const intervalId = window.setInterval(() => {
            let becameStable = false;
            let becameAborted = false;

            setState((prev) => {
                if (!prev.armed || (prev.stage !== "holding" && prev.stage !== "stable" && prev.stage !== "scanning")) {
                    return prev;
                }

                const nextElapsed = prev.holdElapsed + 0.1;
                let nextStage: BreathHoldStage = prev.stage;
                let nextStableFired = prev.stableFired;

                if (!nextStableFired && nextElapsed >= 1.0 && prev.stage === "holding" && !forceFailure) {
                    nextStableFired = true;
                    nextStage = "stable";
                    becameStable = true;
                }

                if (nextElapsed >= timeoutSeconds) {
                    nextStage = "aborted";
                    becameAborted = true;
                }

                return {
                    ...prev,
                    stage: nextStage,
                    holdElapsed: nextElapsed,
                    stableFired: nextStableFired,
                };
            });

            if (becameStable) onStableHold?.();
            if (becameAborted) onAbort?.();
        }, 100);
        return () => window.clearInterval(intervalId);
    }, [stage, timeoutSeconds, onStableHold, onAbort, forceFailure]);

    return { stage, countdown, holdElapsed };
}
