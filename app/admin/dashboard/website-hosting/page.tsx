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
import { supabaseAdmin } from "@/lib/supabase-admin";

export const metadata: Metadata = {
  title: "Website Hosting Operations | Admin",
  description: "Monitor TheOutHaven-generated websites and Lightsail hosting capacity.",
};

export const dynamic = "force-dynamic";

type HostingNode = {
  id: string;
  name: string;
  provider: string;
  instance_name: string;
  region: string | null;
  public_ip: string | null;
  status: string;
  accepting_new_sites: boolean;
  max_sites: number;
  cpu_percent: number | string | null;
  memory_percent: number | string | null;
  disk_percent: number | string | null;
  last_health_check_at: string | null;
  caddy_status: string | null;
  certbot_timer_status: string | null;
  tls_status: string | null;
  tls_wildcard: boolean | null;
  tls_cert_subject: string | null;
  tls_cert_expires_at: string | null;
  tls_last_checked_at: string | null;
  cert_last_renewed_at: string | null;
  updated_at: string | null;
};

type Website = {
  id: string;
  location_id: string;
  domain: string | null;
  platform_domain: string | null;
  status: string;
  editor_status: string | null;
  deployment_status: string | null;
  dns_status: string | null;
  ssl_status: string | null;
  published_version: number | null;
  published_at: string | null;
  hosting_node_id: string | null;
  site_path: string | null;
  last_error: string | null;
  created_at: string | null;
};

const numberValue = (value: number | string | null | undefined) => Number(value || 0);
const pct = (value: number | string | null | undefined) => `${numberValue(value).toFixed(1)}%`;
const ageMinutes = (date: string | null | undefined) => date ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000)) : null;
const formatDate = (date: string | null | undefined) => date ? new Date(date).toLocaleString() : "Never";
const daysUntil = (date: string | null | undefined) => date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null;

function tone(status: string | null | undefined): "green" | "amber" | "rose" | "muted" {
  const value = String(status || "").toLowerCase();
  if (["healthy", "live", "deployed", "active", "verified", "configured", "published"].includes(value)) return "green";
  if (["pending", "deploying", "provisioning", "degraded", "maintenance", "draft", "expiring", "inactive", "unknown"].includes(value)) return "amber";
  if (["failed", "offline", "suspended", "expired", "missing", "invalid"].includes(value)) return "rose";
  return "muted";
}

function loadTone(value: number) {
  if (value >= 85) return "text-rose-200";
  if (value >= 70) return "text-amber-200";
  return "text-emerald-200";
}

function tlsReady(node: HostingNode) {
  const remaining = daysUntil(node.tls_cert_expires_at);
  const heartbeatFresh = (ageMinutes(node.last_health_check_at) ?? 999) <= 10;
  return heartbeatFresh
    && node.status === "healthy"
    && node.caddy_status === "active"
    && node.certbot_timer_status === "active"
    && node.tls_status === "healthy"
    && node.tls_wildcard === true
    && remaining !== null
    && remaining > 30;
}

