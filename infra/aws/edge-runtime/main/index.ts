import { GetSecretValueCommand, SecretsManagerClient } from "npm:@aws-sdk/client-secrets-manager@3.864.0";

console.log("TheOutHaven AWS edge runtime router started");

const secretsClient = new SecretsManagerClient({});
const secretId = Deno.env.get("EDGE_RUNTIME_SECRET_ID") || "";
let runtimeEnvPromise: Promise<Record<string, string>> | null = null;

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
]);

const CRON_SECRET_BY_FUNCTION: Record<string, string> = {
  "google-location-enrichment": "GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET",
  "reservation-daily-digest": "RESERVATION_CRON_SECRET",
  "reservation-reminder-cron": "RESERVATION_CRON_SECRET",
  "reservation-status-cleanup": "RESERVATION_CRON_SECRET",
  "reservation-sms-phrase-learning": "RESERVATION_CRON_SECRET",
  "unified-location-gap-repair": "RESERVATION_CRON_SECRET",
};

async function loadRuntimeEnv(): Promise<Record<string, string>> {
  if (runtimeEnvPromise) return runtimeEnvPromise;
  runtimeEnvPromise = (async () => {
    const base = Deno.env.toObject();
    if (!secretId) return base;
    const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
    const raw = response.SecretString || "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const merged: Record<string, string> = { ...base };
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) merged[key] = value;
    }
    merged.EDGE_FUNCTION_BASE_URL = "http://127.0.0.1:8080";
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

async function verifyCaller(req: Request, env: Record<string, string>): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const url = env.SUPABASE_URL;
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

function internalRequest(req: Request): boolean {
  return req.headers.get("x-toh-aws-internal") === "eventbridge" ||
    req.headers.get("x-toh-aws-internal") === "worker";
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
  const cronSecret = requestedCronSecret
    ? env[requestedCronSecret]
    : env.CRON_SECRET;
  if (cronSecret) headers.set("x-cron-secret", cronSecret);
  return headers;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname === "/healthz" || url.pathname === "/") {
    return json({ ok: true, runtime: "aws-supabase-edge-runtime" });
  }

  const serviceName = serviceNameFromPath(url.pathname);
  if (!serviceName || serviceName === "main" || serviceName.startsWith("_")) {
    return json({ ok: false, error: "invalid_function_name" }, 400);
  }

  const env = await loadRuntimeEnv();
  const isInternal = internalRequest(req);
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
  const envVarsObj = { ...env, SUPABASE_FUNCTION_SLUG: serviceName };
  const envVars = Object.entries(envVarsObj);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 512,
      workerTimeoutMs: 115_000,
      noModuleCache: false,
      importMapPath: "/home/deno/functions/deno.jsonc",
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
