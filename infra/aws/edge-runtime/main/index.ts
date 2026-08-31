// @ts-nocheck
import { GetSecretValueCommand, SecretsManagerClient } from "npm:@aws-sdk/client-secrets-manager@3.864.0";

console.log("TheOutHaven AWS edge runtime router started");

const secretsClient = new SecretsManagerClient({});
const secretId = Deno.env.get("EDGE_RUNTIME_SECRET_ID") || "";
const drSecretId = Deno.env.get("DR_RUNTIME_SECRET_ID") || "";
let runtimeEnvPromise: Promise<Record<string, string>> | null = null;
let drRuntimeEnvPromise: Promise<Record<string, string>> | null = null;

const AWS_WORKER_ENV_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_SECURITY_TOKEN",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
];

const NO_VERIFY_JWT = new Set([
  "health-check",
  "nightly-photo-backfill",
  "nightly-search-profile-queue",
  "admin-cron-digest-email",
  "beta-tester-reminders",
  "nightly-demo-reset",
  "team-session-watchdog",
  "admin-giveaway-review-reminder",
  "reservation-daily-digest",
  "reservation-status-cleanup",
  "reservation-reminder-cron",
  "job-worker",
  "worker-dispatcher",
  "operations-worker",
  "location-health-runner",
  "fraud-sweep",
  "fraud-signal",
  "google-location-enrichment",
  "support-automation-worker",
  "support-learning-worker",
  "reservation-sms-phrase-learning",
  "claim-qr-repair-worker",
  "unified-location-gap-repair",
  "billing-reconciliation",
  "career-automation-worker",
  "admin-daily-marketing-pulse",
  "admin-platform-error-digest",
  "admin-search-health-digest",
  "admin-marketing-report-scheduler",
  "aws-db-maintenance",
  "dr-standby-reconciler",
  "dr-failback-reconciler",
]);

const GOOGLE_PLACES_DEPENDENT_FUNCTIONS = new Set([
  "google-location-enrichment",
  "nightly-photo-backfill",
  "unified-location-gap-repair",
]);

const CRON_SECRET_BY_FUNCTION: Record<string, string> = {
  "google-location-enrichment": "GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET",
};

async function readSecretEnv(id: string): Promise<Record<string, string>> {
  if (!id) return {};
  const secret = await secretsClient.send(new GetSecretValueCommand({ SecretId: id }));
  const parsed = JSON.parse(secret.SecretString || "{}") as Record<string, unknown>;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" && value) values[key] = value;
  }
  return values;
}

async function loadDrRuntimeEnv(): Promise<Record<string, string>> {
  if (drRuntimeEnvPromise) return drRuntimeEnvPromise;
  drRuntimeEnvPromise = readSecretEnv(drSecretId);
  return drRuntimeEnvPromise;
}

async function loadRuntimeEnv(): Promise<Record<string, string>> {
  if (runtimeEnvPromise) return runtimeEnvPromise;
  runtimeEnvPromise = (async () => {
    const base = Deno.env.toObject();
    const secret = await readSecretEnv(secretId);
    const merged: Record<string, string> = { ...base, ...secret };
    const dr = await loadDrRuntimeEnv();
    const primaryMode = dr.DR_MODE || "virginia_primary";
    merged.DR_PRIMARY_MODE = primaryMode;

    if (primaryMode === "oregon_primary") {
      const oregonUrl = dr.DR_OREGON_URL;
      const oregonServiceRole = dr.DR_OREGON_SERVICE_ROLE_KEY;
      const oregonAnon = dr.DR_OREGON_ANON_KEY;
      if (!oregonUrl || !oregonServiceRole || !oregonAnon) {
        throw new Error("oregon_primary runtime routing is missing Oregon Supabase credentials");
      }
      merged.SUPABASE_URL = oregonUrl;
      merged.UPSTREAM_SUPABASE_URL = oregonUrl;
      merged.NEXT_PUBLIC_SUPABASE_URL = oregonUrl;
      merged.SUPABASE_SERVICE_ROLE_KEY = oregonServiceRole;
      merged.SUPABASE_ANON_KEY = oregonAnon;
      merged.NEXT_PUBLIC_SUPABASE_ANON_KEY = oregonAnon;
    } else if (primaryMode === "promotion_in_progress" || primaryMode === "failback_in_progress") {
      merged.DR_TRAFFIC_FENCED = "true";
    } else if (primaryMode !== "virginia_primary") {
      merged.DR_TRAFFIC_FENCED = "true";
      merged.DR_PRIMARY_MODE = "unknown";
    }

    if (!merged.ADMIN_EMAIL) {
      merged.ADMIN_EMAIL = merged.THEOUTHAVEN_ADMIN_EMAIL || "admin@theouthaven.com";
    }
    return merged;
  })();
  return runtimeEnvPromise;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function serviceNameFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "functions" && parts[1] === "v1") return parts[2] || "";
  return parts[0] || "";
}

function isSupabaseProxyPath(pathname: string): boolean {
  return ["/rest/v1/", "/auth/v1/", "/storage/v1/"].some((prefix) => pathname.startsWith(prefix));
}

async function proxyToSupabase(req: Request, env: Record<string, string>): Promise<Response> {
  const upstream = env.UPSTREAM_SUPABASE_URL || env.SUPABASE_URL;
  if (!upstream) return json({ ok: false, error: "missing_upstream_supabase_url" }, 500);

  const source = new URL(req.url);
  const base = new URL(upstream);
  source.protocol = base.protocol;
  source.host = base.host;

  const headers = new Headers(req.headers);
  for (const header of ["host", "connection", "content-length", "transfer-encoding"]) {
    headers.delete(header);
  }

  const body = req.method === "GET" || req.method === "HEAD"
    ? undefined
    : await req.arrayBuffer();

  return await fetch(source, {
    method: req.method,
    headers,
    body,
    redirect: "manual",
  });
}

