import { supabaseAdmin } from "../../supabaseAdmin";
import type {
  EnterpriseLocation,
  EnterpriseSearchResult,
  SearchIntent,
} from "./types";
import { parseEnterpriseIntent } from "./intent-parser";
import {
  activitySearchTerms,
  isBroadGenericActivityIntent,
  restaurantSearchTerms,
} from "./normalize-intent";
import {
  detectSingleVenueWithIntent,
  hasRooftopRestaurantFeatureLanguage,
} from "./taxonomy";
import {
  explainRejection,
  filterActivityResults,
  filterRestaurantResults,
  hasExplicitCafeDessertIntent,
  isCafeBakeryDessertQuickBiteOnly,
  isDateNightDinnerIntent,
  rankActivityResults,
  rankRestaurantResults,
  scoreSingleVenueWithMatch,
} from "./ranking";
import {
  createPairingDebug,
  createSearchPairs,
  getPairCityState,
  getPairGeoPriority,
} from "./pairing";
import {
  formatDistanceFromRestaurant,
  getPairDistanceMiles,
  getRawWalkingMinutes,
  getSafeWalkingMinutes,
  shouldHidePairForWalkingLimit,
  userAskedForWalking,
} from "./distance";
import {
  createRpcDebug,
  recoverEnterpriseLane,
  searchEnterpriseLane,
} from "./rpc";
import { productionSafeDebug } from "./debug";
import { firstSearchImage, hasUsableSearchPhoto } from "./photos";
import {
  getSearchSpeedStatus,
  logSearchPerformance,
} from "@/lib/search/performance";
import { resolveSearchMarket, type UserSearchLocation } from "./markets";
import { detectGeoIntent } from "./geo-taxonomy";
import { logSearchHealthEvent } from "./searchHealthLogger";
import { classifySearchIntent, getRankingIntentBuckets } from "@/lib/ml/intentBuckets";
import { getLocationIntentScoreMap, getPairScoreMap } from "@/lib/ml/intentScoreLoaders";
import { parseOutingDateTime } from "../parse-outing-date-time";
import { validatePlaceForMarket } from "../../location-market-validation";
import { getLocationMlScoreMap } from "@/lib/ml/locationMlScores";
import {
  getMarketGuardrailRejectionReason,
  isExplicitMarket,
  isPairAllowedForResolvedMarket,
  isResultAllowedForResolvedMarket,
} from "../market-guardrails";

const MIN_RESTAURANT_RESULTS = 6;
const MIN_ACTIVITY_RESULTS = 4;
const MIN_PAIR_RESULTS = 3;
const RECOVERY_LIMIT = 80;


function idString(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

async function applyIntentBoostsToLocations(
  items: EnterpriseLocation[],
  query: string,
  market?: string | null,
) {
  const classification = classifySearchIntent(query);
  const buckets = getRankingIntentBuckets(classification);
  const ids = items.map((item) => idString(item.id)).filter((id): id is string => Boolean(id));
  const scoreMap = await getLocationIntentScoreMap({ locationIds: ids, intentBuckets: buckets, market: market ?? null });
  return items.map((item, index) => {
    const id = idString(item.id);
    let matched: string | null = null;
    let score = 0;
    if (id) {
      for (const bucket of buckets) {
        const value = scoreMap.get(`${id}:${bucket}`);
        if (value != null) { score = Math.max(0, Number(value)); matched = bucket; break; }
      }
    }
    const intentBoost = Math.min(12, score * 0.12);
    const existingMlBoost = Math.min(13, Math.max(0, Number((item as any).ml_boost ?? item.ml_score ?? 0)));
    const cappedBoost = Math.min(25, intentBoost + existingMlBoost);
    return { ...item, intent_score: score || null, intent_boost: Number(intentBoost.toFixed(2)), primary_intent: classification.primaryIntent, matched_intents: matched ? [matched] : [], search_boost: Number(item.search_boost ?? 0) + cappedBoost, _mlPhase2SortScore: (items.length - index) * 100 + cappedBoost } as EnterpriseLocation;
  }).sort((a, b) => Number((b as any)._mlPhase2SortScore ?? 0) - Number((a as any)._mlPhase2SortScore ?? 0));
}

async function applyPairBoosts(pairs: import("./types").EnterprisePair[], query: string, market?: string | null) {
  const classification = classifySearchIntent(query);
  const buckets = getRankingIntentBuckets(classification);
  const pairKeys = pairs.map((pair) => ({ restaurantLocationId: String(pair.restaurant.id ?? ""), activityLocationId: String(pair.activity.id ?? "") })).filter((p) => p.restaurantLocationId && p.activityLocationId);
  const scoreMap = await getPairScoreMap({ pairKeys, intentBuckets: buckets, market: market ?? null });
  return pairs.map((pair) => {
    let matched: string | null = null; let score = 0;
    for (const bucket of buckets) { const value = scoreMap.get(`${pair.restaurant.id}:${pair.activity.id}:${bucket}`); if (value != null) { score = Math.max(0, Number(value)); matched = bucket; break; } }
    const pairBoost = Math.min(15, score * 0.15);
    return { ...pair, pair_ml_score: score || null, pair_boost: Number(pairBoost.toFixed(2)), primary_intent: classification.primaryIntent, matched_intents: matched ? [matched] : [], score: pair.score + pairBoost, pairScore: pair.pairScore + pairBoost };
  }).sort((a,b)=>b.score-a.score);
}

function serializeErrorForDebug(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  try {
    return {
      message: JSON.stringify(error),
      rawType: typeof error,
    };
  } catch {
    return {
      message: String(error),
      rawType: typeof error,
    };
  }
}

function errorMessageForDebug(error: unknown) {
  const serialized = serializeErrorForDebug(error);
  return serialized.message || String(error);
}
function hasUsableLivePhoto(location: EnterpriseLocation) {
  return hasUsableSearchPhoto(location);
}

function filterLivePhotoResults(items: EnterpriseLocation[]) {
  return items.filter(hasUsableLivePhoto);
}

function rejectionSummary(
  records: EnterpriseLocation[],
  intent: SearchIntent,
  domain: "restaurant" | "activity",
) {
  return records.reduce<Record<string, number>>((acc, record) => {
    const reason = explainRejection(record, intent, domain);

    if (reason) {
      acc[reason] = (acc[reason] || 0) + 1;
    }

    return acc;
  }, {});
}

function uniqueById(items: EnterpriseLocation[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.id ?? item.name ?? Math.random());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type MarketFitBucket = "requested" | "nearby" | "fallback";

function classifyMarketFit(
  item: EnterpriseLocation,
  requestedMarket?: string | null,
): {
  bucket: MarketFitBucket;
  reason: string;
  label: string | null;
} {
  const record = item as any;
  const market = String(record.market ?? "").toUpperCase();
  const state = String(record.state ?? "").toUpperCase();
  const county = String(record.county ?? "").toLowerCase();

  if (requestedMarket === "LONG_ISLAND") {
    if (
      market === "LONG_ISLAND" ||
      (state === "NY" && ["nassau", "suffolk"].includes(county))
    ) {
      return {
        bucket: "requested",
        reason: "long_island_market_or_nassau_suffolk",
        label: null,
      };
    }

    if (state === "NY" || state === "NJ") {
      return {
        bucket: "nearby",
        reason: "nearby_region_for_long_island_request",
        label: "Near your requested location",
      };
    }

    return {
      bucket: "fallback",
      reason: "fallback_region_for_long_island_request",
      label: "Recommended nearby",
    };
  }

  if (
    requestedMarket &&
    isResultAllowedForResolvedMarket(item, requestedMarket)
  ) {
    return {
      bucket: "requested",
      reason: "allowed_for_requested_market",
      label: null,
    };
  }

  return {
    bucket: requestedMarket ? "nearby" : "fallback",
    reason: requestedMarket
      ? "nearby_region_for_requested_market"
      : "no_requested_market",
    label: requestedMarket
      ? "Near your requested location"
      : "Recommended nearby",
  };
}

function withMarketFit(
  item: EnterpriseLocation,
  requestedMarket?: string | null,
): EnterpriseLocation {
  const fit = classifyMarketFit(item, requestedMarket);

  return {
    ...item,
    _marketFitBucket: fit.bucket,
    _marketFitReason: fit.reason,
    _marketFitLabel: fit.label,
  } as EnterpriseLocation;
}

function hasPairConstraint(intent: SearchIntent) {
  return Boolean(
    intent.pairingPreference && intent.pairingPreference.distanceMode !== "any",
  );
}
function isRooftopDrinksIntent(intent: SearchIntent) {
  return (
    /\brooftop\s+(drinks?|cocktails?|bar|lounge)|\b(rooftop drinks|rooftop bar|rooftop lounge)\b/i.test(
      intent.rawQuery,
    ) ||
    intent.activityIntent.activityTerms.some((term) =>
      ["rooftop drinks", "rooftop bar", "rooftop lounge"].includes(
        term.toLowerCase(),
      ),
    )
  );
}
const ROOFTOP_ACTIVITY_RECOVERY_TERMS = [
  "rooftop",
  "rooftop bar",
  "rooftop lounge",
  "drinks",
  "cocktails",
  "bar",
  "lounge",
];
const BAR_ACTIVITY_RECOVERY_TERMS = ["bar", "lounge", "cocktails", "drinks"];
const RESTAURANT_FEATURE_RECOVERY_TERMS = [
  "restaurant",
  "dinner",
  "brunch",
  "lunch",
  "rooftop",
  "roof top",
  "rooftop restaurant",
  "rooftop dining",
  "roof deck",
  "terrace",
  "patio",
  "outdoor dining",
  "outdoor seating",
  "skyline",
  "skyline views",
  "scenic views",
  "views",
  "waterfront",
  "waterfront views",
  "live music",
];

const RESTAURANT_GENERIC_RECOVERY_TERMS = [
  "restaurant",
  "dinner",
  "brunch",
  "lunch",
  "food",
];

const RESTAURANT_ROOFTOP_FEATURE_ONLY_RECOVERY_TERMS = [
  "restaurant",
  "dinner",
  "rooftop",
  "rooftop restaurant",
  "rooftop dining",
  "terrace",
  "skyline",
  "skyline views",
  "views",
  "outdoor dining",
];

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );
}

