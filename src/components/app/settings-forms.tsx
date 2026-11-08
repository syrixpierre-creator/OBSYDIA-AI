"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Confirm } from "@/components/ui/confirm";
import { api, withToast } from "@/lib/client-api";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const ok = await withToast(api("/api/account/profile", "PATCH", { name: new FormData(e.currentTarget).get("name") }), "Profile updated");
        setLoading(false);
        if (ok) router.refresh();
      }}
    >
      <Field label="Full name">
        <Input name="name" defaultValue={name} required minLength={2} maxLength={80} />
      </Field>
      <Field label="Email" hint="Contact support to change your email address.">
        <Input value={email} disabled readOnly />
      </Field>
      <Button type="submit" loading={loading}>Save changes</Button>
    </form>
  );
}

export function PasswordForm() {
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setLoading(true);
        const ok = await withToast(api("/api/account/password", "POST", { currentPassword: f.get("current"), newPassword: f.get("new") }), "Password changed — other sessions signed out");
        setLoading(false);
        if (ok) form.reset();
      }}
    >
      <Field label="Current password">
        <Input name="current" type="password" required autoComplete="current-password" />
      </Field>
      <Field label="New password" hint="At least 10 characters with upper, lower case and a number.">
        <Input name="new" type="password" required minLength={10} autoComplete="new-password" />
      </Field>
      <Button type="submit" loading={loading}>Update password</Button>
    </form>
  );
}

export function RevokeSessions({ count }: { count: number }) {
  const router = useRouter();
  return (
    <Confirm
      title="Sign out other sessions?"
      description="All devices except this one will be logged out."
      confirmLabel="Sign out others"
      tone="danger"
      onConfirm={async () => {
        const r = await withToast(api<{ revoked: number }>("/api/account/sessions", "DELETE"));
        if (r) {
          toast.success(`${r.revoked} session(s) revoked`);
          router.refresh();
        }
      }}
    >
      <Button variant="secondary" disabled={count <= 1}>Sign out other sessions</Button>
    </Confirm>
  );
}
