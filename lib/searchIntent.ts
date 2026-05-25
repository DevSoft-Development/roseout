export type CanonicalSearchIntent = {
  version: string;
  originalQuery: string;
  normalizedInput: string;
  locationText?: string;
  borough?: string;
  city?: string;
  state?: string;
  outingMode: "single_stop" | "multi_stop";
  wantsRestaurant: boolean;
  wantsActivity: boolean;
  restaurantIntent: {
    required: boolean;
    mealPrimary: boolean;
    cuisineTerms: string[];
    dishTerms: string[];
    restaurantKeywords: string[];
    excludedAddonTerms: string[];
  };
  activityIntent: {
    required: boolean;
    activityTypes: string[];
    addonTerms: string[];
    loungeTerms: string[];
  };
  hardFilters: { borough?: string; city?: string; state?: string };
  cardPolicy: { forceCards: boolean; prohibitTextOnlyWhenCardsExist: boolean };

  // backwards compatibility fields used by route/google import
  rawInput: string;
  mode: "restaurant_only" | "activity_only" | "full_outing" | "location_lookup" | "off_topic";
  wantsFood: boolean;
  wantsFullOuting: boolean;
  foodIntents: string[];
  primaryMealIntents: string[];
  foodAddOnIntents: string[];
  activityIntents: string[];
  primaryActivityIntents: string[];
  secondaryActivityIntents: string[];
  vibes: string[];
  requestedTags: string[];
  locations: string[];
  neighborhoods: string[];
  boroughs: string[];
  cities: string[];
  budget: { level: string | null; maxPrice: number | null; raw: string | null };
  distance: { maxMiles: number | null; userLat: number | null; userLng: number | null };
  multiIntentMode: boolean;
  routing: {
    restaurantQuery: string;
    activityQuery: string;
    shouldSearchRestaurants: boolean;
    shouldSearchActivities: boolean;
    shouldForceRestaurantCards: boolean;
    shouldForceActivityCards: boolean;
    allowTextOnlyFallback: boolean;
  };
  confidence: { score: number; reasons: string[] };
  explicitTerms: string[];
  primaryDomain: "restaurant" | "activity" | "mixed";
  requiresRestaurant: boolean;
  requiresActivity: boolean;
  isHookahOnly: boolean;
  isLoungeOnly: boolean;
  isDessertOnly: boolean;
  isMealPrimary: boolean;
};
export type CanonicalOutingIntent = {
  rawQuery: string;
  locationText: string | null;
  borough: string | null;
  neighborhoods: string[];
  wantsRestaurant: boolean;
  wantsActivity: boolean;
  wantsCompleteOuting: boolean;
  restaurantIntent: {
    mealTerms: string[];
    cuisineTerms: string[];
    foodTerms: string[];
    excludeAddOnTerms: string[];
  };
  activityIntent: {
    activityTerms: string[];
    nightlifeTerms: string[];
    addOnTerms: string[];
  };
  sequencing: "restaurant_first" | "activity_first" | "same_place_ok" | "unknown";
};

const VERSION = "canonical-multistop-meal-addon-v1";
const BOROUGHS = ["queens", "brooklyn", "manhattan", "bronx", "staten island", "astoria"];
const MEAL_TERMS = ["steak", "seafood", "dinner", "lunch", "brunch", "breakfast", "restaurant", "food", "eat", "meal", "sushi", "tacos", "pasta"];
const DISH_TERMS = ["steak", "seafood", "sushi", "tacos", "pasta"];
const ACTIVITY_TERMS = ["hookah", "lounge", "nightlife", "bar", "club", "bowling", "arcade", "comedy", "movie", "rooftop", "dessert", "drinks", "activity", "things to do"];
const ADDON_TERMS = ["hookah", "lounge", "dessert", "drinks", "rooftop", "after dinner", "nightlife", "bar", "club"];

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
const has = (t: string, w: string) => t.includes(w);

