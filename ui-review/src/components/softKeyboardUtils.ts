export type EditableElement = HTMLInputElement | HTMLTextAreaElement;

type ReactTrackedElement = EditableElement & {
  _valueTracker?: { setValue: (value: string) => void };
};

const TEXT_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "password"]);

export function isSoftKeyboardTarget(element: Element): element is EditableElement {
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  if (!(element instanceof HTMLInputElement) || element.disabled || element.readOnly) {
    return false;
  }

  return TEXT_INPUT_TYPES.has(element.type) || element.type === "number";
}

function dispatchInputEvent(target: EditableElement, inputType: string, data: string | null) {
  try {
    target.dispatchEvent(new InputEvent("input", { bubbles: true, data, inputType }));
  } catch {
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * 外部拼音引擎会通过元素实例 setter 写值，React 会将其误判为已同步。
 * 在派发 input 前恢复追踪器的旧值，确保受控字段能接收候选词结果。
 */
export function prepareReactControlledInputEvent(target: EditableElement, previousValue: string) {
  (target as ReactTrackedElement)._valueTracker?.setValue(previousValue);
}

function getSelection(target: EditableElement) {
  try {
    const start = target.selectionStart ?? target.value.length;
    return { start, end: target.selectionEnd ?? start };
  } catch {
    // number inputs do not expose selection APIs in every browser.
    return { start: target.value.length, end: target.value.length };
  }
}

function moveCaret(target: EditableElement, position: number) {
  try {
    target.setSelectionRange(position, position);
  } catch {
    // Keep the browser-supported caret behavior for number inputs.
  }
}

export function replaceSelectedText(target: EditableElement, text: string) {
  const { start, end } = getSelection(target);
  const nextValue = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`;
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), "value");

  descriptor?.set?.call(target, nextValue);
  moveCaret(target, start + text.length);
  dispatchInputEvent(target, "insertText", text);
}

export function deleteSelectedText(target: EditableElement) {
  const { start, end } = getSelection(target);
  const deleteStart = start === end ? Math.max(0, start - 1) : start;
  const nextValue = `${target.value.slice(0, deleteStart)}${target.value.slice(end)}`;
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), "value");

  descriptor?.set?.call(target, nextValue);
  moveCaret(target, deleteStart);
  dispatchInputEvent(target, "deleteContentBackward", null);
}
