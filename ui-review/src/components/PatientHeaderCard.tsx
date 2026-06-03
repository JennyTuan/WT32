import { User } from "lucide-react";
import { useI18n } from "../lib/i18nContext";

type PatientHeaderCardProps = {
    name?: string | null;
    patientId?: string | null;
};

export default function PatientHeaderCard({ name, patientId }: PatientHeaderCardProps) {
    const { t } = useI18n();
    const isSelected = Boolean(name);

    return (
        <div
            className={`flex items-center gap-3 py-1.5 px-3 border rounded-sm min-w-[220px] ${
                isSelected
                    ? "bg-[#DCE6F2] border-[#B0C4DE]"
                    : "bg-[#F4F6FA] border-[#B0C4DE]/60 border-dashed"
            }`}
        >
            <div
                className={`w-10 h-10 rounded-sm flex items-center justify-center text-white shrink-0 ${
                    isSelected ? "bg-[#4A6982]" : "bg-[#B0BEC5]"
                }`}
            >
                <User size={22} strokeWidth={1.8} />
            </div>
            <div className="flex flex-col leading-tight min-w-0">
                <span
                    className={`text-[15px] font-bold tracking-tight truncate ${
                        isSelected ? "text-[#37474F]" : "text-[#90A4AE]"
                    }`}
                >
                    {name ?? t("patientHeader.unselected")}
                </span>
                <span
                    className={`text-[12px] font-medium mt-0.5 tabular-nums truncate ${
                        isSelected ? "text-[#546E7A]" : "text-[#B0BEC5]"
                    }`}
                >
                    {patientId ? t("patientHeader.idPrefix", { id: patientId }) : t("patientHeader.idEmpty")}
                </span>
            </div>
        </div>
    );
}
