import { describe, expect, it } from "vitest";
import { isNativeKeyboardTarget } from "./KeyboardViewportAvoidance";

describe("KeyboardViewportAvoidance", () => {
  it("keeps standard text and number inputs available to the system keyboard", () => {
    const text = document.createElement("input");
    const number = document.createElement("input");
    const multiline = document.createElement("textarea");
    number.type = "number";

    expect(isNativeKeyboardTarget(text)).toBe(true);
    expect(isNativeKeyboardTarget(number)).toBe(true);
    expect(isNativeKeyboardTarget(multiline)).toBe(true);
  });

  it("does not treat non-text controls or read-only fields as keyboard targets", () => {
    const date = document.createElement("input");
    const checkbox = document.createElement("input");
    const readonly = document.createElement("textarea");
    date.type = "date";
    checkbox.type = "checkbox";
    readonly.readOnly = true;

    expect(isNativeKeyboardTarget(date)).toBe(false);
    expect(isNativeKeyboardTarget(checkbox)).toBe(false);
    expect(isNativeKeyboardTarget(readonly)).toBe(false);
  });
});
