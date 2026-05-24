import { useEffect } from "react";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export type DetailField = {
  label: string;
  value: ReactNode;
  span?: "single" | "full";
  mono?: boolean;
};

export type DetailSection = {
  title?: string;
  fields: DetailField[];
};

type LogDetailModalProps = {
  title: string;
  subtitle?: string;
  sections: DetailSection[];
  rawJson?: unknown;
  onClose: () => void;
};

export default function LogDetailModal({ title, subtitle, sections, rawJson, onClose }: LogDetailModalProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const rawText = rawJson != null ? JSON.stringify(rawJson, null, 2) : null;

  return (
    <div
      className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88%] w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-[#DDEAF8]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[#E2EBF5] px-5 py-4">
          <div className="min-w-0">
            <div className="text-[16px] font-black text-[#263238]">{title}</div>
            {subtitle && (
              <div className="mt-1 truncate text-[12px] text-[#90A4AE]">{subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#90A4AE] hover:bg-[#F5F8FC] hover:text-[#37474F]"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {sections.map((section, idx) => (
            <div key={idx} className={idx > 0 ? "mt-5" : ""}>
              {section.title && (
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[#90A4AE]">
                  {section.title}
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {section.fields.map((field, fIdx) => (
                  <div
                    key={fIdx}
                    className={field.span === "full" ? "col-span-2" : "col-span-1"}
                  >
                    <div className="text-[11px] font-bold text-[#90A4AE]">{field.label}</div>
                    <div
                      className={`mt-1 break-words text-[13px] text-[#37474F] ${field.mono ? "font-mono" : ""}`}
                    >
                      {field.value ?? <span className="text-[#B0C4DE]">—</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {rawText && (
            <div className="mt-5">
              <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[#90A4AE]">
                原始数据
              </div>
              <pre className="max-h-[200px] overflow-auto rounded-lg border border-[#E2EBF5] bg-[#F8FAFC] px-3 py-2 font-mono text-[11px] leading-relaxed text-[#37474F]">
                {rawText}
              </pre>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-[#E2EBF5] px-5 py-3">
          <button
            onClick={onClose}
            className="h-9 rounded-lg bg-[#4D94FF] px-4 text-[13px] font-bold text-white hover:bg-blue-600"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
