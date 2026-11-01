import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { en, type Dict } from "./i18n.en";
import { fr } from "./i18n.fr";
import { ApiError } from "./api";

export type Locale = "en" | "fr";
export type TKey = keyof Dict;

const dicts: Record<Locale, Dict> = { en, fr };

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem("obs_locale");
    if (saved === "en" || saved === "fr") return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  errorText: (err: unknown) => string;
}

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem("obs_locale", l);
    } catch {}
    document.documentElement.lang = l;
  }, []);
  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => {
      let s = dicts[locale][key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [locale]
  );
  const errorText = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        const key = `err.${err.code}` as TKey;
        if (key in en) return t(key);
        return err.message || t("err.generic");
      }
      if (err instanceof TypeError) return t("err.network");
      return t("err.generic");
    },
    [t]
  );
  const value = useMemo(() => ({ locale, setLocale, t, errorText }), [locale, setLocale, t, errorText]);
  document.documentElement.lang = locale;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("I18nProvider missing");
  return ctx;
}
