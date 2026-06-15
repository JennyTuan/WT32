import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import AppHeader from "../components/AppHeader";
import { useI18n } from "../lib/i18nContext";

export default function MobileModePlaceholderScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="flex flex-col w-[1024px] h-[768px] bg-[#EEF2F9] overflow-hidden rounded-md border border-[#B0C4DE] shadow-2xl relative">
      <AppHeader />
      <main className="flex-1 flex items-center justify-center px-12 py-10 bg-[radial-gradient(circle_at_top,_#F9FBFF_0%,_#EEF2F9_58%,_#E5ECF6_100%)]">
        <section className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-[#B0C4DE] bg-white px-16 py-14 shadow-sm">
          <div className="text-[26px] font-black text-[#31485E]">{t("mobile.placeholder.title")}</div>
          <div className="text-[14px] leading-7 text-[#6B85A0] text-center max-w-[420px]">
            {t("mobile.placeholder.description")}
          </div>
          <button
            onClick={() => navigate("/")}
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#B0C4DE] bg-white px-5 py-2 text-[13px] font-bold text-[#37474F] shadow-sm hover:bg-[#F4F7FB]"
          >
            <Home size={16} />
            {t("mobile.placeholder.back")}
          </button>
        </section>
      </main>
    </div>
  );
}