function restaurantFoodCuisineTerms(intent: SearchIntent): string[] {
  return uniqueStrings([
    ...(intent.restaurantIntent?.foodTerms ?? []),
    ...(intent.restaurantIntent?.cuisineTerms ?? []),
    ...(intent.restaurantIntent?.categoryTerms ?? []),
  ]);
}

function restaurantFeatureTerms(intent: SearchIntent): string[] {
  return uniqueStrings([
    ...(intent.restaurantIntent?.featureTerms ?? []),
    ...(intent.restaurantIntent?.vibeTerms ?? []),
  ]);
}

function hasRestaurantFeatureIntent(intent: SearchIntent): boolean {
  if (!intent.needsRestaurant || intent.needsActivity) return false;

  const q = String(intent.rawQuery || "").toLowerCase();
  const features = restaurantFeatureTerms(intent).join(" ");

  return (
    /\b(rooftop|roof top|roof deck|terrace|patio|outdoor dining|outdoor seating|skyline|skyline views|scenic views|waterfront|waterfront views|views|live music)\b/i.test(
      q,
    ) ||
    /\b(rooftop|roof top|roof deck|terrace|patio|outdoor dining|outdoor seating|skyline|scenic views|waterfront|views|live music)\b/i.test(
      features,
    )
  );
}

function cloneIntentForRestaurantRecovery(
  intent: SearchIntent,
  options: {
    relaxFood?: boolean;
    relaxFeature?: boolean;
    strictness?: SearchIntent["strictness"];
  },
): SearchIntent {
  return {
    ...intent,
    strictness: options.strictness ?? intent.strictness,
    restaurantIntent: {
      ...intent.restaurantIntent,
      foodTerms: options.relaxFood ? [] : intent.restaurantIntent.foodTerms,
      cuisineTerms: options.relaxFood
        ? []
        : intent.restaurantIntent.cuisineTerms,
      featureTerms: options.relaxFeature
        ? []
        : intent.restaurantIntent.featureTerms,
    },
  } as SearchIntent;
}

function buildGenericRestaurantRecoveryAttempts(intent: SearchIntent) {
  if (!intent.needsRestaurant) return [];

  const foodCuisineTerms = restaurantFoodCuisineTerms(intent);
  const featureTerms = restaurantFeatureTerms(intent);
  const hasFoodCuisine = foodCuisineTerms.length > 0;
  const hasFeature = hasRestaurantFeatureIntent(intent);

  const hasOnlyGenericRestaurantFoodCuisine =
    foodCuisineTerms.length === 0 ||
    foodCuisineTerms.every((term) => ["restaurant"].includes(term));
  const hasRooftopFeatureOnlySafety =
    intent.primaryDomain === "restaurant" &&
    intent.needsRestaurant === true &&
    hasOnlyGenericRestaurantFoodCuisine &&
    hasRooftopRestaurantFeatureLanguage(intent.rawQuery || "");

  if (!hasFoodCuisine && !hasFeature && !hasRooftopFeatureOnlySafety) return [];

  const attempts: {
    reason: string;
    terms: string[];
    relaxFood?: boolean;
    relaxFeature?: boolean;
    strictness?: SearchIntent["strictness"];
  }[] = [];

  if (hasRooftopFeatureOnlySafety) {
    attempts.push({
      reason: "restaurant_rooftop_feature_only_recovery",
      terms: uniqueStrings(RESTAURANT_ROOFTOP_FEATURE_ONLY_RECOVERY_TERMS),
      relaxFood: true,
      strictness: "medium",
    });
  }

  if (hasFoodCuisine && hasFeature) {
    attempts.push({
      reason: "restaurant_food_feature_combined_zero_results",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...foodCuisineTerms,
        ...featureTerms,
      ]),
      strictness: "medium",
    });

    attempts.push({
      reason: "restaurant_food_first_recovery",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...foodCuisineTerms,
      ]),
      relaxFeature: true,
      strictness: "medium",
    });

    attempts.push({
      reason: "restaurant_feature_first_recovery",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...featureTerms,
        ...RESTAURANT_FEATURE_RECOVERY_TERMS.filter((term) =>
          featureTerms.some(
            (feature) => term.includes(feature) || feature.includes(term),
          ),
        ),
      ]),
      relaxFood: true,
      strictness: "medium",
    });

    attempts.push({
      reason: "restaurant_generic_feature_recovery",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...featureTerms,
        ...RESTAURANT_FEATURE_RECOVERY_TERMS,
      ]),
      relaxFood: true,
      strictness: "medium",
    });

    return attempts;
  }

  if (hasFeature) {
    attempts.push({
      reason: "restaurant_feature_zero_results",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...featureTerms,
        ...RESTAURANT_FEATURE_RECOVERY_TERMS,
      ]),
      relaxFood: true,
      strictness: "medium",
    });
  }

  if (hasFoodCuisine) {
    attempts.push({
      reason: "restaurant_food_cuisine_zero_results",
      terms: uniqueStrings([
        ...RESTAURANT_GENERIC_RECOVERY_TERMS,
        ...foodCuisineTerms,
      ]),
      relaxFeature: true,
      strictness: "medium",
    });
  }

  return attempts;
}

function hasExactNeighborhoodOnlyLanguage(rawQuery: string): boolean {
  return /\b(only|must be in|inside|strictly in|nothing outside|no outside|only in)\b/i.test(
    rawQuery || "",
  );
}

function shouldRunNeighborhoodRestaurantFallback(args: {
  rawQuery?: string;
  primaryDomain?: string;
  needsRestaurant?: boolean;
  needsActivity?: boolean;
  wantsPairing?: boolean;
  restaurantCount?: number;
  geo?: any;
}) {
  return (
    args.primaryDomain === "restaurant" &&
    args.needsRestaurant === true &&
    args.needsActivity !== true &&
    args.wantsPairing !== true &&
    Number(args.restaurantCount || 0) === 0 &&
    args.geo?.geoStrictness === "strict" &&
    Boolean(args.geo?.neighborhood) &&
    Boolean(args.geo?.borough) &&
    !hasExactNeighborhoodOnlyLanguage(args.rawQuery || "")
  );
}

function buildBoroughRestaurantFallbackGeo(geo: any) {
  const resolvedBoroughGeo = geo?.borough
    ? detectGeoIntent(String(geo.borough))
    : null;
  const resolvedRadius = Number(resolvedBoroughGeo?.radiusMiles ?? 0);
  const originalRadius = Number(geo?.radiusMiles ?? 0);

  return {
    ...geo,
    ...(resolvedBoroughGeo ?? {}),
    raw: geo?.borough ?? resolvedBoroughGeo?.raw ?? null,
    neighborhood: null,
    city: resolvedBoroughGeo?.city || geo?.city || "New York",
    borough: geo?.borough ?? resolvedBoroughGeo?.borough ?? null,
    county: resolvedBoroughGeo?.county ?? geo?.county,
    state: resolvedBoroughGeo?.state || geo?.state || "NY",
    latitude: resolvedBoroughGeo?.latitude ?? geo?.latitude ?? null,
    longitude: resolvedBoroughGeo?.longitude ?? geo?.longitude ?? null,
    radiusMiles: Math.max(originalRadius, resolvedRadius, 10),
    geoStrictness: "medium",
  };
}

function budgetIntentDetected(intent: SearchIntent) {
  return /\b(cheap|affordable|budget|under\s*\$?100|low cost|inexpensive)\b/i.test(
    `${intent.rawQuery || ""} ${intent.budget || ""}`,
  );
}

function activityRecoveryAttempts(intent: SearchIntent): { reason: string; terms: string[]; level: string }[] {
  const q = String(intent.rawQuery || "").toLowerCase();
  const terms = uniqueStrings([...(intent.activityIntent?.activityTerms ?? []), ...(intent.activityIntent?.categoryTerms ?? [])]);
  const attempts: { reason: string; terms: string[]; level: string }[] = [];
  const add = (reason: string, level: string, values: string[]) => attempts.push({ reason, level, terms: uniqueStrings(values) });
  if (/karaoke/.test(q)) add("activity_karaoke_recovery", "specific", ["karaoke", "karaoke bar", "karaoke lounge", "bar", "lounge"]);
  if (/hookah|shisha/.test(q)) add("activity_hookah_recovery", "specific", ["hookah", "hookah lounge", "shisha", "lounge", "bar", "nightlife"]);
  if (/pool hall|billiards|pool table/.test(q)) add("activity_billiards_recovery", "specific", ["pool hall", "billiards", "pool table", "games", "bar", "lounge"]);
  if (/bowling/.test(q)) add("activity_bowling_recovery", "specific", ["bowling", "bowling alley", "bowling lanes", "games", "entertainment"]);
  if (/comedy|stand ?up|improv/.test(q)) add("activity_comedy_recovery", "specific", ["comedy club", "comedy show", "stand up comedy", "improv", "theater", "live entertainment", "nightlife"]);
  if (/arcade/.test(q)) add("activity_arcade_recovery", "specific", ["arcade", "games", "game room", "entertainment", "bowling", "mini golf"]);
  if (/family|kid|kids/.test(q)) add("activity_family_recovery", "broad", ["family friendly", "kid friendly", "museum", "bowling", "arcade", "park", "zoo", "aquarium", "activity", "entertainment"]);
  if (/romantic|date/.test(q)) add("activity_romantic_recovery", "broad", ["date activity", "date idea", "museum", "gallery", "live music", "jazz", "lounge", "dessert", "park"]);
  if (/outdoor/.test(q)) add("activity_outdoor_recovery", "broad", ["outdoor activity", "park", "garden", "waterfront", "pier", "walking tour", "boat ride", "observation deck"]);
  if (terms.length) add("activity_original_relaxed_recovery", "strict", terms);
  add("activity_entertainment_recovery", "broad", ["entertainment", "activity", "things to do", "nightlife", "games", "lounge"]);
  return attempts;
}

function cloneIntentForActivityRecovery(intent: SearchIntent): SearchIntent {
  return {
    ...intent,
    strictness: "medium",
    activityIntent: {
      ...intent.activityIntent,
      alternativeGroups: [],
    },
  } as SearchIntent;
}

