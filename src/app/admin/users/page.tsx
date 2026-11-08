import type { Prisma } from "@prisma/client";
import { Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHeader } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { SearchForm } from "@/components/admin/search-form";
import { ActionButton, FormDialog } from "@/components/admin/actions";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Admin · Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdminPage();
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp);
  const q = sp.q?.trim();
  const where: Prisma.UserWhereInput = {
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { id: q }] } : {}),
    ...(sp.status === "SUSPENDED" || sp.status === "ACTIVE" ? { status: sp.status } : {}),
  };
  const [users, total] = await Promise.all([
    db.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { role: true, wallet: true, _count: { select: { orders: true } } } }),
    db.user.count({ where }),
  ]);
  const superAdmin = admin.role === "SUPER_ADMIN";
  return (
    <>
      <PageHeader title="Users" description={`${total} accounts`} />
      <SearchForm action="/admin/users" q={q} placeholder="Search by email, name or ID…">
        <select name="status" defaultValue={sp.status ?? ""} className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </SearchForm>
      <Card>
        {users.length === 0 ? (
          <EmptyState icon={Users} title="No users found" />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>User</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Balance</TH>
                  <TH>Orders</TH>
                  <TH>Joined</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === admin.id;
                  const protectedTarget = u.role.name === "SUPER_ADMIN" && !superAdmin;
                  return (
                    <TR key={u.id}>
                      <TD>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted">{u.email}</p>
                        {!u.emailVerifiedAt && <Badge tone="amber" className="mt-1">Unverified</Badge>}
                      </TD>
                      <TD><Badge tone={u.role.name === "USER" ? "neutral" : "violet"}>{u.role.name.replace("_", " ")}</Badge></TD>
                      <TD>
                        <StatusBadge status={u.status} />
                        {u.suspendedReason && <p className="mt-1 max-w-[180px] truncate text-xs text-muted">{u.suspendedReason}</p>}
                      </TD>
                      <TD className="tabular-nums">{formatMoney(u.wallet?.balanceCents ?? 0)}</TD>
                      <TD>{u._count.orders}</TD>
                      <TD className="whitespace-nowrap text-muted">{formatDate(u.createdAt, false)}</TD>
                      <TD>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {!self && !protectedTarget && (
                            <>
                              {u.status === "ACTIVE" ? (
                                <FormDialog
                                  trigger={<Button variant="danger" size="sm">Suspend</Button>}
                                  title={`Suspend ${u.email}?`}
                                  description="The user is logged out immediately and cannot use the platform or API."
                                  path={`/api/admin/users/${u.id}`}
                                  method="PATCH"
                                  extra={{ status: "SUSPENDED" }}
                                  fields={[{ name: "suspendedReason", label: "Reason", placeholder: "Terms of service violation" }]}
                                  submitLabel="Suspend account"
                                  success="Account suspended"
                                />
                              ) : (
                                <ActionButton path={`/api/admin/users/${u.id}`} method="PATCH" body={{ status: "ACTIVE" }} label="Reactivate" success="Account reactivated" variant="success" />
                              )}
                              {!u.emailVerifiedAt && <ActionButton path={`/api/admin/users/${u.id}`} method="PATCH" body={{ verifyEmail: true }} label="Verify" success="Email marked as verified" />}
                              {superAdmin && (
                                <>
                                  <FormDialog
                                    trigger={<Button variant="secondary" size="sm">Role</Button>}
                                    title="Change role"
                                    path={`/api/admin/users/${u.id}`}
                                    method="PATCH"
                                    fields={[{ name: "role", label: "Role", type: "select", defaultValue: u.role.name, options: [{ value: "USER", label: "User" }, { value: "ADMIN", label: "Admin" }, { value: "SUPER_ADMIN", label: "Super Admin" }] }]}
                                    success="Role updated"
                                  />
                                  <FormDialog
                                    trigger={<Button variant="secondary" size="sm">Wallet</Button>}
                                    title="Adjust wallet balance"
                                    description="Positive to credit, negative to debit. Recorded in the ledger and audit log."
                                    path={`/api/admin/users/${u.id}/wallet`}
                                    extra={{ requestId: crypto.randomUUID() }}
                                    fields={[
                                      { name: "amountCents", label: "Amount (USD)", type: "number", money: true, required: true, placeholder: "e.g. 5 or -2.50" },
                                      { name: "reason", label: "Reason", required: true, placeholder: "Commercial gesture" },
                                    ]}
                                    success="Balance adjusted"
                                  />
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/users" params={{ q, status: sp.status }} />
          </>
        )}
      </Card>
    </>
  );
}
