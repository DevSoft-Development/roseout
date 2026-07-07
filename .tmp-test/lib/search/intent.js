"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeParsedSearchIntent = normalizeParsedSearchIntent;
exports.parseCanonicalIntent = parseCanonicalIntent;
const taxonomy_1 = require("./taxonomy");
const cuisine_matching_1 = require("./cuisine-matching");
const geo_matching_1 = require("./geo-matching");
const BOROUGHS = ["brooklyn", "queens", "manhattan", "bronx", "staten island"];
const NYC_NEIGHBORHOODS = ["astoria", "long island city", "lic", "flushing", "jackson heights", "williamsburg", "harlem", "soho", "chelsea", "jamaica", "forest hills", "bushwick", "bed stuy"];
const MEAL_PRIMARY_TERMS = ["steak", "seafood", "dinner", "brunch", "lunch", "breakfast", "restaurant", "food", "date night dinner"];
const RESTAURANT_TERMS = [...taxonomy_1.GENERIC_MEAL_TERMS, "meal", "place to eat"];
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
const CONNECTOR_TERMS = new Set(["with", "and", "then", "near", "in", "after", "before", "plus", "followed", "by", "for", "to", "do", "things"]);
const MEAL_CONTEXT_TERMS = new Set(["dinner", "lunch", "breakfast", "brunch"]);
const RESTAURANT_VIBE_TERMS = new Set(["romantic", "casual", "upscale", "cozy", "date night", "rooftop", "outdoor dining", "terrace", "skyline", "views", "view", "city view", "scenic", "patio", "birthday", "group"]);
const ACTIVITY_ALIAS_TERMS = {
    bowling: ["bowling", "bowling alley", "lanes", "bowl"],
    karaoke: ["karaoke", "singing"],
    arcade: ["arcade", "games"],
    museum: ["museum", "gallery"],
    hookah: ["hookah", "shisha", "hookah lounge"],
    live_music: ["live music", "jazz", "music"],
    paint_and_sip: ["paint and sip", "sip and paint", "painting"],
};
const ATTRIBUTE_ALIAS_TERMS = {
    hookah: ["hookah", "shisha", "hookah lounge", "lounge"],
    live_music: ["live music", "music", "jazz", "dj", "live entertainment"],
    rooftop_views: ["rooftop", "skyline", "views", "terrace"],
    outdoor_seating: ["outdoor seating", "outdoor", "patio", "terrace"],
    games: ["games", "arcade", "board games", "bowling", "pool", "darts"],
    drinks: ["drinks", "cocktails", "bar", "lounge"],
    food: ["food", "restaurant", "dinner", "menu"],
    bottomless_mimosas: ["bottomless mimosas", "mimosas", "brunch", "bottomless"],
    dancing: ["dancing", "dance"],
    cafe: ["cafe", "coffee"],
};
const FOOD_ALIAS_TERMS = {
    steak: ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon", "sirloin", "tomahawk", "churrasco", "brazilian steakhouse"],
    sushi: ["sushi", "omakase", "sashimi", "japanese"],
    seafood: ["seafood", "fish", "crab", "lobster", "shrimp", "oyster"],
    brunch: ["brunch"],
    dinner: ["dinner"],
    rooftop: ["rooftop dinner", "rooftop dining", "rooftop restaurant"],
};
const norm = (v) => v.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const hit = (q, phrase) => q.includes(phrase);
const detectIntents = (query, pool) => pool.filter((x) => hit(query, x.replaceAll("_", " ")) || hit(query, x));
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
function uniq(values) {
    return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}
