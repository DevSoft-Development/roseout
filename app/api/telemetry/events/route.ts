import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MAX_BODY = 16_384;
const ALLOWED = new Set([
  "page_view","session_start","session_heartbeat","session_end",
  "runtime_error","unhandled_rejection","user_visible_error","console_error",
  "api_error","integration_error","recovered_error",
]);
const PRIVATE_KEY = /email|phone|password|card|token|secret|authorization|cookie|notes?/i;

function cleanString(value: unknown, max = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return null;
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 1000);
  if (Array.isArray(value)) return value.slice(0, 25).map((v) => sanitize(v, depth + 1));
  if (typeof value !== "object") return null;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([k]) => !PRIVATE_KEY.test(k)).slice(0, 50)
    .map(([k, v]) => [k.slice(0, 64), sanitize(v, depth + 1)]));
}

function isBot(ua: string) {
  return /bot|spider|crawler|headlesschrome|curl\/|wget\/|python-requests/i.test(ua);
}

export async function POST(req: NextRequest) {
  try {
    const length = Number(req.headers.get("content-length") || 0);
    if (length > MAX_BODY) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    if (isBot(req.headers.get("user-agent") || "")) return NextResponse.json({ ok: true, ignored: true });

    const raw = await req.text();
    if (!raw || raw.length > MAX_BODY) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const eventType = cleanString(body.event_type, 64);
    if (!eventType || !ALLOWED.has(eventType)) return NextResponse.json({ ok: false, error: "invalid_event_type" }, { status: 400 });

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const { data } = await supabase.auth.getUser(authHeader.slice(7));
      userId = data.user?.id ?? null;
    }

    const { error } = await supabase.from("platform_telemetry_events").insert({
      event_type: eventType,
      event_name: cleanString(body.event_name, 128) || eventType,
      session_id: cleanString(body.session_id, 128),
      anonymous_id: cleanString(body.anonymous_id, 128),
      user_id: userId,
      page_path: cleanString(body.page_path, 512),
      source: cleanString(body.source, 128) || "web_client",
      severity: cleanString(body.severity, 32),
      message: cleanString(body.message, 1000),
      error_code: cleanString(body.error_code, 128),
      component: cleanString(body.component, 256),
      metadata: sanitize(body.metadata) ?? {},
      occurred_at: new Date().toISOString(),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PLATFORM_TELEMETRY_INGEST_FAILED", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: true, accepted: false }, { status: 202 });
  }
}