async function verifyCaller(req: Request, env: Record<string, string>): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const url = env.UPSTREAM_SUPABASE_URL || env.SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: anon },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function trustedInternalRequest(req: Request, env: Record<string, string>): boolean {
  if (req.headers.get("x-toh-aws-internal") === "eventbridge" ||
      req.headers.get("x-toh-aws-internal") === "worker") return true;
  const workerSecret = env.WORKER_INTERNAL_SECRET;
  return Boolean(workerSecret) && req.headers.get("x-worker-secret") === workerSecret;
}

function augmentInternalHeaders(
  req: Request,
  serviceName: string,
  env: Record<string, string>,
): Headers {
  const headers = new Headers(req.headers);
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole) {
    headers.set("authorization", `Bearer ${serviceRole}`);
    headers.set("apikey", serviceRole);
  }
  if (env.WORKER_INTERNAL_SECRET) {
    headers.set("x-worker-secret", env.WORKER_INTERNAL_SECRET);
  }
  const requestedCronSecret = CRON_SECRET_BY_FUNCTION[serviceName];
  const cronSecret = requestedCronSecret ? env[requestedCronSecret] : env.CRON_SECRET;
  if (cronSecret) headers.set("x-cron-secret", cronSecret);
  return headers;
}

async function functionImportMap(servicePath: string): Promise<string | undefined> {
  for (const fileName of ["deno.json", "deno.jsonc", "import_map.json"]) {
    const candidate = `${servicePath}/${fileName}`;
    try {
      const stat = await Deno.stat(candidate);
      if (stat.isFile) return candidate;
    } catch {
      // No per-function import map. Remote/npm/jsr imports continue to work normally.
    }
  }
  return undefined;
}

async function buildWorkerEnv(serviceName: string, env: Record<string, string>): Promise<Record<string, string>> {
  if (serviceName === "dr-standby-reconciler" || serviceName === "dr-failback-reconciler") {
    const base = Deno.env.toObject();
    const drEnv = await loadDrRuntimeEnv();
    const restricted: Record<string, string> = {
      ...drEnv,
      SUPABASE_FUNCTION_SLUG: serviceName,
      DR_STORAGE_TOMBSTONE_TABLE: base.DR_STORAGE_TOMBSTONE_TABLE || "",
    };
    for (const key of AWS_WORKER_ENV_KEYS) {
      if (base[key]) restricted[key] = base[key];
    }
    return restricted;
  }

  const normal: Record<string, string> = { ...env, SUPABASE_FUNCTION_SLUG: serviceName };
  // User workers do not need the Lambda execution credentials. Keep AWS credentials
  // in the trusted main router, except for dedicated DR workers which use the isolated
  // DR Secrets Manager payload and narrowly scoped Lambda execution role.
  for (const key of AWS_WORKER_ENV_KEYS) delete normal[key];
  delete normal.EDGE_RUNTIME_SECRET_ID;
  delete normal.DR_RUNTIME_SECRET_ID;
  delete normal.DR_STORAGE_TOMBSTONE_TABLE;
  return normal;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname === "/healthz" || url.pathname === "/") {
    return json({ ok: true, runtime: "aws-supabase-edge-runtime" });
  }

  const env = await loadRuntimeEnv();
  const serviceName = serviceNameFromPath(url.pathname);
  const drService = serviceName === "dr-standby-reconciler" || serviceName === "dr-failback-reconciler";

  if (env.DR_TRAFFIC_FENCED === "true") {
    if (isSupabaseProxyPath(url.pathname) || (serviceName && !drService)) {
      return json({
        ok: false,
        error: "dr_primary_transition_in_progress",
        mode: env.DR_PRIMARY_MODE || "unknown",
      }, 503);
    }
  }

  if (isSupabaseProxyPath(url.pathname)) {
    return await proxyToSupabase(req, env);
  }

  if (!serviceName || serviceName === "main" || serviceName.startsWith("_")) {
    return json({ ok: false, error: "invalid_function_name" }, 400);
  }

  if (!env.GOOGLE_PLACES_API_KEY && GOOGLE_PLACES_DEPENDENT_FUNCTIONS.has(serviceName)) {
    return json({
      success: true,
      skipped: true,
      reason: "google_places_api_key_not_configured",
      service: serviceName,
    });
  }

  const isInternal = trustedInternalRequest(req, env);
  if (!isInternal && !NO_VERIFY_JWT.has(serviceName)) {
    if (!(await verifyCaller(req, env))) {
      return json({ ok: false, error: "invalid_jwt" }, 401);
    }
  }

  const headers = isInternal
    ? augmentInternalHeaders(req, serviceName, env)
    : new Headers(req.headers);
  const forwarded = new Request(req, { headers });
  const servicePath = `/home/deno/functions/${serviceName}`;
  const envVarsObj = await buildWorkerEnv(serviceName, env);

  if (serviceName === "worker-dispatcher") {
    envVarsObj.UPSTREAM_SUPABASE_URL = env.UPSTREAM_SUPABASE_URL || env.SUPABASE_URL;
    envVarsObj.SUPABASE_URL = "http://127.0.0.1:8080";
  }

  const envVars = Object.entries(envVarsObj);
  const importMapPath = await functionImportMap(servicePath);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 512,
      workerTimeoutMs: 115_000,
      noModuleCache: false,
      ...(importMapPath ? { importMapPath } : {}),
      envVars,
    });
    return await worker.fetch(forwarded);
  } catch (error) {
    console.error("edge runtime worker failure", { serviceName, error });
    return json({
      ok: false,
      error: "worker_boot_or_execution_failure",
      service: serviceName,
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});