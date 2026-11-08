import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ReplyForm } from "@/components/app/support-forms";
import { TicketThread } from "@/components/app/ticket-thread";
import { ActionButton } from "@/components/admin/actions";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Admin · Ticket" };

export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await db.supportTicket.findUnique({
    where: { id },
    include: { user: { include: { wallet: true } }, messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } } },
  });
  if (!t) notFound();
  const order = t.orderId ? await db.order.findUnique({ where: { id: t.orderId }, include: { service: true, country: true } }) : null;
  return (
    <>
      <Link href="/admin/support" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All tickets</Link>
      <PageHeader
        title={t.subject}
        description={`${t.user.name} · ${t.user.email} · balance ${formatMoney(t.user.wallet?.balanceCents ?? 0)}`}
        actions={
          <>
            <StatusBadge status={t.status} />
            {t.priority !== "URGENT" && <ActionButton path={`/api/admin/support/${t.id}`} method="PATCH" body={{ priority: "URGENT" }} label="Mark urgent" success="Priority updated" />}
            {t.status !== "PENDING" && t.status !== "CLOSED" && <ActionButton path={`/api/admin/support/${t.id}`} method="PATCH" body={{ status: "PENDING" }} label="Set pending" success="Status updated" />}
            {t.status === "CLOSED" && <ActionButton path={`/api/admin/support/${t.id}`} method="PATCH" body={{ status: "OPEN" }} label="Reopen" success="Ticket reopened" />}
          </>
        }
      />
      {order && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">Related order:</span>
            <span className="font-medium">{order.service.name} · {order.country.name}</span>
            <span className="font-mono text-xs">{order.phoneNumber}</span>
            <StatusBadge status={order.status} />
            <span className="text-muted">{formatDate(order.createdAt)}</span>
            <Link href={`/admin/orders?q=${order.id}`} className="text-violet-300 hover:underline">Open in orders</Link>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="space-y-6">
          <TicketThread messages={t.messages} />
          <div className="border-t border-white/[0.06] pt-5">
            <ReplyForm ticketId={t.id} closed={t.status === "CLOSED"} staff />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
