import { useEffect, useRef, useState } from "react";
import {
    ArrowRightLeft,
    ArrowUpDown,
    Download,
    ScanLine,
    Telescope,
    View,
} from "lucide-react";

const imgSystem = "https://www.figma.com/api/mcp/asset/0f00e16f-223e-459a-a4a1-fba281a95725";
const imgMachine = "https://www.figma.com/api/mcp/asset/a434ca2c-b5c7-4847-985a-8429917eb0e9";
const imgLaser = "https://www.figma.com/api/mcp/asset/aff6e8ff-2b61-43bf-914d-9d401cfccea1";
const imgEmergency = "https://www.figma.com/api/mcp/asset/bfc511ee-8358-46e6-9d1c-3959ad3f6809";
const imgPatient = "https://www.figma.com/api/mcp/asset/03451ece-f71a-4cbf-9dfe-fa05e0bcc6a9";

const pingFang = '"PingFang SC", "Microsoft YaHei", sans-serif';

const scoutParams = [
    { label: "扫描长度", value: "122.00" },
    { label: "扫描协议", value: "Head_Surview90" },
    { label: "\u4f53\u4f4d", value: "HFS" },
    { label: "mA", value: "10" },
    { label: "kV", value: "80" },
    { label: "平扫角度", value: "90" },
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

function ParamField({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center gap-[8px]">
            <span className="w-[70px] text-[12px] font-semibold text-[#6c7f97]">{label}:</span>
            <div className="h-[30px] flex-1 rounded-[6px] border border-[#ccd8e8] bg-[#eef2f7] px-[10px] text-[13px] leading-[30px] text-[#7f90a7] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                {value}
            </div>
        </div>
    );
}

function ParamOptionField({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
}) {
    return (
        <div className={`flex items-center gap-[8px] ${label ? "" : "pl-[78px]"}`}>
            {label ? <span className="w-[70px] text-[12px] font-semibold text-[#6c7f97]">{label}:</span> : null}
            <div className="flex flex-1 rounded-[6px] border border-[#ccd8e8] bg-[#eef2f7] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                {options.map((option) => {
                    const active = value === option;

                    return (
                        <button
                            key={option}
                            type="button"
                            onClick={() => onChange(option)}
                            className={`flex-1 rounded-[4px] px-[6px] py-[4px] text-[12px] font-semibold transition-all ${
                                active
                                    ? "bg-white text-[#4d6f9f] shadow-[0_1px_2px_rgba(149,166,191,0.22)]"
                                    : "text-[#7f90a7]"
                            }`}
                        >
                            {option}
                        </button>
                    );
                })}
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
                    <div className="text-[15px] font-semibold">
                        {status === "loading" ? "正在连接摄像头..." : "无法显示实时画面"}
                    </div>
                    <div className="mt-2 text-[12px] text-[#d5dbea]">
                        {status === "loading" ? "请稍候" : "请检查摄像头权限或设备连接"}
                    </div>
                </div>
            ) : null}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-[linear-gradient(180deg,rgba(17,22,31,0.68)_0%,rgba(17,22,31,0)_100%)] px-3 py-2 text-white">
                <span className="text-[12px] font-medium tracking-[0.04em]">定位像实时画面</span>
                <span className="rounded-full bg-[rgba(77,211,123,0.92)] px-2 py-[2px] text-[10px] font-bold text-[#0c2a14]">LIVE</span>
            </div>
        </div>
    );
}

