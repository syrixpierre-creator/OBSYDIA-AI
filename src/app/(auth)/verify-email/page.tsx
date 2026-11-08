import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmail } from "@/components/auth/forms";

export const metadata = { title: "Verify email" };

export default function Page() {
  return (
    <AuthShell title="Email verification">
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthShell>
  );
}
