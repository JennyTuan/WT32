import React from "react";

interface ProtocolEditorModalProps {
    children: React.ReactNode;
    title?: string;
    onSave?: () => void;
    onCancel?: () => void;
}

export default function ProtocolEditorModal({
    children,
    title = "协议编辑器 (Session Detail)",
    onSave,
    onCancel
}: ProtocolEditorModalProps) {
    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-0 overflow-hidden">
            <div className="w-[1024px] h-[768px] bg-white shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
                {/* Modal Header */}
                <header className="h-[52px] bg-[#E8EAF1] border-b border-[#B0C4DE] flex items-center justify-between px-6 shrink-0">
                    <h2 className="text-[18px] font-black text-[#37474F] tracking-tight">{title}</h2>
                </header>

                {/* Modal Content */}
                <div className="flex-1 overflow-hidden">
                    {children}
                </div>

                {/* Modal Footer */}
                <footer className="h-[84px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center justify-end px-8 gap-4 shrink-0">
                    <button
                        onClick={onCancel}
                        className="px-10 h-[48px] bg-white text-[#546E7A] font-bold rounded-md border-2 border-[#B0C4DE] hover:bg-gray-50 transition-all uppercase text-[13px] active:scale-95 shadow-sm"
                    >
                        取消
                    </button>
                    <button
                        onClick={onSave}
                        className="px-12 h-[48px] bg-[#4D94FF] text-white font-bold rounded-md shadow-lg hover:bg-blue-600 transition-all uppercase text-[13px] active:scale-95"
                    >
                        保存
                    </button>
                </footer>
            </div>
        </div>
    );
}
