import { useI18n } from "../lib/i18n";
import { api } from "../lib/api";
import { useSession } from "../lib/session";

export function LanguageSwitch({ compact }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n();
  const { user } = useSession();
  const change = (l: "en" | "fr") => {
    setLocale(l);
    if (user) void api.patch("/api/auth/profile", { locale: l }).catch(() => undefined);
  };
  return (
    <div className={`seg ${compact ? "seg-compact" : ""}`} role="group" aria-label="Language">
      <button className={locale === "en" ? "active" : ""} onClick={() => change("en")}>
        EN
      </button>
      <button className={locale === "fr" ? "active" : ""} onClick={() => change("fr")}>
        FR
      </button>
    </div>
  );
}
