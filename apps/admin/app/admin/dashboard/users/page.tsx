import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { listAdminUsersRead } from "@/lib/admin/admin-users-read";
import BetaAccessSelect from "./BetaAccessSelect";

export const dynamic = "force-dynamic";

type AdminUserRow = Awaited<ReturnType<typeof listAdminUsersRead>>["users"][number];

const FILTERS = [
  ["role", "Role", ["all", "user", "owner", "viewer", "editor", "reviewer", "admin", "manager", "superadmin", "ambassador", "experience", "partner_ambassador", "experience_team", "disabled"]],
  ["plan", "Plan", ["all", "free", "unlimited", "comped", "admin", "Pending"]],
  ["beta", "Beta status", ["all", "new", "approved", "rejected", "waitlist", "invited", "converted", "active", "paused", "completed", "removed", "none"]],
  ["status", "Account status", ["all", "active", "email_unverified", "pending_account", "disabled"]],
  ["email", "Email status", ["all", "verified", "unverified"]],
  ["tickets", "Support tickets", ["all", "yes"]],
  ["booked", "Booked outings", ["all", "yes"]],
] as const;

function humanize(value?: string | null) {
  return String(value || "").replaceAll("_", " ");
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function badgeClass(label?: string | null) {
  const value = String(label || "").toLowerCase();
  if (value.includes("disabled") || value.includes("rejected")) return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  if (value.includes("active") || value.includes("verified") || value.includes("eligible") || value.includes("approved")) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (value.includes("pending") || value.includes("unverified") || value.includes("waitlist")) return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (value.includes("admin") || value.includes("super")) return "border-rose-300/25 bg-rose-500/10 text-rose-100";
  if (value.includes("unlimited") || value.includes("owner")) return "border-sky-400/25 bg-sky-400/10 text-sky-100";
  return "border-white/10 bg-white/[.04] text-white/60";
}

function Badge({ value }: { value?: string | null }) {
  if (!value) return null;
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black capitalize ${badgeClass(value)}`}>{humanize(value)}</span>;
}

async function count(table: string, mutate?: (query: any) => any, column = "id") {
  try {
    let query = getAdminDatabaseClient().from(table).select(column, { count: "exact", head: true });
    if (mutate) query = mutate(query);
    const { count } = await query;
    return count || 0;
  } catch {
    return 0;
  }
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireAdminRole(["superadmin"]);
  const sp = await searchParams;

  const [result, newWeek, beta, booked, openTickets] = await Promise.all([
    listAdminUsersRead(sp),
    count("user_profiles", (query) =>
      query.gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()),
    ),
    count("beta_testers"),
    count("user_outings", undefined, "user_id"),
    count("support_tickets", (query) => query.not("status", "in", "(closed,resolved)")),
  ]);

  const filterCount =
    FILTERS.filter(([name]) => sp[name] && sp[name] !== "all").length +
    (sp.q ? 1 : 0);

  const metrics = [
    ["Total Users", result.count, "Matching current admin view"],
    ["New This Week", newWeek, "Created in the last 7 days"],
    ["Active Beta Testers", beta, "Beta tester records"],
    ["Booked Outings", booked, "Users with booking records"],
    ["Support Tickets", openTickets, "Open or unresolved"],
    ["Active Filters", filterCount, "Search and dropdown filters"],
  ];

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Customer Operations</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black sm:text-4xl">Users</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                Manage user accounts, roles, access, beta status, and activity.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/dashboard/users/new" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black">Add user</Link>
              {filterCount ? <Link href="/admin/dashboard/users" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black">Reset filters</Link> : null}
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {metrics.map(([label, value, helper]) => (
            <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/40">{label}</p>
              <p className="mt-2 text-3xl font-black">{value}</p>
              <p className="mt-1 text-xs text-white/45">{helper}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <form className="space-y-4">
            <div>
              <h2 className="text-lg font-black">Filter users</h2>
              <p className="mt-1 text-xs text-white/45">Search profiles, access, beta status, and activity.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <label className="grid gap-2 text-xs font-black uppercase tracking-[.14em] text-white/45 sm:col-span-2">
                Search users
                <input
                  name="q"
                  defaultValue={sp.q || ""}
                  placeholder="Name, email, phone, ZIP, or social"
                  className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 py-2 text-sm font-bold normal-case tracking-normal text-white outline-none focus:border-rose-300/50"
                />
              </label>
              {FILTERS.map(([name, label, options]) => (
                <label key={name} className="grid gap-2 text-xs font-black uppercase tracking-[.14em] text-white/45">
                  {label}
                  <select
                    name={name}
                    defaultValue={sp[name] || "all"}
                    className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 py-2 text-sm font-bold capitalize normal-case tracking-normal text-white outline-none"
                  >
                    {options.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
              <Link href="/admin/dashboard/users" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black">Clear all</Link>
              <button type="submit" className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-black">Apply filters</button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-black">User directory</h2>
            <p className="mt-1 text-sm text-white/45">Showing {result.users.length} of {result.count} users.</p>
          </div>

          {result.users.length ? (
            <>
              <div className="grid gap-3 p-4 lg:hidden">
                {result.users.map((user: AdminUserRow) => (
                  <article key={user.rowKey || user.id || user.betaTesterId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black">{user.full_name || user.preferred_name || "Customer"}</p>
                        <p className="truncate text-xs text-white/45">{user.email || "No email"}</p>
                      </div>
                      <Link href={user.detailHref || `/admin/dashboard/users/${user.id}`} className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-3 py-1.5 text-xs font-black text-rose-100">View</Link>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2"><Badge value={user.role || "user"} /><Badge value={user.plan || "free"} /><Badge value={user.account_status || "pending"} /><Badge value={user.beta_status} /></div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-xl border border-white/10 p-2"><span className="text-white/40">Saved</span><p className="font-black">{user.saved_outings_count || 0}</p></div>
                      <div className="rounded-xl border border-white/10 p-2"><span className="text-white/40">Booked</span><p className="font-black">{user.booked_outings_count || 0}</p></div>
                      <div className="rounded-xl border border-white/10 p-2"><span className="text-white/40">Tickets</span><p className="font-black">{user.open_tickets_count || 0}</p></div>
                    </div>
                    <div className="mt-4"><BetaAccessSelect userId={user.id} value={user.beta_status || "none"} /></div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="bg-white/[.03] text-[10px] font-black uppercase tracking-[.16em] text-white/35">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Access</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Activity</th>
                      <th className="px-4 py-3">Dates</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {result.users.map((user: AdminUserRow) => (
                      <tr key={user.rowKey || user.id || user.betaTesterId} className="align-top text-white/70">
                        <td className="px-4 py-4">
                          <p className="font-black text-white">{user.full_name || user.preferred_name || "Customer"}</p>
                          <p className="mt-1 text-xs text-white/45">{user.email || "No email"}</p>
                          {user.phone || user.mobile_number || user.social_handle ? <p className="mt-1 text-xs text-white/35">{user.phone || user.mobile_number || user.social_handle}</p> : null}
                        </td>
                        <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5"><Badge value={user.role || "user"} /><Badge value={user.plan || "free"} /><Badge value={user.beta_status} /></div></td>
                        <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5"><Badge value={user.account_status || "pending"} />{!(user.email_confirmed_at || user.email_verified) ? <Badge value="Email unverified" /> : null}</div></td>
                        <td className="px-4 py-4 text-xs">
                          <p>Saved <b className="text-white">{user.saved_outings_count || 0}</b></p>
                          <p className="mt-1">Booked <b className="text-white">{user.booked_outings_count || 0}</b></p>
                          <p className="mt-1">Tickets <b className="text-white">{user.open_tickets_count || 0}</b></p>
                        </td>
                        <td className="px-4 py-4 text-xs text-white/50">
                          <p>Created {formatDate(user.created_at)}</p>
                          <p className="mt-1">Last seen {formatDate(user.last_seen_at || user.last_login_at)}</p>
                        </td>
                        <td className="px-4 py-4">
                          <div className="grid gap-2">
                            <div className="flex gap-2">
                              <Link href={user.detailHref || `/admin/dashboard/users/${user.id}`} className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-3 py-1.5 text-xs font-black text-rose-100">View</Link>
                              {user.hasAccount ? <Link href={`/admin/dashboard/users/${user.id}#profile`} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-black">Edit</Link> : null}
                            </div>
                            <BetaAccessSelect userId={user.id} value={user.beta_status || "none"} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="p-8 text-center text-sm text-white/45">No users match these filters.</p>
          )}
        </section>
      </div>
    </main>
  );
}
