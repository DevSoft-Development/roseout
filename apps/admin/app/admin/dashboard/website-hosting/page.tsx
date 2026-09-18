import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_ROLES } from "@theouthaven/auth/admin-roles";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { WebsiteHostingTabs } from "@/components/admin/WebsiteHostingTabs";

export const metadata: Metadata = {
  title: "Website Hosting Operations | Admin",
  description: "Monitor TheOutHaven-generated websites and Lightsail infrastructure.",
};
export const dynamic = "force-dynamic";

type HostingNode = {
  id: string; name: string; provider: string; instance_name: string; region: string | null; public_ip: string | null;
  status: string; accepting_new_sites: boolean; max_sites: number; role: "primary" | "failover" | null; node_role: "web" | "domain_gateway" | null;
  proxy_type: string | null; proxy_status: string | null; app_service_status: string | null; app_health_status: string | null; app_health_checked_at: string | null;
  health_endpoint: string | null; cpu_percent: number | string | null; memory_percent: number | string | null; disk_percent: number | string | null;
  last_health_check_at: string | null; caddy_status: string | null; certbot_timer_status: string | null; tls_status: string | null; tls_wildcard: boolean | null;
  tls_cert_subject: string | null; tls_cert_expires_at: string | null; tls_last_checked_at: string | null; cert_last_renewed_at: string | null; updated_at: string | null;
};

type Website = {
  id: string; location_id: string; domain: string | null; platform_domain: string | null; status: string; editor_status: string | null;
  deployment_status: string | null; dns_status: string | null; ssl_status: string | null; published_version: number | null; published_at: string | null;
  hosting_node_id: string | null; site_path: string | null; last_error: string | null; created_at: string | null;
};

const numberValue = (value: number | string | null | undefined) => Number(value || 0);
const pct = (value: number | string | null | undefined) => `${numberValue(value).toFixed(1)}%`;
const ageMinutes = (date: string | null | undefined) => date ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000)) : null;
const formatDate = (date: string | null | undefined) => date ? new Date(date).toLocaleString() : "Never";
const daysUntil = (date: string | null | undefined) => date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null;

