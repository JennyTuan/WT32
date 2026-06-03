import { useEffect, useRef, useState } from "react";
import { Network } from "lucide-react";
import { useI18n } from "../lib/i18nContext";

type ModuleStatus = { key: string; label: string; ok: boolean };

const MODULES: ModuleStatus[] = [
    { key: "gateway", label: "gateway", ok: true },
    { key: "system", label: "system", ok: false },
    { key: "scu", label: "scu", ok: true },
    { key: "dicom", label: "dicom", ok: true },
    { key: "breath", label: "breath", ok: true },
    { key: "image", label: "image", ok: true },
    { key: "reconstruct", label: "reconstruct", ok: true },
];

export default function NetworkStatusButton({ iconSize = 24 }: { iconSize?: number }) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener("mousedown", handler);
        return () => window.removeEventListener("mousedown", handler);
    }, [open]);

    const errorCount = MODULES.filter((m) => !m.ok).length;

    return (
        <div ref={ref} className="relative">
            <div
                role="button"
                aria-label={t("networkStatus.title")}
                onClick={() => setOpen((o) => !o)}
                className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70"
            >
                <Network size={iconSize} />
                {errorCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold">
                        {errorCount}
                    </span>
                )}
            </div>
            {open && (
                <div className="absolute right-0 top-full mt-2 w-[200px] bg-white border border-[#B0C4DE] rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="px-3 py-1.5 bg-[#F8FAFC] border-b border-[#EEF2F9] text-[11px] font-bold text-[#90A4AE] uppercase tracking-wider">
                        {t("networkStatus.title")}
                    </div>
                    {MODULES.map((m, i) => (
                        <div
                            key={m.key}
                            className={`flex items-center justify-between px-3 py-2 text-[13px] text-[#37474F] ${
                                i < MODULES.length - 1 ? "border-b border-[#EEF2F9]" : ""
                            }`}
                        >
                            <span>{m.label}</span>
                            <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.ok ? "bg-[#4CAF50]" : "bg-[#D32F2F]"}`}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