export default function LegacyVerticalCTScoutConfirmScreen() {
    const [startPos, setStartPos] = useState("472.95");
    const [endPos, setEndPos] = useState("595.17");
    const [selectedPosition, setSelectedPosition] = useState<"start" | "end">("end");
    const [tableDirection, setTableDirection] = useState<"\u8fdb\u5e8a" | "\u51fa\u5e8a">("\u8fdb\u5e8a");

    const handleSwap = () => {
        setStartPos(endPos);
        setEndPos(startPos);
    };

    return (
        <div className="relative h-[768px] w-[1024px] overflow-hidden bg-[#DCE0ED] text-[#535353]" style={{ fontFamily: pingFang }}>
            <div className="absolute left-0 top-0 h-[80px] w-full bg-[#C1C5D5] opacity-50" />
            <div className="absolute left-0 top-0 z-10 h-[80px] w-full">
                <div className="absolute left-[20px] top-[12px] h-[50px] w-[100px] rounded-[5px] border border-[#95B0E2] bg-[#D2D7E6]">
                    <img
                        src={imgPatient}
                        alt="patient"
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
                <ToolbarIcon src={imgMachine} alt="设备状态" left={888} />
                <ToolbarIcon src={imgSystem} alt="系统管理" left={952} />
            </div>

            <div className="absolute left-[20px] right-[20px] top-[92px] h-[588px]">
                <div className="flex h-full">
                    <section className="w-[312px] pt-[10px]">
                        <div className="flex h-[580px] flex-col rounded-[14px] border border-[#bcc6d5] bg-[linear-gradient(180deg,#f1f4f9_0%,#e4e9f2_100%)] px-[16px] py-[18px] shadow-[0_6px_18px_rgba(112,117,131,0.14)]">
                            <div className="whitespace-nowrap text-[22px] font-medium leading-[1.1] text-[#4b6f9f]">请打开激光灯获取定位</div>

                            <div className="mt-[18px] rounded-[10px] border border-[#D7E1EE] bg-[rgba(255,255,255,0.45)] px-[12px] py-[10px]">
                                <div className="flex items-stretch gap-3 h-[118px]">
                                    <div className="flex flex-col items-center self-stretch justify-center py-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedPosition("start")}
                                            className={`w-3 h-3 rounded-full border-2 flex items-center justify-center p-[2px] shrink-0 transition-all ${selectedPosition === "start" ? "bg-[#4D94FF] border-white shadow-sm" : "bg-white border-[#B0C4DE]"}`}
                                        >
                                            {selectedPosition === "start" && <div className="w-full h-full bg-white rounded-full" />}
                                        </button>
                                        <div className="w-px flex-1 bg-[#C5D5E8] my-1" />
                                        <button
                                            type="button"
                                            onClick={handleSwap}
                                            title="交换起始/结束位置"
                                            className="w-[20px] h-[20px] rounded-full bg-white border border-[#B0C4DE] flex items-center justify-center text-[#78A0BF] hover:text-[#4D94FF] hover:border-[#4D94FF] hover:bg-[#EEF6FF] transition-all active:scale-90 shadow-sm shrink-0"
                                        >
                                            <ArrowUpDown size={10} />
                                        </button>
                                        <div className="w-px flex-1 bg-[#C5D5E8] my-1" />
                                        <button
                                            type="button"
                                            onClick={() => setSelectedPosition("end")}
                                            className={`w-3 h-3 rounded-full border-2 flex items-center justify-center p-[2px] shrink-0 transition-all ${selectedPosition === "end" ? "bg-[#66BB6A] border-white shadow-sm" : "bg-white border-[#B0C4DE]"}`}
                                        >
                                            {selectedPosition === "end" && <div className="w-full h-full bg-white rounded-full" />}
                                        </button>
                                    </div>

                                    <div className="flex flex-col flex-1 min-w-0 self-stretch justify-between py-4">
                                        <div
                                            onClick={() => setSelectedPosition("start")}
                                            className="flex items-center gap-2 h-[32px] min-w-0 cursor-pointer"
                                        >
                                            <span className={`text-[12px] font-bold w-[60px] shrink-0 transition-colors ${selectedPosition === "start" ? "text-[#4D94FF]" : "text-[#90A4AE]"}`}>起始位置 :</span>
                                            <input
                                                type="text"
                                                value={startPos}
                                                onChange={(e) => {
                                                    setSelectedPosition("start");
                                                    setStartPos(e.target.value);
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedPosition("start");
                                                }}
                                                className={`flex-1 min-w-0 h-[32px] bg-white border rounded px-2 text-[13px] font-bold outline-none transition-colors ${selectedPosition === "start" ? "border-[#4D94FF] text-[#4D94FF]" : "border-[#B0C4DE] text-[#90A4AE]"} focus:border-[#4D94FF]`}
                                            />
                                        </div>
                                        <div
                                            onClick={() => setSelectedPosition("end")}
                                            className="flex items-center gap-2 h-[32px] min-w-0 cursor-pointer"
                                        >
                                            <span className={`text-[12px] font-bold w-[60px] shrink-0 transition-colors ${selectedPosition === "end" ? "text-[#66BB6A]" : "text-[#90A4AE]"}`}>结束位置 :</span>
                                            <input
                                                type="text"
                                                value={endPos}
                                                onChange={(e) => {
                                                    setSelectedPosition("end");
                                                    setEndPos(e.target.value);
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedPosition("end");
                                                }}
                                                className={`flex-1 min-w-0 h-[32px] bg-white border rounded px-2 text-[13px] font-bold outline-none transition-colors ${selectedPosition === "end" ? "border-[#66BB6A] text-[#66BB6A]" : "border-[#B0C4DE] text-[#90A4AE]"} focus:border-[#4D94FF]`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-[18px] border-t border-[#c7d0de] pt-[14px]">
                                <div className="mb-[10px] text-[13px] font-semibold text-[#526d8f]">扫描参数</div>
                                <div className="flex flex-col gap-[8px]">
                                    <ParamOptionField
                                        label=""
                                        value={tableDirection}
                                        options={["\u8fdb\u5e8a", "\u51fa\u5e8a"] as const}
                                        onChange={(value) => setTableDirection(value as "\u8fdb\u5e8a" | "\u51fa\u5e8a")}
                                    />
                                    {scoutParams.map((item) => (
                                        <ParamField key={item.label} label={item.label} value={item.value} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="ml-[14px] h-full w-px bg-[#b7bcc9]" />

                    <section className="flex flex-1 flex-col pl-[24px] pt-[18px]">
                        <div className="pl-[8px]">
                            <div className="mb-[10px] flex items-end justify-between">
                                <div className="text-[16px] font-semibold text-[#23262b]">定位像实时画面</div>
                                <div className="rounded-full bg-[#E5ECFA] px-3 py-[5px] text-[11px] font-bold tracking-[0.08em] text-[#4A659C]">
                                    垂直模式 / 定位像确认中
                                </div>
                            </div>
                            <CameraPreviewPanel />
                            <div className="mt-[14px] flex justify-end gap-[10px] pr-[2px]">
                                <button
                                    type="button"
                                    className="flex h-[38px] items-center justify-center rounded-[6px] border border-[#B8C6DA] bg-[#EEF2F7] px-[18px] text-[13px] font-semibold text-[#6B7C93]"
                                >
                                    <span>取消</span>
                                </button>
                                <button
                                    type="button"
                                    className="flex h-[38px] items-center justify-center gap-2 rounded-[6px] border border-[#8EBF73] bg-[#8CC06D] px-[16px] text-[13px] font-semibold text-[#F8FFF3]"
                                >
                                    <ScanLine size={15} strokeWidth={2.1} />
                                    <span>定位扫描</span>
                                </button>
                            </div>
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
