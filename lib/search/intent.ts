import { ADD_ON_FOOD_INTENTS, ACTIVITY_INTENTS, GENERIC_MEAL_TERMS, INTENT_ALIASES, MEAL_FOOD_INTENTS, OUTING_PHRASES, SPECIFIC_MEAL_FOOD_INTENTS } from "./taxonomy";
import type { CanonicalSearchIntent } from "./types";
import { detectRequestedCuisines, detectRequestedRestaurantCategories } from "./cuisine-matching";
import { detectRequestedGeo } from "./geo-matching";

const BOROUGHS = ["brooklyn", "queens", "manhattan", "bronx", "staten island"];
const NYC_NEIGHBORHOODS = ["astoria", "long island city", "lic", "flushing", "jackson heights", "williamsburg", "harlem", "soho", "chelsea", "jamaica", "forest hills", "bushwick", "bed stuy"];
const MEAL_PRIMARY_TERMS = ["steak", "seafood", "dinner", "brunch", "lunch", "breakfast", "restaurant", "food", "date night dinner"];
const RESTAURANT_TERMS = [...GENERIC_MEAL_TERMS, "meal", "place to eat"];
const OCCASION_TERMS = ["date", "date night", "night", "brunch", "birthday", "birthday dinner", "group", "group outing", "outing", "fun outing"];
const VIBE_TERMS = ["romantic", "casual", "upscale", "nightlife", "cozy", "fun", "birthday", "group", "date night", "rooftop", "outdoor dining", "terrace", "skyline", "views", "view", "city view", "scenic", "patio"];
const ROOFTOP_MEAL_PHRASES = [
  "rooftop dinner",
  "rooftop restaurant",
  "rooftop dining",
  "romantic rooftop dinner",
  "rooftop brunch",
  "rooftop lunch",
  "dinner on a rooftop",
  "eat on a rooftop",
];
const ROOFTOP_MEAL_TERMS = ["dinner", "restaurant", "dining", "brunch", "lunch", "food", "eat"];

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const hit = (q: string, phrase: string) => q.includes(phrase);

const detectIntents = (query: string, pool: readonly string[]) => pool.filter((x) => hit(query, x.replaceAll("_", " ")) || hit(query, x));
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

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function includesConnectorBetween(query: string, leftTerms: string[], rightTerms: string[]) {
  return leftTerms.some((left) => rightTerms.some((right) => {
    const leftIndex = query.indexOf(left);
    const rightIndex = query.indexOf(right);
    if (leftIndex < 0 || rightIndex < 0) return false;
    const between = leftIndex < rightIndex
      ? query.slice(leftIndex + left.length, rightIndex)
      : query.slice(rightIndex + right.length, leftIndex);
    return /\b(and|then|after|with|plus|followed by|before)\b/.test(between);
  }));
}

