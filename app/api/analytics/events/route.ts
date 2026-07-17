import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { trackEvent, isUuid } from "@/lib/analytics/trackEvent";
import { buildAnalyticsFeedbackEvent } from "@/lib/ml/buildAnalyticsFeedbackEvent";
import { classifySearchIntent } from "@/lib/ml/intentBuckets";

const MAX_BODY = 16_384;
const privateKey = /email|phone_number|password|card|token|secret|notes?/i;
function string(value: unknown, max = 256) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null; }
function number(value: unknown, min = -1e9, max = 1e9) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; }
function sanitize(value: unknown, depth = 0): any {
  if (depth > 4) return null;
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 25).map(v => sanitize(v, depth + 1));
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !privateKey.test(key)).slice(0, 50).map(([key, val]) => [key.slice(0, 64), sanitize(val, depth + 1)]));
}
function botAgent(agent: string) { return /(?:bot|spider|crawler|headlesschrome|curl\/|wget\/|python-requests)/i.test(agent); }

export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_BODY) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  try {
    const text = await req.text();
    if (!text || text.length > MAX_BODY) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    const normalized = buildAnalyticsFeedbackEvent({ ...body, metadata: sanitize(body.metadata) });
    if (!normalized) return NextResponse.json({ ok: false, error: "invalid_event_name" }, { status: 400 });
    const isBot = botAgent(req.headers.get("user-agent") || "");
    if (isBot) return NextResponse.json({ ok: true, ignored: true });
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const intent = classifySearchIntent(string(body.query ?? body.normalized_query, 500) || "");
    await trackEvent({
      ...normalized,
      user_id: auth.user?.id ?? null,
      search_id: isUuid(body.search_id) ? body.search_id : null,
      outing_id: isUuid(body.outing_id) ? body.outing_id : null,
      location_id: isUuid(body.location_id ?? body.locationId) ? (body.location_id ?? body.locationId) : null,
      source_location_id: string(body.source_location_id ?? body.location_id ?? body.locationId),
      anonymous_id: string(body.anonymous_id, 128), session_id: string(body.session_id, 128), pair_id: string(body.pair_id, 128),
      query: string(body.query, 500), normalized_query: string(body.normalized_query, 500), query_fingerprint: string(body.query_fingerprint, 128),
      ranking_position: number(body.ranking_position, 0, 10000), result_count: number(body.result_count, 0, 100000), response_time_ms: number(body.response_time_ms, 0, 3600000),
      page_path: string(body.page_path), referrer: string(body.referrer, 1000), source: string(body.source), city: string(body.city), borough: string(body.borough), neighborhood: string(body.neighborhood),
      search_intent: sanitize({ ...(body.search_intent || {}), primary_intent: intent.primaryIntent, all_intents: intent.allIntents }),
      metadata: sanitize({ ...(normalized.metadata || {}), invalid_location_id: body.location_id && !isUuid(body.location_id) ? String(body.location_id).slice(0, 128) : undefined }),
      is_bot: false,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("THEOUTHAVEN_ANALYTICS_API_FAILED", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "event_not_accepted" }, { status: 400 });
  }
}
