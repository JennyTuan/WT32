import { type ReactNode, useEffect, useState } from 'react';
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Columns2,
    Flame,
    Grid2x2,
    Hand,
    LayoutTemplate,
    Layers3,
    Move,
    Network,
    Pause,
    Play,
    RefreshCw,
    Ruler,
    Settings,
    Siren,
    Sun,
    User,
    Waves,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import DicomViewer from '../components/DicomViewer';

type SeriesId = '4d' | 'scout' | 'h1' | 'h2' | 'h3';
type LayoutId = 'single' | 'quad' | 'compare';
type ToolId = 'pan' | 'zoom' | 'zoomout' | 'measure' | 'fit' | 'reset';

const PHASES = [
    ['p0', 0, '0ms', '/dicom/test/SYNO0001.dcm'],
    ['p10', 10, '120ms', '/dicom/test/SYNO0033.dcm'],
    ['p20', 20, '240ms', '/dicom/test/SYNO0067.dcm'],
    ['p30', 30, '360ms', '/dicom/test/SYNO0100.dcm'],
    ['p40', 40, '480ms', '/dicom/test/SYNO0134.dcm'],
    ['p50', 50, '600ms', '/dicom/test/SYNO0168.dcm'],
    ['p60', 60, '720ms', '/dicom/test/SYNO0201.dcm'],
    ['p70', 70, '840ms', '/dicom/test/SYNO0235.dcm'],
    ['p80', 80, '960ms', '/dicom/test/SYNO0269.dcm'],
    ['p90', 90, '1080ms', '/dicom/test/SYNO0301.dcm'],
] as const;

const HELICAL: Record<Exclude<SeriesId, '4d'>, string> = {
    scout: '/dicom/test/SYNO0160.dcm',
    h1: '/dicom/test/SYNO0160.dcm',
    h2: '/dicom/test/SYNO0170.dcm',
    h3: '/dicom/test/SYNO0180.dcm',
};

const speeds = [0.5, 1, 2] as const;
const tools: Array<{ id: ToolId; icon: typeof Hand; label: string }> = [
    { id: 'pan', icon: Hand, label: '平移' },
    { id: 'zoom', icon: ZoomIn, label: '放大' },
    { id: 'zoomout', icon: ZoomOut, label: '缩小' },
    { id: 'measure', icon: Ruler, label: '测量' },
    { id: 'fit', icon: Move, label: '适配' },
    { id: 'reset', icon: RefreshCw, label: '重置' },
];

const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;
const cnDate = (date: Date) => `${date.getMonth() + 1}月${date.getDate()}日 ${weekDays[date.getDay()]}`;
const cnTime = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const LayoutButton = ({
    active,
    label,
    children,
    onClick,
}: {
    active: boolean;
    label: string;
    children: ReactNode;
    onClick: () => void;
}) => (
    <button
        className={`flex h-10 w-10 flex-col items-center justify-center rounded-[7px] border transition-all ${active ? 'border-[#1A6EE0] bg-[#E8F0FB]' : 'border-[#D8E2EE] hover:border-[#C2D0E2] hover:bg-[#EEF2F7]'}`}
        onClick={onClick}
        title={label}
    >
        {children}
    </button>
);

const ParamCard = ({
    label,
    value,
    accent = false,
}: {
    label: string;
    value: ReactNode;
    accent?: boolean;
}) => (
    <div className={`rounded-md border px-2 py-1.5 ${accent ? 'border-[#C5D8F8] bg-[#EEF5FF]' : 'border-[#D8E2EE] bg-[#F4F7FB]'}`}>
        <div className={`mb-1 text-[9px] uppercase tracking-[0.05em] ${accent ? 'text-[#1A6EE0]' : 'text-[#9AAABB]'}`}>{label}</div>
        <div className={`text-[12px] font-medium ${accent ? 'text-[#1A6EE0]' : 'text-[#1A2438]'}`}>{value}</div>
    </div>
);

