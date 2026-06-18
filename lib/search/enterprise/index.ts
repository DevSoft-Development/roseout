import { supabaseAdmin } from "../../supabaseAdmin";
import type { EnterpriseLocation, EnterpriseSearchResult, SearchIntent } from "./types";
import { parseEnterpriseIntent } from "./intent-parser";
import { activitySearchTerms, isBroadGenericActivityIntent, restaurantSearchTerms } from "./normalize-intent";
import { detectSingleVenueWithIntent, hasRooftopRestaurantFeatureLanguage } from "./taxonomy";
import { explainRejection, filterActivityResults, filterRestaurantResults, rankActivityResults, rankRestaurantResults, scoreSingleVenueWithMatch } from "./ranking";
import { createPairingDebug, createSearchPairs, getPairCityState, getPairGeoPriority } from "./pairing";
import { formatDistanceFromRestaurant, getPairDistanceMiles, getRawWalkingMinutes, getSafeWalkingMinutes, shouldHidePairForWalkingLimit, userAskedForWalking } from "./distance";
import { createRpcDebug, recoverEnterpriseLane, searchEnterpriseLane } from "./rpc";
import { productionSafeDebug } from "./debug";
import { getSearchSpeedStatus, logSearchPerformance } from "@/lib/search/performance";
import { resolveSearchMarket, type UserSearchLocation } from "./markets";
import { detectGeoIntent } from "./geo-taxonomy";
import { logSearchHealthEvent } from "./searchHealthLogger";
import { parseOutingDateTime } from "../parse-outing-date-time";
import { validatePlaceForMarket } from "../../location-market-validation";
import { getMarketGuardrailRejectionReason, isExplicitMarket, isPairAllowedForResolvedMarket, isResultAllowedForResolvedMarket } from "../market-guardrails";


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
function firstImage(value: unknown): string | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstImage(item);
      if (image) return image;
    }
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (
      !trimmed ||
      ["null", "undefined", "none", "n/a", "placeholder", "#", "?"].includes(
        trimmed.toLowerCase(),
      )
    ) {
      return null;
    }

    if (
      trimmed.toLowerCase().includes("placeholder") ||
      trimmed.toLowerCase().includes("/placeholder")
    ) {
      return null;
    }

    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        return firstImage(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }

    return trimmed
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .find((item) => {
        const lower = item.toLowerCase();
        return (
          item.length > 8 &&
          !["null", "undefined", "none", "n/a", "placeholder", "#", "?"].includes(
            lower,
          ) &&
          !lower.includes("placeholder")
        );
      }) || null;
  }

  if (typeof value === "object") {
    const record = value as any;
    return firstImage(record.url || record.src || record.image_url || record.main_image);
  }

  return null;
}

function hasUsableLivePhoto(location: EnterpriseLocation) {
  return Boolean(
    firstImage(location.image_url) ||
      firstImage(location.main_image) ||
      firstImage(location.images) ||
      firstImage(location.gallery_images),
  );
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

function uniqueById(items: EnterpriseLocation[]) { const seen=new Set<string>(); return items.filter((item)=>{ const key=String(item.id ?? item.name ?? Math.random()); if (seen.has(key)) return false; seen.add(key); return true; }); }
function hasPairConstraint(intent: SearchIntent) { return Boolean(intent.pairingPreference && intent.pairingPreference.distanceMode !== "any"); }
function isRooftopDrinksIntent(intent: SearchIntent) { return /\brooftop\s+(drinks?|cocktails?|bar|lounge)|\b(rooftop drinks|rooftop bar|rooftop lounge)\b/i.test(intent.rawQuery) || intent.activityIntent.activityTerms.some((term) => ["rooftop drinks", "rooftop bar", "rooftop lounge"].includes(term.toLowerCase())); }
const ROOFTOP_ACTIVITY_RECOVERY_TERMS = ["rooftop", "rooftop bar", "rooftop lounge", "drinks", "cocktails", "bar", "lounge"];
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
        .map((value) => String(value || "").trim().toLowerCase())
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
    /\b(rooftop|roof top|roof deck|terrace|patio|outdoor dining|outdoor seating|skyline|skyline views|scenic views|waterfront|waterfront views|views|live music)\b/i.test(q) ||
    /\b(rooftop|roof top|roof deck|terrace|patio|outdoor dining|outdoor seating|skyline|scenic views|waterfront|views|live music)\b/i.test(features)
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
      cuisineTerms: options.relaxFood ? [] : intent.restaurantIntent.cuisineTerms,
      featureTerms: options.relaxFeature ? [] : intent.restaurantIntent.featureTerms,
    },
  } as SearchIntent;
}

