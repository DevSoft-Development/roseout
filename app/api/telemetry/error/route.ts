import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const MAX_BODY = 32_768;
const SENSITIVE = /(authorization|bearer\s+[a-z0-9._-]+|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|card|cookie)/gi;

function text(value: unknown, max = 2000) {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(SENSITIVE, "[redacted]");
  return clean ? clean.slice(0, max) : null;
}

function safeUrl(value: unknown) {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`.slice(0, 1000);
  } catch {
    return raw.split("?")[0]?.slice(0, 1000) || null;
  }
}

function severity(value: unknown) {
  const normalized = String(value || "error").toLowerCase();
  return ["info", "warning", "error", "critical"].includes(normalized) ? normalized : "error";
}

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    if (/password|secret|token|authorization|cookie|card|email|phone/i.test(key)) continue;
    if (typeof entry === "string") output[key.slice(0, 64)] = entry.replace(SENSITIVE, "[redacted]").slice(0, 500);
    else if (typeof entry === "number" || typeof entry === "boolean" || entry === null) output[key.slice(0, 64)] = entry;
  }
  return output;
}

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413 });
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY) return NextResponse.json({ ok: false }, { status: 400 });
    const body = JSON.parse(raw) as Record<string, unknown>;

    const message = text(body.message, 2000);
    const errorType = text(body.error_type, 128);
    if (!message || !errorType) return NextResponse.json({ ok: false }, { status: 400 });

    const serverClient = await createServerClient();
    const { data: { user } } = await serverClient.auth.getUser();

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRole) return NextResponse.json({ ok: true, accepted: false }, { status: 202 });
    const admin = createSupabaseClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

    const route = text(body.route, 500);
    const eventSeverity = severity(body.severity);
    const fingerprint = text(body.fingerprint, 1000) || `${errorType}|${route || "unknown"}|${message}`.slice(0, 1000);
    const { data: inserted, error } = await admin.from("platform_error_events").insert({
      occurred_at: text(body.occurred_at, 80) || new Date().toISOString(),
      environment: text(body.environment, 64) || process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
      error_type: errorType,
      severity: eventSeverity,
      message,
      user_visible: body.user_visible === true,
      route,
      url: safeUrl(body.url),
      source: text(body.source, 500),
      status_code: Number.isFinite(Number(body.status_code)) ? Number(body.status_code) : null,
      request_id: text(body.request_id, 200),
      user_id: user?.id || null,
      anonymous_id: text(body.anonymous_id, 200),
      session_id: text(body.session_id, 200),
      location_id: typeof body.location_id === "string" && /^[0-9a-f-]{36}$/i.test(body.location_id) ? body.location_id : null,
      fingerprint,
      stack: text(body.stack, 8000),
      metadata: safeMetadata(body.metadata),
    }).select("id").single();

    if (error) {
      console.warn("PLATFORM_ERROR_TELEMETRY_INSERT_FAILED", error.code);
      return NextResponse.json({ ok: true, accepted: false }, { status: 202 });
    }

    if (eventSeverity === "critical" && inserted?.id && process.env.CRON_SECRET) {
      try {
        await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/admin-platform-error-digest`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": process.env.CRON_SECRET,
          },
          body: JSON.stringify({ source: "critical", event_id: inserted.id }),
          cache: "no-store",
        });
      } catch {
        // Critical alert delivery must not interfere with error ingestion.
      }
    }

    return NextResponse.json({ ok: true, accepted: true });
  } catch {
    return NextResponse.json({ ok: true, accepted: false }, { status: 202 });
  }
}
