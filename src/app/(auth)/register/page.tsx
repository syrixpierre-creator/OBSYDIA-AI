import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/forms";
import { getCurrentUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Register" };

export default async function Page() {
  if (await getCurrentUser()) redirect("/dashboard");
  const general = await getSetting("general");
  return (
    <AuthShell title="Create your account" subtitle="Start receiving SMS in under a minute." footer={<>Already registered? <Link className="text-violet-300 hover:underline" href="/login">Log in</Link></>}>
      {general.registrationOpen ? <RegisterForm /> : <p className="text-sm text-muted">Registrations are temporarily closed. Please come back later.</p>}
    </AuthShell>
  );
}
