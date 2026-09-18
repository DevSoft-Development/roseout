import "./security.css";

import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminSecurityOverview } from "@/lib/security";
import AdminSecurityAccessButton from "./AdminSecurityAccessButton";

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
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="security-metric">
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

export default async function AdminSecurityPage() {
  await requireAdminRole(["superadmin"]);
  const { staff, recentAudit, metrics } = await getAdminSecurityOverview();
  const now = Date.now();

  return (
    <section className="security-page">
      <header className="security-hero">
        <div>
          <p>Admin Dashboard / System</p>
          <h1>Security</h1>
          <span>
            Monitor privileged accounts, stale sign-ins, disabled access, and
            recent security-sensitive activity.
          </span>
        </div>
        <nav>
          <Link href="/admin/dashboard/security/devices">Device Management</Link>
          <Link href="/admin/dashboard/logs">Audit Logs</Link>
          <Link href="/admin/dashboard/credentials">Credentials Vault</Link>
        </nav>
      </header>

      <section className="security-metrics">
        <Metric label="Admin staff" value={metrics.total} detail="Privileged accounts" />
        <Metric label="Superadmins" value={metrics.superadmins} detail="Highest privilege" />
        <Metric label="Disabled" value={metrics.banned} detail="Sign-in blocked" />
        <Metric label="Stale 90d+" value={metrics.stale} detail="No recent admin sign-in" />
        <Metric label="Unconfirmed" value={metrics.unconfirmed} detail="Email not confirmed" />
      </section>

      <section className="security-panel">
        <header>
          <h2>Privileged accounts</h2>
          <p>
            Disabling an account blocks TheOutHaven access without deleting its
            audit history or role record.
          </p>
        </header>
        <div>
          {staff.map((member) => {
            const pending = !member.user_id;
            const disabled = Boolean(
              member.banned_until &&
                new Date(member.banned_until).getTime() > now,
            );
            const stale =
              !pending &&
              (!member.last_sign_in_at ||
                new Date(member.last_sign_in_at).getTime() <
                  now - 90 * 24 * 60 * 60 * 1000);

            return (
              <article key={member.admin_id} className="security-staff-row">
                <div>
                  <div className="security-staff-title">
                    <strong>
                      {member.full_name || member.email || member.admin_id}
                    </strong>
                    <span>{roleLabels[member.role] || member.role}</span>
                    {pending ? <em>Awaiting Microsoft sign-in</em> : null}
                    {disabled ? <em>Disabled</em> : null}
                    {!disabled && stale ? <em>Stale</em> : null}
                  </div>
                  <p>{member.email || "No email"}</p>
                  <small>
                    {pending
                      ? "Pre-authorized for Microsoft 365 / Entra ID."
                      : `Last sign-in: ${formatDate(member.last_sign_in_at)} · Email confirmed: ${member.email_confirmed_at ? "Yes" : "No"}`}
                  </small>
                </div>

                {member.user_id ? (
                  <AdminSecurityAccessButton
                    userId={member.user_id}
                    disabled={disabled}
                  />
                ) : (
                  <span className="security-pending">Pending identity</span>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="security-panel">
        <header>
          <h2>Recent security activity</h2>
          <p>Role, access, password, and security events.</p>
        </header>
        <div>
          {recentAudit.length ? (
            recentAudit.map((event: any) => (
              <article key={event.id} className="security-audit-row">
                <div>
                  <strong>{event.summary || event.action}</strong>
                  <small>{event.action} · {event.entity_type}</small>
                </div>
                <div>
                  <span>Actor: {event.actor_email || event.actor_role || "System"}</span>
                  <span>Target: {event.target_email || "—"}</span>
                </div>
                <div>
                  <span>{formatDate(event.created_at)}</span>
                  <span>{event.ip_address || "No IP"}</span>
                </div>
              </article>
            ))
          ) : (
            <p className="security-empty">No matching security activity yet.</p>
          )}
        </div>
      </section>
    </section>
  );
}
