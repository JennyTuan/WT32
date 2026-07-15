import { useId } from "react";

import physicalControlPanelAsset from "../assets/physical-control-panel.svg";
import { useSimulatedPhysicalPress } from "./useSimulatedPhysicalPress";

type PhysicalControlPanelSvgProps = {
    active?: boolean;
    className?: string;
    disabled?: boolean;
    lampOn?: boolean;
    onPressEnd?: () => void;
    onPressStart: () => void;
    panelLabel: string;
    triggerLabel: string;
};

const PANEL_OUTLINE = "M127.009 528.648V1.24847C127.009 0.968466 127.259 0.38847 126.759 0.51847C126.459 0.59847 126.149 0.678461 125.849 0.758461C124.639 1.07846 123.429 1.40846 122.219 1.72846L107.699 5.62847C98.019 8.22847 88.339 10.8285 78.649 13.4285C68.969 16.0285 59.289 18.6285 49.599 21.2285C37.579 24.4585 25.619 25.8385 15.289 34.7185C2.88898 45.3685 0.668987 56.9785 0.668987 72.1485V126.958C0.668987 136.418 -0.371005 149.788 2.709 159.308C4.569 165.038 8.41899 169.648 10.389 175.308C11.939 179.758 12.009 184.148 12.009 188.718C12.009 202.168 12.609 203.448 5.65898 215.398C-2.29102 229.078 -0.301033 242.768 7.64897 255.568C13.019 264.218 12.009 272.738 12.009 281.858C12.009 294.188 6.979 296.678 3.179 307.128C-0.261003 316.618 0.668987 325.888 0.668987 335.438C0.668987 344.988 0.188993 353.598 1.01899 362.698C2.48899 378.898 7.51898 392.148 17.189 405.228C53.799 446.368 90.409 487.498 127.009 528.638V528.648Z";

export default function PhysicalControlPanelSvg({
    active = false,
    className = "w-[72px]",
    disabled = false,
    lampOn = false,
    onPressEnd,
    onPressStart,
    panelLabel,
    triggerLabel,
}: PhysicalControlPanelSvgProps) {
    const idPrefix = useId().replace(/:/g, "");
    const pressHandlers = useSimulatedPhysicalPress({ disabled, onPressEnd, onPressStart });
    const panelGradientId = `${idPrefix}-panel`;
    const resetGradientId = `${idPrefix}-reset`;
    const triggerGradientId = `${idPrefix}-trigger`;
    const panelShadowId = `${idPrefix}-panel-shadow`;
    const lampGlowId = `${idPrefix}-lamp-glow`;
    const buttonShadowId = `${idPrefix}-button-shadow`;

    return (
        <div className={`relative aspect-[128/530] shrink-0 ${className}`}>
            <svg
                aria-label={panelLabel}
                className="h-full w-full overflow-visible"
                role="img"
                viewBox="0 0 128 530"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <linearGradient id={panelGradientId} x1="16" y1="24" x2="116" y2="514" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#F4F6F7" />
                        <stop offset="0.48" stopColor="#D7DBDE" />
                        <stop offset="1" stopColor="#A8ADB1" />
                    </linearGradient>
                    <radialGradient id={resetGradientId} cx="0" cy="0" r="1" gradientTransform="translate(85 36) rotate(52) scale(22)" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#FF6D76" />
                        <stop offset="0.55" stopColor="#E60012" />
                        <stop offset="1" stopColor="#8B000A" />
                    </radialGradient>
                    <radialGradient id={triggerGradientId} cx="0" cy="0" r="1" gradientTransform="translate(36 137) rotate(48) scale(38)" gradientUnits="userSpaceOnUse">
                        <stop stopColor={active ? "#3DD58C" : "#A1E3C6"} />
                        <stop offset="0.52" stopColor={active ? "#159A61" : "#66BF97"} />
                        <stop offset="1" stopColor={active ? "#075A39" : "#23825A"} />
                    </radialGradient>
                    <filter id={panelShadowId} x="-24" y="-12" width="180" height="570" filterUnits="userSpaceOnUse">
                        <feDropShadow dx="3" dy="6" stdDeviation="4" floodColor="#0F172A" floodOpacity="0.28" />
                    </filter>
                    <filter id={buttonShadowId} x="8" y="108" width="70" height="82" filterUnits="userSpaceOnUse">
                        <feDropShadow dx="2" dy={active ? "2" : "5"} stdDeviation="3" floodColor="#064E3B" floodOpacity="0.42" />
                    </filter>
                    <filter id={lampGlowId} x="48" y="98" width="34" height="34" filterUnits="userSpaceOnUse">
                        <feGaussianBlur stdDeviation={lampOn ? "4" : "1"} result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                <path d={PANEL_OUTLINE} fill={`url(#${panelGradientId})`} filter={`url(#${panelShadowId})`} />
                <image href={physicalControlPanelAsset} width="128" height="530" />

                <circle cx="90.02" cy="42.49" r="14.5" fill={`url(#${resetGradientId})`} stroke="#7F0008" strokeWidth="1.5" />
                <path d="M85.4 38.8A6 6 0 1 1 84.8 45.8" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <path d="M82.9 37.2L85.6 39.1L87.4 36.3" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                <g filter={`url(#${buttonShadowId})`} opacity={disabled ? 0.55 : 1}>
                    <circle cx="42.62" cy="146.39" r="25.51" fill={`url(#${triggerGradientId})`} stroke="#07533A" strokeWidth="2" />
                    <circle cx="42.62" cy="146.39" r="18.2" fill="none" stroke="white" strokeOpacity="0.32" strokeWidth="1.2" />
                    <ellipse cx="36" cy="137" rx="10" ry="7" fill="white" fillOpacity={active ? 0.12 : 0.24} />
                </g>

                <g filter={`url(#${lampGlowId})`}>
                    <circle cx="64.96" cy="115.64" r="5.2" fill={lampOn ? "#F7FFDC" : "#C7CDD1"} stroke={lampOn ? "#FFFFFF" : "#7D858B"} strokeWidth="1.4" />
                    {lampOn && <circle cx="64.96" cy="115.64" r="2.3" fill="white" />}
                </g>

            </svg>

            <button
                type="button"
                aria-label={triggerLabel}
                disabled={disabled}
                {...pressHandlers}
                className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full bg-transparent outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed"
                style={{
                    left: "33.3%",
                    top: "27.62%",
                }}
            />
        </div>
    );
}
