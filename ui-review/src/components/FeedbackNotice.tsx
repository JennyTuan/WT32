import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import { FEEDBACK_TONE_STYLES, type FeedbackTone } from "./feedbackStyles";

const TONE_ICONS: Record<FeedbackTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  fatal: ShieldAlert,
};

type FeedbackNoticeProps = {
  tone?: FeedbackTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
};

export function FeedbackNotice({
  tone = "error",
  title,
  children,
  action,
  className = "",
  compact = false,
}: FeedbackNoticeProps) {
  const Icon = TONE_ICONS[tone];
  const isUrgent = tone === "error" || tone === "fatal";

  return (
    <div
      role={isUrgent ? "alert" : "status"}
      aria-live={isUrgent ? "assertive" : "polite"}
      className={`flex items-start rounded-md border shadow-sm ${FEEDBACK_TONE_STYLES[tone].container} ${
        compact ? "gap-2 px-3 py-2 text-[12px]" : "gap-3 px-4 py-3 text-[12px]"
      } ${className}`}
    >
      <Icon size={compact ? 15 : 18} className={`mt-0.5 shrink-0 ${FEEDBACK_TONE_STYLES[tone].icon}`} />
      <div className="min-w-0 flex-1 leading-relaxed">
        {title && <div className="font-black">{title}</div>}
        {children && <div className={title ? "mt-0.5 font-medium opacity-90" : "font-medium"}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

type FeedbackViewportOverlayProps = {
  title: ReactNode;
  message?: ReactNode;
  className?: string;
};

export function FeedbackViewportOverlay({ title, message, className = "" }: FeedbackViewportOverlayProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#0F172A]/95 px-6 text-center ${className}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#EF4444]/70 bg-[#7F1D1D]/20 text-[#F87171]">
        <AlertCircle size={24} />
      </div>
      <div className="text-[14px] font-bold text-[#F87171]">{title}</div>
      {message && <div className="max-w-[420px] text-[12px] font-medium leading-relaxed text-[#FCA5A5]">{message}</div>}
    </div>
  );
}
