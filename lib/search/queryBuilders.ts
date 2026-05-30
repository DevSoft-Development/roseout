import type { CanonicalSearchIntent } from "./types";

const uniq = (arr: string[]) => [...new Set(arr.map((v) => String(v ?? "").trim()).filter(Boolean))];
const restaurantRelevantVibes = (vibes: string[] = []) => vibes.filter((vibe) => !["nightlife", "club"].includes(vibe));
const activityRelevantVibes = (intent: CanonicalSearchIntent) => (intent.normalizedIntent?.vibeTerms ?? intent.vibes ?? [])
  .filter((vibe) => vibe !== "rooftop" || intent.activityIntents.includes("rooftop"));
const geoTerms = (intent: CanonicalSearchIntent) => uniq([
  ...(intent.normalizedIntent?.geo.neighborhood ? [intent.normalizedIntent.geo.neighborhood] : []),
  ...(intent.normalizedIntent?.geo.borough ? [intent.normalizedIntent.geo.borough] : []),
  ...(intent.normalizedIntent?.geo.city ? [intent.normalizedIntent.geo.city] : []),
  ...intent.boroughs,
  ...intent.neighborhoods,
  ...(intent.cities ?? []),
  ...(intent.locations ?? []),
  ...(intent.geoIntent?.terms ?? []),
]);

export function buildRestaurantSearchInput(intent: CanonicalSearchIntent): string {
  const normalized = intent.normalizedIntent;
  if (
    (intent.boroughs.length > 0 || Boolean(intent.geoIntent)) &&
    (normalized?.restaurantTerms.length ?? intent.mealFoodIntents.length) === 0 &&
    (normalized?.activityTerms.length ?? intent.activityIntents.length) === 0 &&
    intent.vibes.length === 0
  ) {
    return uniq([...geoTerms(intent), "restaurant"]).join(" ");
  }

  const laneRestaurantTerms = normalized?.restaurantTerms ?? [];
  const laneCuisineTerms = normalized?.cuisineTerms ?? [];
  const laneMealTerms = normalized?.mealTerms ?? [];
  const specificTerms = laneCuisineTerms.length > 0 ? laneCuisineTerms : (intent.specificMealFoodIntents ?? []);
  const mealTerms = uniq([
    ...laneRestaurantTerms,
    ...laneMealTerms,
    ...(specificTerms.length > 0 ? specificTerms : intent.mealFoodIntents),
  ]);
  const rooftopSearchTerms = (normalized?.vibeTerms ?? intent.vibes)?.includes("rooftop")
    ? ["rooftop", "roof top", "outdoor dining", "terrace", "patio", "skyline", "views", "view", "city view", "scenic"]
    : [];
  const terms = uniq([
    ...mealTerms,
    ...laneCuisineTerms,
    ...intent.cuisines,
    ...(mealTerms.includes("steak") ? ["steakhouse"] : []),
    ...geoTerms(intent),
    ...restaurantRelevantVibes(normalized?.vibeTerms ?? intent.vibes),
    ...rooftopSearchTerms,
    "restaurant",
  ]).filter((term) => !(normalized?.activityTerms ?? intent.activityIntents).includes(term));
  return terms.join(" ").trim();
}

export function buildActivitySearchInput(intent: CanonicalSearchIntent): string {
  const normalized = intent.normalizedIntent;
  if (
    (intent.boroughs.length > 0 || Boolean(intent.geoIntent)) &&
    (normalized?.restaurantTerms.length ?? intent.mealFoodIntents.length) === 0 &&
    (normalized?.activityTerms.length ?? intent.activityIntents.length) === 0
  ) {
    return uniq([...geoTerms(intent), "activity", "nightlife", "experience"]).join(" ");
  }
  const restaurantLaneTerms = new Set([
    ...(normalized?.restaurantTerms ?? []),
    ...(normalized?.cuisineTerms ?? []),
    ...(normalized?.mealTerms ?? []),
    ...intent.cuisines,
    ...intent.mealFoodIntents,
    ...(intent.specificMealFoodIntents ?? []),
  ]);
  const terms = uniq([
    ...((normalized?.activityTerms ?? intent.activityIntents).map((v) => (v === "paint_and_sip" ? "paint and sip sip and paint painting studio" : v))),
    ...geoTerms(intent),
    ...activityRelevantVibes(intent),
    "activity",
  ]).filter((term) => !restaurantLaneTerms.has(term));
  return terms.join(" ").trim();
}
