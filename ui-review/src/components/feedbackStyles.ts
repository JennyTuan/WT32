export type FeedbackTone = "info" | "success" | "warning" | "error" | "fatal";

type ToneStyle = {
  container: string;
  icon: string;
  badge: string;
};

export const FEEDBACK_TONE_STYLES: Record<FeedbackTone, ToneStyle> = {
  info: {
    container: "border-[#BBDEFB] bg-[#F4F9FF] text-[#1565C0]",
    icon: "text-[#1976D2]",
    badge: "bg-[#E3F2FD] text-[#1565C0]",
  },
  success: {
    container: "border-[#C8E6C9] bg-[#F1F8F2] text-[#2E7D32]",
    icon: "text-[#2E7D32]",
    badge: "bg-[#E8F5E9] text-[#2E7D32]",
  },
  warning: {
    container: "border-[#F59E0B] bg-[#FFFBEB] text-[#92400E]",
    icon: "text-[#D97706]",
    badge: "bg-[#FEF3C7] text-[#B45309]",
  },
  error: {
    container: "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]",
    icon: "text-[#DC2626]",
    badge: "bg-[#FEE2E2] text-[#B91C1C]",
  },
  fatal: {
    container: "border-[#B91C1C] bg-[#FEF2F2] text-[#7F1D1D]",
    icon: "text-[#991B1B]",
    badge: "bg-[#7F1D1D] text-white",
  },
};
