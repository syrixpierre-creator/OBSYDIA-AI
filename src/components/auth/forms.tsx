"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Eye, EyeOff, MailCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/client-api";

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground" aria-label="Toggle password visibility">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function fieldErrors(e: unknown): Record<string, string> {
  if (e instanceof ApiError && e.details && typeof e.details === "object") {
    return Object.fromEntries(Object.entries(e.details as Record<string, string[]>).map(([k, v]) => [k, v?.[0] ?? ""]));
  }
  return {};
}

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setLoading(true);
        try {
          const r = await api<{ redirect: string }>("/api/auth/login", "POST", { email: f.get("email"), password: f.get("password") });
          toast.success("Welcome back!");
          const next = sp.get("next");
          router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : r.redirect);
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
          setLoading(false);
        }
      }}
    >
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>
      <Field label="Password">
        <PasswordInput name="password" autoComplete="current-password" required placeholder="••••••••••" />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-xs text-violet-300 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Log in
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setLoading(true);
        setErrors({});
        try {
          await api("/api/auth/register", "POST", {
            name: f.get("name"),
            email: f.get("email"),
            password: f.get("password"),
            acceptTerms: f.get("terms") === "on",
          });
          toast.success("Account created! Check your inbox to verify your email.");
          router.push("/dashboard");
          router.refresh();
        } catch (err) {
          setErrors(fieldErrors(err));
          toast.error((err as Error).message);
          setLoading(false);
        }
      }}
    >
      <Field label="Full name" error={errors.name}>
        <Input name="name" autoComplete="name" required minLength={2} placeholder="Jane Doe" />
      </Field>
      <Field label="Email" error={errors.email}>
        <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>
      <Field label="Password" error={errors.password} hint="At least 10 characters with upper, lower case and a number.">
        <PasswordInput name="password" autoComplete="new-password" required minLength={10} placeholder="••••••••••" />
      </Field>
      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent accent-violet-600" />
        <span>
          I agree to the{" "}
          <Link href="/legal/terms" className="text-violet-300 hover:underline">Terms</Link> and the{" "}
          <Link href="/legal/acceptable-use" className="text-violet-300 hover:underline">Acceptable Use Policy</Link>, and will only use the service for lawful, authorized purposes.
        </span>
      </label>
      {errors.acceptTerms && <p className="text-xs text-red-400">{errors.acceptTerms}</p>}
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Create account
      </Button>
    </form>
  );
}

export function ForgotForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  if (sent)
    return (
      <div className="flex flex-col items-center text-center">
        <MailCheck className="h-10 w-10 text-violet-400" />
        <p className="mt-4 text-sm text-muted">If an account exists for this email, a reset link has been sent. It expires in 1 hour.</p>
        <Button asChild variant="secondary" className="mt-6 w-full">
          <Link href="/login">Back to login</Link>
        </Button>
      </div>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          await api("/api/auth/forgot-password", "POST", { email: new FormData(e.currentTarget).get("email") });
          setSent(true);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field label="Email">
        <Input name="email" type="email" required placeholder="you@example.com" />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetForm() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  if (!token) return <p className="text-sm text-red-300">Missing or invalid reset link.</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("password") !== f.get("confirm")) return setError("Passwords do not match");
        setLoading(true);
        setError(undefined);
        try {
          await api("/api/auth/reset-password", "POST", { token, password: f.get("password") });
          toast.success("Password updated. You can now log in.");
          router.push("/login");
        } catch (err) {
          setError(fieldErrors(err).password ?? (err as Error).message);
          setLoading(false);
        }
      }}
    >
      <Field label="New password" hint="At least 10 characters with upper, lower case and a number.">
        <PasswordInput name="password" required minLength={10} autoComplete="new-password" />
      </Field>
      <Field label="Confirm password" error={error}>
        <PasswordInput name="confirm" required minLength={10} autoComplete="new-password" />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Update password
      </Button>
    </form>
  );
}

export function VerifyEmail() {
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const [state, setState] = useState<"loading" | "ok" | "error">(token ? "loading" : "error");
  const [msg, setMsg] = useState("Missing verification token.");
  const ran = useRef(false);
  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api("/api/auth/verify-email", "POST", { token })
      .then(() => setState("ok"))
      .catch((e) => {
        setMsg((e as Error).message);
        setState("error");
      });
  }, [token]);
  return (
    <div className="flex flex-col items-center text-center">
      {state === "loading" && <p className="text-sm text-muted">Verifying your email…</p>}
      {state === "ok" && (
        <>
          <CheckCircle2 className="h-10 w-10 text-success" />
          <p className="mt-4 text-sm text-muted">Your email address is verified. Thank you!</p>
          <Button asChild className="mt-6 w-full">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </>
      )}
      {state === "error" && (
        <>
          <XCircle className="h-10 w-10 text-danger" />
          <p className="mt-4 text-sm text-muted">{msg}</p>
          <Button asChild variant="secondary" className="mt-6 w-full">
            <Link href="/dashboard/settings">Request a new link</Link>
          </Button>
        </>
      )}
    </div>
  );
}
