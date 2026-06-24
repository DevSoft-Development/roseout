import Link from "next/link";
import {
  AdminActionButton,
  AdminDataTableShell,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSearchInput,
  AdminSectionCard,
  AdminStatusBadge,
  formatAdminDate,
} from "@/components/admin/AdminDesignSystem";
import { listAdminUsers, requireAdminOrSupport } from "@/lib/admin-users";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const FILTERS = [
  ["role", "Role", ["all", "user", "owner", "viewer", "editor", "reviewer", "admin", "manager", "superadmin", "ambassador", "experience", "partner_ambassador", "experience_team", "disabled"]],
  ["plan", "Plan", ["all", "free", "unlimited", "comped", "admin", "Pending"]],
  ["beta", "Beta Status", ["all", "new", "approved", "rejected", "waitlist", "invited", "converted", "active", "paused", "completed", "removed", "none"]],
  ["status", "Account Status", ["all", "active", "email_unverified", "pending_account", "disabled"]],
  ["email", "Email Status", ["all", "verified", "unverified"]],
  ["tickets", "Support Status", ["all", "yes"]],
  ["booked", "Booked Outing Status", ["all", "yes"]],
] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireAdminOrSupport();
  const sp = await searchParams;
  const [res, newWeek, beta, booked, open] = await Promise.all([
    listAdminUsers(sp),
    count("user_profiles", (q) => q.gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString())),
    count("beta_testers"),
    count("user_outings", undefined, "user_id"),
    count("support_tickets", (q) => q.not("status", "in", "(closed,resolved)")),
  ]);
  const total = res.count;
  const filterCount = FILTERS.filter(([name]) => sp[name] && sp[name] !== "all").length + (sp.q ? 1 : 0);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Customer Operations"
        title="Users"
        subtitle="Manage user accounts, roles, access, and activity."
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/users/new" variant="primary">Add user</AdminActionButton>
            <AdminActionButton href={`/admin/dashboard/users?${new URLSearchParams(sp).toString()}`}>Export</AdminActionButton>
            {filterCount ? <AdminActionButton href="/admin/dashboard/users" variant="ghost">Reset filters</AdminActionButton> : null}
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Total Users" value={total} helper="Matching current admin view" />
        <AdminKpiCard label="New This Week" value={newWeek} helper="Created in the last 7 days" />
        <AdminKpiCard label="Active Beta Testers" value={beta} helper="Beta tester records" />
        <AdminKpiCard label="Booked Outings" value={booked} helper="Users with bookings" />
        <AdminKpiCard label="Support Tickets" value={open} helper="Open or unresolved" />
        <AdminKpiCard label="Active Filters" value={filterCount} helper="Search and dropdown filters" />
      </AdminKpiGrid>

      <AdminSectionCard className="p-4 sm:p-5" id="user-filters">
        <form className="space-y-4">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(260px,1.4fr)_repeat(3,minmax(150px,1fr))] xl:grid-cols-[minmax(280px,1.35fr)_repeat(4,minmax(150px,1fr))]">
            <Field label="Search Users" className="lg:col-span-2 xl:col-span-1">
              <AdminSearchInput name="q" placeholder="Name, email, phone, ZIP, or social" defaultValue={sp.q || ""} />
            </Field>
            {FILTERS.slice(0, 4).map(([name, label, options]) => select(name, label, sp[name], options))}
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-[repeat(3,minmax(160px,1fr))_auto_auto]">
            {FILTERS.slice(4).map(([name, label, options]) => select(name, label, sp[name], options))}
            <div className="flex items-end gap-2 md:col-span-2 lg:col-span-2 lg:justify-end">
              <AdminActionButton href="/admin/dashboard/users" variant="secondary">Clear all</AdminActionButton>
              <AdminActionButton type="submit" variant="primary">Apply filters</AdminActionButton>
            </div>
          </div>
        </form>
      </AdminSectionCard>

      <AdminDataTableShell
        footer={
          <div className="flex flex-col gap-3 text-sm font-bold text-white/55 sm:flex-row sm:items-center sm:justify-between">
            <p>Showing <span className="text-white">{res.users.length}</span> of <span className="text-white">{total}</span> users</p>
            <div className="flex flex-wrap gap-2"><AdminStatusBadge tone="rose">TheOutHaven Admin</AdminStatusBadge><AdminStatusBadge>Contained table scroll</AdminStatusBadge></div>
          </div>
        }
      >
        {res.users.length ? (
          <table className="w-full min-w-[1180px] table-fixed text-left text-sm">
            <thead className="bg-white/[0.025] text-[11px] uppercase tracking-[0.16em] text-white/42">
              <tr>{["User", "Role", "Plan", "Badges", "Beta", "Saved", "Booked", "Support Tickets", "Created", "Last Seen", "Status", "Actions"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-3 font-black first:w-[245px] last:w-[120px]">{h}</th>)}</tr>
            </thead>
            <tbody>
              {res.users.map((u: any) => (
                <tr key={u.rowKey || u.id || u.betaTesterId} className="border-t border-white/10 align-top text-white/75 transition hover:bg-white/[0.035]">
                  <td className="px-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-200/25 bg-rose-500/10 text-sm font-black text-rose-100">{initials(u.full_name || u.preferred_name || u.email)}</div>
                      <div className="min-w-0"><p className="truncate font-black text-white">{u.full_name || u.preferred_name || "Customer"}</p><p className="truncate text-xs text-white/45">{u.email || "No email"}</p></div>
                    </div>
                  </td>
                  <td className="px-3 py-3">{u.isBetaUser ? <AdminStatusBadge tone="rose">Beta Tester</AdminStatusBadge> : <AdminStatusBadge>{u.role || "user"}</AdminStatusBadge>}</td>
                  <td className="px-3 py-3"><AdminStatusBadge tone={String(u.plan).includes("unlimited") ? "blue" : "muted"}>{u.plan || "free"}</AdminStatusBadge></td>
                  <td className="px-3 py-3"><div className="flex max-w-[230px] flex-wrap gap-1.5">{(u.badges || []).length ? (u.badges || []).map((b: string) => <AdminStatusBadge key={b} tone={b.includes("Eligible") ? "green" : b.includes("Pending") || b.includes("Unverified") ? "amber" : "rose"}>{b}</AdminStatusBadge>) : <span className="text-white/35">—</span>}</div></td>
                  <td className="px-3 py-3">{u.beta_status ? <AdminStatusBadge tone="rose">{u.beta_status}</AdminStatusBadge> : "—"}</td>
                  <td className="px-3 py-3 font-bold">{u.saved_outings_count}</td>
                  <td className="px-3 py-3 font-bold">{u.booked_outings_count}</td>
                  <td className="px-3 py-3 font-bold">{u.open_tickets_count}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-white/55">{formatAdminDate(u.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-white/55">{formatAdminDate(u.last_seen_at || u.last_login_at)}</td>
                  <td className="px-3 py-3"><AdminStatusBadge tone={u.account_status === "active" ? "green" : "amber"}>{u.account_status || "pending"}</AdminStatusBadge></td>
                  <td className="px-3 py-3"><div className="flex gap-2"><Link className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-2.5 py-1.5 text-xs font-black text-rose-100" href={u.detailHref || `/admin/dashboard/users/${u.id}`}>View</Link>{u.hasAccount ? <Link className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-black text-white/70" href={`/admin/dashboard/users/${u.id}#profile`}>Edit</Link> : null}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <AdminEmptyState title="No users match these filters." body="Try broadening your search or removing a filter." />}
      </AdminDataTableShell>
    </AdminPageShell>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`grid min-w-0 gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/45 ${className}`}>{label}{children}</label>;
}

function select(name: string, label: string, value: string | undefined, options: readonly string[]) {
  return <Field key={name} label={label}><select name={name} aria-label={label} defaultValue={value || "all"} className="min-h-10 w-full min-w-0 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 py-2 text-sm font-bold capitalize text-white outline-none focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10"><option value="all">All</option>{options.filter((o) => o !== "all").map((o) => <option key={o} value={o}>{o.replaceAll("_", " ")}</option>)}</select></Field>;
}

function initials(value?: string | null) {
  const parts = String(value || "U").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "U").toUpperCase();
}

async function count(table: string, mut?: (q: any) => any, distinct?: string) {
  try {
    let q = supabaseAdmin.from(table).select(distinct || "id", { count: "exact", head: true });
    if (mut) q = mut(q);
    const { count } = await q;
    return count || 0;
  } catch {
    return 0;
  }
}
