export type HardwareTestTab = "机架" | "床旁" | "影像";

export type GantryParams = {
  gantryAngle: string;
  rotateSpeed: string;
};

export type HardwareTestRow = {
  actionLabel: string;
  code?: string;
  name: string;
  params?: Array<{
    tone?: "muted" | "primary" | "secondary";
    value: string;
    label: string;
    widthClass?: string;
  }>;
};

export type HardwareTestLog = {
  message: string;
  tone: "active" | "normal" | "muted";
};
