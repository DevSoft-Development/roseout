import { NextResponse } from "next/server";

import { trackEvent, isUuid } from "@/lib/analytics/trackEvent";
import { buildAnalyticsFeedbackEvent } from "@/lib/ml/buildAnalyticsFeedbackEvent";
import { classifySearchIntent } from "@/lib/ml/intentBuckets";
import { createClient } from "@/lib/supabase-server";

const MAX_BODY = 16_384;

const privateKey =
  /email|phone_number|phone|password|card|token|secret|notes?/i;

function cleanString(value: unknown, max = 256): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function cleanNumber(
  value: unknown,
  min = -1_000_000_000,
  max = 1_000_000_000,
): number | null {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(max, Math.max(min, parsed));
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return null;
  }

  if (typeof value === "string") {
    return value.slice(0, 500);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 25)
      .map((entry) => sanitize(entry, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !privateKey.test(key))
      .slice(0, 50)
      .map(([key, entry]) => [
        key.slice(0, 64),
        sanitize(entry, depth + 1),
      ]),
  );
}

function isBotUserAgent(userAgent: string): boolean {
  return /(?:bot|spider|crawler|headlesschrome|curl\/|wget\/|python-requests)/i.test(
    userAgent,
  );
}

export async function POST(request: Request) {
  const contentLength = Number(
    request.headers.get("content-length") || 0,
  );

  if (contentLength > MAX_BODY) {
    return NextResponse.json(
      { ok: false, error: "payload_too_large" },
      { status: 413 },
    );
  }

  try {
    const rawBody = await request.text();

    if (!rawBody || rawBody.length > MAX_BODY) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload" },
        { status: 400 },
      );
    }

    let body: Record<string, unknown>;

    try {
      const parsedBody: unknown = JSON.parse(rawBody);

      if (
        !parsedBody ||
        typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return NextResponse.json(
          { ok: false, error: "invalid_payload" },
          { status: 400 },
        );
      }

      body = parsedBody as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid_json" },
        { status: 400 },
      );
    }

    const normalizedEvent = buildAnalyticsFeedbackEvent({
      ...body,
      metadata: sanitize(body.metadata),
    });

    if (!normalizedEvent) {
      return NextResponse.json(
        { ok: false, error: "invalid_event_name" },
        { status: 400 },
      );
    }

    const userAgent = request.headers.get("user-agent") || "";

    if (isBotUserAgent(userAgent)) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const rawQuery =
      cleanString(body.query ?? body.normalized_query, 500) || "";
    const intent = classifySearchIntent(rawQuery);
    const rawLocationId = body.location_id ?? body.locationId;
    const locationId =
      typeof rawLocationId === "string" && isUuid(rawLocationId)
        ? rawLocationId
        : null;

    await trackEvent({
      ...normalizedEvent,
      user_id: user?.id ?? null,
      search_id:
        typeof body.search_id === "string" && isUuid(body.search_id)
          ? body.search_id
          : null,
      outing_id:
        typeof body.outing_id === "string" && isUuid(body.outing_id)
          ? body.outing_id
          : null,
      location_id: locationId,
      source_location_id: cleanString(
        body.source_location_id ?? rawLocationId,
      ),
      anonymous_id: cleanString(body.anonymous_id, 128),
      session_id: cleanString(body.session_id, 128),
      pair_id: cleanString(body.pair_id, 128),
      search_event_id: cleanString(body.search_event_id ?? body.searchEventId, 128),
      result_impression_id: cleanString(body.result_impression_id ?? body.resultImpressionId, 128),
      result_type: cleanString(body.result_type ?? body.resultType, 64),
      rendered_position: cleanNumber(body.rendered_position ?? body.renderedPosition, 0, 10_000),
      seen_position: cleanNumber(body.seen_position ?? body.seenPosition, 0, 10_000),
      lane: cleanString(body.lane, 64),
      base_score: cleanNumber(body.base_score ?? body.baseScore),
      behavioral_boost: cleanNumber(body.behavioral_boost ?? body.behavioralBoost),
      final_score: cleanNumber(body.final_score ?? body.finalScore),
      ranking_version: cleanString(body.ranking_version ?? body.rankingVersion, 128),
      feature_version: cleanString(body.feature_version ?? body.featureVersion, 128),
      experiment_id: cleanString(body.experiment_id ?? body.experimentId, 128),
      market_key: cleanString(body.market_key ?? body.marketKey, 256),
      restaurant_location_id: cleanString(body.restaurant_location_id ?? body.restaurantLocationId, 128),
      activity_location_id: cleanString(body.activity_location_id ?? body.activityLocationId, 128),
      pair_key: cleanString(body.pair_key ?? body.pairKey, 256),
      query: cleanString(body.query, 500),
      normalized_query: cleanString(body.normalized_query, 500),
      query_fingerprint: cleanString(body.query_fingerprint, 128),
      ranking_position: cleanNumber(body.ranking_position, 0, 10_000),
      result_count: cleanNumber(body.result_count, 0, 100_000),
      response_time_ms: cleanNumber(body.response_time_ms, 0, 3_600_000),
      page_path: cleanString(body.page_path),
      referrer: cleanString(body.referrer, 1_000),
      source: cleanString(body.source),
      city: cleanString(body.city),
      borough: cleanString(body.borough),
      neighborhood: cleanString(body.neighborhood),
      search_intent: sanitize({
        ...(body.search_intent &&
        typeof body.search_intent === "object" &&
        !Array.isArray(body.search_intent)
          ? body.search_intent
          : {}),
        primary_intent: intent.primaryIntent,
        all_intents: intent.allIntents,
      }) as NonNullable<
        Parameters<typeof trackEvent>[0]["search_intent"]
      >,
      metadata: sanitize({
        ...(normalizedEvent.metadata &&
        typeof normalizedEvent.metadata === "object" &&
        !Array.isArray(normalizedEvent.metadata)
          ? normalizedEvent.metadata
          : {}),
        invalid_location_id:
          rawLocationId && !locationId
            ? String(rawLocationId).slice(0, 128)
            : undefined,
      }) as NonNullable<Parameters<typeof trackEvent>[0]["metadata"]>,
      is_bot: false,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "THEOUTHAVEN_ANALYTICS_API_FAILED",
      error instanceof Error ? error.message : error,
    );

    return NextResponse.json(
      { ok: true, accepted: false, error: "event_not_accepted" },
      { status: 202 },
    );
  }
}
