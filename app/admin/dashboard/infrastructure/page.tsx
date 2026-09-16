import type { Metadata } from "next";
import Link from "next/link";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  getInfrastructureOverview,
  type InfrastructureHealth,
  type InfrastructureProviderSummary,
  type InfrastructureService,
} from "@/lib/aws/infrastructure-status";

export const metadata: Metadata = {
  title: "Cloud Infrastructure | Admin",
  description: "Unified AWS, Supabase, and Vercel health and resource inventory for TheOutHaven.",
};

export const dynamic = "force-dynamic";

function tone(health: InfrastructureHealth): "green" | "amber" | "rose" | "muted" {
  if (health === "healthy") return "green";
  if (health === "degraded" || health === "configured") return "amber";
  if (health === "unhealthy") return "rose";
  return "muted";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not reported";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function providerTitle(provider: InfrastructureProviderSummary) {
  if (provider.provider === "aws") return "Amazon Web Services";
  if (provider.provider === "supabase") return "Supabase";
  return "Vercel";
}

function isAlarmState(value: string | null | undefined) {
  return String(value || "").toUpperCase() === "ALARM";
}

function ServiceCard({ service }: { service: InfrastructureService }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">{service.id}</p>
          <h3 className="mt-1 text-xl font-black text-white">{service.name}</h3>
          {service.detail ? <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{service.detail}</p> : null}
        </div>
        <AdminStatusBadge tone={tone(service.health)}>{service.health}</AdminStatusBadge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-white/35">Resources</p>
          <p className="mt-1 text-lg font-black text-white">{service.resourceCount}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-white/35">Region</p>
          <p className="mt-1 text-sm font-black text-white">{service.region || "Global / mixed"}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-white/35">Last updated</p>
          <p className="mt-1 text-xs font-bold leading-5 text-white/70">{formatDate(service.lastUpdatedAt)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-white/35">Last checked</p>
          <p className="mt-1 text-xs font-bold leading-5 text-white/70">{formatDate(service.lastCheckedAt)}</p>
        </div>
      </div>

      {service.resources?.length ? (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[10px] font-black uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {service.resources.map((resource, index) => (
                <tr key={`${service.id}:${resource.name}:${index}`} className="align-top">
                  <td className="px-4 py-3 font-bold text-white">{resource.name}</td>
                  <td className="px-4 py-3 text-white/55">{resource.type || service.name}</td>
                  <td className="px-4 py-3"><AdminStatusBadge tone={resource.status && /failed|error|alarm|offline|expired/i.test(resource.status) ? "rose" : resource.status && /pending|disabled|unknown|warning/i.test(resource.status) ? "amber" : "green"}>{resource.status || "reported"}</AdminStatusBadge></td>
                  <td className="px-4 py-3 text-white/55">{resource.region || service.region || "—"}</td>
                  <td className="px-4 py-3 text-xs text-white/55">{formatDate(resource.lastUpdatedAt)}</td>
                  <td className="max-w-md px-4 py-3 text-xs leading-5 text-white/55">{resource.detail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}

export default async function InfrastructurePage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);

  let overview = null;
  let loadError: string | null = null;
  try {
    overview = await getInfrastructureOverview();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Infrastructure telemetry could not be loaded.";
  }

  const providers = overview?.providers || [];
  const services = providers.flatMap((provider) => provider.services);
  const healthy = services.filter((service) => service.health === "healthy").length;
  const attention = services.filter((service) => service.health === "degraded" || service.health === "unhealthy").length;
  const resources = services.reduce((sum, service) => sum + service.resourceCount, 0);
  const cloudwatch = services.find((service) => service.provider === "aws" && service.id === "cloudwatch");
  const lambda = services.find((service) => service.provider === "aws" && service.id === "lambda");
  const criticalAlarms = (cloudwatch?.resources || []).filter((resource) => String(resource.name || "").startsWith("toh-production-critical-"));
  const openCritical = criticalAlarms.filter((resource) => isAlarmState(resource.status));
  const monitorInstalled = Boolean((lambda?.resources || []).find((resource) => resource.name === "toh-production-critical-platform-monitor"));
  const relayInstalled = Boolean((lambda?.resources || []).find((resource) => resource.name === "toh-production-critical-alert-relay"));
  const overallCriticalState = openCritical.length ? "critical" : criticalAlarms.length ? "operational" : "not deployed";

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="System"
        title="Cloud Infrastructure"
        subtitle="One operational control plane for TheOutHaven AWS, Supabase, and Vercel resources, service health, deployment state, last updates, and detailed resource inventory."
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/infrastructure" variant="primary">Refresh</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/infrastructure/failover">Failover & DR</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/website-hosting">Website Hosting</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/credentials">Credentials Vault</AdminActionButton>
          </>
        }
      />

      <AdminSectionCard className={openCritical.length ? "border-rose-400/40 bg-rose-950/20 p-5 sm:p-6" : "p-5 sm:p-6"}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Critical alerts & incidents</p>
            <h2 className="mt-1 text-2xl font-black text-white">{openCritical.length ? `${openCritical.length} critical incident${openCritical.length === 1 ? "" : "s"} open` : "No critical incidents open"}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">Five-minute monitoring covers production availability, Virginia → Oregon replication, Oregon storage byte drift, WAL lag, and monitor heartbeat. Critical alarms use the existing platform alert topic for email and the Telnyx relay for SMS.</p>
          </div>
          <AdminStatusBadge tone={openCritical.length ? "rose" : criticalAlarms.length ? "green" : "amber"}>{overallCriticalState}</AdminStatusBadge>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-white/35">5-minute monitor</p>
            <p className="mt-2 text-lg font-black text-white">{monitorInstalled ? "Installed" : "Not detected"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-white/35">Critical alarms</p>
            <p className="mt-2 text-lg font-black text-white">{criticalAlarms.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-white/35">Email alerts</p>
            <p className="mt-2 text-lg font-black text-white">Platform SNS</p>
            <p className="mt-1 text-xs text-white/40">Uses the existing AWS platform-alert subscription.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-white/35">SMS alerts</p>
            <p className="mt-2 text-lg font-black text-white">{relayInstalled ? "Telnyx relay installed" : "Not detected"}</p>
            <p className="mt-1 text-xs text-white/40">Sender and recipient are deployment configuration; Telnyx API key stays in Credentials Vault.</p>
          </div>
        </div>

        {openCritical.length ? (
          <div className="mt-5 space-y-3">
            {openCritical.map((incident) => (
              <div key={incident.name} className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-200">Critical</p>
                    <p className="mt-1 font-black text-white">{incident.name}</p>
                    <p className="mt-2 text-sm leading-6 text-white/60">{incident.detail || "CloudWatch reports this critical condition is active."}</p>
                  </div>
                  <div className="text-right">
                    <AdminStatusBadge tone="rose">ALARM</AdminStatusBadge>
                    <p className="mt-2 text-xs font-bold text-white/35">Updated {formatDate(incident.lastUpdatedAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : criticalAlarms.length ? (
          <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">All deployed critical alarms are clear.</div>
        ) : (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">Critical alerting has not been detected in live AWS inventory yet. It will appear here after the critical-alerting stack deploys.</div>
        )}
      </AdminSectionCard>

      <AdminKpiGrid>
        <AdminKpiCard label="Cloud providers" value={providers.length || 3} helper="AWS · Supabase · Vercel" />
        <AdminKpiCard label="Healthy services" value={`${healthy}/${services.length || 0}`} helper={attention ? `${attention} service(s) need attention` : "No active service alerts"} />
        <AdminKpiCard label="Resources discovered" value={resources} helper="Live inventory returned by provider control planes" />
        <AdminKpiCard label="Last full check" value={overview?.checkedAt ? formatDate(overview.checkedAt) : "Unavailable"} helper="Refresh reloads live telemetry" />
      </AdminKpiGrid>

      <AdminSectionCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Security boundary</p>
            <h2 className="mt-1 text-xl font-black text-white">Operational data only</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">This page can show resource names, regions, deployment states, timestamps, counts, alarms, and health. Secret values stay in the Credentials Vault and are never rendered here.</p>
          </div>
          <Link href="/admin/dashboard/credentials" className="text-sm font-black text-rose-200 hover:text-rose-100">Manage credentials →</Link>
        </div>
      </AdminSectionCard>

      {loadError ? (
        <AdminSectionCard className="border-amber-300/30 bg-amber-500/10 p-5">
          <h2 className="font-black text-amber-100">Infrastructure telemetry is not fully available yet</h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/70">{loadError}. The page is installed; AWS gateway telemetry must be deployed before the unified inventory can populate.</p>
        </AdminSectionCard>
      ) : null}

      {providers.map((provider) => (
        <AdminSectionCard key={provider.provider} className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">{provider.provider}</p>
              <h2 className="mt-1 text-2xl font-black text-white">{providerTitle(provider)}</h2>
              <p className="mt-2 text-sm leading-6 text-white/55">{provider.detail || "Live provider telemetry."}</p>
              <p className="mt-2 text-xs font-bold text-white/35">
                {provider.accountId ? `Account ${provider.accountId} · ` : ""}
                {provider.projectId ? `Project ${provider.projectId} · ` : ""}
                {provider.region || "Global / multi-region"} · checked {formatDate(provider.lastCheckedAt)}
              </p>
            </div>
            <AdminStatusBadge tone={tone(provider.health)}>{provider.health}</AdminStatusBadge>
          </div>
          <div className="space-y-4">
            {provider.services.map((service) => <ServiceCard key={`${provider.provider}:${service.id}`} service={service} />)}
          </div>
        </AdminSectionCard>
      ))}
    </AdminPageShell>
  );
}
