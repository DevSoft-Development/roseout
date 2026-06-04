import { supabaseAdmin } from "../../supabaseAdmin";
import type { EnterpriseLocation, EnterpriseSearchResult, SearchIntent } from "./types";
import { parseEnterpriseIntent } from "./intent-parser";
import { activitySearchTerms, restaurantSearchTerms } from "./normalize-intent";
import { explainRejection, filterActivityResults, filterRestaurantResults, rankActivityResults, rankRestaurantResults } from "./ranking";
import { createPairingDebug, createSearchPairs, getPairCityState, getPairGeoPriority } from "./pairing";
import { createRpcDebug, recoverEnterpriseLane, searchEnterpriseLane } from "./rpc";
import { productionSafeDebug } from "./debug";
import { getSearchSpeedStatus, logSearchPerformance } from "@/lib/search/performance";

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
};

export async function runEnterpriseSearch(query: string, options?: EnterpriseSearchOptions): Promise<EnterpriseSearchResult> {
  const startedAt = new Date();
  const started = Date.now();
  const perf = {
    total_ms: 0,
    llm_ms: null as number | null,
    restaurant_rpc_ms: 0,
    activity_rpc_ms: 0,
    rpc_ms: 0,
    ranking_ms: 0,
    photo_filter_ms: 0,
    pairing_ms: 0,
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
    perf.llm_ms = usedLlm ? Date.now() - intentStart : intentParserSource === "fast_path" ? 0 : null;
    parsedIntent = intent;
    const debug=createRpcDebug(intent); const supabase=options?.supabase ?? supabaseAdmin; const displayLimit=options?.displayLimit ?? 12;
    let restaurantRaw: EnterpriseLocation[]=[]; let activityRaw: EnterpriseLocation[]=[]; let activityRpcCountBeforeRecovery = 0;
    const searchRestaurantLane = async () => {
      const rpcStarted = Date.now();
      restaurantRaw = await searchEnterpriseLane(supabase,intent,"restaurant",debug);
      let filtered=filterRestaurantResults(restaurantRaw,intent);
      if (!filtered.length && restaurantSearchTerms(intent).length) {
        usedFallback = true;
        restaurantRaw=await recoverEnterpriseLane(supabase,intent,"restaurant",debug);
        filtered=filterRestaurantResults(restaurantRaw,intent);
      }
      perf.restaurant_rpc_ms = Date.now() - rpcStarted;
    };
    const searchActivityLane = async () => {
      const rpcStarted = Date.now();
      activityRaw = await searchEnterpriseLane(supabase,intent,"activity",debug);
      activityRpcCountBeforeRecovery = activityRaw.length;
      let filtered=filterActivityResults(activityRaw,intent);
      if (!filtered.length && activitySearchTerms(intent).length) {
        usedFallback = true;
        if (isRooftopDrinksIntent(intent)) {
          debug.activityRecoveryReason = "rooftop_drinks_zero_results";
          debug.activityRecoveryTermsTried = [ROOFTOP_ACTIVITY_RECOVERY_TERMS];
          activityRaw=await recoverEnterpriseLane(supabase,intent,"activity",debug,ROOFTOP_ACTIVITY_RECOVERY_TERMS);
          filtered=filterActivityResults(activityRaw,intent);
          if (!filtered.length) {
            debug.activityRecoveryTermsTried.push(BAR_ACTIVITY_RECOVERY_TERMS);
            activityRaw=await recoverEnterpriseLane(supabase,intent,"activity",debug,BAR_ACTIVITY_RECOVERY_TERMS);
            filtered=filterActivityResults(activityRaw,intent);
          }
        } else {
          activityRaw=await recoverEnterpriseLane(supabase,intent,"activity",debug);
          filtered=filterActivityResults(activityRaw,intent);
        }
      }
      perf.activity_rpc_ms = Date.now() - rpcStarted;
    };

    if (intent.needsRestaurant && intent.needsActivity) {
      await Promise.all([searchRestaurantLane(), searchActivityLane()]);
    } else if (intent.needsRestaurant) {
      await searchRestaurantLane();
    } else if (intent.needsActivity) {
      await searchActivityLane();
    }
    perf.rpc_ms = perf.restaurant_rpc_ms + perf.activity_rpc_ms;
    const restaurantRejectedReasons=restaurantRaw.map(r=>explainRejection(r,intent,"restaurant")).filter(Boolean); const activityRejectedReasons=activityRaw.map(r=>explainRejection(r,intent,"activity")).filter(Boolean); const restaurantRejectedSummary=rejectionSummary(restaurantRaw,intent,"restaurant"); const activityRejectedSummary=rejectionSummary(activityRaw,intent,"activity");
    const rankStarted = Date.now();
    const rankedRestaurants = rankRestaurantResults(uniqueById(restaurantRaw), intent);
    const rankedActivities = rankActivityResults(uniqueById(activityRaw), intent);
    perf.ranking_ms = Date.now() - rankStarted;

    const photoStarted = Date.now();
    const restaurants = filterLivePhotoResults(rankedRestaurants).slice(0, displayLimit);
    const activities = filterLivePhotoResults(rankedActivities).slice(0, displayLimit);
    perf.photo_filter_ms = Date.now() - photoStarted;

    const pairingDebug = createPairingDebug();
    const pairingStarted = Date.now();
    const pairs = intent.wantsPairing
      ? createSearchPairs(restaurants, activities, intent, pairingDebug).filter(
          (pair) =>
            hasUsableLivePhoto(pair.restaurant) && hasUsableLivePhoto(pair.activity),
        )
      : [];
    perf.pairing_ms = Date.now() - pairingStarted;

    const matched_locations = uniqueById([...restaurants, ...activities]).slice(
      0,
      displayLimit * 2,
    );
    const render_mode = intent.wantsPairing ? (pairs.length ? "mixed_pairs" : restaurants.length||activities.length ? "partial_mixed" : "empty") : restaurants.length ? "restaurant_cards" : activities.length ? "activity_cards" : "empty";
    const card_counts={ restaurants: restaurants.length, activities: activities.length, matched_locations: matched_locations.length, pairs: pairs.length };
    const pairCityStates = pairs.map((pair) => getPairCityState(pair));
    const pairGeoPriorities = pairs.map((pair) => getPairGeoPriority(pair, intent.geo));
    const pairGeoSummary = {
      sameCityPairs: pairCityStates.filter((pair) => pair.samePairCity && pair.samePairState).length,
      sameStatePairs: pairCityStates.filter((pair) => pair.samePairState).length,
      differentCityPairs: pairCityStates.filter((pair) => pair.restaurantCity && pair.activityCity && pair.restaurantCity !== pair.activityCity).length,
      differentStatePairs: pairCityStates.filter((pair) => pair.restaurantState && pair.activityState && pair.restaurantState !== pair.activityState).length,
      missingCoordinatePairs: pairCityStates.filter((pair) => !pair.hasBothCoords).length,
    };
    const noPairsReason =
      intent.wantsPairing &&
      pairs.length === 0 &&
      activities.length > 0 &&
      restaurants.length > 0 &&
      (intent.pairingPreference?.distanceMode === "walking" ||
        intent.pairingPreference?.distanceMode === "short_walk" ||
        intent.pairingPreference?.requireWalkablePair === true)
        ? "no_pairs_within_walking_distance"
        : null;
    perf.total_ms = Date.now() - started;
    const locationArea = intent.geo.neighborhood ?? intent.geo.borough ?? intent.geo.city ?? intent.geo.county ?? intent.geo.raw ?? null;
    const speedStatus = getSearchSpeedStatus({ totalMs: perf.total_ms, success: true });
    const performanceDebug = { ...perf, speed_status: speedStatus, result_count: matched_locations.length, restaurant_count: restaurants.length, activity_count: activities.length, pair_count: pairs.length, source: options?.source ?? "enterprise_search", route: options?.route ?? null, used_custom_prompt: Boolean(options?.usedCustomPrompt), intentParserSource, fastPathMatched, fastPathReason, beta_assignment_id: options?.betaAssignmentId ?? null, beta_tester_id: options?.betaTesterId ?? null };
    const fullDebug={ search_system:"enterprise-search-v1", rawQuery:query, llmIntentRaw, intentParserSource, fastPathMatched, fastPathReason, normalizedIntent:intent, restaurantTerms:restaurantSearchTerms(intent), activityTerms:activitySearchTerms(intent), geo:intent.geo, ...debug, restaurantRejectedReasons, activityRejectedReasons, restaurantRejectedSummary, activityRejectedSummary, distanceScoringUsed:Boolean(intent.geo.latitude&&intent.geo.longitude), pairDistanceMiles:pairs.map(p=>p.pairDistanceMiles), pairGeoPriorities, pairGeoSummary, renderedPairSort:{ primary:"geo_priority", secondary:"pair_distance_miles", tertiary:"safe_walking_minutes", quaternary:"combined_score" }, walkingPolicy:{ shortWalkMaxPairDistanceMiles:0.75, shortWalkMaxPairWalkingMinutes:15, walkingMaxPairDistanceMiles:1.5, walkingMaxPairWalkingMinutes:30, walkingMinutesToMilesBasis:"20_minutes_per_mile", explicitWalkingMinutesSupported:true, explicitWalkingMinutesMax:45, missingCoordinateFallback:true, googleWalkingRouteAuthoritative:true, extremeWalkingRouteMinuteCutoff:180 }, pairingPreference:intent.pairingPreference, activityRpcCountBeforePairing:activities.length, activityRpcCountAfterRecovery:activityRaw.length, activityRpcCountBeforeRecovery:activityRpcCountBeforeRecovery, pairCandidatesEvaluated:pairingDebug.pairCandidatesEvaluated, validPairCountBeforeRender:pairingDebug.validPairCountBeforeRender, pair_count:pairs.length, pairsRejectedForDistance:pairingDebug.pairsRejectedForDistance, pairsRejectedForWalkingMinutes:pairingDebug.pairsRejectedForWalkingMinutes, extremeWalkingRoutesRejected:pairingDebug.extremeWalkingRoutesRejected, invalidWalkingRoutesHiddenFromDisplay:pairingDebug.invalidWalkingRoutesHiddenFromDisplay, pairsRejectedForMissingCoordinates:pairingDebug.pairsRejectedForMissingCoordinates, rejectedPairs:pairingDebug.rejectedPairs, walkablePairsFound:pairingDebug.walkablePairsFound, noPairsReason, maxPairDistanceMiles:intent.pairingPreference?.maxPairDistanceMiles ?? null, maxPairWalkingMinutes:intent.pairingPreference?.maxPairWalkingMinutes ?? null, requireWalkablePair:intent.pairingPreference?.requireWalkablePair ?? false, distanceMode:intent.pairingPreference?.distanceMode ?? "any", renderMode:render_mode, timingMs:perf.total_ms, performance: performanceDebug, restaurantRecoveryUsed: Boolean(debug.restaurantRecoveryUsed), activityRecoveryUsed: Boolean(debug.activityRecoveryUsed), llmError };
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
        parsedIntent: intent,
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
    return { success: true, reply: replyFor(restaurants,activities,pairs,intent), restaurants, activities, pairs, matched_locations, matchedLocations: matched_locations, render_mode, renderMode: render_mode, card_counts, cardCounts: card_counts, debug: options?.betaDebug ? fullDebug : productionSafeDebug(fullDebug) };
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
    throw error;
  }
}
export * from "./types";
export * from "./normalize-intent";
export * from "./ranking";
export * from "./pairing";
export * from "./distance";
export * from "./geo-taxonomy";
