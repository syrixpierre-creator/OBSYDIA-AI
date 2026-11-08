import { ScrollText } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { FilterTabs } from "@/components/app/filter-tabs";
import { SearchForm } from "@/components/admin/search-form";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Admin · Logs" };

export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const view = sp.view === "system" ? "system" : sp.view === "api" ? "api" : "audit";
  const q = sp.q?.trim();
  const { page, pageSize, skip, take } = pageParams(sp, 40);
  const aWhere: Prisma.AuditLogWhereInput = q ? { OR: [{ action: { contains: q } }, { entityId: q }, { actor: { email: { contains: q, mode: "insensitive" } } }] } : {};
  const sWhere: Prisma.SystemLogWhereInput = { ...(q ? { OR: [{ message: { contains: q, mode: "insensitive" } }, { source: { contains: q } }] } : {}), ...(sp.level ? { level: sp.level } : {}) };
  const iWhere: Prisma.ApiLogWhereInput = q ? { OR: [{ path: { contains: q } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {};
  const [audit, aT, sys, sT, apiLogs, iT] = await Promise.all([
    view === "audit" ? db.auditLog.findMany({ where: aWhere, orderBy: { createdAt: "desc" }, skip, take, include: { actor: { select: { email: true } } } }) : [],
    view === "audit" ? db.auditLog.count({ where: aWhere }) : 0,
    view === "system" ? db.systemLog.findMany({ where: sWhere, orderBy: { createdAt: "desc" }, skip, take }) : [],
    view === "system" ? db.systemLog.count({ where: sWhere }) : 0,
    view === "api" ? db.apiLog.findMany({ where: iWhere, orderBy: { createdAt: "desc" }, skip, take, include: { user: { select: { email: true } } } }) : [],
    view === "api" ? db.apiLog.count({ where: iWhere }) : 0,
  ]);
  const tone = (l: string) => (l === "error" ? "red" : l === "warn" ? "amber" : "blue") as "red" | "amber" | "blue";
  return (
    <>
      <PageHeader title="System logs" description="Audit trail of sensitive actions, provider/payment events and API traffic." />
      <FilterTabs tabs={[{ value: "", label: "Audit log" }, { value: "system", label: "System events" }, { value: "api", label: "API requests" }]} param="view" current={view === "audit" ? "" : view} basePath="/admin/logs" />
      <SearchForm action="/admin/logs" q={q} placeholder="Filter…">
        {view !== "audit" && <input type="hidden" name="view" value={view} />}
        {view === "system" && (
          <select name="level" defaultValue={sp.level ?? ""} className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm">
            <option value="">All levels</option><option value="info">Info</option><option value="warn">Warn</option><option value="error">Error</option>
          </select>
        )}
      </SearchForm>
      <Card>
        {view === "audit" && (audit.length === 0 ? <EmptyState icon={ScrollText} title="No entries" /> : (
          <>
            <Table>
              <THead><tr><TH>Time</TH><TH>Actor</TH><TH>Action</TH><TH>Entity</TH><TH>IP</TH><TH>Details</TH></tr></THead>
              <tbody>
                {audit.map((a) => (
                  <TR key={a.id}>
                    <TD className="whitespace-nowrap text-muted">{formatDate(a.createdAt)}</TD>
                    <TD>{a.actor?.email ?? "system"}</TD>
                    <TD><code className="font-mono text-xs text-violet-200">{a.action}</code></TD>
                    <TD className="font-mono text-[11px] text-muted">{a.entity}{a.entityId && `:${a.entityId.slice(-10)}`}</TD>
                    <TD className="text-muted">{a.ip ?? "—"}</TD>
                    <TD className="max-w-[320px] truncate font-mono text-[11px] text-muted">{JSON.stringify(a.metadata)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={aT} basePath="/admin/logs" params={{ q }} />
          </>
        ))}
        {view === "system" && (sys.length === 0 ? <EmptyState icon={ScrollText} title="No entries" /> : (
          <>
            <Table>
              <THead><tr><TH>Time</TH><TH>Level</TH><TH>Source</TH><TH>Message</TH></tr></THead>
              <tbody>
                {sys.map((s) => (
                  <TR key={s.id}>
                    <TD className="whitespace-nowrap text-muted">{formatDate(s.createdAt)}</TD>
                    <TD><Badge tone={tone(s.level)}>{s.level}</Badge></TD>
                    <TD className="font-mono text-xs">{s.source}</TD>
                    <TD className="max-w-[560px]"><p className="truncate">{s.message}</p>{JSON.stringify(s.context) !== "{}" && <p className="truncate font-mono text-[11px] text-muted">{JSON.stringify(s.context)}</p>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={sT} basePath="/admin/logs" params={{ q, view, level: sp.level }} />
          </>
        ))}
        {view === "api" && (apiLogs.length === 0 ? <EmptyState icon={ScrollText} title="No API requests yet" /> : (
          <>
            <Table>
              <THead><tr><TH>Time</TH><TH>User</TH><TH>Request</TH><TH>Status</TH><TH>IP</TH><TH className="text-right">Duration</TH></tr></THead>
              <tbody>
                {apiLogs.map((l) => (
                  <TR key={l.id}>
                    <TD className="whitespace-nowrap text-muted">{formatDate(l.createdAt)}</TD>
                    <TD>{l.user?.email ?? "anonymous"}</TD>
                    <TD className="font-mono text-xs"><Badge tone="blue" className="mr-2">{l.method}</Badge>{l.path}</TD>
                    <TD><Badge tone={l.statusCode < 400 ? "green" : l.statusCode === 429 ? "amber" : "red"}>{l.statusCode}</Badge></TD>
                    <TD className="text-muted">{l.ip}</TD>
                    <TD className="text-right tabular-nums text-muted">{l.durationMs} ms</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={iT} basePath="/admin/logs" params={{ q, view }} />
          </>
        ))}
      </Card>
    </>
  );
}
