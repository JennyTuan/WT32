import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { User, Network, Sun, Settings, Siren, HeartPulse } from "lucide-react";
import { formatPatientCardSubtitle, loadSelectedPatient } from "../lib/patientSession";

// Mock Waveform Parameters
const WAVE_WIDTH = 1000;
const WAVE_HEIGHT = 150;
const CYCLE_LENGTH = 200; // pixels per breathing cycle

type ECPGPoint = {
    id: string;
    x: number; // time/pixel position
    type: "peak" | "trough";
};

export default function FourDECPGProcessingScreen() {
    const navigate = useNavigate();
    const selectedPatient = useMemo(() => loadSelectedPatient(), []);
    
    // Auto-recalc toggle
    const [autoRecalc, setAutoRecalc] = useState(true);
    
    // Waveform points state
    const [points, setPoints] = useState<ECPGPoint[]>([]);
    
    // Dragging state
    const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    // Generate initial mock points
    useEffect(() => {
        const initialPoints: ECPGPoint[] = [];
        for (let i = 0; i < 5; i++) {
            // Add peak (0% phase)
            initialPoints.push({
                id: `peak-${i}`,
                x: i * CYCLE_LENGTH + 50,
                type: "peak"
            });
            // Add trough (50% phase)
            initialPoints.push({
                id: `trough-${i}`,
                x: i * CYCLE_LENGTH + 150,
                type: "trough"
            });
        }
        setPoints(initialPoints);
    }, []);

    // Generate path for the mock sine wave
    const wavePath = useMemo(() => {
        let d = `M 0 ${WAVE_HEIGHT / 2}`;
        for (let x = 0; x <= WAVE_WIDTH; x += 5) {
            // Mock a breathing wave
            const y = WAVE_HEIGHT / 2 - Math.sin((x - 50) / CYCLE_LENGTH * Math.PI * 2) * 50;
            d += ` L ${x} ${y}`;
        }
        return d;
    }, []);

    const handlePointMouseDown = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setDraggingPointId(id);
    };

    const handleSvgMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!draggingPointId || !svgRef.current) return;
        const svgRect = svgRef.current.getBoundingClientRect();
        const mouseX = e.clientX - svgRect.left;
        
        setPoints(prev => prev.map(p => {
            if (p.id === draggingPointId) {
                return { ...p, x: Math.max(0, Math.min(WAVE_WIDTH, mouseX)) };
            }
            return p;
        }));
    }, [draggingPointId]);

    const handleSvgMouseUp = useCallback(() => {
        setDraggingPointId(null);
    }, []);

    useEffect(() => {
        if (draggingPointId) {
            window.addEventListener('mousemove', handleSvgMouseMove);
            window.addEventListener('mouseup', handleSvgMouseUp);
        } else {
            window.removeEventListener('mousemove', handleSvgMouseMove);
            window.removeEventListener('mouseup', handleSvgMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleSvgMouseMove);
            window.removeEventListener('mouseup', handleSvgMouseUp);
        };
    }, [draggingPointId, handleSvgMouseMove, handleSvgMouseUp]);

    const handleSvgDoubleClick = (e: React.MouseEvent) => {
        if (!svgRef.current) return;
        const svgRect = svgRef.current.getBoundingClientRect();
        const mouseX = e.clientX - svgRect.left;
        
        // Add a new peak near the click
        const newId = `manual-peak-${Date.now()}`;
        setPoints(prev => [...prev, { id: newId, x: mouseX, type: "peak" as const }].sort((a, b) => a.x - b.x));
    };

    const handlePointContextMenu = (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        setPoints(prev => prev.filter(p => p.id !== id));
    };

    const sortedPeaks = useMemo(() => points.filter(p => p.type === 'peak').sort((a, b) => a.x - b.x), [points]);

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative text-[#37474F] font-sans select-none">
            
            {/* Header */}
            <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                        <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
                            <User size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold text-[#37474F]">{selectedPatient?.name ?? "未选择患者"}</span>
                            <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5">{formatPatientCardSubtitle(selectedPatient)}</span>
                        </div>
                    </div>
                </div>
                <div className="text-center flex flex-col items-center">
                    <span className="text-[18px] font-black tracking-widest text-[#1565C0] uppercase flex items-center gap-2">
                        <HeartPulse size={20} />
                        4D 呼吸信号处理 (ECPG Processing)
                    </span>
                    <span className="text-[11px] text-[#546E7A] font-medium mt-1">请核对并校正波峰(吸气末)与波谷(呼气末)</span>
                </div>
                <div className="flex items-center gap-5 pr-2 opacity-50 pointer-events-none">
                    <Siren size={30} strokeWidth={1.8} />
                    <Network size={24} />
                    <Sun size={24} />
                    <Settings size={24} />
                </div>
            </header>

            <main className="flex-1 flex gap-2 p-2 overflow-hidden">
                {/* Left Sidebar Layout Option */}
                <aside className="w-[260px] bg-white rounded-lg border border-[#B0C4DE] shadow-sm flex flex-col overflow-y-auto shrink-0 p-4">
                    <div className="text-[14px] font-bold text-[#37474F] mb-4 pb-2 border-b border-slate-200">
                        处理参数 (Parameters)
                    </div>
                    
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[12px] font-medium text-[#546E7A]">排序方法 (Sorting Method)</label>
                            <div className="h-[36px] bg-[#F8FAFC] border border-[#CBD5E1] rounded px-3 flex items-center text-[13px] font-bold text-[#1565C0]">
                                基于相位等分 (Phase-based)
                            </div>
                            <span className="text-[10px] text-slate-400">目前系统仅支持时间相位等分算法计算影像区间。</span>
                        </div>

                        <div className="flex items-center justify-between border border-[#CBD5E1] p-3 rounded-md bg-[#FAFAFA]">
                            <div className="flex flex-col">
                                <span className="text-[13px] font-bold text-[#37474F]">自动重新计算相位</span>
                                <span className="text-[10px] text-slate-400">Automatic Phase Recalc</span>
                            </div>
                            <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                                <input 
                                    type="checkbox" 
                                    name="toggle" 
                                    id="toggle" 
                                    checked={autoRecalc}
                                    onChange={(e) => setAutoRecalc(e.target.checked)}
                                    className={`toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer transition-transform duration-200 ${autoRecalc ? 'translate-x-5 border-[#4D94FF]' : 'border-gray-300'}`}
                                />
                                <label htmlFor="toggle" className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${autoRecalc ? 'bg-[#4D94FF]' : 'bg-gray-300'}`}></label>
                            </div>
                        </div>

                        <div className="bg-[#E3F2FD]/50 p-3 rounded text-[11px] text-[#1565C0] leading-relaxed border border-[#E3F2FD]">
                            <strong>操作提示 (Instructions):</strong>
                            <ul className="list-disc pl-4 mt-1 flex flex-col gap-1 text-[#546E7A]">
                                <li>红点代表 <strong>波峰 / 吸气末 (0%)</strong></li>
                                <li>蓝点代表 <strong>波谷 / 呼气末 (50%)</strong></li>
                                <li><strong>拖拽</strong> 点位以水平修正时间截点</li>
                                <li><strong>双击</strong> 空白线条新增点位</li>
                                <li><strong>右键</strong> 点击已有圆点进行删除</li>
                            </ul>
                        </div>
                    </div>
                </aside>

                {/* Right Area: Preview + Graph */}
                <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                    
                    {/* Top: Placeholder Image Preview */}
                    <div className="flex-[3] bg-black rounded-lg border border-[#334155] relative flex items-center justify-center overflow-hidden">
                        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #334155 0%, #000 70%)' }}></div>
                        <div className="text-center flex flex-col items-center gap-2 relative z-10 text-white/50">
                            <span className="text-[12px] font-mono tracking-widest bg-white/10 px-3 py-1 rounded">REFERENCE IMAGE PREVIEW</span>
                            <span className="text-[10px] opacity-70">此区域将根据左侧选择的相位实时展示参考图像预览。</span>
                        </div>
                    </div>

                    {/* Bottom: ECPG Graph Interactive Area */}
                    <div className="flex-[2] bg-white rounded-lg border border-[#B0C4DE] relative flex flex-col">
                        <div className="h-[30px] bg-[#F8FAFC] border-b border-[#EEF2F9] flex items-center px-4 rounded-t-lg shrink-0">
                            <span className="text-[11px] font-bold text-[#546E7A] tracking-wider uppercase">ECPG Respiratory Signal Monitoring</span>
                        </div>
                        <div className="flex-1 relative overflow-hidden p-4">
                            {/* SVG Container */}
                            <svg 
                                ref={svgRef}
                                className="w-full h-full cursor-crosshair border border-dashed border-slate-200"
                                viewBox={`0 0 ${WAVE_WIDTH} ${WAVE_HEIGHT}`}
                                preserveAspectRatio="none"
                                onDoubleClick={handleSvgDoubleClick}
                                onMouseMove={handleSvgMouseMove}
                                onMouseUp={handleSvgMouseUp}
                                onMouseLeave={handleSvgMouseUp}
                            >
                                {/* Grid lines */}
                                <line x1="0" y1={WAVE_HEIGHT/2} x2={WAVE_WIDTH} y2={WAVE_HEIGHT/2} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="4 4" />
                                
                                {/* Phase segments visualization (if auto-recalc is on) */}
                                {autoRecalc && sortedPeaks.map((peak, index) => {
                                    if (index === sortedPeaks.length - 1) return null; // Need next peak
                                    const nextPeak = sortedPeaks[index + 1];
                                    const distance = nextPeak.x - peak.x;
                                    
                                    // Draw 10 phase segments per cycle
                                    const rects = [];
                                    for(let i=0; i<10; i++) {
                                        rects.push(
                                            <rect 
                                                key={`phase-${index}-${i}`}
                                                x={peak.x + (distance * (i/10))}
                                                y={0}
                                                width={distance/10}
                                                height={WAVE_HEIGHT}
                                                fill={i % 2 === 0 ? "rgba(77, 148, 255, 0.03)" : "rgba(77, 148, 255, 0.08)"}
                                            />
                                        );
                                        // Draw phase text indicator for 50%
                                        if (i === 5) {
                                            rects.push(
                                                <text key={`text-${index}`} x={peak.x + (distance * 0.5)} y={20} fill="#94A3B8" fontSize="10" textAnchor="middle" pointerEvents="none">
                                                    Phase 50%
                                                </text>
                                            )
                                        }
                                    }
                                    return rects;
                                })}

                                {/* The Continuous Waveform Line */}
                                <path 
                                    d={wavePath} 
                                    fill="none" 
                                    stroke="#1565C0" 
                                    strokeWidth="2" 
                                    style={{ pointerEvents: 'none' }}
                                />

                                {/* Peak & Trough Markers */}
                                {points.map(p => (
                                    <g 
                                        key={p.id} 
                                        transform={`translate(${p.x}, ${p.type === 'peak' ? WAVE_HEIGHT/2 - 50 : WAVE_HEIGHT/2 + 50})`}
                                        className="cursor-ew-resize"
                                        onMouseDown={(e) => handlePointMouseDown(p.id, e)}
                                        onContextMenu={(e) => handlePointContextMenu(p.id, e)}
                                    >
                                        <line 
                                            x1="0" y1={p.type === 'peak' ? 10 : -10} 
                                            x2="0" y2={p.type === 'peak' ? 50 : -50} 
                                            stroke={p.type === 'peak' ? "#EF4444" : "#3B82F6"} 
                                            strokeWidth="1" 
                                            strokeDasharray="2 2"
                                            style={{ pointerEvents: 'none'}}
                                        />
                                        <circle 
                                            cx="0" cy="0" r="6" 
                                            fill={p.type === 'peak' ? "#EF4444" : "#3B82F6"} 
                                            stroke="white" 
                                            strokeWidth="2" 
                                            className="hover:r-[8px] transition-all hover:stroke-[#1E293B]"
                                        />
                                    </g>
                                ))}
                            </svg>
                        </div>
                    </div>
                </div>
            </main>

            {/* Bottom Action Footer */}
            <footer className="h-[72px] bg-white border-t border-[#B0C4DE] shrink-0 flex items-center justify-between px-6 z-10 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
                <button
                    onClick={() => navigate("/helical-execute")}
                    className="h-10 px-6 rounded-md border border-[#CBD5E1] bg-white text-[#546E7A] text-[14px] font-bold shadow-sm hover:bg-[#F8FAFC] transition-colors"
                >
                    返回扫描 (Back)
                </button>

                <button
                    onClick={() => navigate("/image-viewer-4d")}
                    className="h-10 px-8 rounded-md bg-[radial-gradient(ellipse_at_top,#22C55E_0%,#16A34A_100%)] text-white text-[14px] font-bold tracking-wider shadow-[0_4px_12px_rgba(34,197,94,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                    确认并进入四维浏览
                </button>
            </footer>
        </div>
    );
}
