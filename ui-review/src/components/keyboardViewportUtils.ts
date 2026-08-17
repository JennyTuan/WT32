export type EditableElement = HTMLInputElement | HTMLTextAreaElement;

const EDITABLE_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "password", "number"]);

export function isNativeKeyboardTarget(element: Element): element is EditableElement {
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  return element instanceof HTMLInputElement
    && EDITABLE_INPUT_TYPES.has(element.type)
    && !element.disabled
    && !element.readOnly;
}