function requiresStrictMixedPair(intent: SearchIntent) {
  return (
    intent.searchType === "mixed_outing" &&
    intent.wantsPairing === true &&
    intent.needsRestaurant === true &&
    intent.needsActivity === true &&
    intent.pairingPreference?.requiresPairing === true
  );
}

function requiredPairingFailureReason(
  restaurantCount: number,
  activityCount: number,
  pairCount: number,
  intent: SearchIntent,
) {
  if (pairCount > 0) return null;
  if (activityCount === 0) return "no_activity_results_for_required_pair";
  if (restaurantCount === 0) return "no_restaurant_results_for_required_pair";
  if (
    intent.pairingPreference?.requireWalkablePair === true ||
    intent.pairingPreference?.distanceMode === "walking" ||
    intent.pairingPreference?.distanceMode === "short_walk"
  ) {
    return "no_walkable_pair_found";
  }
  return "no_valid_required_pair";
}

function areaLabel(intent: SearchIntent) {
  return (
    intent.geo.neighborhood ??
    intent.geo.borough ??
    intent.geo.city ??
    intent.geo.county ??
    intent.geo.raw ??
    "that area"
  );
}
function replyFor(
  restaurants: EnterpriseLocation[],
  activities: EnterpriseLocation[],
  pairs: ReturnType<typeof createSearchPairs>,
  intent: SearchIntent,
  neighborhoodRecovery?: {
    used: boolean;
    from: string | null;
    to: string | null;
  },
) {
  if (intent.wantsPairing) {
    const constrained = hasPairConstraint(intent);
    const walkableWord =
      intent.pairingPreference?.distanceMode === "same_area"
        ? "same-area"
        : "walkable";
    if (pairs.length)
      return constrained
        ? `I found ${walkableWord} dinner + activity pairings near ${areaLabel(intent)}.`
        : "Found restaurant and activity options that match your outing.";
    if (restaurants.length && activities.length) {
      const maxWalkingMinutes = intent.pairingPreference?.maxPairWalkingMinutes;
      if (
        constrained &&
        Number.isFinite(Number(maxWalkingMinutes)) &&
        (intent.pairingPreference?.distanceMode === "walking" ||
          intent.pairingPreference?.distanceMode === "short_walk" ||
          intent.pairingPreference?.requireWalkablePair === true)
      ) {
        return `No valid pairs were found within a ${Number(maxWalkingMinutes)}-minute walk.`;
      }
      return constrained
        ? "I found matching restaurants and activities, but none close enough to confidently call walking distance."
        : "Found restaurant and activity options, but I could not create a confident pair yet.";
    }
    if (restaurants.length)
      return constrained
        ? "I found restaurants, but no matching walkable activity nearby."
        : `I found restaurant options near ${areaLabel(intent)}, but I couldn’t find matching activities nearby yet.`;
    if (activities.length)
      return constrained
        ? "I found activities, but no matching walkable restaurant nearby."
        : `I found activity options near ${areaLabel(intent)}, but I couldn’t find matching restaurants nearby yet.`;
  }
  if (restaurants.length) {
    const singleVenue = detectSingleVenueWithIntent(intent.rawQuery);
    if (singleVenue.matched) {
      const q = intent.rawQuery.toLowerCase();
      if (
        /\bbar\b|\bsports bar\b|\bpub\b/.test(q) &&
        /\bwings?\b|\bchicken wings\b/.test(q)
      )
        return "Here are NYC bars and sports-bar-style spots that match wings.";
      if (/\bhookah\b/.test(q))
        return "Here are restaurant-style spots that match hookah.";
      if (/\bseafood\b/.test(q) && /\blive music\b/.test(q))
        return "Here are seafood spots that also match live music.";
      return "Here are places that match both parts of your search.";
    }
    if (
      neighborhoodRecovery?.used &&
      neighborhoodRecovery.from &&
      neighborhoodRecovery.to
    ) {
      return `I couldn’t find strong matches directly in ${neighborhoodRecovery.from}, but here are nearby ${neighborhoodRecovery.to} options.`;
    }
    return "Found restaurant matches.";
  }
  if (activities.length) return "Found activity matches.";
  return "I couldn’t find strong matches for that request yet.";
}
type EnterpriseSearchOptions = {
  useLLM?: boolean;
  body?: any;
  supabase?: any;
  displayLimit?: number;
  source?: string;
  route?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  logPerformance?: boolean;
  betaDebug?: boolean;
  betaAssignmentId?: string | null;
  betaTesterId?: string | null;
  usedCustomPrompt?: boolean;
  useFastPath?: boolean;
  selectedMarketId?: string | null;
  userLocation?: UserSearchLocation | null;
  createdByUserId?: string | null;
  searchHealthDebug?: boolean;
  betaFeedbackSubmitted?: boolean;
};

