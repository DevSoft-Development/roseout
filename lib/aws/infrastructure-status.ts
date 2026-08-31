import "server-only";

import { createHmac } from "node:crypto";

export type InfrastructureHealth = "healthy" | "degraded" | "unhealthy" | "unknown" | "configured";

export type InfrastructureResource = {
  name: string;
  type?: string | null;
  status?: string | null;
  region?: string | null;
  lastUpdatedAt?: string | null;
  detail?: string | null;
};

export type InfrastructureService = {
  provider: "aws" | "supabase" | "vercel";
  id: string;
  name: string;
  health: InfrastructureHealth;
  resourceCount: number;
  region?: string | null;
  lastUpdatedAt?: string | null;
  lastCheckedAt: string;
  detail?: string | null;
  resources?: InfrastructureResource[];
};

export type InfrastructureProviderSummary = {
  provider: "aws" | "supabase" | "vercel";
  label: string;
  health: InfrastructureHealth;
  detail?: string | null;
  accountId?: string | null;
  projectId?: string | null;
  region?: string | null;
  lastCheckedAt: string;
  services: InfrastructureService[];
};

export type InfrastructureOverview = {
  ok: boolean;
  checkedAt: string;
  providers: InfrastructureProviderSummary[];
};

type AwsGatewayResponse = {
  ok: boolean;
  checkedAt: string;
  accountId?: string | null;
  region?: string | null;
  health?: InfrastructureHealth;
  detail?: string | null;
  services: InfrastructureService[];
};

const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_G4nFS7P3F4cW3PQn4oQAx6Vf3GIN";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || "team_TzlwC4vdLZiT8kFGuXSoj1em";

function getGatewayConfig() {
  const baseUrl = String(process.env.AWS_PLATFORM_JOB_GATEWAY_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET || "").trim();
  if (!baseUrl || !secret) throw new Error("infrastructure_gateway_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("infrastructure_gateway_requires_https");
  return { baseUrl, secret };
}

async function signedGet<T>(path: string): Promise<T> {
  const { baseUrl, secret } = getGatewayConfig();
  const timestamp = Date.now().toString();
  const payload = [timestamp, "GET", path, ""].join("\n");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
    });
    const data = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) throw new Error((data as { error?: string } | null)?.error || `infrastructure_gateway_http_${response.status}`);
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url: string, headers: Record<string, string> = {}, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error instanceof Error ? error.message : "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

function providerHealth(services: InfrastructureService[]): InfrastructureHealth {
  if (services.some((service) => service.health === "unhealthy")) return "unhealthy";
  if (services.some((service) => service.health === "degraded")) return "degraded";
  if (services.some((service) => service.health === "healthy")) return "healthy";
  if (services.some((service) => service.health === "configured")) return "configured";
  return "unknown";
}

function supabaseRegion(projectRef: string | null) {
  if (projectRef === "ftdsltatyqhtllyyefzp") return "us-east-1";
  if (projectRef === "hnhbzynoyrhjndefbwkh") return "us-west-2";
  return null;
}

