"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api, withToast } from "@/lib/client-api";

export function NewTicketForm({ orderId }: { orderId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setLoading(true);
        const r = await withToast(
          api<{ id: string }>("/api/support", "POST", {
            subject: f.get("subject"),
            category: f.get("category"),
            priority: f.get("priority"),
            message: f.get("message"),
            orderId: orderId || undefined,
          }),
          "Ticket created — our team will reply soon",
        );
        setLoading(false);
        if (r) router.push(`/dashboard/support/${r.id}`);
      }}
    >
      <Field label="Subject">
        <Input name="subject" required minLength={4} maxLength={120} placeholder="Briefly describe your issue" defaultValue={orderId ? `Issue with order #${orderId.slice(-8).toUpperCase()}` : ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select name="category" defaultValue={orderId ? "order" : "general"}>
            <option value="general">General</option>
            <option value="order">Order</option>
            <option value="payment">Payment</option>
            <option value="api">API</option>
            <option value="account">Account</option>
          </Select>
        </Field>
        <Field label="Priority">
          <Select name="priority" defaultValue="NORMAL">
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
          </Select>
        </Field>
      </div>
      <Field label="Message">
        <Textarea name="message" required minLength={10} maxLength={5000} placeholder="Give us as many details as possible…" />
      </Field>
      <Button type="submit" loading={loading}>
        <Send /> Submit ticket
      </Button>
    </form>
  );
}

export function ReplyForm({ ticketId, closed, staff }: { ticketId: string; closed: boolean; staff?: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  if (closed && !staff) return <p className="text-sm text-muted">This ticket is closed. Open a new ticket if you need further help.</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const ok = await withToast(api(`/api/support/${ticketId}/reply`, "POST", { body }), "Reply sent");
        setLoading(false);
        if (ok) {
          setBody("");
          router.refresh();
        }
      }}
    >
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={5000} placeholder="Write a reply…" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={loading} disabled={!body.trim()}>
          <Send /> Send reply
        </Button>
        {!closed && (
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              if (await withToast(api(`/api/support/${ticketId}/close`, "POST"), "Ticket closed")) router.refresh();
            }}
          >
            Close ticket
          </Button>
        )}
      </div>
    </form>
  );
}
