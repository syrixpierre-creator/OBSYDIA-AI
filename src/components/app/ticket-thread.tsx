import { cn, formatDate, initials } from "@/lib/utils";

export function TicketThread({ messages }: { messages: { id: string; body: string; isStaff: boolean; createdAt: Date; author: { name: string } }[] }) {
  return (
    <ul className="space-y-4">
      {messages.map((m) => (
        <li key={m.id} className={cn("flex gap-3", m.isStaff && "flex-row-reverse text-right")}>
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold", m.isStaff ? "bg-brand-gradient" : "bg-white/10")}>{initials(m.author.name)}</div>
          <div className={cn("max-w-[85%] rounded-2xl border p-4", m.isStaff ? "border-violet-500/25 bg-violet-500/[0.07]" : "border-white/[0.07] bg-white/[0.02]")}>
            <p className="text-xs text-muted">
              {m.isStaff ? "INCONNU SMS Support" : m.author.name} · {formatDate(m.createdAt)}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-left text-sm">{m.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