function extractStringTerms(value) {
    if (!value)
        return [];
    if (typeof value === "string")
        return [value];
    if (Array.isArray(value))
        return value.flatMap(extractStringTerms);
    if (typeof value === "object")
        return Object.values(value).flatMap(extractStringTerms);
    return [];
}
function splitTerm(value) {
    return norm(value).split(/\s+/).filter((term) => term && !CONNECTOR_TERMS.has(term));
}
function laneTermsFromText(query, aliases) {
    return Object.entries(aliases)
        .filter(([, terms]) => terms.some((term) => hit(query, norm(term))))
        .map(([canonical]) => canonical);
}
function bodyIntent(body) {
    return body?.searchIntent ?? body?.normalizedIntent ?? body?.llmIntent ?? body?.intent ?? null;
}
function pickBodyTerms(source, keys) {
    if (!source || typeof source !== "object")
        return [];
    return keys.flatMap((key) => extractStringTerms(source[key]));
}
function normalizeParsedSearchIntent(args) {
    const query = norm(args.rawQuery);
    const parsed = args.parsedIntent;
    const rawRestaurantTerms = pickBodyTerms(parsed, ["restaurantTerms", "foodTerms", "dishTerms", "restaurantKeywords", "mealTerms", "cuisineTerms"]);
    const rawActivityTerms = pickBodyTerms(parsed, ["activityTerms", "activityTypes", "addonTerms"]);
    const detectedFood = laneTermsFromText(query, FOOD_ALIAS_TERMS);
    const detectedActivity = laneTermsFromText(query, ACTIVITY_ALIAS_TERMS);
    const restaurantTerms = uniq([
        ...rawRestaurantTerms.flatMap(splitTerm).filter((term) => !detectedActivity.includes(term)),
        ...args.mealFoodIntents,
        ...args.specificMealFoodIntents,
        ...detectedFood,
    ]).filter((term) => !CONNECTOR_TERMS.has(term) && !taxonomy_1.ACTIVITY_INTENTS.includes(term));
    const cuisineTerms = uniq([
        ...args.cuisines,
        ...args.specificMealFoodIntents,
        ...detectedFood.filter((term) => !MEAL_CONTEXT_TERMS.has(term)),
    ]).filter((term) => !MEAL_CONTEXT_TERMS.has(term));
    const mealTerms = uniq([
        ...args.mealFoodIntents.filter((term) => MEAL_CONTEXT_TERMS.has(term)),
        ...detectedFood.filter((term) => MEAL_CONTEXT_TERMS.has(term)),
        ...rawRestaurantTerms.flatMap(splitTerm).filter((term) => MEAL_CONTEXT_TERMS.has(term)),
    ]);
    const activityTerms = uniq([
        ...rawActivityTerms.flatMap(splitTerm),
        ...args.activityIntents,
        ...detectedActivity,
    ]).filter((term) => !CONNECTOR_TERMS.has(term) && !taxonomy_1.SPECIFIC_MEAL_FOOD_INTENTS.includes(term) && !taxonomy_1.GENERIC_MEAL_TERMS.includes(term));
    const needsRestaurant = args.needsRestaurant || restaurantTerms.length > 0 || cuisineTerms.length > 0 || mealTerms.length > 0;
    const needsActivity = args.needsActivity || activityTerms.length > 0;
    const primaryDomain = needsRestaurant && needsActivity ? "mixed" : needsRestaurant ? "restaurant" : "activity";
    return {
        primaryDomain,
        wantsPairing: args.wantsPairing || (needsRestaurant && needsActivity),
        needsRestaurant,
        needsActivity,
        restaurantTerms: uniq([...restaurantTerms, ...mealTerms]),
        cuisineTerms,
        mealTerms,
        activityTerms,
        vibeTerms: uniq(args.vibes).filter((term) => RESTAURANT_VIBE_TERMS.has(term) || !restaurantTerms.includes(term)),
        geo: {
            raw: args.geoIntent?.raw ?? null,
            neighborhood: args.neighborhood ?? args.geoIntent?.neighborhood ?? null,
            borough: args.borough ?? args.geoIntent?.borough ?? null,
            city: args.city ?? args.geoIntent?.city ?? null,
            region: args.geoIntent?.region ?? null,
        },
    };
}
function includesConnectorBetween(query, leftTerms, rightTerms) {
    return leftTerms.some((left) => rightTerms.some((right) => {
        const leftIndex = query.indexOf(left);
        const rightIndex = query.indexOf(right);
        if (leftIndex < 0 || rightIndex < 0)
            return false;
        const between = leftIndex < rightIndex
            ? query.slice(leftIndex + left.length, rightIndex)
            : query.slice(rightIndex + right.length, leftIndex);
        return /\b(and|then|after|with|plus|followed by|before)\b/.test(between);
    }));
}
function matchedPhrases(query, phrases) {
    return phrases.filter((phrase) => new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`).test(query));
}
function detectCoLocationIntent(query) {
    const withoutNearMe = query.replace(/\bnear\s+me\b/g, " ");
    const coLocationTermsMatched = matchedPhrases(withoutNearMe, ["with", "has", "have", "that has", "that have", "serving", "serves", "offering", "offers", "including", "includes", "featuring", "features"]);
    const sequenceTermsMatched = matchedPhrases(withoutNearMe, ["followed by", "second stop", "afterwards", "after", "then", "next", "later", "before", "first"]);
    const proximityTermsMatched = matchedPhrases(withoutNearMe, ["within walking distance", "walking distance", "around the corner", "close to", "close by", "nearby", "near a", "near an", "near the", "near", "next to", "by"]);
    const sequenceDetected = sequenceTermsMatched.length > 0;
    const proximityDetected = proximityTermsMatched.length > 0;
    const sameVenuePreferred = coLocationTermsMatched.length > 0 && !sequenceDetected && !proximityDetected;
    return {
        sameVenuePreferred,
        sequenceDetected,
        proximityDetected,
        coLocationTermsMatched,
        sequenceTermsMatched,
        proximityTermsMatched,
        sameVenueReason: sameVenuePreferred ? "co-location language without sequencing/proximity language" : null,
    };
}
function extractSameVenueAttributeTerms(query) {
    const connector = /\b(?:with|has|have|that has|that have|serving|serves|offering|offers|including|includes|featuring|features)\b/;
    const parts = query.split(connector);
    const afterConnector = parts.length > 1 ? parts.slice(1).join(" ") : query;
    const withoutGeo = afterConnector.replace(/\b(?:in|near)\s+(?:manhattan|brooklyn|queens|bronx|staten island|new york|nyc|me)\b.*$/g, " ");
    return uniq([
        ...Object.values(ATTRIBUTE_ALIAS_TERMS).flatMap((aliases) => aliases.some((term) => hit(query, norm(term))) ? aliases : []),
        ...splitTerm(withoutGeo).filter((term) => !BOROUGHS.includes(term) && term !== "new" && term !== "york"),
    ]);
}
function parseCanonicalIntent(input, _body) {
    const normalizedQuery = norm(input || "");
    const coLocation = detectCoLocationIntent(normalizedQuery);
    const mealFoodIntents = detectIntents(normalizedQuery, taxonomy_1.MEAL_FOOD_INTENTS);
    const specificMealFoodIntents = detectIntents(normalizedQuery, taxonomy_1.SPECIFIC_MEAL_FOOD_INTENTS);
    const addOnFoodIntents = detectIntents(normalizedQuery, taxonomy_1.ADD_ON_FOOD_INTENTS);
    const activityIntents = [
        ...detectIntents(normalizedQuery, taxonomy_1.ACTIVITY_INTENTS.filter((x) => x !== "sip_and_paint")),
        ...(hit(normalizedQuery, "sip and paint") ? ["paint_and_sip"] : []),
    ];
    for (const [base, aliases] of Object.entries(taxonomy_1.INTENT_ALIASES)) {
        if (aliases.some((a) => hit(normalizedQuery, a))) {
            if (taxonomy_1.MEAL_FOOD_INTENTS.includes(base) && !mealFoodIntents.includes(base))
                mealFoodIntents.push(base);
            if (taxonomy_1.SPECIFIC_MEAL_FOOD_INTENTS.includes(base) && !specificMealFoodIntents.includes(base))
                specificMealFoodIntents.push(base);
            if (base === "paint_and_sip" && !activityIntents.includes(base))
                activityIntents.push(base);
            if (base === "hookah" && !activityIntents.includes(base))
                activityIntents.push(base);
        }
    }
    const rooftopNightlifeIntent = ["rooftop bar", "rooftop lounge", "rooftop activity", "drinks then rooftop", "rooftop after dinner", "rooftop lounge after dinner"].some((phrase) => hit(normalizedQuery, phrase));
    const rooftopMealIntent = !rooftopNightlifeIntent && (ROOFTOP_MEAL_PHRASES.some((phrase) => hit(normalizedQuery, phrase)) ||
        (hit(normalizedQuery, "rooftop") && ROOFTOP_MEAL_TERMS.some((term) => hit(normalizedQuery, term))));
    const explicitHookahRestaurant = ["hookah restaurant", "restaurant with hookah", "hookah with food", "hookah spot that serves food", "eat at hookah", "dinner with hookah"].some((p) => hit(normalizedQuery, p));
    const mealPrimaryHit = MEAL_PRIMARY_TERMS.some((p) => hit(normalizedQuery, p));
    const hasRealMeal = mealFoodIntents.length > 0 || mealPrimaryHit || RESTAURANT_TERMS.some((p) => hit(normalizedQuery, p));
    const hasHookah = activityIntents.includes("hookah");
    const hasLounge = activityIntents.includes("lounge");
    const hookahOrLoungeOnly = (hasHookah || hasLounge) && !hasRealMeal && !explicitHookahRestaurant;
    const hookahAsSamePlaceAddOn = (explicitHookahRestaurant || (coLocation.sameVenuePreferred && hasHookah)) && !coLocation.sequenceDetected && !coLocation.proximityDetected;
    const hookahAsSeparateActivity = (hasHookah || hasLounge) && !hookahAsSamePlaceAddOn;
    const dessertAsOutingStop = addOnFoodIntents.includes("dessert") && hasRealMeal && includesConnectorBetween(normalizedQuery, ["dinner", "restaurant", "food", "eat", "meal"], ["dessert"]);
    const thingsToDoActivity = hit(normalizedQuery, "things to do") || hit(normalizedQuery, "activities") || hit(normalizedQuery, "activity");
    if (dessertAsOutingStop && !activityIntents.includes("dessert"))
        activityIntents.push("dessert");
    if (thingsToDoActivity && !activityIntents.includes("activity"))
        activityIntents.push("activity");
    const wantsFood = mealFoodIntents.length > 0 || addOnFoodIntents.length > 0 || RESTAURANT_TERMS.some((p) => hit(normalizedQuery, p)) || explicitHookahRestaurant || mealPrimaryHit;
    const wantsActivity = activityIntents.some((intent) => !(intent === "rooftop" && rooftopMealIntent));
    const wantsFullOuting = !coLocation.sameVenuePreferred && ((wantsFood && wantsActivity && !hookahAsSamePlaceAddOn) || taxonomy_1.OUTING_PHRASES.some((p) => hit(normalizedQuery, p)));
    const geoIntent = (0, geo_matching_1.detectRequestedGeo)(normalizedQuery);
    const boroughs = uniq([...BOROUGHS.filter((b) => hit(normalizedQuery, b)), geoIntent?.borough]);
    const neighborhoods = uniq([...NYC_NEIGHBORHOODS.filter((n) => hit(normalizedQuery, n)), geoIntent?.neighborhood]);
    const city = geoIntent?.city ?? (hit(normalizedQuery, "new york") || hit(normalizedQuery, "nyc") ? "new york" : null);
    const cities = uniq([city, geoIntent?.region === "long_island" ? geoIntent.city ?? geoIntent.area : null]);
    const borough = boroughs[0] ?? null;
    const neighborhood = neighborhoods[0] ?? geoIntent?.area ?? null;
    const isLocationOnlySearch = (boroughs.length > 0 || Boolean(geoIntent)) &&
        !wantsFood &&
        !wantsActivity &&
        !["date", "outing", "nightlife"].some((p) => hit(normalizedQuery, p));
    const finalWantsFood = (wantsFood && !thingsToDoActivity) || isLocationOnlySearch;
    const finalWantsRestaurant = (wantsFood && !thingsToDoActivity) || isLocationOnlySearch;
    const finalWantsActivity = coLocation.sameVenuePreferred
        ? (!hasRealMeal && !finalWantsFood && wantsActivity && !isLocationOnlySearch)
        : (hookahOrLoungeOnly || (wantsActivity && !hookahAsSamePlaceAddOn && !isLocationOnlySearch));
    const requestedCuisines = (0, cuisine_matching_1.detectRequestedCuisines)(normalizedQuery);
    const requestedCategories = (0, cuisine_matching_1.detectRequestedRestaurantCategories)(normalizedQuery);
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
    const normalizedActivityIntents = uniq(activityIntents
        .map((v) => (v === "sip_and_paint" ? "paint_and_sip" : v))
        .filter((v) => !(v === "rooftop" && rooftopMealIntent)));
    const foodIntents = uniq([...normalizedMealFoodIntents, ...addOnFoodIntents, ...(hookahAsSamePlaceAddOn ? ["hookah"] : [])]);
    const addOnIntent = uniq([
        ...normalizedActivityIntents.filter((term) => ["hookah", "bowling", "paint_and_sip", "karaoke", "arcade", "lounge", "rooftop"].includes(term)),
        ...(hookahAsSamePlaceAddOn ? ["hookah"] : []),
    ]);
    const nonOffTopicSignals = finalWantsFood || finalWantsActivity || boroughs.length > 0 || Boolean(geoIntent) || occasionIntents.length > 0;
    const isOffTopic = !nonOffTopicSignals;
    const provisionalPrimaryDomain = finalWantsRestaurant && finalWantsActivity ? "mixed" : finalWantsRestaurant ? "restaurant" : "activity";
    const normalizedIntent = normalizeParsedSearchIntent({
        rawQuery: input,
        parsedIntent: bodyIntent(_body),
        primaryDomain: provisionalPrimaryDomain,
        wantsPairing: !coLocation.sameVenuePreferred && Boolean((finalWantsRestaurant || hasRealMeal) && (finalWantsActivity || hookahAsSeparateActivity) && !hookahAsSamePlaceAddOn),
        needsRestaurant: finalWantsRestaurant || hasRealMeal,
        needsActivity: finalWantsActivity || (!coLocation.sameVenuePreferred && hookahAsSeparateActivity),
        mealFoodIntents: isLocationOnlySearch ? [] : normalizedMealFoodIntents,
        specificMealFoodIntents: isLocationOnlySearch ? [] : uniq(specificMealFoodIntents),
        cuisines: isLocationOnlySearch ? [] : uniq([...requestedCuisines, ...normalizedMealFoodIntents.filter((term) => !taxonomy_1.GENERIC_MEAL_TERMS.includes(term))]),
        activityIntents: isLocationOnlySearch ? [] : normalizedActivityIntents,
        vibes,
        geoIntent,
        borough,
        neighborhood,
        city,
    });
    const attributeTerms = coLocation.sameVenuePreferred ? extractSameVenueAttributeTerms(normalizedQuery) : [];
    Object.assign(normalizedIntent, {
        ...coLocation,
        attributeTerms,
        restaurantTerms: uniq([...normalizedIntent.restaurantTerms, ...attributeTerms.filter((term) => !["activity"].includes(term))]),
        wantsPairing: coLocation.sameVenuePreferred ? false : normalizedIntent.wantsPairing,
        needsActivity: coLocation.sameVenuePreferred && normalizedIntent.needsRestaurant ? false : normalizedIntent.needsActivity,
        primaryDomain: coLocation.sameVenuePreferred && normalizedIntent.needsRestaurant ? "restaurant" : normalizedIntent.primaryDomain,
    });
    const primaryDomain = normalizedIntent.primaryDomain;
    return {
        rawQuery: input,
        normalizedQuery,
        foodIntent: isLocationOnlySearch ? [] : uniq([...normalizedMealFoodIntents, ...addOnFoodIntents]),
        activityIntent: isLocationOnlySearch ? [] : normalizedActivityIntents,
        locationIntent: uniq([...boroughs, ...neighborhoods, ...(geoIntent?.terms ?? []), ...(city ? [city] : [])]),
        borough,
        city,
        neighborhood,
        needsRestaurant: normalizedIntent.needsRestaurant,
        needsActivity: normalizedIntent.needsActivity,
        wantsPairing: normalizedIntent.wantsPairing,
        addOnIntent,
        wantsFood: finalWantsFood,
        wantsRestaurant: normalizedIntent.needsRestaurant,
        wantsActivity: normalizedIntent.needsActivity,
        wantsFullOuting: isLocationOnlySearch ? false : wantsFullOuting,
        foodIntents: isLocationOnlySearch ? [] : foodIntents,
        mealFoodIntents: isLocationOnlySearch ? [] : normalizedMealFoodIntents,
        specificMealFoodIntents: isLocationOnlySearch ? [] : uniq(specificMealFoodIntents),
        addOnFoodIntents: uniq(addOnFoodIntents),
        activityIntents: isLocationOnlySearch ? [] : normalizedActivityIntents,
        cuisines: isLocationOnlySearch ? [] : uniq([...requestedCuisines, ...normalizedMealFoodIntents.filter((term) => !taxonomy_1.GENERIC_MEAL_TERMS.includes(term))]),
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
        ...coLocation,
        normalizedIntent,
    };
}
