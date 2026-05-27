import { CORNER_FIELD_OVERLAY } from "../../../lib/cornerConfig";
import type { CornerConfigData, CornerItem } from "../../../lib/cornerConfig";

interface CornerPreviewProps {
    config: CornerConfigData;
}

export default function CornerPreview({ config }: CornerPreviewProps) {
    const renderQuadrant = (items: CornerItem[], alignment: "left" | "right") => {
        const visible = items.filter(i => i.visible);
        return (
            <div className={`flex flex-col gap-[2px] p-5 pointer-events-none ${alignment === "right" ? "items-end text-right" : "items-start text-left"}`}>
                {visible.map((item, idx) => (
                    <div
                        key={`${item.key}-${idx}`}
                        className="text-[#E8E8E8] text-[12px] leading-[1.35] tracking-normal whitespace-nowrap"
                        style={{
                            fontFamily: "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
                            textShadow: "0 0 2px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8)",
                        }}
                    >
                        {CORNER_FIELD_OVERLAY[item.key] ?? "—"}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="flex-1 bg-black rounded-[32px] overflow-hidden flex flex-col border-[12px] border-[#2A2D30] shadow-2xl relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none z-20"></div>

            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                <div className="w-full h-full bg-[#0A0B0C] flex items-center justify-center">
                    <div className="relative">
                        <div className="w-[420px] h-[420px] rounded-full border-[1px] border-[#303336] flex items-center justify-center opacity-40">
                            <div className="w-[300px] h-[300px] rounded-full border-[1px] border-[#383B3E] flex items-center justify-center">
                                <div className="w-[180px] h-[180px] rounded-full border-[1px] border-[#444] opacity-20"></div>
                            </div>
                        </div>
                        <div className="absolute top-1/2 left-0 w-full h-px bg-white/10 -translate-y-1/2"></div>
                        <div className="absolute left-1/2 top-0 w-px h-full bg-white/10 -translate-x-1/2"></div>
                    </div>
                </div>
            </div>

            <div className="relative h-full grid grid-cols-2 grid-rows-2 z-30">
                <div>{renderQuadrant(config.corners.topLeft, "left")}</div>
                <div>{renderQuadrant(config.corners.topRight, "right")}</div>
                <div className="flex flex-col justify-end">{renderQuadrant(config.corners.bottomLeft, "left")}</div>
                <div className="flex flex-col justify-end">{renderQuadrant(config.corners.bottomRight, "right")}</div>
            </div>
        </div>
    );
}
