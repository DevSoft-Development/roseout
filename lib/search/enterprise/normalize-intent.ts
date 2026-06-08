import type { PairingPreference, SearchIntent } from "./types";
import {
  MAX_WALKING_DISTANCE_MINUTES,
  walkingMinutesToMiles,
} from "./distance";
import { detectGeoIntent } from "./geo-taxonomy";
import {
  ACTIVITY_TERMS,
  COMPACT_GENERIC_ACTIVITY_RPC_TERMS,
  GENERIC_ACTIVITY_FALLBACK_TERMS,
  createEmptyActivityIntent,
  createEmptyRestaurantIntent,
  detectActivityTerms,
  detectCuisineTerms,
  detectFoodTerms,
  detectMealTerms,
  expandActivitySynonyms,
  expandFoodSynonyms,
  FOOD_TERMS,
  MEAL_TERMS,
  hasGenericActivitySignal,
  hasOnlyGenericActivityTerms,
  PLACE_OF_WORSHIP_TERMS,
  userAskedForPlaceOfWorship,
} from "./taxonomy";

export const uniq = (items: string[]) =>
  Array.from(new Set(items.map((x) => x.toLowerCase().trim()).filter(Boolean)));

export const HARD_NIGHTLIFE_ACTIVITY_TERMS = new Set([
  "nightlife",
  "rooftop lounge",
  "rooftop",
  "roof top",
  "club",
  "dance club",
  "nightclub",
  "dancing",
  "dance",
  "live dj",
  "dj",
  "speakeasy",
]);

export const RELAXED_ACTIVITY_REQUIRED_TERMS = [
  "relaxed activity",
  "chill activity",
  "easy activity",
  "low key",
  "laid back",
  "casual activity",
  "lounge",
  "board games",
  "arcade",
  "mini golf",
  "bowling",
  "gallery",
  "museum",
  "billiards",
  "pool hall",
  "paint and sip",
  "cafe",
  "dessert",
];

