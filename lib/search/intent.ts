import { ADD_ON_FOOD_INTENTS, ACTIVITY_INTENTS, GENERIC_MEAL_TERMS, INTENT_ALIASES, MEAL_FOOD_INTENTS, OUTING_PHRASES, SPECIFIC_MEAL_FOOD_INTENTS } from "@/lib/search/taxonomy";
import type { CanonicalSearchIntent } from "@/lib/search/types";
import { detectRequestedCuisines, detectRequestedRestaurantCategories } from "@/lib/search/cuisine-matching";
import { detectRequestedGeo } from "@/lib/search/geo-matching";

const BOROUGHS = ["brooklyn", "queens", "manhattan", "bronx", "staten island"];
const NYC_NEIGHBORHOODS = ["astoria", "long island city", "lic", "flushing", "jackson heights", "williamsburg", "harlem", "soho", "chelsea"];
const MEAL_PRIMARY_TERMS = ["steak", "seafood", "dinner", "brunch", "lunch", "breakfast", "restaurant", "food", "date night dinner"];
const RESTAURANT_TERMS = [...GENERIC_MEAL_TERMS];

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const hit = (q: string, phrase: string) => q.includes(phrase);

const detectIntents = (query: string, pool: readonly string[]) => pool.filter((x) => hit(query, x));
const STEAK_INTENT_TERMS = [
  "steak",
  "steak dinner",
  "steakhouse",
  "steak house",
  "ribeye",
  "filet mignon",
  "porterhouse",
  "sirloin",
  "tomahawk steak",
];

