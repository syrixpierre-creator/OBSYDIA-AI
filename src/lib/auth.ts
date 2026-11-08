import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { RoleName } from "@prisma/client";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";

export const SESSION_COOKIE = "isms_session";
const SESSION_DAYS = 30;

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  status: "ACTIVE" | "SUSPENDED";
  emailVerified: boolean;
  createdAt: Date;
};

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown").slice(0, 64);
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      ip: await clientIp(),
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { role: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const u = session.user;
  if (u.status === "SUSPENDED") return null;
  // Touch session at most every 10 minutes
  if (Date.now() - session.lastSeenAt.getTime() > 600_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role.name,
    status: u.status,
    emailVerified: Boolean(u.emailVerifiedAt),
    createdAt: u.createdAt,
  };
}

export const isAdminRole = (r: RoleName) => r === "ADMIN" || r === "SUPER_ADMIN";

/** For server components / pages. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminPage() {
  const user = await requireUser();
  if (!isAdminRole(user.role)) redirect("/dashboard");
  return user;
}
