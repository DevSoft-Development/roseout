import type { Metadata } from "next";
import {
  Boxes,
  CloudCog,
  Database,
  Globe2,
  HardDrive,
  Network,
  ServerCog,
  ShieldCheck,
} from "lucide-react";

import { ADMIN_ROLES } from "@theouthaven/auth/admin-roles";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
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
import { WebsiteHostingTabs } from "@/components/admin/WebsiteHostingTabs";

export const metadata: Metadata = {
  title: "Cloud Infrastructure | TheOutHaven Admin",
  description: "Enterprise control-plane view for TheOutHaven hosting and generated websites.",
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
  role: "primary" | "failover" | null;
  node_role: "web" | "domain_gateway" | null;
  proxy_type: string | null;
  proxy_status: string | null;
  app_service_status: string | null;
  app_health_status: string | null;
  app_health_checked_at: string | null;
  health_endpoint: string | null;
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
const ageMinutes = (date: string | null | undefined) =>
  date ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000)) : null;
const formatDate = (date: string | null | undefined) => (date ? new Date(date).toLocaleString() : "Never");
const daysUntil = (date: string | null | undefined) =>
  date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null;

function toneForStatus(status: string | null | undefined): "green" | "amber" | "red" | "muted" {
  const value = String(status || "").toLowerCase();
  if (["healthy", "live", "deployed", "active", "verified", "configured", "published"].includes(value)) return "green";
  if (["pending", "deploying", "provisioning", "degraded", "maintenance", "draft", "expiring", "inactive", "unknown"].includes(value)) return "amber";
  if (["failed", "offline", "suspended", "expired", "missing", "invalid", "unhealthy"].includes(value)) return "red";
  return "muted";
}

function loadTone(value: number) {
  return value >= 85 ? "text-rose-200" : value >= 70 ? "text-amber-200" : "text-emerald-200";
}

function tlsReady(node: HostingNode) {
  const remaining = daysUntil(node.tls_cert_expires_at);
  const heartbeatFresh = (ageMinutes(node.last_health_check_at) ?? 999) <= 10;
  return (
    node.node_role !== "domain_gateway" &&
    heartbeatFresh &&
    node.status === "healthy" &&
    node.caddy_status === "active" &&
    node.certbot_timer_status === "active" &&
    node.tls_status === "healthy" &&
    node.tls_wildcard === true &&
    remaining !== null &&
    remaining > 30
  );
}

function gatewayReady(node: HostingNode) {
  const remaining = daysUntil(node.tls_cert_expires_at);
  const heartbeatFresh = (ageMinutes(node.last_health_check_at) ?? 999) <= 10;
  return (
    node.node_role === "domain_gateway" &&
    heartbeatFresh &&
    node.status === "healthy" &&
    node.proxy_type === "nginx" &&
    node.proxy_status === "active" &&
    node.app_service_status === "active" &&
    node.app_health_status === "healthy" &&
    node.certbot_timer_status === "active" &&
    node.tls_status === "healthy" &&
    remaining !== null &&
    remaining > 30
  );
}

const platformMap = [
  {
    name: "Consumer Web",
    provider: "Vercel",
    role: "Public consumer application and edge delivery",
    surface: "theouthaven.com",
    icon: Globe2,
  },
  {
    name: "Admin Application",
    provider: "AWS",
    role: "Isolated internal administration runtime",
    surface: "admin.theouthaven.com",
    icon: ShieldCheck,
  },
  {
    name: "Business Application",
    provider: "AWS",
    role: "Isolated location-owner and business runtime",
    surface: "Business operations",
    icon: Boxes,
  },
  {
    name: "Reserve",
    provider: "AWS",
    role: "Dedicated reservations and operational service lane",
    surface: "Reservation system",
    icon: Network,
  },
  {
    name: "Generated Websites",
    provider: "AWS Lightsail",
    role: "Location website hosting, domain routing, TLS, and failover",
    surface: "Business websites",
    icon: ServerCog,
  },
  {
    name: "Primary Data Platform",
    provider: "Supabase",
    role: "Application database, storage, and supporting platform services",
    surface: "Platform data",
    icon: Database,
  },
  {
    name: "Location Services",
    provider: "Google Cloud",
    role: "Places, maps, enrichment, and location intelligence integrations",
    surface: "Location intelligence",
    icon: CloudCog,
  },
] as const;

