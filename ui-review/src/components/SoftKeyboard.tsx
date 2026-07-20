import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createSimpleIme } from "simple-ime";
import {
  deleteSelectedText,
  isSoftKeyboardTarget,
  prepareReactControlledInputEvent,
  replaceSelectedText,
  type EditableElement,
} from "./softKeyboardUtils";

type KeyboardLayout = "letters" | "symbols" | "numeric";
type InputLanguage = "en" | "zh";

const NUMERIC_INPUT_MODES = new Set(["numeric", "decimal", "tel"]);

const letterRows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const symbolRows = ["1234567890", "-/:;()￥&@", "#+=!?.,"];

function getKeyboardLayout(target: EditableElement): KeyboardLayout {
  if (
    target instanceof HTMLInputElement &&
    (target.type === "number" || NUMERIC_INPUT_MODES.has(target.inputMode))
  ) {
    return "numeric";
  }

  return "letters";
}

function supportsChineseIme(target: EditableElement) {
  return target instanceof HTMLTextAreaElement || target.type === "text" || target.type === "search";
}

function KeyButton({ label, onPress, wide = false, emphasized = false }: {
  label: string;
  onPress: () => void;
  wide?: boolean;
  emphasized?: boolean;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault();
        onPress();
      }}
      className={`h-10 rounded-md border text-[15px] font-semibold shadow-[0_1px_1px_rgba(15,23,42,0.25)] transition active:translate-y-px ${
        wide ? "min-w-[72px] px-3" : "min-w-0 flex-1"
      } ${
        emphasized
          ? "border-[#64a5ff] bg-[#4d94ff] text-white"
          : "border-[#b8c2cf] bg-white text-[#1f2937] active:bg-[#dbeafe]"
      }`}
      aria-label={label}
    >
      {label}
    </button>
  );
}

/**
 * Console-wide touch keyboard. Native input events are retained so controlled
 * fields and existing form validation continue to own the actual field value.
 */
