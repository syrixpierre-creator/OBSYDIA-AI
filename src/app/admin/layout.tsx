import { AppShell } from "@/components/app/app-shell";
import { requireAdminPage } from "@/lib/auth";
import { adminNav } from "@/lib/nav";
import { shellData } from "@/lib/shell-data";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage();
  const data = await shellData(user.id);
  return (
    <AppShell area="admin" nav={adminNav} user={user} notifications={data.notifications}>
      {children}
    </AppShell>
  );
}
