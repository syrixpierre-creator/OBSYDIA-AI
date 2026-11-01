import { env } from "../config/env.js";

export type EmailKind =
  | "welcome"
  | "verify_email"
  | "reset_password"
  | "change_email"
  | "subscription_activated"
  | "payment_succeeded"
  | "payment_failed"
  | "subscription_canceled"
  | "referral_reward"
  | "team_invitation";

type Copy = { subject: string; heading: string; body: string; cta?: string };

const copy: Record<EmailKind, Record<"en" | "fr", Copy>> = {
  welcome: {
    en: { subject: "Welcome to {app}", heading: "Welcome, {name}", body: "Your {app} workspace is ready. Start a conversation, generate a project or explore the developer API.", cta: "Open {app}" },
    fr: { subject: "Bienvenue sur {app}", heading: "Bienvenue, {name}", body: "Votre espace {app} est prêt. Lancez une conversation, générez un projet ou explorez l'API développeur.", cta: "Ouvrir {app}" }
  },
  verify_email: {
    en: { subject: "Your {app} verification code: {code}", heading: "Verify your email", body: "Use the code {code} or the button below to verify your email address. The code expires in 30 minutes.", cta: "Verify email" },
    fr: { subject: "Votre code de vérification {app} : {code}", heading: "Vérifiez votre e-mail", body: "Utilisez le code {code} ou le bouton ci-dessous pour vérifier votre adresse e-mail. Le code expire dans 30 minutes.", cta: "Vérifier l'e-mail" }
  },
  reset_password: {
    en: { subject: "Reset your {app} password", heading: "Password reset", body: "We received a request to reset your password. The link expires in 30 minutes. If you did not request it, you can ignore this email.", cta: "Choose a new password" },
    fr: { subject: "Réinitialisez votre mot de passe {app}", heading: "Réinitialisation du mot de passe", body: "Nous avons reçu une demande de réinitialisation. Le lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.", cta: "Choisir un nouveau mot de passe" }
  },
  change_email: {
    en: { subject: "Confirm your new {app} email", heading: "Confirm your new email", body: "Use the code {code} or the button below to confirm this address for your account.", cta: "Confirm email" },
    fr: { subject: "Confirmez votre nouvel e-mail {app}", heading: "Confirmez votre nouvel e-mail", body: "Utilisez le code {code} ou le bouton ci-dessous pour confirmer cette adresse.", cta: "Confirmer l'e-mail" }
  },
  subscription_activated: {
    en: { subject: "Your {plan} plan is active", heading: "{plan} activated", body: "Thank you. Your {plan} subscription is now active and your token allowance has been updated.", cta: "Go to dashboard" },
    fr: { subject: "Votre offre {plan} est active", heading: "{plan} activé", body: "Merci. Votre abonnement {plan} est actif et votre quota de jetons a été mis à jour.", cta: "Accéder au tableau de bord" }
  },
  payment_succeeded: {
    en: { subject: "Payment received — {amount}", heading: "Payment successful", body: "We received your payment of {amount} for the {plan} plan.", cta: "View billing" },
    fr: { subject: "Paiement reçu — {amount}", heading: "Paiement réussi", body: "Nous avons reçu votre paiement de {amount} pour l'offre {plan}.", cta: "Voir la facturation" }
  },
  payment_failed: {
    en: { subject: "Payment failed for your {plan} plan", heading: "Payment failed", body: "We could not process your latest payment. Please update your payment method to keep your {plan} plan.", cta: "Update billing" },
    fr: { subject: "Échec du paiement de votre offre {plan}", heading: "Échec du paiement", body: "Nous n'avons pas pu traiter votre dernier paiement. Mettez à jour votre moyen de paiement pour conserver l'offre {plan}.", cta: "Mettre à jour" }
  },
  subscription_canceled: {
    en: { subject: "Your {plan} subscription was cancelled", heading: "Subscription cancelled", body: "Your {plan} subscription has been cancelled. {detail}", cta: "View plans" },
    fr: { subject: "Votre abonnement {plan} a été annulé", heading: "Abonnement annulé", body: "Votre abonnement {plan} a été annulé. {detail}", cta: "Voir les offres" }
  },
  referral_reward: {
    en: { subject: "You earned {tokens} bonus tokens", heading: "Referral reward", body: "{count} people joined {app} with your link. {tokens} bonus tokens have been added to your balance.", cta: "View referrals" },
    fr: { subject: "Vous avez gagné {tokens} jetons bonus", heading: "Récompense de parrainage", body: "{count} personnes ont rejoint {app} avec votre lien. {tokens} jetons bonus ont été ajoutés à votre solde.", cta: "Voir mes parrainages" }
  },
  team_invitation: {
    en: { subject: "{inviter} invited you to {team} on {app}", heading: "Team invitation", body: "{inviter} invited you to join the team {team}. The invitation expires in 7 days.", cta: "Accept invitation" },
    fr: { subject: "{inviter} vous invite dans {team} sur {app}", heading: "Invitation d'équipe", body: "{inviter} vous invite à rejoindre l'équipe {team}. L'invitation expire dans 7 jours.", cta: "Accepter l'invitation" }
  }
};

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function fill(template: string, data: Record<string, string>, escape: boolean) {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = data[k] ?? "";
    return escape ? esc(v) : v;
  });
}

export function renderEmail(kind: EmailKind, locale: "en" | "fr", input: Record<string, string>) {
  const e = env();
  const data: Record<string, string> = { app: e.APP_NAME, ...input };
  const c = copy[kind][locale] || copy[kind].en;
  const subject = fill(c.subject, data, false);
  const heading = fill(c.heading, data, true);
  const bodyText = fill(c.body, data, false);
  const bodyHtml = fill(c.body, data, true);
  const url = data.url || e.APP_URL;
  const footer =
    locale === "fr"
      ? `${e.APP_NAME} · ${e.APP_COMPANY} · Pensez. Créez. Construisez. Déployez.`
      : `${e.APP_NAME} · ${e.APP_COMPANY} · Think. Create. Build. Deploy.`;
  const code = data.code
    ? `<p style="font:600 28px/1.2 ui-monospace,Menlo,monospace;letter-spacing:8px;color:#F5F5F7;margin:24px 0">${esc(data.code)}</p>`
    : "";
  const button = c.cta
    ? `<a href="${esc(url)}" style="display:inline-block;background:#8B5CF6;color:#fff;text-decoration:none;font:600 14px system-ui,sans-serif;padding:12px 20px;border-radius:8px">${esc(fill(c.cta, data, false))}</a>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#08090D;padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" style="max-width:520px;background:#10121A;border:1px solid #262A38;border-radius:14px" cellspacing="0" cellpadding="0"><tr><td style="padding:32px"><p style="font:700 13px system-ui,sans-serif;letter-spacing:3px;color:#9298A8;margin:0 0 24px">${esc(e.APP_NAME.toUpperCase())}</p><h1 style="font:600 22px system-ui,sans-serif;color:#F5F5F7;margin:0 0 12px">${heading}</h1><p style="font:400 15px/1.6 system-ui,sans-serif;color:#C9CCD6;margin:0">${bodyHtml}</p>${code}<div style="margin-top:24px">${button}</div><p style="font:400 12px/1.5 system-ui,sans-serif;color:#6B7080;margin:32px 0 0">${esc(footer)}<br>${esc(e.APP_EMAIL)}</p></td></tr></table></td></tr></table></body></html>`;
  const text = `${heading}\n\n${bodyText}\n\n${c.cta ? `${fill(c.cta, data, false)}: ${url}\n\n` : ""}${footer}`;
  return { subject, html, text };
}
