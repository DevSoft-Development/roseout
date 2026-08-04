import { randomUUID } from "node:crypto";
import { normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import { deterministicParse } from "./deterministicParser";
import type { DistanceConstraintType, SearchPlan, SearchPlannerInput, TravelMode } from "./searchPlanTypes";
import { validateSearchPlan } from "./validateSearchPlan";

const DEFAULT_MARKET_CENTER = { latitude: 40.758, longitude: -73.9855, radiusMiles: 45 };
const NUMBER_WORDS: Record<string, number> = { one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,fifteen:15,twenty:20,twentyfive:25,thirty:30,forty:40,fortyfive:45,sixty:60 };
function numericToken(value: string | undefined) { if (!value) return null; const compact = value.toLowerCase().replace(/[ -]/g, ""); const parsed = Number(value); return Number.isFinite(parsed) ? parsed : NUMBER_WORDS[compact] ?? null; }
function driveRadiusMiles(minutes: number) { return Math.max(1, Math.min(30, minutes * 0.35)); }

function resolveTravelPolicy(query: string, parsedWalkMinutes: number | null | undefined) {
  const q = query.toLowerCase();
  const walking = /\b(walk|walking|walkable|walking distance|on foot)\b/.test(q);
  const driving = /\b(drive|driving|by car|car ride)\b/.test(q);
  const explicitMiles = q.match(/\b(?:within|under|less than|max(?:imum)?(?: of)?|no more than)\s*(\d+(?:\.\d+)?)\s*(?:mile|miles|mi)\b/);
  const walkMatch = q.match(/\b(?:within|under|max(?:imum)?(?: of)?|no more than|longer than)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|twenty[- ]five|thirty|forty|forty[- ]five|sixty)\s*(?:minute|minutes|min)\s*(?:walk|walking)\b/);
  const driveMatch = q.match(/\b(?:within|under|less than|max(?:imum)?(?: of)?|no more than|rather not drive more than)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|twenty[- ]five|thirty|forty|forty[- ]five|sixty)\s*(?:minute|minutes|min)\s*(?:drive|driving|car ride)\b/);
  const explicitWalkMinutes = parsedWalkMinutes ?? numericToken(walkMatch?.[1]);
  const explicitDriveMinutes = numericToken(driveMatch?.[1]);
  const hasWalkMinutes = explicitWalkMinutes != null && explicitWalkMinutes > 0;
  const hasDriveMinutes = explicitDriveMinutes != null && explicitDriveMinutes > 0;
  const mode: TravelMode = walking || hasWalkMinutes ? "walking" : driving || hasDriveMinutes ? "driving" : "unspecified";
  const hard = Boolean(hasWalkMinutes || hasDriveMinutes || explicitMiles);
  const constraint: DistanceConstraintType = hard ? "hard" : walking || driving || /\b(near|nearby|close to|around|short drive)\b/.test(q) ? "soft" : "none";
  const maxWalkingMinutes = hasWalkMinutes ? Number(explicitWalkMinutes) : walking && !/\bshort walk\b/.test(q) ? 30 : null;
  const maxDrivingMinutes = hasDriveMinutes ? Number(explicitDriveMinutes) : null;
  const maxDistanceMiles = explicitMiles ? Number(explicitMiles[1]) : maxWalkingMinutes != null ? maxWalkingMinutes / 20 : maxDrivingMinutes != null ? driveRadiusMiles(maxDrivingMinutes) : null;
  return { mode, constraint, explicit: Boolean(walking || driving || hard), maxWalkingMinutes, maxDrivingMinutes, maxDistanceMiles };
}

function parsePartySize(query: string) {
  const q = query.toLowerCase();
  const numeric = q.match(/\b(?:for|group of|party of)\s+(\d{1,2})\b/);
  if (numeric) return Number(numeric[1]);
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const word = q.match(/\b(?:for|group of|party of)\s+(two|three|four|five|six|seven|eight|nine|ten)\b/);
  return word ? words[word[1]] : null;
}

