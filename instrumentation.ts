import type { Instrumentation } from "next";

const SENSITIVE = /(authorization|bearer\s+[a-z0-9._-]+|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|card|cookie)/gi;

function redact(value: unknown, max = 8000) {
  return String(value ?? "")
    .replace(SENSITIVE, "[redacted]")
    .slice(0, max);
}

function normalizeError(value: unknown) {
  const error = value instanceof Error ? value : new Error(typeof value === "string" ? value : "Unhandled server error");
  const digestValue = value && typeof value === "object" && "digest" in value
    ? (value as { digest?: unknown }).digest
    : null;
  const digest = typeof digestValue === "string" ? digestValue : "";
  return { error, digest };
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { hydrateCredentialVaultRuntime } = await import("@/lib/admin/credential-vault-runtime-source");
    await hydrateCredentialVaultRuntime();
  } catch (error) {
    console.error("credential_vault_startup_hydration_failed", error instanceof Error ? error.message : "unknown_error");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRole) return;

    const { error, digest } = normalizeError(err);
    const message = redact(error.message || "Unhandled server error", 2000);
    const route = redact(request.path?.split("?")[0] || context.routePath || "unknown", 500);
    const fingerprint = `${context.routeType}|${route}|${digest || message}`.slice(0, 1000);

    await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/platform_error_events`, {
      method: "POST",
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
        error_type: `next_${context.routeType}_error`,
        severity: "error",
        message,
        user_visible: context.routeType === "render",
        route,
        source: `next:${context.routerKind}:${context.renderSource || context.routeType}`,
        fingerprint,
        stack: redact(error.stack || "", 8000),
        metadata: {
          digest: redact(digest, 200),
          route_type: context.routeType,
          router_kind: context.routerKind,
          render_source: context.renderSource || null,
          revalidate_reason: context.revalidateReason || null,
        },
      }),
    });
  } catch {
    // Error instrumentation must never make the original request fail harder.
  }
};