async function getSupabaseProvider(): Promise<InfrastructureProviderSummary> {
  const checkedAt = new Date().toISOString();
  const baseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const publishableKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
  const apiKey = serviceKey || publishableKey;
  const projectRef = (() => {
    try { return new URL(baseUrl).hostname.split(".")[0] || null; } catch { return null; }
  })();
  const region = supabaseRegion(projectRef);

  if (!baseUrl || !apiKey) {
    return {
      provider: "supabase",
      label: "Supabase",
      health: "unknown",
      projectId: projectRef,
      region,
      lastCheckedAt: checkedAt,
      detail: "Supabase runtime configuration is unavailable to this deployment.",
      services: [],
    };
  }

  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
  const [auth, dataApi, storage, functions] = await Promise.all([
    fetchJson(`${baseUrl}/auth/v1/health`, { apikey: apiKey }),
    fetchJson(`${baseUrl}/rest/v1/`, headers),
    fetchJson(`${baseUrl}/storage/v1/bucket`, headers),
    fetchJson(`${baseUrl}/functions/v1/health-check`, headers),
  ]);

  const services: InfrastructureService[] = [
    {
      provider: "supabase", id: "database-data-api", name: "Database & Data API",
      health: dataApi.ok ? "healthy" : "unhealthy", resourceCount: 1, region, lastCheckedAt: checkedAt,
      detail: dataApi.ok ? "PostgREST reached the production database successfully." : `Data API probe returned ${dataApi.status || "no response"}.`,
      resources: [{ name: projectRef || "production", type: "PostgreSQL / PostgREST", status: dataApi.ok ? "ACTIVE_HEALTHY" : "UNHEALTHY", region }],
    },
    {
      provider: "supabase", id: "auth", name: "Auth",
      health: auth.ok ? "healthy" : "unhealthy", resourceCount: 1, region, lastCheckedAt: checkedAt,
      detail: auth.ok ? "GoTrue health endpoint is responding." : `Auth health probe returned ${auth.status || "no response"}.`,
      resources: [{ name: "Supabase Auth", type: "GoTrue", status: auth.ok ? "ACTIVE_HEALTHY" : "UNHEALTHY", region, detail: auth.body && typeof auth.body === "object" && "version" in auth.body ? `Version ${String((auth.body as { version?: unknown }).version || "unknown")}` : null }],
    },
    {
      provider: "supabase", id: "storage", name: "Storage",
      health: storage.ok ? "healthy" : "unhealthy", resourceCount: Array.isArray(storage.body) ? storage.body.length : 1, region, lastCheckedAt: checkedAt,
      detail: storage.ok ? "Storage API is reachable with the production service credential." : `Storage probe returned ${storage.status || "no response"}.`,
      resources: Array.isArray(storage.body) ? storage.body.slice(0, 50).map((bucket: unknown) => {
        const value = bucket as { name?: string; id?: string; updated_at?: string; public?: boolean };
        return { name: value.name || value.id || "bucket", type: "Storage bucket", status: "available", region, lastUpdatedAt: value.updated_at || null, detail: value.public ? "Public bucket" : "Private bucket" };
      }) : [{ name: "Storage API", type: "Storage", status: storage.ok ? "ACTIVE_HEALTHY" : "UNHEALTHY", region }],
    },
    {
      provider: "supabase", id: "edge-functions", name: "Edge Functions",
      health: functions.ok ? "healthy" : functions.status === 404 ? "configured" : "degraded", resourceCount: 1, region, lastCheckedAt: checkedAt,
      detail: functions.ok ? "Production health-check Edge Function is responding." : functions.status === 404 ? "Edge Functions are configured; the health-check function was not found at this endpoint." : `Edge Function probe returned ${functions.status || "no response"}.`,
      resources: [{ name: "health-check", type: "Edge Function", status: functions.ok ? "ACTIVE" : functions.status === 404 ? "not found" : "probe failed", region }],
    },
    {
      provider: "supabase", id: "realtime", name: "Realtime",
      health: "configured", resourceCount: 1, region, lastCheckedAt: checkedAt,
      detail: "Realtime is configured on the production project. Platform-level service health requires the Supabase Management API; this dashboard does not fabricate a WebSocket health result.",
      resources: [{ name: projectRef || "production", type: "Realtime", status: "configured", region, detail: "Postgres Changes / Realtime publication is managed separately." }],
    },
  ];

  const managementToken = String(process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_MANAGEMENT_API_TOKEN || "").trim();
  if (managementToken && projectRef) {
    const management = await fetchJson(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/health`, { Authorization: `Bearer ${managementToken}` });
    if (management.ok && Array.isArray(management.body)) {
      for (const item of management.body) {
        const status = item as { name?: string; service?: string; status?: string };
        const name = String(status.name || status.service || "service");
        const matching = services.find((service) => service.id.includes(name.toLowerCase().replace(/[^a-z0-9]+/g, "-")) || service.name.toLowerCase().includes(name.toLowerCase()));
        if (matching && status.status) matching.health = status.status === "ACTIVE_HEALTHY" ? "healthy" : "degraded";
      }
    }
  }

  return {
    provider: "supabase",
    label: "Supabase",
    health: providerHealth(services),
    projectId: projectRef,
    region,
    lastCheckedAt: checkedAt,
    detail: `Production primary ${projectRef || "project"}. Virginia remains the writable primary; operational probes are read-only.`,
    services,
  };
}

async function getVercelProvider(): Promise<InfrastructureProviderSummary> {
  const checkedAt = new Date().toISOString();
  const token = String(process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || "").trim();
  const currentUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "theouthaven.com";
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || null;
  const branch = process.env.VERCEL_GIT_COMMIT_REF || null;
  const runtimeHealth: InfrastructureService = {
    provider: "vercel", id: "runtime", name: "Production Runtime",
    health: currentUrl ? "healthy" : "unknown", resourceCount: 1, region: "iad1", lastCheckedAt: checkedAt,
    detail: currentUrl ? `Current deployment runtime is active at ${currentUrl}.` : "Vercel runtime metadata is unavailable.",
    resources: [{ name: currentUrl || "current deployment", type: "Next.js deployment", status: process.env.VERCEL_ENV || "production", region: "iad1", detail: [branch ? `Branch ${branch}` : null, commit ? `Commit ${commit.slice(0, 12)}` : null].filter(Boolean).join(" · ") || null }],
  };

  if (!token) {
    const services: InfrastructureService[] = [
      runtimeHealth,
      {
        provider: "vercel", id: "deployment-api", name: "Deployment Inventory",
        health: "configured", resourceCount: 0, lastCheckedAt: checkedAt,
        detail: "The runtime is healthy, but a Vercel API token has not been exposed to this server process. Add/import the Vercel token in Credentials Vault and wire it to runtime telemetry for full deployment history.",
      },
    ];
    return { provider: "vercel", label: "Vercel", health: providerHealth(services), projectId: VERCEL_PROJECT_ID, region: "iad1", lastCheckedAt: checkedAt, detail: "TheOutHaven Next.js application hosting and deployments.", services };
  }

  const auth = { Authorization: `Bearer ${token}` };
  const teamQuery = VERCEL_TEAM_ID ? `&teamId=${encodeURIComponent(VERCEL_TEAM_ID)}` : "";
  const [deployments, domains] = await Promise.all([
    fetchJson(`https://api.vercel.com/v13/deployments?projectId=${encodeURIComponent(VERCEL_PROJECT_ID)}&limit=20&target=production${teamQuery}`, auth),
    fetchJson(`https://api.vercel.com/v9/projects/${encodeURIComponent(VERCEL_PROJECT_ID)}/domains?limit=100${teamQuery}`, auth),
  ]);

  const deploymentRows = Array.isArray((deployments.body as { deployments?: unknown[] } | null)?.deployments) ? (deployments.body as { deployments: Array<Record<string, unknown>> }).deployments : [];
  const latest = deploymentRows[0];
  const deploymentHealth: InfrastructureHealth = latest && String(latest.state || latest.readyState || "").toUpperCase() === "READY" ? "healthy" : deployments.ok ? "degraded" : "unhealthy";
  const domainRows = Array.isArray((domains.body as { domains?: unknown[] } | null)?.domains) ? (domains.body as { domains: Array<Record<string, unknown>> }).domains : [];

  const services: InfrastructureService[] = [
    runtimeHealth,
    {
      provider: "vercel", id: "deployments", name: "Production Deployments", health: deploymentHealth,
      resourceCount: deploymentRows.length, region: "iad1", lastCheckedAt: checkedAt,
      lastUpdatedAt: latest ? new Date(Number(latest.created || latest.createdAt || Date.now())).toISOString() : null,
      detail: deployments.ok ? "Recent production deployments from the Vercel deployment API." : `Vercel deployment API returned ${deployments.status || "no response"}.`,
      resources: deploymentRows.map((deployment) => ({
        name: String(deployment.url || deployment.uid || deployment.id || "deployment"),
        type: "Deployment",
        status: String(deployment.state || deployment.readyState || "unknown"),
        region: "iad1",
        lastUpdatedAt: deployment.created || deployment.createdAt ? new Date(Number(deployment.created || deployment.createdAt)).toISOString() : null,
        detail: deployment.meta && typeof deployment.meta === "object" ? String((deployment.meta as Record<string, unknown>).githubCommitMessage || (deployment.meta as Record<string, unknown>).githubCommitSha || "") : null,
      })),
    },
    {
      provider: "vercel", id: "domains", name: "Domains", health: domains.ok ? "healthy" : "degraded",
      resourceCount: domainRows.length, lastCheckedAt: checkedAt,
      detail: domains.ok ? "Domains attached to the production Vercel project." : `Vercel domain API returned ${domains.status || "no response"}.`,
      resources: domainRows.map((domain) => ({
        name: String(domain.name || "domain"), type: "Domain", status: String(domain.verified === false ? "verification required" : "configured"),
        lastUpdatedAt: domain.updatedAt ? new Date(Number(domain.updatedAt)).toISOString() : null,
        detail: domain.redirect ? `Redirects to ${String(domain.redirect)}` : null,
      })),
    },
  ];

  return { provider: "vercel", label: "Vercel", health: providerHealth(services), projectId: VERCEL_PROJECT_ID, region: "iad1", lastCheckedAt: checkedAt, detail: "TheOutHaven web application, domains, and production deployment history.", services };
}

async function getAwsProvider(): Promise<InfrastructureProviderSummary> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await signedGet<AwsGatewayResponse>("/v1/infrastructure/aws");
    return {
      provider: "aws",
      label: "AWS",
      health: result.health || providerHealth(result.services || []),
      accountId: result.accountId || null,
      region: result.region || "us-east-1",
      lastCheckedAt: result.checkedAt || checkedAt,
      detail: result.detail || "Live AWS resource inventory from the HMAC-authenticated platform gateway.",
      services: result.services || [],
    };
  } catch (error) {
    return {
      provider: "aws", label: "AWS", health: "unknown", region: "us-east-1", lastCheckedAt: checkedAt,
      detail: error instanceof Error ? `AWS inventory unavailable: ${error.message}` : "AWS inventory unavailable.",
      services: [],
    };
  }
}

export async function getInfrastructureOverview(): Promise<InfrastructureOverview> {
  const checkedAt = new Date().toISOString();
  const [aws, supabase, vercel] = await Promise.all([getAwsProvider(), getSupabaseProvider(), getVercelProvider()]);
  return { ok: true, checkedAt, providers: [aws, supabase, vercel] };
}
