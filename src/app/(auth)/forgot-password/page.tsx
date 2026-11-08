import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "@/components/auth/forms";

export const metadata = { title: "Forgot password" };

export default function Page() {
  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send you a reset link." footer={<Link className="text-violet-300 hover:underline" href="/login">Back to login</Link>}>
      <ForgotForm />
    </AuthShell>
  );
}