export async function buildSearchPlan({ input }: { input: SearchPlannerInput }): Promise<SearchPlan> {
  const p = deterministicParse(input);
  const travel = resolveTravelPolicy(input.query, p.walkMinutes);
  const explicitMixedRequest = p.restaurantSignal && p.activitySignal;
  const namedRestaurantNear = Boolean(p.anchorName && /\b(?:near|close to|around)\b/i.test(input.query) && (p.restaurantSignal || p.cuisineMatches.length || p.foodMatches.length));
  const calledLocation = Boolean(p.anchorName && /\b(?:location|place|venue)\s+(?:called|named)\b/i.test(input.query));
  const anchored = Boolean(p.anchorName && (p.genericAnchor || calledLocation || (!explicitMixedRequest && (namedRestaurantNear || /\b(restaurant|activity|dinner|food|lunch|breakfast|brunch)\s+(?:near|close to|around)\b/i.test(input.query)))));
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
  const coordinateFirstLocality = Boolean(place?.[3] === "LONG_ISLAND" && latitude != null && longitude != null);
  const resolvedCity = p.genericAnchor ? null : coordinateFirstLocality ? null : geoRecord?.city ?? (geoRecord?.type === "city" ? geoRecord.name : place?.[1] ?? null);
  const resolvedBorough = p.genericAnchor ? null : geoRecord?.borough ?? (geoRecord?.type === "borough" ? geoRecord.name : place?.[2] ?? null);
  const resolvedCounty = geoRecord?.county ?? (geoRecord?.type === "county" ? geoRecord.name : place?.[4] ?? null);
  const plan: SearchPlan = {
    version: "search-plan-v1", requestId: input.requestId ?? randomUUID(), rawQuery: input.query, mode,
    restaurant: { required: restaurantRequired || anchored, cuisines: p.cuisineMatches, foods: p.foodMatches, mealPeriods: ["breakfast", "brunch", "lunch", "dinner"].filter((x) => p.q.includes(x)), features: p.restaurantFeatures, exclusions: [] },
    activity: { required: activityRequired, categories: p.activityCategories, features: p.activityFeatures, exclusions: [] },
    geo: { source: anchored ? "anchor" : place ? "explicit" : current ? "current_location" : "default_market", market: place?.[3] ?? input.market ?? null, city: resolvedCity, borough: resolvedBorough, neighborhood: geoRecord?.type === "neighborhood" ? geoRecord.name : null, county: resolvedCounty, state: geoRecord?.state ?? "NY", latitude, longitude, radiusMiles, strictness: place ? "strict" : current ? "preferred" : "broad" },
    anchor: { requested: anchored, rawName: anchored ? p.anchorName : null, locationId: null, name: anchored ? p.anchorName : null, latitude: null, longitude: null },
    travel: { mode: travel.mode, constraint: travel.constraint, explicit: travel.explicit, maxWalkingMinutes: travel.maxWalkingMinutes, maxDrivingMinutes: travel.maxDrivingMinutes },
    pairing: { required: restaurantRequired && activityRequired, sameVenuePreferred: p.sameVenuePreferred, sameVenueRequired: p.sameVenueRequired, sequence: p.sequence, maxDistanceMiles: travel.maxDistanceMiles, maxWalkingMinutes: travel.maxWalkingMinutes, maxDrivingMinutes: travel.maxDrivingMinutes, requireWalkable: travel.mode === "walking" },
    audience: { familyFriendly: p.family, minorsPresent: p.family, adultOnlyRequested: /\b(adult[- ]only|21\+)\b/.test(p.q) },
    occasion: /date night/.test(p.q) ? "date_night" : /girls night/.test(p.q) ? "girls_night" : p.family ? "family_outing" : null, partySize: parsePartySize(input.query), plannedFor: input.plannedFor ?? null,
    fallback: { allowNearbyPair: !p.sameVenueRequired, allowPartial: true, allowBroaderGeo: travel.constraint !== "hard", maximumRadiusMiles: travel.constraint === "hard" ? travel.maxDistanceMiles : 45 },
    confidence: { overall: place && (restaurantRequired || activityRequired || anchored) ? .96 : .85, mode: .95, restaurant: restaurantRequired || anchored ? .95 : .9, activity: activityRequired ? .95 : .9, geo: place || current || useDefaultMarketCoordinates ? .95 : .7 },
    parser: { source: "deterministic", reasons: [anchored ? `${p.genericAnchor ? "generic" : "named"} anchor extracted: ${p.anchorName}` : coordinateFirstLocality ? `coordinate-first canonical locality resolved for ${geoRecord?.name ?? place?.[1]}` : geoRecord ? `canonical centroid resolved for ${geoRecord.name}` : "explicit taxonomy, mode, sequence, geography, and travel signals resolved"] },
  };
  validateSearchPlan(plan);
  return deepFreeze(plan);
}
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
