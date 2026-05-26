import { useCallback, useEffect, useRef, useState } from "react";

import { getDoseSettings, listDrlEntries, type ApiDoseSettings, type ApiDrlEntry } from "./doseSettingsApi";
import { evaluateThreshold, type ThresholdInput, type ThresholdMatch } from "./doseThreshold";

type GuardState = {
  open: boolean;
  match: ThresholdMatch | null;
  ctdiVol: number | null | undefined;
  dlp: number | null | undefined;
};

const INITIAL_STATE: GuardState = {
  open: false,
  match: null,
  ctdiVol: null,
  dlp: null,
};

export function useDoseThresholdGuard() {
  const [settings, setSettings] = useState<ApiDoseSettings | null>(null);
  const [drlEntries, setDrlEntries] = useState<ApiDrlEntry[]>([]);
  const [state, setState] = useState<GuardState>(INITIAL_STATE);
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, d] = await Promise.all([
          getDoseSettings(),
          listDrlEntries().catch(() => [] as ApiDrlEntry[]),
        ]);
        if (cancelled) return;
        setSettings(s);
        setDrlEntries(d);
      } catch {
        // Demo: silently ignore — guard simply degrades to no-op.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Run the supplied action immediately if threshold action is log_only or the
  // scan does not exceed any DRL; otherwise open the modal and defer the action.
  const guard = useCallback(
    (input: ThresholdInput, proceed: () => void) => {
      if (!settings) {
        proceed();
        return;
      }
      const match = evaluateThreshold(input, drlEntries);
      if (!match.exceeded || settings.threshold_action === "log_only") {
        proceed();
        return;
      }
      pendingActionRef.current = proceed;
      setState({
        open: true,
        match,
        ctdiVol: input.ctdi_vol,
        dlp: input.dlp,
      });
    },
    [settings, drlEntries],
  );

  const confirm = useCallback(() => {
    const proceed = pendingActionRef.current;
    pendingActionRef.current = null;
    setState(INITIAL_STATE);
    proceed?.();
  }, []);

  const cancel = useCallback(() => {
    pendingActionRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  return {
    guard,
    confirm,
    cancel,
    modalProps: {
      open: state.open,
      action: settings?.threshold_action ?? "warn",
      match: state.match ?? {
        exceeded: false,
        drl: null,
        ctdiExceeded: false,
        dlpExceeded: false,
      },
      ctdiVol: state.ctdiVol,
      dlp: state.dlp,
    },
  };
}
