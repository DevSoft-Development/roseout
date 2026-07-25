import type { EnterpriseLocation, EnterprisePair, SearchIntent } from "./types";

export type SearchInterpretation = "same_venue" | "two_stop" | "either";
export type RouteSource = "google" | "mapbox" | "estimated" | "unknown";
export type RouteConfidence = "verified" | "estimated" | "unknown";

export type SearchScoreBreakdown = {
  lexical: number;
  semantic: number;
  cuisineMatch: number;
  activityMatch: number;
  occasionMatch: number;
  geoMatch: number;
  quality: number;
  popularity: number;
  availability: number;
  personalization: number;
  penalties: number;
  final: number;
};

export type TemporalFeasibility = {
  status: "feasible" | "infeasible" | "unknown";
  restaurantArrivalISO: string | null;
  restaurantDepartureISO: string | null;
  activityArrivalISO: string | null;
  reason: string | null;
};

const numberOrZero = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizedText = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();

const includesAny = (text: string, values: string[]) =>
  values.some((value) => text.includes(normalizedText(value)));

export function detectSearchInterpretation(
  intent: SearchIntent,
): { interpretation: SearchInterpretation; confidence: number; reasons: string[] } {
  const query = normalizedText(intent.rawQuery);
  const sameVenueSignals = [
    "with food",
    "with dinner",
    "with wings",
    "with karaoke",
    "with live music",
    "restaurant with",
    "bar with",
    "same place",
    "one place",
  ];
  const twoStopSignals = [
    " then ",
    " after ",
    " followed by ",
    " before ",
    " walking distance",
    " walk apart",
    " nearby",
  ];

  const sameVenue = includesAny(query, sameVenueSignals) || intent.sameLocationRequired === true;
  const twoStop =
    includesAny(` ${query} `, twoStopSignals) ||
    intent.pairRequested === true ||
    intent.pairingIntent === "nearby_pair";

  if (sameVenue && twoStop) {
    return {
      interpretation: "either",
      confidence: 0.55,
      reasons: ["same_venue_and_two_stop_signals"],
    };
  }
  if (sameVenue) {
    return {
      interpretation: "same_venue",
      confidence: intent.sameLocationRequired ? 0.95 : 0.8,
      reasons: ["same_venue_language"],
    };
  }
  if (twoStop || intent.wantsPairing) {
    return {
      interpretation: "two_stop",
      confidence: intent.pairRequested ? 0.95 : 0.82,
      reasons: ["pairing_or_sequence_language"],
    };
  }
  return {
    interpretation: "either",
    confidence: 0.4,
    reasons: ["no_decisive_interpretation_signal"],
  };
}

export function resolveRouteEvidence(pair: Partial<EnterprisePair>): {
  source: RouteSource;
  confidence: RouteConfidence;
  walkingMinutes: number | null;
} {
  const google = numberOrZero(pair.googleWalkingDurationMinutes);
  if (google > 0) return { source: "google", confidence: "verified", walkingMinutes: google };

  const route = numberOrZero(pair.routeDurationMinutes ?? pair.walking_route_minutes);
  if (route > 0) return { source: "mapbox", confidence: "verified", walkingMinutes: route };

  const direct = numberOrZero(pair.walkingDurationMinutes ?? pair.pairWalkingMinutes);
  if (direct > 0) return { source: "estimated", confidence: "estimated", walkingMinutes: direct };

  const distance = numberOrZero(pair.pairDistanceMiles ?? pair.distance_miles);
  if (distance > 0) {
    return {
      source: "estimated",
      confidence: "estimated",
      walkingMinutes: Math.round(distance * 20),
    };
  }

  return { source: "unknown", confidence: "unknown", walkingMinutes: null };
}

function dateAtMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60_000);
}

function closingTimeISO(location: EnterpriseLocation, reference: Date) {
  const raw =
    (location as Record<string, unknown>).closing_time ??
    (location as Record<string, unknown>).close_time ??
    (location as Record<string, unknown>).closes_at ??
    null;
  if (!raw) return null;
  const value = String(raw);
  const full = new Date(value);
  if (!Number.isNaN(full.getTime())) return full;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const result = new Date(reference);
  result.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (result < reference) result.setDate(result.getDate() + 1);
  return result;
}

