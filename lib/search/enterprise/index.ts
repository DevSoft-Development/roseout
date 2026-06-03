import { supabaseAdmin } from "../../supabaseAdmin";
import type { EnterpriseLocation, EnterpriseSearchResult, SearchIntent } from "./types";
import { parseEnterpriseIntent } from "./intent-parser";
import { activitySearchTerms, restaurantSearchTerms } from "./normalize-intent";
import { explainRejection, filterActivityResults, filterRestaurantResults, rankActivityResults, rankRestaurantResults } from "./ranking";
import { createPairingDebug, createSearchPairs } from "./pairing";
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
function areaLabel(intent: SearchIntent) { return intent.geo.neighborhood ?? intent.geo.borough ?? intent.geo.city ?? intent.geo.county ?? intent.geo.raw ?? "that area"; }
function replyFor(restaurants: EnterpriseLocation[], activities: EnterpriseLocation[], pairs: ReturnType<typeof createSearchPairs>, intent: SearchIntent) {
  if (intent.wantsPairing) {
    const constrained = hasPairConstraint(intent);
    const walkableWord = intent.pairingPreference?.distanceMode === "same_area" ? "same-area" : "walkable";
    if (pairs.length) return constrained ? `I found ${walkableWord} dinner + activity pairings near ${areaLabel(intent)}.` : "Found restaurant and activity options that match your outing.";
    if (restaurants.length&&activities.length) return constrained ? "I found matching restaurants and activities, but none close enough to confidently call walking distance." : "Found restaurant and activity options, but I could not create a confident pair yet.";
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
  try {
    const intentStart = Date.now();
    const { intent, llmIntentRaw, llmError } = await parseEnterpriseIntent(query, { useLLM: options?.useLLM, body: options?.body });
    if (options?.useLLM) perf.llm_ms = Date.now() - intentStart;
    parsedIntent = intent;
    const debug=createRpcDebug(intent); const supabase=options?.supabase ?? supabaseAdmin; const displayLimit=options?.displayLimit ?? 12;
    let restaurantRaw: EnterpriseLocation[]=[]; let activityRaw: EnterpriseLocation[]=[];
    if (intent.needsRestaurant) {
      const rpcStarted = Date.now();
      restaurantRaw = await searchEnterpriseLane(supabase,intent,"restaurant",debug);
      let filtered=filterRestaurantResults(restaurantRaw,intent);
      if (!filtered.length && restaurantSearchTerms(intent).length) {
        usedFallback = true;
        restaurantRaw=await recoverEnterpriseLane(supabase,intent,"restaurant",debug);
        filtered=filterRestaurantResults(restaurantRaw,intent);
      }
      perf.restaurant_rpc_ms = Date.now() - rpcStarted;
    }
    if (intent.needsActivity) {
      const rpcStarted = Date.now();
      activityRaw = await searchEnterpriseLane(supabase,intent,"activity",debug);
      let filtered=filterActivityResults(activityRaw,intent);
      if (!filtered.length && activitySearchTerms(intent).length) {
        usedFallback = true;
        activityRaw=await recoverEnterpriseLane(supabase,intent,"activity",debug);
        filtered=filterActivityResults(activityRaw,intent);
      }
      perf.activity_rpc_ms = Date.now() - rpcStarted;
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
    perf.total_ms = Date.now() - started;
    const locationArea = intent.geo.neighborhood ?? intent.geo.borough ?? intent.geo.city ?? intent.geo.county ?? intent.geo.raw ?? null;
    const speedStatus = getSearchSpeedStatus({ totalMs: perf.total_ms, success: true });
    const performanceDebug = { ...perf, speed_status: speedStatus, result_count: matched_locations.length, restaurant_count: restaurants.length, activity_count: activities.length, pair_count: pairs.length, source: options?.source ?? "enterprise_search", route: options?.route ?? null, used_custom_prompt: Boolean(options?.usedCustomPrompt), beta_assignment_id: options?.betaAssignmentId ?? null, beta_tester_id: options?.betaTesterId ?? null };
    const fullDebug={ search_system:"enterprise-search-v1", rawQuery:query, llmIntentRaw, normalizedIntent:intent, restaurantTerms:restaurantSearchTerms(intent), activityTerms:activitySearchTerms(intent), geo:intent.geo, ...debug, restaurantRejectedReasons, activityRejectedReasons, restaurantRejectedSummary, activityRejectedSummary, distanceScoringUsed:Boolean(intent.geo.latitude&&intent.geo.longitude), pairDistanceMiles:pairs.map(p=>p.pairDistanceMiles), pairingPreference:intent.pairingPreference, pairCandidatesEvaluated:pairingDebug.pairCandidatesEvaluated, pairsRejectedForDistance:pairingDebug.pairsRejectedForDistance, pairsRejectedForMissingCoordinates:pairingDebug.pairsRejectedForMissingCoordinates, rejectedPairs:pairingDebug.rejectedPairs, walkablePairsFound:pairingDebug.walkablePairsFound, maxPairDistanceMiles:intent.pairingPreference?.maxPairDistanceMiles ?? null, distanceMode:intent.pairingPreference?.distanceMode ?? "any", renderMode:render_mode, timingMs:perf.total_ms, performance: performanceDebug, restaurantRecoveryUsed: usedFallback && restaurantRaw.length > 0, activityRecoveryUsed: usedFallback && activityRaw.length > 0, llmError };
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
        usedLlm: Boolean(options.useLLM),
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
        usedLlm: Boolean(options.useLLM),
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
