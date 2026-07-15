import { useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { FeedbackNotice } from "../components/FeedbackNotice";
import { calcAgeFromBirthDate, createPatient } from "../lib/patientsApi";
import { useI18n } from "../lib/i18nContext";

interface InputBoxProps {
    label: string;
    value: string;
    onChange?: (value: string) => void;
    type?: string;
    placeholder?: string;
    readOnly?: boolean;
    required?: boolean;
}

const InputBox = ({ label, value, onChange, type = "text", placeholder = "", readOnly = false, required = false }: InputBoxProps) => (
    <div className="flex flex-col bg-white border border-[#B0C4DE] rounded-md p-2 shadow-sm focus-within:border-[#4D94FF] focus-within:ring-1 focus-within:ring-[#4D94FF]/20 transition-all">
        <label className="text-[10px] font-black uppercase text-[#90A4AE] tracking-wider leading-none mb-1 flex items-center gap-1">
            {required && <span className="text-red-500">*</span>}
            {label}
        </label>
        <input
            type={type}
            value={value}
            placeholder={placeholder}
            readOnly={readOnly}
            onChange={(e) => onChange?.(e.target.value)}
            onInput={(e) => onChange?.(e.currentTarget.value)}
            onBlur={(e) => onChange?.(e.currentTarget.value)}
            className="text-[14px] font-bold text-[#37474F] bg-transparent outline-none w-full"
        />
    </div>
);

interface SelectBoxProps {
    label: string;
    value: string;
    options: { label: string; value: string }[];
    onChange: (value: string) => void;
    unit?: string;
    required?: boolean;
}

const SelectBox = ({ label, value, options, onChange, unit = "", required = false }: SelectBoxProps) => (
    <div className="flex flex-col bg-white border border-[#B0C4DE] rounded-md p-2 shadow-sm relative group hover:border-[#4D94FF]/50 transition-all">
        <label className="text-[10px] font-black uppercase text-[#90A4AE] tracking-wider leading-none mb-1 flex items-center gap-1">
            {required && <span className="text-red-500">*</span>}
            {label}
        </label>
        <div className="flex items-center gap-2">
            <div className="flex-1 relative">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="appearance-none w-full text-[14px] font-bold text-[#37474F] bg-transparent outline-none pr-5 cursor-pointer"
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <ChevronDown size={16} className="text-[#90A4AE] group-hover:text-[#4D94FF] absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {unit && <span className="text-[10px] font-bold text-[#90A4AE]">{unit}</span>}
        </div>
    </div>
);

interface AddPatientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
}

const generateDefaultPatientId = (): string => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const rand = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    return `P${y}${m}${d}${rand}`;
};

const emptyForm = () => ({
    lastName: "",
    firstName: "",
    age: "",
    birthday: "",
    gender: "",
    height: "",
    weight: "",
    idNumber: "",
    patientId: generateDefaultPatientId(),
});

