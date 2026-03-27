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
const imgService = "https://www.figma.com/api/mcp/asset/46629dd4-647e-44a3-9931-cfe393b13705";

const pingFang = '"PingFang SC", "Microsoft YaHei", sans-serif';

function HorizontalModeGraphic() {
    return (
        <div className="absolute left-[111px] top-[29px] h-[125px] w-[107px] select-none">
            <img src={imgHorizontalTop} alt="" draggable={false} className="absolute left-0 top-0 h-[31px] w-[107px] object-contain" />
            <img src={imgHorizontalLeft} alt="" draggable={false} className="absolute left-0 top-[4px] h-[103px] w-[11px] object-contain" />
            <img src={imgHorizontalRight} alt="" draggable={false} className="absolute right-0 top-[8px] h-[103px] w-[10px] object-contain" />
            <img src={imgHorizontalBottom} alt="" draggable={false} className="absolute left-[21px] bottom-0 h-[63px] w-[64px] object-contain" />
        </div>
    );
}

type ModeCardProps = {
    active?: boolean;
    title: string;
    left: number;
    children: React.ReactNode;
};

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

function ModeCard({ active = false, title, left, children }: ModeCardProps) {
    return (
        <button
            type="button"
            className="absolute top-0 h-[208px] w-[330px] rounded-[5px] border border-[#145AD3] overflow-hidden"
            style={{ left, backgroundColor: active ? "#113C88" : "#7E9DD2", boxShadow: active ? "inset 0 1px 3px 0 #0748A6" : undefined }}
        >
            {children}
            <div
                className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[18px] leading-none"
                style={{
                    bottom: 18,
                    color: active ? "#FFFFFF" : "#535353",
                    fontWeight: active ? 700 : 300,
                    fontFamily: pingFang,
                }}
            >
                {title}
            </div>
        </button>
    );
}

export default function LegacyVerticalCTHomeScreen() {
    return (
        <div className="relative h-[768px] w-[1024px] overflow-hidden bg-[#DCE0ED] text-[#535353]" style={{ fontFamily: pingFang }}>
            <div className="absolute left-0 top-0 h-[73px] w-full bg-[#C1C5D5] opacity-50" />

            <div className="absolute left-0 top-0 h-[73px] w-full">
                <div className="absolute left-[20px] top-[12px] h-[50px] w-[100px] rounded-[5px] border border-[#95B0E2] bg-[#D2D7E6]">
                    <img
                        src={imgPatient}
                        alt="患者"
                        draggable={false}
                        className="absolute left-[4px] top-[8px] h-[29.818px] w-[31.552px] object-contain select-none"
                    />
                    <div className="absolute left-[38px] top-[4px] w-[56px] text-center text-[14px] font-medium leading-[1.15] text-[#717579] whitespace-nowrap">
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

            <div className="absolute left-[448px] top-[130px] text-[64px] font-bold leading-none text-[#2A6DE5]">欢迎</div>

            <div className="absolute left-[14px] top-[280px] h-[208px] w-[996px]">
                <ModeCard active title="水平模式" left={0}>
                    <HorizontalModeGraphic />
                </ModeCard>

                <ModeCard title="垂直模式" left={331}>
                    <img
                        src={imgVertical}
                        alt="垂直模式"
                        draggable={false}
                        className="absolute left-[114px] top-[38px] h-[99px] w-[102px] object-contain select-none"
                    />
                </ModeCard>

                <ModeCard title="服务模式" left={662}>
                    <img
                        src={imgService}
                        alt="服务模式"
                        draggable={false}
                        className="absolute left-[115px] top-[33px] h-[99px] w-[100px] object-contain select-none"
                    />
                </ModeCard>
            </div>
        </div>
    );
}

