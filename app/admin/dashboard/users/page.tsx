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
import BetaAccessSelect from "./BetaAccessSelect";

export const dynamic = "force-dynamic";

type AdminUserRow = Awaited<ReturnType<typeof listAdminUsers>>["users"][number];
type BadgeTone = "rose" | "green" | "amber" | "red" | "blue" | "muted";

const FILTERS = [
  ["role", "Role", ["all", "user", "owner", "viewer", "editor", "reviewer", "admin", "manager", "superadmin", "ambassador", "experience", "partner_ambassador", "experience_team", "disabled"]],
  ["plan", "Plan", ["all", "free", "unlimited", "comped", "admin", "Pending"]],
  ["beta", "Beta status", ["all", "new", "approved", "rejected", "waitlist", "invited", "converted", "active", "paused", "completed", "removed", "none"]],
  ["status", "Account status", ["all", "active", "email_unverified", "pending_account", "disabled"]],
  ["email", "Email status", ["all", "verified", "unverified"]],
  ["tickets", "Support tickets", ["all", "yes"]],
  ["booked", "Booked outings", ["all", "yes"]],
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
        <AdminKpiCard label="Booked Outings" value={booked} helper="Users with booking records" />
        <AdminKpiCard label="Support Tickets" value={open} helper="Open or unresolved" />
        <AdminKpiCard label="Active Filters" value={filterCount} helper="Search and dropdown filters" />
      </AdminKpiGrid>

      <AdminSectionCard className="p-4 sm:p-5" id="user-filters">
        <form className="space-y-5">
          <div>
            <p className="text-sm font-black text-white">Filter users</p>
            <p className="mt-1 text-xs font-semibold text-white/45">Search across profiles, access, beta status, and activity without changing the underlying query params.</p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <Field label="Search users" className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
              <AdminSearchInput name="q" placeholder="Name, email, phone, ZIP, or social" defaultValue={sp.q || ""} />
            </Field>
            {FILTERS.map(([name, label, options]) => select(name, label, sp[name], options))}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <AdminActionButton href="/admin/dashboard/users" variant="secondary">Clear all</AdminActionButton>
            <AdminActionButton type="submit" variant="primary">Apply filters</AdminActionButton>
          </div>
        </form>
      </AdminSectionCard>

      {res.users.length ? <UserMobileList users={res.users} /> : null}

      <div className="hidden lg:block">
        <AdminDataTableShell
          footer={
            <div className="flex flex-col gap-3 text-sm font-bold text-white/55 sm:flex-row sm:items-center sm:justify-between">
              <p>Showing <span className="text-white">{res.users.length}</span> of <span className="text-white">{total}</span> users</p>
              <div className="flex flex-wrap gap-2"><CompactBadge tone="rose">TheOutHaven Admin</CompactBadge><CompactBadge>Grouped desktop table</CompactBadge></div>
            </div>
          }
        >
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-white/[0.025] text-[11px] uppercase tracking-[0.16em] text-white/42">
              <tr>
                {[
                  ["User", "w-[28%]"],
                  ["Access", "w-[17%]"],
                  ["Status", "w-[18%]"],
                  ["Activity", "w-[13%]"],
                  ["Dates", "w-[14%]"],
                  ["Actions", "w-[10%]"],
                ].map(([heading, width]) => <th key={heading} className={`${width} whitespace-nowrap px-4 py-3 font-black`}>{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {res.users.map((u: AdminUserRow) => (
                <tr key={u.rowKey || u.id || u.betaTesterId} className="border-t border-white/10 align-top text-white/75 transition hover:bg-white/[0.035]">
                  <td className="px-4 py-4"><UserIdentity user={u} /></td>
                  <td className="px-4 py-4"><UserAccessBadges user={u} /></td>
                  <td className="px-4 py-4"><UserStatusBadges user={u} /></td>
                  <td className="px-4 py-4"><UserActivityMetrics user={u} /></td>
                  <td className="px-4 py-4"><UserDates user={u} /></td>
                  <td className="px-4 py-4"><UserActions user={u} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminDataTableShell>
      </div>

      {!res.users.length ? <AdminEmptyState title="No users match these filters." body="Try broadening your search or removing a filter." /> : null}
    </AdminPageShell>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`grid min-w-0 gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/45 ${className}`}>{label}{children}</label>;
}

function select(name: string, label: string, value: string | undefined, options: readonly string[]) {
  return <Field key={name} label={label}><select name={name} aria-label={label} defaultValue={value || "all"} className="min-h-11 w-full min-w-0 appearance-none rounded-xl border border-white/10 bg-[#0b0b0d] bg-[linear-gradient(45deg,transparent_50%,rgba(255,255,255,0.55)_50%),linear-gradient(135deg,rgba(255,255,255,0.55)_50%,transparent_50%)] bg-[length:6px_6px,6px_6px] bg-[position:calc(100%-18px)_50%,calc(100%-13px)_50%] bg-no-repeat px-3 py-2 pr-9 text-sm font-bold capitalize text-white outline-none transition hover:border-white/20 focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10"><option value="all">All</option>{options.filter((o) => o !== "all").map((o) => <option key={o} value={o}>{humanize(o)}</option>)}</select></Field>;
}

function UserMobileList({ users }: { users: AdminUserRow[] }) {
  return <div className="grid gap-3 lg:hidden">{users.map((u) => <UserMobileCard key={u.rowKey || u.id || u.betaTesterId} user={u} />)}</div>;
}

function UserMobileCard({ user }: { user: AdminUserRow }) {
  return (
    <AdminSectionCard className="p-4">
      <div className="space-y-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <UserIdentity user={user} />
          <UserActions user={user} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Access</p><UserAccessBadges user={user} /></div>
          <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Status</p><UserStatusBadges user={user} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><UserActivityMetrics user={user} /><UserDates user={user} /></div>
      </div>
    </AdminSectionCard>
  );
}

function UserIdentity({ user }: { user: AdminUserRow }) {
  const secondary = user.phone || user.mobile_number || user.social_handle;
  return <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200/25 bg-rose-500/10 text-sm font-black text-rose-100">{initialsFor(user)}</div><div className="min-w-0"><p className="truncate font-black text-white">{user.full_name || user.preferred_name || "Customer"}</p><p className="truncate text-xs font-semibold text-white/50">{user.email || "No email"}</p>{secondary ? <p className="truncate text-[11px] font-semibold text-white/35">{secondary}</p> : null}</div></div>;
}

function UserAccessBadges({ user }: { user: AdminUserRow }) {
  return <BadgeGroup badges={[{ label: user.role || "user", tone: badgeTone(user.role || "user") }, { label: user.plan || "free", tone: String(user.plan).includes("unlimited") ? "blue" : "muted" }, ...(user.beta_status ? [{ label: user.beta_status, tone: "rose" as BadgeTone }] : [])]} />;
}

function UserStatusBadges({ user }: { user: AdminUserRow }) {
  const badges = [{ label: user.account_status || "pending", tone: user.account_status === "active" ? "green" as BadgeTone : user.account_status === "disabled" ? "red" as BadgeTone : "amber" as BadgeTone }];
  if (!(user.email_confirmed_at || user.email_verified)) badges.push({ label: "Email unverified", tone: "amber" });
  if (user.open_tickets_count > 0) badges.push({ label: `${user.open_tickets_count} open tickets`, tone: "red" });
  (user.badges || []).forEach((label: string) => badges.push({ label, tone: badgeTone(label) }));
  return <BadgeGroup badges={badges} limit={3} />;
}

function UserActivityMetrics({ user }: { user: AdminUserRow }) {
  return <div className="grid grid-cols-3 gap-2 text-xs sm:max-w-xs lg:block lg:space-y-1.5">{[["Saved", user.saved_outings_count], ["Booked", user.booked_outings_count], ["Tickets", user.open_tickets_count]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 lg:flex lg:items-center lg:justify-between"><span className="block font-bold text-white/45">{label}</span><span className="font-black text-white">{value}</span></div>)}</div>;
}

function UserDates({ user }: { user: AdminUserRow }) {
  return <div className="space-y-1.5 text-xs font-semibold text-white/55"><p><span className="text-white/35">Created</span> <span className="whitespace-nowrap text-white/70">{formatAdminDate(user.created_at)}</span></p><p><span className="text-white/35">Last seen</span> <span className="whitespace-nowrap text-white/70">{formatAdminDate(user.last_seen_at || user.last_login_at)}</span></p></div>;
}

function UserActions({ user }: { user: AdminUserRow }) {
  return <div className="flex shrink-0 flex-wrap items-center justify-end gap-2"><Link className="inline-flex min-w-16 whitespace-nowrap rounded-lg border border-rose-300/25 bg-rose-500/10 px-3 py-1.5 text-center text-xs font-black text-rose-100 transition hover:border-rose-200/50" href={user.detailHref || `/admin/dashboard/users/${user.id}`}>View</Link>{user.hasAccount ? <Link className="inline-flex min-w-16 whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-center text-xs font-black text-white/70 transition hover:border-white/20 hover:text-white" href={`/admin/dashboard/users/${user.id}#profile`}>Edit</Link> : null}<BetaAccessSelect userId={user.id} value={user.beta_status || "none"} /></div>;
}

function BadgeGroup({ badges, limit = 3 }: { badges: { label: string; tone: BadgeTone }[]; limit?: number }) {
  const visible = badges.filter((badge) => badge.label).slice(0, limit);
  const remaining = Math.max(0, badges.filter((badge) => badge.label).length - visible.length);
  return <div className="flex max-w-full flex-wrap gap-1.5">{visible.map((badge) => <CompactBadge key={`${badge.label}-${badge.tone}`} tone={badge.tone}>{humanize(badge.label)}</CompactBadge>)}{remaining ? <CompactBadge>+{remaining} more</CompactBadge> : null}</div>;
}

function CompactBadge({ children, tone = "muted" }: { children: React.ReactNode; tone?: BadgeTone }) {
  return <span className="max-w-full whitespace-nowrap"><AdminStatusBadge tone={tone}>{children}</AdminStatusBadge></span>;
}

function humanize(value?: string | null) {
  return String(value || "").replaceAll("_", " ");
}

function badgeTone(label?: string | null): BadgeTone {
  const value = String(label || "").toLowerCase();
  if (value.includes("disabled") || value.includes("rejected")) return "red";
  if (value.includes("active") || value.includes("verified") || value.includes("eligible") || value.includes("approved")) return "green";
  if (value.includes("pending") || value.includes("unverified") || value.includes("waitlist")) return "amber";
  if (value.includes("admin") || value.includes("super")) return "rose";
  if (value.includes("unlimited") || value.includes("owner")) return "blue";
  return "muted";
}

function initialsFor(user: AdminUserRow) {
  const value = user.full_name || user.preferred_name || user.email;
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
