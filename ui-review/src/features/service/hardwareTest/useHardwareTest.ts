import { useMemo, useState } from "react";

import type {
  EditingField,
  HardwareTestAction,
  HardwareTestLog,
  HardwareTestTab,
} from "./types";

const TABS: HardwareTestTab[] = ["机架", "轨道", "影像"];

const INITIAL_ACTIONS: Record<HardwareTestTab, HardwareTestAction[]> = {
  机架: [
    { id: "gantry-reset", name: "机架复位", code: "(RCB)", control: "reset", idleLabel: "复位", completedResult: "已复位", buttonTone: "neutral" },
    { id: "rotation-home", name: "旋转找零", control: "trigger", idleLabel: "开始", completedResult: "已开始" },
    {
      id: "rotation-control",
      name: "旋转控制",
      control: "toggle",
      idleLabel: "开始",
      runningLabel: "停止",
      runningResult: "已开始",
      stoppedResult: "已停止",
      params: [{ key: "speed", label: "速度", value: "3", widthClass: "w-14" }],
    },
    {
      id: "gantry-position",
      name: "机架定位",
      control: "trigger",
      idleLabel: "开始",
      completedResult: "已开始",
      params: [
        { key: "speed", label: "速度", value: "3", widthClass: "w-14" },
        { key: "angle", label: "角度", value: "180", widthClass: "w-16" },
      ],
    },
    { id: "tilt-reset", name: "倾斜复位", control: "reset", idleLabel: "复位", completedResult: "已复位", buttonTone: "neutral" },
    {
      id: "tilt-control",
      name: "倾斜控制",
      control: "toggle",
      idleLabel: "开始",
      runningLabel: "停止",
      runningResult: "已开始",
      stoppedResult: "已停止",
      params: [{ key: "angle", label: "角度", value: "0", widthClass: "w-16" }],
    },
  ],
  轨道: [
    { id: "bed-reset", name: "扫描床复位", code: "(UCB)", control: "reset", idleLabel: "复位", completedResult: "已复位", buttonTone: "neutral" },
    {
      id: "bed-move-target",
      name: "移动开始(目标位置)",
      control: "trigger",
      idleLabel: "开始",
      completedResult: "已开始",
      params: [
        { key: "speed", label: "速度", value: "33", widthClass: "w-14" },
        { key: "position", label: "位置", value: "500", widthClass: "w-16" },
      ],
    },
  ],
  影像: [
    {
      id: "rotor-control",
      name: "Rotor(阳极)控制",
      control: "toggle",
      idleLabel: "开始",
      runningLabel: "停止",
      runningResult: "已开始",
      stoppedResult: "已停止",
    },
    {
      id: "laser-control",
      name: "激光灯控制",
      control: "toggle",
      idleLabel: "点亮",
      runningLabel: "关闭",
      runningResult: "已点亮",
      stoppedResult: "已关闭",
    },
    { id: "collimator-reset", name: "准直器复位", control: "reset", idleLabel: "复位", completedResult: "已复位", buttonTone: "neutral" },
    {
      id: "collimator-control",
      name: "准直器控制",
      control: "toggle",
      idleLabel: "开始",
      runningLabel: "停止",
      runningResult: "已开始",
      stoppedResult: "已停止",
      params: [
        { key: "collimator", label: "规格", value: "32*0.6", widthClass: "w-20" },
        { key: "level", label: "级别", value: "1", widthClass: "w-12" },
      ],
    },
  ],
};

const INITIAL_LOGS: HardwareTestLog[] = [
  {
    id: "boot-1",
    time: "16:14:02",
    module: "机架",
    actionName: "系统初始化",
    paramsSnapshot: "无参数",
    result: "硬件测试控制台已就绪",
  },
  {
    id: "boot-2",
    time: "16:14:05",
    module: "机架",
    actionName: "通信检测",
    paramsSnapshot: "无参数",
    result: "机架通讯正常",
  },
];

const cloneActions = () =>
  TABS.reduce<Record<HardwareTestTab, HardwareTestAction[]>>((acc, tab) => {
    acc[tab] = INITIAL_ACTIONS[tab].map((action) => ({
      ...action,
      params: action.params?.map((param) => ({ ...param })),
    }));
    return acc;
  }, {} as Record<HardwareTestTab, HardwareTestAction[]>);

const buildActionKey = (tab: HardwareTestTab, rowId: string) => `${tab}:${rowId}`;

const buildFieldKey = (field: EditingField | null) =>
  field ? `${field.tab}:${field.rowId}:${field.paramKey}` : null;

const formatTime = () =>
  new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export function useHardwareTest() {
  const [activeTab, setActiveTabState] = useState<HardwareTestTab>("机架");
  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [runningActions, setRunningActions] = useState<Record<string, boolean>>({});
  const [actionsByTab, setActionsByTab] = useState<Record<HardwareTestTab, HardwareTestAction[]>>(cloneActions);
  const [logs, setLogs] = useState<HardwareTestLog[]>(INITIAL_LOGS);

  const rows = actionsByTab[activeTab];
  const editingFieldKey = buildFieldKey(editingField);

  const setActiveTab = (tab: HardwareTestTab) => {
    setActiveTabState(tab);
    setEditingField(null);
  };

  const updateParamValue = (tab: HardwareTestTab, rowId: string, paramKey: string, nextValue: string) => {
    setActionsByTab((prev) => ({
      ...prev,
      [tab]: prev[tab].map((row) =>
        row.id === rowId
          ? {
              ...row,
              params: row.params?.map((param) =>
                param.key === paramKey ? { ...param, value: nextValue } : param,
              ),
            }
          : row,
      ),
    }));
  };

  const prependLog = (entry: Omit<HardwareTestLog, "id">) => {
    setLogs((prev) => [
      { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
      ...prev,
    ].slice(0, 50));
  };

  const executeAction = (rowId: string) => {
    const row = actionsByTab[activeTab].find((item) => item.id === rowId);
    if (!row) return;

    const actionKey = buildActionKey(activeTab, rowId);
    const isRunning = Boolean(runningActions[actionKey]);
    const paramsSnapshot =
      row.params?.length
        ? row.params.map((param) => `${param.label}=${param.value}`).join("，")
        : "无参数";

    let result = row.completedResult ?? "已执行";

    if (row.control === "toggle") {
      const nextRunning = !isRunning;
      setRunningActions((prev) => ({ ...prev, [actionKey]: nextRunning }));
      result = nextRunning ? row.runningResult ?? "已开始" : row.stoppedResult ?? "已停止";
    } else if (isRunning) {
      setRunningActions((prev) => ({ ...prev, [actionKey]: false }));
    }

    setEditingField(null);
    prependLog({
      time: formatTime(),
      module: activeTab,
      actionName: row.name,
      paramsSnapshot,
      result,
    });
  };

  const anyRunning = useMemo(() => Object.values(runningActions).some(Boolean), [runningActions]);

  return {
    activeTab,
    anyRunning,
    clearLogs: () => setLogs([]),
    editingField,
    editingFieldKey,
    executeAction,
    logs,
    rows,
    runningActions,
    setActiveTab,
    setEditingField,
    tabs: TABS,
    updateParamValue,
  };
}
