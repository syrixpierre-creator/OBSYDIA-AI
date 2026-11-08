import { AppShell } from "@/components/app/app-shell";
import { VerifyBanner } from "@/components/app/verify-banner";
import { requireUser } from "@/lib/auth";
import { userNav } from "@/lib/nav";
import { getSetting } from "@/lib/settings";
import { shellData } from "@/lib/shell-data";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [data, general] = await Promise.all([shellData(user.id), getSetting("general")]);
  return (
    <AppShell
      area="user"
      nav={userNav}
      user={user}
      balanceCents={data.balanceCents}
      notifications={data.notifications}
      banner={
        <>
          {general.announcement && (
            <div className="border-b border-violet-500/20 bg-violet-500/[0.08] px-4 py-2.5 text-center text-sm text-violet-100">{general.announcement}</div>
          )}
          {!user.emailVerified && <VerifyBanner />}
        </>
      }
    >
      {children}
    </AppShell>
  );
}
