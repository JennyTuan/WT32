import { useState } from "react";
import {
    ChevronDown,
    ChevronUp,
    X,
} from "lucide-react";

interface InputBoxProps {
    label: string;
    value: string;
    type?: string;
    placeholder?: string;
    readOnly?: boolean;
}

const InputBox = ({ label, value, type = "text", placeholder = "", readOnly = false }: InputBoxProps) => (
    <div className="flex flex-col bg-white border border-[#B0C4DE] rounded-md p-2 shadow-sm focus-within:border-[#4D94FF] focus-within:ring-1 focus-within:ring-[#4D94FF]/20 transition-all">
        <label className="text-[10px] font-black uppercase text-[#90A4AE] tracking-wider leading-none mb-1">
            {label}
        </label>
        <input
            type={type}
            value={value}
            placeholder={placeholder}
            readOnly={readOnly}
            className="text-[14px] font-bold text-[#37474F] bg-transparent outline-none w-full"
        />
    </div>
);

interface SelectBoxProps {
    label: string;
    value: string;
    hasArrows?: boolean;
    unit?: string;
}

const SelectBox = ({ label, value, hasArrows = false, unit = "" }: SelectBoxProps) => (
    <div className="flex flex-col bg-white border border-[#B0C4DE] rounded-md p-2 shadow-sm relative group hover:border-[#4D94FF]/50 transition-all">
        <label className="text-[10px] font-black uppercase text-[#90A4AE] tracking-wider leading-none mb-1 flex items-center gap-1">
            <span className="text-red-500">*</span> {label}
        </label>
        <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center justify-between cursor-pointer">
                <span className="text-[14px] font-bold text-[#37474F]">{value}</span>
                <ChevronDown size={16} className="text-[#90A4AE] group-hover:text-[#4D94FF]" />
            </div>
            {hasArrows && (
                <div className="flex flex-col border-l border-[#EEF2F9] pl-2 gap-1">
                    <ChevronUp size={12} className="text-[#90A4AE] cursor-pointer hover:text-[#4D94FF]" />
                    <ChevronDown size={12} className="text-[#90A4AE] cursor-pointer hover:text-[#4D94FF]" />
                </div>
            )}
            {unit && <span className="text-[10px] font-bold text-[#90A4AE]">{unit}</span>}
        </div>
    </div>
);

interface AddPatientModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AddPatientScreen = ({ isOpen, onClose }: AddPatientModalProps) => {
    const [formData] = useState({
        lastName: "",
        firstName: "",
        age: "45",
        birthday: "1980-01-01",
        gender: "Male",
        height: "175",
        weight: "70",
        idNumber: "",
        checkType: "CT Routine",
        patientId: "P20260226001"
    });

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] rounded-md overflow-hidden">
            {/* Modal Container */}
            <div className="w-[840px] bg-white rounded-xl border border-[#B0C4DE] shadow-2xl overflow-hidden flex flex-col transition-all duration-200">
                {/* Tab-like Title Area */}
                <div className="h-[64px] bg-[#F8FAFC] border-b border-[#EEF2F9] px-8 flex items-center justify-between">
                    <h2 className="text-[24px] font-bold text-[#263238] tracking-tight">Create Patient</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-[#90A4AE] hover:text-[#D32F2F] hover:bg-red-50 rounded-full transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Form Body */}
                <div className="p-10 flex flex-col gap-6 bg-white">
                    {/* Row 1 */}
                    <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                        <InputBox label="Last Name" value={formData.lastName} placeholder="Enter last name" />
                        <InputBox label="First Name" value={formData.firstName} placeholder="Enter first name" />

                        <SelectBox label="Age" value={formData.age} hasArrows={true} />
                        <InputBox label="Birthday" value={formData.birthday} type="date" />

                        <SelectBox label="Gender" value={formData.gender} />
                        <SelectBox label="Height" value={formData.height} hasArrows={true} unit="cm" />

                        <SelectBox label="Weight" value={formData.weight} hasArrows={true} unit="kg" />
                        <InputBox label="ID Number" value={formData.idNumber} placeholder="Enter ID number" />

                        <SelectBox label="Check Type" value={formData.checkType} />
                        <InputBox label="Patient ID" value={formData.patientId} readOnly={true} />
                    </div>
                </div>

                {/* Actions */}
                <div className="h-[90px] bg-[#F8FAFC] border-t border-[#EEF2F9] px-10 flex items-center justify-end gap-6">
                    <button
                        onClick={onClose}
                        className="h-[44px] px-10 rounded-md border-2 border-[#4D94FF] text-[#4D94FF] font-black text-[13px] uppercase tracking-widest hover:bg-blue-50 active:scale-95 transition-all"
                    >
                        CANCEL
                    </button>
                    <button className="h-[44px] px-12 rounded-md bg-[#4D94FF] text-white font-black text-[13px] uppercase tracking-widest shadow-lg hover:bg-blue-600 active:scale-95 transition-all flex items-center gap-2">
                        SCAN
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddPatientScreen;