export function parseCanonicalIntent(input: string, _body?: any): CanonicalSearchIntent {
  const normalizedQuery = norm(input || "");
  const mealFoodIntents = detectIntents(normalizedQuery, MEAL_FOOD_INTENTS);
  const specificMealFoodIntents = detectIntents(normalizedQuery, SPECIFIC_MEAL_FOOD_INTENTS);
  const addOnFoodIntents = detectIntents(normalizedQuery, ADD_ON_FOOD_INTENTS);
  const activityIntents = [
    ...detectIntents(normalizedQuery, ACTIVITY_INTENTS.filter((x) => x !== "sip_and_paint")),
    ...(hit(normalizedQuery, "sip and paint") ? ["paint_and_sip"] : []),
  ];

  for (const [base, aliases] of Object.entries(INTENT_ALIASES)) {
    if (aliases.some((a) => hit(normalizedQuery, a))) {
      if ((MEAL_FOOD_INTENTS as readonly string[]).includes(base) && !mealFoodIntents.includes(base)) mealFoodIntents.push(base);
      if ((SPECIFIC_MEAL_FOOD_INTENTS as readonly string[]).includes(base) && !specificMealFoodIntents.includes(base)) specificMealFoodIntents.push(base);
      if (base === "paint_and_sip" && !activityIntents.includes(base)) activityIntents.push(base);
      if (base === "hookah" && !activityIntents.includes(base)) activityIntents.push(base);
    }
  }

  const rooftopNightlifeIntent = ["rooftop bar", "rooftop lounge", "rooftop activity", "drinks then rooftop", "rooftop after dinner", "rooftop lounge after dinner"].some((phrase) => hit(normalizedQuery, phrase));
  const rooftopMealIntent = !rooftopNightlifeIntent && (
    ROOFTOP_MEAL_PHRASES.some((phrase) => hit(normalizedQuery, phrase)) ||
    (hit(normalizedQuery, "rooftop") && ROOFTOP_MEAL_TERMS.some((term) => hit(normalizedQuery, term)))
  );

  const explicitHookahRestaurant = ["hookah restaurant", "restaurant with hookah", "hookah with food", "hookah spot that serves food", "eat at hookah", "dinner with hookah"].some((p) => hit(normalizedQuery, p));
  const mealPrimaryHit = MEAL_PRIMARY_TERMS.some((p) => hit(normalizedQuery, p));
  const hasRealMeal = mealFoodIntents.length > 0 || mealPrimaryHit || RESTAURANT_TERMS.some((p) => hit(normalizedQuery, p));
  const hasHookah = activityIntents.includes("hookah");
  const hasLounge = activityIntents.includes("lounge");
  const hookahOrLoungeOnly = (hasHookah || hasLounge) && !hasRealMeal && !explicitHookahRestaurant;
  const hookahAsSamePlaceAddOn = explicitHookahRestaurant && !includesConnectorBetween(normalizedQuery, ["restaurant", "dinner", "food", "eat"], ["hookah lounge", "hookah", "lounge"]);
  const hookahAsSeparateActivity = (hasHookah || hasLounge) && !hookahAsSamePlaceAddOn;

  const dessertAsOutingStop = addOnFoodIntents.includes("dessert") && hasRealMeal && includesConnectorBetween(normalizedQuery, ["dinner", "restaurant", "food", "eat", "meal"], ["dessert"]);
  const thingsToDoActivity = hit(normalizedQuery, "things to do") || hit(normalizedQuery, "activities") || hit(normalizedQuery, "activity");
  if (dessertAsOutingStop && !activityIntents.includes("dessert")) activityIntents.push("dessert");
  if (thingsToDoActivity && !activityIntents.includes("activity")) activityIntents.push("activity");
  const wantsFood = mealFoodIntents.length > 0 || addOnFoodIntents.length > 0 || RESTAURANT_TERMS.some((p) => hit(normalizedQuery, p)) || explicitHookahRestaurant || mealPrimaryHit;
  const wantsActivity = activityIntents.some((intent) => !(intent === "rooftop" && rooftopMealIntent));
  const wantsFullOuting = (wantsFood && wantsActivity && !hookahAsSamePlaceAddOn) || OUTING_PHRASES.some((p) => hit(normalizedQuery, p));

  const geoIntent = detectRequestedGeo(normalizedQuery);
  const boroughs = uniq([...BOROUGHS.filter((b) => hit(normalizedQuery, b)), geoIntent?.borough]);
  const neighborhoods = uniq([...NYC_NEIGHBORHOODS.filter((n) => hit(normalizedQuery, n)), geoIntent?.neighborhood]);
  const city = geoIntent?.city ?? (hit(normalizedQuery, "new york") || hit(normalizedQuery, "nyc") ? "new york" : null);
  const cities = uniq([city, geoIntent?.region === "long_island" ? geoIntent.city ?? geoIntent.area : null]);
  const borough = boroughs[0] ?? null;
  const neighborhood = neighborhoods[0] ?? geoIntent?.area ?? null;
  const isLocationOnlySearch =
    (boroughs.length > 0 || Boolean(geoIntent)) &&
    !wantsFood &&
    !wantsActivity &&
    !["date", "outing", "nightlife"].some((p) => hit(normalizedQuery, p));

  const finalWantsFood = (wantsFood && !thingsToDoActivity) || isLocationOnlySearch;
  const finalWantsRestaurant = (wantsFood && !thingsToDoActivity) || isLocationOnlySearch;
  const finalWantsActivity = hookahOrLoungeOnly || (wantsActivity && !hookahAsSamePlaceAddOn && !isLocationOnlySearch);
  const requestedCuisines = detectRequestedCuisines(normalizedQuery);
  const requestedCategories = detectRequestedRestaurantCategories(normalizedQuery);
  const steakIntentMatch = STEAK_INTENT_TERMS.some((term) => hit(normalizedQuery, term));
  const restaurantIntent = steakIntentMatch || requestedCategories.length > 0 || finalWantsRestaurant || hasRealMeal;
  const restaurantType = requestedCategories[0] || (steakIntentMatch ? "steak" : null);
  const requiredRestaurantCategory = requestedCategories[0] || (steakIntentMatch ? "steak" : null);
  const occasionIntents = detectIntents(normalizedQuery, OCCASION_TERMS);
  const rooftopVibes = rooftopMealIntent
    ? ["rooftop", "outdoor dining", "terrace", "skyline", "views", "view", "patio"]
    : [];
  const vibes = uniq([
    ...detectIntents(normalizedQuery, VIBE_TERMS),
    ...rooftopVibes,
    ...occasionIntents.filter((term) => !["outing", "fun outing"].includes(term)),
  ]);
  const normalizedMealFoodIntents = uniq(mealFoodIntents);
  const normalizedActivityIntents = uniq(
    activityIntents
      .map((v) => (v === "sip_and_paint" ? "paint_and_sip" : v))
      .filter((v) => !(v === "rooftop" && rooftopMealIntent))
  );
  const foodIntents = uniq([...normalizedMealFoodIntents, ...addOnFoodIntents, ...(hookahAsSamePlaceAddOn ? ["hookah"] : [])]);
  const addOnIntent = uniq([
    ...normalizedActivityIntents.filter((term) => ["hookah", "bowling", "paint_and_sip", "karaoke", "arcade", "lounge", "rooftop"].includes(term)),
    ...(hookahAsSamePlaceAddOn ? ["hookah"] : []),
  ]);

  const nonOffTopicSignals = finalWantsFood || finalWantsActivity || boroughs.length > 0 || Boolean(geoIntent) || occasionIntents.length > 0;
  const isOffTopic = !nonOffTopicSignals;
  const primaryDomain = finalWantsRestaurant && finalWantsActivity ? "mixed" : finalWantsRestaurant ? "restaurant" : "activity";

  return {
    rawQuery: input,
    normalizedQuery,
    foodIntent: isLocationOnlySearch ? [] : uniq([...normalizedMealFoodIntents, ...addOnFoodIntents]),
    activityIntent: isLocationOnlySearch ? [] : normalizedActivityIntents,
    locationIntent: uniq([...boroughs, ...neighborhoods, ...(geoIntent?.terms ?? []), ...(city ? [city] : [])]),
    borough,
    city,
    neighborhood,
    needsRestaurant: finalWantsRestaurant || hasRealMeal,
    needsActivity: finalWantsActivity || hookahAsSeparateActivity,
    wantsPairing: Boolean((finalWantsRestaurant || hasRealMeal) && (finalWantsActivity || hookahAsSeparateActivity) && !hookahAsSamePlaceAddOn),
    addOnIntent,
    wantsFood: finalWantsFood,
    wantsRestaurant: finalWantsRestaurant,
    wantsActivity: finalWantsActivity || hookahAsSeparateActivity,
    wantsFullOuting: isLocationOnlySearch ? false : wantsFullOuting,
    foodIntents: isLocationOnlySearch ? [] : foodIntents,
    mealFoodIntents: isLocationOnlySearch ? [] : normalizedMealFoodIntents,
    specificMealFoodIntents: isLocationOnlySearch ? [] : uniq(specificMealFoodIntents),
    addOnFoodIntents: uniq(addOnFoodIntents),
    activityIntents: isLocationOnlySearch ? [] : normalizedActivityIntents,
    cuisines: isLocationOnlySearch ? [] : uniq([...requestedCuisines, ...normalizedMealFoodIntents.filter((term) => !GENERIC_MEAL_TERMS.includes(term as any))]),
    locations: uniq([...boroughs, ...(geoIntent?.terms ?? []), ...(geoIntent?.region === "long_island" ? ["long island"] : [])]),
    neighborhoods,
    boroughs,
    cities,
    vibes,
    occasionIntents,
    strictFoodMode: isLocationOnlySearch ? false : finalWantsFood && !(finalWantsActivity || hookahAsSeparateActivity),
    strictActivityMode: isLocationOnlySearch ? false : (finalWantsActivity || hookahAsSeparateActivity) && !finalWantsFood,
    isOffTopic,
    offTopicReason: isOffTopic ? "No food/activity/location/nightlife/date signal detected." : undefined,
    restaurantSearchInput: "",
    activitySearchInput: "",
    cacheBypassReasons: [],
    restaurantIntent,
    restaurantType,
    requiredRestaurantCategory,
    geoIntent,
    hookahMode: hookahAsSamePlaceAddOn ? "restaurant_add_on" : hookahOrLoungeOnly ? "activity" : hasHookah || hasLounge ? "activity_add_on" : null,
    mealFirst: Boolean(finalWantsRestaurant || hasRealMeal),
    primaryDomain,
  };
}