export default async function WebsiteHostingOperationsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);

  const [nodesResult, websitesResult] = await Promise.all([
    supabaseAdmin
      .from("website_hosting_nodes")
      .select("id,name,provider,instance_name,region,public_ip,status,accepting_new_sites,max_sites,cpu_percent,memory_percent,disk_percent,last_health_check_at,caddy_status,certbot_timer_status,tls_status,tls_wildcard,tls_cert_subject,tls_cert_expires_at,tls_last_checked_at,cert_last_renewed_at,updated_at")
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("business_websites")
      .select("id,location_id,domain,platform_domain,status,editor_status,deployment_status,dns_status,ssl_status,published_version,published_at,hosting_node_id,site_path,last_error,created_at")
      .order("created_at", { ascending: false }),
  ]);

  const nodes = (nodesResult.data || []) as HostingNode[];
  const websites = (websitesResult.data || []) as Website[];
  const nodeSiteCounts = new Map<string, number>();
  websites.forEach((site) => {
    if (site.hosting_node_id) nodeSiteCounts.set(site.hosting_node_id, (nodeSiteCounts.get(site.hosting_node_id) || 0) + 1);
  });

  const liveSites = websites.filter((site) => site.status === "live").length;
  const deployingSites = websites.filter((site) => site.deployment_status === "deploying" || site.status === "deploying").length;
  const failedSites = websites.filter((site) => site.status === "failed" || site.deployment_status === "failed" || Boolean(site.last_error)).length;
  const sslPending = websites.filter((site) => site.ssl_status !== "active").length;
  const dnsPending = websites.filter((site) => site.dns_status !== "verified" && site.dns_status !== "configured").length;
  const totalCapacity = nodes.reduce((sum, node) => sum + Number(node.max_sites || 0), 0);
  const usedCapacity = websites.filter((site) => Boolean(site.hosting_node_id) && site.status !== "suspended").length;
  const capacityPct = totalCapacity ? Math.round((usedCapacity / totalCapacity) * 100) : 0;
  const healthyNodes = nodes.filter((node) => node.status === "healthy" && (ageMinutes(node.last_health_check_at) ?? 999) <= 10).length;
  const tlsReadyNodes = nodes.filter(tlsReady).length;
  const tlsAttentionNodes = nodes.filter((node) => node.tls_status && !tlsReady(node)).length;
  const avgCpu = nodes.length ? nodes.reduce((sum, node) => sum + numberValue(node.cpu_percent), 0) / nodes.length : 0;
  const avgMemory = nodes.length ? nodes.reduce((sum, node) => sum + numberValue(node.memory_percent), 0) / nodes.length : 0;
  const avgDisk = nodes.length ? nodes.reduce((sum, node) => sum + numberValue(node.disk_percent), 0) / nodes.length : 0;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Infrastructure"
        title="Website Hosting Operations"
        subtitle="Live control-plane view of TheOutHaven-generated websites, Lightsail nodes, capacity, deployment state, DNS, SSL, certificate renewal, and server health."
        actions={
          <>
            <AdminActionButton href="/admin/dashboard">Admin Overview</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/website-hosting" variant="primary">Refresh</AdminActionButton>
          </>
        }
      />

      {(nodesResult.error || websitesResult.error) ? (
        <AdminSectionCard className="border-rose-300/30 bg-rose-500/10 p-5">
          <h2 className="font-black text-rose-100">Hosting telemetry could not be fully loaded</h2>
          <p className="mt-2 text-sm text-rose-100/70">{nodesResult.error?.message || websitesResult.error?.message}</p>
        </AdminSectionCard>
      ) : null}

      <AdminKpiGrid>
        <AdminKpiCard label="Generated sites" value={websites.length} helper={`${liveSites} live`} />
        <AdminKpiCard label="Hosting nodes" value={nodes.length} helper={`${healthyNodes} healthy now`} />
        <AdminKpiCard label="Failover-ready TLS" value={`${tlsReadyNodes}/${nodes.length}`} helper={tlsAttentionNodes ? `${tlsAttentionNodes} node(s) need TLS attention` : "Wildcard renewal healthy"} />
        <AdminKpiCard label="Capacity used" value={`${usedCapacity}/${totalCapacity || 0}`} helper={`${capacityPct}% allocated`} />
        <AdminKpiCard label="Needs attention" value={failedSites} helper="Failed deploys or recorded errors" />
        <AdminKpiCard label="DNS / SSL pending" value={`${dnsPending} / ${sslPending}`} helper="Domain lifecycle checks" />
      </AdminKpiGrid>

      <div className="grid gap-5 lg:grid-cols-3">
        <AdminSectionCard className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Fleet CPU</p>
          <p className={`mt-3 text-4xl font-black ${loadTone(avgCpu)}`}>{pct(avgCpu)}</p>
          <p className="mt-2 text-sm text-white/50">Average reported node CPU utilization.</p>
        </AdminSectionCard>
        <AdminSectionCard className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Fleet Memory</p>
          <p className={`mt-3 text-4xl font-black ${loadTone(avgMemory)}`}>{pct(avgMemory)}</p>
          <p className="mt-2 text-sm text-white/50">Average reported node memory utilization.</p>
        </AdminSectionCard>
        <AdminSectionCard className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Fleet Disk</p>
          <p className={`mt-3 text-4xl font-black ${loadTone(avgDisk)}`}>{pct(avgDisk)}</p>
          <p className="mt-2 text-sm text-white/50">Average reported node disk utilization.</p>
        </AdminSectionCard>
      </div>

      <AdminSectionCard className="p-5">
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Lightsail fleet</p>
          <h2 className="mt-1 text-2xl font-black text-white">Server, TLS, and failover readiness</h2>
          <p className="mt-1 text-sm text-white/50">A node is failover-ready only when its heartbeat is fresh, Caddy is active, wildcard TLS is healthy for more than 30 days, and the Certbot renewal timer is active.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {nodes.map((node) => {
            const siteCount = nodeSiteCounts.get(node.id) || 0;
            const heartbeatAge = ageMinutes(node.last_health_check_at);
            const fresh = heartbeatAge !== null && heartbeatAge <= 10;
            const certDays = daysUntil(node.tls_cert_expires_at);
            const ready = tlsReady(node);
            const hasTlsTelemetry = Boolean(node.tls_last_checked_at || node.tls_status || node.caddy_status);
            return (
              <article key={node.id} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-black text-white">{node.name}</h3>
                      <AdminStatusBadge tone={tone(fresh ? node.status : "offline")}>{fresh ? node.status : "stale heartbeat"}</AdminStatusBadge>
                      <AdminStatusBadge tone={ready ? "green" : hasTlsTelemetry ? "amber" : "muted"}>{ready ? "Failover ready" : hasTlsTelemetry ? "TLS review" : "TLS telemetry pending"}</AdminStatusBadge>
                    </div>
                    <p className="mt-1 text-xs font-bold text-white/40">{node.provider} · {node.region || "region unknown"} · {node.public_ip || "IP pending"}</p>
                  </div>
                  <AdminStatusBadge tone={node.accepting_new_sites ? "green" : "amber"}>{node.accepting_new_sites ? "Accepting sites" : "Capacity paused"}</AdminStatusBadge>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Sites</p><p className="mt-1 text-xl font-black">{siteCount}/{node.max_sites}</p></div>
                  <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">CPU</p><p className={`mt-1 text-xl font-black ${loadTone(numberValue(node.cpu_percent))}`}>{pct(node.cpu_percent)}</p></div>
                  <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Memory</p><p className={`mt-1 text-xl font-black ${loadTone(numberValue(node.memory_percent))}`}>{pct(node.memory_percent)}</p></div>
                  <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Disk</p><p className={`mt-1 text-xl font-black ${loadTone(numberValue(node.disk_percent))}`}>{pct(node.disk_percent)}</p></div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3"><p className="text-[10px] font-black uppercase text-white/35">Caddy</p><div className="mt-2"><AdminStatusBadge tone={tone(node.caddy_status)}>{node.caddy_status || "unknown"}</AdminStatusBadge></div></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3"><p className="text-[10px] font-black uppercase text-white/35">Renewal timer</p><div className="mt-2"><AdminStatusBadge tone={tone(node.certbot_timer_status)}>{node.certbot_timer_status || "unknown"}</AdminStatusBadge></div></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3"><p className="text-[10px] font-black uppercase text-white/35">Wildcard TLS</p><div className="mt-2"><AdminStatusBadge tone={node.tls_wildcard ? "green" : hasTlsTelemetry ? "rose" : "muted"}>{node.tls_wildcard ? "present" : hasTlsTelemetry ? "missing" : "unknown"}</AdminStatusBadge></div></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3"><p className="text-[10px] font-black uppercase text-white/35">Certificate</p><p className={`mt-1 text-xl font-black ${certDays !== null && certDays <= 30 ? "text-rose-200" : "text-emerald-200"}`}>{certDays === null ? "—" : `${certDays}d`}</p><p className="text-[10px] text-white/35">remaining</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-white/45">
                  <span>Instance: {node.instance_name}</span>
                  <span>Heartbeat: {heartbeatAge === null ? "never" : `${heartbeatAge}m ago`}</span>
                  <span>TLS checked: {formatDate(node.tls_last_checked_at)}</span>
                  <span>Cert expires: {formatDate(node.tls_cert_expires_at)}</span>
                  <span>Cert deployed: {formatDate(node.cert_last_renewed_at)}</span>
                </div>
                {node.tls_cert_subject ? <p className="mt-3 truncate text-[11px] font-semibold text-white/30">{node.tls_cert_subject}</p> : null}
              </article>
            );
          })}
          {!nodes.length ? <p className="text-sm text-white/50">No hosting nodes are registered.</p> : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard className="overflow-hidden p-0">
        <div className="border-b border-white/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Generated websites</p>
          <h2 className="mt-1 text-2xl font-black text-white">Published site inventory</h2>
          <p className="mt-1 text-sm text-white/50">Every TheOutHaven-managed website and its current deployment, domain, SSL, and hosting state.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
              <tr>
                <th className="px-5 py-3">Site</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Deploy</th>
                <th className="px-5 py-3">DNS</th>
                <th className="px-5 py-3">SSL</th>
                <th className="px-5 py-3">Version</th>
                <th className="px-5 py-3">Node</th>
                <th className="px-5 py-3">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {websites.map((site) => {
                const node = nodes.find((item) => item.id === site.hosting_node_id);
                const host = site.domain || site.platform_domain;
                return (
                  <tr key={site.id} className="align-top text-white/70">
                    <td className="px-5 py-4">
                      <p className="font-black text-white">{host || "Domain pending"}</p>
                      <p className="mt-1 max-w-[280px] truncate text-xs text-white/35">Location {site.location_id}</p>
                      {site.last_error ? <p className="mt-2 max-w-[360px] text-xs font-bold text-rose-200">{site.last_error}</p> : null}
                    </td>
                    <td className="px-5 py-4"><AdminStatusBadge tone={tone(site.status)}>{site.status}</AdminStatusBadge></td>
                    <td className="px-5 py-4"><AdminStatusBadge tone={tone(site.deployment_status)}>{site.deployment_status || "unknown"}</AdminStatusBadge></td>
                    <td className="px-5 py-4"><AdminStatusBadge tone={tone(site.dns_status)}>{site.dns_status || "unknown"}</AdminStatusBadge></td>
                    <td className="px-5 py-4"><AdminStatusBadge tone={tone(site.ssl_status)}>{site.ssl_status || "unknown"}</AdminStatusBadge></td>
                    <td className="px-5 py-4 font-black text-white">{site.published_version ?? "—"}</td>
                    <td className="px-5 py-4">{node?.name || "Unassigned"}</td>
                    <td className="px-5 py-4 text-xs">{formatDate(site.published_at)}</td>
                  </tr>
                );
              })}
              {!websites.length ? <tr><td colSpan={8} className="px-5 py-8 text-center text-white/45">No generated websites yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Operations notes</h2>
            <p className="mt-1 text-sm text-white/50">Node telemetry is signed by the existing hosting heartbeat. TLS readiness is reported by each Lightsail node from its local Caddy, Certbot timer, and wildcard certificate state.</p>
          </div>
          <Link href="/admin/dashboard/settings" className="text-sm font-black text-rose-200 hover:text-white">Open admin settings →</Link>
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
