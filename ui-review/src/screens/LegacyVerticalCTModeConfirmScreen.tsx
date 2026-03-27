import { useEffect, useState, useRef, useMemo } from "react";
import {
    AlertTriangle,
    ArrowLeftRight,
    Image as LucideImage,
    Info,
    RefreshCcw,
    Send,
    Telescope,
    View,
    Zap,
    CheckCircle2
} from "lucide-react";

// 样式常量
const premiumFont = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// 资产 URL
const imgSystem = "https://www.figma.com/api/mcp/asset/0f00e16f-223e-459a-a4a1-fba281a95725";
const imgMachine = "https://www.figma.com/api/mcp/asset/a434ca2c-b5c7-4847-985a-8429917eb0e9";
const imgLaser = "https://www.figma.com/api/mcp/asset/aff6e8ff-2b61-43bf-914d-9d401cfccea1";
const imgEmergency = "https://www.figma.com/api/mcp/asset/bfc511ee-8358-46e6-9d1c-3959ad3f6809";
const imgPatient = "https://www.figma.com/api/mcp/asset/03451ece-f71a-4cbf-9dfe-fa05e0bcc6a9";

/**
 * 顶部工具栏图标组件
 */
function ToolbarIcon({ src, alt, left }: { src: string; alt: string; left: number }) {
    return (
        <img
            src={src}
            alt={alt}
            draggable={false}
            className="absolute top-[20px] h-[32px] w-[32px] object-contain select-none"
            style={{ left }}
        />
    );
}

type Mode = "水平模式" | "垂直模式";

/**
 * 数据展示卡片组件
 */
function DataCard({ title, value, unit = "", isMoving }: { title: string; value: string; unit?: string; isMoving: boolean }) {
    return (
        <div className={`flex flex-col rounded-2xl border transition-all duration-300 ${isMoving ? 'border-blue-400 bg-blue-50/50 shadow-inner scale-[1.01]' : 'border-slate-200 bg-white'
            } p-5`}>
            <div className="flex shrink-0 items-start justify-between">
                <span className="text-sm font-bold tracking-wide text-slate-500">{title}</span>
                {isMoving && <Zap size={14} className="text-blue-500" />}
            </div>

            <div className="group my-4 flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50">
                <div className="flex flex-col items-center text-slate-300">
                    <LucideImage size={32} className={`mb-2 opacity-30 ${isMoving ? 'animate-bounce' : ''}`} />
                    <span className="text-[10px] font-medium uppercase tracking-widest opacity-40">Machine Sketch</span>
                </div>
            </div>

            <div className="flex shrink-0 items-baseline justify-center">
                <span className={`whitespace-nowrap text-4xl font-bold tracking-tighter tabular-nums transition-colors ${isMoving ? 'text-blue-600' : 'text-slate-800'
                    }`}>
                    {value}
                </span>
                {unit ? <span className="ml-1 text-sm font-bold text-slate-400">{unit}</span> : null}
            </div>
        </div>
    );
}


const modeTargets: Record<Mode, { x: number; y: number; a: number; b: number }> = {
    "水平模式": { x: 133.0, y: -189.0, a: -60, b: -12 },
    "垂直模式": { x: 0.0, y: 500.0, a: 90, b: 0 }
};

