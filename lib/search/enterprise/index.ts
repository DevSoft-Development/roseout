import { supabaseAdmin } from "../../supabaseAdmin";
import type { EnterpriseLocation, EnterpriseSearchResult, SearchIntent } from "./types";
import { parseEnterpriseIntent } from "./intent-parser";
import { activitySearchTerms, restaurantSearchTerms } from "./normalize-intent";
import { explainRejection, filterActivityResults, filterRestaurantResults, rankActivityResults, rankRestaurantResults } from "./ranking";
import { createPairingDebug, createSearchPairs, getPairCityState, getPairGeoPriority } from "./pairing";
import { formatDistanceFromRestaurant, getPairDistanceMiles, getRawWalkingMinutes, getSafeWalkingMinutes, shouldHidePairForWalkingLimit, userAskedForWalking } from "./distance";
import { createRpcDebug, recoverEnterpriseLane, searchEnterpriseLane } from "./rpc";
import { productionSafeDebug } from "./debug";
import { getSearchSpeedStatus, logSearchPerformance } from "@/lib/search/performance";
import { resolveSearchMarket, type UserSearchLocation } from "./markets";
import { logSearchHealthEvent } from "./searchHealthLogger";

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
function replyFor(restaurants: EnterpriseLocation[], activities: EnterpriseLocation[], pairs: ReturnType<typeof createSearchPairs>, intent: SearchIntent) {
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
  if (restaurants.length) return "Found restaurant matches.";
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
    } = await parseEnterpriseIntent(query, {
      useLLM: options?.useLLM,
      useFastPath: options?.useFastPath,
      body: options?.body,
    });
    usedLlm = parsedWithLlm;
    perf.intent_parse_ms = Date.now() - intentStart;
    perf.llm_ms = usedLlm ? perf.intent_parse_ms : intentParserSource === "fast_path" ? 0 : null;
    const marketResolution = resolveSearchMarket({
      geo: intent.geo,
      selectedMarketId: options?.selectedMarketId ?? options?.body?.selectedMarketId ?? options?.body?.selected_market_id ?? null,
      userLocation: options?.userLocation ?? options?.body?.userLocation ?? options?.body?.user_location ?? null,
    });
    const effectiveIntent: SearchIntent = { ...intent, geo: marketResolution.effectiveGeo };
    parsedIntent = effectiveIntent;
    const debug=createRpcDebug(effectiveIntent); const supabase=options?.supabase ?? supabaseAdmin; const displayLimit=options?.displayLimit ?? 12;
    let restaurantRaw: EnterpriseLocation[]=[]; let activityRaw: EnterpriseLocation[]=[]; let activityRpcCountBeforeRecovery = 0;
    const searchRestaurantLane = async () => {
      const rpcStarted = Date.now();
      restaurantRaw = await searchEnterpriseLane(supabase,effectiveIntent,"restaurant",debug);
      let filtered=filterRestaurantResults(restaurantRaw,effectiveIntent);
      if (!filtered.length && restaurantSearchTerms(effectiveIntent).length) {
        usedFallback = true;
        restaurantRaw=await recoverEnterpriseLane(supabase,effectiveIntent,"restaurant",debug);
        filtered=filterRestaurantResults(restaurantRaw,effectiveIntent);
      }
      perf.restaurant_rpc_ms = Date.now() - rpcStarted;
    };
    const searchActivityLane = async () => {
      const rpcStarted = Date.now();
      activityRaw = await searchEnterpriseLane(supabase,effectiveIntent,"activity",debug);
      activityRpcCountBeforeRecovery = activityRaw.length;
      let filtered=filterActivityResults(activityRaw,effectiveIntent);
      if (!filtered.length && activitySearchTerms(effectiveIntent).length) {
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
          activityRaw=await recoverEnterpriseLane(supabase,effectiveIntent,"activity",debug);
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
    const restaurantRejectedReasons=restaurantRaw.map(r=>explainRejection(r,effectiveIntent,"restaurant")).filter(Boolean); const activityRejectedReasons=activityRaw.map(r=>explainRejection(r,effectiveIntent,"activity")).filter(Boolean); const restaurantRejectedSummary=rejectionSummary(restaurantRaw,effectiveIntent,"restaurant"); const activityRejectedSummary=rejectionSummary(activityRaw,effectiveIntent,"activity");
    const rankStarted = Date.now();
    const rankedRestaurants = rankRestaurantResults(uniqueById(restaurantRaw), effectiveIntent);
    const rankedActivities = rankActivityResults(uniqueById(activityRaw), effectiveIntent);
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
    let restaurants = filterLivePhotoResults(rankedRestaurants).slice(0, displayLimit);
    let activities = filterLivePhotoResults(rankedActivities).slice(0, displayLimit);
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
    let pairs = pairedResults.filter((pair) => {
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
    const requiredPairingSuppressedFallback = requiresStrictMixedPair(effectiveIntent) && pairs.length === 0;
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
    const performanceDebug = { ...perf, speed_status: speedStatus, result_count: matched_locations.length, restaurant_count: restaurants.length, activity_count: activities.length, pair_count: pairs.length, source: options?.source ?? "enterprise_search", route: options?.route ?? null, used_custom_prompt: Boolean(options?.usedCustomPrompt), intentParserSource, fastPathMatched, fastPathReason, beta_assignment_id: options?.betaAssignmentId ?? null, beta_tester_id: options?.betaTesterId ?? null };
    const fullDebug={ search_system:"enterprise-search-v1", rawQuery:query, llmIntentRaw, intentParserSource, fastPathMatched, fastPathReason, normalizedIntent:effectiveIntent, restaurantTerms:restaurantSearchTerms(effectiveIntent), activityTerms:activitySearchTerms(effectiveIntent), geo:marketResolution.effectiveGeo, originalGeo:marketResolution.originalGeo, effectiveGeo:marketResolution.effectiveGeo, defaultMarketApplied:marketResolution.marketApplied, defaultMarketId:marketResolution.market?.id ?? null, defaultMarketLabel:marketResolution.market?.label ?? null, defaultMarketRadiusMiles:marketResolution.market?.radiusMiles ?? null, marketReason:marketResolution.marketReason, rpcGeoLatitude:marketResolution.effectiveGeo.latitude ?? null, rpcGeoLongitude:marketResolution.effectiveGeo.longitude ?? null, rpcRadiusMiles:marketResolution.effectiveGeo.radiusMiles ?? null, ...debug, restaurantRejectedReasons, activityRejectedReasons, restaurantRejectedSummary, activityRejectedSummary, distanceScoringUsed:Boolean(effectiveIntent.geo.latitude&&effectiveIntent.geo.longitude), pairDistanceMiles:pairs.map(p=>p.pairDistanceMiles), pairGeoPriorities, pairGeoSummary, restaurantQualityScoringApplied:true, activityQualityScoringApplied:true, pairQualityScoringApplied:true, restaurantQualityScorePreview, activityQualityScorePreview, pairQualityScorePreview:pairingDebug.pairQualityScorePreview, restaurantOutingFitScorePreview, weakOutingFitRestaurantCount:pairingDebug.weakOutingFitRestaurantCount, suppressedWeakOutingFitPairCount:pairingDebug.suppressedWeakOutingFitPairCount, pairQualityTierCounts:pairingDebug.pairQualityTierCounts, suppressedLowQualityRestaurantCount, suppressedLowQualityActivityCount, suppressedLowQualityPairCount:pairingDebug.suppressedLowQualityPairCount, finalPairSortReason:pairingDebug.finalPairSortReason, renderedPairSort:{ primary:"default_market_pair_priority", secondary:"geo_priority", tertiary:"pair_quality_tier", quaternary:"pair_distance_miles", quinary:"safe_walking_minutes", senary:"pair_quality_score" }, walkingPolicy:{ shortWalkMaxPairDistanceMiles:0.75, shortWalkMaxPairWalkingMinutes:15, walkingMaxPairDistanceMiles:1.5, walkingMaxPairWalkingMinutes:30, walkingMinutesToMilesBasis:"20_minutes_per_mile", explicitWalkingMinutesSupported:true, explicitWalkingMinutesMax:45, missingCoordinateFallback:true, googleWalkingRouteAuthoritative:true, extremeWalkingRouteMinuteCutoff:180 }, pairingPreference:effectiveIntent.pairingPreference, activityRpcCountBeforePairing:activities.length, activityRpcCountAfterRecovery:activityRaw.length, activityRpcCountBeforeRecovery:activityRpcCountBeforeRecovery, pairCandidatesEvaluated:pairingDebug.pairCandidatesEvaluated, validPairCountBeforeRender:pairingDebug.validPairCountBeforeRender, pair_count:pairs.length, pairsRejectedForDistance:pairingDebug.pairsRejectedForDistance, pairsRejectedForWalkingMinutes:pairingDebug.pairsRejectedForWalkingMinutes, walkingPairsHiddenOverLimit:pairingDebug.walkingPairsHiddenOverLimit, walkingPairRejectReasons:pairingDebug.walkingPairRejectReasons, extremeWalkingRoutesRejected:pairingDebug.extremeWalkingRoutesRejected, walkingMinutesEstimatedFromMiles, pairsWithGoogleWalkingMinutes, pairsMissingGoogleWalkingMinutes, displayedWalkingMinuteLabels, displayedMilesLabels, invalidWalkingRoutesHiddenFromDisplay:pairingDebug.invalidWalkingRoutesHiddenFromDisplay, pairsRejectedForMissingCoordinates:pairingDebug.pairsRejectedForMissingCoordinates, rejectedPairs:pairingDebug.rejectedPairs, walkablePairsFound:pairingDebug.walkablePairsFound, noPairsReason, requiredPairingSuppressedFallback, requiredPairingFailureReason:requiredPairingFailureReasonValue, candidateRestaurantCountBeforeRequiredPairSuppression, candidateActivityCountBeforeRequiredPairSuppression, candidatePairCountBeforeRequiredPairSuppression, finalDisplayedResultCount:matched_locations.length, maxPairDistanceMiles:effectiveIntent.pairingPreference?.maxPairDistanceMiles ?? null, maxPairWalkingMinutes:effectiveIntent.pairingPreference?.maxPairWalkingMinutes ?? null, requireWalkablePair:effectiveIntent.pairingPreference?.requireWalkablePair ?? false, distanceMode:effectiveIntent.pairingPreference?.distanceMode ?? "any", renderMode:render_mode, timingMs:perf.total_ms, performance: performanceDebug, restaurantRecoveryUsed: Boolean(debug.restaurantRecoveryUsed), activityRecoveryUsed: Boolean(debug.activityRecoveryUsed), llmError };
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
    const response: EnterpriseSearchResult = { success: true, reply: replyFor(restaurants,activities,pairs,effectiveIntent), restaurants, activities, pairs, matched_locations, matchedLocations: matched_locations, render_mode, renderMode: render_mode, card_counts, cardCounts: card_counts, debug: responseDebug };
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
        errorMessage: error instanceof Error ? error.message : String(error),
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
        performance: {
          total_ms: totalMs,
          speed_status: getSearchSpeedStatus({ totalMs, success: false }),
        },
      },
      errors: [error instanceof Error ? error.message : String(error)],
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
