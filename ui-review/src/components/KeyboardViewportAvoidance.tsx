import { useEffect, useRef } from "react";
import { isNativeKeyboardTarget, type EditableElement } from "./keyboardViewportUtils";
type ScrollReservation = {
  element: HTMLElement;
  paddingBottom: string;
  scrollPaddingBottom: string;
  basePaddingBottom: number;
  baseScrollPaddingBottom: number;
};

const KEYBOARD_GAP = 16;
const KEYBOARD_VISIBILITY_THRESHOLD = 80;

function findScrollContainer(target: EditableElement) {
  const designatedContainer = target.closest<HTMLElement>("[data-keyboard-avoidance-scroll]");
  if (designatedContainer) return designatedContainer;

  let ancestor = target.parentElement;
  while (ancestor) {
    const overflowY = window.getComputedStyle(ancestor).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && ancestor.scrollHeight > ancestor.clientHeight) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  return null;
}

function getScrollScale(container: HTMLElement) {
  if (!container.offsetHeight) return 1;
  return container.getBoundingClientRect().height / container.offsetHeight || 1;
}

/**
 * Windows 触控键盘属于操作系统：页面只观察可视视口变化，并保证当前输入框留在键盘上方。
 */
export default function KeyboardViewportAvoidance() {
  const activeTargetRef = useRef<EditableElement | null>(null);
  const reservationRef = useRef<ScrollReservation | null>(null);

  useEffect(() => {
    const restoreScrollSpace = () => {
      const reservation = reservationRef.current;
      if (!reservation) return;
      reservation.element.style.paddingBottom = reservation.paddingBottom;
      reservation.element.style.scrollPaddingBottom = reservation.scrollPaddingBottom;
      reservationRef.current = null;
    };

    const updateKeyboardAvoidance = () => {
      const target = activeTargetRef.current;
      const viewport = window.visualViewport;
      const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const keyboardHeight = Math.max(0, window.innerHeight - viewportBottom);

      if (!target || !target.isConnected || keyboardHeight < KEYBOARD_VISIBILITY_THRESHOLD) {
        restoreScrollSpace();
        return;
      }

      const scrollContainer = findScrollContainer(target);
      if (!scrollContainer) return;

      const existingReservation = reservationRef.current;
      if (existingReservation && existingReservation.element !== scrollContainer) {
        restoreScrollSpace();
      }

      const reservation = reservationRef.current ?? {
        element: scrollContainer,
        paddingBottom: scrollContainer.style.paddingBottom,
        scrollPaddingBottom: scrollContainer.style.scrollPaddingBottom,
        basePaddingBottom: Number.parseFloat(window.getComputedStyle(scrollContainer).paddingBottom) || 0,
        baseScrollPaddingBottom: Number.parseFloat(window.getComputedStyle(scrollContainer).scrollPaddingBottom) || 0,
      };
      reservationRef.current = reservation;

      const scale = getScrollScale(scrollContainer);
      const scrollGap = KEYBOARD_GAP / scale;
      scrollContainer.style.paddingBottom = `${reservation.basePaddingBottom + keyboardHeight / scale + scrollGap}px`;
      scrollContainer.style.scrollPaddingBottom = `${reservation.baseScrollPaddingBottom + keyboardHeight / scale + scrollGap}px`;

      const targetRect = target.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const visibleTop = containerRect.top + KEYBOARD_GAP;
      const visibleBottom = Math.min(containerRect.bottom - KEYBOARD_GAP, viewportBottom - KEYBOARD_GAP);
      const offset = targetRect.bottom > visibleBottom
        ? targetRect.bottom - visibleBottom
        : targetRect.top < visibleTop
          ? targetRect.top - visibleTop
          : 0;

      if (offset) scrollContainer.scrollBy({ top: offset / scale, behavior: "auto" });
    };

    let animationFrame = 0;
    let focusOutFrame = 0;
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateKeyboardAvoidance);
    };

    const handleFocusIn = (event: FocusEvent) => {
      activeTargetRef.current = event.target instanceof Element && isNativeKeyboardTarget(event.target)
        ? event.target
        : null;
      scheduleUpdate();
    };
    const handleFocusOut = () => {
      window.cancelAnimationFrame(focusOutFrame);
      focusOutFrame = window.requestAnimationFrame(() => {
        const focused = document.activeElement;
        activeTargetRef.current = focused instanceof Element && isNativeKeyboardTarget(focused)
          ? focused
          : null;
        scheduleUpdate();
      });
    };

    const initiallyFocused = document.activeElement;
    activeTargetRef.current = initiallyFocused instanceof Element && isNativeKeyboardTarget(initiallyFocused)
      ? initiallyFocused
      : null;
    scheduleUpdate();

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(focusOutFrame);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      restoreScrollSpace();
    };
  }, []);

  return null;
}
