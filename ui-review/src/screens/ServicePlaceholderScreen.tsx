import ServiceModeShell from "../features/service/shared/ServiceModeShell";

type ServicePlaceholderScreenProps = {
  currentRoute: string;
  title: string;
  description: string;
};

export default function ServicePlaceholderScreen({
  currentRoute,
  title,
  description,
}: ServicePlaceholderScreenProps) {
  return (
    <ServiceModeShell currentRoute={currentRoute} footerStatus={{ label: "IDLE", tone: "idle" }}>
      <section className="flex h-full items-center justify-center rounded-md border border-[#B0C4DE] bg-white shadow-sm">
        <div className="max-w-[480px] text-center px-10">
          <div className="text-[26px] font-black text-[#31485E]">{title}</div>
          <div className="mt-3 text-[14px] leading-7 text-[#6B85A0]">{description}</div>
        </div>
      </section>
    </ServiceModeShell>
  );
}
