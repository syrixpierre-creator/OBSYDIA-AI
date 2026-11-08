import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Login" };

export default async function Page() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <AuthShell title="Welcome back" subtitle="Log in to your INCONNU SMS account." footer={<>New here? <Link className="text-violet-300 hover:underline" href="/register">Create an account</Link></>}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