export function parseSearchIntent(input: string, body: any = {}, _candidates: any[] = []): CanonicalSearchIntent {
  const text = norm(input || "");
  const locations = BOROUGHS.filter((b) => has(text, b));
  const borough = locations.find((b) => ["queens", "brooklyn", "manhattan", "bronx", "staten island"].includes(b));
  const hasMealTerm = MEAL_TERMS.some((term) => has(text, term));
  const hasHookah = has(text, "hookah");
  const hasLounge = has(text, "lounge");
  const hasDessert = has(text, "dessert");
  const hasActivity = ACTIVITY_TERMS.some((t) => has(text, t));
  const dishTerms = DISH_TERMS.filter((d) => has(text, d));
  const foodIntents = [...new Set([...(hasMealTerm ? ["dinner"] : []), ...dishTerms])];
  const activityIntents = [...new Set([...(hasHookah ? ["hookah"] : []), ...(hasLounge ? ["lounge"] : []), ...(hasDessert ? ["dessert"] : []), ...(has(text, "bowling") ? ["bowling"] : []), ...(has(text, "comedy") ? ["comedy"] : []), ...(has(text, "rooftop") ? ["rooftop"] : []), ...(has(text, "nightlife") ? ["nightlife"] : [])])];
  const isHookahOnly = hasHookah && !hasMealTerm;
  const wantsRestaurant = hasMealTerm || (!hasActivity && !isHookahOnly);
  const wantsActivity = hasActivity;
  const multi = wantsRestaurant && wantsActivity;
  const restaurantKeywords = [...new Set([...dishTerms, ...(has(text, "dinner") ? ["dinner"] : []), "restaurant", ...(dishTerms.includes("steak") ? ["steakhouse"] : [])])];
  const restaurantQuery = `${restaurantKeywords.join(" ")} restaurant ${locations.join(" ")}`.trim() || text;
  const activityQuery = `${activityIntents.join(" ")} activity ${locations.join(" ")}`.trim() || text;

  return {
    version: VERSION,
    originalQuery: input,
    normalizedInput: text,
    locationText: borough ? borough[0].toUpperCase() + borough.slice(1) : undefined,
    borough: borough ? borough[0].toUpperCase() + borough.slice(1) : undefined,
    outingMode: multi ? "multi_stop" : "single_stop",
    wantsRestaurant,
    wantsActivity,
    restaurantIntent: {
      required: wantsRestaurant,
      mealPrimary: hasMealTerm,
      cuisineTerms: [],
      dishTerms,
      restaurantKeywords,
      excludedAddonTerms: ADDON_TERMS,
    },
    activityIntent: {
      required: wantsActivity,
      activityTypes: activityIntents,
      addonTerms: hasHookah ? ["hookah"] : [],
      loungeTerms: ["hookah lounge", "lounge"],
    },
    hardFilters: { borough: borough ? borough[0].toUpperCase() + borough.slice(1) : undefined },
    cardPolicy: { forceCards: true, prohibitTextOnlyWhenCardsExist: true },

    rawInput: input,
    mode: multi ? "full_outing" : wantsRestaurant ? "restaurant_only" : wantsActivity ? "activity_only" : locations.length ? "location_lookup" : "off_topic",
    wantsFood: wantsRestaurant,
    wantsFullOuting: multi,
    foodIntents,
    primaryMealIntents: foodIntents,
    foodAddOnIntents: [],
    activityIntents,
    primaryActivityIntents: activityIntents,
    secondaryActivityIntents: [],
    vibes: [], requestedTags: [],
    locations,
    neighborhoods: [], boroughs: locations, cities: [],
    budget: { level: null, maxPrice: null, raw: null },
    distance: { maxMiles: body.maxMiles ?? null, userLat: body.lat ?? null, userLng: body.lng ?? null },
    multiIntentMode: multi,
    routing: {
      restaurantQuery,
      activityQuery,
      shouldSearchRestaurants: wantsRestaurant,
      shouldSearchActivities: wantsActivity,
      shouldForceRestaurantCards: wantsRestaurant,
      shouldForceActivityCards: wantsActivity,
      allowTextOnlyFallback: false,
    },
    confidence: { score: 0.85, reasons: ["canonical-intent-pipeline"] },
    explicitTerms: [...new Set([...foodIntents, ...activityIntents, ...locations])],
    primaryDomain: multi ? "mixed" : wantsRestaurant ? "restaurant" : "activity",
    requiresRestaurant: wantsRestaurant,
    requiresActivity: wantsActivity,
    isHookahOnly,
    isLoungeOnly: hasLounge && !hasMealTerm,
    isDessertOnly: hasDessert && !hasMealTerm,
    isMealPrimary: hasMealTerm,
  };
}

export function buildRestaurantSearchInput(intent: CanonicalSearchIntent) {
  return intent.routing.restaurantQuery;
}

export function buildActivitySearchInput(intent: CanonicalSearchIntent) {
  return intent.routing.activityQuery;
}

export function getSearchIntentVersion() { return VERSION; }
export function enrichIntentWithCandidateLocations(intent: CanonicalSearchIntent) { return intent; }
export function isFoodAddOnIntent(intent: string) { return intent === "dessert"; }
export function isLoungeActivityIntent(intent: string) { return ["hookah", "lounge", "nightlife"].includes(intent); }
export function hasPrimaryMealIntent(intent: CanonicalSearchIntent) { return intent.primaryMealIntents.length > 0; }
export function shouldSplitIntoRestaurantAndActivity(intent: CanonicalSearchIntent) { return intent.outingMode === "multi_stop"; }
