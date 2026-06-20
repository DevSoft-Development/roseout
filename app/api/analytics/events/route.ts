import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { classifySearchIntent } from "@/lib/ml/intentBuckets";

const EVENT_NAME_REGEX = /^[a-z0-9_:-]{2,64}$/i;
const MAX_METADATA_BYTES = 4096;

function cleanString(value: unknown, max = 256): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  return v.slice(0, max);
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeObject(value: unknown, maxEntries = 40): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, maxEntries);
  const safe = Object.fromEntries(
    entries
      .map(([k, v]) => [cleanString(k, 64) ?? "", typeof v === "string" ? cleanString(v, 256) : v])
      .filter(([k]) => k),
  );
  const serialized = JSON.stringify(safe);
  return serialized.length <= MAX_METADATA_BYTES ? safe : {};
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const eventName = cleanString(body?.event_name, 64);
    if (!eventName || !EVENT_NAME_REGEX.test(eventName)) {
      return NextResponse.json({ ok: false, error: "invalid_event_name" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();

    const mlIntent = classifySearchIntent(body?.query || body?.normalized_query || body?.metadata?.query || "");

    await trackEvent({
      event_name: eventName,
      event_type: cleanString(body?.event_type),
      user_id: auth?.user?.id ?? null,
      anonymous_id: cleanString(body?.anonymous_id),
      session_id: cleanString(body?.session_id),
      outing_id: cleanString(body?.outing_id),
      location_id: cleanString(body?.location_id),
      source_location_id: cleanString(body?.source_location_id),
      query: cleanString(body?.query),
      normalized_query: cleanString(body?.normalized_query),
      search_intent: sanitizeObject({ ...(body?.search_intent || {}), primary_intent: mlIntent.primaryIntent, secondary_intents: mlIntent.secondaryIntents, all_intents: mlIntent.allIntents, intent_confidence: mlIntent.confidence, inferred_search_mode: mlIntent.inferredSearchMode }),
      page_path: cleanString(body?.page_path),
      referrer: cleanString(body?.referrer),
      source: cleanString(body?.source),
      device_type: cleanString(body?.device_type),
      browser: cleanString(body?.browser),
      os: cleanString(body?.os),
      borough: cleanString(body?.borough),
      city: cleanString(body?.city),
      neighborhood: cleanString(body?.neighborhood),
      location_type: cleanString(body?.location_type),
      category: cleanString(body?.category),
      cuisine: cleanString(body?.cuisine),
      activity_type: cleanString(body?.activity_type),
      ranking_position: cleanNumber(body?.ranking_position),
      result_count: cleanNumber(body?.result_count),
      response_time_ms: cleanNumber(body?.response_time_ms),
      conversion_step: cleanString(body?.conversion_step),
      revenue_impact: cleanNumber(body?.revenue_impact),
      metadata: sanitizeObject({ ...(body?.metadata || {}), primary_intent: mlIntent.primaryIntent, all_intents: mlIntent.allIntents, intent_confidence: mlIntent.confidence, inferred_search_mode: mlIntent.inferredSearchMode }),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
