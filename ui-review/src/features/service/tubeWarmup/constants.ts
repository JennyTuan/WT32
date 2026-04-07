import type { WarmupPhase } from "./types";

export const MIN_TARGET_HEAT = 20;
export const MAX_TARGET_HEAT = 100;

export const WARMUP_PHASES: WarmupPhase[] = [
  { title: "系统自检", range: [0, 20], description: "检查高压发生器、冷却回路与转子就绪状态。" },
  { title: "转子起转", range: [20, 45], description: "低功率建立热负载，监测阳极与轴承振动。" },
  { title: "梯度升温", range: [45, 80], description: "逐步提升热容量，控制升温斜率避免冲击。" },
  { title: "稳定保持", range: [80, 100], description: "接近目标热容量后转入保持与确认阶段。" },
];

export const INITIAL_WARMUP_LOGS = [
  { time: "15:06", message: "系统待机，建议在热容量低于 20% 时执行预热。", tone: "info" },
  { time: "15:06", message: "冷却回路正常，球管真空状态正常。", tone: "success" },
] as const;