export async function runEnterpriseSearch(
  query: string,
  options?: EnterpriseSearchOptions,
): Promise<EnterpriseSearchResult> {
  const startedAt = new Date();
  const started = Date.now();
  const perf = {
    total_ms: 0,
    intent_parse_ms: 0,
    llm_ms: null as number | null,
    restaurant_rpc_ms: 0,
    activity_rpc_ms: 0,
    rpc_ms: 0,
    ranking_ms: 0,
    photo_filter_ms: 0,
    pairing_ms: 0,
    route_check_ms: null as number | null,
  };
  let parsedIntent: SearchIntent | null = null;
  let usedFallback = false;
  let usedLlm = false;
  let parserDebug: Record<string, any> = {};
  try {
    const intentStart = Date.now();
    const {
      intent,
      llmIntentRaw,
      llmError,
      intentParserSource,
      fastPathMatched,
      fastPathReason,
      usedLlm: parsedWithLlm,
      debug: parsedDebug = {},
    } = await parseEnterpriseIntent(query, {
      useLLM: options?.useLLM,
      useFastPath: options?.useFastPath,
      body: options?.body,
      debug: parserDebug,
    });
    parserDebug = parsedDebug;
    usedLlm = parsedWithLlm;
    perf.intent_parse_ms =
      parserDebug.intent_parse_ms ?? Date.now() - intentStart;
    perf.llm_ms =
      parserDebug.llm_ms ??
      (usedLlm
        ? perf.intent_parse_ms
        : intentParserSource === "fast_path"
          ? 0
          : null);
    (perf as any).fast_llm_ms = parserDebug.fast_llm_ms ?? null;
    (perf as any).fallback_llm_ms = parserDebug.fallback_llm_ms ?? null;
    (perf as any).intentParserSource =
      parserDebug.intentParserSource ?? intentParserSource;
    const marketResolution = resolveSearchMarket({
      geo: intent.geo,
      selectedMarketId:
        options?.selectedMarketId ??
        options?.body?.selectedMarketId ??
        options?.body?.selected_market_id ??
        null,
      userLocation:
        options?.userLocation ??
        options?.body?.userLocation ??
        options?.body?.user_location ??
        null,
    });
    const requestNearMeDebug = {
      nearMeIntent: options?.body?.nearMeIntent === true,
      useCurrentLocation: options?.body?.useCurrentLocation === true,
      userLatitudePresent: Number.isFinite(
        Number(options?.body?.userLatitude ?? options?.body?.user_latitude),
      ),
      userLongitudePresent: Number.isFinite(
        Number(options?.body?.userLongitude ?? options?.body?.user_longitude),
      ),
      rawQueryBeforeNearMeStrip:
        typeof options?.body?.rawQueryBeforeNearMeStrip === "string"
          ? options.body.rawQueryBeforeNearMeStrip
          : query,
      rawQueryAfterNearMeStrip:
        typeof options?.body?.rawQueryAfterNearMeStrip === "string"
          ? options.body.rawQueryAfterNearMeStrip
          : query,
    };
    const geoSource =
      marketResolution.marketReason === "explicit_geo"
        ? "typed_location"
        : marketResolution.marketReason === "current_location"
          ? "current_location"
          : "default_market";
    const outingTiming = parseOutingDateTime(query, startedAt);
    const effectiveIntent: SearchIntent = {
      ...intent,
      ...outingTiming,
      geo: marketResolution.effectiveGeo,
    };
    parsedIntent = effectiveIntent;
    const debug = createRpcDebug(effectiveIntent);
    const supabase = options?.supabase ?? supabaseAdmin;
    const displayLimit = options?.displayLimit ?? 12;
    let restaurantRankingIntent = effectiveIntent;
    let restaurantRaw: EnterpriseLocation[] = [];
    let activityRaw: EnterpriseLocation[] = [];
    let activityRpcCountBeforeRecovery = 0;
    const searchRestaurantLane = async () => {
      const rpcStarted = Date.now();
      restaurantRaw = await searchEnterpriseLane(
        supabase,
        effectiveIntent,
        "restaurant",
        debug,
      );
      let filtered = filterRestaurantResults(restaurantRaw, effectiveIntent);
      if (filtered.length < MIN_RESTAURANT_RESULTS && restaurantSearchTerms(effectiveIntent).length) {
        usedFallback = true;

        const restaurantRecoveryAttempts =
          buildGenericRestaurantRecoveryAttempts(effectiveIntent);

        if (restaurantRecoveryAttempts.length) {
          for (const attempt of restaurantRecoveryAttempts) {
            const recoveryIntent = cloneIntentForRestaurantRecovery(
              effectiveIntent,
              {
                relaxFood: attempt.relaxFood,
                relaxFeature: attempt.relaxFeature,
                strictness: attempt.strictness,
              },
            );

            debug.restaurantRecoveryUsed = true;
            debug.restaurantRecoveryReason = attempt.reason;
            debug.restaurantRecoveryTermsTried = [
              ...(debug.restaurantRecoveryTermsTried ?? []),
              attempt.terms,
            ];
            debug.restaurantRecoveryRelaxedFood =
              Boolean(debug.restaurantRecoveryRelaxedFood) ||
              Boolean(attempt.relaxFood);
            debug.restaurantRecoveryRelaxedFeature =
              Boolean(debug.restaurantRecoveryRelaxedFeature) ||
              Boolean(attempt.relaxFeature);

            const recoveredRaw = await recoverEnterpriseLane(
              supabase,
              recoveryIntent,
              "restaurant",
              debug,
              attempt.terms,
            );

            const recoveredFiltered = filterRestaurantResults(
              recoveredRaw,
              recoveryIntent,
            );

            debug.restaurantRecoveryAttemptResults = [
              ...(debug.restaurantRecoveryAttemptResults ?? []),
              {
                reason: attempt.reason,
                terms: attempt.terms,
                resultCount: recoveredRaw.length,
                filteredCount: recoveredFiltered.length,
                relaxedFood: Boolean(attempt.relaxFood),
                relaxedFeature: Boolean(attempt.relaxFeature),
              },
            ];

            if (recoveredFiltered.length) {
              restaurantRaw = uniqueById([
                ...restaurantRaw,
                ...recoveredFiltered,
              ]);
              filtered = recoveredFiltered;
              restaurantRankingIntent = recoveryIntent;
              debug.restaurantRecoverySucceeded = true;
              break;
            }
          }
        }

        if (!filtered.length) {
          restaurantRaw = await recoverEnterpriseLane(
            supabase,
            effectiveIntent,
            "restaurant",
            debug,
            restaurantSearchTerms(effectiveIntent).slice(0, RECOVERY_LIMIT),
          );
          filtered = filterRestaurantResults(restaurantRaw, effectiveIntent);
        }
      }
      if (
        shouldRunNeighborhoodRestaurantFallback({
          rawQuery: effectiveIntent.rawQuery,
          primaryDomain: effectiveIntent.primaryDomain,
          needsRestaurant: effectiveIntent.needsRestaurant,
          needsActivity: effectiveIntent.needsActivity,
          wantsPairing: effectiveIntent.wantsPairing,
          restaurantCount: filtered.length,
          geo: effectiveIntent.geo,
        })
      ) {
        const fallbackGeo = buildBoroughRestaurantFallbackGeo(
          effectiveIntent.geo,
        );
        const fallbackIntent = { ...effectiveIntent, geo: fallbackGeo };
        const fallbackTerms = restaurantSearchTerms(effectiveIntent);
        usedFallback = true;
        debug.neighborhoodRecoveryUsed = true;
        debug.neighborhoodRecoveryReason = "strict_neighborhood_zero_results";
        debug.neighborhoodRecoveryFrom =
          effectiveIntent.geo.neighborhood ?? null;
        debug.neighborhoodRecoveryTo = fallbackGeo.borough ?? null;
        debug.neighborhoodRecoveryRadiusMiles =
          Number(fallbackGeo.radiusMiles ?? 0) || null;
        debug.neighborhoodRecoveryTerms = fallbackTerms;
        debug.neighborhoodRecoveryGeo = fallbackGeo;
        const fallbackRaw = await searchEnterpriseLane(
          supabase,
          fallbackIntent,
          "restaurant",
          debug,
        );
        const fallbackFiltered = filterRestaurantResults(
          fallbackRaw,
          effectiveIntent,
        );
        debug.neighborhoodRecoveryResultCount = fallbackFiltered.length;
        if (fallbackFiltered.length) {
          restaurantRaw = fallbackFiltered;
          filtered = fallbackFiltered;
        }
      }
      perf.restaurant_rpc_ms = Date.now() - rpcStarted;
    };
    const searchActivityLane = async () => {
      const rpcStarted = Date.now();
      activityRaw = await searchEnterpriseLane(
        supabase,
        effectiveIntent,
        "activity",
        debug,
      );
      activityRpcCountBeforeRecovery = activityRaw.length;
      let filtered = filterActivityResults(activityRaw, effectiveIntent);
      if (
        (filtered.length < MIN_ACTIVITY_RESULTS && activitySearchTerms(effectiveIntent).length) ||
        (isBroadGenericActivityIntent(effectiveIntent) && filtered.length < MIN_RESTAURANT_RESULTS)
      ) {
        usedFallback = true;
        if (isRooftopDrinksIntent(effectiveIntent)) {
          debug.activityRecoveryReason = "rooftop_drinks_zero_results";
          debug.activityRecoveryTermsTried = [ROOFTOP_ACTIVITY_RECOVERY_TERMS];
          activityRaw = await recoverEnterpriseLane(
            supabase,
            effectiveIntent,
            "activity",
            debug,
            ROOFTOP_ACTIVITY_RECOVERY_TERMS,
          );
          filtered = filterActivityResults(activityRaw, effectiveIntent);
          if (!filtered.length) {
            debug.activityRecoveryTermsTried.push(BAR_ACTIVITY_RECOVERY_TERMS);
            activityRaw = await recoverEnterpriseLane(
              supabase,
              effectiveIntent,
              "activity",
              debug,
              BAR_ACTIVITY_RECOVERY_TERMS,
            );
            filtered = filterActivityResults(activityRaw, effectiveIntent);
          }
        } else {
          for (const attempt of activityRecoveryAttempts(effectiveIntent)) {
            debug.activityRecoveryReason = attempt.reason;
            (debug as any).activityRecoveryLevel = attempt.level;
            debug.activityRecoveryTermsTried = [
              ...(debug.activityRecoveryTermsTried ?? []),
              attempt.terms,
            ];
            const recoveredActivityRaw = await recoverEnterpriseLane(
              supabase,
              cloneIntentForActivityRecovery(effectiveIntent),
              "activity",
              debug,
              attempt.terms,
            );
            activityRaw = uniqueById([...activityRaw, ...recoveredActivityRaw]);
            filtered = filterActivityResults(activityRaw, cloneIntentForActivityRecovery(effectiveIntent));
            (debug as any).activityRecoveryAttemptResults = [
              ...((debug as any).activityRecoveryAttemptResults ?? []),
              { reason: attempt.reason, terms: attempt.terms, resultCount: recoveredActivityRaw.length, filteredCount: filtered.length },
            ];
            if (filtered.length >= MIN_ACTIVITY_RESULTS) {
              (debug as any).activityRecoverySucceeded = true;
              break;
            }
          }
        }
      }
      perf.activity_rpc_ms = Date.now() - rpcStarted;
    };

    if (effectiveIntent.needsRestaurant && effectiveIntent.needsActivity) {
      await Promise.all([searchRestaurantLane(), searchActivityLane()]);
    } else if (effectiveIntent.needsRestaurant) {
      await searchRestaurantLane();
    } else if (effectiveIntent.needsActivity) {
      await searchActivityLane();
    }
    perf.rpc_ms = perf.restaurant_rpc_ms + perf.activity_rpc_ms;
    const restaurantRejectedReasons = restaurantRaw
      .map((r) => explainRejection(r, restaurantRankingIntent, "restaurant"))
      .filter(Boolean);
    const activityRejectedReasons = activityRaw
      .map((r) => explainRejection(r, effectiveIntent, "activity"))
      .filter(Boolean);
    const restaurantRejectedSummary = rejectionSummary(
      restaurantRaw,
      restaurantRankingIntent,
      "restaurant",
    );
    const activityRejectedSummary = rejectionSummary(
      activityRaw,
      effectiveIntent,
      "activity",
    );
    const rankStarted = Date.now();
    const attachMlScores = async (items: EnterpriseLocation[]) => {
      const scoreMap = await getLocationMlScoreMap(
        items.map((item) => String(item.id ?? "")).filter(Boolean),
      );
      return items.map((item) => ({
        ...item,
        ml_score: scoreMap.get(String(item.id ?? "")) ?? null,
      }));
    };
    const [restaurantCandidatesWithMl, activityCandidatesWithMl] = await Promise.all([
      attachMlScores(uniqueById(restaurantRaw)),
      attachMlScores(uniqueById(activityRaw)),
    ]);
    (debug as any).mlRanking = {
      enabled: true,
      restaurantScoresLoaded: restaurantCandidatesWithMl.filter((item) => item.ml_score != null).length,
      activityScoresLoaded: activityCandidatesWithMl.filter((item) => item.ml_score != null).length,
      boostFormula: "min(20, max(0, ml_score) * 0.15)",
    };
    let rankedRestaurants = rankRestaurantResults(
      restaurantCandidatesWithMl,
      restaurantRankingIntent,
    );
    const requestedBorough = restaurantRankingIntent.geo?.borough ?? null;
    const boroughStrictnessApplied = Boolean(
      requestedBorough &&
      ["medium", "strict"].includes(
        String(restaurantRankingIntent.geo?.geoStrictness),
      ),
    );
    if (boroughStrictnessApplied) {
      const isInRequestedBorough = (item: EnterpriseLocation) =>
        String(item.borough || item.city || item.neighborhood || "")
          .toLowerCase()
          .includes(String(requestedBorough).toLowerCase());
      const inBorough = rankedRestaurants.filter(isInRequestedBorough);
      const outBorough = rankedRestaurants.filter(
        (item) => !isInRequestedBorough(item),
      );
      (debug as any).boroughStrictnessApplied = true;
      (debug as any).requestedBorough = requestedBorough;
      (debug as any).inBoroughResultCount = inBorough.length;
      (debug as any).outOfBoroughResultCount = outBorough.length;
      (debug as any).outOfBoroughPenaltyApplied = outBorough.length > 0;
      (debug as any).outOfBoroughRecoveryAllowed = inBorough.length < 3;
      (debug as any).outOfBoroughRecoveryReason =
        inBorough.length < 3 ? "fewer_than_3_in_borough_matches" : null;
      rankedRestaurants =
        inBorough.length >= 3
          ? inBorough
          : [
              ...inBorough,
              ...outBorough.map((item) => ({
                ...item,
                search_recovery_reason: "out_of_borough_recovery",
              })),
            ];
    } else {
      (debug as any).boroughStrictnessApplied = false;
      (debug as any).requestedBorough = requestedBorough;
      (debug as any).inBoroughResultCount = 0;
      (debug as any).outOfBoroughResultCount = 0;
      (debug as any).outOfBoroughPenaltyApplied = false;
      (debug as any).outOfBoroughRecoveryAllowed = false;
      (debug as any).outOfBoroughRecoveryReason = null;
    }
    const dateNightDinnerIntent = isDateNightDinnerIntent(
      restaurantRankingIntent,
    );
    const explicitCafeDessertIntent = hasExplicitCafeDessertIntent(
      restaurantRankingIntent,
    );
    if (dateNightDinnerIntent && !explicitCafeDessertIntent) {
      const realDinnerRestaurants = rankedRestaurants.filter(
        (item) => !isCafeBakeryDessertQuickBiteOnly(item),
      );
      const cafeBakeryDessertOnly = rankedRestaurants.filter(
        isCafeBakeryDessertQuickBiteOnly,
      );
      rankedRestaurants =
        realDinnerRestaurants.length >= 3
          ? [...realDinnerRestaurants, ...cafeBakeryDessertOnly]
          : [...realDinnerRestaurants, ...cafeBakeryDessertOnly];
      (debug as any).dateNightDinnerSuppression = {
        applied: true,
        explicitCafeDessertIntent,
        cafeBakeryDessertSuppressedCount: cafeBakeryDessertOnly.length,
        realDinnerRestaurantCount: realDinnerRestaurants.length,
        suppressedNames: cafeBakeryDessertOnly
          .slice(0, 12)
          .map((item) => item.name || item.restaurant_name || null)
          .filter(Boolean),
      };
      (debug as any).dateNightDinnerIntent = true;
      (debug as any).explicitCafeDessertIntent = false;
      (debug as any).cafeBakeryDessertSuppressedCount =
        cafeBakeryDessertOnly.length;
      (debug as any).cafeBakeryDessertDemotedCount =
        cafeBakeryDessertOnly.length;
    } else {
      (debug as any).dateNightDinnerSuppression = {
        applied: false,
        explicitCafeDessertIntent,
        cafeBakeryDessertSuppressedCount: 0,
        realDinnerRestaurantCount: rankedRestaurants.length,
        suppressedNames: [],
      };
      (debug as any).dateNightDinnerIntent = dateNightDinnerIntent;
      (debug as any).explicitCafeDessertIntent = explicitCafeDessertIntent;
      (debug as any).cafeBakeryDessertSuppressedCount = 0;
      (debug as any).cafeBakeryDessertDemotedCount = 0;
    }
    const requestedFeatureTerms = restaurantFeatureTerms(
      restaurantRankingIntent,
    ).filter((term) =>
      /rooftop|roof|terrace|outdoor|skyline|scenic|views?|deck/i.test(term),
    );
    if (requestedFeatureTerms.length) {
      const fields = [
        "tags",
        "search_keywords",
        "semantic_tags",
        "intent_tags",
        "primary_category",
        "cuisine_type",
        "description",
        "search_document",
        "semantic_search_text",
        "vibe_tags",
        "date_style_tags",
        "best_for_tags",
      ];
      const matchesFeature = (item: EnterpriseLocation) =>
        fields
          .map((field) => {
            const value = (item as any)[field];
            return Array.isArray(value) ? value.join(" ") : String(value ?? "");
          })
          .join(" ")
          .toLowerCase()
          .replaceAll("_", " ")
          .replaceAll("-", " ")
          .match(
            /rooftop|roof top|roof deck|terrace|outdoor dining|outdoor seating|skyline|scenic views|views/,
          ) !== null ||
        requestedFeatureTerms.some((term) =>
          fields
            .map((field) => {
              const value = (item as any)[field];
              return Array.isArray(value)
                ? value.join(" ")
                : String(value ?? "");
            })
            .join(" ")
            .toLowerCase()
            .includes(term.toLowerCase()),
        );
      const featureMatches = rankedRestaurants.filter(matchesFeature);
      const featureMissing = rankedRestaurants.filter(
        (item) => !matchesFeature(item),
      );
      (debug as any).featureStrictnessApplied = true;
      (debug as any).requestedFeatureTerms = requestedFeatureTerms;
      (debug as any).featureMatchedResultCount = featureMatches.length;
      (debug as any).featureMissingPenaltyApplied = featureMissing.length > 0;
      (debug as any).featureRelaxed = featureMatches.length === 0;
      (debug as any).featureRelaxedReason =
        featureMatches.length === 0 ? "no_matching_feature_results" : null;
      rankedRestaurants = featureMatches.length
        ? [...featureMatches, ...featureMissing]
        : rankedRestaurants;
    }
    const rankedActivities = rankActivityResults(
      activityCandidatesWithMl,
      effectiveIntent,
    );
    const singleVenueWith = detectSingleVenueWithIntent(
      effectiveIntent.rawQuery,
    );
    if (singleVenueWith.matched) {
      const scoredSingleVenue = rankedRestaurants.map((restaurant) => ({
        restaurant,
        match: scoreSingleVenueWithMatch(restaurant, effectiveIntent),
      }));
      const strongDualMatches = scoredSingleVenue.filter(
        ({ match }) => match.dualMatched && match.score >= 110,
      );
      (debug as any).singleVenueWithIntentUsed = true;
      (debug as any).singleVenueWithIntentReason =
        "with_connector_single_venue";
      (debug as any).singleVenueWithVenueTerms = singleVenueWith.venueTerms;
      (debug as any).singleVenueWithFoodTerms = singleVenueWith.foodTerms;
      (debug as any).singleVenueWithFeatureTerms = singleVenueWith.featureTerms;
      (debug as any).singleVenueWithStrongDualMatchCount =
        strongDualMatches.length;
      if (strongDualMatches.length >= 3) {
        rankedRestaurants = scoredSingleVenue
          .filter(({ match }) => match.dualMatched)
          .map(({ restaurant }) => restaurant);
      } else {
        (debug as any).singleVenueWithLooseMatchesUsed = true;
      }
    }
    perf.ranking_ms = Date.now() - rankStarted;

    (debug as any).topRestaurantNames = rankedRestaurants
      .slice(0, 5)
      .map(
        (restaurant) => restaurant.name || restaurant.restaurant_name || null,
      )
      .filter(Boolean);
    (debug as any).topRestaurantCategories = rankedRestaurants
      .slice(0, 5)
      .map(
        (restaurant) =>
          restaurant.primary_category ||
          restaurant.cuisine_type ||
          restaurant.cuisine ||
          null,
      )
      .filter(Boolean);

    const restaurantQualityScorePreview = rankedRestaurants
      .slice(0, 12)
      .map((restaurant) => ({
        name: restaurant.name || restaurant.restaurant_name || null,
        score: Number((restaurant as any).restaurantQualityScore ?? 0),
        reasons: ((restaurant as any).restaurantQualityReasons ?? []).slice(
          0,
          8,
        ),
        penalties: ((restaurant as any).restaurantQualityPenalties ?? []).slice(
          0,
          8,
        ),
      }));
    const restaurantOutingFitScorePreview = rankedRestaurants
      .slice(0, 12)
      .map((restaurant) => ({
        name: restaurant.name || restaurant.restaurant_name || null,
        qualityScore: Number((restaurant as any).restaurantQualityScore ?? 0),
        outingFitScore: Number(
          (restaurant as any).restaurantOutingFitScore ?? 0,
        ),
        reasons: (
          (restaurant as any).restaurantOutingFitReasons ??
          (restaurant as any).restaurantQualityReasons ??
          []
        ).slice(0, 8),
        penalties: (
          (restaurant as any).restaurantOutingFitPenalties ??
          (restaurant as any).restaurantQualityPenalties ??
          []
        ).slice(0, 8),
      }));
    const activityQualityScorePreview = rankedActivities
      .slice(0, 12)
      .map((activity) => ({
        name: activity.name || activity.activity_name || null,
        score: Number((activity as any).activityQualityScore ?? 0),
        reasons: ((activity as any).activityQualityReasons ?? []).slice(0, 8),
        penalties: ((activity as any).activityQualityPenalties ?? []).slice(
          0,
          8,
        ),
      }));
    const photoStarted = Date.now();
    const requestedMarketForResults =
      (effectiveIntent.geo as any).resolvedMarket ||
      (effectiveIntent.geo as any).requestedMarket ||
      null;
    const explicitMarketRequested =
      isExplicitMarket(requestedMarketForResults) &&
      (effectiveIntent.geo as any).explicitMarketRequested !== false;
    const useLocationFitForLongIsland = requestedMarketForResults === "LONG_ISLAND";
    const suppressMarketMismatch = (item: EnterpriseLocation) => {
      if (!requestedMarketForResults || useLocationFitForLongIsland) return false;
      if (
        explicitMarketRequested &&
        !isResultAllowedForResolvedMarket(item, requestedMarketForResults)
      )
        return true;
      const validation = validatePlaceForMarket({
        requestedMarket: requestedMarketForResults,
        city: (item as any).city,
        state: (item as any).state,
        county: (item as any).county,
        borough: (item as any).borough,
        neighborhood: (item as any).neighborhood,
        address: (item as any).address,
      });
      return !validation.ok;
    };
    const rejectedForMarketGuardrail = useLocationFitForLongIsland
      ? []
      : [
          ...rankedRestaurants,
          ...rankedActivities,
        ].filter(
          (item) =>
            explicitMarketRequested &&
            !isResultAllowedForResolvedMarket(item, requestedMarketForResults),
        );
    const marketSafeRestaurants = rankedRestaurants
      .filter((item) => !suppressMarketMismatch(item))
      .map((item) => withMarketFit(item, requestedMarketForResults));
    const marketSafeActivities = rankedActivities
      .filter((item) => !suppressMarketMismatch(item))
      .map((item) => withMarketFit(item, requestedMarketForResults));

    const intentBoostedRestaurants = await applyIntentBoostsToLocations(marketSafeRestaurants, query, requestedMarketForResults);
    const intentBoostedActivities = await applyIntentBoostsToLocations(marketSafeActivities, query, requestedMarketForResults);
    const photoSafeRestaurants = filterLivePhotoResults(intentBoostedRestaurants);
    const photoSafeActivities = filterLivePhotoResults(intentBoostedActivities);

    const photoSuppressedRestaurants = marketSafeRestaurants.filter(
      (item) => !hasUsableLivePhoto(item),
    );
    const photoSuppressedActivities = marketSafeActivities.filter(
      (item) => !hasUsableLivePhoto(item),
    );

    const suppressedMarketMismatchCount =
      rankedRestaurants.length -
      marketSafeRestaurants.length +
      (rankedActivities.length - marketSafeActivities.length);
    const marketFitItems = [...marketSafeRestaurants, ...marketSafeActivities];
    const requestedMarketActivityCount = marketSafeActivities.filter(
      (item: any) => item._marketFitBucket === "requested",
    ).length;
    const nearbyActivityCount = marketSafeActivities.filter(
      (item: any) => item._marketFitBucket === "nearby",
    ).length;
    const fallbackActivityCount = marketSafeActivities.filter(
      (item: any) => item._marketFitBucket === "fallback",
    ).length;
    const locationSuppressedActivitiesSample = useLocationFitForLongIsland
      ? []
      : rejectedForMarketGuardrail
          .filter((item: any) => item.activity_name || item.location_type === "activity")
          .slice(0, 8)
          .map((item) => ({
            name: item.name || item.activity_name || null,
            market: (item as any).market ?? null,
            state: item.state ?? null,
            city: item.city ?? null,
            county: (item as any).county ?? null,
            reason: getMarketGuardrailRejectionReason(
              item,
              requestedMarketForResults,
            ),
          }));
    const nearbyIncludedActivitiesSample = marketSafeActivities
      .filter((item: any) => item._marketFitBucket === "nearby")
      .slice(0, 8)
      .map((item: any) => ({
        name: item.name || item.activity_name || null,
        market: item.market ?? null,
        state: item.state ?? null,
        city: item.city ?? null,
        county: item.county ?? null,
        _marketFitBucket: item._marketFitBucket,
        _marketFitReason: item._marketFitReason,
        _marketFitLabel: item._marketFitLabel,
      }));

    const marketGuardrailRejected = rejectedForMarketGuardrail.length;

    const imageDebugFor = (item: EnterpriseLocation) => {
      const record = item as any;

      return {
        name: item.name || item.restaurant_name || item.activity_name || null,
        market: record.market ?? null,
        state: item.state ?? null,
        city: item.city ?? null,
        county: record.county ?? null,
        borough: item.borough ?? null,
        has_photos: record.has_photos ?? null,
        photo_status: record.photo_status ?? null,
        image_url: Boolean(firstSearchImage(record.image_url)),
        main_image: Boolean(firstSearchImage(record.main_image)),
        photo_url: Boolean(firstSearchImage(record.photo_url)),
        primary_photo_url: Boolean(firstSearchImage(record.primary_photo_url)),
        google_photo_url: Boolean(firstSearchImage(record.google_photo_url)),
        images: Boolean(firstSearchImage(record.images)),
        gallery_images: Boolean(firstSearchImage(record.gallery_images)),
        photos: Boolean(firstSearchImage(record.photos)),
        photo_urls: Boolean(firstSearchImage(record.photo_urls)),
        google_photos: Boolean(firstSearchImage(record.google_photos)),
      };
    };

    const sampleRejectedMarkets = rejectedForMarketGuardrail
      .slice(0, 8)
      .map((item) => ({
        ...imageDebugFor(item),
        reason: getMarketGuardrailRejectionReason(
          item,
          requestedMarketForResults,
        ),
      }));

    (debug as any).rankedRestaurantCountBeforeMarketGuardrail =
      rankedRestaurants.length;
    (debug as any).rankedActivityCountBeforeMarketGuardrail =
      rankedActivities.length;
    (debug as any).marketSafeRestaurantCount = marketSafeRestaurants.length;
    (debug as any).mlPhase2Intent = classifySearchIntent(query);
    (debug as any).marketSafeActivityCount = marketSafeActivities.length;
    (debug as any).photoSafeRestaurantCount = photoSafeRestaurants.length;
    (debug as any).photoSafeActivityCount = photoSafeActivities.length;
    (debug as any).photoSuppressedRestaurantCount =
      photoSuppressedRestaurants.length;
    (debug as any).photoSuppressedActivityCount =
      photoSuppressedActivities.length;
    (debug as any).samplePhotoSuppressedRestaurants =
      photoSuppressedRestaurants.slice(0, 8).map(imageDebugFor);
    (debug as any).samplePhotoSuppressedActivities = photoSuppressedActivities
      .slice(0, 8)
      .map(imageDebugFor);
    (debug as any).sampleRejectedMarkets = sampleRejectedMarkets;
    (debug as any).marketGuardrailRejected = marketGuardrailRejected;
    (debug as any).suppressedMarketMismatchCount =
      suppressedMarketMismatchCount;
    (debug as any).requestedMarketActivityCount =
      requestedMarketActivityCount;
    (debug as any).nearbyActivityCount = nearbyActivityCount;
    (debug as any).fallbackActivityCount = fallbackActivityCount;
    (debug as any).locationSuppressedActivitiesSample =
      locationSuppressedActivitiesSample;
    (debug as any).nearbyIncludedActivitiesSample =
      nearbyIncludedActivitiesSample;
    (debug as any).locationFitBucketCounts = marketFitItems.reduce(
      (acc: Record<string, number>, item: any) => {
        const bucket = item._marketFitBucket ?? "unknown";
        acc[bucket] = (acc[bucket] ?? 0) + 1;
        return acc;
      },
      {},
    );

    let restaurants = photoSafeRestaurants.slice(0, displayLimit);
    let activities = photoSafeActivities.slice(0, displayLimit);
    const candidateRestaurantCountBeforeRequiredPairSuppression =
      restaurants.length;
    const candidateActivityCountBeforeRequiredPairSuppression =
      activities.length;
    const suppressedLowQualityRestaurantCount = rankedRestaurants.filter(
      (restaurant) =>
        Number((restaurant as any).restaurantQualityScore ?? 0) < 0 &&
        !restaurants.some((shown) => shown.id === restaurant.id),
    ).length;
    const suppressedLowQualityActivityCount = rankedActivities.filter(
      (activity) =>
        Number((activity as any).activityQualityScore ?? 0) < 0 &&
        !activities.some((shown) => shown.id === activity.id),
    ).length;
    perf.photo_filter_ms = Date.now() - photoStarted;

    const pairingDebug = createPairingDebug();
    const pairingStarted = Date.now();
    const pairedResults = effectiveIntent.wantsPairing
      ? createSearchPairs(
          restaurants,
          activities,
          effectiveIntent,
          pairingDebug,
        ).filter(
          (pair) =>
            hasUsableLivePhoto(pair.restaurant) &&
            hasUsableLivePhoto(pair.activity),
        )
      : [];
    let pairs = (await applyPairBoosts(pairedResults, query, requestedMarketForResults))
      .filter(
        (pair) =>
          requestedMarketForResults === "LONG_ISLAND" ||
          isPairAllowedForResolvedMarket(pair, requestedMarketForResults),
      )
      .filter((pair) => {
        const walkingLimitCheck = shouldHidePairForWalkingLimit(
          pair,
          effectiveIntent.pairingPreference,
        );

        if (walkingLimitCheck.hide) {
          const reason = walkingLimitCheck.reason ?? "walking_limit_exceeded";
          pairingDebug.walkingPairsHiddenOverLimit =
            (pairingDebug.walkingPairsHiddenOverLimit ?? 0) + 1;
          pairingDebug.walkingPairRejectReasons =
            pairingDebug.walkingPairRejectReasons ?? {};
          pairingDebug.walkingPairRejectReasons[reason] =
            (pairingDebug.walkingPairRejectReasons[reason] ?? 0) + 1;
        }

        return !walkingLimitCheck.hide;
      });
    perf.pairing_ms = Date.now() - pairingStarted;
    const candidatePairCountBeforeRequiredPairSuppression = pairs.length;
    const fallbackSuppressedBecauseExplicitMarket =
      explicitMarketRequested &&
      (marketGuardrailRejected > 0 || suppressedMarketMismatchCount > 0);
    const requiredPairingSuppressedFallback =
      requiresStrictMixedPair(effectiveIntent) &&
      pairs.length === 0 &&
      restaurants.length === 0 &&
      activities.length === 0 &&
      !(
        explicitMarketRequested &&
        requestedMarketForResults === "LONG_ISLAND" &&
        (restaurants.length > 0 || activities.length > 0)
      );
    const requiredPairingFailureReasonValue = requiredPairingSuppressedFallback
      ? requiredPairingFailureReason(
          candidateRestaurantCountBeforeRequiredPairSuppression,
          candidateActivityCountBeforeRequiredPairSuppression,
          candidatePairCountBeforeRequiredPairSuppression,
          effectiveIntent,
        )
      : null;

    if (requiredPairingSuppressedFallback) {
      restaurants = [];
      activities = [];
      pairs = [];
    }

    const matched_locations = requiredPairingSuppressedFallback
      ? []
      : uniqueById([...restaurants, ...activities]).slice(0, displayLimit * 2);
    const render_mode = requiredPairingSuppressedFallback
      ? "empty"
      : effectiveIntent.wantsPairing
        ? pairs.length
          ? "mixed_pairs"
          : restaurants.length || activities.length
            ? "partial_mixed"
            : "empty"
        : restaurants.length
          ? "restaurant_cards"
          : activities.length
            ? "activity_cards"
            : "empty";
    const card_counts = {
      restaurants: restaurants.length,
      activities: activities.length,
      matched_locations: matched_locations.length,
      pairs: pairs.length,
    };
    const pairDisplayLabels = pairs
      .map((pair) =>
        formatDistanceFromRestaurant({
          pair,
          restaurantName:
            pair.restaurant.name ||
            pair.restaurant.restaurant_name ||
            "Restaurant",
          pairingPreference: effectiveIntent.pairingPreference,
        }),
      )
      .filter((label): label is string => Boolean(label));
    const displayedWalkingMinuteLabels = pairDisplayLabels.filter((label) =>
      /\b\d+\s+min walk from\b/i.test(label),
    ).length;
    const displayedMilesLabels = pairDisplayLabels.filter((label) =>
      /\b\d+(?:\.\d+)?\s+mi from\b/i.test(label),
    ).length;
    const walkingRequested = userAskedForWalking(
      effectiveIntent.pairingPreference,
    );
    const walkingMinutesEstimatedFromMiles = pairs.filter(
      (pair) =>
        walkingRequested &&
        getRawWalkingMinutes(pair) == null &&
        getSafeWalkingMinutes(pair) != null &&
        getPairDistanceMiles(pair) != null,
    ).length;
    const pairsWithGoogleWalkingMinutes = pairs.filter(
      (pair) => getRawWalkingMinutes(pair) != null,
    ).length;
    const pairsMissingGoogleWalkingMinutes =
      pairs.length - pairsWithGoogleWalkingMinutes;
    const pairCityStates = pairs.map((pair) => getPairCityState(pair));
    const pairGeoPriorities = pairs.map((pair) =>
      getPairGeoPriority(pair, effectiveIntent.geo),
    );
    const pairGeoSummary = {
      sameCityPairs: pairCityStates.filter(
        (pair) => pair.samePairCity && pair.samePairState,
      ).length,
      sameStatePairs: pairCityStates.filter((pair) => pair.samePairState)
        .length,
      differentCityPairs: pairCityStates.filter(
        (pair) =>
          pair.restaurantCity &&
          pair.activityCity &&
          pair.restaurantCity !== pair.activityCity,
      ).length,
      differentStatePairs: pairCityStates.filter(
        (pair) =>
          pair.restaurantState &&
          pair.activityState &&
          pair.restaurantState !== pair.activityState,
      ).length,
      missingCoordinatePairs: pairCityStates.filter(
        (pair) => !pair.hasBothCoords,
      ).length,
    };
    const longIslandSinglesFallbackMessage =
      explicitMarketRequested &&
      requestedMarketForResults === "LONG_ISLAND" &&
      pairs.length === 0 &&
      (restaurants.length > 0 || activities.length > 0)
        ? "We found Long Island picks, but we’re still building more complete outing pairings."
        : null;
    const noPairsReason =
      requiredPairingFailureReasonValue ??
      (effectiveIntent.wantsPairing && pairs.length < MIN_PAIR_RESULTS && restaurants.length > 0 && activities.length > 0
        ? "pair_count_below_recovery_threshold"
        : effectiveIntent.wantsPairing && restaurants.length > 0 && activities.length === 0
          ? "no_activity_results_for_required_pair"
          : effectiveIntent.wantsPairing && activities.length > 0 && restaurants.length === 0
            ? "no_restaurant_results_for_required_pair"
            : null) ??
      (effectiveIntent.wantsPairing &&
      pairs.length === 0 &&
      activities.length > 0 &&
      restaurants.length > 0 &&
      (effectiveIntent.pairingPreference?.distanceMode === "walking" ||
        effectiveIntent.pairingPreference?.distanceMode === "short_walk" ||
        effectiveIntent.pairingPreference?.requireWalkablePair === true)
        ? "no_pairs_within_walking_distance"
        : null);
    perf.total_ms = Date.now() - started;
    const locationArea =
      effectiveIntent.geo.neighborhood ??
      effectiveIntent.geo.borough ??
      effectiveIntent.geo.city ??
      effectiveIntent.geo.county ??
      effectiveIntent.geo.raw ??
      null;
    const speedStatus = getSearchSpeedStatus({
      totalMs: perf.total_ms,
      success: true,
    });
    const performanceDebug = {
      ...perf,
      speed_status: speedStatus,
      result_count: matched_locations.length,
      restaurant_count: restaurants.length,
      activity_count: activities.length,
      pair_count: pairs.length,
      source: options?.source ?? "enterprise_search",
      route: options?.route ?? null,
      used_custom_prompt: Boolean(options?.usedCustomPrompt),
      intentParserSource: parserDebug.intentParserSource ?? intentParserSource,
      parser_source: parserDebug.intentParserSource ?? intentParserSource,
      fastPathMatched,
      fastPathReason,
      searchType: effectiveIntent.searchType,
      primaryDomain: effectiveIntent.primaryDomain,
      wantsPairing: effectiveIntent.wantsPairing,
      needsRestaurant: effectiveIntent.needsRestaurant,
      needsActivity: effectiveIntent.needsActivity,
      beta_assignment_id: options?.betaAssignmentId ?? null,
      beta_tester_id: options?.betaTesterId ?? null,
    };
    if (process.env.NODE_ENV !== "production" && explicitMarketRequested) {
      console.log("[enterprise-search] market guardrail", {
        rawQuery: query,
        resolvedMarket: requestedMarketForResults,
        marketFilterApplied: true,
        countBeforeGuardrail:
          rankedRestaurants.length + rankedActivities.length,
        countAfterGuardrail:
          marketSafeRestaurants.length + marketSafeActivities.length,
        sampleRejectedMarkets,
      });
    }
    const fullDebug = {
      search_system: "enterprise-search-v1",
      rawQuery: query,
      rawQueryForDebug: query,
      llmIntentRaw,
      intentParserSource: parserDebug.intentParserSource ?? intentParserSource,
      parser_source: parserDebug.intentParserSource ?? intentParserSource,
      fastPathMatched,
      fastPathReason,
      searchType: effectiveIntent.searchType,
      primaryDomain: effectiveIntent.primaryDomain,
      wantsPairing: effectiveIntent.wantsPairing,
      needsRestaurant: effectiveIntent.needsRestaurant,
      needsActivity: effectiveIntent.needsActivity,
      preIntentSource: parserDebug.preIntentSource,
      preIntentMatched: parserDebug.preIntentMatched,
      preIntentReason: parserDebug.preIntentReason,
      intentLlmModel: parserDebug.intentLlmModel,
      intentLlmFastModel: parserDebug.intentLlmFastModel,
      intentLlmFallbackModel: parserDebug.intentLlmFallbackModel,
      llmEnhancementUsed: parserDebug.llmEnhancementUsed,
      llmFallbackUsed: parserDebug.llmFallbackUsed,
      llmTimedOut: parserDebug.llmTimedOut,
      fallbackIntentUsed: parserDebug.fallbackIntentUsed,
      intentCacheHit: parserDebug.intentCacheHit,
      intentCacheVersion: parserDebug.intentCacheVersion,
      normalizedIntent: effectiveIntent,
      restaurantRankingIntent,
      restaurantRecoveryReason: debug.restaurantRecoveryReason ?? null,
      restaurantRecoveryTermsTried: debug.restaurantRecoveryTermsTried ?? [],
      restaurantRecoveryAttemptResults:
        debug.restaurantRecoveryAttemptResults ?? [],
      restaurantRecoveryRelaxedFood: Boolean(
        debug.restaurantRecoveryRelaxedFood,
      ),
      restaurantRecoveryRelaxedFeature: Boolean(
        debug.restaurantRecoveryRelaxedFeature,
      ),
      restaurantRecoverySucceeded: Boolean(debug.restaurantRecoverySucceeded),
      restaurantTerms: restaurantSearchTerms(effectiveIntent),
      activityTerms: activitySearchTerms(effectiveIntent),
      geo: marketResolution.effectiveGeo,
      originalGeo: marketResolution.originalGeo,
      effectiveGeo: marketResolution.effectiveGeo,
      defaultMarketApplied: marketResolution.marketApplied,
      defaultMarketId: marketResolution.market?.id ?? null,
      defaultMarketLabel: marketResolution.market?.label ?? null,
      defaultMarketRadiusMiles: marketResolution.market?.radiusMiles ?? null,
      marketReason: marketResolution.marketReason,
      geoSource,
      ...requestNearMeDebug,
      resolvedMarket: requestedMarketForResults,
      explicitMarketRequested,
      fallbackSuppressedBecauseExplicitMarket,
      marketGuardrailRejected,
      sampleRejectedMarkets,
      rankedRestaurantCountBeforeMarketGuardrail:
        rankedRestaurants.length,
      rankedActivityCountBeforeMarketGuardrail: rankedActivities.length,
      marketSafeRestaurantCount: marketSafeRestaurants.length,
      marketSafeActivityCount: marketSafeActivities.length,
      photoSafeRestaurantCount: photoSafeRestaurants.length,
      photoSafeActivityCount: photoSafeActivities.length,
      photoSuppressedRestaurantCount: photoSuppressedRestaurants.length,
      photoSuppressedActivityCount: photoSuppressedActivities.length,
      samplePhotoSuppressedRestaurants: photoSuppressedRestaurants
        .slice(0, 8)
        .map(imageDebugFor),
      samplePhotoSuppressedActivities: photoSuppressedActivities
        .slice(0, 8)
        .map(imageDebugFor),
      parsedMarket: requestedMarketForResults,
      parsedBorough: effectiveIntent.geo.borough ?? null,
      parsedCity: effectiveIntent.geo.city ?? null,
      finalResultMarketsReturned: Array.from(
        new Set(
          [...restaurants, ...activities].map(
            (item: any) => `${item.market || "UNKNOWN"}:${item.state || ""}`,
          ),
        ),
      ),
      rpcGeoLatitude: marketResolution.effectiveGeo.latitude ?? null,
      rpcGeoLongitude: marketResolution.effectiveGeo.longitude ?? null,
      rpcRadiusMiles: marketResolution.effectiveGeo.radiusMiles ?? null,
      ...parserDebug,
      ...debug,
      restaurantRejectedReasons,
      activityRejectedReasons,
      restaurantRejectedSummary,
      activityRejectedSummary,
      distanceScoringUsed: Boolean(
        effectiveIntent.geo.latitude && effectiveIntent.geo.longitude,
      ),
      pairDistanceMiles: pairs.map((p) => p.pairDistanceMiles),
      pairGeoPriorities,
      pairGeoSummary,
      restaurantQualityScoringApplied: true,
      activityQualityScoringApplied: true,
      pairQualityScoringApplied: true,
      restaurantQualityScorePreview,
      activityQualityScorePreview,
      pairQualityScorePreview: pairingDebug.pairQualityScorePreview,
      restaurantOutingFitScorePreview,
      weakOutingFitRestaurantCount: pairingDebug.weakOutingFitRestaurantCount,
      suppressedWeakOutingFitPairCount:
        pairingDebug.suppressedWeakOutingFitPairCount,
      pairQualityTierCounts: pairingDebug.pairQualityTierCounts,
      suppressedLowQualityRestaurantCount,
      suppressedLowQualityActivityCount,
      suppressedMarketMismatchCount,
      marketMismatchResultCount: suppressedMarketMismatchCount,
      marketStateMismatchCount: suppressedMarketMismatchCount,
      suppressedLowQualityPairCount: pairingDebug.suppressedLowQualityPairCount,
      finalPairSortReason: pairingDebug.finalPairSortReason,
      renderedPairSort: {
        primary: "default_market_pair_priority",
        secondary: "geo_priority",
        tertiary: "pair_quality_tier",
        quaternary: "pair_distance_miles",
        quinary: "safe_walking_minutes",
        senary: "pair_quality_score",
      },
      walkingPolicy: {
        shortWalkMaxPairDistanceMiles: 0.75,
        shortWalkMaxPairWalkingMinutes: 15,
        walkingMaxPairDistanceMiles: 1.5,
        walkingMaxPairWalkingMinutes: 30,
        walkingMinutesToMilesBasis: "20_minutes_per_mile",
        explicitWalkingMinutesSupported: true,
        explicitWalkingMinutesMax: 45,
        missingCoordinateFallback: true,
        googleWalkingRouteAuthoritative: true,
        extremeWalkingRouteMinuteCutoff: 180,
      },
      pairingPreference: effectiveIntent.pairingPreference,
      countBeforeMarketGuardrail:
        rankedRestaurants.length + rankedActivities.length,
      countAfterMarketGuardrail:
        marketSafeRestaurants.length + marketSafeActivities.length,
      restaurantCount: restaurants.length,
      activityCount: activities.length,
      sampleReturnedMarkets: Array.from(
        new Set(
          [...restaurants, ...activities].map(
            (item: any) => `${item.market || "UNKNOWN"}:${item.state || ""}`,
          ),
        ),
      ).slice(0, 8),
      supabaseFiltersApplied: {
        market: requestedMarketForResults,
        state: requestedMarketForResults === "NORTHERN_NJ" ? "NJ" : "NY",
        is_searchable: true,
        city: null,
        borough: null,
        address: null,
      },
      longIslandSinglesFallbackMessage,
      activityRpcCountBeforePairing: activities.length,
      activityRpcCountAfterRecovery: activityRaw.length,
      activityRpcCountBeforeRecovery: activityRpcCountBeforeRecovery,
      pairCandidatesEvaluated: pairingDebug.pairCandidatesEvaluated,
      validPairCountBeforeRender: pairingDebug.validPairCountBeforeRender,
      pair_count: pairs.length,
      pairsRejectedForDistance: pairingDebug.pairsRejectedForDistance,
      pairsRejectedForWalkingMinutes:
        pairingDebug.pairsRejectedForWalkingMinutes,
      walkingPairsHiddenOverLimit: pairingDebug.walkingPairsHiddenOverLimit,
      walkingPairRejectReasons: pairingDebug.walkingPairRejectReasons,
      extremeWalkingRoutesRejected: pairingDebug.extremeWalkingRoutesRejected,
      walkingMinutesEstimatedFromMiles,
      pairsWithGoogleWalkingMinutes,
      pairsMissingGoogleWalkingMinutes,
      displayedWalkingMinuteLabels,
      displayedMilesLabels,
      invalidWalkingRoutesHiddenFromDisplay:
        pairingDebug.invalidWalkingRoutesHiddenFromDisplay,
      pairsRejectedForMissingCoordinates:
        pairingDebug.pairsRejectedForMissingCoordinates,
      rejectedPairs: pairingDebug.rejectedPairs,
      walkablePairsFound: pairingDebug.walkablePairsFound,
      noPairsReason,
      no_pairs_reason: noPairsReason,
      recoveryLayerUsed: Boolean(debug.restaurantRecoveryUsed || debug.activityRecoveryUsed),
      recoverySucceeded: Boolean(debug.restaurantRecoverySucceeded || (debug as any).activityRecoverySucceeded),
      recoveryLevel: (debug as any).activityRecoveryLevel ?? null,
      partialResultsReturned: effectiveIntent.wantsPairing && pairs.length < MIN_PAIR_RESULTS && (restaurants.length > 0 || activities.length > 0),
      pairRecoveryNeeded: effectiveIntent.wantsPairing && pairs.length < MIN_PAIR_RESULTS,
      budgetIntentDetected: budgetIntentDetected(effectiveIntent),
      budgetHardFilterDisabled: budgetIntentDetected(effectiveIntent),
      budgetRankingPreferenceApplied: budgetIntentDetected(effectiveIntent),
      requiredPairingSuppressedFallback,
      requiredPairingFailureReason: requiredPairingFailureReasonValue,
      candidateRestaurantCountBeforeRequiredPairSuppression,
      candidateActivityCountBeforeRequiredPairSuppression,
      candidatePairCountBeforeRequiredPairSuppression,
      finalDisplayedResultCount: matched_locations.length,
      maxPairDistanceMiles:
        effectiveIntent.pairingPreference?.maxPairDistanceMiles ?? null,
      maxPairWalkingMinutes:
        effectiveIntent.pairingPreference?.maxPairWalkingMinutes ?? null,
      requireWalkablePair:
        effectiveIntent.pairingPreference?.requireWalkablePair ?? false,
      distanceMode: effectiveIntent.pairingPreference?.distanceMode ?? "any",
      renderMode: render_mode,
      timingMs: perf.total_ms,
      performance: performanceDebug,
      restaurantRecoveryUsed: Boolean(debug.restaurantRecoveryUsed),
      activityRecoveryUsed: Boolean(debug.activityRecoveryUsed),
      llmError,
    };
    if (options?.logPerformance) {
      void logSearchPerformance({
        userId: options.userId,
        sessionId: options.sessionId,
        source: options.source ?? "enterprise_search",
        route: options.route ?? null,
        searchQuery: query,
        betaAssignmentId: options.betaAssignmentId,
        betaTesterId: options.betaTesterId,
        usedCustomPrompt: options.usedCustomPrompt,
        parsedIntent: effectiveIntent,
        searchMode: render_mode,
        locationArea,
        startedAt,
        completedAt: new Date(),
        totalMs: perf.total_ms,
        llmMs: perf.llm_ms,
        rpcMs: perf.rpc_ms,
        restaurantRpcMs: perf.restaurant_rpc_ms,
        activityRpcMs: perf.activity_rpc_ms,
        rankingMs: perf.ranking_ms,
        pairingMs: perf.pairing_ms,
        photoFilterMs: perf.photo_filter_ms,
        resultCount: matched_locations.length,
        restaurantCount: restaurants.length,
        activityCount: activities.length,
        pairCount: pairs.length,
        usedLlm,
        usedFallback,
        success: true,
        debug: options.betaDebug ? performanceDebug : null,
      });
    }
    const responseDebug = options?.betaDebug
      ? fullDebug
      : productionSafeDebug(fullDebug);
    const emptyExplicitLongIsland =
      requestedMarketForResults === "LONG_ISLAND" &&
      matched_locations.length === 0;
    const responseReply =
      longIslandSinglesFallbackMessage ??
      (emptyExplicitLongIsland
        ? "We’re still expanding Long Island picks. Try a broader search like ‘dinner and activity in Long Island’ or check back soon."
        : replyFor(restaurants, activities, pairs, effectiveIntent, {
            used: Boolean(debug.neighborhoodRecoveryUsed),
            from: debug.neighborhoodRecoveryFrom ?? null,
            to: debug.neighborhoodRecoveryTo ?? null,
          }));
    const response: EnterpriseSearchResult = {
      success: true,
      reply: responseReply,
      restaurants,
      activities,
      pairs,
      matched_locations,
      matchedLocations: matched_locations,
      render_mode,
      renderMode: render_mode,
      card_counts,
      cardCounts: card_counts,
      debug: responseDebug,
    };
    void logSearchHealthEvent({
      source: options?.source ?? "enterprise_search",
      rawQuery: query,
      result: response,
      debug: fullDebug,
      createdByUserId: options?.createdByUserId ?? options?.userId ?? null,
      betaAssignmentId: options?.betaAssignmentId ?? null,
      betaTesterId: options?.betaTesterId ?? null,
      debugMode: Boolean(options?.searchHealthDebug ?? options?.betaDebug),
      betaFeedbackSubmitted: options?.betaFeedbackSubmitted === true,
    });
    return response;
  } catch (error) {
    const totalMs = Date.now() - started;
    if (options?.logPerformance) {
      void logSearchPerformance({
        userId: options.userId,
        sessionId: options.sessionId,
        source: options.source ?? "enterprise_search",
        route: options.route ?? null,
        searchQuery: query,
        betaAssignmentId: options.betaAssignmentId,
        betaTesterId: options.betaTesterId,
        usedCustomPrompt: options.usedCustomPrompt,
        parsedIntent,
        startedAt,
        completedAt: new Date(),
        totalMs,
        usedLlm,
        success: false,
        errorMessage: errorMessageForDebug(error),
      });
    }
    void logSearchHealthEvent({
      source: options?.source ?? "enterprise_search",
      rawQuery: query,
      result: {
        success: false,
        restaurants: [],
        activities: [],
        pairs: [],
        render_mode: "empty",
        debug: {
          normalizedIntent: parsedIntent,
          performance: {
            total_ms: totalMs,
            speed_status: getSearchSpeedStatus({ totalMs, success: false }),
          },
        },
      },
      debug: {
        normalizedIntent: parsedIntent,
        error: serializeErrorForDebug(error),
        rawQuery: query,
        performance: {
          total_ms: totalMs,
          speed_status: getSearchSpeedStatus({ totalMs, success: false }),
        },
      },
      errors: [errorMessageForDebug(error)],
      timingMs: totalMs,
      speedStatus: getSearchSpeedStatus({ totalMs, success: false }),
      createdByUserId: options?.createdByUserId ?? options?.userId ?? null,
      betaAssignmentId: options?.betaAssignmentId ?? null,
      betaTesterId: options?.betaTesterId ?? null,
      debugMode: Boolean(options?.searchHealthDebug ?? options?.betaDebug),
      betaFeedbackSubmitted: options?.betaFeedbackSubmitted === true,
    });
    throw error;
  }
}
export * from "./types";
export * from "./normalize-intent";
export * from "./ranking";
export * from "./pairing";
export * from "./distance";
export * from "./geo-taxonomy";
export * from "./markets";
