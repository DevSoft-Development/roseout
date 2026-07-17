import { supabaseAdmin } from "@/lib/supabase-admin";

type JsonPrimitive =
  | string
  | number
  | boolean
  | null;

type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[];

export type TrackEventInput = {
  event_name?: string | null;
  event_type?: string | null;

  user_id?: string | null;
  anonymous_id?: string | null;
  session_id?: string | null;

  outing_id?: string | null;
  location_id?: string | null;
  source_location_id?: string | null;
  owner_id?: string | null;

  query?: string | null;
  normalized_query?: string | null;
  search_intent?: Record<string, JsonValue> | null;

  page_path?: string | null;
  referrer?: string | null;
  source?: string | null;

  device_type?: string | null;
  browser?: string | null;
  os?: string | null;

  city?: string | null;
  borough?: string | null;
  neighborhood?: string | null;

  location_type?: string | null;
  category?: string | null;
  cuisine?: string | null;
  activity_type?: string | null;

  ranking_position?: number | null;
  result_count?: number | null;
  response_time_ms?: number | null;

  conversion_step?: string | null;
  revenue_impact?: number | null;

  metadata?: Record<string, JsonValue> | null;

  schema_version?: number;
  canonical_event_name?: string | null;

  search_id?: string | null;
  query_fingerprint?: string | null;
  pair_id?: string | null;

  feedback_polarity?: string | null;
  feedback_weight?: number | null;

  dedupe_key?: string | null;
  is_bot?: boolean;

  occurred_at?: string | null;
};

export class AnalyticsEventInsertError extends Error {
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(options: {
    message: string;
    code?: string | null;
    details?: string | null;
    hint?: string | null;
  }) {
    super(options.message);

    this.name = "AnalyticsEventInsertError";
    this.code = options.code ?? null;
    this.details = options.details ?? null;
    this.hint = options.hint ?? null;
  }
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function cleanString(
  value: unknown,
  maxLength = 1_000,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  return cleaned
    ? cleaned.slice(0, maxLength)
    : null;
}

function cleanFiniteNumber(
  value: unknown,
): number | null {
  if (typeof value !== "number") {
    return null;
  }

  return Number.isFinite(value)
    ? value
    : null;
}

function toJsonRecord(
  value: unknown,
): Record<string, JsonValue> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  try {
    return JSON.parse(
      JSON.stringify(value),
    ) as Record<string, JsonValue>;
  } catch {
    return {};
  }
}

function resolveEventName(
  input: TrackEventInput,
): string {
  return (
    cleanString(input.event_name, 128) ??
    cleanString(input.canonical_event_name, 128) ??
    cleanString(input.event_type, 128) ??
    "unknown_event"
  );
}

export async function trackEvent(
  input: TrackEventInput,
): Promise<void> {
  const eventName = resolveEventName(input);

  const rawLocationId =
    input.location_id ??
    input.source_location_id ??
    null;

  const occurredAt =
    cleanString(input.occurred_at, 64) ??
    new Date().toISOString();

  const payload = {
    event_name: eventName,

    // Kept for compatibility with legacy analytics consumers.
    // The migration makes this nullable for canonical events.
    event_type:
      cleanString(input.event_type, 128) ??
      eventName,

    user_id: isUuid(input.user_id)
      ? input.user_id
      : null,

    anonymous_id: cleanString(
      input.anonymous_id,
      128,
    ),

    session_id: cleanString(
      input.session_id,
      128,
    ),

    outing_id: isUuid(input.outing_id)
      ? input.outing_id
      : null,

    location_id: isUuid(rawLocationId)
      ? rawLocationId
      : null,

    source_location_id:
      rawLocationId !== null &&
      rawLocationId !== undefined
        ? String(rawLocationId).slice(0, 128)
        : null,

    owner_id: isUuid(input.owner_id)
      ? input.owner_id
      : null,

    query: cleanString(
      input.query,
      1_000,
    ),

    normalized_query: cleanString(
      input.normalized_query,
      1_000,
    ),

    search_intent: toJsonRecord(
      input.search_intent,
    ),

    page_path: cleanString(
      input.page_path,
      1_000,
    ),

    referrer: cleanString(
      input.referrer,
      2_000,
    ),

    source: cleanString(
      input.source,
      256,
    ),

    device_type: cleanString(
      input.device_type,
      128,
    ),

    browser: cleanString(
      input.browser,
      128,
    ),

    os: cleanString(
      input.os,
      128,
    ),

    city: cleanString(
      input.city,
      256,
    ),

    borough: cleanString(
      input.borough,
      256,
    ),

    neighborhood: cleanString(
      input.neighborhood,
      256,
    ),

    location_type: cleanString(
      input.location_type,
      128,
    ),

    category: cleanString(
      input.category,
      256,
    ),

    cuisine: cleanString(
      input.cuisine,
      256,
    ),

    activity_type: cleanString(
      input.activity_type,
      256,
    ),

    ranking_position: cleanFiniteNumber(
      input.ranking_position,
    ),

    result_count: cleanFiniteNumber(
      input.result_count,
    ),

    response_time_ms: cleanFiniteNumber(
      input.response_time_ms,
    ),

    conversion_step: cleanString(
      input.conversion_step,
      128,
    ),

    revenue_impact: cleanFiniteNumber(
      input.revenue_impact,
    ),

    metadata: toJsonRecord(
      input.metadata,
    ),

    schema_version:
      cleanFiniteNumber(input.schema_version) ??
      1,

    canonical_event_name:
      cleanString(
        input.canonical_event_name,
        128,
      ) ?? eventName,

    search_id: isUuid(input.search_id)
      ? input.search_id
      : null,

    query_fingerprint: cleanString(
      input.query_fingerprint,
      128,
    ),

    pair_id: cleanString(
      input.pair_id,
      128,
    ),

    feedback_polarity: cleanString(
      input.feedback_polarity,
      64,
    ),

    feedback_weight: cleanFiniteNumber(
      input.feedback_weight,
    ),

    dedupe_key: cleanString(
      input.dedupe_key,
      256,
    ),

    is_bot: input.is_bot ?? false,

    occurred_at: occurredAt,
  };

  try {
    const { error } = await supabaseAdmin
      .from("analytics_events")
      .upsert(payload, {
        onConflict: "dedupe_key",
        ignoreDuplicates: true,
      });

    if (error) {
      console.error(
        "THEOUTHAVEN_ANALYTICS_EVENT_FAILED",
        {
          event_name: payload.event_name,
          canonical_event_name:
            payload.canonical_event_name,
          search_id: payload.search_id,
          code: error.code ?? null,
          message: error.message,
          details: error.details ?? null,
          hint: error.hint ?? null,
        },
      );

      throw new AnalyticsEventInsertError({
        message: error.message,
        code: error.code ?? null,
        details: error.details ?? null,
        hint: error.hint ?? null,
      });
    }
  } catch (error) {
    if (error instanceof AnalyticsEventInsertError) {
      throw error;
    }

    console.error(
      "THEOUTHAVEN_ANALYTICS_EVENT_FAILED",
      {
        event_name: payload.event_name,
        canonical_event_name:
          payload.canonical_event_name,
        search_id: payload.search_id,
        error:
          error instanceof Error
            ? error.message
            : error,
      },
    );

    throw new AnalyticsEventInsertError({
      message:
        error instanceof Error
          ? error.message
          : "Unknown analytics event insertion error.",
    });
  }
}