import { useState, useEffect } from 'react';
import {
    Scan,
    MoveHorizontal,
    MoveVertical,
    RotateCw,
    RotateCcw,
    Wifi,
    AlertTriangle,
    Zap,
    User,
    Activity,
    ChevronRight
} from 'lucide-react';

// Project Differentiation: This screen belongs to the "Vertical CT Simulator" project.
// Distinct from the WT-32 legacy system.

interface ControlCardProps {
    title: string;
    value: number;
    unit: string;
    icon: React.ElementType;
    active: boolean;
    colorClass?: string;
    schema?: string; // Placeholder for future schematic images
}

const ControlCard = ({ title, value, unit, icon: Icon, active, colorClass = "text-cyan-400", schema }: ControlCardProps) => (
    <div className={`bg-slate-900/60 border ${active ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]' : 'border-slate-800'} rounded-xl p-4 flex flex-col justify-between transition-all duration-300 hover:bg-slate-800/80 min-h-[220px]`}>
        <div className="flex justify-between items-start">
            <div className={`p-1.5 bg-slate-950 rounded-lg border border-slate-800`}>
                <Icon className={active ? colorClass : "text-slate-600"} size={16} />
            </div>
            <span className="text-[9px] uppercase tracking-tighter text-slate-500 font-bold whitespace-nowrap">{title}</span>
        </div>

        {/* Mechanical Schema Placeholder */}
        <div className="flex-1 flex items-center justify-center my-3 group-hover:scale-[1.02] transition-transform duration-500">
            <div className="w-full h-32 bg-slate-950/40 rounded-lg border border-slate-800/50 flex flex-col items-center justify-center relative overflow-hidden group/schema">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover/schema:opacity-100 transition-opacity" />
                {schema ? (
                    <img src={schema} alt={title} className="max-h-28 w-auto object-contain relative z-10 text-slate-800" />
                ) : (
                    <>
                        <Icon className={`${active ? 'text-slate-700/30' : 'text-slate-800/20'} mb-2`} size={32} />
                        <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest px-4 text-center leading-tight">Mechanical Schematic Placeholder</span>
                    </>
                )}

                {/* Visual accents to make placeholder look premium */}
                <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-slate-800/50 rounded-tr-md" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-slate-800/50 rounded-bl-md" />
            </div>
        </div>

        <div className="flex items-baseline justify-end gap-1">
            <span className={`text-3xl font-mono font-bold ${active ? 'text-white' : 'text-slate-400'}`}>{value}</span>
            <span className="text-[10px] text-slate-600 font-medium uppercase">{unit}</span>
        </div>
    </div>
);

