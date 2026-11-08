"use client";
import { MailWarning } from "lucide-react";
import { useState } from "react";
import { api, withToast } from "@/lib/client-api";

export function VerifyBanner() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="border-b border-warning/20 bg-warning/[0.07] px-4 py-2.5 text-sm text-amber-200 sm:px-6">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2">
        <MailWarning className="h-4 w-4" />
        <span>Please verify your email address to secure your account.</span>
        <button
          disabled={loading}
          className="font-medium underline underline-offset-4 hover:text-amber-100 disabled:opacity-50"
          onClick={async () => {
            setLoading(true);
            await withToast(api("/api/auth/resend-verification", "POST"), "Verification email sent");
            setLoading(false);
          }}
        >
          Resend email
        </button>
      </div>
    </div>
  );
}
