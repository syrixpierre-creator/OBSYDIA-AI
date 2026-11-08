import Link from "next/link";
import { BookOpen } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { WEBHOOK_EVENTS } from "@/lib/notify";
import { PageHeader } from "@/components/app/app-shell";
import { ApiManager } from "@/components/app/api-manager";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/app/stat-card";
import { Activity, Gauge, KeyRound } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";

export const metadata = { title: "API Access" };

export default async function ApiPage() {
  const user = await requireUser();
  const since = new Date(Date.now() - 86400_000);
  const [keys, hooks, logs, count24h, errors24h] = await Promise.all([
    db.apiKey.findMany({ where: { userId: user.id, revokedAt: null }, orderBy: { createdAt: "desc" } }),
    db.webhook.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    db.apiLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.apiLog.count({ where: { userId: user.id, createdAt: { gte: since } } }),
    db.apiLog.count({ where: { userId: user.id, createdAt: { gte: since }, statusCode: { gte: 400 } } }),
  ]);
  return (
    <>
      <PageHeader
        title="API Access"
        description="Integrate INCONNU SMS into your applications or resell numbers."
        actions={
          <Button asChild variant="secondary">
            <Link href="/docs/api"><BookOpen /> API documentation</Link>
          </Button>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Active keys" value={String(keys.length)} icon={KeyRound} />
        <StatCard label="Requests (24h)" value={formatNumber(count24h)} icon={Activity} />
        <StatCard label="Errors (24h)" value={formatNumber(errors24h)} icon={Gauge} hint="HTTP status ≥ 400" />
      </div>
      <ApiManager
        keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, rateLimitPerMin: k.rateLimitPerMin, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, createdAt: k.createdAt.toISOString() }))}
        hooks={hooks.map((h) => ({ id: h.id, url: h.url, events: h.events, enabled: h.enabled, lastStatusCode: h.lastStatusCode, lastDeliveryAt: h.lastDeliveryAt?.toISOString() ?? null }))}
        events={WEBHOOK_EVENTS}
      />
      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Request history</CardTitle>
            <CardDescription>Latest API calls made with your keys</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-2 sm:px-0">
          {logs.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted">No requests yet. Try: <code className="font-mono text-xs text-violet-200">curl -H &quot;Authorization: Bearer isk_live_…&quot; {"<your-domain>"}/api/v1/balance</code></p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Time</TH>
                  <TH>Method</TH>
                  <TH>Path</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Duration</TH>
                </tr>
              </THead>
              <tbody>
                {logs.map((l) => (
                  <TR key={l.id}>
                    <TD className="whitespace-nowrap text-muted">{formatDate(l.createdAt)}</TD>
                    <TD><Badge tone="blue">{l.method}</Badge></TD>
                    <TD className="font-mono text-xs">{l.path}</TD>
                    <TD><Badge tone={l.statusCode < 400 ? "green" : l.statusCode === 429 ? "amber" : "red"}>{l.statusCode}</Badge></TD>
                    <TD className="text-right tabular-nums text-muted">{l.durationMs} ms</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
