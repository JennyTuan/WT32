import { ChevronDown } from "lucide-react";

export function FieldInput({ label, value, placeholder, required, onChange }: {
    label: string; value?: string | number; placeholder?: string; required?: boolean; onChange?: (value: string) => void;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight flex items-center gap-0.5">
                {label}
                {required && <span className="text-red-500 text-[12px] leading-none select-none">*</span>}
            </label>
            <input
                type="text"
                value={value !== undefined && value !== null ? String(value) : ""}
                onChange={(event) => onChange?.(event.target.value)}
                placeholder={placeholder}
                className="w-full h-[40px] px-3 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none placeholder:font-normal placeholder:text-[#90A4AE]/40 focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10 shadow-sm"
            />
        </div>
    );
}

export function FieldSelect({ label, value, options, required, onChange }: {
    label: string; value?: string | number; options: string[]; required?: boolean; onChange?: (value: string) => void;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight flex items-center gap-0.5">
                {label}
                {required && <span className="text-red-500 text-[12px] leading-none select-none">*</span>}
            </label>
            <div className="relative">
                <select
                    value={value !== undefined ? String(value) : options[0]}
                    onChange={(event) => onChange?.(event.target.value)}
                    className="w-full h-[40px] px-3 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none appearance-none cursor-pointer focus:border-[#4D94FF] shadow-sm"
                >
                    {options.map((o) => <option key={o}>{o}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#90A4AE] pointer-events-none" />
            </div>
        </div>
    );
}

export function FieldSpinner({ label, value, onChange }: { label: string; value?: string | number; onChange?: (value: string) => void }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-[#90A4AE] ml-1 uppercase tracking-tight">{label}</label>
            <div className="relative">
                <input
                    type="text"
                    value={value !== undefined && value !== null ? String(value) : ""}
                    onChange={(event) => onChange?.(event.target.value)}
                    className="w-full h-[40px] px-3 pr-10 bg-white border border-[#B0C4DE] rounded-md text-[13px] font-bold text-[#37474F] outline-none focus:border-[#4D94FF] focus:ring-1 focus:ring-[#4D94FF]/10 shadow-sm"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0 border-l border-[#B0C4DE] pl-2 h-7 justify-center">
                    <ChevronDown size={14} className="text-[#94A3B8] rotate-180 cursor-pointer hover:text-[#4D94FF]" />
                    <ChevronDown size={14} className="text-[#94A3B8] cursor-pointer hover:text-[#4D94FF]" />
                </div>
            </div>
        </div>
    );
}

export function Divider() {
    return <div className="col-span-2 h-[1px] bg-[#EEF2F9] my-1" />;
}