export default async function WebsiteHostingOperationsPage() {
  await requireAdminRole([...ADMIN_ROLES]);
  const db = getAdminDatabaseClient();

  const [nodesResult, websitesResult] = await Promise.all([
    db
      .from("website_hosting_nodes")
      .select(
        "id,name,provider,instance_name,region,public_ip,status,accepting_new_sites,max_sites,role,node_role,proxy_type,proxy_status,app_service_status,app_health_status,app_health_checked_at,health_endpoint,cpu_percent,memory_percent,disk_percent,last_health_check_at,caddy_status,certbot_timer_status,tls_status,tls_wildcard,tls_cert_subject,tls_cert_expires_at,tls_last_checked_at,cert_last_renewed_at,updated_at",
      )
      .order("name", { ascending: true }),
    db
      .from("business_websites")
      .select(
        "id,location_id,domain,platform_domain,status,editor_status,deployment_status,dns_status,ssl_status,published_version,published_at,hosting_node_id,site_path,last_error,created_at",
      )
      .order("created_at", { ascending: false }),
  ]);

  const nodes = (nodesResult.data || []) as HostingNode[];
  const websites = (websitesResult.data || []) as Website[];
  const webNodes = nodes.filter((node) => node.node_role !== "domain_gateway");
  const primaryNodes = webNodes.filter((node) => node.role === "primary");
  const failoverNodes = webNodes.filter((node) => node.role === "failover");
  const gatewayNodes = nodes.filter((node) => node.node_role === "domain_gateway");
  const nodeSiteCounts = new Map<string, number>();
  for (const site of websites) {
    if (site.hosting_node_id) nodeSiteCounts.set(site.hosting_node_id, (nodeSiteCounts.get(site.hosting_node_id) || 0) + 1);
  }

  const liveSites = websites.filter((site) => site.status === "live").length;
  const failedSites = websites.filter(
    (site) => site.status === "failed" || site.deployment_status === "failed" || Boolean(site.last_error),
  ).length;
  const sslPending = websites.filter((site) => site.ssl_status !== "active").length;
  const dnsPending = websites.filter(
    (site) => !["verified", "configured"].includes(String(site.dns_status || "")),
  ).length;
  const totalCapacity = primaryNodes.reduce((sum, node) => sum + Number(node.max_sites || 0), 0);
  const usedCapacity = websites.filter(
    (site) =>
      site.hosting_node_id &&
      site.status !== "suspended" &&
      primaryNodes.some((node) => node.id === site.hosting_node_id),
  ).length;
  const capacityPct = totalCapacity ? Math.round((usedCapacity / totalCapacity) * 100) : 0;
  const healthyNodes = nodes.filter(
    (node) => node.status === "healthy" && (ageMinutes(node.last_health_check_at) ?? 999) <= 10,
  ).length;
  const tlsReadyNodes = webNodes.filter(tlsReady).length;
  const readyFailoverNodes = failoverNodes.filter(tlsReady).length;
  const readyGateways = gatewayNodes.filter(gatewayReady).length;
  const avgCpu = nodes.length
    ? nodes.reduce((sum, node) => sum + numberValue(node.cpu_percent), 0) / nodes.length
    : 0;
  const avgMemory = nodes.length
    ? nodes.reduce((sum, node) => sum + numberValue(node.memory_percent), 0) / nodes.length
    : 0;
  const avgDisk = nodes.length
    ? nodes.reduce((sum, node) => sum + numberValue(node.disk_percent), 0) / nodes.length
    : 0;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Cloud & platform"
        title="Cloud Infrastructure"
        subtitle="Enterprise control-plane view of TheOutHaven application surfaces, generated websites, Lightsail nodes, failover, DNS, TLS, capacity, and hosting readiness."
        badge={<AdminStatusBadge tone={failedSites || healthyNodes < nodes.length ? "amber" : "green"}>{failedSites || healthyNodes < nodes.length ? "Attention" : "Operational"}</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard">Admin overview</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/settings" variant="secondary">Settings</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/website-hosting" variant="primary">Refresh</AdminActionButton>
          </>
        }
      />

      <WebsiteHostingTabs active="overview" />

      {nodesResult.error || websitesResult.error ? (
        <section className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
          Hosting telemetry could not be fully loaded: {nodesResult.error?.message || websitesResult.error?.message}
        </section>
      ) : null}

      <AdminKpiGrid>
        <AdminKpiCard label="Generated sites" value={websites.length} helper={`${liveSites} live · ${failedSites} with issues`} icon={Globe2} />
        <AdminKpiCard label="Hosting nodes" value={nodes.length} helper={`${healthyNodes} healthy · ${failoverNodes.length} failover`} icon={ServerCog} />
        <AdminKpiCard label="Primary capacity" value={`${usedCapacity}/${totalCapacity || 0}`} helper={`${capacityPct}% allocated`} icon={HardDrive} />
        <AdminKpiCard label="DNS / SSL attention" value={`${dnsPending} / ${sslPending}`} helper="Pending DNS and SSL checks" icon={ShieldCheck} />
      </AdminKpiGrid>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">Expanded platform view</p>
          <h2 className="mt-2 text-xl font-black text-white">Platform topology</h2>
          <p className="mt-1 max-w-4xl text-sm text-white/50">
            High-level view of where each major TheOutHaven application surface runs. Live infrastructure telemetry below remains specific to the registered hosting nodes.
          </p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 sm:p-5">
          {platformMap.map((platform) => {
            const Icon = platform.icon;
            return (
              <article key={platform.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-300/20 bg-rose-500/10 text-rose-100">
                    <Icon className="h-4 w-4" />
                  </span>
                  <AdminStatusBadge tone="muted">{platform.provider}</AdminStatusBadge>
                </div>
                <h3 className="mt-4 font-black text-white">{platform.name}</h3>
                <p className="mt-1 text-xs font-bold text-white/45">{platform.surface}</p>
                <p className="mt-3 text-sm leading-6 text-white/58">{platform.role}</p>
              </article>
            );
          })}
        </div>
      </AdminSectionCard>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          ["Fleet CPU", avgCpu],
          ["Fleet memory", avgMemory],
          ["Fleet disk", avgDisk],
        ].map(([label, value]) => (
          <AdminSectionCard key={String(label)} className="p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{label}</p>
            <p className={`mt-3 text-4xl font-black ${loadTone(Number(value))}`}>{pct(Number(value))}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#e1062a]" style={{ width: `${Math.min(100, Number(value))}%` }} />
            </div>
          </AdminSectionCard>
        ))}
      </section>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-white">Lightsail fleet and failover readiness</h2>
              <p className="mt-1 text-sm text-white/50">
                Registered web nodes, gateway services, TLS state, health checks, and standby capacity.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <AdminStatusBadge tone={tlsReadyNodes === webNodes.length ? "green" : "amber"}>TLS {tlsReadyNodes}/{webNodes.length}</AdminStatusBadge>
              <AdminStatusBadge tone={readyFailoverNodes === failoverNodes.length ? "green" : "amber"}>Failover {readyFailoverNodes}/{failoverNodes.length || 0}</AdminStatusBadge>
              <AdminStatusBadge tone={readyGateways === gatewayNodes.length ? "green" : "amber"}>Gateway {readyGateways}/{gatewayNodes.length || 0}</AdminStatusBadge>
            </div>
          </div>
        </div>

        {nodes.length ? (
          <div className="grid gap-4 p-4 xl:grid-cols-2 sm:p-5">
            {nodes.map((node) => {
              const isGateway = node.node_role === "domain_gateway";
              const isFailover = !isGateway && node.role === "failover";
              const siteCount = nodeSiteCounts.get(node.id) || 0;
              const heartbeatAge = ageMinutes(node.last_health_check_at);
              const fresh = heartbeatAge !== null && heartbeatAge <= 10;
              const certDays = daysUntil(node.tls_cert_expires_at);
              const ready = isGateway ? gatewayReady(node) : tlsReady(node);

              return (
                <details key={node.id} className="group rounded-2xl border border-white/10 bg-black/20">
                  <summary className="cursor-pointer list-none p-5 marker:hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-black text-white">{node.name}</h3>
                        <p className="mt-1 text-xs text-white/40">
                          {node.provider} · {node.region || "Region unknown"} · {node.public_ip || "IP pending"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <AdminStatusBadge tone="muted">{isGateway ? "Domain gateway" : isFailover ? "Failover" : "Primary"}</AdminStatusBadge>
                        <AdminStatusBadge tone={fresh ? toneForStatus(node.status) : "red"}>{fresh ? node.status : "Offline"}</AdminStatusBadge>
                        <AdminStatusBadge tone={ready ? "green" : "amber"}>{ready ? "Ready" : "Needs attention"}</AdminStatusBadge>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        [isGateway ? "Role" : "Sites", isGateway ? "Gateway" : `${siteCount}/${node.max_sites}`],
                        ["CPU", pct(node.cpu_percent)],
                        ["Memory", pct(node.memory_percent)],
                        ["Disk", pct(node.disk_percent)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">{label}</p>
                          <p className="mt-1 text-lg font-black text-white/80">{value}</p>
                        </div>
                      ))}
                    </div>
                  </summary>

                  <div className="border-t border-white/10 px-5 py-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        [isGateway ? "Proxy" : "Caddy", isGateway ? node.proxy_status : node.caddy_status],
                        [isGateway ? "Gateway service" : "Renewal timer", isGateway ? node.app_service_status : node.certbot_timer_status],
                        [isGateway ? "Health endpoint" : "Wildcard TLS", isGateway ? node.app_health_status : node.tls_wildcard ? "active" : "missing"],
                        ["Certificate", certDays === null ? "Unknown" : `${certDays} days`],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">{label}</p>
                          <div className="mt-2"><AdminStatusBadge tone={toneForStatus(String(value || ""))}>{String(value || "Unknown")}</AdminStatusBadge></div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/45">
                      <span>Instance: {node.instance_name}</span>
                      <span>Heartbeat: {heartbeatAge === null ? "Never" : `${heartbeatAge}m ago`}</span>
                      <span>Certificate expires: {formatDate(node.tls_cert_expires_at)}</span>
                      <span>TLS checked: {formatDate(node.tls_last_checked_at)}</span>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="p-5">
            <AdminEmptyState title="No infrastructure nodes registered" body="Register hosting nodes before generated websites can report live infrastructure readiness." />
          </div>
        )}
      </AdminSectionCard>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <h2 className="text-xl font-black text-white">Published site inventory</h2>
          <p className="mt-1 text-sm text-white/50">Generated websites with deployment, DNS, SSL, version, and hosting-node state.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-white/[0.025] text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
              <tr>
                {["Site", "Status", "Deploy", "DNS", "SSL", "Version", "Node", "Published"].map((heading) => (
                  <th key={heading} className="px-5 py-3">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {websites.map((site) => {
                const node = nodes.find((item) => item.id === site.hosting_node_id);
                const host = site.domain || site.platform_domain;
                return (
                  <tr key={site.id} className="align-top text-white/70 transition hover:bg-white/[0.025]">
                    <td className="px-5 py-4">
                      <p className="font-black text-white">{host || "Domain pending"}</p>
                      <p className="mt-1 text-xs text-white/35">Location {site.location_id}</p>
                      {site.last_error ? <p className="mt-2 text-xs font-bold text-rose-200">{site.last_error}</p> : null}
                    </td>
                    <td className="px-5 py-4"><AdminStatusBadge tone={toneForStatus(site.status)}>{site.status}</AdminStatusBadge></td>
                    <td className="px-5 py-4"><AdminStatusBadge tone={toneForStatus(site.deployment_status)}>{site.deployment_status || "Unknown"}</AdminStatusBadge></td>
                    <td className="px-5 py-4"><AdminStatusBadge tone={toneForStatus(site.dns_status)}>{site.dns_status || "Unknown"}</AdminStatusBadge></td>
                    <td className="px-5 py-4"><AdminStatusBadge tone={toneForStatus(site.ssl_status)}>{site.ssl_status || "Unknown"}</AdminStatusBadge></td>
                    <td className="px-5 py-4 font-black text-white">{site.published_version ?? "—"}</td>
                    <td className="px-5 py-4">{node?.name || "Unassigned"}</td>
                    <td className="px-5 py-4 text-xs text-white/50">{formatDate(site.published_at)}</td>
                  </tr>
                );
              })}
              {!websites.length ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-white/45">No generated websites yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Operations model</p>
            <h2 className="mt-2 text-lg font-black text-white">Primary, standby, and gateway separation</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-white/50">
              Primary web nodes receive new site allocation. Failover nodes remain reserved as standby capacity, while the domain gateway is monitored as an independent routing and TLS surface.
            </p>
          </div>
          <AdminActionButton href="/admin/dashboard/website-hosting/testing">Open DR testing</AdminActionButton>
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