function buildGenericRestaurantRecoveryAttempts(intent: SearchIntent) {
  if (!intent.needsRestaurant || intent.needsActivity) return [];

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
          featureTerms.some((feature) => term.includes(feature) || feature.includes(term)),
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
  return /\b(only|must be in|inside|strictly in|nothing outside|no outside|only in)\b/i.test(rawQuery || "");
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
  const resolvedBoroughGeo = geo?.borough ? detectGeoIntent(String(geo.borough)) : null;
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

function requiresStrictMixedPair(intent: SearchIntent) {
  return (
    intent.searchType === "mixed_outing" &&
    intent.wantsPairing === true &&
    intent.needsRestaurant === true &&
    intent.needsActivity === true &&
    intent.pairingPreference?.requiresPairing === true
  );
}

function requiredPairingFailureReason(restaurantCount: number, activityCount: number, pairCount: number, intent: SearchIntent) {
  if (pairCount > 0) return null;
  if (activityCount === 0) return "no_activity_results_for_required_pair";
  if (restaurantCount === 0) return "no_restaurant_results_for_required_pair";
  if (intent.pairingPreference?.requireWalkablePair === true || intent.pairingPreference?.distanceMode === "walking" || intent.pairingPreference?.distanceMode === "short_walk") {
    return "no_walkable_pair_found";
  }
  return "no_valid_required_pair";
}

function areaLabel(intent: SearchIntent) { return intent.geo.neighborhood ?? intent.geo.borough ?? intent.geo.city ?? intent.geo.county ?? intent.geo.raw ?? "that area"; }
function replyFor(restaurants: EnterpriseLocation[], activities: EnterpriseLocation[], pairs: ReturnType<typeof createSearchPairs>, intent: SearchIntent, neighborhoodRecovery?: { used: boolean; from: string | null; to: string | null }) {
  if (intent.wantsPairing) {
    const constrained = hasPairConstraint(intent);
    const walkableWord = intent.pairingPreference?.distanceMode === "same_area" ? "same-area" : "walkable";
    if (pairs.length) return constrained ? `I found ${walkableWord} dinner + activity pairings near ${areaLabel(intent)}.` : "Found restaurant and activity options that match your outing.";
    if (restaurants.length&&activities.length) {
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
      return constrained ? "I found matching restaurants and activities, but none close enough to confidently call walking distance." : "Found restaurant and activity options, but I could not create a confident pair yet.";
    }
    if (restaurants.length) return constrained ? "I found restaurants, but no matching walkable activity nearby." : `I found restaurant options near ${areaLabel(intent)}, but I couldn’t find matching activities nearby yet.`;
    if (activities.length) return constrained ? "I found activities, but no matching walkable restaurant nearby." : `I found activity options near ${areaLabel(intent)}, but I couldn’t find matching restaurants nearby yet.`;
  }
  if (restaurants.length) {
    const singleVenue = detectSingleVenueWithIntent(intent.rawQuery);
    if (singleVenue.matched) {
      const q = intent.rawQuery.toLowerCase();
      if (/\bbar\b|\bsports bar\b|\bpub\b/.test(q) && /\bwings?\b|\bchicken wings\b/.test(q)) return "Here are NYC bars and sports-bar-style spots that match wings.";
      if (/\bhookah\b/.test(q)) return "Here are restaurant-style spots that match hookah.";
      if (/\bseafood\b/.test(q) && /\blive music\b/.test(q)) return "Here are seafood spots that also match live music.";
      return "Here are places that match both parts of your search.";
    }
    if (neighborhoodRecovery?.used && neighborhoodRecovery.from && neighborhoodRecovery.to) {
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

export async function runEnterpriseSearch(query: string, options?: EnterpriseSearchOptions): Promise<EnterpriseSearchResult> {
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
    perf.intent_parse_ms = parserDebug.intent_parse_ms ?? Date.now() - intentStart;
    perf.llm_ms = parserDebug.llm_ms ?? (usedLlm ? perf.intent_parse_ms : intentParserSource === "fast_path" ? 0 : null);
    (perf as any).fast_llm_ms = parserDebug.fast_llm_ms ?? null;
    (perf as any).fallback_llm_ms = parserDebug.fallback_llm_ms ?? null;
    (perf as any).intentParserSource = parserDebug.intentParserSource ?? intentParserSource;
    const marketResolution = resolveSearchMarket({
      geo: intent.geo,
      selectedMarketId: options?.selectedMarketId ?? options?.body?.selectedMarketId ?? options?.body?.selected_market_id ?? null,
      userLocation: options?.userLocation ?? options?.body?.userLocation ?? options?.body?.user_location ?? null,
    });
    const outingTiming = parseOutingDateTime(query, startedAt);
    const effectiveIntent: SearchIntent = { ...intent, ...outingTiming, geo: marketResolution.effectiveGeo };
    parsedIntent = effectiveIntent;
    const debug=createRpcDebug(effectiveIntent); const supabase=options?.supabase ?? supabaseAdmin; const displayLimit=options?.displayLimit ?? 12;
    let restaurantRankingIntent = effectiveIntent;
    let restaurantRaw: EnterpriseLocation[]=[]; let activityRaw: EnterpriseLocation[]=[]; let activityRpcCountBeforeRecovery = 0;
    const searchRestaurantLane = async () => {
      const rpcStarted = Date.now();
      restaurantRaw = await searchEnterpriseLane(supabase,effectiveIntent,"restaurant",debug);
      let filtered=filterRestaurantResults(restaurantRaw,effectiveIntent);
      if (!filtered.length && restaurantSearchTerms(effectiveIntent).length) {
        usedFallback = true;

        const restaurantRecoveryAttempts = buildGenericRestaurantRecoveryAttempts(effectiveIntent);

        if (restaurantRecoveryAttempts.length) {
          for (const attempt of restaurantRecoveryAttempts) {
            const recoveryIntent = cloneIntentForRestaurantRecovery(effectiveIntent, {
              relaxFood: attempt.relaxFood,
              relaxFeature: attempt.relaxFeature,
              strictness: attempt.strictness,
            });

            debug.restaurantRecoveryUsed = true;
            debug.restaurantRecoveryReason = attempt.reason;
            debug.restaurantRecoveryTermsTried = [
              ...(debug.restaurantRecoveryTermsTried ?? []),
              attempt.terms,
            ];
            debug.restaurantRecoveryRelaxedFood =
              Boolean(debug.restaurantRecoveryRelaxedFood) || Boolean(attempt.relaxFood);
            debug.restaurantRecoveryRelaxedFeature =
              Boolean(debug.restaurantRecoveryRelaxedFeature) || Boolean(attempt.relaxFeature);

            const recoveredRaw = await recoverEnterpriseLane(
              supabase,
              recoveryIntent,
              "restaurant",
              debug,
              attempt.terms,
            );

            const recoveredFiltered = filterRestaurantResults(recoveredRaw, recoveryIntent);

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
              restaurantRaw = uniqueById([...restaurantRaw, ...recoveredFiltered]);
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
            undefined,
          );
          filtered = filterRestaurantResults(restaurantRaw,effectiveIntent);
        }
      }
      if (shouldRunNeighborhoodRestaurantFallback({
        rawQuery: effectiveIntent.rawQuery,
        primaryDomain: effectiveIntent.primaryDomain,
        needsRestaurant: effectiveIntent.needsRestaurant,
        needsActivity: effectiveIntent.needsActivity,
        wantsPairing: effectiveIntent.wantsPairing,
        restaurantCount: filtered.length,
        geo: effectiveIntent.geo,
      })) {
        const fallbackGeo = buildBoroughRestaurantFallbackGeo(effectiveIntent.geo);
        const fallbackIntent = { ...effectiveIntent, geo: fallbackGeo };
        const fallbackTerms = restaurantSearchTerms(effectiveIntent);
        usedFallback = true;
        debug.neighborhoodRecoveryUsed = true;
        debug.neighborhoodRecoveryReason = "strict_neighborhood_zero_results";
        debug.neighborhoodRecoveryFrom = effectiveIntent.geo.neighborhood ?? null;
        debug.neighborhoodRecoveryTo = fallbackGeo.borough ?? null;
        debug.neighborhoodRecoveryRadiusMiles = Number(fallbackGeo.radiusMiles ?? 0) || null;
        debug.neighborhoodRecoveryTerms = fallbackTerms;
        debug.neighborhoodRecoveryGeo = fallbackGeo;
        const fallbackRaw = await searchEnterpriseLane(supabase,fallbackIntent,"restaurant",debug);
        const fallbackFiltered = filterRestaurantResults(fallbackRaw,effectiveIntent);
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
      activityRaw = await searchEnterpriseLane(supabase,effectiveIntent,"activity",debug);
      activityRpcCountBeforeRecovery = activityRaw.length;
      let filtered=filterActivityResults(activityRaw,effectiveIntent);
      if (
        (!filtered.length && activitySearchTerms(effectiveIntent).length) ||
        (isBroadGenericActivityIntent(effectiveIntent) && filtered.length < 6)
      ) {
        usedFallback = true;
        if (isRooftopDrinksIntent(effectiveIntent)) {
          debug.activityRecoveryReason = "rooftop_drinks_zero_results";
          debug.activityRecoveryTermsTried = [ROOFTOP_ACTIVITY_RECOVERY_TERMS];
          activityRaw=await recoverEnterpriseLane(supabase,effectiveIntent,"activity",debug,ROOFTOP_ACTIVITY_RECOVERY_TERMS);
          filtered=filterActivityResults(activityRaw,effectiveIntent);
          if (!filtered.length) {
            debug.activityRecoveryTermsTried.push(BAR_ACTIVITY_RECOVERY_TERMS);
            activityRaw=await recoverEnterpriseLane(supabase,effectiveIntent,"activity",debug,BAR_ACTIVITY_RECOVERY_TERMS);
            filtered=filterActivityResults(activityRaw,effectiveIntent);
          }
        } else {
          const broadExpansionTerms = isBroadGenericActivityIntent(effectiveIntent)
            ? activitySearchTerms(effectiveIntent)
            : undefined;
          if (broadExpansionTerms) {
            debug.activityRecoveryReason = filtered.length
              ? "broad_generic_activity_low_results"
              : "broad_generic_activity_zero_results";
            debug.activityRecoveryTermsTried = [broadExpansionTerms];
          }
          const recoveredActivityRaw=await recoverEnterpriseLane(supabase,effectiveIntent,"activity",debug,broadExpansionTerms);
          activityRaw=uniqueById([...activityRaw,...recoveredActivityRaw]);
          filtered=filterActivityResults(activityRaw,effectiveIntent);
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
    const restaurantRejectedReasons=restaurantRaw.map(r=>explainRejection(r,restaurantRankingIntent,"restaurant")).filter(Boolean); const activityRejectedReasons=activityRaw.map(r=>explainRejection(r,effectiveIntent,"activity")).filter(Boolean); const restaurantRejectedSummary=rejectionSummary(restaurantRaw,restaurantRankingIntent,"restaurant"); const activityRejectedSummary=rejectionSummary(activityRaw,effectiveIntent,"activity");
    const rankStarted = Date.now();
    let rankedRestaurants = rankRestaurantResults(uniqueById(restaurantRaw), restaurantRankingIntent);
    const requestedBorough = restaurantRankingIntent.geo?.borough ?? null;
    const boroughStrictnessApplied = Boolean(requestedBorough && ["medium", "strict"].includes(String(restaurantRankingIntent.geo?.geoStrictness)));
    if (boroughStrictnessApplied) {
      const isInRequestedBorough = (item: EnterpriseLocation) => String(item.borough || item.city || item.neighborhood || "").toLowerCase().includes(String(requestedBorough).toLowerCase());
      const inBorough = rankedRestaurants.filter(isInRequestedBorough);
      const outBorough = rankedRestaurants.filter((item) => !isInRequestedBorough(item));
      (debug as any).boroughStrictnessApplied = true;
      (debug as any).requestedBorough = requestedBorough;
      (debug as any).inBoroughResultCount = inBorough.length;
      (debug as any).outOfBoroughResultCount = outBorough.length;
      (debug as any).outOfBoroughPenaltyApplied = outBorough.length > 0;
      (debug as any).outOfBoroughRecoveryAllowed = inBorough.length < 3;
      (debug as any).outOfBoroughRecoveryReason = inBorough.length < 3 ? "fewer_than_3_in_borough_matches" : null;
      rankedRestaurants = inBorough.length >= 3 ? inBorough : [...inBorough, ...outBorough.map((item) => ({ ...item, search_recovery_reason: "out_of_borough_recovery" }))];
    } else {
      (debug as any).boroughStrictnessApplied = false;
      (debug as any).requestedBorough = requestedBorough;
      (debug as any).inBoroughResultCount = 0;
      (debug as any).outOfBoroughResultCount = 0;
      (debug as any).outOfBoroughPenaltyApplied = false;
      (debug as any).outOfBoroughRecoveryAllowed = false;
      (debug as any).outOfBoroughRecoveryReason = null;
    }
    const requestedFeatureTerms = restaurantFeatureTerms(restaurantRankingIntent).filter((term) => /rooftop|roof|terrace|outdoor|skyline|scenic|views?|deck/i.test(term));
    if (requestedFeatureTerms.length) {
      const fields = ["tags", "search_keywords", "semantic_tags", "intent_tags", "primary_category", "cuisine_type", "description", "search_document", "semantic_search_text", "vibe_tags", "date_style_tags", "best_for_tags"];
      const matchesFeature = (item: EnterpriseLocation) => fields.map((field) => { const value = (item as any)[field]; return Array.isArray(value) ? value.join(" ") : String(value ?? ""); }).join(" ").toLowerCase().replaceAll("_", " ").replaceAll("-", " ").match(/rooftop|roof top|roof deck|terrace|outdoor dining|outdoor seating|skyline|scenic views|views/) !== null || requestedFeatureTerms.some((term) => fields.map((field) => { const value = (item as any)[field]; return Array.isArray(value) ? value.join(" ") : String(value ?? ""); }).join(" ").toLowerCase().includes(term.toLowerCase()));
      const featureMatches = rankedRestaurants.filter(matchesFeature);
      const featureMissing = rankedRestaurants.filter((item) => !matchesFeature(item));
      (debug as any).featureStrictnessApplied = true;
      (debug as any).requestedFeatureTerms = requestedFeatureTerms;
      (debug as any).featureMatchedResultCount = featureMatches.length;
      (debug as any).featureMissingPenaltyApplied = featureMissing.length > 0;
      (debug as any).featureRelaxed = featureMatches.length === 0;
      (debug as any).featureRelaxedReason = featureMatches.length === 0 ? "no_matching_feature_results" : null;
      rankedRestaurants = featureMatches.length ? [...featureMatches, ...featureMissing] : rankedRestaurants;
    }
    const rankedActivities = rankActivityResults(uniqueById(activityRaw), effectiveIntent);
    const singleVenueWith = detectSingleVenueWithIntent(effectiveIntent.rawQuery);
    if (singleVenueWith.matched) {
      const scoredSingleVenue = rankedRestaurants.map((restaurant) => ({
        restaurant,
        match: scoreSingleVenueWithMatch(restaurant, effectiveIntent),
      }));
      const strongDualMatches = scoredSingleVenue.filter(({ match }) => match.dualMatched && match.score >= 110);
      (debug as any).singleVenueWithIntentUsed = true;
      (debug as any).singleVenueWithIntentReason = "with_connector_single_venue";
      (debug as any).singleVenueWithVenueTerms = singleVenueWith.venueTerms;
      (debug as any).singleVenueWithFoodTerms = singleVenueWith.foodTerms;
      (debug as any).singleVenueWithFeatureTerms = singleVenueWith.featureTerms;
      (debug as any).singleVenueWithStrongDualMatchCount = strongDualMatches.length;
      if (strongDualMatches.length >= 3) {
        rankedRestaurants = scoredSingleVenue
          .filter(({ match }) => match.dualMatched)
          .map(({ restaurant }) => restaurant);
      } else {
        (debug as any).singleVenueWithLooseMatchesUsed = true;
      }
    }
    perf.ranking_ms = Date.now() - rankStarted;

    const restaurantQualityScorePreview = rankedRestaurants.slice(0, 12).map((restaurant) => ({
      name: restaurant.name || restaurant.restaurant_name || null,
      score: Number((restaurant as any).restaurantQualityScore ?? 0),
      reasons: ((restaurant as any).restaurantQualityReasons ?? []).slice(0, 8),
      penalties: ((restaurant as any).restaurantQualityPenalties ?? []).slice(0, 8),
    }));
    const restaurantOutingFitScorePreview = rankedRestaurants.slice(0, 12).map((restaurant) => ({
      name: restaurant.name || restaurant.restaurant_name || null,
      qualityScore: Number((restaurant as any).restaurantQualityScore ?? 0),
      outingFitScore: Number((restaurant as any).restaurantOutingFitScore ?? 0),
      reasons: ((restaurant as any).restaurantOutingFitReasons ?? (restaurant as any).restaurantQualityReasons ?? []).slice(0, 8),
      penalties: ((restaurant as any).restaurantOutingFitPenalties ?? (restaurant as any).restaurantQualityPenalties ?? []).slice(0, 8),
    }));
    const activityQualityScorePreview = rankedActivities.slice(0, 12).map((activity) => ({
      name: activity.name || activity.activity_name || null,
      score: Number((activity as any).activityQualityScore ?? 0),
      reasons: ((activity as any).activityQualityReasons ?? []).slice(0, 8),
      penalties: ((activity as any).activityQualityPenalties ?? []).slice(0, 8),
    }));
    const photoStarted = Date.now();
    const requestedMarketForResults = (effectiveIntent.geo as any).resolvedMarket || (effectiveIntent.geo as any).requestedMarket || null;
    const explicitMarketRequested = isExplicitMarket(requestedMarketForResults) && (effectiveIntent.geo as any).explicitMarketRequested !== false;
    const suppressMarketMismatch = (item: EnterpriseLocation) => {
      if (!requestedMarketForResults) return false;
      if (explicitMarketRequested && !isResultAllowedForResolvedMarket(item, requestedMarketForResults)) return true;
      const validation = validatePlaceForMarket({ requestedMarket: requestedMarketForResults, city: (item as any).city, state: (item as any).state, county: (item as any).county, borough: (item as any).borough, neighborhood: (item as any).neighborhood, address: (item as any).address });
      return !validation.ok;
    };
    const rejectedForMarketGuardrail = [...rankedRestaurants, ...rankedActivities].filter((item) => explicitMarketRequested && !isResultAllowedForResolvedMarket(item, requestedMarketForResults));
    const marketSafeRestaurants = rankedRestaurants.filter((item) => !suppressMarketMismatch(item));
    const marketSafeActivities = rankedActivities.filter((item) => !suppressMarketMismatch(item));
    const suppressedMarketMismatchCount = (rankedRestaurants.length - marketSafeRestaurants.length) + (rankedActivities.length - marketSafeActivities.length);
    const marketGuardrailRejected = rejectedForMarketGuardrail.length;
    const sampleRejectedMarkets = rejectedForMarketGuardrail.slice(0, 8).map((item) => ({ name: item.name || item.restaurant_name || item.activity_name || null, market: (item as any).market ?? null, state: item.state ?? null, reason: getMarketGuardrailRejectionReason(item, requestedMarketForResults) }));
    let restaurants = filterLivePhotoResults(marketSafeRestaurants).slice(0, displayLimit);
    let activities = filterLivePhotoResults(marketSafeActivities).slice(0, displayLimit);
    const candidateRestaurantCountBeforeRequiredPairSuppression = restaurants.length;
    const candidateActivityCountBeforeRequiredPairSuppression = activities.length;
    const suppressedLowQualityRestaurantCount = rankedRestaurants.filter((restaurant) => Number((restaurant as any).restaurantQualityScore ?? 0) < 0 && !restaurants.some((shown) => shown.id === restaurant.id)).length;
    const suppressedLowQualityActivityCount = rankedActivities.filter((activity) => Number((activity as any).activityQualityScore ?? 0) < 0 && !activities.some((shown) => shown.id === activity.id)).length;
    perf.photo_filter_ms = Date.now() - photoStarted;

    const pairingDebug = createPairingDebug();
    const pairingStarted = Date.now();
    const pairedResults = effectiveIntent.wantsPairing
      ? createSearchPairs(restaurants, activities, effectiveIntent, pairingDebug).filter(
          (pair) =>
            hasUsableLivePhoto(pair.restaurant) && hasUsableLivePhoto(pair.activity),
        )
      : [];
    let pairs = pairedResults.filter((pair) => isPairAllowedForResolvedMarket(pair, requestedMarketForResults)).filter((pair) => {
      const walkingLimitCheck = shouldHidePairForWalkingLimit(pair, effectiveIntent.pairingPreference);

      if (walkingLimitCheck.hide) {
        const reason = walkingLimitCheck.reason ?? "walking_limit_exceeded";
        pairingDebug.walkingPairsHiddenOverLimit = (pairingDebug.walkingPairsHiddenOverLimit ?? 0) + 1;
        pairingDebug.walkingPairRejectReasons = pairingDebug.walkingPairRejectReasons ?? {};
        pairingDebug.walkingPairRejectReasons[reason] = (pairingDebug.walkingPairRejectReasons[reason] ?? 0) + 1;
      }

      return !walkingLimitCheck.hide;
    });
    perf.pairing_ms = Date.now() - pairingStarted;
    const candidatePairCountBeforeRequiredPairSuppression = pairs.length;
    const fallbackSuppressedBecauseExplicitMarket = explicitMarketRequested && (marketGuardrailRejected > 0 || suppressedMarketMismatchCount > 0);
    const requiredPairingSuppressedFallback = requiresStrictMixedPair(effectiveIntent) && pairs.length === 0 && !(explicitMarketRequested && requestedMarketForResults === "LONG_ISLAND" && (restaurants.length > 0 || activities.length > 0));
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
      : uniqueById([...restaurants, ...activities]).slice(
          0,
          displayLimit * 2,
        );
    const render_mode = requiredPairingSuppressedFallback
      ? "empty"
      : effectiveIntent.wantsPairing ? (pairs.length ? "mixed_pairs" : restaurants.length||activities.length ? "partial_mixed" : "empty") : restaurants.length ? "restaurant_cards" : activities.length ? "activity_cards" : "empty";
    const card_counts={ restaurants: restaurants.length, activities: activities.length, matched_locations: matched_locations.length, pairs: pairs.length };
    const pairDisplayLabels = pairs
      .map((pair) =>
        formatDistanceFromRestaurant({
          pair,
          restaurantName: pair.restaurant.name || pair.restaurant.restaurant_name || "Restaurant",
          pairingPreference: effectiveIntent.pairingPreference,
        }),
      )
      .filter((label): label is string => Boolean(label));
    const displayedWalkingMinuteLabels = pairDisplayLabels.filter((label) => /\b\d+\s+min walk from\b/i.test(label)).length;
    const displayedMilesLabels = pairDisplayLabels.filter((label) => /\b\d+(?:\.\d+)?\s+mi from\b/i.test(label)).length;
    const walkingRequested = userAskedForWalking(effectiveIntent.pairingPreference);
    const walkingMinutesEstimatedFromMiles = pairs.filter((pair) =>
      walkingRequested &&
      getRawWalkingMinutes(pair) == null &&
      getSafeWalkingMinutes(pair) != null &&
      getPairDistanceMiles(pair) != null,
    ).length;
    const pairsWithGoogleWalkingMinutes = pairs.filter((pair) => getRawWalkingMinutes(pair) != null).length;
    const pairsMissingGoogleWalkingMinutes = pairs.length - pairsWithGoogleWalkingMinutes;
    const pairCityStates = pairs.map((pair) => getPairCityState(pair));
    const pairGeoPriorities = pairs.map((pair) => getPairGeoPriority(pair, effectiveIntent.geo));
    const pairGeoSummary = {
      sameCityPairs: pairCityStates.filter((pair) => pair.samePairCity && pair.samePairState).length,
      sameStatePairs: pairCityStates.filter((pair) => pair.samePairState).length,
      differentCityPairs: pairCityStates.filter((pair) => pair.restaurantCity && pair.activityCity && pair.restaurantCity !== pair.activityCity).length,
      differentStatePairs: pairCityStates.filter((pair) => pair.restaurantState && pair.activityState && pair.restaurantState !== pair.activityState).length,
      missingCoordinatePairs: pairCityStates.filter((pair) => !pair.hasBothCoords).length,
    };
    const longIslandSinglesFallbackMessage = explicitMarketRequested && requestedMarketForResults === "LONG_ISLAND" && pairs.length === 0 && (restaurants.length > 0 || activities.length > 0)
      ? "We found Long Island picks, but we’re still building more complete outing pairings."
      : null;
    const noPairsReason = requiredPairingFailureReasonValue ?? (
      effectiveIntent.wantsPairing &&
      pairs.length === 0 &&
      activities.length > 0 &&
      restaurants.length > 0 &&
      (effectiveIntent.pairingPreference?.distanceMode === "walking" ||
        effectiveIntent.pairingPreference?.distanceMode === "short_walk" ||
        effectiveIntent.pairingPreference?.requireWalkablePair === true)
        ? "no_pairs_within_walking_distance"
        : null
    );
    perf.total_ms = Date.now() - started;
    const locationArea = effectiveIntent.geo.neighborhood ?? effectiveIntent.geo.borough ?? effectiveIntent.geo.city ?? effectiveIntent.geo.county ?? effectiveIntent.geo.raw ?? null;
    const speedStatus = getSearchSpeedStatus({ totalMs: perf.total_ms, success: true });
    const performanceDebug = { ...perf, speed_status: speedStatus, result_count: matched_locations.length, restaurant_count: restaurants.length, activity_count: activities.length, pair_count: pairs.length, source: options?.source ?? "enterprise_search", route: options?.route ?? null, used_custom_prompt: Boolean(options?.usedCustomPrompt), intentParserSource: parserDebug.intentParserSource ?? intentParserSource, fastPathMatched, fastPathReason, beta_assignment_id: options?.betaAssignmentId ?? null, beta_tester_id: options?.betaTesterId ?? null };
    if (process.env.NODE_ENV !== "production" && explicitMarketRequested) {
      console.log("[enterprise-search] market guardrail", { rawQuery: query, resolvedMarket: requestedMarketForResults, marketFilterApplied: true, countBeforeGuardrail: rankedRestaurants.length + rankedActivities.length, countAfterGuardrail: marketSafeRestaurants.length + marketSafeActivities.length, sampleRejectedMarkets });
    }
    const fullDebug={ search_system:"enterprise-search-v1", rawQuery:query, rawQueryForDebug:query, llmIntentRaw, intentParserSource: parserDebug.intentParserSource ?? intentParserSource, fastPathMatched, fastPathReason, preIntentSource: parserDebug.preIntentSource, preIntentMatched: parserDebug.preIntentMatched, preIntentReason: parserDebug.preIntentReason, intentLlmModel: parserDebug.intentLlmModel, intentLlmFastModel: parserDebug.intentLlmFastModel, intentLlmFallbackModel: parserDebug.intentLlmFallbackModel, llmEnhancementUsed: parserDebug.llmEnhancementUsed, llmFallbackUsed: parserDebug.llmFallbackUsed, llmTimedOut: parserDebug.llmTimedOut, fallbackIntentUsed: parserDebug.fallbackIntentUsed, intentCacheHit: parserDebug.intentCacheHit, intentCacheVersion: parserDebug.intentCacheVersion, normalizedIntent:effectiveIntent, restaurantRankingIntent, restaurantRecoveryReason: debug.restaurantRecoveryReason ?? null, restaurantRecoveryTermsTried: debug.restaurantRecoveryTermsTried ?? [], restaurantRecoveryAttemptResults: debug.restaurantRecoveryAttemptResults ?? [], restaurantRecoveryRelaxedFood: Boolean(debug.restaurantRecoveryRelaxedFood), restaurantRecoveryRelaxedFeature: Boolean(debug.restaurantRecoveryRelaxedFeature), restaurantRecoverySucceeded: Boolean(debug.restaurantRecoverySucceeded), restaurantTerms:restaurantSearchTerms(effectiveIntent), activityTerms:activitySearchTerms(effectiveIntent), geo:marketResolution.effectiveGeo, originalGeo:marketResolution.originalGeo, effectiveGeo:marketResolution.effectiveGeo, defaultMarketApplied:marketResolution.marketApplied, defaultMarketId:marketResolution.market?.id ?? null, defaultMarketLabel:marketResolution.market?.label ?? null, defaultMarketRadiusMiles:marketResolution.market?.radiusMiles ?? null, marketReason:marketResolution.marketReason, resolvedMarket:requestedMarketForResults, explicitMarketRequested, fallbackSuppressedBecauseExplicitMarket, marketGuardrailRejected, sampleRejectedMarkets, parsedMarket:requestedMarketForResults, parsedBorough:effectiveIntent.geo.borough ?? null, parsedCity:effectiveIntent.geo.city ?? null, finalResultMarketsReturned:Array.from(new Set([...restaurants,...activities].map((item:any)=>`${item.market || "UNKNOWN"}:${item.state || ""}`))), rpcGeoLatitude:marketResolution.effectiveGeo.latitude ?? null, rpcGeoLongitude:marketResolution.effectiveGeo.longitude ?? null, rpcRadiusMiles:marketResolution.effectiveGeo.radiusMiles ?? null, ...parserDebug, ...debug, restaurantRejectedReasons, activityRejectedReasons, restaurantRejectedSummary, activityRejectedSummary, distanceScoringUsed:Boolean(effectiveIntent.geo.latitude&&effectiveIntent.geo.longitude), pairDistanceMiles:pairs.map(p=>p.pairDistanceMiles), pairGeoPriorities, pairGeoSummary, restaurantQualityScoringApplied:true, activityQualityScoringApplied:true, pairQualityScoringApplied:true, restaurantQualityScorePreview, activityQualityScorePreview, pairQualityScorePreview:pairingDebug.pairQualityScorePreview, restaurantOutingFitScorePreview, weakOutingFitRestaurantCount:pairingDebug.weakOutingFitRestaurantCount, suppressedWeakOutingFitPairCount:pairingDebug.suppressedWeakOutingFitPairCount, pairQualityTierCounts:pairingDebug.pairQualityTierCounts, suppressedLowQualityRestaurantCount, suppressedLowQualityActivityCount, suppressedMarketMismatchCount, marketMismatchResultCount: suppressedMarketMismatchCount, marketStateMismatchCount: suppressedMarketMismatchCount, suppressedLowQualityPairCount:pairingDebug.suppressedLowQualityPairCount, finalPairSortReason:pairingDebug.finalPairSortReason, renderedPairSort:{ primary:"default_market_pair_priority", secondary:"geo_priority", tertiary:"pair_quality_tier", quaternary:"pair_distance_miles", quinary:"safe_walking_minutes", senary:"pair_quality_score" }, walkingPolicy:{ shortWalkMaxPairDistanceMiles:0.75, shortWalkMaxPairWalkingMinutes:15, walkingMaxPairDistanceMiles:1.5, walkingMaxPairWalkingMinutes:30, walkingMinutesToMilesBasis:"20_minutes_per_mile", explicitWalkingMinutesSupported:true, explicitWalkingMinutesMax:45, missingCoordinateFallback:true, googleWalkingRouteAuthoritative:true, extremeWalkingRouteMinuteCutoff:180 }, pairingPreference:effectiveIntent.pairingPreference, countBeforeMarketGuardrail: rankedRestaurants.length + rankedActivities.length, countAfterMarketGuardrail: marketSafeRestaurants.length + marketSafeActivities.length, restaurantCount: restaurants.length, activityCount: activities.length, sampleReturnedMarkets:Array.from(new Set([...restaurants,...activities].map((item:any)=>`${item.market || "UNKNOWN"}:${item.state || ""}`))).slice(0,8), supabaseFiltersApplied:{ market: requestedMarketForResults, state: requestedMarketForResults === "NORTHERN_NJ" ? "NJ" : "NY", is_searchable: true, city: null, borough: null, address: null }, longIslandSinglesFallbackMessage, activityRpcCountBeforePairing:activities.length, activityRpcCountAfterRecovery:activityRaw.length, activityRpcCountBeforeRecovery:activityRpcCountBeforeRecovery, pairCandidatesEvaluated:pairingDebug.pairCandidatesEvaluated, validPairCountBeforeRender:pairingDebug.validPairCountBeforeRender, pair_count:pairs.length, pairsRejectedForDistance:pairingDebug.pairsRejectedForDistance, pairsRejectedForWalkingMinutes:pairingDebug.pairsRejectedForWalkingMinutes, walkingPairsHiddenOverLimit:pairingDebug.walkingPairsHiddenOverLimit, walkingPairRejectReasons:pairingDebug.walkingPairRejectReasons, extremeWalkingRoutesRejected:pairingDebug.extremeWalkingRoutesRejected, walkingMinutesEstimatedFromMiles, pairsWithGoogleWalkingMinutes, pairsMissingGoogleWalkingMinutes, displayedWalkingMinuteLabels, displayedMilesLabels, invalidWalkingRoutesHiddenFromDisplay:pairingDebug.invalidWalkingRoutesHiddenFromDisplay, pairsRejectedForMissingCoordinates:pairingDebug.pairsRejectedForMissingCoordinates, rejectedPairs:pairingDebug.rejectedPairs, walkablePairsFound:pairingDebug.walkablePairsFound, noPairsReason, requiredPairingSuppressedFallback, requiredPairingFailureReason:requiredPairingFailureReasonValue, candidateRestaurantCountBeforeRequiredPairSuppression, candidateActivityCountBeforeRequiredPairSuppression, candidatePairCountBeforeRequiredPairSuppression, finalDisplayedResultCount:matched_locations.length, maxPairDistanceMiles:effectiveIntent.pairingPreference?.maxPairDistanceMiles ?? null, maxPairWalkingMinutes:effectiveIntent.pairingPreference?.maxPairWalkingMinutes ?? null, requireWalkablePair:effectiveIntent.pairingPreference?.requireWalkablePair ?? false, distanceMode:effectiveIntent.pairingPreference?.distanceMode ?? "any", renderMode:render_mode, timingMs:perf.total_ms, performance: performanceDebug, restaurantRecoveryUsed: Boolean(debug.restaurantRecoveryUsed), activityRecoveryUsed: Boolean(debug.activityRecoveryUsed), llmError };
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
    const responseDebug = options?.betaDebug ? fullDebug : productionSafeDebug(fullDebug);
    const emptyExplicitLongIsland = requestedMarketForResults === "LONG_ISLAND" && matched_locations.length === 0;
    const responseReply = longIslandSinglesFallbackMessage
      ?? (emptyExplicitLongIsland
        ? "We’re still expanding Long Island picks. Try a broader search like ‘dinner and activity in Long Island’ or check back soon."
        : replyFor(restaurants,activities,pairs,effectiveIntent,{ used: Boolean(debug.neighborhoodRecoveryUsed), from: debug.neighborhoodRecoveryFrom ?? null, to: debug.neighborhoodRecoveryTo ?? null }));
    const response: EnterpriseSearchResult = { success: true, reply: responseReply, restaurants, activities, pairs, matched_locations, matchedLocations: matched_locations, render_mode, renderMode: render_mode, card_counts, cardCounts: card_counts, debug: responseDebug };
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
