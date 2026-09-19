import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESULT_TYPES = new Set(["restaurant", "activity", "pair", "matched_location"]);

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
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const sessionId = cleanString((body as any).sessionId ?? (body as any).session_id, 120);
  const searchId = cleanString((body as any).searchId ?? (body as any).search_id, 120);
  const resultType = cleanString((body as any).resultType ?? (body as any).result_type, 40);
  const resultPosition = cleanPosition((body as any).resultPosition ?? (body as any).result_position);

  if (!sessionId || !searchId || !resultType || !RESULT_TYPES.has(resultType) || !resultPosition) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const locationId = cleanUuid((body as any).locationId ?? (body as any).location_id);
  const restaurantLocationId = cleanUuid((body as any).restaurantLocationId ?? (body as any).restaurant_location_id);
  const activityLocationId = cleanUuid((body as any).activityLocationId ?? (body as any).activity_location_id);

  if (!locationId && !(restaurantLocationId && activityLocationId)) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const dedupeKey = [
    searchId,
    sessionId,
    resultType,
    resultPosition,
    locationId || "",
    restaurantLocationId || "",
    activityLocationId || "",
  ].join(":");

  const row = {
    dedupe_key: dedupeKey,
    search_id: searchId,
    session_id: sessionId,
    query_hash: cleanString((body as any).queryHash ?? (body as any).query_hash, 128),
    location_id: locationId,
    restaurant_location_id: restaurantLocationId,
    activity_location_id: activityLocationId,
    result_type: resultType,
    result_position: resultPosition,
    intent_bucket: cleanString((body as any).intentBucket ?? (body as any).intent_bucket, 120),
    market: cleanString((body as any).market, 120),
    ranking_version: cleanString((body as any).rankingVersion ?? (body as any).ranking_version, 120),
    experiment_variant: cleanString((body as any).experimentVariant ?? (body as any).experiment_variant, 120),
    base_score: Number.isFinite(Number((body as any).baseScore)) ? Number((body as any).baseScore) : null,
    phase1_score: Number.isFinite(Number((body as any).phase1Score)) ? Number((body as any).phase1Score) : null,
    phase2_score: Number.isFinite(Number((body as any).phase2Score)) ? Number((body as any).phase2Score) : null,
    final_score: Number.isFinite(Number((body as any).finalScore)) ? Number((body as any).finalScore) : null,
    metadata: {
      source: "public_create",
      schema_version: "search_impression_v1",
    },
  };

  const { error } = await supabaseAdmin
    .from("search_result_impressions")
    .upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true });

  if (error) {
    console.error("THEOUTHAVEN_SEARCH_IMPRESSION_FAILED", error.message);
    return NextResponse.json({ success: false }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