export function evaluateTemporalFeasibility({
  pair,
  outingDateTimeISO,
  mealDurationMinutes = 90,
  arrivalBufferMinutes = 10,
}: {
  pair: EnterprisePair;
  outingDateTimeISO?: string | null;
  mealDurationMinutes?: number;
  arrivalBufferMinutes?: number;
}): TemporalFeasibility {
  if (!outingDateTimeISO) {
    return {
      status: "unknown",
      restaurantArrivalISO: null,
      restaurantDepartureISO: null,
      activityArrivalISO: null,
      reason: "missing_outing_datetime",
    };
  }
  const restaurantArrival = new Date(outingDateTimeISO);
  if (Number.isNaN(restaurantArrival.getTime())) {
    return {
      status: "unknown",
      restaurantArrivalISO: null,
      restaurantDepartureISO: null,
      activityArrivalISO: null,
      reason: "invalid_outing_datetime",
    };
  }

  const route = resolveRouteEvidence(pair);
  if (route.walkingMinutes == null) {
    return {
      status: "unknown",
      restaurantArrivalISO: restaurantArrival.toISOString(),
      restaurantDepartureISO: null,
      activityArrivalISO: null,
      reason: "missing_route_duration",
    };
  }

  const restaurantDeparture = dateAtMinutes(restaurantArrival, mealDurationMinutes);
  const activityArrival = dateAtMinutes(
    restaurantDeparture,
    route.walkingMinutes + arrivalBufferMinutes,
  );
  const activityClose = closingTimeISO(pair.activity, activityArrival);

  if (activityClose && activityArrival >= activityClose) {
    return {
      status: "infeasible",
      restaurantArrivalISO: restaurantArrival.toISOString(),
      restaurantDepartureISO: restaurantDeparture.toISOString(),
      activityArrivalISO: activityArrival.toISOString(),
      reason: "activity_closed_before_arrival",
    };
  }

  return {
    status: activityClose ? "feasible" : "unknown",
    restaurantArrivalISO: restaurantArrival.toISOString(),
    restaurantDepartureISO: restaurantDeparture.toISOString(),
    activityArrivalISO: activityArrival.toISOString(),
    reason: activityClose ? null : "missing_activity_closing_time",
  };
}

export function buildSearchScoreBreakdown(
  location: EnterpriseLocation,
  intent: SearchIntent,
): SearchScoreBreakdown {
  const text = normalizedText([
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.cuisine,
    location.activity_type,
    location.tags,
    location.semantic_tags,
    location.intent_tags,
    location.vibe_tags,
    location.best_for_tags,
    location.description,
  ].flat().filter(Boolean).join(" "));

  const cuisineTerms = intent.restaurantIntent.cuisineTerms ?? [];
  const foodTerms = intent.restaurantIntent.foodTerms ?? [];
  const activityTerms = intent.activityIntent.activityTerms ?? [];
  const vibeTerms = intent.vibe ?? [];

  const lexical = numberOrZero(location.term_score ?? location.match_score);
  const semantic = numberOrZero(location.ml_score ?? location.intent_score);
  const cuisineMatch = includesAny(text, [...cuisineTerms, ...foodTerms]) ? 30 : 0;
  const activityMatch = includesAny(text, activityTerms) ? 30 : 0;
  const occasionMatch =
    Boolean(intent.occasion) && text.includes(normalizedText(intent.occasion)) ? 15 : 0;
  const geoMatch = numberOrZero(location.geo_score ?? location.distance_score);
  const quality = numberOrZero(
    location.quality_rank_score ?? location.quality_score ?? location.theouthaven_score,
  );
  const popularity = numberOrZero(location.popularity_score) + Math.min(numberOrZero(location.review_count) / 100, 10);
  const availability =
    location.active === false || location.is_searchable === false || location.is_hidden === true ? -100 : 0;
  const personalization = includesAny(text, vibeTerms) ? 10 : 0;
  const penalties =
    numberOrZero((location as Record<string, unknown>).restaurant_food_activity_penalty) +
    numberOrZero((location as Record<string, unknown>).ranking_penalty);
  const final =
    lexical +
    semantic +
    cuisineMatch +
    activityMatch +
    occasionMatch +
    geoMatch +
    quality +
    popularity +
    availability +
    personalization +
    penalties;

  return {
    lexical,
    semantic,
    cuisineMatch,
    activityMatch,
    occasionMatch,
    geoMatch,
    quality,
    popularity,
    availability,
    personalization,
    penalties,
    final,
  };
}
