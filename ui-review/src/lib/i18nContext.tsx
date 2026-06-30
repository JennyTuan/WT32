/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getSystemSettings, type LanguageCode } from "./systemSettingsApi";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isLanguageCode,
  translate,
  type TranslationKey,
  type TranslationValues,
} from "./i18n";

type I18nContextValue = {
  language: LanguageCode;
  locale: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const readStoredLanguage = (): LanguageCode => {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguageCode(stored) ? stored : DEFAULT_LANGUAGE;
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(readStoredLanguage);

  const setLanguage = useCallback((nextLanguage: LanguageCode) => {
    setLanguageState(nextLanguage);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = nextLanguage;
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    let cancelled = false;

    getSystemSettings()
      .then((settings) => {
        if (!cancelled) setLanguage(settings.general.language);
      })
      .catch(() => {
        // Keep the local fallback when the prototype backend is not reachable yet.
      });

    return () => {
      cancelled = true;
    };
  }, [setLanguage]);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) => translate(language, key, values),
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: language,
      setLanguage,
      t,
    }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