function statusClass(status: string | null | undefined) {
  const value = String(status || "").toLowerCase();
  if (["healthy","live","deployed","active","verified","configured","published"].includes(value)) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (["pending","deploying","provisioning","degraded","maintenance","draft","expiring","inactive","unknown"].includes(value)) return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (["failed","offline","suspended","expired","missing","invalid","unhealthy"].includes(value)) return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  return "border-white/10 bg-white/[0.04] text-white/60";
}
function badge(status: string | null | undefined) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black capitalize ${statusClass(status)}`}>{status || "unknown"}</span>;
}
function loadClass(value: number) { return value >= 85 ? "text-rose-200" : value >= 70 ? "text-amber-200" : "text-emerald-200"; }
function tlsReady(node: HostingNode) {
  const remaining = daysUntil(node.tls_cert_expires_at);
  const heartbeatFresh = (ageMinutes(node.last_health_check_at) ?? 999) <= 10;
  return node.node_role !== "domain_gateway" && heartbeatFresh && node.status === "healthy" && node.caddy_status === "active" &&
    node.certbot_timer_status === "active" && node.tls_status === "healthy" && node.tls_wildcard === true && remaining !== null && remaining > 30;
}
function gatewayReady(node: HostingNode) {
  const remaining = daysUntil(node.tls_cert_expires_at);
  const heartbeatFresh = (ageMinutes(node.last_health_check_at) ?? 999) <= 10;
  return node.node_role === "domain_gateway" && heartbeatFresh && node.status === "healthy" && node.proxy_type === "nginx" &&
    node.proxy_status === "active" && node.app_service_status === "active" && node.app_health_status === "healthy" &&
    node.certbot_timer_status === "active" && node.tls_status === "healthy" && remaining !== null && remaining > 30;
}

export default async function WebsiteHostingOperationsPage() {
  await requireAdminRole([...ADMIN_ROLES]);
  const db = getAdminDatabaseClient();

  const [nodesResult, websitesResult] = await Promise.all([
    db.from("website_hosting_nodes")
      .select("id,name,provider,instance_name,region,public_ip,status,accepting_new_sites,max_sites,role,node_role,proxy_type,proxy_status,app_service_status,app_health_status,app_health_checked_at,health_endpoint,cpu_percent,memory_percent,disk_percent,last_health_check_at,caddy_status,certbot_timer_status,tls_status,tls_wildcard,tls_cert_subject,tls_cert_expires_at,tls_last_checked_at,cert_last_renewed_at,updated_at")
      .order("name", { ascending: true }),
    db.from("business_websites")
      .select("id,location_id,domain,platform_domain,status,editor_status,deployment_status,dns_status,ssl_status,published_version,published_at,hosting_node_id,site_path,last_error,created_at")
      .order("created_at", { ascending: false }),
  ]);

  const nodes = (nodesResult.data || []) as HostingNode[];
  const websites = (websitesResult.data || []) as Website[];
  const webNodes = nodes.filter((node) => node.node_role !== "domain_gateway");
  const primaryNodes = webNodes.filter((node) => node.role === "primary");
  const failoverNodes = webNodes.filter((node) => node.role === "failover");
  const gatewayNodes = nodes.filter((node) => node.node_role === "domain_gateway");
  const nodeSiteCounts = new Map<string, number>();
  for (const site of websites) if (site.hosting_node_id) nodeSiteCounts.set(site.hosting_node_id, (nodeSiteCounts.get(site.hosting_node_id) || 0) + 1);

  const liveSites = websites.filter((site) => site.status === "live").length;
  const failedSites = websites.filter((site) => site.status === "failed" || site.deployment_status === "failed" || Boolean(site.last_error)).length;
  const sslPending = websites.filter((site) => site.ssl_status !== "active").length;
  const dnsPending = websites.filter((site) => !["verified","configured"].includes(String(site.dns_status || ""))).length;
  const totalCapacity = primaryNodes.reduce((sum, node) => sum + Number(node.max_sites || 0), 0);
  const usedCapacity = websites.filter((site) => site.hosting_node_id && site.status !== "suspended" && primaryNodes.some((node) => node.id === site.hosting_node_id)).length;
  const capacityPct = totalCapacity ? Math.round((usedCapacity / totalCapacity) * 100) : 0;
  const healthyNodes = nodes.filter((node) => node.status === "healthy" && (ageMinutes(node.last_health_check_at) ?? 999) <= 10).length;
  const tlsReadyNodes = webNodes.filter(tlsReady).length;
  const readyFailoverNodes = failoverNodes.filter(tlsReady).length;
  const readyGateways = gatewayNodes.filter(gatewayReady).length;
  const avgCpu = nodes.length ? nodes.reduce((sum, node) => sum + numberValue(node.cpu_percent), 0) / nodes.length : 0;
  const avgMemory = nodes.length ? nodes.reduce((sum, node) => sum + numberValue(node.memory_percent), 0) / nodes.length : 0;
  const avgDisk = nodes.length ? nodes.reduce((sum, node) => sum + numberValue(node.disk_percent), 0) / nodes.length : 0;

  const kpis = [
    ["Generated sites", websites.length, `${liveSites} live`],
    ["Infrastructure", nodes.length, `${healthyNodes} healthy · ${webNodes.length} web · ${gatewayNodes.length} gateway`],
    ["Web TLS ready", `${tlsReadyNodes}/${webNodes.length}`, "Primary and standby TLS readiness"],
    ["Failover readiness", `${readyFailoverNodes}/${failoverNodes.length || 1}`, failoverNodes.length ? "Standby capacity" : "No standby node registered"],
    ["Primary capacity", `${usedCapacity}/${totalCapacity || 0}`, `${capacityPct}% allocated`],
    ["Domain gateway", `${readyGateways}/${gatewayNodes.length || 1}`, `${failedSites} site issues · DNS/SSL ${dnsPending}/${sslPending}`],
  ];

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Infrastructure</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div><h1 className="text-3xl font-black sm:text-4xl">Website Hosting Operations</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">Live control-plane view of generated websites, Lightsail web nodes, domain gateway, capacity, DNS, TLS, certificate renewal, and service health.</p></div>
            <div className="flex gap-2"><Link href="/admin/dashboard" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black">Admin Overview</Link><Link href="/admin/dashboard/website-hosting" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black">Refresh</Link></div>
          </div>
        </header>

        <WebsiteHostingTabs active="overview" />

        {(nodesResult.error || websitesResult.error) ? <section className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">Hosting telemetry could not be fully loaded: {nodesResult.error?.message || websitesResult.error?.message}</section> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map(([label,value,helper]) => <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-white/40">{label}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-1 text-xs text-white/45">{helper}</p></article>)}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {[["Fleet CPU",avgCpu],["Fleet Memory",avgMemory],["Fleet Disk",avgDisk]].map(([label,value]) => <article key={String(label)} className="rounded-3xl border border-white/10 bg-[#120d0b] p-5"><p className="text-xs font-black uppercase tracking-[.2em] text-white/40">{label}</p><p className={`mt-3 text-4xl font-black ${loadClass(Number(value))}`}>{pct(Number(value))}</p></article>)}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <h2 className="text-2xl font-black">Server, TLS, gateway, and failover readiness</h2>
          <p className="mt-1 text-sm text-white/50">Primary nodes accept new sites; failover nodes remain reserved while still proving readiness.</p>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {nodes.map((node) => {
              const isGateway = node.node_role === "domain_gateway";
              const isFailover = !isGateway && node.role === "failover";
              const siteCount = nodeSiteCounts.get(node.id) || 0;
              const heartbeatAge = ageMinutes(node.last_health_check_at);
              const fresh = heartbeatAge !== null && heartbeatAge <= 10;
              const certDays = daysUntil(node.tls_cert_expires_at);
              const ready = isGateway ? gatewayReady(node) : tlsReady(node);
              return <article key={node.id} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-black">{node.name}</h3><p className="mt-1 text-xs text-white/40">{node.provider} · {node.region || "region unknown"} · {node.public_ip || "IP pending"}</p></div><div className="flex flex-wrap gap-2">{badge(isGateway ? "domain gateway" : isFailover ? "failover" : "primary")}{badge(fresh ? node.status : "offline")}{badge(ready ? "healthy" : "degraded")}</div></div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] uppercase text-white/35">{isGateway ? "Role" : "Sites"}</p><p className="mt-1 text-xl font-black">{isGateway ? "Gateway" : `${siteCount}/${node.max_sites}`}</p></div>
                  <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] uppercase text-white/35">CPU</p><p className={`mt-1 text-xl font-black ${loadClass(numberValue(node.cpu_percent))}`}>{pct(node.cpu_percent)}</p></div>
                  <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] uppercase text-white/35">Memory</p><p className={`mt-1 text-xl font-black ${loadClass(numberValue(node.memory_percent))}`}>{pct(node.memory_percent)}</p></div>
                  <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] uppercase text-white/35">Disk</p><p className={`mt-1 text-xl font-black ${loadClass(numberValue(node.disk_percent))}`}>{pct(node.disk_percent)}</p></div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[.02] p-3"><p className="text-[10px] uppercase text-white/35">{isGateway ? "nginx" : "Caddy"}</p><div className="mt-2">{badge(isGateway ? node.proxy_status : node.caddy_status)}</div></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[.02] p-3"><p className="text-[10px] uppercase text-white/35">{isGateway ? "Gateway service" : "Renewal timer"}</p><div className="mt-2">{badge(isGateway ? node.app_service_status : node.certbot_timer_status)}</div></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[.02] p-3"><p className="text-[10px] uppercase text-white/35">{isGateway ? "/health" : "Wildcard TLS"}</p><div className="mt-2">{badge(isGateway ? node.app_health_status : node.tls_wildcard ? "active" : "missing")}</div></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[.02] p-3"><p className="text-[10px] uppercase text-white/35">Certificate</p><p className={`mt-1 text-xl font-black ${certDays !== null && certDays <= 30 ? "text-rose-200" : "text-emerald-200"}`}>{certDays === null ? "—" : `${certDays}d`}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/45"><span>Instance: {node.instance_name}</span><span>Heartbeat: {heartbeatAge === null ? "never" : `${heartbeatAge}m ago`}</span><span>Cert expires: {formatDate(node.tls_cert_expires_at)}</span><span>TLS checked: {formatDate(node.tls_last_checked_at)}</span></div>
              </article>;
            })}
            {!nodes.length ? <p className="text-sm text-white/50">No infrastructure nodes are registered.</p> : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
          <div className="border-b border-white/10 p-5"><h2 className="text-2xl font-black">Published site inventory</h2><p className="mt-1 text-sm text-white/50">Generated websites and their deployment, DNS, SSL, and hosting state.</p></div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
            <thead className="bg-white/[.03] text-[10px] font-black uppercase tracking-[.16em] text-white/35"><tr><th className="px-5 py-3">Site</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Deploy</th><th className="px-5 py-3">DNS</th><th className="px-5 py-3">SSL</th><th className="px-5 py-3">Version</th><th className="px-5 py-3">Node</th><th className="px-5 py-3">Published</th></tr></thead>
            <tbody className="divide-y divide-white/10">{websites.map((site) => { const node = nodes.find((item)=>item.id===site.hosting_node_id); const host=site.domain||site.platform_domain; return <tr key={site.id} className="align-top text-white/70"><td className="px-5 py-4"><p className="font-black text-white">{host || "Domain pending"}</p><p className="mt-1 text-xs text-white/35">Location {site.location_id}</p>{site.last_error ? <p className="mt-2 text-xs font-bold text-rose-200">{site.last_error}</p> : null}</td><td className="px-5 py-4">{badge(site.status)}</td><td className="px-5 py-4">{badge(site.deployment_status)}</td><td className="px-5 py-4">{badge(site.dns_status)}</td><td className="px-5 py-4">{badge(site.ssl_status)}</td><td className="px-5 py-4 font-black text-white">{site.published_version ?? "—"}</td><td className="px-5 py-4">{node?.name || "Unassigned"}</td><td className="px-5 py-4 text-xs">{formatDate(site.published_at)}</td></tr>;})}{!websites.length ? <tr><td colSpan={8} className="px-5 py-8 text-center text-white/45">No generated websites yet.</td></tr> : null}</tbody>
          </table></div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-xl font-black">Operations notes</h2><p className="mt-1 text-sm text-white/50">Primary web nodes are eligible for new site allocation; failover nodes remain standby capacity and the domain gateway is monitored separately.</p></div><Link href="/admin/dashboard/settings" className="text-sm font-black text-rose-200">Open admin settings →</Link></div></section>
      </div>
    </main>
  );
}
