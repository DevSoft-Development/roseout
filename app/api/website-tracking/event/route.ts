import { NextRequest, NextResponse } from "next/server";
import { EXTERNAL_EVENT_NAMES, getWebsiteTrackingBySiteKey, isAllowedOrigin, recordExternalEvent, type ExternalEventName } from "@/lib/analytics/conversion-attribution";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_BODY_BYTES = 16_000;

type SafeMetadataValue = string | number | boolean | null;

function cors(origin: string | null) {
  return {
    "access-control-allow-origin": origin || "null",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

function safeMetadataValue(value: unknown): SafeMetadataValue {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return null;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ success: false, error: "Payload too large" }, { status: 413, headers: cors(origin) });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400, headers: cors(origin) }); }

  const siteKey = typeof body?.site_key === "string" ? body.site_key : "";
  const eventName = typeof body?.event_name === "string" ? body.event_name as ExternalEventName : null;
  if (!siteKey || !eventName || !EXTERNAL_EVENT_NAMES.includes(eventName)) {
    return NextResponse.json({ success: false, error: "Invalid event" }, { status: 400, headers: cors(origin) });
  }

  const config = await getWebsiteTrackingBySiteKey(siteKey);
  if (!config?.enabled) return NextResponse.json({ success: false, error: "Tracking disabled" }, { status: 403, headers: cors(origin) });
  if (!isAllowedOrigin(origin, Array.isArray(config.allowed_origins) ? config.allowed_origins : [])) {
    return NextResponse.json({ success: false, error: "Origin not allowed" }, { status: 403, headers: cors(origin) });
  }

  const metadata: Record<string, SafeMetadataValue> = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? Object.fromEntries(Object.entries(body.metadata).slice(0, 20).map(([key, value]) => [String(key).slice(0, 80), safeMetadataValue(value)]))
    : {};

  await recordExternalEvent({
    locationId: config.location_id,
    eventName,
    attributionToken: typeof body?.attribution_token === "string" ? body.attribution_token : null,
    pageUrl: typeof body?.page_url === "string" ? body.page_url.slice(0, 2000) : null,
    referrer: typeof body?.referrer === "string" ? body.referrer.slice(0, 2000) : null,
    sessionId: typeof body?.session_id === "string" ? body.session_id.slice(0, 128) : null,
    metadata,
  });

  await supabaseAdmin.from("location_website_tracking").update({
    last_seen_at: new Date().toISOString(),
    verified_at: config.verified_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("site_key", siteKey);

  return NextResponse.json({ success: true }, { headers: cors(origin) });
}
