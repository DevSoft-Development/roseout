import { AlertTriangle, Bug, Eye, Route, ShieldAlert } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { loadPlatformErrors } from "@/lib/platform-errors";
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

type Params = Record<string, string | undefined>;

function severityTone(severity: string): "red" | "amber" | "blue" | "muted" {
  if (severity === "critical" || severity === "error") return "red";
  if (severity === "warning") return "amber";
  if (severity === "info") return "blue";
  return "muted";
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default async function PlatformErrorsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdminRole(["superadmin"]);
  const p = await searchParams;
  const data = await loadPlatformErrors(p);
  const incidentCount = data.topIncidents.reduce((sum, item) => sum + Number(item.count || 0), 0);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Operations · Reliability"
        title="Platform Error Operations"
        subtitle="Investigate browser, Next.js, route-handler, and user-visible production failures from one reliability workspace."
        badge={
          <AdminStatusBadge tone={data.summary.critical24 ? "red" : data.summary.total24 ? "amber" : "green"}>
            {data.summary.critical24 ? `${data.summary.critical24} critical` : data.summary.total24 ? `${data.summary.total24} errors · 24h` : "No errors · 24h"}
          </AdminStatusBadge>
        }
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/logs">Platform Logs</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/search-health">Search Health</AdminActionButton>
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Errors · 24h" value={data.summary.total24} helper="All captured platform failures" icon={Bug} />
        <AdminKpiCard label="User-visible · 24h" value={data.summary.visible24} helper="Errors exposed in product UI" icon={Eye} />
        <AdminKpiCard label="Critical · 24h" value={data.summary.critical24} helper="Immediate-attention severity" icon={ShieldAlert} />
        <AdminKpiCard label="Affected routes" value={data.summary.affectedRoutes} helper={`${data.summary.uniqueIncidents} unique incidents`} icon={Route} />
      </AdminKpiGrid>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Incident filters</p>
          <h2 className="mt-1 text-xl font-black text-white">Narrow the reliability signal</h2>
          <p className="mt-1 text-sm text-white/50">Filter by message, route, error type, severity, visibility, or time window.</p>
        </div>
        <form className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Message" name="q" value={p.q} placeholder="Search error message" />
          <Field label="Route" name="route" value={p.route} placeholder="/api/..." />
          <Field label="Type" name="type" value={p.type} placeholder="next_route_error" />
          <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Severity
            <select name="severity" defaultValue={p.severity || "all"} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold normal-case tracking-normal text-white outline-none">
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
            User-visible
            <select name="visible" defaultValue={p.visible || "all"} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold normal-case tracking-normal text-white outline-none">
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <Field label="From" name="from" value={p.from} type="date" />
          <Field label="To" name="to" value={p.to} type="date" />
          <div className="flex items-end gap-2">
            <button type="submit" className="min-h-11 flex-1 rounded-xl bg-[#e1062a] px-4 text-sm font-black text-white">Apply filters</button>
            <AdminActionButton href="/admin/dashboard/platform-errors" variant="ghost">Clear</AdminActionButton>
          </div>
        </form>
      </AdminSectionCard>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_.7fr]">
        <AdminSectionCard>
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Incident concentration</p>
              <h2 className="mt-1 text-xl font-black text-white">Top incidents · 24h</h2>
            </div>
            <AdminStatusBadge tone={incidentCount ? "amber" : "green"}>{incidentCount ? `${incidentCount} events` : "Clear"}</AdminStatusBadge>
          </div>
          <div className="divide-y divide-white/10">
            {data.topIncidents.length ? data.topIncidents.map((item, index) => (
              <article key={`${item.type}-${index}`} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-white/[0.025]">
                <div className="min-w-0">
                  <p className="font-black text-white">{item.message}</p>
                  <p className="mt-1 break-all text-xs text-white/45">{item.route} · {item.type}</p>
                </div>
                <AdminStatusBadge tone={severityTone(item.severity)}>{item.count}× · {item.severity}</AdminStatusBadge>
              </article>
            )) : <div className="p-5"><AdminEmptyState title="No incidents in the last 24 hours" body="The platform error stream is currently clear for this reporting window." /></div>}
          </div>
        </AdminSectionCard>

        <AdminSectionCard className="p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-100" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Coverage</p>
              <h2 className="mt-1 text-xl font-black text-white">Reliability telemetry</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-white/55">
                <li>Browser runtime exceptions and unhandled promise rejections</li>
                <li>Next.js render, route-handler, action, and proxy errors</li>
                <li>User-visible alert and error UI failures</li>
                <li>Safe request, route, fingerprint, and stack context</li>
                <li>Immediate alert delivery for critical severity</li>
              </ul>
            </div>
          </div>
        </AdminSectionCard>
      </section>

      <AdminDataTableShell>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Error ledger</p>
          <h2 className="mt-1 text-xl font-black text-white">Production error events</h2>
          <p className="mt-1 text-sm text-white/50">Detailed events with protected diagnostics available on demand.</p>
        </div>
        {data.error ? (
          <div className="p-5 text-sm font-bold text-amber-100">{data.error}</div>
        ) : data.rows.length === 0 ? (
          <div className="p-5"><AdminEmptyState title="No matching platform errors" body="Adjust the filters or return later when new reliability events are recorded." /></div>
        ) : (
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>{["Time", "Severity", "Visible", "Type", "Route", "Message", "Source", "Status", "Details"].map((h) => <th key={h} className="px-4 py-3 first:pl-5 last:pr-5">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-white/[0.025]">
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-white/45">{formatDate(row.occurred_at)}</td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={severityTone(row.severity)}>{row.severity}</AdminStatusBadge></td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={row.user_visible ? "amber" : "muted"}>{row.user_visible ? "Yes" : "No"}</AdminStatusBadge></td>
                  <td className="px-4 py-4 text-xs font-bold text-white/65">{row.error_type}</td>
                  <td className="max-w-52 break-all px-4 py-4 text-xs text-white/55">{row.route || "—"}</td>
                  <td className="max-w-sm px-4 py-4 font-semibold text-white/75">{row.message}</td>
                  <td className="px-4 py-4 text-xs text-white/50">{row.source || "—"}</td>
                  <td className="px-4 py-4 text-xs font-bold text-white/60">{row.status_code || "—"}</td>
                  <td className="px-4 py-4 pr-5">
                    <details>
                      <summary className="cursor-pointer text-xs font-black text-rose-100">Inspect</summary>
                      <pre className="mt-2 max-h-80 max-w-xl overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-xs text-white/55">{JSON.stringify({
                        request_id: row.request_id,
                        session_id: row.session_id,
                        user_id: row.user_id,
                        stack: row.stack,
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
