import { useRef } from "react";

type SimulatedPhysicalPressOptions = {
    disabled?: boolean;
    onPressEnd?: () => void;
    onPressStart: () => void;
};

export function useSimulatedPhysicalPress({
    disabled = false,
    onPressEnd = () => undefined,
    onPressStart,
}: SimulatedPhysicalPressOptions) {
    const activePointerIdRef = useRef<number | null>(null);
    const pointerPressHandledRef = useRef(false);
    const keyboardPressActiveRef = useRef(false);
    const keyboardPressHandledRef = useRef(false);

    const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (disabled || activePointerIdRef.current !== null) return;
        event.preventDefault();
        activePointerIdRef.current = event.pointerId;
        pointerPressHandledRef.current = true;
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // 部分触控环境不支持指针捕获；捕获失败不应阻断模拟按键动作。
        }
        onPressStart();
    };

    const onPointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (activePointerIdRef.current !== event.pointerId) return;
        activePointerIdRef.current = null;
        onPressEnd();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const onLostPointerCapture = () => {
        if (activePointerIdRef.current === null) return;
        activePointerIdRef.current = null;
        onPressEnd();
    };

    const onClick = () => {
        if (disabled) return;
        if (pointerPressHandledRef.current || keyboardPressHandledRef.current) {
            pointerPressHandledRef.current = false;
            keyboardPressHandledRef.current = false;
            return;
        }
        onPressStart();
        onPressEnd();
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled || event.repeat || (event.key !== " " && event.key !== "Enter")) return;
        event.preventDefault();
        if (activePointerIdRef.current !== null || keyboardPressActiveRef.current) return;
        keyboardPressActiveRef.current = true;
        keyboardPressHandledRef.current = true;
        onPressStart();
    };

    const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!keyboardPressActiveRef.current) return;
        keyboardPressActiveRef.current = false;
        onPressEnd();
    };

    return {
        onClick,
        onKeyDown,
        onKeyUp,
        onLostPointerCapture,
        onPointerCancel: onPointerEnd,
        onPointerDown,
        onPointerUp: onPointerEnd,
    };
}
