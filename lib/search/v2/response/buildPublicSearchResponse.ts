import type { SearchPlan } from "../planner/searchPlanTypes";
import type { ResolvedSearchResult } from "../fallback/fallbackTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { PublicLocationCard, PublicSearchResponseV2 } from "./responseTypes";
import { resultCounts } from "./resultCounts";
import { sanitizePublicLocation } from "./sanitizePublicLocation";

const card = (item: ResolvedSearchResult["restaurants"][number]): PublicLocationCard => {
  const whyMatched = item.reasons.filter((reason) => !/deterministic ranking|bounded ML ranking boost applied/i.test(reason)).join("; ");
  return sanitizePublicLocation({ ...item.candidate.candidate.location, searchRole: item.selectedRole, searchScore: item.scores.total, matchReasons: item.reasons, whyMatched, why_it_matched: whyMatched });
};

function primaryDomain(plan: SearchPlan): PublicSearchResponseV2["primaryDomain"] { if (plan.mode === "anchored_nearby") return "anchor"; if (plan.restaurant.required && plan.activity.required) return "mixed"; if (plan.activity.required) return "activity"; return "restaurant"; }

export function buildPublicSearchResponse({ plan, result, trace }: { plan: SearchPlan; result: ResolvedSearchResult; trace: SearchTrace }): PublicSearchResponseV2 {
  const restaurants = result.restaurants.map(card);
  const activities = result.activities.map(card);
  const sameVenueResults = result.sameVenueResults.map(card);
  const pairs = result.pairs.map((pair) => { const pairReasons = [...pair.restaurant.reasons.filter((reason) => /matched|qualified|casual|relaxed|dinner/i.test(reason)), ...pair.activity.reasons.filter((reason) => /matched|qualified|casual|relaxed/i.test(reason)), ...pair.reasons]; const whyMatched = pairReasons.join("; "); return { restaurant: card(pair.restaurant), activity: card(pair.activity), distanceMiles: pair.distanceMiles, walkingMinutes: pair.walkingMinutes, score: pair.scores.total, matchReasons: pairReasons, whyMatched, why_it_matched: whyMatched }; });
  const builderRestaurants = result.builderRestaurants.map(card);
  const builderActivities = result.builderActivities.map(card);
  const displayMode = pairs.length ? "pairs" : sameVenueResults.length ? "same_venue_cards" : result.partialResults ? "partial_mixed" : restaurants.length ? "restaurant_cards" : activities.length ? "activity_cards" : "empty";
  const domain = primaryDomain(plan);
  const applied = Boolean(trace.ml.enabled && (trace.ml.phase1Enabled || trace.ml.phase2Enabled));
  const configuredVariant = trace.ml.rankingVariant;
  const appliedVariant = applied ? configuredVariant ?? "ml" : "control";
  const anchorLocation = plan.anchor.requested && plan.anchor.name ? sanitizePublicLocation({ id: plan.anchor.locationId ?? `anchor:${plan.anchor.name}`, name: plan.anchor.name, activity_name: plan.anchor.name, location_type: "anchor", primary_category: "anchor", city: plan.geo.city, borough: plan.geo.borough, state: plan.geo.state, latitude: plan.anchor.latitude, longitude: plan.anchor.longitude } as PublicLocationCard) : null;
  return {
    version: "public-search-v2", success: result.requestFulfilled || result.partialResults, requestFulfilled: result.requestFulfilled, partialResults: result.partialResults, requestId: plan.requestId, requestedMode: plan.mode, resolvedMode: result.resolvedMode, primaryDomain: domain, primary_domain: domain, displayMode, searchPlan: plan, restaurants, activities, sameVenueResults, pairs,
    builder: { enabled: Boolean(builderRestaurants.length && builderActivities.length), restaurants: builderRestaurants, activities: builderActivities, selectedRestaurantId: null, selectedActivityId: null },
    anchor: { requested: plan.anchor.requested, resolved: Boolean(plan.anchor.locationId && plan.anchor.latitude != null && plan.anchor.longitude != null), rawName: plan.anchor.rawName, relationship: plan.anchor.requested ? "near" : null, location: anchorLocation },
    counts: resultCounts(result), fallback: { used: result.used, reason: result.reason }, message: result.requestFulfilled ? "We found options matching your outing." : result.partialResults ? "We found partial matches and clearly labeled them." : "No valid matches were found within your constraints.", timing: trace.timing,
    ml: { enabled: trace.ml.enabled, modelVersion: trace.ml.modelVersion, rankingVariant: appliedVariant, configuredVariant, appliedVariant, applied, shadowOnly: trace.ml.enabled && !applied, rolloutBucket: trace.ml.rolloutBucket, reason: applied ? "ML ranking affected the served order." : trace.ml.enabled ? "ML was configured but did not affect the served order." : "ML ranking was disabled." },
  };
}
