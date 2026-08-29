import { randomUUID } from "node:crypto";
import { normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import { deterministicParse } from "./deterministicParser";
import { detectExplicitDomainSignals } from "./explicitDomainSignals";
import { extractV2RawRestaurantDishTerms } from "./rawRestaurantDishTerms";
import type {
  DistanceConstraintType,
  SearchPlan,
  SearchPlannerInput,
  TravelMode,
} from "./searchPlanTypes";
import { validateSearchPlan } from "./validateSearchPlan";

const DEFAULT_MARKET_CENTER = {
  latitude: 40.758,
  longitude: -73.9855,
  radiusMiles: 45,
};
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  twentyfive: 25,
  thirty: 30,
  forty: 40,
  fortyfive: 45,
  sixty: 60,
};
const DURATION =
  "(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|twenty[- ]five|thirty|forty|forty[- ]five|sixty)";
const SOFT_RESTAURANT_PREFERENCES = new Set([
  "family_friendly",
  "casual",
  "romantic",
  "group_friendly",
  "quiet",
  "relaxed",
]);
const PLANNER_CONTROL_FOOD_TERMS = new Set([
  "same venue",
  "same place",
  "one venue",
  "one place",
  "under one roof",
  "same",
  "venue",
  "place",
  "under",
  "one",
  "roof",
  "walking distance",
  "walking",
  "walk",
  "walkable",
  "distance",
  "on foot",
  "driving",
  "drive",
  "by car",
  "car ride",
]);

