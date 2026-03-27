import { useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    ArrowRightLeft,
    ChevronRight,
    Download,
    Telescope,
    View,
} from "lucide-react";

const imgSystem = "https://www.figma.com/api/mcp/asset/0f00e16f-223e-459a-a4a1-fba281a95725";
const imgMachine = "https://www.figma.com/api/mcp/asset/a434ca2c-b5c7-4847-985a-8429917eb0e9";
const imgLaser = "https://www.figma.com/api/mcp/asset/aff6e8ff-2b61-43bf-914d-9d401cfccea1";
const imgEmergency = "https://www.figma.com/api/mcp/asset/bfc511ee-8358-46e6-9d1c-3959ad3f6809";
const imgPatient = "https://www.figma.com/api/mcp/asset/03451ece-f71a-4cbf-9dfe-fa05e0bcc6a9";

const pingFang = '"PingFang SC", "Microsoft YaHei", sans-serif';

const stanceOptions = [
    { id: "standing", label: "正向", active: true },
    { id: "sitting", label: "反向", active: false },
    { id: "leaning", label: "左侧", active: false },
    { id: "wheelchair", label: "右侧", active: false },
] as const;

const directionOptions = [
    { id: "head-first", label: "头先进", active: true },
    { id: "feet-first", label: "脚先进", active: false },
] as const;

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

function SelectionChip({
    label,
    active = false,
}: {
    label: string;
    active?: boolean;
}) {
    return (
        <button
            type="button"
            className="flex h-[40px] items-center justify-center rounded-[4px] border text-[14px] font-semibold tracking-[0.02em] transition-colors"
            style={{
                width: "100%",
                color: active ? "#F6FAFF" : "#445067",
                background: active ? "linear-gradient(180deg,#7EA4EE 0%,#6D92DD 100%)" : "#EEF2FA",
                borderColor: active ? "#6B8FDB" : "#C0C8D8",
                boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.22)" : "inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
        >
            {label}
        </button>
    );
}

function VerticalPoseIllustration() {
    return (
        <div className="relative flex h-[176px] w-[260px] items-center justify-center overflow-hidden rounded-[10px] border border-dashed border-[#AEB7C7] bg-[linear-gradient(180deg,#E5E9F2_0%,#D7DCE7_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.42)]">
            <div className="flex h-[72px] w-[128px] items-center justify-center rounded-[8px] border border-[#C2CAD8] bg-[rgba(248,250,255,0.82)] text-[12px] font-semibold tracking-[0.08em] text-[#77829A]">
                体位示意占位
            </div>
        </div>
    );
}

function CameraPreviewPanel() {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

    useEffect(() => {
        let active = true;
        let stream: MediaStream | null = null;

        async function startCamera() {
            if (!navigator.mediaDevices?.getUserMedia) {
                if (active) setStatus("error");
                return;
            }

            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 960 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                });

                if (!active) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => undefined);
                }

                setStatus("ready");
            } catch {
                if (active) setStatus("error");
            }
        }

        startCamera();

        return () => {
            active = false;
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    return (
        <div className="relative h-[470px] w-full max-w-[700px] overflow-hidden rounded-[10px] border border-[#aab1c1] bg-[#8d95a8] shadow-[0_2px_8px_rgba(96,104,122,0.18)]">
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            {status !== "ready" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[linear-gradient(180deg,rgba(88,96,114,0.82)_0%,rgba(64,71,87,0.92)_100%)] text-[#eef2fb]">
                    <div className="text-[15px] font-semibold">{status === "loading" ? "正在连接摄像头..." : "无法显示实时画面"}</div>
                    <div className="mt-2 text-[12px] text-[#d5dbea]">
                        {status === "loading" ? "请稍候" : "请检查摄像头权限或设备连接"}
                    </div>
                </div>
            ) : null}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-[linear-gradient(180deg,rgba(17,22,31,0.68)_0%,rgba(17,22,31,0)_100%)] px-3 py-2 text-white">
                <span className="text-[12px] font-medium tracking-[0.04em]">垂直摆位实时画面</span>
                <span className="rounded-full bg-[rgba(77,211,123,0.92)] px-2 py-[2px] text-[10px] font-bold text-[#0c2a14]">LIVE</span>
            </div>
        </div>
    );
}

