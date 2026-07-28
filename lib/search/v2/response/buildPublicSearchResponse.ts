import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ResolvedSearchResult } from "../fallback/fallbackTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { PublicLocationCard, PublicSearchResponseV2 } from "./responseTypes";
import { resultCounts } from "./resultCounts";

const card = (item: ResolvedSearchResult["restaurants"][number]): PublicLocationCard => {
  const whyMatched = item.reasons.filter((reason) => !/deterministic ranking|bounded ML ranking boost applied/i.test(reason)).join("; ");
  return {
    ...item.candidate.candidate.location,
    searchRole: item.selectedRole,
    searchScore: item.scores.total,
    matchReasons: item.reasons,
    whyMatched,
    why_it_matched: whyMatched,
  };
};

export function buildPublicSearchResponse({ plan, result, trace }: { plan: SearchPlan; result: ResolvedSearchResult; trace: SearchTrace }): PublicSearchResponseV2 {
  const restaurants = result.restaurants.map(card);
  const activities = result.activities.map(card);
  const sameVenueResults = result.sameVenueResults.map(card);
  const pairs = result.pairs.map((pair) => {
    const pairReasons = [
      ...pair.restaurant.reasons.filter((reason) => /matched|qualified|casual|relaxed/i.test(reason)),
      ...pair.activity.reasons.filter((reason) => /matched|qualified|casual|relaxed/i.test(reason)),
      ...pair.reasons,
    ];
    const whyMatched = pairReasons.join("; ");
    return {
      restaurant: card(pair.restaurant),
      activity: card(pair.activity),
      distanceMiles: pair.distanceMiles,
      walkingMinutes: pair.walkingMinutes,
      score: pair.scores.total,
      matchReasons: pairReasons,
      whyMatched,
      why_it_matched: whyMatched,
    };
  });
  const displayMode = pairs.length ? "pairs" : sameVenueResults.length ? "same_venue_cards" : result.partialResults ? "partial_mixed" : restaurants.length ? "restaurant_cards" : activities.length ? "activity_cards" : "empty";
  return {
    version: "public-search-v2",
    success: result.requestFulfilled || result.partialResults,
    requestFulfilled: result.requestFulfilled,
    partialResults: result.partialResults,
    requestId: plan.requestId,
    requestedMode: plan.mode,
    resolvedMode: result.resolvedMode,
    displayMode,
    searchPlan: plan,
    restaurants,
    activities,
    sameVenueResults,
    pairs,
    counts: resultCounts(result),
    fallback: { used: result.used, reason: result.reason },
    message: result.requestFulfilled ? "We found options matching your outing." : result.partialResults ? "We found partial matches and clearly labeled them." : "No valid matches were found within your constraints.",
    timing: trace.timing,
    ml: { enabled: trace.ml.enabled, modelVersion: trace.ml.modelVersion, rankingVariant: trace.ml.rankingVariant, rolloutBucket: trace.ml.rolloutBucket },
  };
}
