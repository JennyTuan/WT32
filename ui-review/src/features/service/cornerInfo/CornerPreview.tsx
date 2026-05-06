import type { CornerConfigData, CornerItem } from "../../../lib/cornerConfig";

interface CornerPreviewProps {
    config: CornerConfigData;
}

export default function CornerPreview({ config }: CornerPreviewProps) {
    const renderQuadrant = (items: CornerItem[], alignment: "left" | "right") => (
        <div className={`flex flex-col gap-1.5 p-6 pointer-events-none ${alignment === "right" ? "items-end text-right" : "items-start text-left"}`}>
            {items.filter(i => i.visible).map((item, idx) => (
                <div 
                    key={`${item.key}-${idx}`} 
                    className="text-[#00FF33] text-[15px] font-black drop-shadow-[0_2px_3px_rgba(0,0,0,1)] uppercase tracking-wide leading-tight"
                    style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}
                >
                    <span className="opacity-60 mr-1">{item.label}:</span>
                    <span>{item.key === "patient_name" ? "PATIENT TEST" : item.key === "kv" ? "120" : item.key === "ma" ? "200" : "---"}</span>
                </div>
            ))}
        </div>
    );

    return (
        <div className="flex-1 bg-black rounded-[32px] overflow-hidden flex flex-col border-[12px] border-[#2A2D30] shadow-2xl relative">
            {/* Glossy Overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none z-20"></div>
            
            {/* CRT Scanline Effect */}
            <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]"></div>

            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                 {/* High-Fidelity Mock CT Background */}
                <div className="w-full h-full bg-[#0A0B0C] flex items-center justify-center">
                    <div className="relative">
                        <div className="w-[420px] h-[420px] rounded-full border-[1px] border-[#303336] flex items-center justify-center opacity-40">
                            <div className="w-[300px] h-[300px] rounded-full border-[1px] border-[#383B3E] flex items-center justify-center">
                                <div className="w-[180px] h-[180px] rounded-full border-[1px] border-[#444] opacity-20"></div>
                            </div>
                        </div>
                        {/* Simulation Crosshair */}
                        <div className="absolute top-1/2 left-0 w-full h-px bg-white/10 -translate-y-1/2"></div>
                        <div className="absolute left-1/2 top-0 w-px h-full bg-white/10 -translate-x-1/2"></div>
                    </div>
                </div>
            </div>

            <div className="relative h-full grid grid-cols-2 grid-rows-2 z-30">
                <div className="border-r border-b border-white/5">
                    {renderQuadrant(config.corners.topLeft, "left")}
                </div>
                <div className="border-b border-white/5">
                    {renderQuadrant(config.corners.topRight, "right")}
                </div>
                <div className="border-r border-white/5 flex flex-col justify-end">
                    {renderQuadrant(config.corners.bottomLeft, "left")}
                </div>
                <div className="flex flex-col justify-end">
                    {renderQuadrant(config.corners.bottomRight, "right")}
                </div>
            </div>

        </div>
    );
}
