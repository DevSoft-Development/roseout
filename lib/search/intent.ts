import { ADD_ON_FOOD_INTENTS, ACTIVITY_INTENTS, GENERIC_MEAL_TERMS, INTENT_ALIASES, MEAL_FOOD_INTENTS, OUTING_PHRASES, SPECIFIC_MEAL_FOOD_INTENTS } from "@/lib/search/taxonomy";
import type { CanonicalSearchIntent } from "@/lib/search/types";

const BOROUGHS = ["brooklyn", "queens", "manhattan", "bronx", "staten island"];
const RESTAURANT_TERMS = [...GENERIC_MEAL_TERMS];

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const hit = (q: string, phrase: string) => q.includes(phrase);

const detectIntents = (query: string, pool: readonly string[]) => pool.filter((x) => hit(query, x));

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
  const hasRealMeal = mealFoodIntents.length > 0 || RESTAURANT_TERMS.some((p) => hit(normalizedQuery, p));
  const wantsFood = mealFoodIntents.length > 0 || addOnFoodIntents.length > 0 || RESTAURANT_TERMS.some((p) => hit(normalizedQuery, p));
  const wantsActivity = activityIntents.length > 0;
  const wantsFullOuting = (wantsFood && wantsActivity) || OUTING_PHRASES.some((p) => hit(normalizedQuery, p));

  const hookahOnlyFood = explicitHookahRestaurant && !hasRealMeal;
  const foodIntents = [...new Set([...mealFoodIntents, ...addOnFoodIntents, ...(hookahOnlyFood ? ["hookah"] : [])])];
  const boroughs = BOROUGHS.filter((b) => hit(normalizedQuery, b));
  const isLocationOnlySearch =
    boroughs.length > 0 &&
    !wantsFood &&
    !wantsActivity &&
    !["date", "outing", "nightlife"].some((p) => hit(normalizedQuery, p));
  const finalWantsFood = wantsFood || isLocationOnlySearch;
  const finalWantsRestaurant =
    wantsFood || explicitHookahRestaurant || isLocationOnlySearch;
  const finalWantsActivity = wantsActivity || isLocationOnlySearch;

  const nonOffTopicSignals = finalWantsFood || finalWantsActivity || boroughs.length > 0 || ["nightlife", "date", "outing"].some((p) => hit(normalizedQuery, p));
  const isOffTopic = !nonOffTopicSignals;

  return {
    rawQuery: input,
    normalizedQuery,
    wantsFood: finalWantsFood,
    wantsRestaurant: finalWantsRestaurant,
    wantsActivity: finalWantsActivity,
    wantsFullOuting: isLocationOnlySearch ? false : wantsFullOuting,
    foodIntents: isLocationOnlySearch ? [] : foodIntents,
    mealFoodIntents: isLocationOnlySearch ? [] : mealFoodIntents,
    specificMealFoodIntents: isLocationOnlySearch ? [] : [...new Set(specificMealFoodIntents)],
    addOnFoodIntents,
    activityIntents: isLocationOnlySearch ? [] : [...new Set(activityIntents.map((v) => (v === "sip_and_paint" ? "paint_and_sip" : v)))],
    cuisines: (isLocationOnlySearch ? [] : mealFoodIntents).filter((v) => ["italian", "mexican", "thai", "chinese", "japanese", "american", "african", "caribbean"].includes(v)),
    locations: boroughs,
    neighborhoods: [],
    boroughs,
    vibes: detectIntents(normalizedQuery, ["romantic", "casual", "upscale", "nightlife", "cozy"]),
    strictFoodMode: isLocationOnlySearch ? false : finalWantsFood && !finalWantsActivity,
    strictActivityMode: isLocationOnlySearch ? false : finalWantsActivity && !finalWantsFood,
    isOffTopic,
    offTopicReason: isOffTopic ? "No food/activity/location/nightlife/date signal detected." : undefined,
    restaurantSearchInput: "",
    activitySearchInput: "",
    cacheBypassReasons: [],
  };
}
