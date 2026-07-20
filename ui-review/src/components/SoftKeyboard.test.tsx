import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { createSimpleIme } from "simple-ime";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteSelectedText,
  isSoftKeyboardTarget,
  prepareReactControlledInputEvent,
  replaceSelectedText,
} from "./softKeyboardUtils";

const mountedRoots: ReturnType<typeof createRoot>[] = [];

afterEach(() => {
  mountedRoots.splice(0).forEach((root) => root.unmount());
  document.body.replaceChildren();
});

function pressImeKey(target: HTMLInputElement, key: string, code = key) {
  const options = { bubbles: true, cancelable: true, key, code };
  target.dispatchEvent(new KeyboardEvent("keydown", options));
  target.dispatchEvent(new KeyboardEvent("keypress", options));
  target.dispatchEvent(new KeyboardEvent("keyup", options));
}

describe("SoftKeyboard", () => {
  it("accepts editable text and numeric fields only", () => {
    const text = document.createElement("input");
    const number = document.createElement("input");
    const date = document.createElement("input");
    const checkbox = document.createElement("input");
    const readonly = document.createElement("textarea");
    number.type = "number";
    date.type = "date";
    checkbox.type = "checkbox";
    readonly.readOnly = true;

    expect(isSoftKeyboardTarget(text)).toBe(true);
    expect(isSoftKeyboardTarget(number)).toBe(true);
    expect(isSoftKeyboardTarget(date)).toBe(false);
    expect(isSoftKeyboardTarget(checkbox)).toBe(false);
    expect(isSoftKeyboardTarget(readonly)).toBe(false);
  });

  it("replaces a selection and emits an input event for controlled fields", () => {
    const input = document.createElement("input");
    input.value = "ABCD";
    input.setSelectionRange(1, 3);
    let inputEvents = 0;
    input.addEventListener("input", () => inputEvents += 1);

    replaceSelectedText(input, "xy");

    expect(input.value).toBe("AxyD");
    expect(input.selectionStart).toBe(3);
    expect(inputEvents).toBe(1);
  });

  it("deletes the preceding character when there is no selection", () => {
    const input = document.createElement("input");
    input.value = "12.3";
    input.setSelectionRange(3, 3);

    deleteSelectedText(input);

    expect(input.value).toBe("123");
    expect(input.selectionStart).toBe(2);
  });

  it("updates number fields without relying on their unsupported selection API", () => {
    const input = document.createElement("input");
    input.type = "number";
    input.value = "12";

    replaceSelectedText(input, "3");

    expect(input.value).toBe("123");
  });

  it("commits a selected pinyin candidate through a controlled React input", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    function ControlledInput() {
      const [value, setValue] = useState("");
      return <>
        <input type="text" value={value} onChange={(event) => setValue(event.target.value)} />
        <output>{value}</output>
      </>;
    }

    act(() => root.render(<ControlledInput />));
    const input = container.querySelector("input");
    if (!input) throw new Error("Controlled input was not rendered");

    const ime = createSimpleIme();
    ime.turnOn();
    let valueBeforeComposition: string | null = null;
    input.addEventListener("compositionstart", () => {
      valueBeforeComposition = input.value;
    }, true);
    input.addEventListener("input", (event) => {
      const source = event instanceof CustomEvent ? event.detail?.__source__ : undefined;
      if (source === "simple-ime" && valueBeforeComposition !== null) {
        prepareReactControlledInputEvent(input, valueBeforeComposition);
      }
    }, true);
    input.focus();
    act(() => {
      pressImeKey(input, "Shift", "ShiftLeft");
      pressImeKey(input, "n", "KeyN");
      pressImeKey(input, "i", "KeyI");
    });

    const candidate = document.querySelector(".sime-cnd");
    if (!candidate) throw new Error("Pinyin candidate was not rendered");
    act(() => candidate.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })));

    expect(input.value).not.toBe("");
    expect(container.querySelector("output")?.textContent).toBe(input.value);
    ime.dispose();
  });
});
