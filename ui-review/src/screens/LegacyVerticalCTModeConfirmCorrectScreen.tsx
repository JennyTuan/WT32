import {
    ArrowRightLeft,
    CheckCircle2,
    Download,
    Telescope,
    View,
} from "lucide-react";

const imgSystem = "https://www.figma.com/api/mcp/asset/0f00e16f-223e-459a-a4a1-fba281a95725";
const imgMachine = "https://www.figma.com/api/mcp/asset/a434ca2c-b5c7-4847-985a-8429917eb0e9";
const imgLaser = "https://www.figma.com/api/mcp/asset/aff6e8ff-2b61-43bf-914d-9d401cfccea1";
const imgEmergency = "https://www.figma.com/api/mcp/asset/bfc511ee-8358-46e6-9d1c-3959ad3f6809";
const imgPatient = "https://www.figma.com/api/mcp/asset/03451ece-f71a-4cbf-9dfe-fa05e0bcc6a9";
const imgHorizontalTop = "https://www.figma.com/api/mcp/asset/2b51e6ea-1ef4-4b74-be4e-edb6db29a755";
const imgHorizontalLeft = "https://www.figma.com/api/mcp/asset/f40f5a53-0237-411a-a83e-91f2413d02cc";
const imgHorizontalRight = "https://www.figma.com/api/mcp/asset/4b9efe58-947d-427b-90e4-8a05a8551143";
const imgHorizontalBottom = "https://www.figma.com/api/mcp/asset/380a0507-e3a3-495d-9ac9-c0d76016f63c";
const imgVertical = "https://www.figma.com/api/mcp/asset/f7d2c225-ca8f-4d34-b88b-c399b50b89ec";

const pingFang = '"PingFang SC", "Microsoft YaHei", sans-serif';

type Mode = "vertical" | "horizontal";

type ToolbarIconProps = {
    src: string;
    alt: string;
    left: number;
};

type ModeMeta = {
    label: string;
    accent: string;
    soft: string;
    badge: string;
};

type ImprovedModeBadgeProps = {
    title: string;
    mode: Mode;
    active?: boolean;
    subtitle: string;
};

const modeMeta: Record<Mode, ModeMeta> = {
    vertical: { label: "垂直模式", accent: "#2A6DE5", soft: "#EAF2FF", badge: "#D8E6FF" },
    horizontal: { label: "水平模式", accent: "#4F74B8", soft: "#EDF3FF", badge: "#DAE4F7" },
};

const hardwareParams = [
    { label: "扫描环角度", value: "0.0°", iconSrc: "/扫描环角度.png", iconAlt: "扫描环角度" },
    { label: "扫描臂角度", value: "90.0°", iconSrc: "/机械臂角度.png", iconAlt: "扫描臂角度" },
    { label: "高度", value: "1240 mm", iconSrc: "/高度.png", iconAlt: "高度" },
    { label: "水平移动距离", value: "0 mm", iconSrc: "/水平移动距离.png", iconAlt: "水平移动距离" },
] as const;