export function normalizeIntentTerm(term: string) {
  return String(term || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function hasNoClubIntent(query: string | null | undefined) {
  return hasNoClubOrQuietVenueIntent(query);
}

export function hasRelaxedActivityAlternativeIntent(query: string | null | undefined) {
  const q = normalizeFinalTerm(String(query ?? ""));
  return /\b(relaxed activity|quiet activity|chill activity|casual activity|easy activity|something fun|fun but not loud|not a club but still fun|activity no club)\b/.test(q);
}

export function hasNoClubOrQuietVenueIntent(query: string | null | undefined) {
  const q = normalizeFinalTerm(String(query ?? ""));
  return /\b(no club|not a club|not a nightclub|no nightclub|no dancing|no dj|no live dj|not too loud|not loud|no loud music|quiet|quiet girls night|quiet bar|chill drinks|upscale lounge)\b/.test(q);
}

export function hasRelaxedOrCasualActivityIntent(query: string | null | undefined) {
  return hasRelaxedActivityAlternativeIntent(query);
}

export function cleanupRelaxedActivityTerms(terms: string[], rawQuery?: string | null) {
  const normalizedTerms = terms
    .map(normalizeIntentTerm)
    .filter((term) => term && !HARD_NIGHTLIFE_ACTIVITY_TERMS.has(term));

  if (!hasRelaxedActivityAlternativeIntent(rawQuery ?? "")) {
    return uniq(normalizedTerms);
  }

  return uniq([
    ...normalizedTerms,
    ...RELAXED_ACTIVITY_REQUIRED_TERMS,
  ]);
}

export function relaxedActivityTermsRemoved(terms: string[]) {
  return uniq(
    terms
      .map(normalizeIntentTerm)
      .filter((term) => term && HARD_NIGHTLIFE_ACTIVITY_TERMS.has(term)),
  );
}

const relaxedRemovedActivityTermsByIntent = new WeakMap<
  SearchIntent,
  string[]
>();

export function cleanupRelaxedIntent(intent: SearchIntent): SearchIntent {
  if (!hasRelaxedActivityIntent(intent.rawQuery)) return intent;

  const activityIntent = intent.activityIntent ?? createEmptyActivityIntent();
  const removedTerms = relaxedActivityTermsRemoved(activityIntent.activityTerms ?? []);

  const cleaned: SearchIntent = {
    ...intent,
    activityIntent: {
      ...activityIntent,
      activityTerms: uniq([
        ...cleanupRelaxedActivityTerms(activityIntent.activityTerms ?? [], intent.rawQuery),
        ...(hasNoClubOrQuietVenueIntent(intent.rawQuery) ? venueTermsFromRawQuery(intent.rawQuery) : []),
      ]),
      negativeTerms: uniq([
        ...(activityIntent.negativeTerms ?? []).map(normalizeIntentTerm),
        ...(hasNoClubOrQuietVenueIntent(intent.rawQuery)
          ? [
              "club",
              "clubs",
              "dance club",
              "nightclub",
              "dancing",
              "live dj",
              "dj",
              "loud music",
            ]
          : []),
      ]),
    },
  };

  relaxedRemovedActivityTermsByIntent.set(cleaned, removedTerms);

  return cleaned;
}

export const FINAL_TERM_STOPWORDS = new Set([
  "and",
  "with",
  "to",
  "do",
  "the",
  "a",
  "an",
  "for",
  "in",
  "near",
  "nearby",
  "after",
  "before",
  "then",
  "at",
  "but",
  "not",
  "or",
  "low",
  "key",
  "laid",
  "back",
  "mini",
  "paint",
  "sip",
  "putt",
  "live",
  "big",
  "good",
  "best",
  "spot",
  "idea",
  "things",
  "party",
  "game",
  "day",
  "night",
  "date",
  "screen",
  "viewing",
  "open",
  "mic",
  "house",
  "filet",
  "mignon",
  "prime",
  "rib",
  "brazilian",
  "raw",
  "tex",
  "mex",
  "fried",
  "outdoor",
  "scenic",
  "dining",
  "center",
  "cultural",
  "art",
  "alley",
  "lanes",
  "range",
  "driving",
  "cages",
  "rock",
  "ice",
  "roller",
  "sport",
  "sports",
  "dance",
  "dj",
  "show",
  "off",
  "broadway",
  "march",
  "madness",
]);

export const ACTIVITY_ALLOWED_SINGLE_WORDS = new Set([
  "bar",
  "pub",
  "tavern",
  "karaoke",
  "comedy",
  "museum",
  "gallery",
  "arcade",
  "bowling",
  "billiards",
  "pool",
  "hookah",
  "shisha",
  "jazz",
  "rooftop",
  "cocktails",
  "drinks",
  "speakeasy",
  "lounge",
  "activity",
  "games",
  "cafe",
  "dessert",
  "wine",
  "tv",
  "tvs",
  "screens",
  "music",
  "views",
  "terrace",
  "skyline",
  "basketball",
  "football",
  "baseball",
  "hockey",
  "quiet",
  "romantic",
  "club",
  "nightclub",
  "dancing",
  "dj",
  "entertainment",
  "experience",
  "theater",
  "theatre",
  "exhibit",
  "exhibition",
  "park",
]);

export const RESTAURANT_ALLOWED_SINGLE_WORDS = new Set([
  "dinner",
  "brunch",
  "lunch",
  "breakfast",
  "restaurant",
  "steak",
  "steakhouse",
  "seafood",
  "sushi",
  "japanese",
  "mexican",
  "italian",
  "thai",
  "american",
  "ramen",
  "tacos",
  "taco",
  "pizza",
  "pasta",
  "lobster",
  "crab",
  "shrimp",
  "oyster",
  "oysters",
  "romantic",
  "casual",
  "birthday",
  "anniversary",
  "views",
  "rooftop",
  "terrace",
  "skyline",
]);

export function normalizeFinalTerm(term: string) {
  return normalizeIntentTerm(term);
}

function isPhrase(term: string) {
  return normalizeFinalTerm(term).includes(" ");
}

export function finalCleanTermList(
  terms: string[],
  allowedSingles: Set<string>,
  options?: {
    dropSingleTeamTokens?: boolean;
    teamTokens?: Set<string>;
  },
) {
  const normalized = terms.map(normalizeFinalTerm).filter(Boolean);

  return uniq(
    normalized.filter((term) => {
      if (!term) return false;
      if (isPhrase(term)) return true;
      if (FINAL_TERM_STOPWORDS.has(term)) return false;
      if (options?.dropSingleTeamTokens && options.teamTokens?.has(term)) {
        return false;
      }
      if (allowedSingles.has(term)) return true;
      return false;
    }),
  );
}

function isActivityVenueOnlyQuery(query: string) {
  const q = String(query || "").toLowerCase();
  const hasActivityVenue = /\b(cocktail bar|wine bar|rooftop bar|rooftop lounge|sports bar|sports lounge|sport lounge|hookah bar|karaoke bar|comedy club|jazz club|lounge|speakeasy|bar with tv|bar with tvs|bar with screens|quiet lounge|upscale lounge)\b/.test(q);
  const hasExplicitMeal = /\b(dinner|brunch|lunch|breakfast|restaurant|eat|food before|food after|steak|seafood|sushi|mexican|italian)\b/.test(q);
  const hasVibeOnlyTrigger = /\b(date night|romantic|vibes|girls night|girls' night|first date|no loud music|quiet|not too loud)\b/.test(q);
  return hasActivityVenue && !hasExplicitMeal && (hasVibeOnlyTrigger || /\bspeakeasy\b/.test(q));
}
function shouldForceActivityOnlyVenue(rawQuery: string) { return isActivityVenueOnlyQuery(rawQuery); }
function resetPairingPreference() { return { requiresPairing: false, distanceMode: "any" as const, maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false }; }
function venueTermsFromRawQuery(rawQuery: string) {
  const q = normalizeFinalTerm(rawQuery);
  const terms: string[] = [];
  if (/\bcocktail|cocktails\b/.test(q)) terms.push("cocktail bar", "cocktails", "bar", "lounge");
  if (/\bwine bar\b/.test(q)) terms.push("wine bar", "wine", "bar", "lounge");
  if (/\bquiet\b/.test(q)) terms.push("quiet");
  if (/\brooftop\b/.test(q)) terms.push("rooftop bar", "rooftop lounge", "rooftop drinks", "rooftop cocktails", "terrace bar", "terrace lounge", "skyline bar", "skyline lounge", "views", "outdoor bar", "rooftop", "terrace", "skyline", "bar", "lounge");
  if (/\bdrinks?\b/.test(q)) terms.push("drinks", "cocktails", "bar", "lounge");
  if (/\bspeakeasy\b/.test(q)) terms.push("speakeasy", "cocktail bar", "cocktails", "bar", "lounge");
  if (/\bromantic|vibes|date night\b/.test(q)) terms.push("romantic");
  return terms;
}

function applyForceActivityOnlyVenue(intent: SearchIntent): SearchIntent {
  if (!shouldForceActivityOnlyVenue(intent.rawQuery)) return intent;
  const activityIntent = intent.activityIntent ?? createEmptyActivityIntent();
  return {
    ...intent,
    searchType: "activity",
    primaryDomain: "activity",
    needsRestaurant: false,
    needsActivity: true,
    wantsPairing: false,
    restaurantIntent: createEmptyRestaurantIntent(),
    activityIntent: {
      ...activityIntent,
      activityTerms: uniq([...(activityIntent.activityTerms ?? []), ...venueTermsFromRawQuery(intent.rawQuery)]),
    },
    pairingPreference: resetPairingPreference(),
  };
}
function finalDomainCleanup(intent: SearchIntent): SearchIntent {
  if (!intent.needsActivity || intent.searchType === "restaurant") return { ...intent, searchType: "restaurant", primaryDomain: "restaurant", needsActivity: false, needsRestaurant: true, activityIntent: createEmptyActivityIntent(), wantsPairing: false, pairingPreference: resetPairingPreference() };
  if (!intent.needsRestaurant || intent.searchType === "activity") return { ...intent, searchType: "activity", primaryDomain: "activity", needsRestaurant: false, needsActivity: true, restaurantIntent: createEmptyRestaurantIntent(), wantsPairing: false, pairingPreference: resetPairingPreference() };
  return intent;
}
function finalCleanNegativeTerms(terms: string[]) {
  const allowedNegativeSingles = new Set([
    "club",
    "clubs",
    "nightclub",
    "nightclubs",
    "dancing",
    "dj",
    "speakeasy",
    "nightlife",
  ]);
  return uniq(
    terms
      .map(normalizeFinalTerm)
      .filter((term) => term && (term.includes(" ") || allowedNegativeSingles.has(term))),
  );
}
function finalCleanIntentTerms(intent: SearchIntent): SearchIntent {
  const activityIntent = intent.activityIntent ?? createEmptyActivityIntent();
  const restaurantIntent = intent.restaurantIntent ?? createEmptyRestaurantIntent();
  const cleanedIntent = {
    ...intent,
    activityIntent: {
      ...activityIntent,
      activityTerms: finalCleanTermList(activityIntent.activityTerms ?? [], ACTIVITY_ALLOWED_SINGLE_WORDS),
      categoryTerms: finalCleanTermList(activityIntent.categoryTerms ?? [], ACTIVITY_ALLOWED_SINGLE_WORDS),
      featureTerms: finalCleanTermList(activityIntent.featureTerms ?? [], ACTIVITY_ALLOWED_SINGLE_WORDS),
      vibeTerms: finalCleanTermList(activityIntent.vibeTerms ?? [], ACTIVITY_ALLOWED_SINGLE_WORDS),
      negativeTerms: finalCleanNegativeTerms(activityIntent.negativeTerms ?? []),
    },
    restaurantIntent: {
      ...restaurantIntent,
      mealTerms: finalCleanTermList(restaurantIntent.mealTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS),
      foodTerms: finalCleanTermList(restaurantIntent.foodTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS),
      cuisineTerms: finalCleanTermList(restaurantIntent.cuisineTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS),
      categoryTerms: finalCleanTermList(restaurantIntent.categoryTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS),
      vibeTerms: finalCleanTermList(restaurantIntent.vibeTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS),
      featureTerms: finalCleanTermList(restaurantIntent.featureTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS),
      negativeTerms: finalCleanNegativeTerms(restaurantIntent.negativeTerms ?? []),
    },
  };
  const sportsRemoved = sportsWatchRemovedActivityTermsByIntent.get(intent);
  if (sportsRemoved) sportsWatchRemovedActivityTermsByIntent.set(cleanedIntent, sportsRemoved);
  const relaxedRemoved = relaxedRemovedActivityTermsByIntent.get(intent);
  if (relaxedRemoved) relaxedRemovedActivityTermsByIntent.set(cleanedIntent, relaxedRemoved);
  return cleanedIntent;
}
const phrase = (query: string, text: string) =>
  new RegExp(
    `(^|[^a-z0-9])${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`,
    "i",
  ).test(query);
const DISTANCE_CONSTRAINT_TERMS = [
  "walking distance",
  "walkable",
  "walking",
  "short walk",
  "quick walk",
  "around the corner",
  "nearby",
  "close by",
  "close together",
  "near each other",
  "same block",
  "same area",
  "same neighborhood",
  "in the area",
  "within walking distance",
  "can walk to",
  "no driving",
  "without driving",
];

const RESTAURANT_SEARCH_TERM_BLOCKLIST = new Set(
  [
    "activity",
    "activities",
    "things to do",
    "experience",
    "entertainment",
    "theater",
    "theatre",
    "movie theater",
    "cinema",
    "museum",
    "gallery",
    "park",
    "bowling",
    "bowling alley",
    "arcade",
    "escape room",
    "karaoke",
    "hookah",
    ...PLACE_OF_WORSHIP_TERMS,
  ].map((x) => x.toLowerCase()),
);

const ACTIVITY_SEARCH_TERM_BLOCKLIST = new Set(
  [
    "dinner",
    "birthday dinner",
    "restaurant",
    "restaurants",
    "dining",
    "eatery",
    "brunch",
    "lunch",
    "breakfast",
  ].map((x) => x.toLowerCase()),
);

const FEATURE_ONLY_FOOD_TERMS = new Set([
  "rooftop",
  "roof top",
  "terrace",
  "patio",
  "outdoor dining",
  "skyline",
  "city views",
  "scenic views",
  "view",
  "roof deck",
  "lounge",
]);
const ROOFTOP_FEATURE_TERMS = new Set([
  "rooftop",
  "roof top",
  "terrace",
  "patio",
  "outdoor dining",
  "skyline",
  "city views",
  "scenic views",
  "view",
  "roof deck",
]);

const CONNECTOR_TERMS = [
  "with",
  "and",
  "after",
  "before",
  "then",
  "plus",
  "near",
  "nearby",
  "walking distance",
  "within walking distance",
  "or",
];
const SHORT_WALKING_LIMIT_MINUTES = 15;
const NEARBY_WALKING_LIMIT_MINUTES = 30;

function clampWalkingMinutes(minutes: number) {
  return Math.max(1, Math.min(minutes, MAX_WALKING_DISTANCE_MINUTES));
}

function detectExplicitWalkingMinutes(query: string) {
  const patterns = [
    /\b(\d{1,3})\s*(?:-| )?\s*(?:minute|minutes|min|mins)\s+(?:walk|walking)\b/i,
    /\b(?:within|under|less than|no more than|up to|max|maximum)\s+(\d{1,3})\s*(?:minute|minutes|min|mins)\b.*\b(?:walk|walking)\b/i,
    /\b(?:walk|walking)\b.*\b(\d{1,3})\s*(?:minute|minutes|min|mins)\b/i,
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    const minutes = match ? Number(match[1]) : null;

    if (minutes && Number.isFinite(minutes)) {
      return clampWalkingMinutes(minutes);
    }
  }

  return null;
}

function walkingPairingPreference(minutes: number): PairingPreference {
  const cappedMinutes = clampWalkingMinutes(minutes);

  return {
    requiresPairing: true,
    distanceMode: "walking",
    maxPairDistanceMiles: Math.max(0.1, walkingMinutesToMiles(cappedMinutes)),
    maxPairWalkingMinutes: cappedMinutes,
    requireWalkablePair: true,
  };
}

function stripCrossTerms(terms: string[], forbidden: string[]) {
  const f = new Set(forbidden.map((x) => x.toLowerCase()));
  return terms.filter((t) => !f.has(t.toLowerCase()));
}
function stripDistanceTerms(terms: string[]) {
  const blocked = new Set(DISTANCE_CONSTRAINT_TERMS);
  return terms.filter((t) => !blocked.has(t.toLowerCase()));
}
function stripBlockedTerms(terms: string[], blocked: Set<string>) {
  return terms.filter((term) => !blocked.has(term.toLowerCase()));
}
function stripRooftopFeatureTerms(terms: string[]) {
  return terms.filter((term) => !ROOFTOP_FEATURE_TERMS.has(term.toLowerCase()));
}
function activityForbiddenRestaurantTerms() {
  const allowedActivityTerms = new Set([
    "drinks",
    "cocktails",
    "cocktail bar",
    "wine bar",
    "bar",
    "lounge",
  ]);
  return [...FOOD_TERMS, ...MEAL_TERMS].filter(
    (term) => !allowedActivityTerms.has(term.toLowerCase()),
  );
}

function userAskedForRooftopRestaurant(query: string) {
  return /\b(rooftop restaurant|restaurant with (?:a )?rooftop|dinner on (?:a )?rooftop)\b/i.test(query);
}

function rooftopDrinksBelongToActivity(query: string) {
  return (
    /\brooftop\s+(?:drinks?|cocktails?|bars?|lounges?)\b/i.test(query) ||
    /\b(?:drinks?|cocktails?)\b[^.?!]*\brooftop\b/i.test(query)
  );
}
function cleanPlaceOfWorshipTerms(terms: string[], query: string) {
  if (userAskedForPlaceOfWorship(query)) return terms;

  const blocked = new Set(PLACE_OF_WORSHIP_TERMS.map((x) => x.toLowerCase()));

  return terms.filter((term) => !blocked.has(term.toLowerCase()));
}
function splitOrParts(text: string) {
  return String(text || "")
    .split(/\s+\bor\b\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}
function detectAlternativeGroupsForLane(
  query: string,
  lane: "restaurant" | "activity",
) {
  const q = String(query || "").toLowerCase();

  if (!/\sor\s/i.test(q)) return [];

  const groups: string[][] = [];
  const connectorPattern = new RegExp(
    `\\b(${CONNECTOR_TERMS.filter((term) => term !== "or")
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})\\b`,
    "i",
  );
  const connectorMatch = q.match(connectorPattern);

  let restaurantSegment = q;
  let activitySegment = q;

  if (connectorMatch && connectorMatch.index != null) {
    restaurantSegment = q.slice(0, connectorMatch.index).trim();
    activitySegment = q
      .slice(connectorMatch.index + connectorMatch[0].length)
      .trim();
  }

  const segment = lane === "restaurant" ? restaurantSegment : activitySegment;

  if (!/\sor\s/i.test(segment)) return [];

  const parts = splitOrParts(segment);

  if (parts.length < 2) return [];

  const detected = parts.flatMap((part) => {
    if (lane === "restaurant") {
      return [
        ...detectFoodTerms(part),
        ...detectCuisineTerms(part),
        ...detectMealTerms(part),
      ];
    }

    const terms = detectActivityTerms(part);
    if (/\bactivit(?:y|ies)\b/i.test(part)) terms.push("activity");
    return terms;
  });

  const cleaned = uniq(detected);

  if (cleaned.length >= 2) {
    groups.push(cleaned);
  }

  return groups;
}
function mergeAlternativeGroups(...groups: Array<string[][] | undefined>) {
  return groups
    .flatMap((group) => group ?? [])
    .map((group) => uniq(group))
    .filter((group) => group.length >= 2);
}

export function detectPairingPreference(
  query: string,
  wantsPairing: boolean,
): PairingPreference {
  const sameArea = ["same neighborhood", "same area", "in the area"].some((p) =>
    phrase(query, p),
  );
  const explicitWalkingMinutes = detectExplicitWalkingMinutes(query);
  const shortWalk = [
    "short walk",
    "quick walk",
    "same block",
    "around the corner",
  ].some((p) => phrase(query, p));
  const walking =
    explicitWalkingMinutes != null ||
    [
      "walking distance",
      "walkable",
      "short walk",
      "quick walk",
      "within walking distance",
      "can walk to",
      "no driving",
      "without driving",
      "same block",
      "around the corner",
    ].some((p) => phrase(query, p)) ||
    /\bwalking\b/i.test(query);
  const nearby = [
    "nearby",
    "close by",
    "close together",
    "near each other",
  ].some((p) => phrase(query, p));
  if (walking)
    return walkingPairingPreference(
      explicitWalkingMinutes ??
        (shortWalk
          ? SHORT_WALKING_LIMIT_MINUTES
          : MAX_WALKING_DISTANCE_MINUTES),
    );
  if (nearby)
    return {
      requiresPairing: true,
      distanceMode: "nearby",
      maxPairDistanceMiles: walkingMinutesToMiles(NEARBY_WALKING_LIMIT_MINUTES),
      maxPairWalkingMinutes: NEARBY_WALKING_LIMIT_MINUTES,
      requireWalkablePair: true,
    };
  if (sameArea)
    return {
      requiresPairing: true,
      distanceMode: "same_area",
      maxPairDistanceMiles: 3,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    };
  return {
    requiresPairing: wantsPairing,
    distanceMode: "any",
    maxPairDistanceMiles: null,
    maxPairWalkingMinutes: null,
    requireWalkablePair: false,
  };
}

export function deterministicIntentFromQuery(query: string): SearchIntent {
  const food = detectFoodTerms(query);
  const cuisine = detectCuisineTerms(query);
  const meals = detectMealTerms(query);
  const acts = stripDistanceTerms(detectActivityTerms(query));
  const geo = detectGeoIntent(query);
  const rooftopActivity = rooftopDrinksBelongToActivity(query);
  const restaurantAlternativeGroups = detectAlternativeGroupsForLane(
    query,
    "restaurant",
  );
  const activityAlternativeGroups = detectAlternativeGroupsForLane(
    query,
    "activity",
  );
  const restaurantFood = food.filter((t) => t !== "rooftop" && t !== "lounge");
  const restaurantContext =
    meals.length > 0 ||
    restaurantFood.length > 0 ||
    /restaurant|dinner|brunch|lunch|breakfast|cuisine|eat|dining|steakhouse/i.test(
      query,
    );
  const activityContext =
    acts.length > 0 ||
    activityAlternativeGroups.length > 0 ||
    hasGenericActivitySignal(query) ||
    /things to do|fun things|something to do|something fun|date idea|date activity|outing|experience|entertainment|then|with|after|before|drinks|cocktails|girls night|girls' night|lounge|bar|relaxed activity|chill activity|easy activity/i.test(
      query,
    ) ||
    (/date night/i.test(query) &&
      /walkable|walking distance|everything|outing|plan|activity|things to do|something fun/i.test(
        query,
      ));
  const hookahOnly =
    acts.includes("hookah") &&
    !/dinner|restaurant|food|eat|dining/i.test(query);
  const needsRestaurant = restaurantContext && !hookahOnly;
  const needsActivity = activityContext || hookahOnly;
  const mixed = needsRestaurant && needsActivity;
  return {
    rawQuery: query,
    searchType: mixed
      ? "mixed_outing"
      : needsRestaurant
        ? "restaurant"
        : needsActivity
          ? "activity"
          : "any",
    primaryDomain: mixed
      ? "mixed"
      : needsRestaurant
        ? "restaurant"
        : needsActivity
          ? "activity"
          : "any",
    needsRestaurant,
    needsActivity,
    wantsPairing: mixed,
    pairingPreference: detectPairingPreference(query, mixed),
    restaurantIntent: {
      ...createEmptyRestaurantIntent(),
      mealTerms: meals,
      foodTerms: rooftopActivity ? stripRooftopFeatureTerms(food) : food,
      cuisineTerms: cuisine,
      categoryTerms: /restaurant|dining/i.test(query) ? ["restaurant"] : [],
      featureTerms:
        !rooftopActivity && userAskedForRooftopRestaurant(query)
          ? ["rooftop"]
          : [],
      alternativeGroups: restaurantAlternativeGroups,
    },
    activityIntent: {
      ...createEmptyActivityIntent(),
      activityTerms: cleanPlaceOfWorshipTerms(acts, query),
      categoryTerms: /things to do/i.test(query) ? ["things to do"] : [],
      featureTerms: rooftopActivity
        ? ["rooftop", "terrace", "skyline", "view", "cocktails"]
        : [],
      alternativeGroups: activityAlternativeGroups,
    },
    geo,
    occasion: /date night|romantic/i.test(query) ? "date night" : null,
    partySize: null,
    timeContext: meals[0] ?? null,
    budget: null,
    vibe: uniq([
      /romantic/i.test(query) ? "romantic" : "",
      /best/i.test(query) ? "best" : "",
    ]),
    strictness: "high",
  };
}
export function normalizeIntent(
  query: string,
  llmIntent?: Partial<SearchIntent> | null,
): SearchIntent {
  const base = deterministicIntentFromQuery(query);
  const merged: SearchIntent = {
    ...base,
    ...(llmIntent ?? {}),
    rawQuery: query,
    restaurantIntent: {
      ...base.restaurantIntent,
      ...(llmIntent?.restaurantIntent ?? {}),
    },
    activityIntent: {
      ...base.activityIntent,
      ...(llmIntent?.activityIntent ?? {}),
    },
  };
  const redetectedGeo = detectGeoIntent(query);
  merged.geo = redetectedGeo.raw ? redetectedGeo : base.geo;
  const food = uniq([
    ...detectFoodTerms(query),
    ...(merged.restaurantIntent.foodTerms ?? []),
  ]);
  const cuisine = uniq([
    ...detectCuisineTerms(query),
    ...(merged.restaurantIntent.cuisineTerms ?? []),
  ]);
  const meals = uniq([
    ...detectMealTerms(query),
    ...(merged.restaurantIntent.mealTerms ?? []),
  ]);
  const acts = stripDistanceTerms(
    uniq([
      ...detectActivityTerms(query),
      ...(merged.activityIntent.activityTerms ?? []),
    ]),
  );
  const rooftopActivity = rooftopDrinksBelongToActivity(query);
  const foodExpanded = expandFoodSynonyms(food);
  const actExpanded = stripDistanceTerms(expandActivitySynonyms(acts));
  const restaurantAlternativeGroups = mergeAlternativeGroups(
    base.restaurantIntent.alternativeGroups,
    merged.restaurantIntent.alternativeGroups,
    detectAlternativeGroupsForLane(query, "restaurant"),
  );

  const activityAlternativeGroups = mergeAlternativeGroups(
    base.activityIntent.alternativeGroups,
    merged.activityIntent.alternativeGroups,
    detectAlternativeGroupsForLane(query, "activity"),
  )
    .map((group) => cleanPlaceOfWorshipTerms(group, query))
    .filter((group) => group.length >= 2);

  merged.restaurantIntent = {
    ...merged.restaurantIntent,
    mealTerms: stripBlockedTerms(
      stripCrossTerms(
        uniq([...meals, ...expandFoodSynonyms(meals)]),
        ACTIVITY_TERMS,
      ),
      RESTAURANT_SEARCH_TERM_BLOCKLIST,
    ),
    foodTerms: stripBlockedTerms(
      stripCrossTerms(
        rooftopActivity ? stripRooftopFeatureTerms(foodExpanded) : foodExpanded,
        ACTIVITY_TERMS,
      ),
      RESTAURANT_SEARCH_TERM_BLOCKLIST,
    ),
    cuisineTerms: stripBlockedTerms(
      stripCrossTerms(cuisine, ACTIVITY_TERMS),
      RESTAURANT_SEARCH_TERM_BLOCKLIST,
    ),
    categoryTerms: stripBlockedTerms(
      stripCrossTerms(
        uniq(merged.restaurantIntent.categoryTerms ?? []),
        ACTIVITY_TERMS,
      ),
      RESTAURANT_SEARCH_TERM_BLOCKLIST,
    ),
    featureTerms: stripBlockedTerms(
      stripCrossTerms(
        rooftopActivity
          ? stripRooftopFeatureTerms(
              uniq(merged.restaurantIntent.featureTerms ?? []),
            )
          : uniq([
              ...(merged.restaurantIntent.featureTerms ?? []),
              ...(userAskedForRooftopRestaurant(query)
                ? ["rooftop", "terrace", "skyline", "view"]
                : []),
            ]),
        ACTIVITY_TERMS,
      ),
      RESTAURANT_SEARCH_TERM_BLOCKLIST,
    ),
    negativeTerms: uniq(merged.restaurantIntent.negativeTerms ?? []),
    alternativeGroups: restaurantAlternativeGroups
      .map((group) =>
        stripBlockedTerms(
          stripCrossTerms(group, ACTIVITY_TERMS),
          RESTAURANT_SEARCH_TERM_BLOCKLIST,
        ),
      )
      .filter((group) => group.length >= 2),
  };
  merged.activityIntent = {
    ...merged.activityIntent,
    activityTerms: cleanPlaceOfWorshipTerms(
      stripBlockedTerms(
        stripDistanceTerms(
          stripCrossTerms(actExpanded, activityForbiddenRestaurantTerms()),
        ),
        ACTIVITY_SEARCH_TERM_BLOCKLIST,
      ),
      query,
    ),
    categoryTerms: cleanPlaceOfWorshipTerms(
      stripBlockedTerms(
        stripDistanceTerms(
          stripCrossTerms(
            uniq(merged.activityIntent.categoryTerms ?? []),
            activityForbiddenRestaurantTerms(),
          ),
        ),
        ACTIVITY_SEARCH_TERM_BLOCKLIST,
      ),
      query,
    ),
    vibeTerms: uniq(merged.activityIntent.vibeTerms ?? []),
    featureTerms: cleanPlaceOfWorshipTerms(
      stripDistanceTerms(
        uniq([
          ...(merged.activityIntent.featureTerms ?? []),
          ...(rooftopActivity
            ? ["rooftop", "terrace", "skyline", "view", "cocktails"]
            : []),
        ]),
      ),
      query,
    ),
    negativeTerms: uniq(merged.activityIntent.negativeTerms ?? []),
    alternativeGroups: activityAlternativeGroups
      .map((group) =>
        stripBlockedTerms(
          stripDistanceTerms(
            stripCrossTerms(group, activityForbiddenRestaurantTerms()),
          ),
          ACTIVITY_SEARCH_TERM_BLOCKLIST,
        ),
      )
      .filter((group) => group.length >= 2),
  };
  const hasRestaurant =
    merged.restaurantIntent.mealTerms.length > 0 ||
    merged.restaurantIntent.foodTerms.some(
      (t) => !FEATURE_ONLY_FOOD_TERMS.has(t),
    ) ||
    merged.restaurantIntent.cuisineTerms.some(
      (t) => !FEATURE_ONLY_FOOD_TERMS.has(t),
    ) ||
    (merged.restaurantIntent.alternativeGroups ?? []).some((group) =>
      group.some((t) => !FEATURE_ONLY_FOOD_TERMS.has(t)),
    ) ||
    /restaurant|dinner|brunch|lunch|breakfast|dining|date night|romantic/i.test(
      query,
    );
  const hasActivity =
    merged.activityIntent.activityTerms.length > 0 ||
    (merged.activityIntent.alternativeGroups ?? []).length > 0 ||
    /things to do|fun things|\bactivity\b|after|before|drinks|cocktails|girls night|girls' night|lounge|bar|relaxed activity|chill activity|easy activity/i.test(
      query,
    ) ||
    (/date night/i.test(query) &&
      /walkable|walking distance|everything|outing|plan/i.test(query));
  merged.needsRestaurant =
    hasRestaurant && !/^\s*hookah\s+(in|near)/i.test(query);
  merged.needsActivity = hasActivity;
  merged.wantsPairing = merged.needsRestaurant && merged.needsActivity;
  merged.searchType = merged.wantsPairing
    ? "mixed_outing"
    : merged.needsRestaurant
      ? "restaurant"
      : merged.needsActivity
        ? "activity"
        : "any";
  merged.primaryDomain = merged.wantsPairing
    ? "mixed"
    : merged.needsRestaurant
      ? "restaurant"
      : merged.needsActivity
        ? "activity"
        : "any";
  const detectedPreference = detectPairingPreference(
    query,
    merged.wantsPairing,
  );
  const llmPreference = llmIntent?.pairingPreference;
  merged.pairingPreference =
    detectedPreference.distanceMode !== "any"
      ? detectedPreference
      : {
          ...detectedPreference,
          ...(llmPreference ?? {}),
          requiresPairing:
            merged.wantsPairing || Boolean(llmPreference?.requiresPairing),
        };
  if (!merged.wantsPairing && merged.pairingPreference.distanceMode === "any")
    merged.pairingPreference.requiresPairing = false;
  const unsafeVibe = (merged as any).vibe;
  merged.vibe = Array.isArray(unsafeVibe)
    ? unsafeVibe
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
    : typeof unsafeVibe === "string"
      ? [unsafeVibe.trim()].filter(Boolean)
      : Array.isArray(base.vibe)
        ? base.vibe
        : [];
  let finalIntent = applyForceActivityOnlyVenue(merged);
  finalIntent = cleanupSportsWatchIntentTerms(finalIntent);
  finalIntent = cleanupRelaxedIntent(finalIntent);
  finalIntent = finalDomainCleanup(finalIntent);
  finalIntent = finalCleanIntentTerms(finalIntent);
  return finalIntent;
}

export function mergeLlmIntentWithPreIntent(args: {
  rawQuery: string;
  preIntent?: Partial<SearchIntent> | SearchIntent | null;
  llmIntent: Partial<SearchIntent> | SearchIntent;
}) {
  const { rawQuery, preIntent, llmIntent } = args;

  if (!preIntent) return llmIntent;

  const q = rawQuery.toLowerCase();
  const llm = { ...llmIntent } as any;

  const rawHasFood =
    /\b(restaurant|dinner|brunch|lunch|breakfast|eat|food|steak|seafood|sushi|pizza|tacos)\b/.test(
      q,
    );

  const rawHasActivity =
    /\b(activity|drinks|cocktails|bar|lounge|rooftop|hookah|comedy|theater|theatre|museum|arcade|bowling|karaoke|sports bar|watch|game)\b/.test(
      q,
    );

  if (preIntent.searchType === "activity" && !rawHasFood && rawHasActivity) {
    llm.searchType = "activity";
    llm.primaryDomain = "activity";
    llm.needsRestaurant = false;
    llm.needsActivity = true;
    llm.wantsPairing = false;
  }

  if (
    /\b(watch|game|knicks|nets|yankees|mets|giants|jets|rangers|nba|nfl|mlb|nhl|ufc)\b/.test(
      q,
    )
  ) {
    llm.activityIntent = {
      ...(llm.activityIntent ?? {}),
      activityTerms: uniq([
        ...((preIntent as any).activityIntent?.activityTerms ?? []),
        ...((llm.activityIntent as any)?.activityTerms ?? []),
      ]),
      categoryTerms: uniq([
        "sports bar",
        ...((preIntent as any).activityIntent?.categoryTerms ?? []),
        ...((llm.activityIntent as any)?.categoryTerms ?? []),
      ]),
      featureTerms: uniq([
        "tv",
        ...((preIntent as any).activityIntent?.featureTerms ?? []),
        ...((llm.activityIntent as any)?.featureTerms ?? []),
      ]),
      vibeTerms: uniq([
        ...((preIntent as any).activityIntent?.vibeTerms ?? []),
        ...((llm.activityIntent as any)?.vibeTerms ?? []),
      ]),
      negativeTerms: uniq([
        ...((preIntent as any).activityIntent?.negativeTerms ?? []),
        ...((llm.activityIntent as any)?.negativeTerms ?? []),
      ]),
      alternativeGroups: (llm.activityIntent as any)?.alternativeGroups ?? [],
    };
  }

  return llm;
}

export function restaurantSearchTerms(intent: SearchIntent) {
  if (!intent.needsRestaurant) return [];
  const rooftopRestaurantTerms = userAskedForRooftopRestaurant(intent.rawQuery)
    ? ["restaurant", "rooftop restaurant", "rooftop", "skyline", "skyline views", "scenic views", "terrace", "outdoor dining"]
    : [];
  return finalCleanTermList(stripBlockedTerms(
    uniq([
      ...intent.restaurantIntent.mealTerms,
      ...intent.restaurantIntent.foodTerms,
      ...intent.restaurantIntent.cuisineTerms,
      ...intent.restaurantIntent.categoryTerms,
      ...intent.restaurantIntent.featureTerms,
      ...(intent.restaurantIntent.alternativeGroups ?? []).flat(),
      ...rooftopRestaurantTerms,
    ]),
    RESTAURANT_SEARCH_TERM_BLOCKLIST,
  ), RESTAURANT_ALLOWED_SINGLE_WORDS);
}

function shouldAddGenericActivityFallback(
  intent: SearchIntent,
  terms: string[],
) {
  return isBroadGenericActivityIntent(intent, terms);
}

export function isBroadGenericActivityIntent(
  intent: SearchIntent,
  terms: string[] = [
    ...intent.activityIntent.activityTerms,
    ...intent.activityIntent.categoryTerms,
    ...intent.activityIntent.featureTerms,
    ...(intent.activityIntent.alternativeGroups ?? []).flat(),
  ],
) {
  return (
    intent.searchType === "mixed_outing" &&
    intent.needsActivity === true &&
    (hasOnlyGenericActivityTerms(terms) ||
      /\b(something fun|activity|activities|relaxed activity|casual activity|chill activity)\b/i.test(
        intent.rawQuery ?? "",
      ))
  );
}

export function genericActivityFallbackTerms(intent?: SearchIntent) {
  const terms = [...GENERIC_ACTIVITY_FALLBACK_TERMS];

  if (intent && hasRelaxedActivityAlternativeIntent(intent.rawQuery)) {
    terms.push("relaxed activity", "lounge", "board games", "coffee", "dessert");
  }

  return uniq(terms);
}

export function activitySearchTerms(intent: SearchIntent) {
  if (!intent.needsActivity) return [];
  const raw = uniq([
    ...intent.activityIntent.activityTerms,
    ...intent.activityIntent.categoryTerms,
    ...intent.activityIntent.featureTerms,
    ...(intent.activityIntent.alternativeGroups ?? []).flat(),
  ]);

  const contextualTerms = uniq([
    ...raw,
    ...(hasRelaxedActivityAlternativeIntent(intent.rawQuery) ? RELAXED_ACTIVITY_REQUIRED_TERMS : []),
    ...(hasNoClubOrQuietVenueIntent(intent.rawQuery) ? venueTermsFromRawQuery(intent.rawQuery) : []),
  ]);

  const withFallback = shouldAddGenericActivityFallback(intent, contextualTerms)
    ? uniq([...contextualTerms, ...genericActivityFallbackTerms(intent)])
    : contextualTerms;
  const cleaned = stripBlockedTerms(
    withFallback,
    ACTIVITY_SEARCH_TERM_BLOCKLIST,
  );

  return finalCleanTermList(cleanPlaceOfWorshipTerms(cleaned, intent.rawQuery), ACTIVITY_ALLOWED_SINGLE_WORDS);
}

export function restaurantSearchTermsOriginal(intent: SearchIntent) {
  return uniq([
    ...intent.restaurantIntent.mealTerms,
    ...intent.restaurantIntent.foodTerms,
    ...intent.restaurantIntent.cuisineTerms,
    ...intent.restaurantIntent.categoryTerms,
    ...intent.restaurantIntent.featureTerms,
    ...(intent.restaurantIntent.alternativeGroups ?? []).flat(),
  ]);
}

export function activitySearchTermsOriginal(intent: SearchIntent) {
  const raw = uniq([
    ...intent.activityIntent.activityTerms,
    ...intent.activityIntent.categoryTerms,
    ...intent.activityIntent.featureTerms,
    ...(intent.activityIntent.alternativeGroups ?? []).flat(),
  ]);

  return shouldAddGenericActivityFallback(intent, raw)
    ? uniq([...raw, ...genericActivityFallbackTerms(intent)])
    : raw;
}

export function hasRelaxedActivityIntent(query: string | null | undefined) {
  return hasRelaxedActivityAlternativeIntent(query) || hasNoClubOrQuietVenueIntent(query);
}

export function hasSpecificRestaurantFoodOrCuisine(intent: SearchIntent) {
  return [
    ...intent.restaurantIntent.foodTerms,
    ...intent.restaurantIntent.cuisineTerms,
  ].some(
    (term) =>
      ![
        "restaurant",
        "restaurants",
        "dining",
        "dinner",
        "birthday dinner",
      ].includes(term.toLowerCase()),
  );
}

export function pruneActivityRpcTerms(
  intent: SearchIntent,
  terms: string[] = activitySearchTermsOriginal(intent),
) {
  if (/\bhookah\b/i.test(intent.rawQuery)) return terms;
  return terms.filter((term) => !/\bhookah\b/i.test(term));
}

export function pruneRelaxedActivityTerms(
  intent: SearchIntent,
  terms: string[] = activitySearchTermsOriginal(intent),
) {
  if (!hasRelaxedActivityIntent(intent.rawQuery)) return terms;
  return cleanupRelaxedActivityTerms(terms, intent.rawQuery);
}

export function hasSportsWatchIntent(query: string | null | undefined) {
  const q = String(query ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");

  const sportsOrGame =
    /\b(watch|showing|viewing|game|match|fight|ufc|boxing|nba|nfl|mlb|nhl|wnba|soccer|football|basketball|baseball|hockey|knicks|nets|lakers|warriors|celtics|cowboys|eagles|chiefs|dodgers|red sox|duke|uconn|yankees|mets|giants|jets|rangers|islanders|devils|march madness|final four)\b/.test(
      q,
    );

  const venueOrViewing =
    /\b(bar|sports bar|sports lounge|sport lounge|pub|tavern|lounge|grill|tv|tvs|screen|screens|watch party|game day|game night|live sports)\b/.test(
      q,
    );

  return sportsOrGame && venueOrViewing;
}

const SPORTS_WATCH_BLOCKED_ACTIVITY_TERMS = new Set([
  "nightlife", "lounge", "rooftop lounge", "rooftop", "roof top", "club", "dance club", "dancing", "nightclub", "live dj", "dj", "speakeasy", "skating", "roller skating", "ice skating", "golf", "driving range", "batting cages", "climbing", "rock climbing", "gym", "roller", "ice", "driving", "range", "batting", "cages", "rock",
]);

const SPORTS_WATCH_REQUIRED_ACTIVITY_TERMS = [
  "sports bar", "sports lounge", "sport lounge", "bar with tv", "bar with tvs", "bar with screens", "tv bar", "big screen", "big screens", "watch party", "game day", "game night", "live sports", "sports viewing", "pub", "tavern", "bar and grill", "bar", "tv", "tvs", "screens",
];

const sportsWatchRemovedActivityTermsByIntent = new WeakMap<
  SearchIntent,
  string[]
>();

function normalizeSportsWatchTerm(term: string) {
  return String(term || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\s+/g, " ");
}

const SPORTS_WATCH_TEAM_TOKENS = [
  "lakers", "warriors", "celtics", "cowboys", "eagles", "dodgers", "duke",
  "knicks", "nets", "yankees", "mets", "giants", "jets", "rangers",
  "islanders", "devils", "march madness", "final four",
];

export function cleanupSportsWatchActivityTerms(terms: string[], rawQuery = "") {
  const q = String(rawQuery || "").toLowerCase();
  const added: string[] = SPORTS_WATCH_TEAM_TOKENS
    .filter((team) => new RegExp(`(^|[^a-z0-9])${team.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}([^a-z0-9]|$)`, "i").test(q))
    .map((team) => `${team} game`);
  if (/\b(basketball|nba|knicks|nets|lakers|warriors|celtics|heat|bucks|sixers|76ers|bulls|mavericks|mavs|suns|clippers|nuggets|timberwolves|wolves|thunder|grizzlies|pelicans|kings|blazers|jazz|rockets|spurs|raptors|pacers|cavaliers|cavs|magic|hawks|hornets|pistons|wizards|duke|uconn|march madness|final four)\b/.test(q)) added.push("basketball", "watch basketball");
  if (/\b(football|nfl|giants|jets|cowboys|eagles|commanders|patriots|chiefs|ravens|steelers|bills|dolphins|bengals|browns|texans|colts|jaguars|titans|broncos|raiders|chargers|packers|bears|lions|vikings|falcons|panthers|saints|buccaneers|bucs|cardinals|rams|49ers|seahawks)\b/.test(q)) added.push("football", "watch football");
  if (/\b(baseball|mlb|yankees|mets|dodgers|red sox|cubs|phillies|braves|astros|blue jays|orioles|rays|guardians|tigers|royals|twins|angels|athletics|mariners|nationals|marlins|brewers|pirates|reds|diamondbacks|rockies|padres)\b/.test(q)) added.push("baseball", "watch baseball");
  if (/\b(hockey|nhl|rangers|islanders|devils|bruins|flyers|penguins|capitals|hurricanes|panthers|lightning|maple leafs|leafs|canadiens|senators|sabres|red wings|blackhawks|blues|predators|wild|stars|avalanche|golden knights|knights|kraken|canucks|oilers|flames|ducks|sharks|coyotes)\b/.test(q)) added.push("hockey", "watch hockey");
  if (/\b(ufc|boxing|fight)\b/.test(q)) added.push("fight night", "ufc fight", "boxing fight");
  return finalCleanTermList(uniq([
    ...terms.map(normalizeSportsWatchTerm).filter((term) => term && !SPORTS_WATCH_BLOCKED_ACTIVITY_TERMS.has(term)),
    ...SPORTS_WATCH_REQUIRED_ACTIVITY_TERMS,
    ...added,
  ]), ACTIVITY_ALLOWED_SINGLE_WORDS);
}

export function sportsWatchTermsRemoved(terms: string[]) {
  return uniq(
    terms
      .map(normalizeSportsWatchTerm)
      .filter((term) => term && SPORTS_WATCH_BLOCKED_ACTIVITY_TERMS.has(term)),
  );
}

export function cleanupSportsWatchIntentTerms(
  intent: SearchIntent,
): SearchIntent {
  if (!hasSportsWatchIntent(intent.rawQuery)) return intent;

  const activityIntent = intent.activityIntent ?? createEmptyActivityIntent();
  const removedTerms = sportsWatchTermsRemoved(
    activityIntent.activityTerms ?? [],
  );

  const cleaned: SearchIntent = {
    ...intent,
    searchType: "activity",
    primaryDomain: "activity",
    needsRestaurant: false,
    needsActivity: true,
    wantsPairing: false,
    activityIntent: {
      ...activityIntent,
      activityTerms: cleanupSportsWatchActivityTerms(
        activityIntent.activityTerms ?? [],
        intent.rawQuery,
      ),
      categoryTerms: uniq([
        "sports bar",
        ...(activityIntent.categoryTerms ?? []).map(normalizeSportsWatchTerm),
      ]),
      featureTerms: uniq([
        "tv",
        ...(activityIntent.featureTerms ?? []).map(normalizeSportsWatchTerm),
      ]),
    },
    restaurantIntent: {
      ...createEmptyRestaurantIntent(),
    },
    pairingPreference: {
      requiresPairing: false,
      distanceMode: "any",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    },
  };

  sportsWatchRemovedActivityTermsByIntent.set(cleaned, removedTerms);

  return cleaned;
}

export function pruneSportsWatchActivityTerms(
  intent: SearchIntent,
  terms: string[] = activitySearchTermsOriginal(intent),
) {
  if (!hasSportsWatchIntent(intent.rawQuery)) return terms;
  return cleanupSportsWatchActivityTerms(terms, intent.rawQuery);
}

export function activityRpcTerms(intent: SearchIntent) {
  const original = activitySearchTermsOriginal(intent);
  const broadGenericActivity = isBroadGenericActivityIntent(intent);
  const afterDomainPruning = pruneActivityRpcTerms(intent, original);
  const afterSportsWatchPruning = pruneSportsWatchActivityTerms(
    intent,
    afterDomainPruning,
  );
  const expandedTerms = pruneRelaxedActivityTerms(intent, afterSportsWatchPruning);
  const terms = intent.needsActivity
    ? finalCleanTermList(
        broadGenericActivity ? COMPACT_GENERIC_ACTIVITY_RPC_TERMS : expandedTerms,
        ACTIVITY_ALLOWED_SINGLE_WORDS,
      )
    : [];


  return {
    terms,
    compactGenericActivityRpcApplied: broadGenericActivity,
    expandedTerms,
    removedForSportsWatchIntent: hasSportsWatchIntent(intent.rawQuery)
      ? uniq([
          ...(sportsWatchRemovedActivityTermsByIntent.get(intent) ?? []),
          ...sportsWatchTermsRemoved(afterDomainPruning),
          ...(sportsWatchRemovedActivityTermsByIntent.get(intent)?.length ? [] : [
            "nightlife",
            "rooftop lounge",
            "club",
            "dance club",
            "live dj",
            "speakeasy",
          ]),
        ])
      : [],
    removedForRelaxedIntent: hasRelaxedActivityIntent(intent.rawQuery)
      ? uniq([
          ...(relaxedRemovedActivityTermsByIntent.get(intent) ?? []),
          ...relaxedActivityTermsRemoved(afterSportsWatchPruning),
        ])
      : [],
  };
}
