import { useState } from 'react';
import {
    Scan,
    MoveHorizontal,
    MoveVertical,
    RotateCw,
    RotateCcw,
    Zap,
    User,
    Activity,
} from 'lucide-react';

interface ControlCardProps {
    title: string;
    value: number;
    unit: string;
    icon: React.ElementType;
    active: boolean;
    schema?: string;
}

const ControlCard = ({ title, value, unit, icon: Icon, active, schema }: ControlCardProps) => (
    <div className={`bg-white border ${active ? 'border-sky-300 shadow-[0_8px_24px_rgba(14,116,144,0.12)]' : 'border-slate-200'} rounded-xl p-3 flex flex-col transition-all duration-300 hover:bg-slate-50 relative group h-full`}>


        <div className="flex-1 min-h-[80px] bg-slate-50/50 rounded-lg border border-slate-200 flex flex-col items-center justify-center p-2 mb-3 group-hover:bg-sky-50 transition-colors">
            {schema ? (
                <img src={schema} alt={title} className="max-h-full object-contain opacity-80" />
            ) : (
                <div className="flex flex-col items-center gap-1 opacity-20">
                    <Icon size={32} className="text-slate-400" />
                    <span className="text-[11px] font-bold text-center leading-tight uppercase tracking-wide">Mechanical Schematic<br />Placeholder</span>
                </div>
            )}
        </div>

        <div className="flex items-baseline justify-end gap-1 px-1">
            <span className={`text-[34px] font-mono font-bold tracking-tighter ${active ? 'text-slate-900' : 'text-slate-500'}`}>{value}</span>
            <span className="text-[15px] text-slate-400 font-bold uppercase">{unit}</span>
        </div>
    </div>
);

