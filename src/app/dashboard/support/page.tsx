import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NewTicketForm } from "@/components/app/support-forms";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const order = sp.order ? await db.order.findFirst({ where: { id: sp.order, userId: user.id }, select: { id: true } }) : null;
  const tickets = await db.supportTicket.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { messages: true } } } });
  return (
    <>
      <PageHeader title="Support" description="Our team is here to help. Average response time: a few hours." />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Open a ticket</CardTitle>
              <CardDescription>Describe your problem, we&apos;ll get back to you by ticket and notification.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <NewTicketForm orderId={order?.id} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your tickets</CardTitle>
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <EmptyState icon={LifeBuoy} title="No tickets yet" description="Tickets you open will appear here." />
            ) : (
              <ul className="space-y-2">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link href={`/dashboard/support/${t.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3 transition hover:border-violet-500/30">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.subject}</p>
                        <p className="text-xs text-muted">
                          {t.category} · {t._count.messages} messages · updated {timeAgo(t.updatedAt)}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
