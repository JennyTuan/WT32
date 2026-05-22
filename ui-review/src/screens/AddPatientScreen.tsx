import { useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { createPatient } from "../lib/patientsApi";

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
    birthday: "",
    gender: "",
    height: "",
    weight: "",
    idNumber: "",
    patientId: generateDefaultPatientId(),
});

const AddPatientScreen = ({ isOpen, onClose, onCreated }: AddPatientModalProps) => {
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

    const handleSave = async () => {
        setError(null);

        if (!formData.lastName.trim() && !formData.firstName.trim()) {
            setError("请填写姓或名");
            return;
        }
        if (!formData.patientId.trim()) {
            setError("患者ID 不能为空");
            return;
        }
        if (!formData.birthday) {
            setError("请填写出生日期");
            return;
        }
        if (!formData.gender) {
            setError("请选择性别");
            return;
        }

        const heightNum = formData.height ? Number(formData.height) : null;
        const weightNum = formData.weight ? Number(formData.weight) : null;
        if (heightNum !== null && Number.isNaN(heightNum)) {
            setError("身高需为数字");
            return;
        }
        if (weightNum !== null && Number.isNaN(weightNum)) {
            setError("体重需为数字");
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
                birth_date: formData.birthday,
                height: heightNum,
                weight: weightNum,
            });
            onCreated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : "保存失败");
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
                    <h2 className="text-[24px] font-bold text-[#263238] tracking-tight">新增患者</h2>
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
                        <InputBox label="姓" value={formData.lastName} onChange={update("lastName")} placeholder="请输入姓" required />
                        <InputBox label="名" value={formData.firstName} onChange={update("firstName")} placeholder="请输入名" required />

                        <InputBox label="出生日期" value={formData.birthday} onChange={update("birthday")} type="date" required />
                        <SelectBox
                            label="性别"
                            value={formData.gender}
                            onChange={update("gender")}
                            options={[
                                { label: "请选择", value: "" },
                                { label: "男", value: "male" },
                                { label: "女", value: "female" },
                            ]}
                            required
                        />

                        <InputBox label="身高 (cm)" value={formData.height} onChange={update("height")} type="number" placeholder="请输入身高" />
                        <InputBox label="体重 (kg)" value={formData.weight} onChange={update("weight")} type="number" placeholder="请输入体重" />

                        <InputBox label="身份证号" value={formData.idNumber} onChange={update("idNumber")} placeholder="可选" />
                        <InputBox label="患者ID" value={formData.patientId} onChange={update("patientId")} required />
                    </div>

                    {error && (
                        <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-600 text-[13px] rounded">
                            {error}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="h-[90px] bg-[#F8FAFC] border-t border-[#EEF2F9] px-10 flex items-center justify-end gap-6">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="h-[44px] px-10 rounded-md border-2 border-[#4D94FF] text-[#4D94FF] font-black text-[13px] uppercase tracking-widest hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={submitting}
                        className="h-[44px] px-12 rounded-md bg-[#4D94FF] text-white font-black text-[13px] uppercase tracking-widest shadow-lg hover:bg-blue-600 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? "保存中..." : "保存"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddPatientScreen;
