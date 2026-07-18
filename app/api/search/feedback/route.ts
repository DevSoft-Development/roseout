import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeFeedbackType } from "@/lib/ml/advanced/negativeFeedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESULT_TYPES = new Set(["restaurant", "activity", "pair", "matched_location", "search"]);

function cleanString(value: unknown, max = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function cleanUuid(value: unknown) {
  const text = cleanString(value, 64);
  return text && UUID_RE.test(text) ? text : null;
}

function cleanPosition(value: unknown) {
  const position = Number(value);
  return Number.isInteger(position) && position > 0 && position <= 1000 ? position : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: "Invalid feedback payload." }, { status: 400 });
  }

  if (cleanString((body as any).honeypot, 10)) {
    return NextResponse.json({ success: true, message: "Thanks — we will use that to improve results." });
  }

  const feedbackType = normalizeFeedbackType((body as any).feedbackType ?? (body as any).feedback_type);
  const sessionId = cleanString((body as any).sessionId ?? (body as any).session_id, 120);
  const searchId = cleanString((body as any).searchId ?? (body as any).search_id, 120);
  const resultTypeInput = cleanString((body as any).resultType ?? (body as any).result_type, 40) || "search";
  const resultType = RESULT_TYPES.has(resultTypeInput) ? resultTypeInput : "search";

  if (!sessionId || !searchId) {
    return NextResponse.json({ success: false, message: "Search context is missing." }, { status: 400 });
  }

  const locationId = cleanUuid((body as any).locationId ?? (body as any).location_id);
  const restaurantLocationId = cleanUuid((body as any).restaurantLocationId ?? (body as any).restaurant_location_id);
  const activityLocationId = cleanUuid((body as any).activityLocationId ?? (body as any).activity_location_id);

  if (resultType !== "search" && !locationId && !(restaurantLocationId && activityLocationId)) {
    return NextResponse.json({ success: false, message: "Result identity is missing." }, { status: 400 });
  }

  const dedupeKey = [
    sessionId,
    searchId,
    resultType,
    locationId || "",
    restaurantLocationId || "",
    activityLocationId || "",
  ].join(":");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } } as any));

  const row = {
    dedupe_key: dedupeKey,
    user_id: user?.id || null,
    session_id: sessionId,
    search_id: searchId,
    search_event_id: cleanUuid((body as any).searchEventId ?? (body as any).search_event_id),
    raw_query: cleanString((body as any).rawQuery ?? (body as any).raw_query, 500),
    normalized_query: cleanString((body as any).normalizedQuery ?? (body as any).normalized_query, 500),
    intent_bucket: cleanString((body as any).intentBucket ?? (body as any).intent_bucket, 120),
    location_id: locationId,
    restaurant_location_id: restaurantLocationId,
    activity_location_id: activityLocationId,
    pair_key: cleanString((body as any).pairKey ?? (body as any).pair_key, 180),
    feedback_type: feedbackType,
    feedback_label: cleanString((body as any).feedbackLabel ?? (body as any).feedback_label, 160),
    feedback_note: cleanString((body as any).note, 500),
    market: cleanString((body as any).market, 120),
    result_type: resultType,
    result_position: cleanPosition((body as any).resultPosition ?? (body as any).result_position),
    query_hash: cleanString((body as any).queryHash ?? (body as any).query_hash, 128),
    impression_id: cleanUuid((body as any).impressionId ?? (body as any).impression_id),
    status: "new",
    metadata: {
      source: "public_create",
      schema_version: "search_feedback_v1",
      user_agent_class: req.headers.get("sec-ch-ua-mobile") === "?1" ? "mobile" : "unknown",
    },
  };

  const { error } = await supabaseAdmin
    .from("search_negative_feedback")
    .upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: false });

  if (error) {
    console.error("THEOUTHAVEN_SEARCH_FEEDBACK_FAILED", error.message);
    return NextResponse.json({ success: false, message: "We could not save that feedback yet." }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Thanks — we will use that to improve results." });
}
