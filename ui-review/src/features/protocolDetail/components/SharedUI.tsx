import { ChevronDown } from "lucide-react";

const clampNumberInput = (value: string, min?: number, max?: number) => {
    if (min === undefined && max === undefined) return value;
    const normalized = value.replace(/[^\d.-]/g, "").trim();
    if (!normalized) return value;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return value;
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    return String(next);
};

export function FieldInput({ label, value, placeholder, required, onChange, min, max, disabled = false }: {
    label: string; value?: string | number; placeholder?: string; required?: boolean; onChange?: (value: string) => void;
    min?: number; max?: number; disabled?: boolean;
}) {
    const numericRange = min !== undefined || max !== undefined;

    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight flex items-center gap-0.5 select-none">
                {label}
                {required && <span className="text-red-500 text-[12px] leading-none select-none">*</span>}
            </label>
            <input
                type="text"
                value={value !== undefined && value !== null ? String(value) : ""}
                onChange={(event) => onChange?.(event.target.value)}
                onBlur={(event) => {
                    const next = clampNumberInput(event.target.value, min, max);
                    if (next !== event.target.value) onChange?.(next);
                }}
                readOnly={!onChange || disabled}
                disabled={disabled}
                placeholder={placeholder}
                inputMode={numericRange ? "decimal" : undefined}
                className={`w-full h-[40px] px-3 border border-[#B0C4DE] rounded-md text-[13px] font-bold outline-none placeholder:font-normal placeholder:text-[#90A4AE]/40 shadow-sm ${disabled
                    ? "bg-[#F8FAFC] text-[#78909C] cursor-not-allowed"
                    : "bg-white text-[#37474F] focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10 select-text"
                    }`}
            />
        </div>
    );
}

export function FieldSelect({ label, value, options, required, onChange }: {
    label: string;
    value?: string | number;
    options: Array<string | { value: string; label: string }>;
    required?: boolean;
    onChange?: (value: string) => void;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight flex items-center gap-0.5">
                {label}
                {required && <span className="text-red-500 text-[12px] leading-none select-none">*</span>}
            </label>
            <div className="relative">
                <select
                    value={value !== undefined ? String(value) : (typeof options[0] === "string" ? options[0] : options[0]?.value)}
                    onChange={(event) => onChange?.(event.target.value)}
                    className="w-full h-[40px] px-3 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none appearance-none cursor-pointer focus:border-[#4D94FF] shadow-sm"
                >
                    {options.map((option) => {
                        const normalized = typeof option === "string"
                            ? { value: option, label: option }
                            : option;
                        return <option key={normalized.value} value={normalized.value}>{normalized.label}</option>;
                    })}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
            </div>
        </div>
    );
}

export function FieldSpinner({ label, value, onChange, step = 1, min, max }: {
    label: string; value?: string | number; onChange?: (value: string) => void;
    step?: number; min?: number; max?: number;
}) {
    const handleStep = (dir: 1 | -1) => {
        if (!onChange) return;
        const current = parseFloat(String(value ?? 0)) || 0;
        let next = Math.round((current + dir * step) * 1000) / 1000;
        if (min !== undefined) next = Math.max(min, next);
        if (max !== undefined) next = Math.min(max, next);
        onChange(String(next));
    };

    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight select-none">{label}</label>
            <div className="relative">
                <input
                    type="text"
                    value={value !== undefined && value !== null ? String(value) : ""}
                    onChange={(event) => onChange?.(event.target.value)}
                    onBlur={(event) => {
                        const next = clampNumberInput(event.target.value, min, max);
                        if (next !== event.target.value) onChange?.(next);
                    }}
                    readOnly={!onChange}
                    inputMode="decimal"
                    className="w-full h-[40px] px-3 pr-10 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10 shadow-sm select-text"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0 border-l border-[#B0C4DE] pl-2 h-7 justify-center">
                    <ChevronDown size={14} className="text-[#94A3B8] rotate-180 cursor-pointer hover:text-[#4D94FF] active:text-[#1E88E5]" onClick={() => handleStep(1)} />
                    <ChevronDown size={14} className="text-[#94A3B8] cursor-pointer hover:text-[#4D94FF] active:text-[#1E88E5]" onClick={() => handleStep(-1)} />
                </div>
            </div>
        </div>
    );
}

export function Divider() {
    return <div className="col-span-2 h-[1px] bg-[#EEF2F9] my-1" />;
}
