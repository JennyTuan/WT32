import { useMemo, useState } from "react";

import type { GantryParams, HardwareTestLog, HardwareTestRow, HardwareTestTab } from "./types";

const TABS: HardwareTestTab[] = ["机架", "床旁", "影像"];

const GANTRY_PARAMS: GantryParams = {
  rotateSpeed: "3",
  gantryAngle: "180",
};

const INITIAL_LOGS: HardwareTestLog[] = [
  { message: "[16:14:02] 系统自检完成...", tone: "active" },
  { message: "[16:14:05] 机架通讯正常连接", tone: "normal" },
  { message: "[16:14:10] 等待用户操作控制...", tone: "muted" },
];

export function useHardwareTest() {
  const [activeTab, setActiveTab] = useState<HardwareTestTab>("机架");
  const [logs, setLogs] = useState<HardwareTestLog[]>(INITIAL_LOGS);

  const rows = useMemo<HardwareTestRow[]>(
    () => [
      { name: "机架复位", code: "(RCB)", actionLabel: "复位" },
      { name: "旋转找零", actionLabel: "开始" },
      {
        name: "旋转控制",
        actionLabel: "开始",
        params: [{ label: "速度", value: GANTRY_PARAMS.rotateSpeed, tone: "primary", widthClass: "w-16" }],
      },
      {
        name: "机架定位",
        actionLabel: "开始",
        params: [
          { label: "速度", value: GANTRY_PARAMS.rotateSpeed, tone: "primary", widthClass: "w-14" },
          { label: "角度", value: GANTRY_PARAMS.gantryAngle, tone: "secondary", widthClass: "w-20" },
        ],
      },
      { name: "倾斜复位", actionLabel: "复位" },
    ],
    [],
  );

  return {
    activeTab,
    clearLogs: () => setLogs([]),
    gantryParams: GANTRY_PARAMS,
    logs,
    rows,
    setActiveTab,
    tabs: TABS,
  };
}
