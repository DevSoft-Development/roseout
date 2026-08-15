import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type DrCheckStatus = "pass" | "warn" | "fail";

export type DrCheck = {
  key: string;
  label: string;
  status: DrCheckStatus;
  detail: string;
};

type HostingNode = {
  id: string;
  name: string;
  role: string | null;
  node_role: string | null;
  status: string;
  deploy_url: string | null;
  public_ip: string | null;
  last_health_check_at: string | null;
  healthy_since: string | null;
  cpu_percent: number | string | null;
  memory_percent: number | string | null;
  disk_percent: number | string | null;
  caddy_status: string | null;
  certbot_timer_status: string | null;
  tls_status: string | null;
  tls_wildcard: boolean | null;
};

type Website = {
  id: string;
  location_id: string;
  domain: string | null;
  platform_domain: string | null;
  status: string;
  deployment_status: string | null;
  dns_status: string | null;
  ssl_status: string | null;
  published_version: number | null;
  hosting_node_id: string | null;
  failover_source_node_id: string | null;
};

type Replica = {
  website_id: string;
  node_id: string;
  version: number;
  status: string;
};

const HEALTH_MAX_AGE_MS = 10 * 60 * 1000;
const FAILBACK_STABILITY_MS = 15 * 60 * 1000;

function numberValue(value: number | string | null | undefined) {
  return Number(value || 0);
}

function heartbeatFresh(value: string | null | undefined) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) && time > Date.now() - HEALTH_MAX_AGE_MS;
}

function sustainedHealthy(value: string | null | undefined) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) && time <= Date.now() - FAILBACK_STABILITY_MS;
}

function nodeReady(node: HostingNode | null | undefined) {
  if (!node) return false;
  return node.status === "healthy"
    && Boolean(node.deploy_url)
    && Boolean(node.public_ip)
    && heartbeatFresh(node.last_health_check_at)
    && numberValue(node.cpu_percent) < 70
    && numberValue(node.memory_percent) < 70
    && numberValue(node.disk_percent) < 75
    && node.caddy_status === "active"
    && node.certbot_timer_status === "active"
    && node.tls_status === "healthy"
    && node.tls_wildcard === true;
}

function exactReplica(replicas: Replica[], website: Website, nodeId: string) {
  const version = Number(website.published_version || 0);
  return replicas.some((replica) => replica.website_id === website.id
    && replica.node_id === nodeId
    && replica.status === "synced"
    && Number(replica.version) === version);
}

