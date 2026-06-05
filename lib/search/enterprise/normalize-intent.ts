import type { PairingPreference, SearchIntent } from "./types";
import {
  MAX_WALKING_DISTANCE_MINUTES,
  walkingMinutesToMiles,
} from "./distance";
import { detectGeoIntent } from "./geo-taxonomy";
import {
  ACTIVITY_TERMS,
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
  PLACE_OF_WORSHIP_TERMS,
  userAskedForPlaceOfWorship,
} from "./taxonomy";

const uniq = (items: string[]) =>
  Array.from(new Set(items.map((x) => x.toLowerCase().trim()).filter(Boolean)));
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
    /things to do|fun things|activity|then|with|after|before|drinks|cocktails|girls night|girls' night|lounge|bar|relaxed activity|chill activity|easy activity/i.test(
      query,
    ) ||
    (/date night/i.test(query) &&
      /walkable|walking distance|everything|outing|plan/i.test(query));
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
        !rooftopActivity &&
        (food.includes("rooftop") ||
          /rooftop|terrace|skyline|view/i.test(query))
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
              ...(food.includes("rooftop")
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
          stripCrossTerms(actExpanded, [...FOOD_TERMS, ...MEAL_TERMS]),
        ),
        ACTIVITY_SEARCH_TERM_BLOCKLIST,
      ),
      query,
    ),
    categoryTerms: cleanPlaceOfWorshipTerms(
      stripBlockedTerms(
        stripDistanceTerms(
          stripCrossTerms(uniq(merged.activityIntent.categoryTerms ?? []), [
            ...FOOD_TERMS,
            ...MEAL_TERMS,
          ]),
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
            stripCrossTerms(group, [...FOOD_TERMS, ...MEAL_TERMS]),
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
  return merged;
}
export function restaurantSearchTerms(intent: SearchIntent) {
  return stripBlockedTerms(
    uniq([
      ...intent.restaurantIntent.mealTerms,
      ...intent.restaurantIntent.foodTerms,
      ...intent.restaurantIntent.cuisineTerms,
      ...intent.restaurantIntent.categoryTerms,
      ...intent.restaurantIntent.featureTerms,
      ...(intent.restaurantIntent.alternativeGroups ?? []).flat(),
    ]),
    RESTAURANT_SEARCH_TERM_BLOCKLIST,
  );
}

export function activitySearchTerms(intent: SearchIntent) {
  const raw = uniq([
    ...intent.activityIntent.activityTerms,
    ...intent.activityIntent.categoryTerms,
    ...intent.activityIntent.featureTerms,
    ...(intent.activityIntent.alternativeGroups ?? []).flat(),
  ]);

  const cleaned = stripBlockedTerms(raw, ACTIVITY_SEARCH_TERM_BLOCKLIST);

  return cleanPlaceOfWorshipTerms(cleaned, intent.rawQuery);
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
  return uniq([
    ...intent.activityIntent.activityTerms,
    ...intent.activityIntent.categoryTerms,
    ...intent.activityIntent.featureTerms,
    ...(intent.activityIntent.alternativeGroups ?? []).flat(),
  ]);
}

export function hasRelaxedActivityIntent(query: string | null | undefined) {
  return /relaxed|chill|easy|low[-\s]?key|laid[-\s]?back|casual|quiet|girls'? night/i.test(
    String(query ?? ""),
  );
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
  return terms.filter(
    (term) => !/(club|dance club|nightclub|hard nightlife|live dj)/i.test(term),
  );
}

export function activityRpcTerms(intent: SearchIntent) {
  const original = activitySearchTermsOriginal(intent);
  const afterDomainPruning = pruneActivityRpcTerms(intent, original);
  const terms = pruneRelaxedActivityTerms(intent, afterDomainPruning);
  const kept = new Set(terms.map((term) => term.toLowerCase()));
  return {
    terms,
    removedForRelaxedIntent: hasRelaxedActivityIntent(intent.rawQuery)
      ? afterDomainPruning.filter((term) => !kept.has(term.toLowerCase()))
      : [],
  };
}
