import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getOrderForUser, refreshOrder, serializeOrder } from "@/lib/orders";
import { PageHeader } from "@/components/app/app-shell";
import { OrderLive } from "@/components/app/order-live";

export const metadata = { title: "Order details" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const order = await getOrderForUser(id, user.id).catch(() => null);
  if (!order) notFound();
  await refreshOrder(id).catch(() => {});
  const fresh = await getOrderForUser(id, user.id);
  return (
    <>
      <Link href="/dashboard/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>
      <PageHeader title={`Order #${id.slice(-8).toUpperCase()}`} description="Live status of your virtual number." />
      <OrderLive initial={serializeOrder(fresh)} />
    </>
  );
}