function ToolbarIcon({ src, alt, left }: ToolbarIconProps) {
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

function HorizontalModeGraphic() {
    return (
        <div className="relative h-[90px] w-[80px] select-none">
            <img src={imgHorizontalTop} alt="" draggable={false} className="absolute left-0 top-0 h-[22px] w-full object-contain" />
            <img src={imgHorizontalLeft} alt="" draggable={false} className="absolute left-0 top-[4px] h-[75px] w-[10px] object-contain" />
            <img src={imgHorizontalRight} alt="" draggable={false} className="absolute right-0 top-[8px] h-[75px] w-[10px] object-contain" />
            <img src={imgHorizontalBottom} alt="" draggable={false} className="absolute bottom-0 left-[16px] h-[48px] w-[50px] object-contain" />
        </div>
    );
}

function ImprovedModeBadge({ title, mode, active = false, subtitle }: ImprovedModeBadgeProps) {
    const meta = modeMeta[mode];

    return (
        <div
            className="relative flex h-[185px] flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 transition-all"
            style={{
                borderColor: active ? meta.accent : "#AFC3EA",
                background: active ? `linear-gradient(180deg, ${meta.soft} 0%, #FFFFFF 100%)` : "#F3F6FC",
                boxShadow: active ? `0 12px 24px -10px ${meta.accent}33` : "none",
            }}
        >
            <div
                className="absolute left-[14px] top-[14px] rounded-full px-3 py-0.5 text-[11px] font-bold tracking-wide"
                style={{
                    color: active ? meta.accent : "#6D7991",
                    backgroundColor: active ? meta.badge : "#E6EBF5",
                }}
            >
                {title}
            </div>
            <div className="mt-4 flex h-[80px] items-center justify-center">
                {mode === "vertical" ? (
                    <img src={imgVertical} alt="垂直模式" draggable={false} className="h-[80px] w-[80px] object-contain" />
                ) : (
                    <HorizontalModeGraphic />
                )}
            </div>
            <div className="mt-3 text-[28px] font-black leading-none" style={{ color: active ? meta.accent : "#5A6781" }}>
                {meta.label}
            </div>
            <div className="mt-1 text-[11px] font-bold tracking-[0.2em] text-slate-500 opacity-40">
                {subtitle}
            </div>
        </div>
    );
}

export default function LegacyVerticalCTModeConfirmCorrectScreen() {
    const scenario: { selectedMode: Mode; hardwareMode: Mode } = {
        selectedMode: "vertical",
        hardwareMode: "vertical",
    };
    const { selectedMode, hardwareMode } = scenario;

    return (
        <div className="relative h-[768px] w-[1024px] overflow-hidden bg-[#DCE0ED] text-[#535353]" style={{ fontFamily: pingFang }}>
            <div className="absolute left-0 top-0 h-[80px] w-full bg-[#C1C5D5] opacity-50" />
            <div className="absolute left-0 top-0 z-10 h-[80px] w-full">
                <div className="absolute left-[20px] top-[12px] h-[50px] w-[100px] rounded-[5px] border border-[#95B0E2] bg-[#D2D7E6]">
                    <img
                        src={imgPatient}
                        alt="患者"
                        draggable={false}
                        className="absolute left-[4px] top-[8px] h-[29.818px] w-[31.552px] object-contain select-none"
                    />
                    <div className="absolute left-[38px] top-[4px] w-[56px] whitespace-nowrap text-center text-[14px] font-medium leading-[1.15] text-[#717579]">
                        <div>欧阳祖华</div>
                        <div>000001</div>
                    </div>
                </div>
                <div className="absolute left-1/2 top-[12px] -translate-x-1/2 text-center text-[#717579]">
                    <div className="text-[32px] font-black leading-none">13:06</div>
                    <div className="mt-[9px] text-[15px] font-black leading-none">3月9日 周日</div>
                </div>
                <ToolbarIcon src={imgEmergency} alt="急停" left={760} />
                <ToolbarIcon src={imgLaser} alt="激光" left={824} />
                <ToolbarIcon src={imgMachine} alt="机器状态" left={888} />
                <ToolbarIcon src={imgSystem} alt="系统管理" left={952} />
            </div>

            <div className="absolute left-[20px] right-[20px] top-[92px] flex h-[588px] flex-col overflow-hidden rounded-[16px] border border-[#B8C8E9] bg-[linear-gradient(180deg,#F6F9FF_0%,#EDF2FC_100%)] shadow-[0_15px_40px_rgba(88,117,170,0.18)]">
                <div className="flex items-start gap-4 px-[36px] pt-[24px]">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#2A6DE5] text-white shadow-lg">
                        <ArrowRightLeft size={24} />
                    </div>
                    <div>
                        <div className="text-[34px] font-bold leading-none text-[#2A6DE5]">模式确认</div>
                        <div className="mt-2 text-[16px] font-medium text-[#69758B]">
                            扫描前请确认目标模式与当前硬件状态一致
                        </div>
                    </div>
                </div>

                <div className="mt-5 flex items-center gap-6 px-[36px]">
                    <ImprovedModeBadge title="用户选择 (计划目标)" mode={selectedMode} active subtitle="TARGET PLAN" />

                    <div className="flex w-[80px] flex-col items-center gap-2">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#3EA96F] text-white shadow-md">
                            <CheckCircle2 size={28} />
                        </div>
                        <div className="text-[12px] font-black text-[#3EA96F]">状态一致</div>
                    </div>

                    <ImprovedModeBadge title="硬件当前状态" mode={hardwareMode} active subtitle="CURRENT HARDWARE" />
                </div>

                <div className="mx-[36px] mt-5 rounded-xl border-2 border-[#A7D8B7] bg-[rgba(239,251,243,0.9)] p-4">
                    <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2E9361] text-white">
                            <CheckCircle2 size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="text-[20px] font-bold leading-tight text-[#2E9361]">
                                硬件状态已就绪，可直接进入扫描
                            </div>
                            <div className="mt-0.5 text-[13px] font-semibold leading-normal text-[#6E778C] opacity-90">
                                校验通过：硬件物理位置与计划模式一致，无需执行模式切换。
                            </div>
                        </div>
                    </div>
                </div>


                <div className="mt-4 flex items-center justify-end gap-3 px-[36px]">
                    <button
                        type="button"
                        className="flex h-[42px] items-center justify-center rounded-xl border border-[#B8C8E9] bg-white/80 px-5 text-[14px] font-bold text-[#5A6781] shadow-sm"
                    >
                        返回首页
                    </button>
                    <button
                        type="button"
                        className="flex h-[42px] items-center justify-center rounded-xl bg-[#2A6DE5] px-5 text-[14px] font-bold text-white shadow-[0_10px_18px_rgba(42,109,229,0.22)]"
                    >
                        去患者列表选择患者
                    </button>
                </div>
                <div className="mt-auto px-[36px] pb-[28px]">
                    <div className="mb-3 flex items-center gap-2 text-[14px] font-black text-[#5A6781]">
                        <span className="h-4 w-1 rounded-full bg-[#2A6DE5]" />
                        实时硬件定位参数
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                        {hardwareParams.map((item) => {
                            return (
                                <div
                                    key={item.label}
                                    className="flex h-[82px] items-center justify-between rounded-xl border border-[#C8D6F0] bg-white/80 px-3.5 py-3 shadow-sm backdrop-blur-md"
                                >
                                    <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch pr-3">
                                        <div className="text-[12px] font-bold text-[#7B86A0]">
                                            <span className="truncate">{item.label}</span>
                                        </div>
                                        <div className="text-[24px] font-black leading-none text-[#355A9C] tabular-nums">
                                            {item.value}
                                        </div>
                                    </div>
                                    <div className="flex h-[48px] w-[48px] shrink-0 items-center justify-center">
                                        <img
                                            src={item.iconSrc}
                                            alt={item.iconAlt}
                                            draggable={false}
                                            className={item.label === "扫描环角度" ? "h-[48px] w-[48px] object-contain" : "h-[38px] w-[38px] object-contain"}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-[80px] bg-[#88A3D2] px-[18px] pt-[8px]">
                <div className="grid h-[64px] w-full grid-cols-4 gap-[2px]">
                    <button
                        type="button"
                        className="flex h-full items-center justify-center gap-4 rounded-[12px] border border-[#5F86CC] bg-[linear-gradient(180deg,#164CA7_0%,#2A63BE_100%)] px-6 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
                    >
                        <ArrowRightLeft size={34} strokeWidth={2.1} />
                        <span className="text-[20px] font-semibold tracking-[0.06em]">位置信息</span>
                    </button>
                    <button
                        type="button"
                        className="flex h-full cursor-not-allowed items-center justify-center gap-3 rounded-[10px] bg-[#D7DBE5] text-white/50"
                    >
                        <Telescope size={32} strokeWidth={1.9} />
                        <span className="text-[18px] font-medium tracking-[0.03em]">扫描成像</span>
                    </button>
                    <button
                        type="button"
                        className="flex h-full cursor-not-allowed items-center justify-center gap-3 rounded-[10px] bg-[#D7DBE5] text-white/50"
                    >
                        <View size={30} strokeWidth={1.9} />
                        <span className="text-[18px] font-medium tracking-[0.03em]">成像视图</span>
                    </button>
                    <button
                        type="button"
                        className="flex h-full cursor-not-allowed items-center justify-center gap-3 rounded-[10px] bg-[#D7DBE5] text-white/50"
                    >
                        <Download size={30} strokeWidth={1.9} />
                        <span className="text-[18px] font-medium tracking-[0.03em]">传输</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

