import { KeyRound, MonitorSmartphone, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminSecurityOverview } from "@/lib/security";
import AdminSecurityAccessButton from "./AdminSecurityAccessButton";
import {
  AdminActionButton,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

const roleLabels: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  editor: "Editor",
  reviewer: "Reviewer",
  viewer: "Viewer",
  ambassador: "Ambassador",
  experience_team: "Experience Team",
};

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function AdminSecurityPage() {
  await requireAdminRole(["superadmin"]);
  const { staff, recentAudit, metrics } = await getAdminSecurityOverview();
  const now = Date.now();
  const attention = metrics.banned + metrics.stale + metrics.unconfirmed;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="System · Security"
        title="Security"
        subtitle="Monitor privileged identities, stale sign-ins, disabled access, email confirmation state, and recent security-sensitive activity."
        badge={<AdminStatusBadge tone={attention ? "amber" : "green"}>{attention ? `${attention} items need review` : "Privileged access healthy"}</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/security/devices"><MonitorSmartphone className="h-4 w-4" />Device Management</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/logs">Audit Logs</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/credentials"><KeyRound className="h-4 w-4" />Credentials Vault</AdminActionButton>
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Admin staff" value={metrics.total} helper="Privileged accounts" icon={UsersRound} />
        <AdminKpiCard label="Superadmins" value={metrics.superadmins} helper="Highest privilege" icon={ShieldCheck} />
        <AdminKpiCard label="Disabled" value={metrics.banned} helper="Sign-in blocked" icon={ShieldAlert} />
        <AdminKpiCard label="Stale 90d+" value={metrics.stale} helper={`${metrics.unconfirmed} unconfirmed`} icon={ShieldAlert} />
      </AdminKpiGrid>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Identity governance</p>
          <h2 className="mt-1 text-xl font-black text-white">Privileged accounts</h2>
          <p className="mt-1 text-sm text-white/50">Disabling an account blocks TheOutHaven access without deleting its role record or audit history.</p>
        </div>
        {staff.length ? (
          <div className="divide-y divide-white/10">
            {staff.map((member) => {
              const pending = !member.user_id;
              const disabled = Boolean(member.banned_until && new Date(member.banned_until).getTime() > now);
              const stale = !pending && (!member.last_sign_in_at || new Date(member.last_sign_in_at).getTime() < now - 90 * 24 * 60 * 60 * 1000);
              return (
                <article key={member.admin_id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,.7fr)_auto] lg:items-center hover:bg-white/[0.025]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-black text-white">{member.full_name || member.email || member.admin_id}</p>
                      <AdminStatusBadge tone="rose">{roleLabels[member.role] || member.role}</AdminStatusBadge>
                      {pending ? <AdminStatusBadge tone="blue">Awaiting sign-in</AdminStatusBadge> : null}
                      {disabled ? <AdminStatusBadge tone="red">Disabled</AdminStatusBadge> : null}
                      {!disabled && stale ? <AdminStatusBadge tone="amber">Stale</AdminStatusBadge> : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-white/55">{member.email || "No email"}</p>
                    <p className="mt-2 text-xs leading-5 text-white/40">
                      {pending
                        ? "Pre-authorized for Microsoft 365 / Entra ID."
                        : `Last sign-in: ${formatDate(member.last_sign_in_at)} · Email confirmed: ${member.email_confirmed_at ? "Yes" : "No"}`}
                    </p>
                  </div>
                  <div className="text-xs text-white/45">
                    <p className="font-black uppercase tracking-[0.14em] text-white/30">Identity state</p>
                    <p className="mt-1 font-bold text-white/65">{pending ? "Pending identity" : disabled ? "Access disabled" : stale ? "Review stale access" : "Active"}</p>
                  </div>
                  <div>
                    {member.user_id ? <AdminSecurityAccessButton userId={member.user_id} disabled={disabled} /> : <AdminStatusBadge tone="muted">Pending identity</AdminStatusBadge>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="p-5"><AdminEmptyState title="No privileged accounts found" body="Authorized Admin identities will appear here after they are provisioned." /></div>
        )}
      </AdminSectionCard>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Security audit</p>
          <h2 className="mt-1 text-xl font-black text-white">Recent security activity</h2>
          <p className="mt-1 text-sm text-white/50">Role, access, password, and security-sensitive events.</p>
        </div>
        {recentAudit.length ? (
          <div className="divide-y divide-white/10">
            {recentAudit.map((event: any) => (
              <article key={event.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,.6fr)] hover:bg-white/[0.025]">
                <div>
                  <p className="font-black text-white">{event.summary || event.action}</p>
                  <p className="mt-1 text-xs text-white/40">{event.action} · {event.entity_type}</p>
                </div>
                <div className="text-xs text-white/50">
                  <p>Actor: <span className="font-bold text-white/70">{event.actor_email || event.actor_role || "System"}</span></p>
                  <p className="mt-1">Target: <span className="font-bold text-white/70">{event.target_email || "—"}</span></p>
                </div>
                <div className="text-xs text-white/45">
                  <p>{formatDate(event.created_at)}</p>
                  <p className="mt-1">{event.ip_address || "No IP"}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-5"><AdminEmptyState title="No recent security activity" body="Security-sensitive administrative events will appear here as they are recorded." /></div>
        )}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
