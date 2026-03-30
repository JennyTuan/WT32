import {
    Flame,
    Move,
    Network,
    ScanLine,
    Settings,
    Siren,
    Sun,
    User,
    Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const modeCards = [
    {
        key: 'mobile',
        title: '移动模式',
        description: '进入移动摆位与设备转运准备流程。',
        icon: Move,
        accent: 'from-[#DCEBFF] to-[#F4F9FF]',
        border: 'border-[#9EC5FF]',
        iconBg: 'bg-[#4D94FF]',
    },
    {
        key: 'routine',
        title: '常规扫描',
        description: '进入患者列表、协议选择与标准扫描流程。',
        icon: ScanLine,
        accent: 'from-[#E4F7EC] to-[#F7FCF9]',
        border: 'border-[#9ED8B4]',
        iconBg: 'bg-[#43A047]',
    },
    {
        key: 'service',
        title: '服务模式',
        description: '进入预热、校准、QA 与硬件维护功能。',
        icon: Wrench,
        accent: 'from-[#FFF1E0] to-[#FFF9F2]',
        border: 'border-[#FFD199]',
        iconBg: 'bg-[#FA8C16]',
    },
];

export default function HomeScreen() {
    const navigate = useNavigate();
    const modeRoutes: Record<string, string> = {
        mobile: '/mobile/manual-scan',
        routine: '/patients',
        service: '/service/tube-warmup',
    };

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative">
            <header className="flex items-center justify-between px-4 h-[80px] bg-[#E8EAF1] border-b border-[#B0C4DE] shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 py-1.5 px-4 bg-[#DCE6F2] border border-[#B0C4DE] rounded-sm min-w-[210px]">
                        <div className="w-10 h-10 rounded-sm bg-[#4A6982] flex items-center justify-center text-white opacity-90">
                            <User size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[16px] font-bold">Roky Zhang</span>
                            <span className="text-[12px] text-[#546E7A] font-medium leading-none mt-0.5">ID: 67890</span>
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
                    <div className="text-[28px] font-bold tracking-tight text-[#37474F] leading-none">13:52</div>
                    <div className="text-[12px] text-[#546E7A] font-medium mt-1 uppercase opacity-80">2月26日 周四</div>
                </div>

                <div className="flex items-center gap-5 pr-2">
                    <div className="p-1 text-[#D32F2F] cursor-pointer hover:opacity-70"><Siren size={30} strokeWidth={1.8} /></div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Network size={24} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">5</span>
                    </div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Sun size={24} />
                    </div>
                    <div className="relative p-1 text-[#546E7A] cursor-pointer hover:opacity-70">
                        <Settings size={24} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] flex items-center justify-center rounded-full font-bold border border-white">10</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 flex items-center justify-center px-12 py-10 bg-[radial-gradient(circle_at_top,_#F9FBFF_0%,_#EEF2F9_58%,_#E5ECF6_100%)]">
                <div className="grid grid-cols-3 gap-8 w-full max-w-[920px]">
                    {modeCards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <button
                                key={card.key}
                                onClick={() => navigate(modeRoutes[card.key])}
                                className={`group h-[360px] rounded-[28px] border ${card.border} bg-gradient-to-b ${card.accent} p-8 text-left shadow-[0_18px_45px_rgba(55,71,79,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(55,71,79,0.14)]`}
                            >
                                <div className={`w-16 h-16 rounded-2xl ${card.iconBg} text-white flex items-center justify-center shadow-lg mb-10`}>
                                    <Icon size={30} />
                                </div>
                                <div className="text-[30px] font-black tracking-tight text-[#37474F] mb-4">{card.title}</div>
                                <p className="text-[15px] leading-7 text-[#546E7A] font-medium max-w-[220px]">{card.description}</p>
                                <div className="mt-12 inline-flex items-center rounded-full border border-white/80 bg-white/80 px-4 py-2 text-[12px] font-black tracking-[0.12em] text-[#607D8B] shadow-sm transition-colors group-hover:text-[#37474F]">
                                    ENTER MODE
                                </div>
                            </button>
                        );
                    })}
                </div>
            </main>
        </div>
    );
}
