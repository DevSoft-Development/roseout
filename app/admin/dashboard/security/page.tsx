import Link from "next/link";

import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS, ADMIN_ROLE_LABELS } from "@/lib/admin-permissions";
import { getAdminSecurityOverview } from "@/lib/admin-system";
import AdminSecurityAccessButton from "@/components/admin/AdminSecurityAccessButton";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">{label}</p>
      <p className="mt-2 text-4xl font-black">{value}</p>
      <p className="mt-2 text-sm font-semibold text-white/45">{detail}</p>
    </div>
  );
}

export default async function AdminSecurityPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.security);
  const { staff, recentAudit, metrics } = await getAdminSecurityOverview();
  const now = Date.now();

  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">Admin Dashboard / System</p>
            <h1 className="mt-2 text-4xl font-black">Security</h1>
            <p className="mt-2 max-w-3xl text-sm font-bold text-white/55">Monitor privileged accounts, stale sign-ins, disabled access, managed devices, and security-sensitive admin activity. Access changes are superadmin-only and audited.</p>
          </div>
          <Link href="/admin/dashboard/security/devices" className="inline-flex rounded-xl border border-white/15 bg-white/[0.07] px-4 py-2 text-sm font-black">Device Management</Link>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Admin staff" value={metrics.total} detail="Privileged accounts" />
          <Metric label="Superadmins" value={metrics.superadmins} detail="Highest privilege" />
          <Metric label="Disabled" value={metrics.banned} detail="Sign-in blocked" />
          <Metric label="Stale 90d+" value={metrics.stale} detail="No recent admin sign-in" />
          <Metric label="Unconfirmed" value={metrics.unconfirmed} detail="Email not confirmed" />
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-black">Privileged accounts</h2>
            <p className="mt-1 text-sm font-semibold text-white/45">Disabling an account blocks TheOutHaven access without deleting its audit history, role record, or Microsoft 365 account.</p>
          </div>
          <div className="divide-y divide-white/10">
            {staff.map((member) => {
              const pending = !member.user_id;
              const disabled = Boolean(member.banned_until && new Date(member.banned_until).getTime() > now);
              const stale = !pending && (!member.last_sign_in_at || new Date(member.last_sign_in_at).getTime() < now - 90 * 24 * 60 * 60 * 1000);
              return (
                <div key={member.admin_id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black">{member.full_name || member.email || member.admin_id}</p>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-black">{ADMIN_ROLE_LABELS[member.role]}</span>
                      {pending ? <span className="rounded-full bg-sky-500/15 px-2 py-1 text-[11px] font-black text-sky-200">Awaiting Microsoft sign-in</span> : null}
                      {disabled ? <span className="rounded-full bg-rose-500/15 px-2 py-1 text-[11px] font-black text-rose-200">Disabled</span> : null}
                      {!disabled && stale ? <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[11px] font-black text-amber-200">Stale</span> : null}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-white/45">{member.email || "No email"}</p>
                    <p className="mt-1 text-xs font-bold text-white/35">{pending ? "Pre-authorized for Microsoft 365 / Entra ID. Identity will bind on first sign-in." : `Last sign-in: ${formatDate(member.last_sign_in_at)} · Email confirmed: ${member.email_confirmed_at ? "Yes" : "No"}`}</p>
                  </div>
                  {member.user_id ? (
                    <AdminSecurityAccessButton userId={member.user_id} disabled={disabled} />
                  ) : (
                    <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white/40">Pending identity</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-black">Recent security activity</h2>
            <p className="mt-1 text-sm font-semibold text-white/45">Role changes, access changes, password/security actions, and related privileged events.</p>
          </div>
          <div className="divide-y divide-white/10">
            {recentAudit.length ? recentAudit.map((event: any) => (
              <div key={event.id} className="grid gap-2 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
                <div>
                  <p className="font-black">{event.summary || event.action}</p>
                  <p className="mt-1 text-xs font-bold text-white/40">{event.action} · {event.entity_type}</p>
                </div>
                <div className="text-sm font-semibold text-white/50">
                  <p>Actor: {event.actor_email || event.actor_role || "System"}</p>
                  <p>Target: {event.target_email || "—"}</p>
                </div>
                <div className="text-xs font-bold text-white/35 lg:text-right">
                  <p>{formatDate(event.created_at)}</p>
                  <p>{event.ip_address || "No IP"}</p>
                </div>
              </div>
            )) : <p className="p-5 text-sm font-semibold text-white/45">No matching security activity yet.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
