"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSearchIntent = parseSearchIntent;
exports.buildRestaurantSearchInput = buildRestaurantSearchInput;
exports.buildActivitySearchInput = buildActivitySearchInput;
exports.getSearchIntentVersion = getSearchIntentVersion;
exports.enrichIntentWithCandidateLocations = enrichIntentWithCandidateLocations;
exports.isFoodAddOnIntent = isFoodAddOnIntent;
exports.isLoungeActivityIntent = isLoungeActivityIntent;
exports.hasPrimaryMealIntent = hasPrimaryMealIntent;
exports.shouldSplitIntoRestaurantAndActivity = shouldSplitIntoRestaurantAndActivity;
const intent_1 = require("./search/intent");
const queryBuilders_1 = require("./search/queryBuilders");
const VERSION = "canonical-search-v4-adapter";
function titleCase(value) {
    if (!value)
        return undefined;
    return value.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function legacyMode(intent) {
    if (intent.isOffTopic)
        return "off_topic";
    if (intent.wantsRestaurant && intent.wantsActivity)
        return "full_outing";
    if (intent.wantsRestaurant)
        return "restaurant_only";
    if (intent.wantsActivity)
        return "activity_only";
    return "location_lookup";
}
function parseSearchIntent(input, body = {}, _candidates = []) {
    const core = (0, intent_1.parseCanonicalIntent)(input, body);
    core.restaurantSearchInput = (0, queryBuilders_1.buildRestaurantSearchInput)(core);
    core.activitySearchInput = (0, queryBuilders_1.buildActivitySearchInput)(core);
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
function buildRestaurantSearchInput(intent) {
    return intent.routing?.restaurantQuery ?? (0, queryBuilders_1.buildRestaurantSearchInput)(intent);
}
function buildActivitySearchInput(intent) {
    return intent.routing?.activityQuery ?? (0, queryBuilders_1.buildActivitySearchInput)(intent);
}
function getSearchIntentVersion() { return VERSION; }
function enrichIntentWithCandidateLocations(intent) { return intent; }
function isFoodAddOnIntent(intent) { return ["dessert", "drinks", "cocktails", "coffee"].includes(intent); }
function isLoungeActivityIntent(intent) { return ["hookah", "lounge", "nightlife"].includes(intent); }
function hasPrimaryMealIntent(intent) { return intent.primaryMealIntents.length > 0 || Boolean(intent.mealFirst); }
function shouldSplitIntoRestaurantAndActivity(intent) { return intent.outingMode === "multi_stop"; }
