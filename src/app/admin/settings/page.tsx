import { CheckCircle2, CircleAlert, CreditCard, Mail, Settings2, ShoppingBag } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { stripeKeys } from "@/lib/stripe";
import { maskSecret } from "@/lib/crypto";
import { mailConfigured } from "@/lib/mail";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { FormDialog, ToggleField } from "@/components/admin/actions";
import { formatMoney } from "@/lib/utils";

export const metadata = { title: "Admin · Settings" };

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-3.5 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default async function SettingsPage() {
  const admin = await requireAdminPage();
  const superAdmin = admin.role === "SUPER_ADMIN";
  const [general, orders, payments, keys] = await Promise.all([getSetting("general"), getSetting("orders"), getSetting("payments"), stripeKeys()]);
  const webhookUrl = `${env.appUrl}/api/webhooks/stripe`;
  const mode = keys.secretKey.startsWith("sk_live") || keys.secretKey.startsWith("rk_live") ? "live" : keys.secretKey ? "test" : null;
  const G = "/api/admin/settings/general";
  const O = "/api/admin/settings/orders";
  const P = "/api/admin/settings/payments";

  return (
    <>
      <PageHeader title="Settings & Stripe" description="Configure the platform without touching the source code. Every change is audited." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-violet-300" /><CardTitle>General</CardTitle></div>
            <FormDialog
              trigger={<Button size="sm" variant="secondary">Edit</Button>}
              title="General settings"
              path={G}
              method="PATCH"
              fields={[
                { name: "siteName", label: "Site name", defaultValue: general.siteName },
                { name: "supportEmail", label: "Support email", type: "email", defaultValue: general.supportEmail },
                { name: "announcement", label: "Dashboard announcement", type: "textarea", defaultValue: general.announcement, hint: "Shown at the top of user dashboards. Leave empty to hide." },
              ]}
              keepEmpty={["announcement"]}
            />
          </CardHeader>
          <CardContent>
            <Row label="Site name"><span className="text-sm text-muted">{general.siteName}</span></Row>
            <Row label="Support email"><span className="text-sm text-muted">{general.supportEmail}</span></Row>
            <Row label="Registrations open" hint="Allow new accounts"><ToggleField path={G} field="registrationOpen" checked={general.registrationOpen} /></Row>
            <Row label="Require verified email to purchase"><ToggleField path={G} field="requireVerifiedEmailToPurchase" checked={general.requireVerifiedEmailToPurchase} /></Row>
            <Row label="Maintenance mode" hint="Blocks new purchases (site stays online)"><ToggleField path={G} field="maintenanceMode" checked={general.maintenanceMode} /></Row>
            <Row label="Email delivery (SMTP)" hint="Configured with SMTP_* environment variables">
              {mailConfigured() ? <Badge tone="green"><Mail className="h-3 w-3" /> Configured</Badge> : <Badge tone="amber">Not configured — emails logged</Badge>}
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-violet-300" /><CardTitle>Orders & anti-abuse</CardTitle></div>
            <FormDialog
              trigger={<Button size="sm" variant="secondary">Edit</Button>}
              title="Order settings"
              path={O}
              method="PATCH"
              fields={[
                { name: "defaultExpiryMinutes", label: "Default expiry (minutes)", type: "number", defaultValue: orders.defaultExpiryMinutes, hint: "Used when the provider doesn't return an expiry." },
                { name: "maxActiveOrdersPerUser", label: "Max active orders per user", type: "number", defaultValue: orders.maxActiveOrdersPerUser },
                { name: "maxOrdersPerHour", label: "Max orders per user per hour", type: "number", defaultValue: orders.maxOrdersPerHour },
              ]}
            />
          </CardHeader>
          <CardContent>
            <Row label="Default expiry"><span className="text-sm text-muted">{orders.defaultExpiryMinutes} min</span></Row>
            <Row label="Max active orders / user"><span className="text-sm text-muted">{orders.maxActiveOrdersPerUser}</span></Row>
            <Row label="Max orders / user / hour"><span className="text-sm text-muted">{orders.maxOrdersPerHour}</span></Row>
            <Row label="Auto-refund on expiry" hint="Refund the wallet when no SMS arrives"><ToggleField path={O} field="autoRefundOnExpiry" checked={orders.autoRefundOnExpiry} /></Row>
          </CardContent>
        </Card>
      </div>

      <Card className="glow-ring mt-4" id="stripe">
        <CardHeader>
          <div>
            <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-violet-300" /><CardTitle>Stripe configuration</CardTitle></div>
            <CardDescription>Stripe Checkout with dynamic price_data — no product catalog to create. Funds are credited only by verified webhooks.</CardDescription>
          </div>
          {mode && <Badge tone={mode === "live" ? "green" : "amber"}>{mode === "live" ? "LIVE mode" : "TEST mode"}</Badge>}
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <Row label="Secret key" hint={keys.source === "env" ? "From STRIPE_SECRET_KEY (env)" : keys.source === "admin" ? "Encrypted in database" : "Not configured"}>
                {keys.secretKey ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> {maskSecret(keys.secretKey)}</Badge> : <Badge tone="red"><CircleAlert className="h-3 w-3" /> Missing</Badge>}
              </Row>
              <Row label="Webhook signing secret" hint={process.env.STRIPE_WEBHOOK_SECRET ? "From STRIPE_WEBHOOK_SECRET (env)" : "whsec_…"}>
                {keys.webhookSecret ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> {maskSecret(keys.webhookSecret)}</Badge> : <Badge tone="red"><CircleAlert className="h-3 w-3" /> Missing</Badge>}
              </Row>
              <Row label="Publishable key"><span className="max-w-[220px] truncate font-mono text-xs text-muted">{payments.publishableKey || "—"}</span></Row>
              <Row label="Card payments enabled"><ToggleField path={P} field="enabled" checked={payments.enabled} /></Row>
              <Row label="Direct card purchase of numbers" hint="Pay a single number without topping up"><ToggleField path={P} field="allowDirectCardPurchase" checked={payments.allowDirectCardPurchase} /></Row>
              <Row label="Top-up limits"><span className="text-sm text-muted">{formatMoney(payments.minTopupCents)} – {formatMoney(payments.maxTopupCents)}</span></Row>
              <Row label="Preset amounts"><span className="text-sm text-muted">{payments.presetAmountsCents.map((c) => formatMoney(c)).join(" · ")}</span></Row>
              <Row label="Currency"><span className="text-sm uppercase text-muted">{payments.currency}</span></Row>
              <div className="mt-4 flex flex-wrap gap-2">
                {superAdmin && (
                  <FormDialog
                    trigger={<Button size="sm">Set Stripe keys</Button>}
                    title="Stripe API keys"
                    description="Stored AES-256-GCM encrypted, never sent to the browser. Environment variables take precedence."
                    path={P}
                    method="PATCH"
                    fields={[
                      { name: "publishableKey", label: "Publishable key", placeholder: "pk_live_…", defaultValue: payments.publishableKey },
                      { name: "secretKey", label: "Secret key", type: "password", placeholder: "sk_live_… (leave empty to keep)" },
                      { name: "webhookSecret", label: "Webhook signing secret", type: "password", placeholder: "whsec_… (leave empty to keep)" },
                    ]}
                    success="Stripe keys saved"
                  />
                )}
                <FormDialog
                  trigger={<Button size="sm" variant="secondary">Edit limits</Button>}
                  title="Payment limits"
                  path={P}
                  method="PATCH"
                  fields={[
                    { name: "minTopupCents", label: "Minimum top-up (USD)", type: "number", money: true, defaultValue: (payments.minTopupCents / 100).toFixed(2) },
                    { name: "maxTopupCents", label: "Maximum top-up (USD)", type: "number", money: true, defaultValue: (payments.maxTopupCents / 100).toFixed(2) },
                    { name: "presets", label: "Preset amounts (USD, comma separated)", defaultValue: payments.presetAmountsCents.map((c) => c / 100).join(", ") },
                  ]}
                  csvMoney={{ from: "presets", to: "presetAmountsCents" }}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-sm">
              <p className="font-medium">Webhook setup (required)</p>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted">
                <li>Stripe Dashboard → Developers → Webhooks → <em>Add endpoint</em>.</li>
                <li>
                  Endpoint URL:
                  <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-white/10 bg-background/60 p-2">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs text-violet-200">{webhookUrl}</code>
                    <CopyButton value={webhookUrl} />
                  </div>
                </li>
                <li>
                  Events: <code className="font-mono text-xs text-foreground">checkout.session.completed</code>, <code className="font-mono text-xs text-foreground">checkout.session.async_payment_succeeded</code>,{" "}
                  <code className="font-mono text-xs text-foreground">checkout.session.async_payment_failed</code>, <code className="font-mono text-xs text-foreground">checkout.session.expired</code>,{" "}
                  <code className="font-mono text-xs text-foreground">charge.refunded</code>.
                </li>
                <li>Copy the signing secret (<code className="font-mono text-xs">whsec_…</code>) into <code className="font-mono text-xs">STRIPE_WEBHOOK_SECRET</code> or the form.</li>
              </ol>
              <p className="mt-4 text-xs text-muted">Local testing: <code className="font-mono">stripe listen --forward-to localhost:3000/api/webhooks/stripe</code></p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