export default function FourDViewScreen() {
    const [phaseIdx, setPhaseIdx] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState<(typeof speeds)[number]>(1);
    const [layout, setLayout] = useState<LayoutId>('single');
    const [series, setSeries] = useState<SeriesId>('4d');
    const [tool, setTool] = useState<ToolId>('pan');
    const [now, setNow] = useState(() => new Date());
    const [studyOpen, setStudyOpen] = useState(true);

    const is4d = series === '4d';
    const phase = PHASES[phaseIdx];
    const viewerUrl = is4d ? phase[3] : HELICAL[series];
    const fillWidth = `${(phaseIdx / (PHASES.length - 1)) * 100}%`;
    const layoutGrid = layout === 'single' ? 'grid-cols-1 grid-rows-1' : layout === 'quad' ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2 grid-rows-1';
    const treeRow = 'flex min-h-7 w-full items-center gap-[5px] rounded-md px-2 py-[5px] text-left transition-colors hover:bg-[#EEF2F7]';

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!playing || !is4d) return;
        const timer = window.setInterval(() => setPhaseIdx((value) => (value + 1) % PHASES.length), 360 / speed);
        return () => window.clearInterval(timer);
    }, [is4d, playing, speed]);

    useEffect(() => {
        if (!is4d) setPlaying(false);
    }, [is4d]);

    useEffect(() => {
        if (tool === 'fit' || tool === 'reset') {
            const timer = window.setTimeout(() => setTool('pan'), 80);
            return () => window.clearTimeout(timer);
        }
    }, [tool]);

    return (
        <div className="flex h-[768px] w-[1024px] flex-col overflow-hidden rounded-md border border-[#B0C4DE] bg-[#EEF2F9] shadow-2xl">
            <header className="flex h-[80px] shrink-0 items-center justify-between border-b border-[#B0C4DE] bg-[#E8EAF1] px-4 z-10">
                <div className="flex items-center gap-3">
                    <div className="flex min-w-[210px] items-center gap-3 rounded-sm border border-[#B0C4DE] bg-[#DCE6F2] px-4 py-1.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#4A6982] text-white opacity-90">
                            <User size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold text-[#37474F]">Roky Zhang</span>
                            <span className="mt-0.5 text-[12px] font-medium leading-none text-[#546E7A]">ID: 67890</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[#546E7A] opacity-60">
                        <div className="text-[9px] font-bold italic">⊥ 0</div>
                        <div className="text-[9px] font-bold">∠ 0</div>
                        <div className="flex items-center gap-1 text-[11px] font-bold">
                            <Flame size={14} />
                            <span>0%</span>
                        </div>
                    </div>
                </div>

                <div className="text-center">
                    <div className="text-[28px] font-bold leading-none tracking-tight text-[#37474F]">{cnTime(now)}</div>
                    <div className="mt-1 text-[12px] font-medium uppercase text-[#546E7A] opacity-80">{cnDate(now)}</div>
                </div>

                <div className="flex items-center gap-5 pr-2">
                    <button className="cursor-pointer p-1 text-[#D32F2F] hover:opacity-70"><Siren size={30} strokeWidth={1.8} /></button>
                    <button className="relative cursor-pointer p-1 text-[#546E7A] hover:opacity-70">
                        <Network size={24} />
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#D32F2F] text-[9px] font-bold text-white">5</span>
                    </button>
                    <button className="cursor-pointer p-1 text-[#546E7A] hover:opacity-70"><Sun size={24} /></button>
                    <button className="relative cursor-pointer p-1 text-[#546E7A] hover:opacity-70">
                        <Settings size={24} />
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#D32F2F] text-[9px] font-bold text-white">10</span>
                    </button>
                </div>
            </header>

            <main className="flex flex-1 overflow-hidden p-2 gap-2">
                <aside className="flex w-[224px] shrink-0 flex-col overflow-hidden rounded-lg border border-[#B0C4DE] bg-white shadow-sm">
                    <div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-[#EEF2F9] bg-[#F8FAFC] px-3">
                        <Layers3 size={14} className="text-[#4D94FF]" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-[#37474F]">图像序列</span>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto border-b border-[#EEF2F9] px-2 py-1.5">
                        <button className={treeRow} onClick={() => setStudyOpen((value) => !value)}>
                            <ChevronRight size={11} className={`text-[#9AAABB] transition-transform ${studyOpen ? 'rotate-90' : ''}`} />
                            <Waves size={12} className="text-[#1A6EE0]" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[12px] font-semibold text-[#37474F]">THORAX CT</div>
                                <div className="text-[10px] text-[#9AAABB]">2024-03-09</div>
                            </div>
                        </button>

                        {studyOpen && (
                            <div className="ml-3 mt-1 border-l border-[#DCE6F2] pl-2">
                                <button
                                    className={`flex min-h-7 w-full items-center gap-[5px] border-l-2 px-2 py-[5px] text-left transition-colors ${series === 'scout' ? 'border-[#1A6EE0] bg-[#F3F8FF]' : 'border-transparent hover:bg-[#F8FAFC]'}`}
                                    onClick={() => setSeries('scout')}
                                >
                                    <span className="w-[11px]" />
                                    <span className="w-4 text-center text-[10px] text-[#C2D0E2]">·</span>
                                    <div className="min-w-0 flex-1">
                                        <div className={`truncate text-[12px] ${series === 'scout' ? 'font-semibold text-[#1565C0]' : 'font-medium text-[#37474F]'}`}>Scout</div>
                                        <div className="text-[10px] text-[#9AAABB]">定位像</div>
                                    </div>
                                </button>

                                <button
                                    className={`flex min-h-7 w-full items-center gap-[5px] border-l-2 px-2 py-[5px] text-left transition-colors ${series === '4d' ? 'border-[#1A6EE0] bg-[#F3F8FF]' : 'border-transparent hover:bg-[#F8FAFC]'}`}
                                    onClick={() => setSeries('4d')}
                                >
                                    <span className="w-[11px]" />
                                    <Waves size={12} className="shrink-0 text-[#1A6EE0]" />
                                    <div className="min-w-0 flex-1">
                                        <div className={`truncate text-[12px] ${series === '4d' ? 'font-semibold text-[#1565C0]' : 'font-medium text-[#37474F]'}`}>4D Free Scan</div>
                                        <div className="text-[10px] text-[#9AAABB]">10 phases Phase-based</div>
                                    </div>
                                    <span className="font-mono text-[10px] text-[#1A6EE0]">4D</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="mx-3 my-1.5 h-px bg-[#D8E2EE]" />
                    <div className="px-3.5 pt-1 text-[10px] uppercase tracking-[0.08em] text-[#9AAABB]">布局模板</div>
                    <div className="flex gap-2 px-3.5 py-2">
                        <LayoutButton active={layout === 'single'} label="CT 平片" onClick={() => setLayout('single')}>
                            <LayoutTemplate size={14} className={layout === 'single' ? 'text-[#1A6EE0]' : 'text-[#C2D0E2]'} />
                        </LayoutButton>
                        <LayoutButton active={layout === 'quad'} label="四分屏" onClick={() => setLayout('quad')}>
                            <Grid2x2 size={14} className={layout === 'quad' ? 'text-[#1A6EE0]' : 'text-[#C2D0E2]'} />
                        </LayoutButton>
                        <LayoutButton active={layout === 'compare'} label="对比" onClick={() => setLayout('compare')}>
                            <Columns2 size={14} className={layout === 'compare' ? 'text-[#1A6EE0]' : 'text-[#C2D0E2]'} />
                        </LayoutButton>
                    </div>
                    <div className="flex gap-2 px-3.5 pb-3 text-[9px] text-[#5A6A80]">
                        <span className="w-10 text-center">CT 平片</span>
                        <span className="w-10 text-center">四分屏</span>
                        <span className="w-10 text-center">对比</span>
                    </div>

                    <div className="mx-3 my-1.5 h-px bg-[#D8E2EE]" />
                    <div className="px-3.5 pt-1 text-[10px] uppercase tracking-[0.08em] text-[#9AAABB]">图像参数</div>
                    <div className="grid grid-cols-2 gap-2 px-3.5 py-3">
                        <ParamCard label="图框" value={<div className="flex items-center justify-between text-[11px]"><span>肺窗</span><ChevronDown size={12} /></div>} />
                        <ParamCard label="层厚" value="3.0 mm" />
                        <ParamCard label="窗位" value="40" />
                        <ParamCard label="窗宽" value="350" />
                        {is4d && (
                            <>
                                <ParamCard label="相位数" value="10" accent />
                                <ParamCard label="排序" value="Phase-based" accent />
                            </>
                        )}
                    </div>
                </aside>

                <div className="flex flex-1 min-w-0 overflow-hidden rounded-lg border border-[#B0C4DE] bg-[#0F172A] shadow-sm">
                    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
                        <div className={`grid min-h-0 flex-1 ${layoutGrid} bg-black`}>
                            <div className="relative min-h-0 overflow-hidden bg-black">
                                <DicomViewer dicomUrl={viewerUrl} activeTool={tool} windowCenter={40} windowWidth={350} />
                                <div className="pointer-events-none absolute left-1/2 top-[10px] -translate-x-1/2 font-mono text-[11px] text-white/20">A</div>
                                <div className="pointer-events-none absolute bottom-[68px] left-1/2 -translate-x-1/2 font-mono text-[11px] text-white/20">P</div>
                                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-white/20">L</div>
                                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-white/20">R</div>
                                <div className="pointer-events-none absolute left-3 top-3 text-[10px] text-[#CFD8DC] font-mono leading-[1.35]">
                                    <div className="font-bold">Patient ID</div>
                                    <div>2024-03-09</div>
                                    <div>HFS</div>
                                </div>
                                <div className="pointer-events-none absolute right-3 top-3 text-right text-[10px] text-[#CFD8DC] font-mono leading-[1.35]">
                                    <div className="font-bold">4D Thorax</div>
                                    <div>Image 60/120</div>
                                    <div>KV 120 | mAs 200</div>
                                    {is4d && (
                                        <div className="mt-1 inline-flex rounded-full border border-[#1A6EE0]/40 bg-[#1A6EE0]/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-[#93C5FD]">
                                            Phase {phase[1]}%
                                        </div>
                                    )}
                                </div>
                                <div className="pointer-events-none absolute bottom-2 left-2 text-[10px] text-[#CFD8DC] font-mono leading-[1.35]">
                                    <div>WW/WL 350 / 40</div>
                                    <div>Spacing 0.98 / 0.98</div>
                                    <div>512 x 512 | Zoom 1.00x</div>
                                </div>
                                <div className="pointer-events-none absolute bottom-2 right-2 text-right text-[10px] text-[#CFD8DC] font-mono leading-[1.35]">
                                    <div>Slice 60/120 | Thick 3.0 mm</div>
                                    <div>Location 0.0</div>
                                    <div>STN-CT | Demo Viewer</div>
                                </div>
                            </div>

                            {layout !== 'single' && (
                                <>
                                    <div className={`relative min-h-0 overflow-hidden bg-[#06090e] ${layout === 'compare' ? '' : 'border-b border-black'}`}>
                                        <div className="absolute left-3 top-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10px] text-white/55">Coronal</div>
                                        <div className="flex h-full items-center justify-center"><div className="h-px w-[68%] bg-[#1A6EE0]/20" /></div>
                                    </div>
                                    {layout === 'quad' && (
                                        <>
                                            <div className="relative min-h-0 overflow-hidden bg-[#06090e]">
                                                <div className="absolute left-3 top-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10px] text-white/55">Sagittal</div>
                                                <div className="flex h-full items-center justify-center"><div className="h-[68%] w-px bg-[#1A6EE0]/20" /></div>
                                            </div>
                                            <div className="min-h-0 overflow-hidden bg-[linear-gradient(180deg,#08111a_0%,#06090e_100%)] p-4 text-white/85">
                                                <div className="mb-3 flex items-center gap-2">
                                                    <Waves size={14} className="text-[#1A6EE0]" />
                                                    <span className="text-[11px] uppercase tracking-[0.15em]">Dynamic Analysis</span>
                                                </div>
                                                <div className="space-y-3">
                                                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                                        <div className="mb-1 text-[10px] uppercase text-white/45">Max Inhalation Depth</div>
                                                        <div className="text-[24px] font-semibold leading-none text-[#1A6EE0]">24.8 <span className="text-[12px]">mm</span></div>
                                                    </div>
                                                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                                        <div className="mb-1 text-[10px] uppercase text-white/45">Cycle Regularity</div>
                                                        <div className="text-[24px] font-semibold leading-none text-[#9BE38C]">98.2 <span className="text-[12px]">%</span></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        {is4d && (
                            <div className="flex h-[56px] shrink-0 items-center border-t border-[#D8E2EE] bg-white px-4">
                                <div className="relative flex h-12 flex-1 items-center px-1">
                                    <div className="absolute left-1 right-1 top-1/2 h-0.5 -translate-y-1/2 rounded bg-[#D8E2EE]" />
                                    <div className="absolute left-1 top-1/2 h-0.5 -translate-y-1/2 rounded bg-[#1A6EE0]" style={{ width: `calc(${fillWidth} - 2px)` }} />
                                    <div className="absolute left-1 right-1 flex items-center justify-between">
                                        {PHASES.map((item, index) => {
                                            const active = index === phaseIdx;
                                            return (
                                                <button
                                                    key={item[0]}
                                                    className={`relative flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] font-mono text-[9px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${active ? 'z-10 scale-[1.18] border-[#1A6EE0] bg-[#1A6EE0] text-white shadow-[0_2px_10px_rgba(26,110,224,0.36)]' : 'border-[#C2D0E2] bg-white text-[#9AAABB] hover:border-[#1A6EE0] hover:bg-[#E8F0FB] hover:text-[#1A6EE0]'}`}
                                                    onClick={() => {
                                                        setPhaseIdx(index);
                                                        setPlaying(false);
                                                    }}
                                                >
                                                    {item[1]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>

                    <aside className="w-[72px] bg-[#111827] border-l border-white/10 overflow-hidden shrink-0 flex flex-col">
                        <div className="flex-1 flex flex-col gap-1 p-2 pt-3">
                            {is4d && (
                                <>
                                    <button
                                        className={`flex h-[44px] w-[44px] items-center justify-center rounded-[10px] transition-all ${playing ? 'bg-[#3B82F6] text-white shadow-[0_0_15px_rgba(59,130,246,0.55)]' : 'text-[#94A3B8] hover:bg-white/[0.06] hover:text-white'}`}
                                        title={playing ? 'Pause' : 'Play'}
                                        onClick={() => setPlaying((value) => !value)}
                                    >
                                        {playing ? <Pause size={20} strokeWidth={1.5} /> : <Play size={20} strokeWidth={1.5} />}
                                    </button>

                                    {speeds.map((value) => (
                                        <button
                                            key={value}
                                            className={`flex h-[30px] w-[44px] items-center justify-center rounded-[10px] border text-[10px] font-black transition-all ${speed === value ? 'border-[#3B82F6] bg-[#172554] text-[#BFDBFE]' : 'border-white/10 bg-white/[0.03] text-[#94A3B8] hover:border-white/20 hover:bg-white/[0.08] hover:text-white'}`}
                                            onClick={() => setSpeed(value)}
                                        >
                                            {value}x
                                        </button>
                                    ))}

                                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '4px 4px' }} />
                                </>
                            )}

                            {tools.map((item, index) => {
                                const Icon = item.icon;
                                const active = tool === item.id;
                                return (
                                    <div key={item.id} className="contents">
                                        {index === 4 && <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '4px 4px' }} />}
                                        <button
                                            title={item.label}
                                            onClick={() => setTool(item.id)}
                                            style={{
                                                width: '44px',
                                                height: '44px',
                                                borderRadius: '10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                border: 'none',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                                background: active ? '#3B82F6' : 'transparent',
                                                color: active ? '#ffffff' : '#94A3B8',
                                                boxShadow: active ? '0 0 15px rgba(59,130,246,0.55)' : 'none',
                                            }}
                                        >
                                            <Icon size={20} strokeWidth={1.5} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </aside>
                </div>
            </main>

            <footer className="h-[80px] bg-[#E8EAF1] border-t border-[#B0C4DE] flex items-center shrink-0 px-8 z-10">
                <div className="flex-1">
                    <button className="flex items-center gap-2 px-10 h-[52px] bg-white text-[#4D94FF] font-bold rounded-md border-2 border-[#4D94FF] hover:bg-solid shadow-sm transition-all uppercase text-[13px] active:scale-95">
                        <ChevronLeft size={20} /> 高级处理
                    </button>
                </div>
                <div className="flex-1 flex justify-end">
                    <button className="flex items-center gap-2 px-10 h-[52px] bg-[#4D94FF] text-white font-bold rounded-md shadow-lg hover:bg-blue-600 transition-all uppercase text-[13px] active:scale-95">
                        结束检查 <ChevronRight size={20} />
                    </button>
                </div>
            </footer>
        </div>
    );
}
