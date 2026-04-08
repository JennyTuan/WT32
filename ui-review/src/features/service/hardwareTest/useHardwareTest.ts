import { useEffect, useMemo, useRef, useState } from "react";

import type {
  EditingField,
  HardwareTestAction,
  HardwareTestLog,
  HardwareTestTab,
  HardwareTestTabOption,
} from "./types";

const TAB_OPTIONS: HardwareTestTabOption[] = [
  { id: "gantry", label: "机架" },
  { id: "rail", label: "轨道" },
  { id: "imaging", label: "影像" },
];

const TAB_LABELS: Record<HardwareTestTab, string> = {
  gantry: "机架",
  rail: "轨道",
  imaging: "影像",
};

const DEFAULT_AUTO_COMPLETE_MS = 1400;

const INITIAL_ACTIONS: Record<HardwareTestTab, HardwareTestAction[]> = {
  gantry: [
    {
      id: "gantry-reset",
      name: "机架复位",
      code: "(RCB)",
      control: "reset",
      idleLabel: "复位",
      runningLabel: "停止",
      runningResult: "复位中",
      stoppedResult: "已停止",
      completedResult: "已复位",
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      buttonTone: "neutral",
    },
    {
      id: "rotation-home",
      name: "旋转找零",
      control: "trigger",
      idleLabel: "开始",
      runningLabel: "停止",
      runningResult: "执行中",
      stoppedResult: "已停止",
      completedResult: "已完成",
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
    },
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
      runningLabel: "停止",
      runningResult: "定位中",
      stoppedResult: "已停止",
      completedResult: "已完成",
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      params: [
        { key: "speed", label: "速度", value: "3", widthClass: "w-14" },
        { key: "angle", label: "角度", value: "180", widthClass: "w-16" },
      ],
    },
    {
      id: "tilt-reset",
      name: "倾斜复位",
      control: "reset",
      idleLabel: "复位",
      runningLabel: "停止",
      runningResult: "复位中",
      stoppedResult: "已停止",
      completedResult: "已复位",
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      buttonTone: "neutral",
    },
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
  rail: [
    {
      id: "bed-reset",
      name: "扫描床复位",
      code: "(UCB)",
      control: "reset",
      idleLabel: "复位",
      runningLabel: "停止",
      runningResult: "复位中",
      stoppedResult: "已停止",
      completedResult: "已复位",
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      buttonTone: "neutral",
    },
    {
      id: "bed-move-target",
      name: "移动开始(目标位置)",
      control: "trigger",
      idleLabel: "开始",
      runningLabel: "停止",
      runningResult: "移动中",
      stoppedResult: "已停止",
      completedResult: "已完成",
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      params: [
        { key: "speed", label: "速度", value: "33", widthClass: "w-14" },
        { key: "position", label: "位置", value: "500", widthClass: "w-16" },
      ],
    },
  ],
  imaging: [
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
      runningLabel: "停止",
      runningResult: "已点亮",
      stoppedResult: "已关闭",
    },
    {
      id: "collimator-reset",
      name: "准直器复位",
      control: "reset",
      idleLabel: "复位",
      runningLabel: "停止",
      runningResult: "复位中",
      stoppedResult: "已停止",
      completedResult: "已复位",
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      buttonTone: "neutral",
    },
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
        { key: "level", label: "1", value: "1", widthClass: "w-12" },
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
  Object.keys(INITIAL_ACTIONS).reduce<Record<HardwareTestTab, HardwareTestAction[]>>((acc, rawTab) => {
    const tab = rawTab as HardwareTestTab;
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
  const [activeTab, setActiveTabState] = useState<HardwareTestTab>("gantry");
  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [runningActions, setRunningActions] = useState<Record<string, boolean>>({});
  const [actionsByTab, setActionsByTab] = useState<Record<HardwareTestTab, HardwareTestAction[]>>(cloneActions);
  const [logs, setLogs] = useState<HardwareTestLog[]>(INITIAL_LOGS);
  const timersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

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

  const clearRunningTimer = (actionKey: string) => {
    const timerId = timersRef.current[actionKey];
    if (timerId) {
      window.clearTimeout(timerId);
      delete timersRef.current[actionKey];
    }
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

    setEditingField(null);

    if (isRunning) {
      clearRunningTimer(actionKey);
      setRunningActions((prev) => ({ ...prev, [actionKey]: false }));
      prependLog({
        time: formatTime(),
        module: TAB_LABELS[activeTab],
        actionName: row.name,
        paramsSnapshot,
        result: row.stoppedResult ?? "已停止",
      });
      return;
    }

    setRunningActions((prev) => ({ ...prev, [actionKey]: true }));
    prependLog({
      time: formatTime(),
      module: TAB_LABELS[activeTab],
      actionName: row.name,
      paramsSnapshot,
      result: row.runningResult ?? "执行中",
    });

    if (row.control !== "toggle") {
      clearRunningTimer(actionKey);
      timersRef.current[actionKey] = window.setTimeout(() => {
        setRunningActions((prev) => ({ ...prev, [actionKey]: false }));
        prependLog({
          time: formatTime(),
          module: TAB_LABELS[activeTab],
          actionName: row.name,
          paramsSnapshot,
          result: row.completedResult ?? "已完成",
        });
        delete timersRef.current[actionKey];
      }, row.autoCompleteMs ?? DEFAULT_AUTO_COMPLETE_MS);
    }
  };

  const anyRunning = useMemo(() => Object.values(runningActions).some(Boolean), [runningActions]);

  return {
    activeTab,
    anyRunning,
    clearLogs: () => setLogs([]),
    editingFieldKey,
    executeAction,
    logs,
    rows,
    runningActions,
    setActiveTab,
    setEditingField,
    tabs: TAB_OPTIONS,
    updateParamValue,
  };
}