function numericToken(value: string | undefined) {
  if (!value) return null;
  const compact = value.toLowerCase().replace(/[ -]/g, "");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NUMBER_WORDS[compact] ?? null;
}
function driveRadiusMiles(minutes: number) {
  return Math.max(1, Math.min(30, minutes * 0.35));
}
function resolveTravelPolicy(
  query: string,
  parsedWalkMinutes: number | null | undefined,
) {
  const q = query.toLowerCase();
  const walking = /\b(walk|walking|walkable|walking distance|on foot)\b/.test(q);
  const driving = /\b(drive|driving|by car|car ride|travel by car)\b/.test(q);
  const explicitMiles = q.match(
    /\b(?:within|under|less than|max(?:imum)?(?: of)?|no more than)\s*(\d+(?:\.\d+)?)\s*(?:mile|miles|mi)\b/,
  );
  const walkAfter = q.match(
    new RegExp(
      `\\b(?:within|under|max(?:imum)?(?: of)?|no more than|longer than)\\s*(?:a\\s*)?${DURATION}\\s*[- ]?\\s*(?:minute|minutes|min)\\s*(?:walk|walking)\\b`,
    ),
  );
  const driveAfter = q.match(
    new RegExp(
      `\\b(?:within|under|less than|max(?:imum)?(?: of)?|no more than)\\s*(?:a\\s*)?${DURATION}\\s*[- ]?\\s*(?:minute|minutes|min)\\s*(?:drive|driving|car ride)\\b`,
    ),
  );
  const driveBefore = q.match(
    new RegExp(
      `\\b(?:rather not|do not want to|don't want to|would not like to)?\\s*(?:drive|driving)(?:\\s+for)?(?:\\s+more than|\\s+over|\\s+longer than)?\\s*${DURATION}\\s*[- ]?\\s*(?:minute|minutes|min)\\b`,
    ),
  );
  const travelMinutes = q.match(
    new RegExp(
      `\\b(?:within|under|no more than)\\s*${DURATION}\\s*[- ]?\\s*(?:minute|minutes|min)\\s+of\\s+travel\\b`,
    ),
  );
  const explicitWalkMinutes = parsedWalkMinutes ?? numericToken(walkAfter?.[1]);
  const explicitDriveMinutes = numericToken(driveAfter?.[1] ?? driveBefore?.[1]);
  const ambiguousTravelMinutes = numericToken(travelMinutes?.[1]);
  const hasWalkMinutes = explicitWalkMinutes != null && explicitWalkMinutes > 0;
  const hasDriveMinutes = explicitDriveMinutes != null && explicitDriveMinutes > 0;
  const mode: TravelMode = walking || hasWalkMinutes
    ? "walking"
    : driving || hasDriveMinutes
      ? "driving"
      : "unspecified";
  const hard = Boolean(
    hasWalkMinutes || hasDriveMinutes || explicitMiles || ambiguousTravelMinutes,
  );
  const constraint: DistanceConstraintType = hard
    ? "hard"
    : walking || driving || /\b(near|nearby|close to|around|short drive)\b/.test(q)
      ? "soft"
      : "none";
  const maxWalkingMinutes = hasWalkMinutes
    ? Number(explicitWalkMinutes)
    : walking && !/\bshort walk\b/.test(q)
      ? 30
      : null;
  const maxDrivingMinutes = hasDriveMinutes
    ? Number(explicitDriveMinutes)
    : mode === "driving" && ambiguousTravelMinutes != null
      ? ambiguousTravelMinutes
      : null;
  const maxDistanceMiles = explicitMiles
    ? Number(explicitMiles[1])
    : maxWalkingMinutes != null
      ? maxWalkingMinutes / 20
      : maxDrivingMinutes != null
        ? driveRadiusMiles(maxDrivingMinutes)
        : ambiguousTravelMinutes != null
          ? driveRadiusMiles(ambiguousTravelMinutes)
          : null;
  return {
    mode,
    constraint,
    explicit: Boolean(walking || driving || hard),
    maxWalkingMinutes,
    maxDrivingMinutes,
    maxDistanceMiles,
  };
}
function parsePartySize(query: string) {
  const q = query.toLowerCase();
  const numeric = q.match(/\b(?:for|group of|party of)\s+(\d{1,2})\b/);
  if (numeric) return Number(numeric[1]);
  const words: Record<string, number> = {
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const word = q.match(
    /\b(?:for|group of|party of)\s+(two|three|four|five|six|seven|eight|nine|ten)\b/,
  );
  return word ? words[word[1]] : null;
}

function normalizedPlannerQuery(query: string) {
  return String(query || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPlannerControlLanguage(query: string) {
  return String(query || "")
    .replace(/\b(?:same (?:venue|place)|one (?:venue|place)|under one roof)\b/gi, " ")
    .replace(/\b(?:walking distance|walkable|on foot|walking|walk|driving|drive|by car|car ride)\b/gi, " ")
    .replace(/\b(?:today|tomorrow)\b(?:\s+at)?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlannerControlFoodTerm(value: string) {
  const normalized = normalizedPlannerQuery(value).replace(/[_-]+/g, " ");
  if (!normalized) return true;
  if (PLANNER_CONTROL_FOOD_TERMS.has(normalized)) return true;
  return /^(?:today|tomorrow)(?:\s+at)?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))?$/.test(normalized);
}

function cleanPlannerFoodTerms(terms: readonly string[]) {
  return terms.filter((term) => !isPlannerControlFoodTerm(term));
}

function newYorkParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function newYorkOffsetMs(date: Date) {
  const parts = newYorkParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(date.getTime() / 1000) * 1000;
}

function newYorkLocalToIso(year: number, month: number, day: number, hour: number, minute: number) {
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = new Date(wallClockUtc - newYorkOffsetMs(new Date(wallClockUtc)));
  instant = new Date(wallClockUtc - newYorkOffsetMs(instant));
  return instant.toISOString();
}

function parseRelativePlannedFor(query: string, now = new Date()) {
  const match = normalizedPlannerQuery(query).match(
    /\b(today|tomorrow)\b(?:[^0-9]{0,24}\bat\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/,
  );
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = Number(match[3] ?? 0);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (match[4] === "pm" && hour !== 12) hour += 12;
  if (match[4] === "am" && hour === 12) hour = 0;
  const current = newYorkParts(now);
  const targetDate = new Date(Date.UTC(current.year, current.month - 1, current.day + (match[1] === "tomorrow" ? 1 : 0)));
  return newYorkLocalToIso(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth() + 1,
    targetDate.getUTCDate(),
    hour,
    minute,
  );
}

function hasExplicitRestaurantRequest(q: string) {
  return /\b(restaurant|restaurants|dinner|brunch|lunch|breakfast|food|eat|dining|steakhouse|sushi|pizza|tacos?|italian|mexican|seafood)\b/.test(q);
}

function hasExplicitActivityRequest(q: string) {
  return /\b(activity|activities|things? to do|date ideas?|date activities|bowling|karaoke|museum|arcade|comedy|escape room|mini golf|paint and sip|spa|theater|theatre|live music|jazz)\b/.test(q);
}

function isBroadDateRequest(query: string) {
  const q = normalizedPlannerQuery(query);
  const broadDate =
    /\b(?:go|going|want|wants|wanted|plan|planning|take|taking|looking|find|finding|need|needs|book|booking)\b[^.?!]{0,45}\b(?:on )?(?:a |an )?(?:romantic )?date\b/.test(q) ||
    /\b(?:a |an )?(?:romantic )?date\s+(?:in|near|around|at)\b/.test(q) ||
    /\b(?:date night|first date|romantic date|anniversary date|couples night|double date)\b/.test(q);
  return broadDate && !hasExplicitRestaurantRequest(q) && !hasExplicitActivityRequest(q);
}

function isBroadGirlsNightRequest(query: string) {
  const q = normalizedPlannerQuery(query);
  return /\bgirls'? night\b/.test(q) && !hasExplicitRestaurantRequest(q) && !hasExplicitActivityRequest(q);
}

function isBroadFamilyOutingRequest(query: string) {
  const q = normalizedPlannerQuery(query);
  return /\bfamily (?:outing|night)\b/.test(q) && !hasExplicitRestaurantRequest(q) && !hasExplicitActivityRequest(q);
}

function isRestaurantBoundHookahRequest(
  query: string,
  activityCategories: readonly string[],
) {
  const q = normalizedPlannerQuery(query);
  if (/\b(?:then|and then|followed by|afterward|afterwards|after|before)\b/.test(q)) return false;

  const featureBound =
    /\b(?:restaurant|dinner|brunch|lunch|food|dining)\b.{0,45}\b(?:with|has|having|offering|that has)\b.{0,30}\b(?:hookah|shisha)\b/.test(q) ||
    /\b(?:hookah|shisha)\s+(?:restaurant|cafe)\b/.test(q);
  if (!featureBound) return false;

  const otherExplicitActivity = activityCategories.some((category) => category !== "hookah");
  const genericSecondActivity = /\b(?:activity|activities|things? to do|something fun|fun activity)\b/.test(q);
  return !otherExplicitActivity && !genericSecondActivity;
}

export async function buildSearchPlan({
  input,
}: {
  input: SearchPlannerInput;
}): Promise<SearchPlan> {
  const p = deterministicParse(input);
  const parsedRestaurantFoodTerms = cleanPlannerFoodTerms(p.foodMatches);
  const explicitDomains = detectExplicitDomainSignals(input.query);
  const travel = resolveTravelPolicy(input.query, p.walkMinutes);
  const automaticLane = input.selectedLane == null || input.selectedLane === "auto";
  const broadDateRequest = automaticLane && isBroadDateRequest(input.query);
  const broadGirlsNightRequest = automaticLane && isBroadGirlsNightRequest(input.query);
  const broadFamilyOutingRequest = automaticLane && isBroadFamilyOutingRequest(input.query);
  const broadOccasionRequest = broadDateRequest || broadGirlsNightRequest || broadFamilyOutingRequest;
  const restaurantBoundHookah = !p.sameVenueRequired && isRestaurantBoundHookahRequest(input.query, p.activityCategories);
  const restaurantSignal = p.restaurantSignal || explicitDomains.restaurant;
  const activitySignal = restaurantBoundHookah
    ? false
    : p.activitySignal || explicitDomains.activity;
  const preferenceRestaurantFallback = Boolean(
    automaticLane &&
      input.preferenceDefaultLane === "restaurant" &&
      !broadOccasionRequest &&
      !restaurantSignal &&
      !activitySignal,
  );
  const explicitMixedRequest = restaurantSignal && activitySignal;
  const anchorEligible =
    p.anchorEntityType === "named_venue" ||
    p.anchorEntityType === "generic_category";
  const namedRestaurantNear = Boolean(
    anchorEligible &&
      p.anchorName &&
      /\b(?:near|close to|around)\b/i.test(input.query) &&
      (restaurantSignal || p.cuisineMatches.length || parsedRestaurantFoodTerms.length),
  );
  const calledLocation = Boolean(
    p.anchorEntityType === "named_venue" &&
      p.anchorName &&
      /\b(?:location|place|venue)\s+(?:called|named)\b/i.test(input.query),
  );
  const anchored = Boolean(
    anchorEligible &&
      p.anchorName &&
      (p.genericAnchor ||
        calledLocation ||
        (!explicitMixedRequest &&
          (namedRestaurantNear ||
            /\b(restaurant|activity|dinner|food|lunch|breakfast|brunch)\s+(?:near|close to|around)\b/i.test(
              input.query,
            )))),
  );
  const restaurantRequired =
    input.selectedLane === "restaurant" ||
    restaurantSignal ||
    broadOccasionRequest ||
    preferenceRestaurantFallback;
  const activityRequired =
    input.selectedLane === "activity" || activitySignal || broadOccasionRequest;
  const pairingRequired =
    !broadOccasionRequest && restaurantRequired && activityRequired;
  const sameVenueRequired = pairingRequired && p.sameVenueRequired;
  const sameVenuePreferred = pairingRequired && p.sameVenuePreferred;
  const mode = anchored
    ? "anchored_nearby"
    : restaurantRequired && activityRequired
      ? sameVenueRequired
        ? "same_venue"
        : "paired_outing"
      : activityRequired
        ? "activity_only"
        : "restaurant_only";
  const place = p.place;
  const current = input.userLocation;
  const geoRecord = place
    ? normalizeGeoTerm(place[0] ?? place[1]) ?? normalizeGeoTerm(place[1])
    : null;
  const useDefaultMarketCoordinates = !anchored && !place && !current;
  const latitude =
    current?.latitude ??
    geoRecord?.latitude ??
    (useDefaultMarketCoordinates ? DEFAULT_MARKET_CENTER.latitude : null);
  const longitude =
    current?.longitude ??
    geoRecord?.longitude ??
    (useDefaultMarketCoordinates ? DEFAULT_MARKET_CENTER.longitude : null);
  const radiusMiles =
    current?.radiusMiles ??
    geoRecord?.defaultRadiusMiles ??
    (place ? 8 : DEFAULT_MARKET_CENTER.radiusMiles);
  const coordinateFirstLocality = Boolean(
    place?.[3] === "LONG_ISLAND" && latitude != null && longitude != null,
  );
  const resolvedCity = p.genericAnchor
    ? null
    : coordinateFirstLocality
      ? null
      : geoRecord?.city ??
        (geoRecord?.type === "city" ? geoRecord.name : place?.[1] ?? null);
  const resolvedBorough = p.genericAnchor
    ? null
    : geoRecord?.borough ??
      (geoRecord?.type === "borough" ? geoRecord.name : place?.[2] ?? null);
  const resolvedCounty =
    geoRecord?.county ??
    (geoRecord?.type === "county" ? geoRecord.name : place?.[4] ?? null);
  const hardRestaurantFeatures = [
    ...new Set([
      ...p.restaurantFeatures.filter(
        (feature) => !SOFT_RESTAURANT_PREFERENCES.has(feature),
      ),
      ...(restaurantBoundHookah ? ["hookah"] : []),
    ]),
  ];
  const activityCategories = restaurantBoundHookah
    ? p.activityCategories.filter((category) => category !== "hookah")
    : p.activityCategories;
  const familyRequested =
    p.family || broadFamilyOutingRequest || /\bfamily (?:outing|night)\b/.test(p.q);
  const mealPeriods = ["breakfast", "brunch", "lunch", "dinner"].filter((x) =>
    p.q.includes(x),
  );
  const occasion = broadDateRequest || /date night/.test(p.q)
    ? "date_night"
    : broadGirlsNightRequest || /girls'? night/.test(p.q)
      ? "girls_night"
      : familyRequested
        ? "family_outing"
        : null;
  const rawRestaurantDishTerms = extractV2RawRestaurantDishTerms(stripPlannerControlLanguage(input.query), {
    required: restaurantRequired || anchored,
    mealPeriods,
    foodTerms: parsedRestaurantFoodTerms,
    cuisineTerms: p.cuisineMatches,
    restaurantFeatures: hardRestaurantFeatures,
    activityCategories,
    activityFeatures: p.activityFeatures,
    occasion,
    geo: {
      raw: place?.[0] ?? place?.[1] ?? null,
      neighborhood: geoRecord?.type === "neighborhood" ? geoRecord.name : null,
      borough: resolvedBorough,
      city: resolvedCity,
      county: resolvedCounty,
      state: geoRecord?.state ?? "NY",
      requestedMarket: place?.[3] ?? input.market ?? null,
      resolvedMarket: place?.[3] ?? input.market ?? null,
    },
  });
  const restaurantFoods = [
    ...new Set(cleanPlannerFoodTerms([...parsedRestaurantFoodTerms, ...rawRestaurantDishTerms])),
  ];
  const reconciledDomains = [
    !p.restaurantSignal && explicitDomains.restaurant
      ? `restaurant intent restored from original query: ${explicitDomains.restaurantEvidence.join(",")}`
      : null,
    !p.activitySignal && explicitDomains.activity
      ? `activity intent restored from original query: ${explicitDomains.activityEvidence.join(",")}`
      : null,
    broadDateRequest
      ? "broad date intent enables both restaurant and activity retrieval globally without requiring a pair"
      : null,
    broadGirlsNightRequest
      ? "broad girls-night intent enables both restaurant and activity discovery without requiring a pair"
      : null,
    broadFamilyOutingRequest
      ? "broad family-outing intent enables both family-safe restaurant and activity discovery without requiring a pair"
      : null,
    restaurantBoundHookah
      ? "hookah is bound to the requested restaurant instead of creating a second activity lane"
      : null,
    preferenceRestaurantFallback
      ? "domainless subjective preferences use the default restaurant lane without mutating query text"
      : null,
    rawRestaurantDishTerms.length
      ? `raw restaurant dish terms preserved: ${rawRestaurantDishTerms.join(",")}`
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const plan: SearchPlan = {
    version: "search-plan-v1",
    requestId: input.requestId ?? randomUUID(),
    rawQuery: input.query,
    mode,
    restaurant: {
      required: restaurantRequired || anchored,
      cuisines: p.cuisineMatches,
      foods: restaurantFoods,
      mealPeriods,
      features: hardRestaurantFeatures,
      exclusions: [...new Set(input.restaurantExclusions ?? [])],
    },
    activity: {
      required: activityRequired,
      categories: activityCategories,
      features: p.activityFeatures,
      exclusions: [...new Set(input.activityExclusions ?? [])],
    },
    geo: {
      source: anchored
        ? "anchor"
        : place
          ? "explicit"
          : current
            ? "current_location"
            : "default_market",
      market: place?.[3] ?? input.market ?? null,
      city: resolvedCity,
      borough: resolvedBorough,
      neighborhood: geoRecord?.type === "neighborhood" ? geoRecord.name : null,
      county: resolvedCounty,
      state: geoRecord?.state ?? "NY",
      latitude,
      longitude,
      radiusMiles,
      strictness: place ? "strict" : current ? "preferred" : "broad",
    },
    anchor: {
      requested: anchored,
      rawName: anchored ? p.anchorName : null,
      locationId: null,
      name: anchored ? p.anchorName : null,
      latitude: null,
      longitude: null,
      entityType: anchored ? p.anchorEntityType : "none",
      generic: anchored && p.genericAnchor,
      exactNameRequired: anchored && p.exactNameRequired,
    },
    travel: {
      mode: travel.mode,
      constraint: travel.constraint,
      explicit: travel.explicit,
      maxWalkingMinutes: travel.maxWalkingMinutes,
      maxDrivingMinutes: travel.maxDrivingMinutes,
    },
    pairing: {
      required: pairingRequired,
      sameVenuePreferred,
      sameVenueRequired,
      sequence: p.sequence,
      maxDistanceMiles: travel.maxDistanceMiles,
      maxWalkingMinutes: travel.maxWalkingMinutes,
      maxDrivingMinutes: travel.maxDrivingMinutes,
      requireWalkable: travel.mode === "walking",
    },
    audience: {
      familyFriendly: familyRequested,
      minorsPresent: familyRequested,
      adultOnlyRequested: /\b(adult[- ]only|21\+)\b/.test(p.q),
    },
    occasion,
    partySize: parsePartySize(input.query),
    plannedFor: input.plannedFor ?? parseRelativePlannedFor(input.query),
    fallback: {
      allowNearbyPair: !sameVenueRequired,
      allowPartial: true,
      allowBroaderGeo: travel.constraint !== "hard",
      maximumRadiusMiles:
        travel.constraint === "hard" ? travel.maxDistanceMiles : 45,
    },
    confidence: {
      overall: place && (restaurantRequired || activityRequired || anchored) ? 0.96 : 0.85,
      mode: broadOccasionRequest ? 0.98 : 0.95,
      restaurant: restaurantRequired || anchored ? 0.95 : 0.9,
      activity: activityRequired ? 0.95 : 0.9,
      geo: place || current || useDefaultMarketCoordinates ? 0.95 : 0.7,
    },
    parser: {
      source: "deterministic",
      reasons: [
        ...reconciledDomains,
        sameVenuePreferred && !sameVenueRequired
          ? "same venue preferred; nearby pair fallback remains enabled"
          : null,
        anchored
          ? `${p.genericAnchor ? "generic" : "named"} anchor extracted: ${p.anchorName}`
          : geoRecord
            ? `canonical centroid resolved for ${geoRecord.name}`
            : "explicit taxonomy, mode, sequence, geography, and travel signals resolved",
      ].filter((reason): reason is string => Boolean(reason)),
    },
  };
  validateSearchPlan(plan);
  return deepFreeze(plan);
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}