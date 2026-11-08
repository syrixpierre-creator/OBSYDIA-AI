import Link from "next/link";
import type { Prisma, TicketStatus } from "@prisma/client";
import { LifeBuoy } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { FilterTabs } from "@/components/app/filter-tabs";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Admin · Support" };
const S: TicketStatus[] = ["OPEN", "PENDING", "ANSWERED", "CLOSED"];

export default async function AdminSupport({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const where: Prisma.SupportTicketWhereInput = S.includes(sp.status as TicketStatus) ? { status: sp.status as TicketStatus } : {};
  const [tickets, total] = await Promise.all([
    db.supportTicket.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip, take, include: { user: { select: { email: true } }, _count: { select: { messages: true } } } }),
    db.supportTicket.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Support tickets" description={`${total} tickets`} />
      <FilterTabs tabs={[{ value: "", label: "All" }, ...S.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))]} param="status" current={sp.status ?? ""} basePath="/admin/support" />
      <Card>
        {tickets.length === 0 ? (
          <EmptyState icon={LifeBuoy} title="No tickets" />
        ) : (
          <>
            <Table>
              <THead><tr><TH>Subject</TH><TH>User</TH><TH>Category</TH><TH>Priority</TH><TH>Status</TH><TH>Updated</TH></tr></THead>
              <tbody>
                {tickets.map((t) => (
                  <TR key={t.id}>
                    <TD><Link href={`/admin/support/${t.id}`} className="font-medium hover:text-violet-300">{t.subject}</Link><p className="text-xs text-muted">{t._count.messages} messages</p></TD>
                    <TD className="text-muted">{t.user.email}</TD>
                    <TD>{t.category}</TD>
                    <TD><Badge tone={t.priority === "URGENT" || t.priority === "HIGH" ? "red" : "neutral"}>{t.priority}</Badge></TD>
                    <TD><StatusBadge status={t.status} /></TD>
                    <TD className="text-muted">{timeAgo(t.updatedAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/support" params={{ status: sp.status }} />
          </>
        )}
      </Card>
    </>
  );
}
