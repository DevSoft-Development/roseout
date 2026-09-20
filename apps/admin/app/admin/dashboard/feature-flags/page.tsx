import { Flag, Gauge, Layers3, Power, ShieldCheck } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { listFeatureFlags } from "@/lib/feature-flags";
import {
  AdminActionButton,
  AdminDataTableShell,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatPercent(value: number | null | undefined) {
  return `${Number.isFinite(Number(value)) ? Number(value) : 0}%`;
}

export default async function FeatureFlagsPage() {
  await requireAdminRole(["superadmin"]);
  const result = await listFeatureFlags();
  const rows = result.flags;
  const enabled = rows.filter((row) => row.enabled).length;
  const production = rows.filter((row) => row.environment === "production").length;
  const experimental = rows.filter((row) => row.category === "experimental").length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="System Controls"
        title="Feature Flags"
        subtitle="Review database and environment-backed platform flags, rollout percentages, production targeting, and experimental controls."
        badge={<AdminStatusBadge tone={result.error ? "amber" : "green"}>{result.error ? "Flag inventory warning" : "Flag inventory online"}</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/settings">Settings</AdminActionButton>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Total flags" value={rows.length} helper="All registered controls" icon={Flag} />
        <AdminKpiCard label="Enabled" value={enabled} helper={`${rows.length - enabled} disabled`} icon={Power} />
        <AdminKpiCard label="Production" value={production} helper="Production-scoped flags" icon={ShieldCheck} />
        <AdminKpiCard label="Experimental" value={experimental} helper="Controlled experiments" icon={Layers3} />
      </AdminKpiGrid>

      <AdminDataTableShell>
        <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Runtime controls</p>
            <h2 className="mt-1 text-xl font-black text-white">Platform flag inventory</h2>
            <p className="mt-1 text-sm text-white/50">Current status and rollout configuration for every known feature flag.</p>
          </div>
          <AdminStatusBadge tone="muted">{enabled.toLocaleString()} enabled</AdminStatusBadge>
        </div>
        {result.error ? (
          <div className="p-5 text-sm font-bold text-amber-100">{result.error}</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><AdminEmptyState title="No feature flags found" body="Feature flags will appear here after they are registered in the platform flag store." /></div>
        ) : (
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-white/[0.035] text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              <tr>{["Key", "Name", "Category", "Environment", "Status", "Rollout", "Updated"].map((heading) => <th key={heading} className="px-4 py-3 first:pl-5 last:pr-5">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-white/[0.025]">
                  <td className="px-5 py-4"><code className="text-xs text-rose-200">{row.key}</code></td>
                  <td className="px-4 py-4 font-black text-white">{row.name}</td>
                  <td className="px-4 py-4 text-white/60">{row.category || "Not set"}</td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={row.environment === "production" ? "rose" : "muted"}>{row.environment || "production"}</AdminStatusBadge></td>
                  <td className="px-4 py-4"><AdminStatusBadge tone={row.enabled ? "green" : "muted"}>{row.enabled ? "Enabled" : "Disabled"}</AdminStatusBadge></td>
                  <td className="px-4 py-4 font-black text-white/75"><span className="inline-flex items-center gap-2"><Gauge className="h-4 w-4 text-white/35" />{formatPercent(row.rollout_percentage)}</span></td>
                  <td className="px-4 py-4 pr-5 text-xs text-white/45">{formatDate(row.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminDataTableShell>
    </AdminPageShell>
  );
}
