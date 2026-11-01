import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Users, Loader2 } from "lucide-react";
import { SitePage } from "../components/Site";
import { api } from "../lib/api";
import { useI18n, type TKey } from "../lib/i18n";
import { useSession } from "../lib/session";

export function InviteAccept() {
  const { token } = useParams();
  const { t, errorText } = useI18n();
  const { user } = useSession();
  const navigate = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/api/teams/invitations/${token}`).then(setInfo).catch((e) => setError(errorText(e)));
  }, [token, errorText]);
  const accept = async () => {
    setBusy(true);
    try {
      await api.post(`/api/teams/invitations/${token}/accept`);
      navigate("/app/team");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <SitePage>
      <div className="container" style={{ maxWidth: 520, padding: "96px 24px" }}>
        <div className="card card-pad stack" style={{ gap: 16, padding: 28 }}>
          <Users size={28} color="var(--primary)" />
          <h1 style={{ margin: 0, fontSize: 24 }}>{t("team.acceptTitle")}</h1>
          {info && <p className="muted" style={{ margin: 0 }}>{t("team.acceptBody", { inviter: info.inviter, team: info.team, role: t(`team.${info.role}` as TKey) })}</p>}
          {error && <div className="alert error">{error}</div>}
          {info && (user ? (
            <button className="btn primary lg" onClick={accept} disabled={busy}>{busy && <Loader2 size={16} className="spin" />} {t("team.accept")}</button>
          ) : (
            <div className="row">
              <Link className="btn primary" to={`/login?next=${next}`}>{t("nav.login")}</Link>
              <Link className="btn" to={`/register?next=${next}`}>{t("nav.signup")}</Link>
            </div>
          ))}
        </div>
      </div>
    </SitePage>
  );
}