const CTSimulatorUIRefactorLight = () => {
    const [values] = useState({
        lateral: 120,
        vertical: 85,
        tiltA: 0,
        tiltB: 0,
        kv: 120,
        ma: 250
    }); const [isRadiating, setIsRadiating] = useState(false);
    const [laserActive, setLaserActive] = useState(false);
    const toggleRadiation = () => setIsRadiating(!isRadiating);
    const toggleLaser = () => setLaserActive(!laserActive);

    return (
        <div className="w-[1366px] h-[768px] bg-[#F4F8FC] text-slate-700 font-sans overflow-hidden flex flex-col select-none">
            <header className="h-24 bg-white/95 border-b border-slate-200 px-6 flex items-center justify-between backdrop-blur-md z-10">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-sky-50 rounded-full flex items-center justify-center border border-sky-200">
                            <User size={24} className="text-sky-600" />
                        </div>
                        <div>
                            <div className="text-[16px] text-slate-500 font-black uppercase tracking-wide">Patient Name</div>
                            <div className="mt-1 inline-flex items-center py-1">
                                <span className="text-[30px] font-black text-slate-900 tracking-wide leading-none">欧阳娜娜</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-12 w-px bg-slate-200" />

                    <div className="grid grid-cols-3 gap-8">
                        <div>
                            <div className="text-[15px] text-slate-500 font-black">ID</div>
                            <div className="mt-1 inline-flex items-center py-1">
                                <span className="font-mono text-sky-800 text-[28px] font-bold leading-none">MZ202603030001</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-[15px] text-slate-500 font-black">Sex / Age</div>
                            <div className="mt-1 inline-flex items-center py-1">
                                <span className="font-bold text-slate-700 text-[28px] leading-none">M / 100Y</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-[15px] text-slate-500 font-black">Protocol</div>
                            <div className="mt-1 inline-flex items-center py-1">
                                <span className="font-bold text-slate-700 text-[28px] leading-none">ABD Enhanced CT</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 flex p-6 gap-6 overflow-hidden bg-[linear-gradient(160deg,#f8fbff_0%,#eef4fb_100%)]">
                {/* Left Column: Positioning Control */}
                <div className="w-[380px] flex flex-col gap-6">
                    <div className="flex-1 flex flex-col gap-3">
                        <div className="flex items-center gap-2 px-1">
                            <Activity size={16} className="text-sky-600" />
                            <h2 className="text-[14px] font-black uppercase tracking-[0.16em] text-slate-500">Positioning Control</h2>
                        </div>

                        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3">
                            <ControlCard title="Lateral Axis (X)" value={values.lateral} unit="mm" icon={MoveHorizontal} active={false} />
                            <ControlCard title="Vertical Axis (Y)" value={values.vertical} unit="mm" icon={MoveVertical} active={false} />
                            <ControlCard title="Gantry Tilt (A)" value={values.tiltA} unit="deg" icon={RotateCw} active={false} />
                            <ControlCard title="Cradle Tilt (B)" value={values.tiltB} unit="deg" icon={RotateCcw} active={false} />
                        </div>
                    </div>
                </div>

                {/* Middle Column: Gantry Visualization */}
                <div className="flex-1 bg-white/60 rounded-3xl border border-slate-200 relative flex flex-col items-center justify-center overflow-hidden">
                    <div
                        className="absolute inset-0 opacity-40 pointer-events-none"
                        style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                    />

                    <div className="relative w-full h-full flex flex-col items-center justify-center pt-24">
                        <div className="relative z-10 w-full flex flex-col items-center transition-all duration-1000 ease-in-out"
                            style={{
                                transform: `translateY(${values.vertical / 15}px)`,
                                filter: 'drop-shadow(0 30px 60px rgba(15,23,42,0.1))'
                            }}>

                            {/* Gantry Canopy */}
                            <div className="absolute -top-48 w-[560px] h-32 bg-white rounded-b-[4rem] border-b-4 border-slate-200 shadow-2xl flex items-center justify-center overflow-hidden z-20">
                                <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-white" />
                                <div className="absolute bottom-4 left-1/4 -translate-x-1/2 w-48 h-12 flex items-center justify-center opacity-40">
                                    <div className="w-full h-[2px] bg-slate-200 rounded-full" />
                                </div>
                            </div>

                            {/* Support Columns */}
                            <div className="absolute -top-24 left-1/2 -translate-x-[216px] w-14 h-64 flex flex-col items-center z-10">
                                <div className="w-full h-full bg-white border-x border-slate-200 shadow-lg relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-slate-50 via-white to-slate-100" />
                                    <div className="absolute top-0 bottom-0 left-2 w-[1px] bg-slate-100/50" />
                                    <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-slate-200 opacity-50" />
                                </div>
                            </div>

                            <div className="absolute -top-24 left-1/2 translate-x-[160px] w-14 h-64 flex flex-col items-center z-10">
                                <div className="w-full h-full bg-white border-x border-slate-200 shadow-lg relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-slate-100 via-white to-slate-50" />
                                    <div className="absolute top-0 bottom-0 right-2 w-[1px] bg-slate-100/50" />
                                    <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-slate-200 opacity-50" />
                                </div>
                            </div>

                            {/* Gantry Ring */}
                            <div className="w-[320px] h-[320px] rounded-full border-[30px] border-white shadow-[0_0_50px_rgba(0,0,0,0.1),inset_0_0_20px_rgba(0,0,0,0.05)] flex items-center justify-center relative bg-slate-50/50 overflow-hidden z-30">
                                <div className="absolute inset-0 rounded-full border border-slate-200" />
                                <div className="w-full h-full rounded-full border-4 border-white p-3 flex items-center justify-center bg-white/40">
                                    <div className="w-full h-full rounded-full bg-white border border-slate-100 flex items-center justify-center shadow-inner relative">
                                        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-white rounded-full" />
                                        <Scan size={80} className="text-slate-200 relative z-10" />

                                        {laserActive && (
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden rounded-full z-20">
                                                <div className="w-full h-[1.5px] bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                                <div className="h-full w-[1.5px] bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.6)] absolute" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-12 h-3 bg-slate-100 rounded-full border border-slate-200 shadow-sm z-40" />
                            </div>
                        </div>


                    </div>
                </div>

                {/* Right Column: Exposure Control */}
                <div className="w-80 flex flex-col gap-6">
                    <div className="flex-1 flex flex-col gap-3">
                        <div className="flex items-center gap-2 mb-1 px-1">
                            <Zap size={16} className="text-emerald-500" />
                            <h2 className="text-[14px] font-black uppercase tracking-[0.16em] text-slate-500">Exposure Control</h2>
                        </div>

                        <div className="flex-1 flex flex-col gap-4">
                            <div
                                onClick={toggleRadiation}
                                className={`flex-1 rounded-3xl border flex flex-col items-center justify-center cursor-pointer transition-all duration-500 relative overflow-hidden group ${isRadiating ? 'bg-emerald-50 border-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.22)]' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                            >
                                {isRadiating && (
                                    <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent,rgba(16,185,129,0.12),transparent)] animate-[spin_4s_linear_infinite]" />
                                )}

                                <div className={`relative z-10 transition-all duration-1000 ${isRadiating ? 'scale-110 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'group-hover:scale-105'}`}>
                                    <svg width="240" height="240" viewBox="0 0 100 100" className={isRadiating ? 'text-emerald-500' : 'text-emerald-500/40 transition-colors'}>
                                        <g fill="currentColor">
                                            <circle cx="50" cy="50" r="8" />
                                            <path d="M 56 60.392 L 70 84.641 A 40 40 0 0 1 30 84.641 L 44 60.392 A 12 12 0 0 0 56 60.392 Z M 38 50 L 10 50 A 40 40 0 0 1 30 15.359 L 44 39.608 A 12 12 0 0 0 38 50 Z M 56 39.608 L 70 15.359 A 40 40 0 0 1 90 50 L 62 50 A 12 12 0 0 0 56 39.608 Z" />
                                        </g>
                                    </svg>
                                </div>

                            </div>

                            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-[14px] font-black text-slate-500 tracking-wide">通讯状态</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.35)]" />
                                        <span className="inline-flex items-center py-0.5 text-[18px] font-black text-red-600">断开</span>
                                    </div>
                                </div>
                                <div className="h-px bg-slate-200" />
                                <div
                                    onClick={toggleLaser}
                                    className="flex items-center justify-between cursor-pointer rounded-lg px-1 py-1 hover:bg-slate-50 transition-colors"
                                >
                                    <span className="text-[14px] font-black text-slate-500 tracking-wide">激光灯状态</span>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2.5 h-2.5 rounded-full ${laserActive ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.45)] animate-pulse' : 'bg-slate-300'}`} />
                                        <span className={`inline-flex items-center py-0.5 text-[18px] font-black ${laserActive ? 'text-red-600' : 'text-slate-900'}`}>{laserActive ? '开启' : '关闭'}</span>
                                    </div>
                                </div>
                                <div className="h-px bg-slate-200" />
                                <div className="flex items-center justify-between">
                                    <span className="text-[14px] font-black text-slate-500 tracking-wide">急停状态</span>
                                    <div className="flex items-center">
                                        <span className="inline-flex items-center py-0.5 text-[18px] font-black text-slate-900">正常</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {isRadiating && (
                <>
                    <div className="absolute inset-0 border-[4px] border-emerald-400/40 pointer-events-none animate-pulse z-40" />
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-shimmer" />
                </>
            )}
        </div>
    );
};

export default CTSimulatorUIRefactorLight;