export default function SoftKeyboard() {
  const [target, setTarget] = useState<EditableElement | null>(null);
  const [layout, setLayout] = useState<KeyboardLayout>("letters");
  const [shift, setShift] = useState(false);
  const [inputLanguage, setInputLanguage] = useState<InputLanguage>("en");
  const [isComposingPinyin, setIsComposingPinyin] = useState(false);
  const pointerTargetRef = useRef<EditableElement | null>(null);
  const activeTargetRef = useRef<EditableElement | null>(null);
  const pinyinValueBeforeCompositionRef = useRef<string | null>(null);

  useEffect(() => {
    const ime = createSimpleIme();
    ime.turnOn();

    // 简体中文候选词由离线拼音引擎生成；隐藏其独立状态栏，统一使用控制台键盘的“中/EN”键。
    const statusBar = document.getElementById("sime-status-bar");
    if (statusBar) statusBar.style.display = "none";

    const candidateStyle = document.createElement("style");
    candidateStyle.textContent = `
      #sime-status-bar { display: none !important; }
      #sime-composition { min-height: 76px; border-radius: 6px; }
      #sime-preedit { height: 32px; line-height: 32px; font-size: 18px; }
      .sime-cnd-container { height: 44px; }
      .sime-cnd { height: 36px; padding: 0 8px; font-size: 18px; }
      .sime-prev-cand-button, .sime-next-cand-button { width: 28px; }
    `;
    document.head.append(candidateStyle);

    const handleCompositionStart = (event: CompositionEvent) => {
      if (event.target === activeTargetRef.current) {
        pinyinValueBeforeCompositionRef.current = activeTargetRef.current.value;
        setIsComposingPinyin(true);
      }
    };
    const handleCompositionEnd = (event: CompositionEvent) => {
      if (event.target === activeTargetRef.current) {
        pinyinValueBeforeCompositionRef.current = null;
        setIsComposingPinyin(false);
      }
    };
    const handlePinyinInput = (event: Event) => {
      const source = event instanceof CustomEvent ? event.detail?.__source__ : undefined;
      const previousValue = pinyinValueBeforeCompositionRef.current;
      if (source === "simple-ime" && event.target === activeTargetRef.current && previousValue !== null) {
        prepareReactControlledInputEvent(activeTargetRef.current, previousValue);
      }
    };
    window.addEventListener("compositionstart", handleCompositionStart, true);
    window.addEventListener("compositionend", handleCompositionEnd, true);
    window.addEventListener("input", handlePinyinInput, true);

    return () => {
      window.removeEventListener("compositionstart", handleCompositionStart, true);
      window.removeEventListener("compositionend", handleCompositionEnd, true);
      window.removeEventListener("input", handlePinyinInput, true);
      candidateStyle.remove();
      ime.dispose();
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const candidate = event.target;
      pointerTargetRef.current = candidate instanceof Element && isSoftKeyboardTarget(candidate) ? candidate : null;
    };

    const handleFocusIn = (event: FocusEvent) => {
      const candidate = event.target;
      if (!(candidate instanceof Element) || !isSoftKeyboardTarget(candidate)) return;

      // Avoid displaying over a screen simply because a field has autoFocus.
      if (pointerTargetRef.current !== candidate) return;

      setTarget(candidate);
      activeTargetRef.current = candidate;
      pinyinValueBeforeCompositionRef.current = null;
      setLayout(getKeyboardLayout(candidate));
      setShift(false);
      setIsComposingPinyin(false);
      window.setTimeout(() => candidate.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTarget(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!target || !target.isConnected) return null;

  const useChineseIme = inputLanguage === "zh" && supportsChineseIme(target);

  const pressImeKey = (key: string, code = key) => {
    target.focus({ preventScroll: true });
    const options = { bubbles: true, cancelable: true, key, code };
    target.dispatchEvent(new KeyboardEvent("keydown", options));
    target.dispatchEvent(new KeyboardEvent("keypress", options));
    target.dispatchEvent(new KeyboardEvent("keyup", options));
  };

  const toggleInputLanguage = () => {
    pressImeKey("Shift", "ShiftLeft");
    setInputLanguage((value) => value === "en" ? "zh" : "en");
    setIsComposingPinyin(false);
  };

  const pressText = (text: string) => {
    target.focus({ preventScroll: true });
    if (useChineseIme && /^[a-zA-Z']$/.test(text)) {
      pressImeKey(text.toLowerCase(), `Key${text.toUpperCase()}`);
      return;
    }
    replaceSelectedText(target, text);
    if (layout === "letters" && shift) setShift(false);
  };

  const pressDelete = () => {
    target.focus({ preventScroll: true });
    if (useChineseIme && isComposingPinyin) {
      pressImeKey("Backspace", "Backspace");
      return;
    }
    deleteSelectedText(target);
  };

  const pressEnter = () => {
    if (useChineseIme && isComposingPinyin) {
      pressImeKey("Enter", "Enter");
      return;
    }
    if (target instanceof HTMLTextAreaElement) {
      pressText("\n");
      return;
    }
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" }));
  };

  const close = () => {
    if (useChineseIme && isComposingPinyin) pressImeKey("Enter", "Enter");
    target.blur();
    setTarget(null);
    activeTargetRef.current = null;
    pinyinValueBeforeCompositionRef.current = null;
    setIsComposingPinyin(false);
  };

  const characters = layout === "symbols" ? symbolRows : letterRows;

  const screen = target.ownerDocument.getElementById("wt32-screen-root")?.getBoundingClientRect();
  const keyboard = (
    <section
      data-soft-keyboard
      className="fixed bottom-0 z-[9999] border-t border-[#9fb0c4] bg-[#d7dee8]/[0.98] px-4 pb-3 pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.28)] backdrop-blur"
      style={screen ? {
        bottom: window.innerHeight - screen.bottom,
        left: screen.left,
        transform: `scale(${screen.width / 1024})`,
        transformOrigin: "bottom left",
        width: 1024,
      } : undefined}
      aria-label="触控键盘"
    >
      <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-medium text-[#526274]">
        <span>{layout === "numeric" ? "数字输入" : "触控键盘"}</span>
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            close();
          }}
          className="rounded px-2 py-0.5 text-[#526274] hover:bg-white/70"
        >
          收起键盘
        </button>
      </div>

      {layout === "numeric" ? (
        <div className="mx-auto grid max-w-[376px] grid-cols-3 gap-1.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((key) => (
            <KeyButton
              key={key}
              label={key}
              emphasized={key === "⌫"}
              onPress={() => {
                if (key === "⌫") return pressDelete();
                pressText(key);
              }}
            />
          ))}
          <KeyButton label="完成" onPress={close} wide emphasized />
        </div>
      ) : (
        <div className="mx-auto max-w-[770px] space-y-1.5">
          {characters.map((row, index) => (
            <div key={row} className={`flex gap-1.5 ${index === 1 ? "px-7" : index === 2 ? "px-12" : ""}`}>
              {index === 2 && <KeyButton label={shift ? "⇧" : "⇧"} onPress={() => setShift((value) => !value)} wide emphasized={shift} />}
              {[...row].map((key) => <KeyButton key={key} label={shift ? key.toUpperCase() : key} onPress={() => pressText(shift ? key.toUpperCase() : key)} />)}
              {index === 2 && <KeyButton label="⌫" onPress={pressDelete} wide />}
            </div>
          ))}
          <div className="flex gap-1.5">
            {supportsChineseIme(target) && (
              <KeyButton
                label={inputLanguage === "zh" ? "EN" : "中"}
                onPress={toggleInputLanguage}
                wide
              />
            )}
            <KeyButton label={layout === "letters" ? "123" : "ABC"} onPress={() => setLayout((value) => value === "letters" ? "symbols" : "letters")} wide />
            <KeyButton
              label="空格"
              onPress={() => {
                if (useChineseIme && isComposingPinyin) {
                  pressImeKey(" ", "Space");
                  return;
                }
                pressText(" ");
              }}
            />
            <KeyButton label={target instanceof HTMLTextAreaElement ? "换行" : "完成"} onPress={target instanceof HTMLTextAreaElement ? pressEnter : close} wide emphasized />
          </div>
        </div>
      )}
    </section>
  );

  return screen ? createPortal(keyboard, target.ownerDocument.body) : keyboard;
}
