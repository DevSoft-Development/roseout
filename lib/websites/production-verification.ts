import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type WebsiteVerificationCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  severity: "critical" | "warning" | "info";
};

export type WebsiteVerificationRow = {
  websiteId: string;
  locationId: string;
  locationName: string;
  domain: string | null;
  platformDomain: string | null;
  liveAddress: string | null;
  publishedVersion: number | null;
  checks: WebsiteVerificationCheck[];
  score: number;
  state: "healthy" | "attention" | "blocked";
};

function fresh(value: string | null | undefined, maxAgeMs: number) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > Date.now() - maxAgeMs;
}

function check(key: string, label: string, ok: boolean, detail: string, severity: WebsiteVerificationCheck["severity"]): WebsiteVerificationCheck {
  return { key, label, ok, detail, severity };
}

export async function loadWebsiteProductionVerification(): Promise<WebsiteVerificationRow[]> {
  const { data: websites, error } = await supabaseAdmin
    .from("business_websites")
    .select("id,location_id,domain,platform_domain,status,deployment_status,dns_status,ssl_status,last_publish_status,last_error,published_version,hosting_node_id,last_health_check_at")
    .not("published_version", "is", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const locationIds = [...new Set((websites || []).map((row) => String(row.location_id)))];
  const nodeIds = [...new Set((websites || []).map((row) => String(row.hosting_node_id || "")).filter(Boolean))];

  const [{ data: locations }, { data: nodes }, { data: replicas }] = await Promise.all([
    locationIds.length
      ? supabaseAdmin.from("locations").select("id,name,title,included_domain_name,included_domain_status,included_domain_connection_status,included_domain_renewal_due_at").in("id", locationIds)
      : Promise.resolve({ data: [] as any[] }),
    nodeIds.length
      ? supabaseAdmin.from("website_hosting_nodes").select("id,name,role,status,public_ip,deploy_url,last_health_check_at,cpu_percent,memory_percent,disk_percent").in("id", nodeIds)
      : Promise.resolve({ data: [] as any[] }),
    (websites || []).length
      ? supabaseAdmin.from("website_hosting_replicas").select("website_id,node_id,version,status,synced_at,last_error").in("website_id", (websites || []).map((row) => row.id))
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const locationsById = new Map((locations || []).map((row: any) => [String(row.id), row]));
  const nodesById = new Map((nodes || []).map((row: any) => [String(row.id), row]));
  const replicasByWebsite = new Map<string, any[]>();
  for (const replica of replicas || []) {
    const key = String(replica.website_id);
    const current = replicasByWebsite.get(key) || [];
    current.push(replica);
    replicasByWebsite.set(key, current);
  }

  return (websites || []).map((website: any) => {
    const location = locationsById.get(String(website.location_id)) || {};
    const primary = nodesById.get(String(website.hosting_node_id || ""));
    const version = Number(website.published_version || 0) || null;
    const siteReplicas = replicasByWebsite.get(String(website.id)) || [];
    const exactReplica = siteReplicas.find((replica) => Number(replica.version) === version && replica.status === "synced" && String(replica.node_id) !== String(website.hosting_node_id));
    const liveAddress = String(website.domain || website.platform_domain || "").trim() || null;
    const customDomain = Boolean(website.domain);
    const openSrsDomain = String(location.included_domain_name || "").trim();
    const usesIncludedDomain = Boolean(openSrsDomain && website.domain && openSrsDomain.toLowerCase() === String(website.domain).toLowerCase());

    const checks: WebsiteVerificationCheck[] = [
      check("published", "Published version", Boolean(version && website.last_publish_status === "published"), version ? `Version ${version}` : "No published version", "critical"),
      check("deployment", "Primary deployment", website.deployment_status === "deployed" && website.status === "live", `${website.status || "unknown"} / ${website.deployment_status || "unknown"}`, "critical"),
      check("address", "Live address", Boolean(liveAddress), liveAddress || "No website address", "critical"),
      check("primary", "Primary hosting node", Boolean(primary && primary.status === "healthy" && primary.public_ip && fresh(primary.last_health_check_at, 15 * 60 * 1000)), primary ? `${primary.name} · ${primary.status}` : "Primary node missing", "critical"),
      check("standby", "Latest standby replica", Boolean(exactReplica), exactReplica ? `Version ${exactReplica.version} synced` : `No exact standby for version ${version || "—"}`, "warning"),
      check("health", "Recent live health check", fresh(website.last_health_check_at, 45 * 60 * 1000), website.last_health_check_at ? new Date(website.last_health_check_at).toLocaleString() : "Never checked", "warning"),
      check("publish_error", "No publish error", !website.last_error, website.last_error ? String(website.last_error).replace(/_/g, " ") : "Clear", "warning"),
      customDomain
        ? check("dns", "Custom-domain DNS", ["verified", "configured", "active"].includes(String(website.dns_status || "").toLowerCase()), String(website.dns_status || "pending"), "critical")
        : check("subdomain", "TheOutHaven subdomain", Boolean(website.platform_domain), website.platform_domain || "Not assigned", "critical"),
      customDomain
        ? check("ssl", "Custom-domain SSL", String(website.ssl_status || "").toLowerCase() === "active", String(website.ssl_status || "pending"), "critical")
        : check("ssl", "HTTPS", Boolean(website.platform_domain), website.platform_domain ? "Managed wildcard HTTPS" : "Not ready", "critical"),
    ];

    if (usesIncludedDomain) {
      checks.push(
        check("opensrs_registration", "Included domain registration", String(location.included_domain_status || "").toLowerCase() === "active", `${openSrsDomain} · ${location.included_domain_status || "unknown"}`, "critical"),
        check("opensrs_connection", "Included domain connection", String(location.included_domain_connection_status || "").toLowerCase() === "live", String(location.included_domain_connection_status || "not started").replace(/_/g, " "), "critical"),
        check("opensrs_renewal", "Renewal date recorded", Boolean(location.included_domain_renewal_due_at), location.included_domain_renewal_due_at ? new Date(location.included_domain_renewal_due_at).toLocaleDateString() : "Renewal date missing", "warning"),
      );
    }

    const criticalFailed = checks.some((item) => item.severity === "critical" && !item.ok);
    const warningFailed = checks.some((item) => item.severity === "warning" && !item.ok);
    const score = Math.round((checks.filter((item) => item.ok).length / Math.max(checks.length, 1)) * 100);
    return {
      websiteId: String(website.id),
      locationId: String(website.location_id),
      locationName: String(location.name || location.title || website.platform_domain || website.domain || "Location"),
      domain: website.domain || null,
      platformDomain: website.platform_domain || null,
      liveAddress,
      publishedVersion: version,
      checks,
      score,
      state: criticalFailed ? "blocked" : warningFailed ? "attention" : "healthy",
    };
  });
}
