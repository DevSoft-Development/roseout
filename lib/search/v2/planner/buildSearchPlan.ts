import { randomUUID } from "node:crypto";
import { normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import { deterministicParse } from "./deterministicParser";
import type { DistanceConstraintType, SearchPlan, SearchPlannerInput, TravelMode } from "./searchPlanTypes";
import { validateSearchPlan } from "./validateSearchPlan";

const DEFAULT_MARKET_CENTER = { latitude: 40.758, longitude: -73.9855, radiusMiles: 45 };

function resolveTravelPolicy(query: string, parsedWalkMinutes: number | null | undefined) {
  const q = query.toLowerCase();
  const walking = /\b(walk|walking|walkable|walking distance|on foot)\b/.test(q);
  const driving = /\b(drive|driving|by car|car ride)\b/.test(q);
  const explicitMiles = q.match(/\b(?:within|under|less than|max(?:imum)?(?: of)?)\s*(\d+(?:\.\d+)?)\s*(?:mile|miles|mi)\b/);
  const explicitWalkMinutes = parsedWalkMinutes ?? Number(q.match(/\b(?:within|under|max(?:imum)?(?: of)?)\s*(\d+)\s*(?:minute|minutes|min)\s*(?:walk|walking)\b/)?.[1] ?? NaN);
  const hasWalkMinutes = Number.isFinite(explicitWalkMinutes);
  const mode: TravelMode = walking || hasWalkMinutes ? "walking" : driving ? "driving" : "unspecified";
  const constraint: DistanceConstraintType = walking || hasWalkMinutes || explicitMiles ? "hard" : /\b(near|nearby|close to|around)\b/.test(q) ? "soft" : "none";
  const maxWalkingMinutes = hasWalkMinutes ? Number(explicitWalkMinutes) : walking ? 30 : null;
  const maxDistanceMiles = explicitMiles ? Number(explicitMiles[1]) : maxWalkingMinutes != null ? maxWalkingMinutes / 20 : null;
  return { mode, constraint, explicit: Boolean(walking || driving || hasWalkMinutes || explicitMiles), maxWalkingMinutes, maxDistanceMiles };
}

export async function buildSearchPlan({ input }: { input: SearchPlannerInput }): Promise<SearchPlan> {
  const p = deterministicParse(input);
  const travel = resolveTravelPolicy(input.query, p.walkMinutes);
  const explicitMixedRequest = p.restaurantSignal && p.activitySignal;
  const namedRestaurantNear = Boolean(p.anchorName && /\bnear\b/i.test(input.query) && (p.restaurantSignal || p.cuisineMatches.length || p.foodMatches.length));
  const anchored = Boolean(p.anchorName && !explicitMixedRequest && (namedRestaurantNear || /\b(restaurant|activity|dinner|food|lunch|breakfast|brunch)\s+near\b/i.test(input.query)));
  const restaurantRequired = input.selectedLane === "restaurant" || (input.selectedLane !== "activity" && p.restaurantSignal);
  const activityRequired = input.selectedLane === "activity" || (input.selectedLane !== "restaurant" && p.activitySignal);
  const mode = anchored ? "anchored_nearby" : restaurantRequired && activityRequired ? (p.sameVenuePreferred ? "same_venue" : "paired_outing") : activityRequired ? "activity_only" : "restaurant_only";
  const place = p.place;
  const current = input.userLocation;
  const geoRecord = place ? normalizeGeoTerm(place[0] ?? place[1]) ?? normalizeGeoTerm(place[1]) : null;
  const useDefaultMarketCoordinates = !anchored && !place && !current;
  const latitude = current?.latitude ?? geoRecord?.latitude ?? (useDefaultMarketCoordinates ? DEFAULT_MARKET_CENTER.latitude : null);
  const longitude = current?.longitude ?? geoRecord?.longitude ?? (useDefaultMarketCoordinates ? DEFAULT_MARKET_CENTER.longitude : null);
  const radiusMiles = current?.radiusMiles ?? geoRecord?.defaultRadiusMiles ?? (place ? 8 : DEFAULT_MARKET_CENTER.radiusMiles);
  const plan: SearchPlan = {
    version: "search-plan-v1", requestId: input.requestId ?? randomUUID(), rawQuery: input.query, mode,
    restaurant: { required: restaurantRequired || anchored, cuisines: p.cuisineMatches, foods: p.foodMatches, mealPeriods: ["breakfast", "brunch", "lunch", "dinner"].filter((x) => p.q.includes(x)), features: p.featureMatches, exclusions: [] },
    activity: { required: activityRequired, categories: p.activityCategories, features: p.featureMatches, exclusions: [] },
    geo: { source: anchored ? "anchor" : place ? "explicit" : current ? "current_location" : "default_market", market: place?.[3] ?? input.market ?? null, city: geoRecord?.city ?? (geoRecord?.type === "city" ? geoRecord.name : place?.[1] ?? null), borough: geoRecord?.borough ?? (geoRecord?.type === "borough" ? geoRecord.name : place?.[2] ?? null), neighborhood: geoRecord?.type === "neighborhood" ? geoRecord.name : null, county: geoRecord?.county ?? (geoRecord?.type === "county" ? geoRecord.name : place?.[4] ?? null), state: geoRecord?.state ?? "NY", latitude, longitude, radiusMiles, strictness: place ? "strict" : current ? "preferred" : "broad" },
    anchor: { requested: anchored, rawName: anchored ? p.anchorName : null, locationId: null, name: anchored ? p.anchorName : null, latitude: null, longitude: null },
    travel: { mode: travel.mode, constraint: travel.constraint, explicit: travel.explicit },
    pairing: { required: restaurantRequired && activityRequired, sameVenuePreferred: p.sameVenuePreferred, sameVenueRequired: p.sameVenueRequired, sequence: p.sequence, maxDistanceMiles: travel.maxDistanceMiles, maxWalkingMinutes: travel.maxWalkingMinutes, requireWalkable: travel.mode === "walking" },
    audience: { familyFriendly: p.family, minorsPresent: p.family, adultOnlyRequested: /\b(adult[- ]only|21\+)\b/.test(p.q) },
    occasion: /date night/.test(p.q) ? "date_night" : /girls night/.test(p.q) ? "girls_night" : p.family ? "family_outing" : null, partySize: null, plannedFor: input.plannedFor ?? null,
    fallback: { allowNearbyPair: !p.sameVenueRequired, allowPartial: true, allowBroaderGeo: travel.constraint !== "hard", maximumRadiusMiles: travel.constraint === "hard" ? travel.maxDistanceMiles : 45 },
    confidence: { overall: place && (restaurantRequired || activityRequired) ? .96 : .85, mode: .95, restaurant: restaurantRequired ? .95 : .9, activity: activityRequired ? .95 : .9, geo: place || current || useDefaultMarketCoordinates ? .95 : .7 },
    parser: { source: "deterministic", reasons: [geoRecord ? `canonical centroid resolved for ${geoRecord.name}` : "explicit taxonomy, mode, sequence, geography, and travel signals resolved"] },
  };
  validateSearchPlan(plan);
  return deepFreeze(plan);
}
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
