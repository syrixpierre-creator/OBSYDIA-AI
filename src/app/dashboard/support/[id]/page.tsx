import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ReplyForm } from "@/components/app/support-forms";
import { TicketThread } from "@/components/app/ticket-thread";

export const metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const t = await db.supportTicket.findFirst({
    where: { id, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } } },
  });
  if (!t) notFound();
  return (
    <>
      <Link href="/dashboard/support" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All tickets
      </Link>
      <PageHeader title={t.subject} description={`Ticket #${t.id.slice(-8).toUpperCase()} · ${t.category}`} actions={<StatusBadge status={t.status} />} />
      <Card>
        <CardContent className="space-y-6">
          <TicketThread messages={t.messages} />
          <div className="border-t border-white/[0.06] pt-5">
            <ReplyForm ticketId={t.id} closed={t.status === "CLOSED"} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
