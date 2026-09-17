import "./logs.css";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { loadAdminAuditLogs } from "@/lib/admin-logs";
import { logAdminAuditEvent } from "@/lib/admin-audit-log";

export const dynamic = "force-dynamic";

const actions = [
  "all",
  "user_updated",
  "user_role_changed",
  "user_plan_changed",
  "user_deleted_or_disabled",
  "password_reset_sent",
  "support_ticket_created",
  "support_ticket_replied",
  "support_ticket_status_changed",
  "beta_user_applied",
  "beta_user_approved",
  "beta_user_rejected",
  "beta_user_status_changed",
  "launch_list_signup_created",
  "launch_list_email_verified",
  "giveaway_status_changed",
  "login_success",
  "login_failed",
];

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdminRole(["superadmin"]);
  const filters = await searchParams;
  const data = await loadAdminAuditLogs(filters);

  await logAdminAuditEvent({
    actor: admin,
    action: "logs_viewed",
    entityType: "admin_audit_logs",
    summary: "Platform logs viewed",
    metadata: filters,
  });

  return (
    <section className="admin-logs-page">
      <header className="admin-logs-hero">
        <p>SaaS Operations</p>
        <h1>Platform Logs</h1>
        <span>Review user, account, beta, support, and Admin actions.</span>
      </header>

      <div className="admin-logs-kpis">
        {[
          ["User edits today", data.summary.userEditsToday],
          ["Role/plan changes this week", data.summary.rolePlanChangesWeek],
          ["Password resets sent", data.summary.passwordResets],
          ["Deleted/disabled users", data.summary.deletedDisabledUsers],
          ["Beta approvals", data.summary.betaApprovals],
          ["Login events", data.summary.loginEvents],
        ].map(([label, value]) => (
          <article key={String(label)}>
            <small>{label}</small>
            <strong>{formatNumber(Number(value))}</strong>
          </article>
        ))}
      </div>

      <form className="admin-logs-filters">
        <Field label="Search summary/email" name="q" value={filters.q} placeholder="Search logs" />
        <Field label="Actor" name="actor" value={filters.actor} />
        <Field label="Target user/email" name="target" value={filters.target} />
        <Field label="Entity type" name="entity_type" value={filters.entity_type} />
        <Field label="Date from" name="from" value={filters.from} type="date" />
        <Field label="Date to" name="to" value={filters.to} type="date" />
        <label>
          Action type
          <select name="action" defaultValue={filters.action || "all"}>
            {actions.map((action) => <option key={action}>{action}</option>)}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>

      <section className="admin-logs-table-wrap">
        {data.error ? (
          <p className="admin-logs-error">{data.error}</p>
        ) : data.rows.length === 0 ? (
          <p>No audit logs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                {["Time/date", "Action", "Actor", "Target", "Summary", "Entity", "Details"].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.created_at)}</td>
                  <td><span>{row.action}</span></td>
                  <td>{row.actor_email || "System"}<small>{row.actor_role || "—"}</small></td>
                  <td>{row.target_email || row.target_user_id || "—"}</td>
                  <td>{row.summary || "—"}</td>
                  <td>{[row.entity_type, row.entity_id].filter(Boolean).join(":") || "—"}</td>
                  <td>
                    <details>
                      <summary>View diff</summary>
                      <pre>{JSON.stringify({
                        before: row.before_data,
                        after: row.after_data,
                        metadata: row.metadata,
                      }, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}

function Field({
  label,
  name,
  value,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  value?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input name={name} type={type} defaultValue={value || ""} placeholder={placeholder} />
    </label>
  );
}
