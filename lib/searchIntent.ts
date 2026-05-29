import { parseCanonicalIntent as parseCoreCanonicalIntent } from "./search/intent";
import { buildActivitySearchInput as buildCoreActivitySearchInput, buildRestaurantSearchInput as buildCoreRestaurantSearchInput } from "./search/queryBuilders";
import type { CanonicalSearchIntent as CoreCanonicalSearchIntent } from "./search/types";

export type CanonicalSearchIntent = Omit<CoreCanonicalSearchIntent, "restaurantIntent" | "activityIntent" | "borough" | "city" | "primaryDomain" | "cities"> & {
  version: string;
  originalQuery: string;
  normalizedInput: string;
  locationText?: string;
  borough?: string;
  city?: string;
  state?: string;
  outingMode: "single_stop" | "multi_stop";
  restaurantIntent: boolean | {
    required: boolean;
    mealPrimary: boolean;
    cuisineTerms: string[];
    dishTerms: string[];
    restaurantKeywords: string[];
    excludedAddonTerms: string[];
  };
  activityIntent: string[] | {
    required: boolean;
    activityTypes: string[];
    addonTerms: string[];
    loungeTerms: string[];
  };
  hardFilters: { borough?: string; city?: string; state?: string };
  cardPolicy: { forceCards: boolean; prohibitTextOnlyWhenCardsExist: boolean };
  rawInput: string;
  mode: "restaurant_only" | "activity_only" | "full_outing" | "location_lookup" | "off_topic";
  primaryMealIntents: string[];
  foodAddOnIntents: string[];
  primaryActivityIntents: string[];
  secondaryActivityIntents: string[];
  requestedTags: string[];
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

const VERSION = "canonical-search-v4-adapter";

function titleCase(value: string | null | undefined) {
  if (!value) return undefined;
  return value.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function legacyMode(intent: CoreCanonicalSearchIntent): CanonicalSearchIntent["mode"] {
  if (intent.isOffTopic) return "off_topic";
  if (intent.wantsRestaurant && intent.wantsActivity) return "full_outing";
  if (intent.wantsRestaurant) return "restaurant_only";
  if (intent.wantsActivity) return "activity_only";
  return "location_lookup";
}

export function parseSearchIntent(input: string, body: any = {}, _candidates: any[] = []): CanonicalSearchIntent {
  const core = parseCoreCanonicalIntent(input, body);
  core.restaurantSearchInput = buildCoreRestaurantSearchInput(core);
  core.activitySearchInput = buildCoreActivitySearchInput(core);

  const restaurantKeywords = [
    ...(core.specificMealFoodIntents.length ? core.specificMealFoodIntents : core.mealFoodIntents),
    ...core.cuisines,
    "restaurant",
  ].filter(Boolean);
  const activityTypes = core.activityIntents;
  const multi = core.wantsRestaurant && core.wantsActivity;

  return {
    ...core,
    version: VERSION,
    originalQuery: input,
    normalizedInput: core.normalizedQuery,
    locationText: titleCase(core.neighborhood || core.borough || core.city || core.geoIntent?.region),
    borough: titleCase(core.borough),
    city: titleCase(core.city),
    state: core.geoIntent?.state,
    outingMode: multi ? "multi_stop" : "single_stop",
    restaurantIntent: {
      required: core.needsRestaurant,
      mealPrimary: Boolean(core.mealFirst || core.mealFoodIntents.length),
      cuisineTerms: core.cuisines,
      dishTerms: core.specificMealFoodIntents,
      restaurantKeywords,
      excludedAddonTerms: ["hookah", "lounge", "dessert", "drinks", "rooftop", "after dinner", "nightlife", "bar", "club"],
    },
    activityIntent: {
      required: core.needsActivity,
      activityTypes,
      addonTerms: core.addOnIntent,
      loungeTerms: ["hookah lounge", "lounge"],
    },
    hardFilters: { borough: titleCase(core.borough), city: titleCase(core.city), state: core.geoIntent?.state },
    cardPolicy: { forceCards: true, prohibitTextOnlyWhenCardsExist: true },
    rawInput: input,
    mode: legacyMode(core),
    primaryMealIntents: core.mealFoodIntents,
    foodAddOnIntents: core.addOnFoodIntents,
    primaryActivityIntents: activityTypes,
    secondaryActivityIntents: core.addOnIntent.filter((term) => !activityTypes.includes(term)),
    requestedTags: [...core.vibes, ...(core.occasionIntents ?? [])],
    cities: core.cities ?? (core.city ? [core.city] : []),
    budget: { level: null, maxPrice: null, raw: null },
    distance: { maxMiles: body.maxMiles ?? null, userLat: body.lat ?? null, userLng: body.lng ?? null },
    multiIntentMode: multi,
    routing: {
      restaurantQuery: core.restaurantSearchInput,
      activityQuery: core.activitySearchInput,
      shouldSearchRestaurants: core.needsRestaurant,
      shouldSearchActivities: core.needsActivity,
      shouldForceRestaurantCards: core.needsRestaurant,
      shouldForceActivityCards: core.needsActivity,
      allowTextOnlyFallback: false,
    },
    confidence: { score: core.isOffTopic ? 0.2 : 0.9, reasons: ["canonical-search-v4"] },
    explicitTerms: [...new Set([...core.foodIntents, ...core.activityIntents, ...core.locations, ...core.vibes])],
    primaryDomain: core.primaryDomain ?? (multi ? "mixed" : core.wantsRestaurant ? "restaurant" : "activity"),
    requiresRestaurant: core.needsRestaurant,
    requiresActivity: core.needsActivity,
    isHookahOnly: core.hookahMode === "activity" && core.activityIntents.includes("hookah"),
    isLoungeOnly: core.hookahMode === "activity" && core.activityIntents.includes("lounge") && !core.activityIntents.includes("hookah"),
    isDessertOnly: core.addOnFoodIntents.includes("dessert") && !core.needsRestaurant,
    isMealPrimary: Boolean(core.mealFirst || core.mealFoodIntents.length),
  };
}

export function buildRestaurantSearchInput(intent: CanonicalSearchIntent) {
  return intent.routing?.restaurantQuery ?? buildCoreRestaurantSearchInput(intent as unknown as CoreCanonicalSearchIntent);
}

export function buildActivitySearchInput(intent: CanonicalSearchIntent) {
  return intent.routing?.activityQuery ?? buildCoreActivitySearchInput(intent as unknown as CoreCanonicalSearchIntent);
}

export function getSearchIntentVersion() { return VERSION; }
export function enrichIntentWithCandidateLocations(intent: CanonicalSearchIntent) { return intent; }
export function isFoodAddOnIntent(intent: string) { return ["dessert", "drinks", "cocktails", "coffee"].includes(intent); }
export function isLoungeActivityIntent(intent: string) { return ["hookah", "lounge", "nightlife"].includes(intent); }
export function hasPrimaryMealIntent(intent: CanonicalSearchIntent) { return intent.primaryMealIntents.length > 0 || Boolean(intent.mealFirst); }
export function shouldSplitIntoRestaurantAndActivity(intent: CanonicalSearchIntent) { return intent.outingMode === "multi_stop"; }