export default function App() {
    const [currentMode, setCurrentMode] = useState<Mode>("水平模式");
    const [deviceState, setDeviceState] = useState<Mode>("垂直模式");
    const [time, setTime] = useState(new Date());

    const [isSwitching, setIsSwitching] = useState(false);
    const [isMoving, setIsMoving] = useState(false);
    const [progress, setProgress] = useState(0);

    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        if (isMoving) {
            timerRef.current = window.setInterval(() => {
                setProgress(prev => {
                    if (prev >= 100) {
                        setIsMoving(false);
                        setIsSwitching(false);
                        setDeviceState(currentMode);
                        return 100;
                    }
                    return prev + 1.2;
                });
            }, 30);
        } else {
            if (timerRef.current) window.clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
    }, [isMoving, currentMode]);

    const values = useMemo(() => {
        const start = modeTargets[deviceState];
        const end = modeTargets[currentMode];
        const p = Math.min(progress / 100, 1);
        return {
            x: (start.x + (end.x - start.x) * p).toFixed(1),
            y: (start.y + (end.y - start.y) * p).toFixed(1),
            a: Math.round(start.a + (end.a - start.a) * p),
            b: Math.round(start.b + (end.b - start.b) * p)
        };
    }, [progress, deviceState, currentMode]);

    useEffect(() => {
        const timer = window.setInterval(() => setTime(new Date()), 60000);
        return () => window.clearInterval(timer);
    }, []);

    const isMatch = currentMode === deviceState;

    return (
        <div className="flex h-[768px] w-[1024px] flex-col overflow-hidden bg-[#f0f4f8] text-slate-800" style={{ fontFamily: premiumFont }}>
            {/* 顶部工具栏 */}
            <header className="relative h-20 shrink-0">
                <div className="absolute inset-0 bg-[#C1C5D5] opacity-50" />
                <div className="relative z-10 flex h-full items-center px-6">
                    <div className="h-[52px] w-[115px] rounded-[5px] border border-[#95B0E2] bg-[#D2D7E6] relative shadow-sm">
                        <img src={imgPatient} alt="P" className="absolute left-[6px] top-[10px] h-[32px] w-[32px] object-contain" />
                        <div className="absolute left-[44px] top-[10px] w-16 text-[12px] font-bold text-slate-600 leading-tight">
                            <div>欧阳祖华</div>
                            <div className="text-[10px] opacity-60 font-mono">000001</div>
                        </div>
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 text-center text-slate-600">
                        <div className="text-[34px] font-black leading-none tracking-tighter">
                            {time.getHours().toString().padStart(2, "0")}:{time.getMinutes().toString().padStart(2, "0")}
                        </div>
                        <div className="mt-1 text-sm font-bold opacity-80 uppercase tracking-widest">
                            {time.getMonth() + 1}月{time.getDate()}日
                        </div>
                    </div>
                    <div className="ml-auto flex items-center space-x-8">
                        <ToolbarIcon src={imgEmergency} alt="E" left={760} />
                        <ToolbarIcon src={imgLaser} alt="L" left={824} />
                        <ToolbarIcon src={imgMachine} alt="M" left={888} />
                        <ToolbarIcon src={imgSystem} alt="S" left={952} />
                    </div>
                </div>
            </header>

            <main className="flex flex-1 gap-4 overflow-hidden p-4">
                {/* 左侧：模式选择（仅用于设置目标） */}
                <section className="flex w-64 flex-col gap-3">
                    <h2 className="flex items-center px-2 text-lg font-bold text-slate-400 mb-1">
                        <Info size={16} className="mr-2" /> 扫描模式
                    </h2>
                    {(["水平模式", "垂直模式"] as const).map(mode => (
                        <button
                            key={mode}
                            disabled={isSwitching || isMoving}
                            onClick={() => { setCurrentMode(mode); setProgress(0); }}
                            className={`flex flex-1 flex-col items-center justify-center rounded-2xl border-2 transition-all duration-300 ${currentMode === mode
                                ? "border-blue-400 bg-blue-600 text-white shadow-xl shadow-blue-200/50"
                                : "border-slate-100 bg-white text-slate-400 hover:border-blue-100"
                                } ${(isSwitching || isMoving) && 'opacity-50'}`}
                        >
                            <div className={`mb-4 flex h-24 w-44 items-center justify-center rounded-xl border border-dashed ${currentMode === mode ? "border-white/30 bg-white/10" : "border-slate-100 bg-slate-50"}`}>
                                <LucideImage size={32} className={currentMode === mode ? "text-white/40" : "text-slate-200"} />
                            </div>
                            <span className="text-xl font-bold">{mode}</span>
                        </button>
                    ))}
                </section>

                {/* 中间：数据反馈网格（实时跳动） */}
                <section className="grid flex-1 grid-cols-2 grid-rows-2 gap-4">
                    <DataCard title="水平位移" value={`${parseFloat(values.x) > 0 ? '+' : ''}${values.x}`} unit="mm" isMoving={isMoving} />
                    <DataCard title="垂直高度" value={`${parseFloat(values.y) >= 0 ? '+' : ''}${values.y}`} unit="mm" isMoving={isMoving} />
                    <DataCard title="倾斜角度 A" value={`${values.a}°`} isMoving={isMoving} />
                    <DataCard title="旋转角度 B" value={`${values.b}°`} isMoving={isMoving} />
                </section>

                {/* 右侧：操作引导面板 */}
                <section className={`flex shrink-0 flex-col ${isSwitching ? "w-fit" : "w-[240px]"}`}>
                    {!isSwitching ? (
                        /* 状态 A：待确认状态 */
                        <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                            <div className={`mb-8 flex items-center ${isMatch ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {isMatch ? <CheckCircle2 size={32} className="mr-3" /> : <AlertTriangle size={32} className="mr-3" />}
                                <h3 className="text-2xl font-black text-slate-800 tracking-tight">{isMatch ? '状态匹配' : '模式不匹配'}</h3>
                            </div>

                            <div className="flex-1 space-y-6">
                                <div className="rounded-xl border-l-8 border-blue-500 bg-slate-50 p-4 shadow-sm">
                                    <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">Selected Mode</p>
                                    <p className="text-xl font-black text-blue-700">【{currentMode}】</p>
                                </div>
                                <div className={`rounded-xl border-l-8 p-4 shadow-sm ${isMatch ? 'border-emerald-500 bg-slate-50' : 'border-slate-300 bg-slate-50'}`}>
                                    <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">Mechanical State</p>
                                    <p className="text-xl font-black text-slate-700">【{deviceState}】</p>
                                </div>
                                {!isMatch && (
                                    <div className="mt-8 p-4 bg-blue-50/50 rounded-xl border border-blue-100 flex items-start gap-3">
                                        <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
                                        <p className="text-xs text-blue-600/80 leading-relaxed font-medium">
                                            当前模式与机械位置不符。请在确认周围环境安全后，点击下方按钮开始执行切换引导。
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 flex flex-col gap-2">
                                {!isMatch && (
                                    <button
                                        onClick={() => setIsSwitching(true)}
                                        className="flex w-full items-center justify-center rounded-xl bg-emerald-500 py-3 text-lg font-black text-white shadow-xl shadow-emerald-200/50 transition-all hover:bg-emerald-600 active:scale-95"
                                    >
                                        <RefreshCcw size={20} className="mr-3" /> 模式切换
                                    </button>
                                )}
                                <button className="w-full py-2 font-bold text-slate-300 hover:text-slate-500 transition-colors tracking-widest text-sm">
                                    返回首页
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* 状态 B：实体按键操作引导（图片示意） */
                        <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-[#EDF1F7] shadow-lg overflow-hidden">

                            {/* 模拟器图片容器，靠右对齐 */}
                            <div className="flex flex-1 flex-col items-end justify-start p-0 pb-2">
                                <div className="relative h-[520px] w-fit">
                                    <img
                                        src="/弹出实体按键.png"
                                        alt="Simulator panel"
                                        draggable={false}
                                        className="h-[520px] w-auto max-w-full object-contain select-none"
                                    />
                                    {!isMoving && (
                                        <>
                                            <div className="pointer-events-none absolute left-[15%] top-[31%] flex -translate-x-1/2 flex-col items-center animate-bounce">
                                                <div className="rounded-md bg-[#008D64] px-3 py-1 text-[10px] font-black text-white shadow-md">
                                                    按住绿色按钮
                                                </div>
                                                <div className="h-0 w-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-[#008D64]" />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex shrink-0 justify-end px-6 pb-5 pt-0">
                                <button
                                    disabled={isMoving}
                                    onClick={() => { setIsSwitching(false); setProgress(0); }}
                                    className="min-w-[108px] rounded-full border border-slate-300/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(233,239,247,0.96)_100%)] px-6 py-2.5 text-[11px] font-black uppercase tracking-[0.22em] text-slate-600 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] transition-all hover:border-slate-400/80 hover:text-slate-700 hover:shadow-[0_14px_28px_-18px_rgba(15,23,42,0.6),inset_0_1px_0_rgba(255,255,255,1)] active:scale-95 active:bg-[linear-gradient(180deg,rgba(232,238,246,0.98)_0%,rgba(255,255,255,0.96)_100%)] disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </main>

            {/* 底部导航栏 */}
            <footer className="h-20 shrink-0 bg-[#88A3D2] px-[18px] pt-[8px]">
                <div className="grid h-[64px] w-full grid-cols-4 gap-[2px]">
                    <button className="flex h-full items-center justify-center gap-4 rounded-[12px] border border-[#5F86CC] bg-[linear-gradient(180deg,#164CA7_0%,#2A63BE_100%)] px-6 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                        <ArrowLeftRight size={34} strokeWidth={2.1} />
                        <span className="text-[20px] font-semibold tracking-[0.06em]">位置信息</span>
                    </button>
                    {[
                        { icon: <Telescope size={32} />, label: "扫描成像" },
                        { icon: <View size={30} />, label: "成像视图" },
                        { icon: <Send size={30} className="-rotate-12" />, label: "传输" }
                    ].map((btn, idx) => (
                        <button key={idx} className="flex h-full cursor-not-allowed items-center justify-center gap-3 rounded-[10px] bg-[#D7DBE5] text-white/50">
                            {btn.icon}
                            <span className="text-[18px] font-medium tracking-[0.03em]">{btn.label}</span>
                        </button>
                    ))}
                </div>
            </footer>
        </div>
    );
}