export default function LegacyVerticalCTPatientPositioningVerticalScreen() {
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
                    <div className="mt-[9px] text-[15px] font-black leading-none">3月1日 周日</div>
                </div>
                <ToolbarIcon src={imgEmergency} alt="急停" left={760} />
                <ToolbarIcon src={imgLaser} alt="激光" left={824} />
                <ToolbarIcon src={imgMachine} alt="机器状态" left={888} />
                <ToolbarIcon src={imgSystem} alt="系统管理" left={952} />
            </div>

            <div className="absolute left-[20px] right-[20px] top-[92px] h-[588px]">
                <div className="flex h-full">
                    <section className="w-[312px] pt-[10px]">
                        <div className="flex h-[580px] flex-col rounded-[12px] border border-[#b6bbc8] bg-[linear-gradient(180deg,#d8dbe4_0%,#d3d6df_100%)] px-[14px] py-[16px] shadow-[0_2px_8px_rgba(112,117,131,0.22)]">
                            <div className="flex items-center justify-between">
                                <h2 className="text-[17px] font-semibold text-[#23262b]">患者摆位-垂直</h2>
                                <span className="rounded-full bg-[#D8E6FF] px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] text-[#2D64C7]">
                                    VERTICAL
                                </span>
                            </div>

                            <div className="mt-[14px]">
                                <div className="mb-[8px] text-[13px] font-semibold text-[#59657B]">摆位姿态</div>
                                <div className="grid grid-cols-2 gap-[10px]">
                                    {stanceOptions.map((option) => (
                                        <SelectionChip key={option.id} label={option.label} active={option.active} />
                                    ))}
                                </div>
                            </div>

                            <div className="mt-[16px] flex justify-center">
                                <VerticalPoseIllustration />
                            </div>

                            <div className="mt-[20px] border-t border-[#bcc1cd] pt-[18px]">
                                <h2 className="text-[17px] font-semibold text-[#23262b]">请选择患者方向</h2>
                                <div className="mt-[16px] flex flex-col gap-[12px]">
                                    {directionOptions.map((option) => (
                                        <SelectionChip key={option.id} label={option.label} active={option.active} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="ml-[14px] h-full w-px bg-[#b7bcc9]" />

                    <section className="flex flex-1 flex-col pl-[24px] pt-[18px]">
                        <div className="pl-[8px]">
                            <div className="mb-[10px] flex items-end justify-between">
                                <div className="text-[16px] font-semibold text-[#23262b]">患者摄像头画面</div>
                                <div className="rounded-full bg-[#E5ECFA] px-3 py-[5px] text-[11px] font-bold tracking-[0.08em] text-[#4A659C]">
                                    垂直模式 / 激光对位中
                                </div>
                            </div>
                            <CameraPreviewPanel />
                        </div>

                        <div className="mt-auto flex items-center justify-between px-[8px] pb-[12px]">
                            <button
                                type="button"
                                className="flex h-[36px] w-[76px] items-center justify-center gap-2 rounded-[3px] border border-[#dd8f92] bg-[#e89a99] text-[13px] font-semibold text-[#fff5f4]"
                            >
                                <ArrowLeft size={14} strokeWidth={2.2} />
                                <span>返回</span>
                            </button>

                            <button
                                type="button"
                                className="flex h-[36px] w-[76px] items-center justify-center gap-2 rounded-[3px] border border-[#8ebf73] bg-[#8cc06d] text-[13px] font-semibold text-[#f8fff3]"
                            >
                                <span>继续</span>
                                <ChevronRight size={15} strokeWidth={2.5} />
                            </button>
                        </div>
                    </section>
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
                        className="flex h-full items-center justify-center gap-3 rounded-[10px] bg-[#DCE8FF] text-[#265FBC]"
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