export function parseCanonicalIntent(input: string, _body?: any): CanonicalSearchIntent {
  const normalizedQuery = norm(input || "");
  const mealFoodIntents = detectIntents(normalizedQuery, MEAL_FOOD_INTENTS);
  const specificMealFoodIntents = detectIntents(normalizedQuery, SPECIFIC_MEAL_FOOD_INTENTS);
  const addOnFoodIntents = detectIntents(normalizedQuery, ADD_ON_FOOD_INTENTS);
  const activityIntents = [...detectIntents(normalizedQuery, ACTIVITY_INTENTS.filter((x) => x !== "sip_and_paint")), ...(hit(normalizedQuery, "sip and paint") ? ["paint_and_sip"] : [])];

  for (const [base, aliases] of Object.entries(INTENT_ALIASES)) {
    if (aliases.some((a) => hit(normalizedQuery, a))) {
      if ((MEAL_FOOD_INTENTS as readonly string[]).includes(base) && !mealFoodIntents.includes(base)) mealFoodIntents.push(base);
      if ((SPECIFIC_MEAL_FOOD_INTENTS as readonly string[]).includes(base) && !specificMealFoodIntents.includes(base)) specificMealFoodIntents.push(base);
      if (base === "paint_and_sip" && !activityIntents.includes(base)) activityIntents.push(base);
      if (base === "hookah" && !activityIntents.includes(base)) activityIntents.push(base);
    }
  }

  const explicitHookahRestaurant = ["hookah restaurant", "restaurant with hookah", "hookah with food", "hookah spot that serves food", "eat at hookah"].some((p) => hit(normalizedQuery, p));
  const hasRealMeal = mealFoodIntents.length > 0 || MEAL_PRIMARY_TERMS.some((p) => hit(normalizedQuery, p)) || RESTAURANT_TERMS.some((p) => hit(normalizedQuery, p));
  const wantsFood = mealFoodIntents.length > 0 || addOnFoodIntents.length > 0 || RESTAURANT_TERMS.some((p) => hit(normalizedQuery, p));
  const wantsActivity = activityIntents.length > 0;
  const wantsFullOuting = (wantsFood && wantsActivity) || OUTING_PHRASES.some((p) => hit(normalizedQuery, p));

  const hookahOnlyFood = explicitHookahRestaurant && !hasRealMeal;
  const foodIntents = [...new Set([...mealFoodIntents, ...addOnFoodIntents, ...(hookahOnlyFood ? ["hookah"] : [])])];
  const geoIntent = detectRequestedGeo(normalizedQuery);
  const boroughs = [...new Set([...BOROUGHS.filter((b) => hit(normalizedQuery, b)), ...(geoIntent?.borough ? [geoIntent.borough] : [])])];
  const neighborhoods = [...new Set([...NYC_NEIGHBORHOODS.filter((n) => hit(normalizedQuery, n)), ...(geoIntent?.neighborhood ? [geoIntent.neighborhood] : [])])];
  const city = geoIntent?.city ?? (hit(normalizedQuery, "new york") || hit(normalizedQuery, "nyc") ? "new york" : null);
  const borough = boroughs[0] ?? null;
  const neighborhood = neighborhoods[0] ?? geoIntent?.area ?? null;
  const isLocationOnlySearch =
    (boroughs.length > 0 || Boolean(geoIntent)) &&
    !wantsFood &&
    !wantsActivity &&
    !["date", "outing", "nightlife"].some((p) => hit(normalizedQuery, p));
  const finalWantsFood = wantsFood || isLocationOnlySearch;
  const finalWantsRestaurant =
    wantsFood || explicitHookahRestaurant || isLocationOnlySearch;
  const finalWantsActivity = (wantsActivity && !isLocationOnlySearch) || (isLocationOnlySearch && !finalWantsFood);
  const hookahOnlyQuery = activityIntents.includes("hookah") && !hasRealMeal;
  const requestedCuisines = detectRequestedCuisines(normalizedQuery);
  const requestedCategories = detectRequestedRestaurantCategories(normalizedQuery);
  const steakIntentMatch = STEAK_INTENT_TERMS.some((term) => hit(normalizedQuery, term));
  const restaurantIntent = steakIntentMatch || requestedCategories.length > 0 || finalWantsRestaurant || hasRealMeal;
  const restaurantType = requestedCategories[0] || (steakIntentMatch ? "steak" : null);
  const requiredRestaurantCategory = requestedCategories[0] || (steakIntentMatch ? "steak" : null);

  const nonOffTopicSignals = finalWantsFood || finalWantsActivity || boroughs.length > 0 || Boolean(geoIntent) || ["nightlife", "date", "outing"].some((p) => hit(normalizedQuery, p));
  const isOffTopic = !nonOffTopicSignals;

  return {
    rawQuery: input,
    normalizedQuery,
    foodIntent: isLocationOnlySearch ? [] : [...new Set([...mealFoodIntents, ...addOnFoodIntents])],
    activityIntent: isLocationOnlySearch ? [] : [...new Set(activityIntents)],
    locationIntent: [...new Set([...boroughs, ...neighborhoods, ...(geoIntent?.terms ?? []), ...(city ? [city] : [])])],
    borough,
    city,
    neighborhood,
    needsRestaurant: finalWantsRestaurant || hasRealMeal,
    needsActivity: hookahOnlyQuery ? true : wantsActivity,
    wantsPairing: Boolean((finalWantsRestaurant || hasRealMeal) && wantsActivity),
    addOnIntent: [...new Set(activityIntents.filter((term) => ["hookah", "bowling", "paint_and_sip", "karaoke", "arcade", "lounge", "rooftop"].includes(term)))],
    wantsFood: finalWantsFood,
    wantsRestaurant: finalWantsRestaurant,
    wantsActivity: finalWantsActivity || hookahOnlyQuery,
    wantsFullOuting: isLocationOnlySearch ? false : wantsFullOuting,
    foodIntents: isLocationOnlySearch ? [] : foodIntents,
    mealFoodIntents: isLocationOnlySearch ? [] : mealFoodIntents,
    specificMealFoodIntents: isLocationOnlySearch ? [] : [...new Set(specificMealFoodIntents)],
    addOnFoodIntents,
    activityIntents: isLocationOnlySearch ? [] : [...new Set(activityIntents.map((v) => (v === "sip_and_paint" ? "paint_and_sip" : v)))],
    cuisines: isLocationOnlySearch ? [] : [...new Set([...requestedCuisines, ...mealFoodIntents])],
    locations: [...new Set([...boroughs, ...(geoIntent?.terms ?? [])])],
    neighborhoods,
    boroughs,
    vibes: detectIntents(normalizedQuery, ["romantic", "casual", "upscale", "nightlife", "cozy"]),
    strictFoodMode: isLocationOnlySearch ? false : finalWantsFood && !finalWantsActivity,
    strictActivityMode: isLocationOnlySearch ? false : finalWantsActivity && !finalWantsFood,
    isOffTopic,
    offTopicReason: isOffTopic ? "No food/activity/location/nightlife/date signal detected." : undefined,
    restaurantSearchInput: "",
    activitySearchInput: "",
    cacheBypassReasons: [],
    restaurantIntent,
    restaurantType,
    requiredRestaurantCategory,
    geoIntent,
  };
}