const AddPatientScreen = ({ isOpen, onClose, onCreated }: AddPatientModalProps) => {
    const { t } = useI18n();
    const [formData, setFormData] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset form whenever the modal is reopened so each new entry starts clean.
    useEffect(() => {
        if (isOpen) {
            setFormData(emptyForm());
            setError(null);
            setSubmitting(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const update = (key: keyof ReturnType<typeof emptyForm>) => (value: string) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
    };

    const updateBirthday = (value: string) => {
        setFormData((prev) => ({
            ...prev,
            birthday: value,
            age: value ? String(calcAgeFromBirthDate(value)) : prev.age,
        }));
    };

    const handleSave = async () => {
        setError(null);

        if (!formData.lastName.trim() && !formData.firstName.trim()) {
            setError(t("addPatient.errorFirstOrLastName"));
            return;
        }
        if (!formData.patientId.trim()) {
            setError(t("addPatient.errorPatientId"));
            return;
        }
        if (!formData.age.trim()) {
            setError(t("addPatient.errorAgeRequired"));
            return;
        }
        if (!formData.gender) {
            setError(t("addPatient.errorGender"));
            return;
        }

        const ageNum = Number(formData.age);
        const heightNum = formData.height ? Number(formData.height) : null;
        const weightNum = formData.weight ? Number(formData.weight) : null;
        if (!Number.isInteger(ageNum) || ageNum < 0) {
            setError(t("addPatient.errorAgeNumber"));
            return;
        }
        if (heightNum !== null && Number.isNaN(heightNum)) {
            setError(t("addPatient.errorHeightNumber"));
            return;
        }
        if (weightNum !== null && Number.isNaN(weightNum)) {
            setError(t("addPatient.errorWeightNumber"));
            return;
        }

        setSubmitting(true);
        try {
            await createPatient({
                last_name: formData.lastName.trim() || undefined,
                first_name: formData.firstName.trim() || undefined,
                patient_id: formData.patientId.trim(),
                id_number: formData.idNumber.trim() || undefined,
                gender: formData.gender,
                age: ageNum,
                birth_date: formData.birthday || null,
                height: heightNum,
                weight: weightNum,
            });
            onCreated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : t("addPatient.errorSave"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] rounded-md overflow-hidden">
            {/* Modal Container */}
            <div className="w-[840px] bg-white rounded-xl border border-[#B0C4DE] shadow-2xl overflow-hidden flex flex-col transition-all duration-200">
                {/* Tab-like Title Area */}
                <div className="h-[64px] bg-[#F8FAFC] border-b border-[#EEF2F9] px-8 flex items-center justify-between">
                    <h2 className="text-[24px] font-bold text-[#263238] tracking-tight">{t("addPatient.title")}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-[#90A4AE] hover:text-[#D32F2F] hover:bg-red-50 rounded-full transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Form Body */}
                <div className="p-10 flex flex-col gap-6 bg-white">
                    <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                        <InputBox label={t("addPatient.lastName")} value={formData.lastName} onChange={update("lastName")} placeholder={t("addPatient.lastNamePlaceholder")} required />
                        <InputBox label={t("addPatient.firstName")} value={formData.firstName} onChange={update("firstName")} placeholder={t("addPatient.firstNamePlaceholder")} required />

                        <InputBox label={t("addPatient.age")} value={formData.age} onChange={update("age")} type="number" placeholder={t("addPatient.agePlaceholder")} required />
                        <InputBox label={t("addPatient.birthDate")} value={formData.birthday} onChange={updateBirthday} type="date" />
                        <SelectBox
                            label={t("addPatient.gender")}
                            value={formData.gender}
                            onChange={update("gender")}
                            options={[
                                { label: t("addPatient.selectPlaceholder"), value: "" },
                                { label: t("patientList.gender.male"), value: "male" },
                                { label: t("patientList.gender.female"), value: "female" },
                                { label: t("patientList.gender.other"), value: "other" },
                            ]}
                            required
                        />

                        <InputBox label={t("addPatient.height")} value={formData.height} onChange={update("height")} type="number" placeholder={t("addPatient.heightPlaceholder")} />
                        <InputBox label={t("addPatient.weight")} value={formData.weight} onChange={update("weight")} type="number" placeholder={t("addPatient.weightPlaceholder")} />

                        <InputBox label={t("addPatient.idNumber")} value={formData.idNumber} onChange={update("idNumber")} placeholder={t("addPatient.optional")} />
                        <InputBox label={t("addPatient.patientId")} value={formData.patientId} onChange={update("patientId")} required />
                    </div>

                    {error && (
                        <FeedbackNotice compact>{error}</FeedbackNotice>
                    )}
                </div>

                {/* Actions */}
                <div className="h-[90px] bg-[#F8FAFC] border-t border-[#EEF2F9] px-10 flex items-center justify-end gap-6">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="h-[44px] px-10 rounded-md border-2 border-[#4D94FF] text-[#4D94FF] font-black text-[13px] uppercase tracking-widest hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={submitting}
                        className="h-[44px] px-12 rounded-md bg-[#4D94FF] text-white font-black text-[13px] uppercase tracking-widest shadow-lg hover:bg-blue-600 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? t("common.saving") : t("common.save")}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddPatientScreen;