const CTSimulatorUIRefactor = () => {
    const [values] = useState({
        lateral: 120,
        vertical: 85,
        tiltA: 0,
        tiltB: 0,
        kv: 120,
        ma: 250
    });

    const [time, setTime] = useState(new Date());
    const [isRadiating, setIsRadiating] = useState(false);
    const [laserActive, setLaserActive] = useState(true);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('zh-CN', { hour12: false });
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('zh-CN').replace(/\//g, '-');
    };

    // Note: setValues, setLaserActive, setIsRadiating are used in event handlers.
    // We add internal setters for interactivity simulation.
    const toggleRadiation = () => setIsRadiating(!isRadiating);
    const toggleLaser = () => setLaserActive(!laserActive);

    return (
        <div className="w-[1366px] h-[768px] bg-slate-950 text-slate-200 font-sans overflow-hidden flex flex-col select-none">

            {/* 顶部状态栏 */}
            <header className="h-16 bg-slate-900/90 border-b border-slate-800 px-6 flex items-center justify-between backdrop-blur-md z-10">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-cyan-600/10 rounded-full flex items-center justify-center border border-cyan-500/20">
                            <User size={20} className="text-cyan-500" />
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Patient Name</div>
                            <div className="text-lg font-bold text-white tracking-wide"> 欧阳娜娜</div>
                        </div>
                    </div>

                    <div className="h-8 w-px bg-slate-800" />

                    <div className="grid grid-cols-3 gap-8">
                        <div>
                            <div className="text-[10px] text-slate-500 font-bold">ID</div>
                            <div className="font-mono text-cyan-200/70 text-sm">MZ202603030001</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 font-bold">Sex / Age</div>
                            <div className="font-medium text-slate-300 text-sm">M / 100Y</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 font-bold">Protocol</div>
                            <div className="font-medium text-slate-300 text-sm flex items-center gap-1">
                                ABD Enhanced CT <ChevronRight size={14} className="text-slate-600" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end mr-4">
                        <div className="text-xl font-mono font-bold text-white leading-none">{formatTime(time)}</div>
                        <div className="text-[10px] text-slate-500 font-bold mt-1 tracking-tighter">{formatDate(time)}</div>
                    </div>

                    <button className="px-4 py-2 bg-red-600/20 border border-red-500/40 rounded-lg text-red-500 flex items-center gap-2 hover:bg-red-600/30 transition-colors active:scale-95 group">
                        <AlertTriangle size={18} className="group-hover:animate-bounce" />
                        <span className="text-xs font-black tracking-tighter">EMERGENCY</span>
                    </button>
                </div>
            </header>

            {/* 主工作区 */}
            <main className="flex-1 flex p-6 gap-6 overflow-hidden">

                {/* 左侧控制区 - 更新为 2x2 网格 */}
                <div className="w-[380px] flex flex-col gap-4">
                    <div className="flex items-center justify-between mb-1 px-1">
                        <div className="flex items-center gap-2">
                            <Activity size={16} className="text-cyan-500" />
                            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Positioning Control</h2>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 grid-rows-2 gap-3 flex-1">
                        <ControlCard
                            title="Lateral Axis (X)"
                            value={values.lateral}
                            unit="mm"
                            icon={MoveHorizontal}
                            active={true}
                        />
                        <ControlCard
                            title="Vertical Axis (Y)"
                            value={values.vertical}
                            unit="mm"
                            icon={MoveVertical}
                            active={true}
                        />
                        <ControlCard
                            title="Gantry Tilt (α)"
                            value={values.tiltA}
                            unit="deg"
                            icon={RotateCw}
                            active={true}
                            colorClass="text-amber-400"
                        />
                        <ControlCard
                            title="Cradle Tilt (β)"
                            value={values.tiltB}
                            unit="deg"
                            icon={RotateCcw}
                            active={false}
                            colorClass="text-purple-400"
                        />
                    </div>


                </div>

                {/* 中间可视化区 - 包装在容器中以对齐页眉 */}
                <div className="flex-1 flex flex-col gap-4">
                    <div className="flex items-center gap-2 mb-1 px-1 opacity-0">
                        {/* 占位符页眉，用于对齐左右两侧 */}
                        <div className="text-xs font-black uppercase tracking-[0.2em]">Placeholder</div>
                    </div>

                    <div className="flex-1 bg-slate-900/20 rounded-3xl border border-slate-800/50 relative flex flex-col items-center justify-center overflow-hidden">
                        <div className="absolute inset-0 opacity-5 pointer-events-none"
                            style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

                        <div className="relative w-full h-full flex flex-col items-center justify-center">
                            {/* CT 机架视觉模拟 */}
                            {/* Vertical CT 完整结构视觉模拟 */}
                            <div className="relative z-10 w-full flex flex-col items-center transition-all duration-1000 ease-in-out"
                                style={{
                                    transform: `translateY(${values.vertical / 15}px)`,
                                    filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.4))'
                                }}>

                                {/* 顶部主基座 (Canopy) - 适配暗色风格 */}
                                <div className="absolute -top-48 w-[560px] h-32 bg-slate-900 rounded-b-[4rem] border-b-4 border-slate-800 shadow-2xl flex items-center justify-center overflow-hidden z-20">
                                    <div className="absolute inset-0 bg-gradient-to-b from-slate-800 to-slate-950" />

                                    {/* 顶部中央凹槽与 logo - 暗色适配 */}
                                    <div className="absolute bottom-4 left-1/4 -translate-x-1/2 w-48 h-12 flex items-center justify-center opacity-20">
                                        <div className="w-full h-[2px] bg-slate-700 rounded-full" />
                                    </div>
                                </div>

                                {/* 左右垂直支撑机械轴 - 适配暗金属轴 */}
                                {/* Symmetrical offsets for 320px Gantry: Columns start at +/- 160px from center */}
                                <div className="absolute -top-24 left-1/2 -translate-x-[216px] w-14 h-64 flex flex-col items-center z-10">
                                    <div className="w-full h-full bg-slate-800 border-x border-slate-700 shadow-lg relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-800 to-slate-900" />
                                        <div className="absolute top-0 bottom-0 left-2 w-[1px] bg-slate-700/50" />
                                        {/* 机械分节线 */}
                                        <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-slate-700 opacity-30" />
                                    </div>
                                </div>

                                <div className="absolute -top-24 left-1/2 translate-x-[160px] w-14 h-64 flex flex-col items-center z-10">
                                    <div className="w-full h-full bg-slate-800 border-x border-slate-700 shadow-lg relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950" />
                                        <div className="absolute top-0 bottom-0 right-2 w-[1px] bg-slate-700/50" />
                                        {/* 机械分节线 */}
                                        <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-slate-700 opacity-30" />
                                    </div>
                                </div>

                                {/* 主扫描环 (Gantry Ring) - 缩放到 320px 以匹配比例 */}
                                <div className="w-[320px] h-[320px] rounded-full border-[30px] border-slate-800 shadow-[0_0_60px_rgba(0,0,0,0.6),inset_0_0_30px_rgba(0,0,0,0.3)] flex items-center justify-center relative bg-slate-950 overflow-hidden z-30">
                                    <div className="absolute inset-0 rounded-full border border-slate-700" />
                                    <div className="w-full h-full rounded-full border-4 border-slate-800 p-3 flex items-center justify-center bg-slate-900/40">
                                        <div className="w-full h-full rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center shadow-inner relative">
                                            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-950 rounded-full" />
                                            <Scan size={80} className="text-slate-600/40 relative z-10" />

                                            {/* 激光指示线区域 */}
                                            {laserActive && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden rounded-full z-20">
                                                    <div className="w-full h-[1.5px] bg-red-500/80 shadow-[0_0_15px_rgba(239,68,68,1)]" />
                                                    <div className="h-full w-[1.5px] bg-red-500/80 shadow-[0_0_15px_rgba(239,68,68,1)] absolute" />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 主环顶部的细节面板 */}
                                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-12 h-3 bg-slate-800 rounded-full border border-slate-700 shadow-sm z-40" />
                                </div>
                            </div>


                            {/* 底盘投影 (Removed) */}
                        </div>

                        {/* 状态指示浮层 */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
                            <div className="px-4 py-1 bg-slate-950/80 border border-slate-700 rounded-full flex items-center gap-2 backdrop-blur-md">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Gantry Ready</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 右侧状态区 */}
                <div className="w-80 flex flex-col gap-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Zap size={16} className="text-emerald-500" />
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Exposure Control</h2>
                    </div>

                    <div className="flex-1 flex flex-col gap-4">
                        {/* 辐射触发器 */}
                        <div
                            onClick={toggleRadiation}
                            className={`flex-1 rounded-3xl border flex flex-col items-center justify-center cursor-pointer transition-all duration-500 relative overflow-hidden group ${isRadiating ? 'bg-emerald-600/20 border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.2)]' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}
                        >
                            {isRadiating && (
                                <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent,rgba(16,185,129,0.1),transparent)] animate-[spin_4s_linear_infinite]" />
                            )}

                            <div className={`relative z-10 transition-all duration-1000 ${isRadiating ? 'scale-110 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'group-hover:scale-105'}`}>
                                <svg width="160" height="160" viewBox="0 0 100 100" className={isRadiating ? 'text-emerald-500' : 'text-emerald-500/20 transition-colors'}>
                                    <g fill="currentColor">
                                        <circle cx="50" cy="50" r="8" />
                                        <path d="M 56 60.392 L 70 84.641 A 40 40 0 0 1 30 84.641 L 44 60.392 A 12 12 0 0 0 56 60.392 Z M 38 50 L 10 50 A 40 40 0 0 1 30 15.359 L 44 39.608 A 12 12 0 0 0 38 50 Z M 56 39.608 L 70 15.359 A 40 40 0 0 1 90 50 L 62 50 A 12 12 0 0 0 56 39.608 Z" />
                                    </g>
                                </svg>
                            </div>
                            <span className={`relative z-10 mt-6 text-[10px] font-black tracking-[0.3em] uppercase ${isRadiating ? 'text-emerald-400' : 'text-slate-600'}`}>
                                {isRadiating ? 'Radiation Active' : 'Standby / Ready'}
                            </span>
                        </div>

                        {/* 参数面板 */}
                        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-[10px] font-bold text-slate-500 mb-1">TUBE VOLTAGE</div>
                                    <div className="text-2xl font-mono font-bold text-white leading-none">{values.kv}</div>
                                </div>
                                <span className="text-xs text-slate-600 font-bold">kVp</span>
                            </div>
                            <div className="h-px bg-slate-800/50" />
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-[10px] font-bold text-slate-500 mb-1">TUBE CURRENT</div>
                                    <div className="text-2xl font-mono font-bold text-white leading-none">{values.ma}</div>
                                </div>
                                <span className="text-xs text-slate-600 font-bold">mA</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* 底部导航栏 */}
            <footer className="h-12 bg-slate-950 border-t border-slate-800/50 px-6 flex items-center justify-between z-10">
                <div className="flex items-center gap-6">
                    <button
                        onClick={toggleLaser}
                        className={`flex items-center gap-2 px-3 py-1 rounded-md transition-all ${laserActive ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'text-slate-600 border border-transparent'}`}
                    >
                        <div className={`w-2 h-2 rounded-full ${laserActive ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Laser Marker</span>
                    </button>

                    <div className="h-4 w-px bg-slate-800" />

                    <div className="flex items-center gap-5 text-slate-500">
                        <div className="flex items-center gap-2">
                            <Wifi size={14} className="text-green-500" />
                            <span className="text-[10px] font-bold tracking-tight">DCIOT-NODE-ONLINE</span>
                        </div>
                    </div>
                </div>
            </footer>

            {/* 曝光时的全局警示特效 */}
            {isRadiating && (
                <>
                    <div className="absolute inset-0 border-[4px] border-emerald-500/20 pointer-events-none animate-pulse z-40" />
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent animate-shimmer" />
                </>
            )}
        </div>
    );
};

export default CTSimulatorUIRefactor;