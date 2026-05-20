import { Bell, Check, LogOut, Power, Settings, User as UserIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

type SystemMenuButtonProps = {
    iconSize?: number;
    badgeCount?: number;
    settingsPath?: string;
};

const PANEL_WIDTH = 220;

export default function SystemMenuButton({
    iconSize = 24,
    badgeCount = 10,
    settingsPath = "/service/tube-warmup",
}: SystemMenuButtonProps) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const navigate = useNavigate();

    useLayoutEffect(() => {
        if (!open || !triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 8, left: rect.right - PANEL_WIDTH });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onMouseDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (
                triggerRef.current?.contains(t) ||
                panelRef.current?.contains(t)
            ) {
                return;
            }
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        const onScroll = () => setOpen(false);
        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onScroll);
        return () => {
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onScroll);
        };
    }, [open]);

    const close = () => setOpen(false);

    return (
        <>
            <div
                ref={triggerRef}
                role="button"
                aria-label="系统菜单"
                onClick={() => setOpen((o) => !o)}
                className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70"
            >
                <Settings size={iconSize} />
                {badgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">
                        {badgeCount}
                    </span>
                )}
            </div>

            {open && pos &&
                createPortal(
                    <div
                        ref={panelRef}
                        className="fixed bg-white border border-[#B0C4DE] rounded-lg shadow-lg overflow-hidden text-left"
                        style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH, zIndex: 9999 }}
                    >
                        <button
                            type="button"
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-[#37474F] hover:bg-[#F4F6FA] border-b border-[#EEF2F9]"
                            onClick={close}
                        >
                            <Bell size={16} className="text-[#546E7A]" />
                            <span className="flex-1 font-semibold tracking-wider">SYSTEM MESSAGE</span>
                            {badgeCount > 0 && (
                                <span className="min-w-[18px] h-4 px-1 rounded-full bg-[#D32F2F] text-white text-[10px] font-bold flex items-center justify-center">
                                    {badgeCount}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-[#37474F] hover:bg-[#F4F6FA] border-b border-[#EEF2F9]"
                            onClick={() => {
                                close();
                                navigate(settingsPath);
                            }}
                        >
                            <Settings size={16} className="text-[#546E7A]" />
                            <span className="font-semibold tracking-wider">SETTING</span>
                        </button>
                        <button
                            type="button"
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-[#37474F] hover:bg-[#F4F6FA]"
                            onClick={close}
                        >
                            <Power size={16} className="text-[#546E7A]" />
                            <span className="font-semibold tracking-wider">SHUT DOWN</span>
                        </button>

                        <div className="m-2 rounded-md border border-[#B0C4DE] bg-[#F8FAFC]">
                            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#EEF2F9]">
                                <UserIcon size={20} className="text-[#90A4AE]" strokeWidth={1.6} />
                                <div className="flex-1 leading-tight">
                                    <div className="text-[13px] font-bold text-[#37474F]">root</div>
                                    <div className="text-[10px] text-[#90A4AE] font-semibold tracking-wider">ROOT</div>
                                </div>
                                <Check size={16} className="text-[#37474F]" strokeWidth={2.4} />
                            </div>
                            <button
                                type="button"
                                className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold tracking-wider text-[#546E7A] hover:bg-[#F4F6FA]"
                                onClick={close}
                            >
                                <LogOut size={14} />
                                <span>LOGOUT</span>
                            </button>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}
