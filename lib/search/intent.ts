import { ADD_ON_FOOD_INTENTS, ACTIVITY_INTENTS, INTENT_ALIASES, MEAL_FOOD_INTENTS, OUTING_PHRASES } from "@/lib/search/taxonomy";
import type { CanonicalSearchIntent } from "@/lib/search/types";

const BOROUGHS = ["brooklyn", "queens", "manhattan", "bronx", "staten island"];
const RESTAURANT_TERMS = ["restaurant", "dinner", "brunch", "lunch", "breakfast", "food", "eat"];

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const hit = (q: string, phrase: string) => q.includes(phrase);

const detectIntents = (query: string, pool: readonly string[]) => pool.filter((x) => hit(query, x));

export function parseCanonicalIntent(input: string, _body?: any): CanonicalSearchIntent {
  const normalizedQuery = norm(input || "");
  const mealFoodIntents = detectIntents(normalizedQuery, MEAL_FOOD_INTENTS);
  const addOnFoodIntents = detectIntents(normalizedQuery, ADD_ON_FOOD_INTENTS);
  const activityIntents = [...detectIntents(normalizedQuery, ACTIVITY_INTENTS.filter((x) => x !== "sip_and_paint")), ...(hit(normalizedQuery, "sip and paint") ? ["paint_and_sip"] : [])];

  for (const [base, aliases] of Object.entries(INTENT_ALIASES)) {
    if (aliases.some((a) => hit(normalizedQuery, a))) {
      if ((MEAL_FOOD_INTENTS as readonly string[]).includes(base) && !mealFoodIntents.includes(base)) mealFoodIntents.push(base);
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

  const nonOffTopicSignals = wantsFood || wantsActivity || boroughs.length > 0 || ["nightlife", "date", "outing"].some((p) => hit(normalizedQuery, p));
  const isOffTopic = !nonOffTopicSignals;

  return {
    rawQuery: input,
    normalizedQuery,
    wantsFood,
    wantsRestaurant: wantsFood || explicitHookahRestaurant,
    wantsActivity,
    wantsFullOuting,
    foodIntents,
    mealFoodIntents,
    addOnFoodIntents,
    activityIntents: [...new Set(activityIntents.map((v) => (v === "sip_and_paint" ? "paint_and_sip" : v)))],
    cuisines: mealFoodIntents.filter((v) => ["italian", "mexican", "thai", "chinese", "japanese", "american", "african", "caribbean"].includes(v)),
    locations: boroughs,
    neighborhoods: [],
    boroughs,
    vibes: detectIntents(normalizedQuery, ["romantic", "casual", "upscale", "nightlife", "cozy"]),
    strictFoodMode: wantsFood && !wantsActivity,
    strictActivityMode: wantsActivity && !wantsFood,
    isOffTopic,
    offTopicReason: isOffTopic ? "No food/activity/location/nightlife/date signal detected." : undefined,
    restaurantSearchInput: "",
    activitySearchInput: "",
    cacheBypassReasons: [],
  };
}
