import { buildActivitySearchInput, buildRestaurantSearchInput } from "./queryBuilders";
import { ADD_ON_FOOD_INTENTS, BOROUGHS, INTENT_ALIASES, MEAL_FOOD_INTENTS, OUTING_PHRASES } from "./taxonomy";
import type { CanonicalSearchIntent } from "./types";

const includesAny = (q: string, terms: string[]) => terms.some((t) => q.includes(t));

export function parseCanonicalIntent(input: string, body: any = {}): CanonicalSearchIntent {
  const rawQuery = String(input || body?.input || "").trim();
  const normalizedQuery = rawQuery.toLowerCase().replace(/\s+/g, " ");
  const mealFoodIntents = [...new Set(MEAL_FOOD_INTENTS.filter((i) => normalizedQuery.includes(i) || includesAny(normalizedQuery, INTENT_ALIASES[i] || [])))];
  const addOnFoodIntents = [...new Set(ADD_ON_FOOD_INTENTS.filter((i) => normalizedQuery.includes(i)))];
  const activityIntents = new Set<string>();
  if (includesAny(normalizedQuery, INTENT_ALIASES.hookah)) activityIntents.add("hookah");
  if (includesAny(normalizedQuery, INTENT_ALIASES.paint_and_sip)) activityIntents.add("paint_and_sip");
  ["bowling","karaoke","arcade","comedy","escape_room","spa","rooftop","lounge","nightclub","live_music","jazz","cigar","mini_golf","axe_throwing","museum","movies","pool","billiards"].forEach((k) => normalizedQuery.includes(k) && activityIntents.add(k));

  const hookahRestaurantHint = /(hookah restaurant|restaurant with hookah|hookah with food|hookah spot that serves food|eat at hookah)/.test(normalizedQuery);
  const hasRealMeal = mealFoodIntents.length > 0 || /(dinner|lunch|brunch|breakfast|restaurant|food)/.test(normalizedQuery);
  const wantsFood = hasRealMeal || addOnFoodIntents.length > 0 || hookahRestaurantHint;
  const wantsActivity = activityIntents.size > 0;
  const wantsFullOuting = (wantsFood && wantsActivity) || includesAny(normalizedQuery, OUTING_PHRASES);
  const wantsRestaurant = wantsFood || wantsFullOuting;

  const boroughs = BOROUGHS.filter((b) => normalizedQuery.includes(b));
  const intent: CanonicalSearchIntent = {
    rawQuery,
    normalizedQuery,
    wantsFood,
    wantsRestaurant,
    wantsActivity: wantsActivity || wantsFullOuting,
    wantsFullOuting,
    foodIntents: [...new Set([...mealFoodIntents, ...addOnFoodIntents])],
    mealFoodIntents,
    addOnFoodIntents,
    activityIntents: [...activityIntents],
    cuisines: [],
    locations: boroughs,
    neighborhoods: [],
    boroughs,
    vibes: [],
    strictFoodMode: hasRealMeal,
    strictActivityMode: wantsActivity,
    isOffTopic: false,
    restaurantSearchInput: "",
    activitySearchInput: "",
    cacheBypassReasons: [],
  };

  const validSignal = intent.foodIntents.length || intent.activityIntents.length || intent.locations.length || /(restaurant|date|dinner|brunch|nightlife|outing|lounge)/.test(normalizedQuery);
  intent.isOffTopic = !validSignal;
  intent.offTopicReason = intent.isOffTopic ? "No food/activity/location intent detected" : undefined;
  intent.restaurantSearchInput = buildRestaurantSearchInput(intent);
  intent.activitySearchInput = buildActivitySearchInput(intent);
  return intent;
}