function statusFromChecks(checks: DrCheck[]): DrCheckStatus {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

export async function runHostingDrSimulation() {
  const [nodesResult, websitesResult, replicasResult] = await Promise.all([
    supabaseAdmin
      .from("website_hosting_nodes")
      .select("id,name,role,node_role,status,deploy_url,public_ip,last_health_check_at,healthy_since,cpu_percent,memory_percent,disk_percent,caddy_status,certbot_timer_status,tls_status,tls_wildcard"),
    supabaseAdmin
      .from("business_websites")
      .select("id,location_id,domain,platform_domain,status,deployment_status,dns_status,ssl_status,published_version,hosting_node_id,failover_source_node_id")
      .eq("status", "live"),
    supabaseAdmin
      .from("website_hosting_replicas")
      .select("website_id,node_id,version,status"),
  ]);

  const firstError = nodesResult.error || websitesResult.error || replicasResult.error;
  if (firstError) throw firstError;

  const nodes = (nodesResult.data || []) as HostingNode[];
  const websites = (websitesResult.data || []) as Website[];
  const replicas = (replicasResult.data || []) as Replica[];
  const source = nodes.find((node) => node.node_role !== "domain_gateway" && node.role === "primary") || null;
  const target = nodes.find((node) => node.node_role !== "domain_gateway" && node.role === "failover") || null;
  const gateway = nodes.find((node) => node.node_role === "domain_gateway") || null;
  const affected = source ? websites.filter((website) => website.hosting_node_id === source.id) : [];
  const platformSites = websites.filter((website) => Boolean(website.platform_domain));
  const customSites = affected.filter((website) => Boolean(website.domain));
  const checks: DrCheck[] = [];

  checks.push({
    key: "primary_outage_detection",
    label: "Primary outage detection",
    status: source ? "pass" : "fail",
    detail: source ? `Simulation will treat ${source.name} as unreachable without changing its database state.` : "No primary web node is registered.",
  });

  checks.push({
    key: "failover_node_health",
    label: "Failover node health",
    status: nodeReady(target) ? "pass" : "fail",
    detail: target
      ? nodeReady(target)
        ? `${target.name} satisfies heartbeat, load, Caddy, TLS, and deploy readiness thresholds.`
        : `${target.name} does not satisfy the production standby readiness thresholds.`
      : "No failover web node is registered.",
  });

  const affectedWithVersion = affected.filter((website) => Number.isInteger(Number(website.published_version)) && Number(website.published_version) > 0);
  const exactTargetCount = target ? affectedWithVersion.filter((website) => exactReplica(replicas, website, target.id)).length : 0;
  checks.push({
    key: "exact_replica_coverage",
    label: "Exact standby replica coverage",
    status: affectedWithVersion.length === affected.length && exactTargetCount === affected.length ? "pass" : "fail",
    detail: `${exactTargetCount}/${affected.length} affected live site(s) have their exact published version synced to the failover node.`,
  });

  checks.push({
    key: "failover_eligibility",
    label: "Failover eligibility",
    status: source && target && nodeReady(target) && exactTargetCount === affected.length ? "pass" : "fail",
    detail: source && target && nodeReady(target) && exactTargetCount === affected.length
      ? `A simulated ${source.name} outage can select ${target.name} without emergency deployment.`
      : "One or more production failover prerequisites are not satisfied.",
  });

  const gatewayHealthy = Boolean(gateway
    && gateway.status === "healthy"
    && heartbeatFresh(gateway.last_health_check_at));
  const customReady = customSites.every((site) => Boolean(site.domain)
    && ["verified", "configured"].includes(String(site.dns_status || ""))
    && site.ssl_status === "active");
  checks.push({
    key: "custom_domain_recovery",
    label: "Custom-domain recovery prerequisites",
    status: customSites.length === 0 ? "warn" : gatewayHealthy && customReady ? "pass" : "fail",
    detail: customSites.length === 0
      ? "No affected live custom-domain sites are available to exercise this branch of the drill."
      : gatewayHealthy && customReady
        ? `${customSites.length} custom-domain site(s) have healthy gateway, DNS, and SSL prerequisites.`
        : "At least one affected custom-domain site or the domain gateway is not recovery-ready.",
  });

  const wildcardCovered = Boolean(target) && platformSites.every((site) => exactReplica(replicas, site, target!.id));
  checks.push({
    key: "wildcard_coverage",
    label: "Platform wildcard failover coverage",
    status: platformSites.length === 0 ? "warn" : wildcardCovered ? "pass" : "fail",
    detail: platformSites.length === 0
      ? "No live platform-domain sites exist to validate wildcard coverage."
      : wildcardCovered
        ? `All ${platformSites.length} live platform-domain site(s) have exact replicas on ${target?.name}.`
        : `The failover node does not contain the exact published version of every live platform-domain site; production wildcard switching would be blocked.`,
  });

  checks.push({
    key: "simulated_takeover",
    label: "Simulated Virginia to Ohio takeover",
    status: source && target && nodeReady(target) && exactTargetCount === affected.length && (platformSites.length === 0 || wildcardCovered) ? "pass" : "fail",
    detail: "Dry-run only: no website ownership, DNS record, Caddy configuration, or routing state is changed.",
  });

  const sourceRecovered = Boolean(source
    && source.status === "healthy"
    && heartbeatFresh(source.last_health_check_at));
  checks.push({
    key: "primary_recovery",
    label: "Primary recovery readiness",
    status: sourceRecovered ? "pass" : "fail",
    detail: sourceRecovered ? `${source?.name} currently reports healthy with a fresh heartbeat.` : "The primary does not currently satisfy healthy/fresh recovery requirements.",
  });

  checks.push({
    key: "failback_stability",
    label: "15-minute failback stability rule",
    status: source && sustainedHealthy(source.healthy_since) ? "pass" : "warn",
    detail: source && sustainedHealthy(source.healthy_since)
      ? `${source.name} has remained healthy long enough for automatic failback.`
      : "Primary healthy_since has not yet satisfied the 15-minute automatic failback window.",
  });

  const exactSourceCount = source ? affectedWithVersion.filter((website) => exactReplica(replicas, website, source.id)).length : 0;
  checks.push({
    key: "primary_replica_for_failback",
    label: "Exact primary replica for failback",
    status: exactSourceCount === affected.length ? "pass" : "fail",
    detail: exactSourceCount === affected.length
      ? `${exactSourceCount}/${affected.length} affected site(s) have exact-version replicas on the primary for failback.`
      : `${exactSourceCount}/${affected.length} affected site(s) have an exact-version primary replica. Automatic failback requires this replica after a real failover.`,
  });

  checks.push({
    key: "simulated_failback",
    label: "Simulated Ohio to Virginia failback",
    status: sourceRecovered && source && sustainedHealthy(source.healthy_since) && exactSourceCount === affected.length ? "pass" : "fail",
    detail: "Dry-run only: the drill evaluates failback prerequisites but never invokes wildcard routing or clears failover ownership.",
  });

  checks.push({
    key: "no_production_mutation",
    label: "No production routing mutation",
    status: "pass",
    detail: "Simulation performs reads plus one audit-log insert only. It never calls DNS switching, domain connection, website deployment, or node reassignment functions.",
  });

  const status = statusFromChecks(checks);
  const passCount = checks.filter((check) => check.status === "pass").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const failCount = checks.filter((check) => check.status === "fail").length;
  const summary = status === "pass"
    ? "Primary outage simulated; standby takeover and automatic failback prerequisites are ready."
    : status === "warn"
      ? "DR simulation passed critical checks with one or more readiness warnings."
      : "DR simulation found one or more blockers that would prevent a clean production failover or failback.";

  const { data: run, error: insertError } = await supabaseAdmin
    .from("hosting_dr_test_runs")
    .insert({
      mode: "simulation",
      status,
      source_node_id: source?.id || null,
      target_node_id: target?.id || null,
      site_count: affected.length,
      pass_count: passCount,
      warn_count: warnCount,
      fail_count: failCount,
      summary,
      results: checks,
    })
    .select("id,created_at")
    .single();
  if (insertError) throw insertError;

  return {
    id: run.id,
    createdAt: run.created_at,
    mode: "simulation" as const,
    status,
    sourceNode: source?.name || null,
    targetNode: target?.name || null,
    siteCount: affected.length,
    passCount,
    warnCount,
    failCount,
    summary,
    checks,
  };
}
