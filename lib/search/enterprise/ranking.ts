import type { EnterpriseLocation, SearchIntent, SearchDomain } from "./types";
import { scoreGeoMatch, shouldExcludeByGeo } from "./geo-taxonomy";
import { getLocationDistanceMiles, scoreDistance } from "./distance";
import {
  activityTermMatches,
  isGenericMealIntent,
  isSpecificActivityIntent,
  isSpecificFoodIntent,
  termMatchesRecord,
  textForRecord,
} from "./taxonomy";

function isRestaurantLike(r: EnterpriseLocation) {
  const t = textForRecord(r);
  return Boolean(
    r.restaurant_name ||
    r.cuisine ||
    r.cuisine_type ||
    /restaurant|dining|food|cafe|bakery|steak|seafood|sushi|italian|brunch|dinner/.test(
      t,
    ),
  );
}
function isActivityLike(r: EnterpriseLocation) {
  const t = textForRecord(r);
  return Boolean(
    r.activity_name ||
    r.activity_type ||
    /activity|experience|nightlife|entertainment|bowling|karaoke|museum|hookah|lounge|arcade|music|theater/.test(
      t,
    ),
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
  "girls night",
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
  if (domain === "restaurant" && !isRestaurantLike(record))
    return "not_restaurant_domain";
  if (domain === "activity" && !isActivityLike(record))
    return "not_activity_domain";
  if (
    domain === "restaurant" &&
    isSpecificFoodIntent(intent.restaurantIntent) &&
    !termMatchesRecord(record, [
      ...intent.restaurantIntent.foodTerms,
      ...intent.restaurantIntent.cuisineTerms,
    ])
  )
    return "missing_specific_food";
  if (
    domain === "restaurant" &&
    intent.restaurantIntent.featureTerms.includes("rooftop") &&
    !rooftopMatch(record)
  )
    return "missing_rooftop_signal";
  if (
    domain === "activity" &&
    isSpecificActivityIntent(intent.activityIntent) &&
    !activityTermMatches(record, intent.activityIntent.activityTerms)
  )
    return "missing_specific_activity";
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
        ]
      : [
          ...intent.activityIntent.activityTerms,
          ...intent.activityIntent.categoryTerms,
        ];
  const termScore = terms.reduce(
    (s, t) => s + (termMatchesRecord(r, [t]) ? 35 : 0),
    0,
  );
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
  r.term_score = termScore + generic;
  r.geo_score = geo;
  r.domain_score = domainScore;
  r.quality_rank_score = quality;
  r.match_score = termScore + domainScore + geo;
  return (
    (r.match_score ?? 0) +
    (r.term_score ?? 0) +
    (r.geo_score ?? 0) +
    (r.domain_score ?? 0) +
    (r.distance_score ?? 0) +
    quality -
    chainPenalty(r, intent) +
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
