import { Link } from "react-router-dom";
import { ArrowUpRight, Zap } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { formatNumber, relativeTime } from "../lib/api";

export function UpgradeCard({ compact }: { compact?: boolean }) {
  const { t, locale } = useI18n();
  const { balance, user } = useSession();
  const when = balance ? relativeTime(balance.resetAt, locale) : "";
  const canUpgrade = user && user.plan !== "premium" && user.plan !== "custom";
  if (compact) {
    return (
      <div className="limit-bar">
        <Zap size={14} />
        <span className="grow">{balance && balance.remaining > 0 ? t("limit.low", { n: formatNumber(balance.remaining, locale) }) : t("limit.title")}</span>
        {canUpgrade && <Link to="/app/billing#plans" className="btn sm primary">{t("limit.cta")}</Link>}
      </div>
    );
  }
  return (
    <div className="limit-card">
      <div className="limit-icon"><Zap size={18} /></div>
      <div className="grow">
        <div className="limit-title">{t("limit.title")}</div>
        <div className="limit-body">{t("limit.body", { when })}</div>
      </div>
      {canUpgrade && (
        <Link to="/app/billing#plans" className="btn primary">
          {t("limit.cta")} <ArrowUpRight size={15} />
        </Link>
      )}
    </div>
  );
}
