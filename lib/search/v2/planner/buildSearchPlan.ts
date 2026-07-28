import { randomUUID } from "node:crypto";
import { deterministicParse } from "./deterministicParser";
import type { SearchPlan, SearchPlannerInput } from "./searchPlanTypes";
import { validateSearchPlan } from "./validateSearchPlan";

export async function buildSearchPlan({ input }: { input: SearchPlannerInput }): Promise<SearchPlan> {
  const p = deterministicParse(input);
  const namedRestaurantNear = Boolean(
    p.anchorName &&
      /\bnear\b/i.test(input.query) &&
      (p.restaurantSignal || p.cuisineMatches.length || p.foodMatches.length),
  );
  const anchored = Boolean(
    p.anchorName &&
      (namedRestaurantNear || /\b(restaurant|activity|dinner|food)\s+near\b/i.test(input.query)),
  );
  const restaurantRequired = input.selectedLane === "restaurant" || (input.selectedLane !== "activity" && p.restaurantSignal);
  const activityRequired = input.selectedLane === "activity" || (input.selectedLane !== "restaurant" && p.activitySignal && !anchored);
  const mode = anchored ? "anchored_nearby" : restaurantRequired && activityRequired ? (p.sameVenuePreferred ? "same_venue" : "paired_outing") : activityRequired ? "activity_only" : "restaurant_only";
  const place = p.place;
  const current = input.userLocation;
  const plan: SearchPlan = {
    version: "search-plan-v1", requestId: input.requestId ?? randomUUID(), rawQuery: input.query,
    mode,
    restaurant: { required: restaurantRequired || anchored, cuisines: p.cuisineMatches, foods: p.foodMatches, mealPeriods: ["breakfast", "brunch", "lunch", "dinner"].filter((x) => p.q.includes(x)), features: p.featureMatches, exclusions: [] },
    activity: { required: activityRequired, categories: anchored ? [] : p.activityCategories, features: p.featureMatches, exclusions: [] },
    geo: { source: anchored ? "anchor" : place ? "explicit" : current ? "current_location" : "default_market", market: place?.[3] ?? input.market ?? (current ? null : "NYC_LONG_ISLAND"), city: place?.[1] ?? null, borough: place?.[2] ?? null, neighborhood: place?.[1] ?? null, county: place?.[4] ?? null, state: "NY", latitude: current?.latitude ?? null, longitude: current?.longitude ?? null, radiusMiles: current?.radiusMiles ?? (place ? 8 : 45), strictness: place ? "strict" : current ? "preferred" : "broad" },
    anchor: { requested: anchored, rawName: anchored ? p.anchorName : null, locationId: null, name: anchored ? p.anchorName : null, latitude: null, longitude: null },
    pairing: { required: restaurantRequired && activityRequired, sameVenuePreferred: p.sameVenuePreferred, sameVenueRequired: p.sameVenueRequired, sequence: p.sequence, maxDistanceMiles: p.walkMinutes ? p.walkMinutes / 20 : 3, maxWalkingMinutes: p.walkMinutes, requireWalkable: p.walkMinutes != null },
    audience: { familyFriendly: p.family, minorsPresent: p.family, adultOnlyRequested: /\b(adult[- ]only|21\+)\b/.test(p.q) },
    occasion: /date night/.test(p.q) ? "date_night" : /girls night/.test(p.q) ? "girls_night" : p.family ? "family_outing" : null, partySize: null, plannedFor: input.plannedFor ?? null,
    fallback: { allowNearbyPair: !p.sameVenueRequired, allowPartial: true, allowBroaderGeo: true, maximumRadiusMiles: 45 },
    confidence: { overall: place && (restaurantRequired || activityRequired) ? .96 : .85, mode: .95, restaurant: restaurantRequired ? .95 : .9, activity: activityRequired ? .95 : .9, geo: place || current ? .95 : .7 }, parser: { source: "deterministic", reasons: ["explicit taxonomy, mode, sequence, and geography signals resolved"] },
  };
  validateSearchPlan(plan);
  return deepFreeze(plan);
}
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }