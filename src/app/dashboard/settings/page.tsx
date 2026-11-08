import { cookies } from "next/headers";
import { Monitor } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, SESSION_COOKIE } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PasswordForm, ProfileForm, RevokeSessions } from "@/components/app/settings-forms";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const current = sha256((await cookies()).get(SESSION_COOKIE)?.value ?? "");
  const sessions = await db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } });
  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, security and active sessions." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Profile</CardTitle>
              <CardDescription className="flex items-center gap-2">
                Account role: <Badge tone="violet">{user.role.replace("_", " ")}</Badge>
                {user.emailVerified ? <Badge tone="green">Email verified</Badge> : <Badge tone="amber">Email not verified</Badge>}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ProfileForm name={user.name} email={user.email} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Active sessions</CardTitle>
            <CardDescription>Devices currently signed in to your account.</CardDescription>
          </div>
          <RevokeSessions count={sessions.length} />
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-white/[0.05]">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Monitor className="h-4 w-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{s.userAgent ?? "Unknown device"}</p>
                  <p className="text-xs text-muted">
                    IP {s.ip ?? "—"} · last active {formatDate(s.lastSeenAt)}
                  </p>
                </div>
                {s.tokenHash === current && <Badge tone="green">This device</Badge>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
