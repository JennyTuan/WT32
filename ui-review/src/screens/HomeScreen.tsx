import {
    Move,
    ScanLine,
    Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { useI18n } from '../lib/i18nContext';
import type { TranslationKey } from '../lib/i18n';

const modeCards = [
    {
        key: 'mobile',
        titleKey: 'home.mobile.title',
        descriptionKey: 'home.mobile.description',
        icon: Move,
        accent: 'from-[#DCEBFF] to-[#F4F9FF]',
        border: 'border-[#9EC5FF]',
        iconBg: 'bg-[#4D94FF]',
    },
    {
        key: 'routine',
        titleKey: 'home.routine.title',
        descriptionKey: 'home.routine.description',
        icon: ScanLine,
        accent: 'from-[#E4F7EC] to-[#F7FCF9]',
        border: 'border-[#9ED8B4]',
        iconBg: 'bg-[#43A047]',
    },
    {
        key: 'service',
        titleKey: 'home.service.title',
        descriptionKey: 'home.service.description',
        icon: Wrench,
        accent: 'from-[#FFF1E0] to-[#FFF9F2]',
        border: 'border-[#FFD199]',
        iconBg: 'bg-[#FA8C16]',
    },
];

export default function HomeScreen() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const modeRoutes: Record<string, string> = {
        mobile: '/mobile/manual-scan',
        routine: '/patients',
        service: '/service/tube-warmup',
    };

    return (
        <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative">
            <AppHeader />

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
                                <div className="text-[30px] font-black tracking-tight text-[#37474F] mb-4">{t(card.titleKey as TranslationKey)}</div>
                                <p className="text-[15px] leading-7 text-[#546E7A] font-medium max-w-[220px]">{t(card.descriptionKey as TranslationKey)}</p>
                                <div className="mt-12 inline-flex items-center rounded-full border border-white/80 bg-white/80 px-4 py-2 text-[12px] font-black tracking-[0.12em] text-[#607D8B] shadow-sm transition-colors group-hover:text-[#37474F]">
                                    {t("home.enterMode")}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </main>
        </div>
    );
}
