"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, Send, Trash2, Webhook } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Confirm } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { api, withToast } from "@/lib/client-api";
import { formatDate } from "@/lib/utils";

type Key = { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string; rateLimitPerMin: number };
type Hook = { id: string; url: string; events: string[]; enabled: boolean; lastStatusCode: number | null; lastDeliveryAt: string | null };

export function ApiManager({ keys, hooks, events }: { keys: Key[]; hooks: Hook[]; events: readonly string[] }) {
  const router = useRouter();
  const [secret, setSecret] = useState<{ title: string; value: string } | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [sel, setSel] = useState<string[]>(["order.sms_received"]);
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>API keys</CardTitle>
            <CardDescription>Keys authenticate requests to /api/v1. They are shown only once.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const r = await withToast(api<{ key: string }>("/api/keys", "POST", { name }), "API key created");
              setBusy(false);
              if (r) {
                setSecret({ title: "Your new API key", value: r.key });
                setName("");
                router.refresh();
              }
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. Production server" required minLength={2} maxLength={60} />
            <Button type="submit" loading={busy} className="shrink-0">
              <Plus /> Create
            </Button>
          </form>
          <div className="mt-4 space-y-2">
            {keys.length === 0 ? (
              <EmptyState icon={KeyRound} title="No API keys" description="Create a key to start integrating." className="py-8" />
            ) : (
              keys.map((k) => (
                <div key={k.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                  <KeyRound className="h-4 w-4 text-violet-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{k.name}</p>
                    <p className="truncate font-mono text-xs text-muted">
                      {k.prefix}•••••••• · {k.rateLimitPerMin}/min · {k.lastUsedAt ? `used ${formatDate(k.lastUsedAt)}` : "never used"}
                    </p>
                  </div>
                  <Confirm
                    title="Revoke this API key?"
                    description="Applications using it will immediately lose access. This cannot be undone."
                    confirmLabel="Revoke key"
                    tone="danger"
                    onConfirm={async () => {
                      if (await withToast(api(`/api/keys/${k.id}`, "DELETE"), "Key revoked")) router.refresh();
                    }}
                  >
                    <Button variant="ghost" size="icon" aria-label="Revoke">
                      <Trash2 />
                    </Button>
                  </Confirm>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card id="webhooks">
        <CardHeader>
          <div>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>Receive signed real-time events on your server.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const r = await withToast(api<{ secret: string }>("/api/user-webhooks", "POST", { url, events: sel }), "Webhook added");
              setBusy(false);
              if (r) {
                setSecret({ title: "Webhook signing secret", value: r.secret });
                setUrl("");
                router.refresh();
              }
            }}
          >
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-server.com/webhooks/inconnu" type="url" required />
            <div className="flex flex-wrap gap-1.5">
              {events.map((ev) => {
                const on = sel.includes(ev);
                return (
                  <button
                    type="button"
                    key={ev}
                    onClick={() => setSel(on ? sel.filter((x) => x !== ev) : [...sel, ev])}
                    className={`rounded-lg border px-2 py-1 font-mono text-[11px] transition ${on ? "border-violet-500/50 bg-violet-500/15 text-violet-100" : "border-white/10 text-muted hover:text-foreground"}`}
                  >
                    {ev}
                  </button>
                );
              })}
            </div>
            <Button type="submit" loading={busy} disabled={!sel.length} size="sm">
              <Plus /> Add endpoint
            </Button>
          </form>
          <div className="mt-4 space-y-2">
            {hooks.length === 0 ? (
              <EmptyState icon={Webhook} title="No webhook endpoints" className="py-8" />
            ) : (
              hooks.map((h) => (
                <div key={h.id} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-mono text-xs">{h.url}</p>
                    {!h.enabled && <Badge tone="red">Disabled</Badge>}
                    {h.lastStatusCode !== null && <Badge tone={h.lastStatusCode < 300 ? "green" : "red"}>{h.lastStatusCode}</Badge>}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Send test"
                      onClick={async () => {
                        const r = await withToast(api<{ success: boolean; statusCode: number | null; error: string | null }>(`/api/user-webhooks/${h.id}/test`, "POST"));
                        if (r) {
                          if (r.success) toast.success(`Delivered (${r.statusCode})`);
                          else toast.error(`Failed: ${r.error ?? r.statusCode}`);
                          router.refresh();
                        }
                      }}
                    >
                      <Send />
                    </Button>
                    <Confirm title="Delete this webhook?" confirmLabel="Delete" tone="danger" onConfirm={async () => { if (await withToast(api(`/api/user-webhooks/${h.id}`, "DELETE"), "Webhook deleted")) router.refresh(); }}>
                      <Button variant="ghost" size="icon" aria-label="Delete">
                        <Trash2 />
                      </Button>
                    </Confirm>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">{h.events.join(" · ")}</p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(secret)} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent title={secret?.title ?? ""} description="Copy it now and store it securely — it will not be shown again.">
          <div className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.07] p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{secret?.value}</code>
            <CopyButton value={secret?.value ?? ""} />
          </div>
          <Button className="mt-4 w-full" onClick={() => setSecret(null)}>
            I&apos;ve saved it
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
