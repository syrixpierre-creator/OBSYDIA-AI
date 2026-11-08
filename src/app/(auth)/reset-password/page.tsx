import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/forms";

export const metadata = { title: "Reset password" };

export default function Page() {
  return (
    <AuthShell title="Choose a new password" subtitle="All your other sessions will be signed out.">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
