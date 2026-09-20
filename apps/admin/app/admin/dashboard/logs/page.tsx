import { FileClock, KeyRound, ShieldCheck, UserRoundCog } from "lucide-react";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { loadAdminAuditLogs } from "@/lib/admin-logs";
import { logAdminAuditEvent } from "@/lib/admin-audit-log";
import {
  AdminActionButton,
  AdminDataTableShell,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

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
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="System · Audit"
        title="Platform Logs"
        subtitle="Review privileged user, account, beta, support, security, and Admin actions from one protected audit workspace."
        badge={<AdminStatusBadge tone={data.error ? "amber" : "green"}>{data.error ? "Audit stream warning" : "Audit stream online"}</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/security">Security</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/platform-errors">Platform Errors</AdminActionButton>
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard label="User edits today" value={data.summary.userEditsToday} helper="Profile and account changes" icon={UserRoundCog} />
        <AdminKpiCard label="Role / plan · week" value={data.summary.rolePlanChangesWeek} helper="Privilege and subscription changes" icon={ShieldCheck} />
        <AdminKpiCard label="Password resets" value={data.summary.passwordResets} helper="Reset actions recorded" icon={KeyRound} />
        <AdminKpiCard label="Login events" value={data.summary.loginEvents} helper={`${data.summary.deletedDisabledUsers} deleted or disabled users`} icon={FileClock} />
      </AdminKpiGrid>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Audit filters</p>
          <h2 className="mt-1 text-xl font-black text-white">Find an administrative action</h2>
          <p className="mt-1 text-sm text-white/50">Search by actor, target, entity, action type, or date range.</p>
        </div>
        <form className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Search summary / email" name="q" value={filters.q} placeholder="Search logs" />
          <Field label="Actor" name="actor" value={filters.actor} />
          <Field label="Target user / email" name="target" value={filters.target} />
          <Field label="Entity type" name="entity_type" value={filters.entity_type} />
          <Field label="Date from" name="from" value={filters.from} type="date" />
          <Field label="Date to" name="to" value={filters.to} type="date" />
          <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Action type
            <select name="action" defaultValue={filters.action || "all"} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold normal-case tracking-normal text-white outline-none">
              {actions.map((action) => <option key={action} value={action}>{action.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="min-h-11 flex-1 rounded-xl bg-[#e1062a] px-4 text-sm font-black text-white">Apply filters</button>
            <AdminActionButton href="/admin/dashboard/logs" variant="ghost">Clear</AdminActionButton>
          </div>
        </form>
      </AdminSectionCard>

      <AdminDataTableShell>
        <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Audit ledger</p>
            <h2 className="mt-1 text-xl font-black text-white">Administrative activity</h2>
            <p className="mt-1 text-sm text-white/50">Sensitive before/after data remains collapsed until explicitly inspected.</p>
          </div>
          <AdminStatusBadge tone="muted">{data.rows.length.toLocaleString()} visible rows</AdminStatusBadge>
        </div>

        {data.error ? (
          <div className="p-5 text-sm font-bold text-amber-100">{data.error}</div>
        ) : data.rows.length === 0 ? (
          <div className="p-5"><AdminEmptyState title="No audit logs match these filters" body="Clear the filters or widen the date range to review additional administrative activity." /></div>
        ) : (
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>{["Time / date", "Action", "Actor", "Target", "Summary", "Entity", "Details"].map((heading) => <th key={heading} className="px-4 py-3 first:pl-5 last:pr-5">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-white/[0.025]">
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-white/45">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-4"><AdminStatusBadge tone="rose">{row.action.replaceAll("_", " ")}</AdminStatusBadge></td>
                  <td className="px-4 py-4">
                    <p className="font-bold text-white/75">{row.actor_email || "System"}</p>
                    <p className="mt-1 text-xs text-white/40">{row.actor_role || "—"}</p>
                  </td>
                  <td className="max-w-64 break-all px-4 py-4 text-xs text-white/60">{row.target_email || row.target_user_id || "—"}</td>
                  <td className="max-w-sm px-4 py-4 font-semibold text-white/75">{row.summary || "—"}</td>
                  <td className="max-w-64 break-all px-4 py-4 text-xs text-white/55">{[row.entity_type, row.entity_id].filter(Boolean).join(":") || "—"}</td>
                  <td className="px-4 py-4 pr-5">
                    <details>
                      <summary className="cursor-pointer text-xs font-black text-rose-100">View diff</summary>
                      <pre className="mt-2 max-h-80 max-w-xl overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-xs text-white/55">{JSON.stringify({
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
      </AdminDataTableShell>
    </AdminPageShell>
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
    <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value || ""}
        placeholder={placeholder}
        className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-semibold normal-case tracking-normal text-white outline-none placeholder:text-white/25"
      />
    </label>
  );
}
