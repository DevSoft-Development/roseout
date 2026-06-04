import type { EnterpriseLocation, SearchIntent, SearchDomain } from "./types";
import { scoreGeoMatch, shouldExcludeByGeo } from "./geo-taxonomy";
import { getLocationDistanceMiles, scoreDistance } from "./distance";
import {
  activityTermMatches,
  isGenericMealIntent,
  isSpecificActivityIntent,
  termMatchesRecord,
  textForRecord,
  PLACE_OF_WORSHIP_TERMS,
  userAskedForPlaceOfWorship,
} from "./taxonomy";
import { isWellnessActivity } from "../lowLevel";

function compactRecordText(r: EnterpriseLocation) {
  return textForRecord(r).replaceAll("_", " ").replaceAll("-", " ");
}

function fieldText(r: EnterpriseLocation, fields: string[]) {
  return fields
    .map((field) => {
      const value = (r as any)[field];
      if (Array.isArray(value)) return value.join(" ");
      return value == null ? "" : String(value);
    })
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");
}

function userExplicitlyAskedForTheater(intent: SearchIntent) {
  const text = [
    intent.rawQuery,
    ...intent.activityIntent.activityTerms,
    ...intent.activityIntent.categoryTerms,
    ...intent.activityIntent.featureTerms,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(theater|theatre|broadway|off-broadway|show|play|musical|cinema|movie|movies)\b/.test(
    text,
  );
}

function userAskedForHookah(intent: SearchIntent): boolean {
  return /\b(hookah|shisha|hookah lounge|hookah bar)\b/i.test(intent.rawQuery);
}

function isHookahRecord(record: EnterpriseLocation): boolean {
  return /\b(hookah|shisha)\b/i.test(textForRecord(record));
}

function isTheaterRecord(r: EnterpriseLocation) {
  const text = fieldText(r, [
    "name",
    "activity_name",
    "primary_category",
    "activity_type",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
    "description",
    "search_document",
    "semantic_search_text",
  ]);

  return /\b(theater|theatre|broadway|off-broadway|performing arts|cinema|movie theater)\b/.test(
    text,
  );
}

function explicitLocationType(r: EnterpriseLocation) {
  return String(
    r.location_type ??
      (r as any).source_table ??
      (r as any).type ??
      "",
  )
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");
}

function isPlaceOfWorshipRecord(r: EnterpriseLocation) {
  const typeText = explicitLocationType(r);
  const categoryText = fieldText(r, [
    "primary_category",
    "activity_type",
    "activity_name",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
    "name",
    "description",
    "search_document",
    "semantic_search_text",
  ]);

  const combined = `${typeText} ${categoryText}`;

  return PLACE_OF_WORSHIP_TERMS.some((term) =>
    combined.includes(term.toLowerCase()),
  );
}

function shouldHidePlaceOfWorship(r: EnterpriseLocation, intent: SearchIntent) {
  return isPlaceOfWorshipRecord(r) && !userAskedForPlaceOfWorship(intent.rawQuery);
}

function isClearlyActivityOnly(r: EnterpriseLocation) {
  const typeText = explicitLocationType(r);
  const categoryText = fieldText(r, [
    "primary_category",
    "activity_type",
    "activity_name",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
  ]);

  const hasRestaurantName = Boolean(r.restaurant_name);
  const hasCuisine = Boolean(r.cuisine || r.cuisine_type);

  if (hasRestaurantName || hasCuisine) return false;

  return (
    /\bactivity\b|\bactivities\b|\bexperience\b|\bentertainment\b/.test(typeText) ||
    /\btemple\b|\bchurch\b|\bmosque\b|\bsynagogue\b|\bplace of worship\b|\breligious\b|\bchapel\b|\bcathedral\b|\bshrine\b|\bmasjid\b|\bparish\b|\bministry\b/.test(categoryText) ||
    /\btheater\b|\btheatre\b|\bperforming arts\b|\bcinema\b|\bmovie theater\b/.test(categoryText) ||
    /\bmuseum\b|\bgallery\b|\bpark\b|\bgarden\b|\bzoo\b|\baquarium\b/.test(categoryText) ||
    /\bbowling\b|\barcade\b|\bescape room\b|\bkaraoke\b/.test(categoryText)
  );
}

function matchesAnyAlternativeGroup(
  record: EnterpriseLocation,
  groups: string[][] | undefined,
) {
  const validGroups = (groups ?? []).filter((group) => group.length >= 2);

  if (!validGroups.length) return true;

  return validGroups.some((group) => termMatchesRecord(record, group));
}

function isRestaurantLike(r: EnterpriseLocation) {
  const typeText = explicitLocationType(r);
  const categoryText = fieldText(r, [
    "primary_category",
    "cuisine",
    "cuisine_type",
    "restaurant_name",
    "name",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
  ]);

  const fullText = compactRecordText(r);

  const strongRestaurantSignal =
    Boolean(r.restaurant_name) ||
    Boolean(r.cuisine) ||
    Boolean(r.cuisine_type) ||
    /\brestaurant\b|\brestaurants\b|\bdining\b|\beatery\b|\bcafe\b|\bbakery\b|\bbistro\b|\bsteakhouse\b|\bbar and grill\b|\bgastropub\b/.test(typeText) ||
    /\brestaurant\b|\brestaurants\b|\bdining\b|\beatery\b|\bcafe\b|\bbakery\b|\bbistro\b|\bsteakhouse\b|\bbar and grill\b|\bgastropub\b/.test(categoryText);

  const foodSignal =
    /\bsteak\b|\bseafood\b|\bsushi\b|\bitalian\b|\bmexican\b|\bcaribbean\b|\bthai\b|\bindian restaurant\b|\bchinese restaurant\b|\bjapanese restaurant\b|\bkorean restaurant\b|\bbrunch\b|\bdinner menu\b|\bfood\b|\bcuisine\b/.test(fullText);

  const loungeWithFood =
    /\blounge\b|\bcocktail bar\b|\bwine bar\b/.test(categoryText) &&
    /\bfood\b|\bdining\b|\brestaurant\b|\bmenu\b|\bdinner\b|\bbrunch\b|\bcuisine\b/.test(fullText);

  if (isClearlyActivityOnly(r)) return false;

  return strongRestaurantSignal || foodSignal || loungeWithFood;
}

function isActivityLike(r: EnterpriseLocation) {
  const typeText = explicitLocationType(r);
  const categoryText = fieldText(r, [
    "primary_category",
    "activity_type",
    "activity_name",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
  ]);

  const fullText = compactRecordText(r);
  const hasRestaurantOnlySignals = Boolean(r.restaurant_name || r.cuisine || r.cuisine_type) && !r.activity_name && !r.activity_type;

  if (hasRestaurantOnlySignals) return false;

  return Boolean(
    r.activity_name ||
      r.activity_type ||
      /\bactivity\b|\bactivities\b|\bexperience\b|\bentertainment\b|\bnightlife\b/.test(typeText) ||
      /\bbowling\b|\bkaraoke\b|\bmuseum\b|\bhookah\b|\blounge\b|\barcade\b|\bmusic\b|\btheater\b|\btheatre\b|\bgallery\b|\bpark\b|\bescape room\b|\bclub\b|\bspa\b/.test(categoryText) ||
      /\bbowling\b|\bkaraoke\b|\bmuseum\b|\bhookah\b|\blounge\b|\barcade\b|\blive music\b|\btheater\b|\btheatre\b|\bescape room\b/.test(fullText),
  );
}
const CURATED_TERMS = [
  "romantic",
  "date night",
  "anniversary",
  "birthday",
  "upscale",
  "rooftop",
  "steak",
  "seafood",
  "cocktails",
  "lounge",
  "fine dining",
  "group night",
  "dinner date",
  "experience",
];
const UTILITY_TERMS = [
  "coffee",
  "quick bite",
  "fast food",
  "cheap eats",
  "casual",
  "near me",
  "open now",
  "breakfast",
  "grab and go",
];
const SELF_CARE_INTENT_TERMS = [
  "self care",
  "self-care",
  "spa day",
  "couples massage",
  "couple massage",
  "girls day",
  "relaxing date",
  "wellness",
  "birthday prep",
  "pampering",
  "pamper",
];
const NON_WELLNESS_PRIORITY_TERMS = [
  "dinner",
  "restaurant",
  "food",
  "eat",
  "dining",
  "rooftop",
  "hookah",
  "bowling",
  "arcade",
];

function userHasSelfCareIntent(intent: SearchIntent) {
  const text = intentText(intent);
  return SELF_CARE_INTENT_TERMS.some((term) => text.includes(term));
}

function isNonWellnessPriorityIntent(intent: SearchIntent) {
  const text = intentText(intent);
  return NON_WELLNESS_PRIORITY_TERMS.some((term) => text.includes(term));
}

function wellnessIntentAdjustment(r: EnterpriseLocation, intent: SearchIntent, domain: SearchDomain) {
  if (domain !== "activity" || !isWellnessActivity(r)) return 0;

  if (userHasSelfCareIntent(intent)) return 180;
  if (isNonWellnessPriorityIntent(intent)) return -220;

  return 0;
}

function intentText(intent: SearchIntent) {
  return [
    intent.rawQuery,
    intent.occasion,
    intent.budget,
    ...(Array.isArray(intent.vibe) ? intent.vibe : []),
    ...intent.restaurantIntent.mealTerms,
    ...intent.restaurantIntent.foodTerms,
    ...intent.restaurantIntent.cuisineTerms,
    ...intent.restaurantIntent.vibeTerms,
    ...intent.restaurantIntent.featureTerms,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ");
}
function isCuratedIntent(intent: SearchIntent) {
  const t = intentText(intent);
  return (
    CURATED_TERMS.some((term) => t.includes(term)) &&
    !UTILITY_TERMS.some((term) => t.includes(term))
  );
}
function chainPenalty(r: EnterpriseLocation, intent: SearchIntent) {
  if (!isCuratedIntent(intent)) return 0;
  const isChain =
    r.is_chain === true ||
    String(r.brand_type || "").toLowerCase() === "chain" ||
    String(r.curation_tier || "").toLowerCase() === "utility";
  return isChain ? 500 : 0;
}
function rooftopMatch(r: EnterpriseLocation) {
  return /rooftop|roof top|terrace|patio|outdoor|skyline|view|roof deck/.test(
    textForRecord(r),
  );
}
export function explainRejection(
  record: EnterpriseLocation,
  intent: SearchIntent,
  domain: SearchDomain,
) {
  if (shouldExcludeByGeo(record, intent.geo)) return "wrong_geo";

  if (shouldHidePlaceOfWorship(record, intent)) {
    return "place_of_worship_not_requested";
  }

  if (
    domain === "activity" &&
    isTheaterRecord(record) &&
    !userExplicitlyAskedForTheater(intent)
  ) {
    return "theater_not_requested";
  }

  if (domain === "activity" && userAskedForHookah(intent) && !isHookahRecord(record)) {
    return "missing_hookah_signal";
  }

  if (domain === "restaurant" && !isRestaurantLike(record))
    return "not_restaurant_domain";

  if (domain === "activity" && !isActivityLike(record))
    return "not_activity_domain";

  const specificRestaurantTerms = [
    ...intent.restaurantIntent.foodTerms,
    ...intent.restaurantIntent.cuisineTerms,
  ].filter(
    (term) =>
      !["birthday dinner", "dinner", "restaurant", "restaurants", "dining"].includes(
        term.toLowerCase(),
      ),
  );

  if (
    domain === "restaurant" &&
    specificRestaurantTerms.length > 0 &&
    !termMatchesRecord(record, specificRestaurantTerms)
  )
    return "missing_specific_food";

  if (
    domain === "restaurant" &&
    !matchesAnyAlternativeGroup(record, intent.restaurantIntent.alternativeGroups)
  ) {
    return "missing_restaurant_alternative";
  }

  if (
    domain === "restaurant" &&
    intent.restaurantIntent.featureTerms.includes("rooftop") &&
    !rooftopMatch(record)
  )
    return "missing_rooftop_signal";

  const hasGenericActivityAlternative = (intent.activityIntent.alternativeGroups ?? [])
    .flat()
    .some((term) =>
      ["activity", "activities", "things to do", "experience"].includes(term.toLowerCase()),
    );
  const specificActivityTerms = intent.activityIntent.activityTerms.filter(
    (term) => !["activity", "activities", "things to do", "experience"].includes(term.toLowerCase()),
  );

  if (
    domain === "activity" &&
    isSpecificActivityIntent(intent.activityIntent) &&
    !hasGenericActivityAlternative &&
    specificActivityTerms.length > 0 &&
    !activityTermMatches(record, specificActivityTerms)
  )
    return "missing_specific_activity";

  if (
    domain === "activity" &&
    !matchesAnyAlternativeGroup(record, intent.activityIntent.alternativeGroups)
  ) {
    return "missing_activity_alternative";
  }

  return null;
}
export function filterRestaurantResults(
  results: EnterpriseLocation[],
  intent: SearchIntent,
) {
  return results.filter((r) => !explainRejection(r, intent, "restaurant"));
}
export function filterActivityResults(
  results: EnterpriseLocation[],
  intent: SearchIntent,
) {
  return results.filter((r) => !explainRejection(r, intent, "activity"));
}
function relevance(
  r: EnterpriseLocation,
  intent: SearchIntent,
  domain: SearchDomain,
) {
  const geo = scoreGeoMatch(r, intent.geo);
  const dist = getLocationDistanceMiles(r, intent.geo);
  if (dist != null) r.distance_miles = Number(dist.toFixed(2));
  r.distance_score = scoreDistance(r, intent.geo);
  const terms =
    domain === "restaurant"
      ? [
          ...intent.restaurantIntent.foodTerms,
          ...intent.restaurantIntent.cuisineTerms,
          ...intent.restaurantIntent.mealTerms,
          ...intent.restaurantIntent.featureTerms,
          ...(intent.restaurantIntent.alternativeGroups ?? []).flat(),
        ]
      : [
          ...intent.activityIntent.activityTerms,
          ...intent.activityIntent.categoryTerms,
          ...intent.activityIntent.featureTerms,
          ...(intent.activityIntent.alternativeGroups ?? []).flat(),
        ];
  const termScore = terms.reduce(
    (s, t) => s + (termMatchesRecord(r, [t]) ? 35 : 0),
    0,
  );
  const alternativeScore =
    domain === "restaurant"
      ? (intent.restaurantIntent.alternativeGroups ?? []).some((group) =>
          termMatchesRecord(r, group),
        )
        ? 45
        : 0
      : (intent.activityIntent.alternativeGroups ?? []).some((group) =>
          termMatchesRecord(r, group),
        )
        ? 45
        : 0;
  const domainScore =
    domain === "restaurant"
      ? isRestaurantLike(r)
        ? 80
        : -80
      : isActivityLike(r)
        ? 80
        : -80;
  const generic =
    isGenericMealIntent(intent.restaurantIntent) && domain === "restaurant"
      ? 30
      : 0;
  const quality =
    Number(r.theouthaven_score ?? r.quality_score ?? 0) +
    Number(r.rating ?? 0) * 2 +
    Math.min(Number(r.review_count ?? 0) / 100, 10);
  r.term_score = termScore + alternativeScore + generic;
  r.geo_score = geo;
  r.domain_score = domainScore;
  r.quality_rank_score = quality;
  r.match_score = (r.term_score ?? 0) + domainScore + geo;
  return (
    (r.match_score ?? 0) +
    (r.term_score ?? 0) +
    (r.geo_score ?? 0) +
    (r.domain_score ?? 0) +
    (r.distance_score ?? 0) +
    quality -
    chainPenalty(r, intent) +
    wellnessIntentAdjustment(r, intent, domain) +
    Number(r.search_boost ?? 0)
  );
}
export function rankRestaurantResults(
  results: EnterpriseLocation[],
  intent: SearchIntent,
) {
  return filterRestaurantResults(results, intent).sort(
    (a, b) =>
      relevance(b, intent, "restaurant") - relevance(a, intent, "restaurant"),
  );
}
export function rankActivityResults(
  results: EnterpriseLocation[],
  intent: SearchIntent,
) {
  return filterActivityResults(results, intent).sort(
    (a, b) =>
      relevance(b, intent, "activity") - relevance(a, intent, "activity"),
  );
}
