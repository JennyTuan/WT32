import { useEffect, useMemo, useRef, useState } from "react";

import type { TranslationKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/i18nContext";
import type { LanguageCode } from "../../../lib/systemSettingsApi";
import type {
  EditingField,
  HardwareTestAction,
  HardwareTestLog,
  HardwareTestTab,
  HardwareTestTabOption,
} from "./types";

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

const DEFAULT_AUTO_COMPLETE_MS = 1400;

const createTabOptions = (t: Translate): HardwareTestTabOption[] => [
  { id: "gantry", label: t("service.hardwareTest.tab.gantry") },
  { id: "rail", label: t("service.hardwareTest.tab.rail") },
  { id: "imaging", label: t("service.hardwareTest.tab.imaging") },
];

const createTabLabels = (t: Translate): Record<HardwareTestTab, string> => ({
  gantry: t("service.hardwareTest.tab.gantry"),
  rail: t("service.hardwareTest.tab.rail"),
  imaging: t("service.hardwareTest.tab.imaging"),
});

const createInitialActions = (t: Translate): Record<HardwareTestTab, HardwareTestAction[]> => ({
  gantry: [
    {
      id: "gantry-reset",
      name: t("service.hardwareTest.action.gantryReset"),
      code: "(RCB)",
      control: "reset",
      idleLabel: t("service.hardwareTest.button.reset"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.resetting"),
      stoppedResult: t("service.hardwareTest.result.stopped"),
      completedResult: t("service.hardwareTest.result.reset"),
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      buttonTone: "neutral",
    },
    {
      id: "rotation-home",
      name: t("service.hardwareTest.action.rotationHome"),
      control: "trigger",
      idleLabel: t("service.hardwareTest.button.start"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.executing"),
      stoppedResult: t("service.hardwareTest.result.stopped"),
      completedResult: t("service.hardwareTest.result.completed"),
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
    },
    {
      id: "rotation-control",
      name: t("service.hardwareTest.action.rotationControl"),
      control: "toggle",
      idleLabel: t("service.hardwareTest.button.start"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.started"),
      stoppedResult: t("service.hardwareTest.result.stopped"),
      params: [{ key: "speed", label: t("service.hardwareTest.param.speed"), value: "3", widthClass: "w-14" }],
    },
    {
      id: "gantry-position",
      name: t("service.hardwareTest.action.gantryPosition"),
      control: "trigger",
      idleLabel: t("service.hardwareTest.button.start"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.positioning"),
      stoppedResult: t("service.hardwareTest.result.stopped"),
      completedResult: t("service.hardwareTest.result.completed"),
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      params: [
        { key: "speed", label: t("service.hardwareTest.param.speed"), value: "3", widthClass: "w-14" },
        { key: "angle", label: t("service.hardwareTest.param.angle"), value: "180", widthClass: "w-16" },
      ],
    },
    {
      id: "tilt-reset",
      name: t("service.hardwareTest.action.tiltReset"),
      control: "reset",
      idleLabel: t("service.hardwareTest.button.reset"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.resetting"),
      stoppedResult: t("service.hardwareTest.result.stopped"),
      completedResult: t("service.hardwareTest.result.reset"),
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      buttonTone: "neutral",
    },
    {
      id: "tilt-control",
      name: t("service.hardwareTest.action.tiltControl"),
      control: "toggle",
      idleLabel: t("service.hardwareTest.button.start"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.started"),
      stoppedResult: t("service.hardwareTest.result.stopped"),
      params: [{ key: "angle", label: t("service.hardwareTest.param.angle"), value: "0", widthClass: "w-16" }],
    },
  ],
  rail: [
    {
      id: "bed-reset",
      name: t("service.hardwareTest.action.bedReset"),
      code: "(UCB)",
      control: "reset",
      idleLabel: t("service.hardwareTest.button.reset"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.resetting"),
      stoppedResult: t("service.hardwareTest.result.stopped"),
      completedResult: t("service.hardwareTest.result.reset"),
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      buttonTone: "neutral",
    },
    {
      id: "bed-move-target",
      name: t("service.hardwareTest.action.bedMoveTarget"),
      control: "trigger",
      idleLabel: t("service.hardwareTest.button.start"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.moving"),
      stoppedResult: t("service.hardwareTest.result.stopped"),
      completedResult: t("service.hardwareTest.result.completed"),
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      params: [
        { key: "speed", label: t("service.hardwareTest.param.speed"), value: "33", widthClass: "w-14" },
        { key: "position", label: t("service.hardwareTest.param.position"), value: "500", widthClass: "w-16" },
      ],
    },
  ],
  imaging: [
    {
      id: "rotor-control",
      name: t("service.hardwareTest.action.rotorControl"),
      control: "toggle",
      idleLabel: t("service.hardwareTest.button.start"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.started"),
      stoppedResult: t("service.hardwareTest.result.stopped"),
    },
    {
      id: "laser-control",
      name: t("service.hardwareTest.action.laserControl"),
      control: "toggle",
      idleLabel: t("service.hardwareTest.button.light"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.lit"),
      stoppedResult: t("service.hardwareTest.result.closed"),
    },
    {
      id: "collimator-reset",
      name: t("service.hardwareTest.action.collimatorReset"),
      control: "reset",
      idleLabel: t("service.hardwareTest.button.reset"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.resetting"),
      stoppedResult: t("service.hardwareTest.result.stopped"),
      completedResult: t("service.hardwareTest.result.reset"),
      autoCompleteMs: DEFAULT_AUTO_COMPLETE_MS,
      buttonTone: "neutral",
    },
    {
      id: "collimator-control",
      name: t("service.hardwareTest.action.collimatorControl"),
      control: "toggle",
      idleLabel: t("service.hardwareTest.button.start"),
      runningLabel: t("service.hardwareTest.button.stop"),
      runningResult: t("service.hardwareTest.result.started"),
      stoppedResult: t("service.hardwareTest.result.stopped"),
      params: [
        { key: "collimator", label: t("service.hardwareTest.param.collimator"), value: "32*0.6", widthClass: "w-20" },
        { key: "level", label: "1", value: "1", widthClass: "w-12" },
      ],
    },
  ],
});

const createInitialLogs = (t: Translate): HardwareTestLog[] => [
  {
    id: "boot-1",
    time: "16:14:02",
    module: t("service.hardwareTest.tab.gantry"),
    actionName: t("service.hardwareTest.log.systemInit"),
    paramsSnapshot: t("service.hardwareTest.noParams"),
    result: t("service.hardwareTest.log.consoleReady"),
  },
  {
    id: "boot-2",
    time: "16:14:05",
    module: t("service.hardwareTest.tab.gantry"),
    actionName: t("service.hardwareTest.log.communicationCheck"),
    paramsSnapshot: t("service.hardwareTest.noParams"),
    result: t("service.hardwareTest.log.gantryCommunicationNormal"),
  },
];

const cloneActions = (source: Record<HardwareTestTab, HardwareTestAction[]>) =>
  Object.keys(source).reduce<Record<HardwareTestTab, HardwareTestAction[]>>((acc, rawTab) => {
    const tab = rawTab as HardwareTestTab;
    acc[tab] = source[tab].map((action) => ({
      ...action,
      params: action.params?.map((param) => ({ ...param })),
    }));
    return acc;
  }, {} as Record<HardwareTestTab, HardwareTestAction[]>);

const buildActionKey = (tab: HardwareTestTab, rowId: string) => `${tab}:${rowId}`;

const buildFieldKey = (field: EditingField | null) =>
  field ? `${field.tab}:${field.rowId}:${field.paramKey}` : null;

const formatTime = (language: LanguageCode) =>
  new Date().toLocaleTimeString(language, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export function useHardwareTest() {
  const { language, t } = useI18n();
  const initialActions = useMemo(() => createInitialActions(t), [t]);
  const initialLogs = useMemo(() => createInitialLogs(t), [t]);
  const tabLabels = useMemo(() => createTabLabels(t), [t]);
  const tabs = useMemo(() => createTabOptions(t), [t]);

  const [activeTab, setActiveTabState] = useState<HardwareTestTab>("gantry");
  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [runningActions, setRunningActions] = useState<Record<string, boolean>>({});
  const [actionsByTab, setActionsByTab] = useState<Record<HardwareTestTab, HardwareTestAction[]>>(() => cloneActions(initialActions));
  const [logs, setLogs] = useState<HardwareTestLog[]>(initialLogs);
  const timersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  // Reset localized demo state when language resources change.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    Object.values(timersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = {};
    setEditingField(null);
    setRunningActions({});
    setActionsByTab(cloneActions(initialActions));
    setLogs(initialLogs);
  }, [initialActions, initialLogs]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
        ? row.params.map((param) => `${param.label}=${param.value}`).join(t("service.hardwareTest.paramSeparator"))
        : t("service.hardwareTest.noParams");

    setEditingField(null);

    if (isRunning) {
      clearRunningTimer(actionKey);
      setRunningActions((prev) => ({ ...prev, [actionKey]: false }));
      prependLog({
        time: formatTime(language),
        module: tabLabels[activeTab],
        actionName: row.name,
        paramsSnapshot,
        result: row.stoppedResult ?? t("service.hardwareTest.result.stopped"),
      });
      return;
    }

    setRunningActions((prev) => ({ ...prev, [actionKey]: true }));
    prependLog({
      time: formatTime(language),
      module: tabLabels[activeTab],
      actionName: row.name,
      paramsSnapshot,
      result: row.runningResult ?? t("service.hardwareTest.result.executing"),
    });

    if (row.control !== "toggle") {
      clearRunningTimer(actionKey);
      timersRef.current[actionKey] = window.setTimeout(() => {
        setRunningActions((prev) => ({ ...prev, [actionKey]: false }));
        prependLog({
          time: formatTime(language),
          module: tabLabels[activeTab],
          actionName: row.name,
          paramsSnapshot,
          result: row.completedResult ?? t("service.hardwareTest.result.completed"),
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
    tabs,
    updateParamValue,
  };
}
