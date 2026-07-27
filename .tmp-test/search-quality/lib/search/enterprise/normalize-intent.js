"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESTAURANT_ALLOWED_SINGLE_WORDS = exports.ACTIVITY_ALLOWED_SINGLE_WORDS = exports.FINAL_TERM_STOPWORDS = exports.RELAXED_ACTIVITY_REQUIRED_TERMS = exports.HARD_NIGHTLIFE_ACTIVITY_TERMS = exports.uniq = void 0;
exports.normalizeIntentTerm = normalizeIntentTerm;
exports.hasNoClubIntent = hasNoClubIntent;
exports.hasRelaxedActivityAlternativeIntent = hasRelaxedActivityAlternativeIntent;
exports.hasNoClubOrQuietVenueIntent = hasNoClubOrQuietVenueIntent;
exports.hasRelaxedOrCasualActivityIntent = hasRelaxedOrCasualActivityIntent;
exports.cleanupRelaxedActivityTerms = cleanupRelaxedActivityTerms;
exports.relaxedActivityTermsRemoved = relaxedActivityTermsRemoved;
exports.cleanupRelaxedIntent = cleanupRelaxedIntent;
exports.normalizeFinalTerm = normalizeFinalTerm;
exports.finalCleanTermList = finalCleanTermList;
exports.isSportsWatchFoodSameVenueIntent = isSportsWatchFoodSameVenueIntent;
exports.detectPairingPreference = detectPairingPreference;
exports.deterministicIntentFromQuery = deterministicIntentFromQuery;
exports.normalizeIntent = normalizeIntent;
exports.mergeLlmIntentWithPreIntent = mergeLlmIntentWithPreIntent;
exports.restaurantSearchTerms = restaurantSearchTerms;
exports.broadRestaurantFallbackTerms = broadRestaurantFallbackTerms;
exports.isBroadGenericActivityIntent = isBroadGenericActivityIntent;
exports.genericActivityFallbackTerms = genericActivityFallbackTerms;
exports.activitySearchTerms = activitySearchTerms;
exports.restaurantSearchTermsOriginal = restaurantSearchTermsOriginal;
exports.activitySearchTermsOriginal = activitySearchTermsOriginal;
exports.hasRelaxedActivityIntent = hasRelaxedActivityIntent;
exports.hasSpecificRestaurantFoodOrCuisine = hasSpecificRestaurantFoodOrCuisine;
exports.pruneActivityRpcTerms = pruneActivityRpcTerms;
exports.pruneRelaxedActivityTerms = pruneRelaxedActivityTerms;
exports.hasSportsWatchIntent = hasSportsWatchIntent;
exports.cleanupSportsWatchActivityTerms = cleanupSportsWatchActivityTerms;
exports.sportsWatchTermsRemoved = sportsWatchTermsRemoved;
exports.cleanupSportsWatchIntentTerms = cleanupSportsWatchIntentTerms;
exports.pruneSportsWatchActivityTerms = pruneSportsWatchActivityTerms;
exports.activityRpcTerms = activityRpcTerms;
const distance_1 = require("./distance");
const geo_taxonomy_1 = require("./geo-taxonomy");
const taxonomy_1 = require("./taxonomy");
const uniq = (items) => Array.from(new Set(items.map((x) => x.toLowerCase().trim()).filter(Boolean)));
exports.uniq = uniq;
exports.HARD_NIGHTLIFE_ACTIVITY_TERMS = new Set([
    "nightlife",
    "rooftop lounge",
    "rooftop bar",
    "rooftop",
    "roof top",
    "club",
    "dance club",
    "nightclub",
    "dancing",
    "dance",
    "live dj",
    "dj",
    "speakeasy",
    "bar",
    "generic bar",
    "karaoke bar",
    "karaoke lounge",
    "hookah",
    "hookah lounge",
    "loud nightlife",
]);
exports.RELAXED_ACTIVITY_REQUIRED_TERMS = [
    "relaxed activity",
    "chill activity",
    "easy activity",
    "low key",
    "laid back",
    "casual activity",
    "board games",
    "museum",
    "art gallery",
    "cafe",
    "café",
    "dessert",
    "scenic walk",
    "park",
    "bowling",
    "mini golf",
    "billiards",
    "pool hall",
    "paint and sip",
    "low-key live music",
];
function normalizeIntentTerm(term) {
    return String(term || "")
        .toLowerCase()
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .trim()
        .replace(/\s+/g, " ");
}
function hasNoClubIntent(query) {
    return hasNoClubOrQuietVenueIntent(query);
}
function hasRelaxedActivityAlternativeIntent(query) {
    const q = normalizeFinalTerm(String(query ?? ""));
    return /\b(relaxed activity|quiet activity|chill activity|casual activity|easy activity|something fun|fun but not loud|not a club but still fun|activity no club)\b/.test(q);
}
function hasNoClubOrQuietVenueIntent(query) {
    const q = normalizeFinalTerm(String(query ?? ""));
    return /\b(no club|not a club|not a nightclub|no nightclub|no dancing|no dj|no live dj|not too loud|not loud|no loud music|quiet|quiet girls night|quiet bar|chill drinks|upscale lounge)\b/.test(q);
}
function hasRelaxedOrCasualActivityIntent(query) {
    return hasRelaxedActivityAlternativeIntent(query);
}
function cleanupRelaxedActivityTerms(terms, rawQuery) {
    const q = normalizeIntentTerm(rawQuery ?? "");
    const explicitlyRequested = (term) => {
        const normalized = normalizeIntentTerm(term);
        if (!normalized)
            return false;
        return new RegExp(`(^|[^a-z0-9])${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}([^a-z0-9]|$)`).test(q);
    };
    const normalizedTerms = terms
        .map(normalizeIntentTerm)
        .filter((term) => term && (!exports.HARD_NIGHTLIFE_ACTIVITY_TERMS.has(term) || (!hasNoClubOrQuietVenueIntent(rawQuery) && explicitlyRequested(term))));
    if (!hasRelaxedActivityAlternativeIntent(rawQuery ?? "")) {
        return (0, exports.uniq)(normalizedTerms);
    }
    return (0, exports.uniq)([
        ...normalizedTerms,
        ...exports.RELAXED_ACTIVITY_REQUIRED_TERMS,
    ]);
}
function relaxedActivityTermsRemoved(terms) {
    return (0, exports.uniq)(terms
        .map(normalizeIntentTerm)
        .filter((term) => term && exports.HARD_NIGHTLIFE_ACTIVITY_TERMS.has(term)));
}
const relaxedRemovedActivityTermsByIntent = new WeakMap();
function cleanupRelaxedIntent(intent) {
    if (!hasRelaxedActivityIntent(intent.rawQuery))
        return intent;
    const activityIntent = intent.activityIntent ?? (0, taxonomy_1.createEmptyActivityIntent)();
    const removedTerms = relaxedActivityTermsRemoved(activityIntent.activityTerms ?? []);
    const cleaned = {
        ...intent,
        activityIntent: {
            ...activityIntent,
            activityTerms: (0, exports.uniq)([
                ...cleanupRelaxedActivityTerms(activityIntent.activityTerms ?? [], intent.rawQuery),
                ...(hasNoClubOrQuietVenueIntent(intent.rawQuery) ? venueTermsFromRawQuery(intent.rawQuery) : []),
            ]),
            negativeTerms: (0, exports.uniq)([
                ...(activityIntent.negativeTerms ?? []).map(normalizeIntentTerm),
                ...(hasNoClubOrQuietVenueIntent(intent.rawQuery)
                    ? [
                        "club",
                        "clubs",
                        "dance club",
                        "nightclub",
                        "dancing",
                        "live dj",
                        "dj",
                        "loud music",
                    ]
                    : []),
            ]),
        },
    };
    relaxedRemovedActivityTermsByIntent.set(cleaned, removedTerms);
    return cleaned;
}
exports.FINAL_TERM_STOPWORDS = new Set([
    "and",
    "with",
    "to",
    "do",
    "the",
    "a",
    "an",
    "for",
    "in",
    "near",
    "nearby",
    "after",
    "before",
    "then",
    "at",
    "but",
    "not",
    "or",
    "low",
    "key",
    "laid",
    "back",
    "mini",
    "paint",
    "sip",
    "putt",
    "live",
    "big",
    "good",
    "best",
    "spot",
    "idea",
    "things",
    "party",
    "game",
    "day",
    "night",
    "date",
    "screen",
    "viewing",
    "open",
    "mic",
    "house",
    "mignon",
    "prime",
    "rib",
    "brazilian",
    "raw",
    "tex",
    "mex",
    "fried",
    "outdoor",
    "scenic",
    "dining",
    "center",
    "cultural",
    "art",
    "alley",
    "lanes",
    "range",
    "driving",
    "cages",
    "rock",
    "ice",
    "roller",
    "sport",
    "sports",
    "dance",
    "dj",
    "show",
    "off",
    "broadway",
    "march",
    "madness",
]);
exports.ACTIVITY_ALLOWED_SINGLE_WORDS = new Set([
    "bar",
    "pub",
    "tavern",
    "karaoke",
    "comedy",
    "museum",
    "gallery",
    "arcade",
    "bowling",
    "billiards",
    "pool",
    "hookah",
    "shisha",
    "jazz",
    "rooftop",
    "cocktails",
    "drinks",
    "speakeasy",
    "lounge",
    "activity",
    "games",
    "cafe",
    "dessert",
    "wine",
    "tv",
    "tvs",
    "screens",
    "music",
    "views",
    "terrace",
    "skyline",
    "basketball",
    "football",
    "baseball",
    "hockey",
    "quiet",
    "romantic",
    "fun",
    "social",
    "cozy",
    "intimate",
    "club",
    "nightclub",
    "dancing",
    "dj",
    "entertainment",
    "experience",
    "theater",
    "theatre",
    "exhibit",
    "exhibition",
    "park",
]);
exports.RESTAURANT_ALLOWED_SINGLE_WORDS = new Set([
    "dinner",
    "brunch",
    "lunch",
    "breakfast",
    "restaurant",
    "steak",
    "steakhouse",
    "ribeye",
    "porterhouse",
    "filet",
    "sirloin",
    "tomahawk",
    "churrasco",
    "seafood",
    "sushi",
    "japanese",
    "dominican",
    "mangu",
    "mangú",
    "mofongo",
    "pernil",
    "tostones",
    "latin",
    "caribbean",
    "mexican",
    "italian",
    "thai",
    "american",
    "ramen",
    "tacos",
    "taco",
    "pizza",
    "pasta",
    "lobster",
    "crab",
    "shrimp",
    "oyster",
    "oysters",
    "chicken",
    "wings",
    "fried chicken",
    "hot chicken",
    "romantic",
    "cozy",
    "intimate",
    "fun",
    "social",
    "casual",
    "birthday",
    "anniversary",
    "views",
    "rooftop",
    "terrace",
    "skyline",
]);
function normalizeFinalTerm(term) {
    return normalizeIntentTerm(term);
}
function isPhrase(term) {
    return normalizeFinalTerm(term).includes(" ");
}
function finalCleanTermList(terms, allowedSingles, options) {
    const normalized = terms.map(normalizeFinalTerm).filter(Boolean);
    return (0, exports.uniq)(normalized.filter((term) => {
        if (!term)
            return false;
        if (isPhrase(term))
            return true;
        if (exports.FINAL_TERM_STOPWORDS.has(term))
            return false;
        if (options?.dropSingleTeamTokens && options.teamTokens?.has(term)) {
            return false;
        }
        if (allowedSingles.has(term))
            return true;
        return false;
    }));
}
function hasSameLocationComboLanguage(query) {
    return (0, taxonomy_1.hasSameLocationFoodFeatureIntent)(query);
}
function classifyPublicSearchMode(query, intent) {
    const q = normalizeIntentTerm(query);
    const mealIntent = intent.needsRestaurant || (0, taxonomy_1.detectMealTerms)(q).length > 0 || (0, taxonomy_1.detectFoodTerms)(q).length > 0 || /\b(restaurant|restaurants|dining|food|eat|steakhouse)\b/.test(q);
    const activityIntent = intent.needsActivity || stripDistanceTerms((0, taxonomy_1.detectActivityTerms)(q)).length > 0 || /\b(hookah|shisha|lounge|bar|rooftop drinks?|live music|karaoke|bowling|theatre|theater)\b/.test(q);
    const twoStop = (0, taxonomy_1.hasExplicitTwoStopLanguage)(q) || (0, taxonomy_1.hasTrueSequenceConnector)(q) || (0, taxonomy_1.hasTrueProximityPairingConnector)(q);
    if (mealIntent && activityIntent && twoStop)
        return "paired_outing";
    if (mealIntent &&
        activityIntent &&
        /\b(bowling|museum|arcade|comedy|theater|theatre|escape room)\b/.test(q) &&
        /\b(with|and|after|then|before|nearby|walking distance|close by|near each other)\b/.test(q) &&
        !/\b(one place|same place|inside|all in one)\b/.test(q))
        return "paired_outing";
    if (mealIntent &&
        intent.needsActivity !== true &&
        /\b(dinner|restaurant|dining|brunch|lunch)\b/.test(q) &&
        /\b(drinks?|cocktails?|bar)\b/.test(q) &&
        !/\b(rooftop|hookah|karaoke|bowling|museum|arcade|comedy|after|then|nearby|walking distance)\b/.test(q))
        return "restaurant_only";
    if (mealIntent && activityIntent && hasSameLocationComboLanguage(q))
        return "same_location_combo";
    if (mealIntent && !activityIntent)
        return "restaurant_only";
    if (!mealIntent && activityIntent)
        return "activity_only";
    return mealIntent ? "restaurant_only" : activityIntent ? "activity_only" : "restaurant_only";
}
function applyPublicSearchMode(intent) {
    const mode = classifyPublicSearchMode(intent.rawQuery, intent);
    if (mode === "same_location_combo") {
        return {
            ...intent,
            searchType: "same_location_combo",
            primaryDomain: "restaurant",
            needsRestaurant: true,
            needsActivity: false,
            wantsPairing: false,
            normalizedIntent: "same_location_combo",
            pairingIntent: "same_location",
            pairRequested: false,
            sameVenuePreferred: true,
            fallbackPairAllowed: false,
            sameLocationRequired: true,
            pairingPreference: resetPairingPreference(),
        };
    }
    if (mode === "paired_outing") {
        return {
            ...intent,
            searchType: "mixed_outing",
            primaryDomain: "mixed",
            needsRestaurant: true,
            needsActivity: true,
            wantsPairing: true,
            normalizedIntent: "paired_outing",
            pairingIntent: "nearby_pair",
            pairRequested: true,
            sameVenuePreferred: false,
            fallbackPairAllowed: false,
            sameLocationRequired: false,
            pairingPreference: detectPairingPreference(intent.rawQuery, true),
        };
    }
    return {
        ...intent,
        normalizedIntent: mode,
        pairingIntent: "auto",
        pairRequested: false,
        sameVenuePreferred: intent.sameVenuePreferred === true,
        fallbackPairAllowed: false,
    };
}
function isActivityVenueOnlyQuery(query) {
    const q = String(query || "").toLowerCase();
    const hasActivityVenue = /\b(cocktail bar|wine bar|rooftop bar|rooftop lounge|sports bar|sports lounge|sport lounge|hookah bar|karaoke bar|comedy club|jazz club|lounge|speakeasy|bar with tv|bar with tvs|bar with screens|quiet lounge|upscale lounge)\b/.test(q);
    const hasExplicitMeal = /\b(dinner|brunch|lunch|breakfast|restaurant|eat|food before|food after|steak|seafood|sushi|mexican|italian)\b/.test(q);
    const hasVibeOnlyTrigger = /\b(date night|romantic|vibes|girls night|girls' night|first date|no loud music|quiet|not too loud)\b/.test(q);
    return hasActivityVenue && !hasExplicitMeal && (hasVibeOnlyTrigger || /\bspeakeasy\b/.test(q));
}
function shouldForceActivityOnlyVenue(rawQuery) { return isActivityVenueOnlyQuery(rawQuery); }
function resetPairingPreference() { return { requiresPairing: false, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false }; }
function isSportsWatchFoodSameVenueIntent(query, terms = []) {
    const q = normalizeIntentTerm(`${String(query ?? "")} ${terms.join(" ")}`);
    const hasFood = /\b(wings|chicken wings|bar food|burgers?|food|dinner|eat)\b/.test(q);
    const hasSportsWatch = /\b(knicks|basketball|game|watch|tvs?|screens?|sports bar|bar and grill|game day|watch party|live sports|sports viewing)\b/.test(q);
    const hasSamePlaceOrAntiPair = /\b(not (?:a )?restaurant plus (?:a )?separate activity|not separate|all at the same place|all in one place|same place|one place|not just (?:a )?lounge|not just (?:a )?nightlife spot|in one place)\b/.test(q);
    return hasFood && hasSportsWatch && (hasSamePlaceOrAntiPair || /\b(sports bar|bar and grill|wings?[^.?!]{0,80}(?:watch|tvs?|screens?|game)|(?:watch|tvs?|screens?|game)[^.?!]{0,80}wings?)\b/.test(q));
}
function hasSameLocationSportsWatchFoodIntent(query) {
    return isSportsWatchFoodSameVenueIntent(query);
}
function cuisineTermsFromSingleVenueFoodTerms(foodTerms) {
    return (0, exports.uniq)(foodTerms.filter((term) => /^(mexican|italian|thai|jamaican|caribbean|vegan|vegetarian|halal|seafood|steak|sushi|ramen|bbq|soul food|american)$/.test(term)));
}
function createSingleVenueWithSearchIntent(query) {
    const singleVenue = (0, taxonomy_1.detectSingleVenueWithIntent)(query);
    if (!singleVenue.matched)
        return null;
    const geo = (0, geo_taxonomy_1.detectGeoIntent)(query);
    const meals = (0, taxonomy_1.detectMealTerms)(query);
    const categoryTerms = (0, exports.uniq)(singleVenue.venueTerms);
    const foodTerms = (0, exports.uniq)(singleVenue.foodTerms);
    const featureTerms = (0, exports.uniq)([
        ...singleVenue.featureTerms,
        ...(foodTerms.some((term) => /wings|chicken wings/.test(term)) && categoryTerms.some((term) => /bar|pub|sports bar/.test(term))
            ? ["bar food"]
            : []),
    ]);
    return {
        rawQuery: query,
        searchType: "same_location_combo",
        primaryDomain: "mixed",
        needsRestaurant: true,
        needsActivity: true,
        wantsPairing: false,
        sameLocationRequired: true,
        normalizedIntent: "same_location_combo",
        pairingPreference: resetPairingPreference(),
        restaurantIntent: {
            ...(0, taxonomy_1.createEmptyRestaurantIntent)(),
            mealTerms: (0, exports.uniq)(meals),
            foodTerms,
            cuisineTerms: cuisineTermsFromSingleVenueFoodTerms(foodTerms),
            categoryTerms,
            featureTerms,
        },
        activityIntent: {
            ...(0, taxonomy_1.createEmptyActivityIntent)(),
            activityTerms: featureTerms.filter((term) => /hookah|live music|music|karaoke|rooftop|lounge|drinks|cocktails|bar/.test(term)),
            featureTerms,
        },
        geo,
        occasion: null,
        partySize: null,
        timeContext: meals[0] ?? null,
        budget: null,
        vibe: [],
        strictness: "high",
    };
}
function createSportsWatchFoodSameVenueIntent(query) {
    const geo = (0, geo_taxonomy_1.detectGeoIntent)(query);
    const meals = (0, taxonomy_1.detectMealTerms)(query);
    return {
        rawQuery: query,
        searchType: "same_location_combo",
        primaryDomain: "restaurant",
        needsRestaurant: true,
        needsActivity: false,
        wantsPairing: false,
        sameLocationRequired: true,
        sameVenuePreferred: true,
        fallbackPairAllowed: false,
        normalizedIntent: "same_location_combo",
        pairingIntent: "same_location",
        pairRequested: false,
        restaurantIntent: {
            ...(0, taxonomy_1.createEmptyRestaurantIntent)(),
            mealTerms: (0, exports.uniq)([...meals, "dinner"]),
            foodTerms: ["wings", "chicken wings", "bar food"],
            cuisineTerms: ["american"],
            categoryTerms: ["sports bar", "bar and grill", "pub", "tavern"],
            featureTerms: ["game watch", "tv", "tvs", "screens", "basketball", "knicks game", "live sports"],
            negativeTerms: ["cigar lounge", "hookah", "cocktail lounge", "generic lounge", "nightlife"],
        },
        activityIntent: (0, taxonomy_1.createEmptyActivityIntent)(),
        pairingPreference: resetPairingPreference(),
        geo,
        occasion: null,
        partySize: null,
        timeContext: meals[0] ?? "dinner",
        budget: null,
        vibe: [],
        strictness: "high",
        confidence: 0.92,
    };
}
function venueTermsFromRawQuery(rawQuery) {
    const q = normalizeFinalTerm(rawQuery);
    const terms = [];
    if (/\bcocktail|cocktails\b/.test(q))
        terms.push("cocktail bar", "cocktails", "bar", "lounge");
    if (/\bwine bar\b/.test(q))
        terms.push("wine bar", "wine", "bar", "lounge");
    if (/\bquiet\b/.test(q))
        terms.push("quiet");
    if (/\brooftop\b/.test(q))
        terms.push("rooftop bar", "rooftop lounge", "rooftop drinks", "rooftop cocktails", "terrace bar", "terrace lounge", "skyline bar", "skyline lounge", "views", "outdoor bar", "rooftop", "terrace", "skyline", "bar", "lounge");
    if (/\bdrinks?\b/.test(q))
        terms.push("drinks", "cocktails", "bar", "lounge");
    if (/\bspeakeasy\b/.test(q))
        terms.push("speakeasy", "cocktail bar", "cocktails", "bar", "lounge");
    if (/\bromantic|vibes|date night\b/.test(q))
        terms.push("romantic");
    return terms;
}
function applyForceActivityOnlyVenue(intent) {
    if (!shouldForceActivityOnlyVenue(intent.rawQuery))
        return intent;
    const activityIntent = intent.activityIntent ?? (0, taxonomy_1.createEmptyActivityIntent)();
    return {
        ...intent,
        searchType: "activity",
        primaryDomain: "activity",
        needsRestaurant: false,
        needsActivity: true,
        wantsPairing: false,
        restaurantIntent: (0, taxonomy_1.createEmptyRestaurantIntent)(),
        activityIntent: {
            ...activityIntent,
            activityTerms: (0, exports.uniq)([...(activityIntent.activityTerms ?? []), ...venueTermsFromRawQuery(intent.rawQuery)]),
        },
        pairingPreference: resetPairingPreference(),
    };
}
function broadOutingHasActivityFollowup(query) {
    const q = String(query || "").toLowerCase();
    return /\b(and|after|afterward|afterwards|then|plus|with)\b[^.?!]{0,80}\b(activity|activities|things to do|something fun|drinks|cocktails|bar|lounge|karaoke|comedy|bowling|arcade|museum)\b/i.test(q);
}
function shouldProtectBroadOccasionMixedIntent(query, explicitSearchLane) {
    return (explicitSearchLane !== "restaurant" &&
        explicitSearchLane !== "activity" &&
        (0, taxonomy_1.hasBroadOutingOccasionLanguage)(query) &&
        !(0, taxonomy_1.hasActivityOnlyLanguage)(query) &&
        (!(0, taxonomy_1.hasRestaurantOnlyLanguage)(query) || broadOutingHasActivityFollowup(query)));
}
function broadOccasionRestaurantVibes(occasion) {
    return /date|couples|anniversary/i.test(occasion)
        ? ["romantic", "cozy", "intimate"]
        : ["fun", "social"];
}
function broadOccasionActivityVibes(occasion) {
    return /date|couples|anniversary/i.test(occasion)
        ? ["date night", "romantic", "fun"]
        : ["fun", "social", "night out"];
}
function protectBroadOccasionMixedIntent(intent, explicitSearchLane) {
    if (!shouldProtectBroadOccasionMixedIntent(intent.rawQuery, explicitSearchLane))
        return intent;
    const detectedOccasion = (0, taxonomy_1.detectBroadOutingOccasion)(intent.rawQuery) ?? "night out";
    const restaurantIntent = intent.restaurantIntent ?? (0, taxonomy_1.createEmptyRestaurantIntent)();
    const activityIntent = intent.activityIntent ?? (0, taxonomy_1.createEmptyActivityIntent)();
    return {
        ...intent,
        searchType: "mixed_outing",
        primaryDomain: "mixed",
        needsRestaurant: true,
        needsActivity: true,
        wantsPairing: true,
        strictness: "medium",
        occasion: intent.occasion ?? detectedOccasion,
        timeContext: intent.timeContext ?? detectedOccasion,
        restaurantIntent: {
            ...restaurantIntent,
            mealTerms: (0, exports.uniq)([
                ...(restaurantIntent.mealTerms ?? []),
                detectedOccasion,
                "dinner",
            ]),
            vibeTerms: (0, exports.uniq)([
                ...(restaurantIntent.vibeTerms ?? []),
                ...broadOccasionRestaurantVibes(detectedOccasion),
            ]),
        },
        activityIntent: {
            ...activityIntent,
            activityTerms: (0, exports.uniq)([
                ...(activityIntent.activityTerms ?? []),
                "activity",
                "things to do",
            ]),
            vibeTerms: (0, exports.uniq)([
                ...(activityIntent.vibeTerms ?? []),
                ...broadOccasionActivityVibes(detectedOccasion),
            ]),
        },
        pairingPreference: {
            ...(intent.pairingPreference ?? resetPairingPreference()),
            distanceMode: intent.pairingPreference?.requiresPairing === true
                ? (intent.pairingPreference.distanceMode ?? "any")
                : "nearby",
            requiresPairing: true,
            requireWalkablePair: intent.pairingPreference?.requireWalkablePair ?? false,
            maxPairDistanceMiles: intent.pairingPreference?.maxPairDistanceMiles ?? 8,
            maxPairWalkingMinutes: intent.pairingPreference?.maxPairWalkingMinutes ?? null,
        },
    };
}
function finalDomainCleanup(intent) {
    if (intent.searchType === "activity_pair")
        return { ...intent, primaryDomain: "activity", needsRestaurant: false, needsActivity: true, wantsPairing: true, restaurantIntent: (0, taxonomy_1.createEmptyRestaurantIntent)() };
    if (!intent.needsActivity || intent.searchType === "restaurant")
        return { ...intent, searchType: "restaurant", primaryDomain: "restaurant", needsActivity: false, needsRestaurant: true, activityIntent: (0, taxonomy_1.createEmptyActivityIntent)(), wantsPairing: false, pairingPreference: resetPairingPreference() };
    if (!intent.needsRestaurant || intent.searchType === "activity")
        return { ...intent, searchType: "activity", primaryDomain: "activity", needsRestaurant: false, needsActivity: true, restaurantIntent: (0, taxonomy_1.createEmptyRestaurantIntent)(), wantsPairing: false, pairingPreference: resetPairingPreference() };
    return intent;
}
function finalCleanNegativeTerms(terms) {
    const allowedNegativeSingles = new Set([
        "club",
        "clubs",
        "nightclub",
        "nightclubs",
        "dancing",
        "dj",
        "speakeasy",
        "nightlife",
    ]);
    return (0, exports.uniq)(terms
        .map(normalizeFinalTerm)
        .filter((term) => term && (term.includes(" ") || allowedNegativeSingles.has(term))));
}
function finalCleanIntentTerms(intent) {
    const activityIntent = intent.activityIntent ?? (0, taxonomy_1.createEmptyActivityIntent)();
    const restaurantIntent = intent.restaurantIntent ?? (0, taxonomy_1.createEmptyRestaurantIntent)();
    const cleanedIntent = {
        ...intent,
        activityIntent: {
            ...activityIntent,
            activityTerms: finalCleanTermList(activityIntent.activityTerms ?? [], exports.ACTIVITY_ALLOWED_SINGLE_WORDS),
            categoryTerms: finalCleanTermList(activityIntent.categoryTerms ?? [], exports.ACTIVITY_ALLOWED_SINGLE_WORDS),
            featureTerms: finalCleanTermList(activityIntent.featureTerms ?? [], exports.ACTIVITY_ALLOWED_SINGLE_WORDS),
            vibeTerms: finalCleanTermList(activityIntent.vibeTerms ?? [], exports.ACTIVITY_ALLOWED_SINGLE_WORDS),
            negativeTerms: finalCleanNegativeTerms(activityIntent.negativeTerms ?? []),
        },
        restaurantIntent: {
            ...restaurantIntent,
            mealTerms: finalCleanTermList(restaurantIntent.mealTerms ?? [], exports.RESTAURANT_ALLOWED_SINGLE_WORDS),
            foodTerms: finalCleanTermList(restaurantIntent.foodTerms ?? [], exports.RESTAURANT_ALLOWED_SINGLE_WORDS),
            cuisineTerms: finalCleanTermList(restaurantIntent.cuisineTerms ?? [], exports.RESTAURANT_ALLOWED_SINGLE_WORDS),
            categoryTerms: finalCleanTermList(restaurantIntent.categoryTerms ?? [], exports.RESTAURANT_ALLOWED_SINGLE_WORDS),
            vibeTerms: finalCleanTermList(restaurantIntent.vibeTerms ?? [], exports.RESTAURANT_ALLOWED_SINGLE_WORDS),
            featureTerms: finalCleanTermList(restaurantIntent.featureTerms ?? [], exports.RESTAURANT_ALLOWED_SINGLE_WORDS),
            negativeTerms: finalCleanNegativeTerms(restaurantIntent.negativeTerms ?? []),
        },
    };
    const sportsRemoved = sportsWatchRemovedActivityTermsByIntent.get(intent);
    if (sportsRemoved)
        sportsWatchRemovedActivityTermsByIntent.set(cleanedIntent, sportsRemoved);
    const relaxedRemoved = relaxedRemovedActivityTermsByIntent.get(intent);
    if (relaxedRemoved)
        relaxedRemovedActivityTermsByIntent.set(cleanedIntent, relaxedRemoved);
    return cleanedIntent;
}
const phrase = (query, text) => new RegExp(`(^|[^a-z0-9])${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(query);
const DISTANCE_CONSTRAINT_TERMS = [
    "walking distance",
    "walkable",
    "walking",
    "short walk",
    "quick walk",
    "around the corner",
    "nearby",
    "close by",
    "close together",
    "near each other",
    "same block",
    "same area",
    "same neighborhood",
    "in the area",
    "within walking distance",
    "can walk to",
    "no driving",
    "without driving",
];
const RESTAURANT_SEARCH_TERM_BLOCKLIST = new Set([
    "activity",
    "activities",
    "things to do",
    "experience",
    "entertainment",
    "theater",
    "theatre",
    "movie theater",
    "cinema",
    "museum",
    "gallery",
    "park",
    "bowling",
    "bowling alley",
    "arcade",
    "escape room",
    "karaoke",
    "hookah",
    ...taxonomy_1.PLACE_OF_WORSHIP_TERMS,
].map((x) => x.toLowerCase()));
const ACTIVITY_SEARCH_TERM_BLOCKLIST = new Set([
    "dinner",
    "birthday dinner",
    "restaurant",
    "restaurants",
    "dining",
    "eatery",
    "brunch",
    "lunch",
    "breakfast",
].map((x) => x.toLowerCase()));
const FEATURE_ONLY_FOOD_TERMS = new Set([
    "rooftop",
    "roof top",
    "terrace",
    "patio",
    "outdoor dining",
    "skyline",
    "city views",
    "scenic views",
    "view",
    "roof deck",
    "lounge",
]);
const ROOFTOP_FEATURE_TERMS = new Set([
    "rooftop",
    "roof top",
    "terrace",
    "patio",
    "outdoor dining",
    "skyline",
    "city views",
    "scenic views",
    "view",
    "roof deck",
]);
const CONNECTOR_TERMS = [
    "with",
    "and",
    "after",
    "before",
    "then",
    "plus",
    "near",
    "nearby",
    "walking distance",
    "within walking distance",
    "or",
];
const SHORT_WALKING_LIMIT_MINUTES = 15;
const NEARBY_WALKING_LIMIT_MINUTES = 30;
function clampWalkingMinutes(minutes) {
    return Math.max(1, Math.min(minutes, distance_1.MAX_WALKING_DISTANCE_MINUTES));
}
function detectExplicitWalkingMinutes(query) {
    const patterns = [
        /\b(\d{1,3})\s*(?:-| )?\s*(?:minute|minutes|min|mins)\s+(?:walk|walking)\b/i,
        /\b(?:within|under|less than|no more than|up to|max|maximum)\s+(\d{1,3})\s*(?:minute|minutes|min|mins)\b.*\b(?:walk|walking)\b/i,
        /\b(?:walk|walking)\b.*\b(\d{1,3})\s*(?:minute|minutes|min|mins)\b/i,
    ];
    for (const pattern of patterns) {
        const match = query.match(pattern);
        const minutes = match ? Number(match[1]) : null;
        if (minutes && Number.isFinite(minutes)) {
            return clampWalkingMinutes(minutes);
        }
    }
    return null;
}
function walkingPairingPreference(minutes) {
    const cappedMinutes = clampWalkingMinutes(minutes);
    return {
        requiresPairing: true,
        distanceMode: "walking",
        maxPairDistanceMiles: Math.max(0.1, (0, distance_1.walkingMinutesToMiles)(cappedMinutes)),
        maxPairWalkingMinutes: cappedMinutes,
        requireWalkablePair: true,
    };
}
function stripCrossTerms(terms, forbidden) {
    const f = new Set(forbidden.map((x) => x.toLowerCase()));
    return terms.filter((t) => !f.has(t.toLowerCase()));
}
function stripDistanceTerms(terms) {
    const blocked = new Set(DISTANCE_CONSTRAINT_TERMS);
    return terms.filter((t) => !blocked.has(t.toLowerCase()));
}
function stripBlockedTerms(terms, blocked) {
    return terms.filter((term) => !blocked.has(term.toLowerCase()));
}
function stripRooftopFeatureTerms(terms) {
    return terms.filter((term) => !ROOFTOP_FEATURE_TERMS.has(term.toLowerCase()));
}
function activityForbiddenRestaurantTerms() {
    const allowedActivityTerms = new Set([
        "drinks",
        "cocktails",
        "cocktail bar",
        "wine bar",
        "bar",
        "lounge",
    ]);
    return [...taxonomy_1.FOOD_TERMS, ...taxonomy_1.MEAL_TERMS].filter((term) => !allowedActivityTerms.has(term.toLowerCase()));
}
function rooftopDrinksBelongToActivity(query) {
    return (/\brooftop\s+(?:drinks?|cocktails?|bars?|lounges?)\b/i.test(query) ||
        /\b(?:drinks?|cocktails?)\b[^.?!]*\brooftop\b/i.test(query));
}
function restaurantLaneFeatureOnlyQuery(query, intent) {
    const q = String(query || "").toLowerCase();
    const selectedRestaurantLane = intent?.searchType === "restaurant" ||
        intent?.primaryDomain === "restaurant" ||
        intent?.needsRestaurant === true;
    const mixedOrActivity = intent?.searchType === "mixed_outing" ||
        intent?.primaryDomain === "mixed" ||
        intent?.needsActivity === true;
    const explicitActivityRooftop = /\brooftop\s+(drinks?|cocktails?|bars?|lounges?)\b/i.test(q) ||
        /\b(drinks?|cocktails?|bars?|lounges?)\b[^.?!]{0,50}\b(rooftop|roof top)\b/i.test(q);
    return (selectedRestaurantLane &&
        !mixedOrActivity &&
        !explicitActivityRooftop &&
        (0, taxonomy_1.hasRooftopRestaurantFeatureLanguage)(q));
}
function rooftopRestaurantFeatureTermsFromQuery(query, includeRooftopCluster = false) {
    const q = String(query || "").toLowerCase();
    const terms = [
        /\b(rooftop|roof top)\b/.test(q) ? "rooftop" : "",
        /\b(rooftop|roof top)\b/.test(q) ? "rooftop restaurant" : "",
        /\b(rooftop|roof top)\b/.test(q) ? "rooftop dining" : "",
        /\b(rooftop|roof top|roof deck)\b/.test(q) ? "roof deck" : "",
        /\b(rooftop|roof top|terrace)\b/.test(q) ? "terrace" : "",
        /\bpatio\b/.test(q) ? "patio" : "",
        /\b(outdoor dining|outdoor seating)\b/.test(q) ? "outdoor dining" : "",
        /\boutdoor seating\b/.test(q) ? "outdoor seating" : "",
        /\b(rooftop|roof top|skyline|skyline views)\b/.test(q) ? "skyline" : "",
        /\b(rooftop|roof top|skyline|skyline views)\b/.test(q) ? "skyline views" : "",
        /\bscenic views\b/.test(q) ? "scenic views" : "",
        /\bwaterfront\b/.test(q) ? "waterfront" : "",
        /\bwaterfront views\b/.test(q) ? "waterfront views" : "",
        /\b(rooftop|roof top|views|skyline views|scenic views|city views|waterfront views)\b/.test(q) ? "views" : "",
        /\blive music\b/.test(q) ? "live music" : "",
    ];
    return (0, exports.uniq)(includeRooftopCluster && /\b(rooftop|roof top)\b/.test(q)
        ? [
            ...terms,
            "rooftop",
            "rooftop restaurant",
            "rooftop dining",
            "terrace",
            "skyline",
            "skyline views",
            "views",
            "roof deck",
        ]
        : terms);
}
function cleanPlaceOfWorshipTerms(terms, query) {
    if ((0, taxonomy_1.userAskedForPlaceOfWorship)(query))
        return terms;
    const blocked = new Set(taxonomy_1.PLACE_OF_WORSHIP_TERMS.map((x) => x.toLowerCase()));
    return terms.filter((term) => !blocked.has(term.toLowerCase()));
}
function splitOrParts(text) {
    return String(text || "")
        .split(/\s+\bor\b\s+/i)
        .map((part) => part.trim())
        .filter(Boolean);
}
function detectAlternativeGroupsForLane(query, lane) {
    const q = String(query || "").toLowerCase();
    if (!/\sor\s/i.test(q))
        return [];
    const groups = [];
    const connectorPattern = new RegExp(`\\b(${CONNECTOR_TERMS.filter((term) => term !== "or")
        .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|")})\\b`, "i");
    const connectorMatch = q.match(connectorPattern);
    let restaurantSegment = q;
    let activitySegment = q;
    if (connectorMatch && connectorMatch.index != null) {
        restaurantSegment = q.slice(0, connectorMatch.index).trim();
        activitySegment = q
            .slice(connectorMatch.index + connectorMatch[0].length)
            .trim();
    }
    const segment = lane === "restaurant" ? restaurantSegment : activitySegment;
    if (!/\sor\s/i.test(segment))
        return [];
    const parts = splitOrParts(segment);
    if (parts.length < 2)
        return [];
    const detected = parts.flatMap((part) => {
        if (lane === "restaurant") {
            return [
                ...(0, taxonomy_1.detectFoodTerms)(part),
                ...(0, taxonomy_1.detectCuisineTerms)(part),
                ...(0, taxonomy_1.detectMealTerms)(part),
            ];
        }
        const terms = (0, taxonomy_1.detectActivityTerms)(part);
        if (/\bactivit(?:y|ies)\b/i.test(part))
            terms.push("activity");
        return terms;
    });
    const cleaned = (0, exports.uniq)(detected);
    if (cleaned.length >= 2) {
        groups.push(cleaned);
    }
    return groups;
}
function mergeAlternativeGroups(...groups) {
    return groups
        .flatMap((group) => group ?? [])
        .map((group) => (0, exports.uniq)(group))
        .filter((group) => group.length >= 2);
}
function detectPairingPreference(query, wantsPairing) {
    const sameArea = ["same neighborhood", "same area", "in the area"].some((p) => phrase(query, p));
    const explicitWalkingMinutes = detectExplicitWalkingMinutes(query);
    const shortWalk = [
        "short walk",
        "quick walk",
        "same block",
        "around the corner",
    ].some((p) => phrase(query, p));
    const walking = explicitWalkingMinutes != null ||
        [
            "walking distance",
            "walkable",
            "short walk",
            "quick walk",
            "within walking distance",
            "can walk to",
            "no driving",
            "without driving",
            "same block",
            "around the corner",
        ].some((p) => phrase(query, p)) ||
        /\bwalking\b/i.test(query);
    const nearby = [
        "nearby",
        "close by",
        "close together",
        "near each other",
    ].some((p) => phrase(query, p));
    if (walking)
        return walkingPairingPreference(explicitWalkingMinutes ??
            (shortWalk
                ? SHORT_WALKING_LIMIT_MINUTES
                : distance_1.MAX_WALKING_DISTANCE_MINUTES));
    if (nearby)
        return {
            requiresPairing: true,
            distanceMode: "nearby",
            maxPairDistanceMiles: (0, distance_1.walkingMinutesToMiles)(NEARBY_WALKING_LIMIT_MINUTES),
            maxPairWalkingMinutes: NEARBY_WALKING_LIMIT_MINUTES,
            requireWalkablePair: true,
        };
    if (sameArea)
        return {
            requiresPairing: true,
            distanceMode: "same_area",
            maxPairDistanceMiles: 3,
            maxPairWalkingMinutes: null,
            requireWalkablePair: false,
        };
    return {
        requiresPairing: wantsPairing,
        distanceMode: "any",
        maxPairDistanceMiles: null,
        maxPairWalkingMinutes: null,
        requireWalkablePair: false,
    };
}
function deterministicIntentFromQuery(query) {
    if (hasSameLocationSportsWatchFoodIntent(query)) {
        return createSportsWatchFoodSameVenueIntent(query);
    }
    const rawActivitySignals = stripDistanceTerms((0, taxonomy_1.detectActivityTerms)(query));
    const hasMixedPairingLanguage = rawActivitySignals.length > 0 ||
        (0, taxonomy_1.hasGenericActivitySignal)(query) ||
        /\b(and|with|then|after|before|plus)\b[^.?!]{0,80}\b(activity|activities|things to do|something fun|bowling|karaoke|hookah|museum|arcade|drinks|cocktails|bar|lounge)\b/i.test(query);
    const singleVenueWithIntent = createSingleVenueWithSearchIntent(query);
    if (singleVenueWithIntent &&
        !(0, taxonomy_1.hasGenericActivitySignal)(query) &&
        !/\bsomething\s+(?:unique|fun|to do)\b/i.test(query) &&
        !(0, taxonomy_1.hasTrueSequenceConnector)(query) &&
        !(0, taxonomy_1.hasTrueProximityPairingConnector)(query))
        return applyPublicSearchMode(singleVenueWithIntent);
    const food = (0, taxonomy_1.detectFoodTerms)(query);
    const cuisine = (0, taxonomy_1.detectCuisineTerms)(query);
    const meals = (0, taxonomy_1.detectMealTerms)(query);
    const acts = rawActivitySignals;
    const geo = (0, geo_taxonomy_1.detectGeoIntent)(query);
    const rooftopActivity = rooftopDrinksBelongToActivity(query);
    const restaurantAlternativeGroups = detectAlternativeGroupsForLane(query, "restaurant");
    const activityAlternativeGroups = detectAlternativeGroupsForLane(query, "activity");
    const restaurantFood = food.filter((t) => t !== "rooftop" && t !== "lounge");
    const baselineRestaurantLane = {
        searchType: (0, taxonomy_1.userAskedForRooftopRestaurant)(query) ? "restaurant" : undefined,
        primaryDomain: (0, taxonomy_1.userAskedForRooftopRestaurant)(query) ? "restaurant" : undefined,
        needsRestaurant: (0, taxonomy_1.userAskedForRooftopRestaurant)(query) || undefined,
    };
    const restaurantLaneFeatureOnly = restaurantLaneFeatureOnlyQuery(query, baselineRestaurantLane);
    const restaurantContext = meals.length > 0 ||
        restaurantFood.length > 0 ||
        restaurantLaneFeatureOnly ||
        /restaurant|dinner|brunch|lunch|breakfast|cuisine|eat|dining|steakhouse|food/i.test(query);
    const activityContext = acts.length > 0 ||
        activityAlternativeGroups.length > 0 ||
        (0, taxonomy_1.hasGenericActivitySignal)(query) ||
        /things to do|fun things|something to do|something fun|date idea|date activity|outing|experience|entertainment|then|with|after|before|girls night|girls' night|lounge|bar|relaxed activity|chill activity|easy activity/i.test(query) ||
        (/date night/i.test(query) &&
            /walkable|walking distance|everything|outing|plan|activity|things to do|something fun/i.test(query)) ||
        /\b(drinks|cocktails)\b[^.?!]{0,40}\b(after|then|before)\b|\b(after|then|before)\b[^.?!]{0,40}\b(drinks|cocktails)\b/i.test(query);
    const hookahOnly = acts.includes("hookah") &&
        !/dinner|restaurant|food|eat|dining/i.test(query);
    const needsRestaurant = restaurantContext && !hookahOnly;
    const needsActivity = activityContext || hookahOnly;
    const mixed = needsRestaurant && needsActivity;
    const deterministicRestaurantFeatureTerms = restaurantContext && !rooftopActivity
        ? rooftopRestaurantFeatureTermsFromQuery(query, restaurantLaneFeatureOnly)
        : [];
    return applyPublicSearchMode({
        rawQuery: query,
        searchType: mixed
            ? "mixed_outing"
            : needsRestaurant
                ? "restaurant"
                : needsActivity
                    ? "activity"
                    : "any",
        primaryDomain: mixed
            ? "mixed"
            : needsRestaurant
                ? "restaurant"
                : needsActivity
                    ? "activity"
                    : "any",
        needsRestaurant,
        needsActivity,
        wantsPairing: mixed,
        pairingPreference: detectPairingPreference(query, mixed),
        restaurantIntent: {
            ...(0, taxonomy_1.createEmptyRestaurantIntent)(),
            mealTerms: meals,
            foodTerms: stripRooftopFeatureTerms(food),
            cuisineTerms: stripRooftopFeatureTerms(cuisine),
            categoryTerms: /restaurant|dining/i.test(query) || (0, taxonomy_1.userAskedForRooftopRestaurant)(query) ? ["restaurant"] : [],
            featureTerms: !rooftopActivity && (0, taxonomy_1.userAskedForRooftopRestaurant)(query)
                ? (0, exports.uniq)([...taxonomy_1.ROOFTOP_RESTAURANT_FEATURE_TERMS, ...deterministicRestaurantFeatureTerms])
                : deterministicRestaurantFeatureTerms,
            alternativeGroups: restaurantAlternativeGroups,
        },
        activityIntent: {
            ...(0, taxonomy_1.createEmptyActivityIntent)(),
            activityTerms: cleanPlaceOfWorshipTerms(acts, query),
            categoryTerms: /things to do/i.test(query) ? ["things to do"] : [],
            featureTerms: rooftopActivity
                ? ["rooftop", "terrace", "skyline", "view", "cocktails"]
                : [],
            alternativeGroups: activityAlternativeGroups,
        },
        geo,
        occasion: /date night|romantic/i.test(query) ? "date night" : null,
        partySize: null,
        timeContext: meals[0] ?? null,
        budget: null,
        vibe: (0, exports.uniq)([
            /romantic/i.test(query) ? "romantic" : "",
            /best/i.test(query) ? "best" : "",
        ]),
        strictness: "high",
    });
}
function normalizeIntent(query, llmIntent, options) {
    const base = deterministicIntentFromQuery(query);
    const merged = {
        ...base,
        ...(llmIntent ?? {}),
        rawQuery: query,
        restaurantIntent: {
            ...base.restaurantIntent,
            ...(llmIntent?.restaurantIntent ?? {}),
        },
        activityIntent: {
            ...base.activityIntent,
            ...(llmIntent?.activityIntent ?? {}),
        },
    };
    const redetectedGeo = (0, geo_taxonomy_1.detectGeoIntent)(query);
    merged.geo = redetectedGeo.raw ? redetectedGeo : base.geo;
    if (hasSameLocationSportsWatchFoodIntent(query) || /\b(?:wings and a bar where i can watch|not .*separate activity|bar with wings to watch|sports bar with wings|game day wings)\b/i.test(query)) {
        return {
            ...merged,
            searchType: "same_location_combo",
            primaryDomain: "restaurant",
            needsRestaurant: true,
            needsActivity: false,
            wantsPairing: false,
            sameLocationRequired: true,
            sameVenuePreferred: true,
            fallbackPairAllowed: false,
            normalizedIntent: "same_location_combo",
            pairingIntent: "same_location",
            pairRequested: false,
            activityIntent: (0, taxonomy_1.createEmptyActivityIntent)(),
            pairingPreference: resetPairingPreference(),
        };
    }
    const food = (0, exports.uniq)([
        ...(0, taxonomy_1.detectFoodTerms)(query),
        ...(merged.restaurantIntent.foodTerms ?? []),
    ]);
    const cuisine = (0, exports.uniq)([
        ...(0, taxonomy_1.detectCuisineTerms)(query),
        ...(merged.restaurantIntent.cuisineTerms ?? []),
    ]);
    const meals = (0, exports.uniq)([
        ...(0, taxonomy_1.detectMealTerms)(query),
        ...(merged.restaurantIntent.mealTerms ?? []),
    ]);
    const acts = stripDistanceTerms((0, exports.uniq)([
        ...(0, taxonomy_1.detectActivityTerms)(query),
        ...(merged.activityIntent.activityTerms ?? []),
    ]));
    const rooftopActivity = rooftopDrinksBelongToActivity(query);
    const restaurantLaneFeatureOnly = restaurantLaneFeatureOnlyQuery(query, merged);
    const restaurantOnlyFeatureTerms = merged.needsRestaurant && !merged.needsActivity
        ? rooftopRestaurantFeatureTermsFromQuery(query, restaurantLaneFeatureOnly)
        : [];
    const foodExpanded = (0, taxonomy_1.expandFoodSynonyms)(food);
    const actExpanded = stripDistanceTerms((0, taxonomy_1.expandActivitySynonyms)((0, exports.uniq)([
        ...acts,
        ...(merged.needsRestaurant && /\brooftop\b/i.test(query) && /\b(with|after|then|and|before)\b/i.test(query)
            ? ["rooftop", "rooftop bar", "rooftop lounge"]
            : []),
    ])));
    const restaurantAlternativeGroups = mergeAlternativeGroups(base.restaurantIntent.alternativeGroups, merged.restaurantIntent.alternativeGroups, detectAlternativeGroupsForLane(query, "restaurant"));
    const activityAlternativeGroups = mergeAlternativeGroups(base.activityIntent.alternativeGroups, merged.activityIntent.alternativeGroups, detectAlternativeGroupsForLane(query, "activity"))
        .map((group) => cleanPlaceOfWorshipTerms(group, query))
        .filter((group) => group.length >= 2);
    merged.restaurantIntent = {
        ...merged.restaurantIntent,
        mealTerms: stripBlockedTerms(stripCrossTerms((0, exports.uniq)([...meals, ...(0, taxonomy_1.expandFoodSynonyms)(meals)]), taxonomy_1.ACTIVITY_TERMS), RESTAURANT_SEARCH_TERM_BLOCKLIST),
        foodTerms: stripBlockedTerms(stripCrossTerms(stripRooftopFeatureTerms(foodExpanded), taxonomy_1.ACTIVITY_TERMS), RESTAURANT_SEARCH_TERM_BLOCKLIST),
        cuisineTerms: stripBlockedTerms(stripCrossTerms(stripRooftopFeatureTerms(cuisine), taxonomy_1.ACTIVITY_TERMS), RESTAURANT_SEARCH_TERM_BLOCKLIST),
        categoryTerms: stripBlockedTerms(stripCrossTerms((0, exports.uniq)([
            ...(merged.restaurantIntent.categoryTerms ?? []),
            ...((0, taxonomy_1.userAskedForRooftopRestaurant)(query) || restaurantLaneFeatureOnly ? ["restaurant"] : []),
        ]), taxonomy_1.ACTIVITY_TERMS), RESTAURANT_SEARCH_TERM_BLOCKLIST),
        featureTerms: stripBlockedTerms((0, taxonomy_1.userAskedForRooftopRestaurant)(query) && !rooftopActivity && !merged.needsActivity
            ? (0, exports.uniq)([
                ...(merged.restaurantIntent.featureTerms ?? []),
                ...taxonomy_1.ROOFTOP_RESTAURANT_FEATURE_TERMS,
            ])
            : merged.needsRestaurant && !merged.needsActivity
                ? (0, exports.uniq)([
                    ...(merged.restaurantIntent.featureTerms ?? []),
                    ...restaurantOnlyFeatureTerms,
                ])
                : stripCrossTerms(stripRooftopFeatureTerms((0, exports.uniq)(merged.restaurantIntent.featureTerms ?? [])), taxonomy_1.ACTIVITY_TERMS), RESTAURANT_SEARCH_TERM_BLOCKLIST),
        negativeTerms: (0, exports.uniq)(merged.restaurantIntent.negativeTerms ?? []),
        alternativeGroups: restaurantAlternativeGroups
            .map((group) => stripBlockedTerms(stripCrossTerms(group, taxonomy_1.ACTIVITY_TERMS), RESTAURANT_SEARCH_TERM_BLOCKLIST))
            .filter((group) => group.length >= 2),
    };
    merged.activityIntent = {
        ...merged.activityIntent,
        activityTerms: cleanPlaceOfWorshipTerms(stripBlockedTerms(stripDistanceTerms(stripCrossTerms(actExpanded, activityForbiddenRestaurantTerms())), ACTIVITY_SEARCH_TERM_BLOCKLIST), query),
        categoryTerms: cleanPlaceOfWorshipTerms(stripBlockedTerms(stripDistanceTerms(stripCrossTerms((0, exports.uniq)(merged.activityIntent.categoryTerms ?? []), activityForbiddenRestaurantTerms())), ACTIVITY_SEARCH_TERM_BLOCKLIST), query),
        vibeTerms: (0, exports.uniq)(merged.activityIntent.vibeTerms ?? []),
        featureTerms: cleanPlaceOfWorshipTerms(stripDistanceTerms((0, exports.uniq)([
            ...(merged.activityIntent.featureTerms ?? []),
            ...(rooftopActivity
                ? ["rooftop", "terrace", "skyline", "view", "cocktails"]
                : []),
        ])), query),
        negativeTerms: (0, exports.uniq)(merged.activityIntent.negativeTerms ?? []),
        alternativeGroups: activityAlternativeGroups
            .map((group) => stripBlockedTerms(stripDistanceTerms(stripCrossTerms(group, activityForbiddenRestaurantTerms())), ACTIVITY_SEARCH_TERM_BLOCKLIST))
            .filter((group) => group.length >= 2),
    };
    const hasRestaurant = merged.restaurantIntent.mealTerms.length > 0 ||
        merged.restaurantIntent.foodTerms.some((t) => !FEATURE_ONLY_FOOD_TERMS.has(t)) ||
        merged.restaurantIntent.cuisineTerms.some((t) => !FEATURE_ONLY_FOOD_TERMS.has(t)) ||
        (merged.restaurantIntent.alternativeGroups ?? []).some((group) => group.some((t) => !FEATURE_ONLY_FOOD_TERMS.has(t))) ||
        restaurantLaneFeatureOnly ||
        /restaurant|dinner|brunch|lunch|breakfast|dining|date night|romantic/i.test(query);
    const activityTermsForDomain = (merged.activityIntent.activityTerms ?? []).filter((term) => !["drinks", "cocktails", "cocktail bar", "bar", "wine bar", "lounge", "speakeasy"].includes(term.toLowerCase()) ||
        /\b(drinks|cocktails)\b[^.?!]{0,40}\b(after|then|before)\b|\b(after|then|before)\b[^.?!]{0,40}\b(drinks|cocktails)\b/i.test(query));
    const hasActivity = activityTermsForDomain.length > 0 ||
        (merged.activityIntent.alternativeGroups ?? []).length > 0 ||
        /things to do|fun things|\bactivity\b|after|before|girls night|girls' night|lounge|bar|relaxed activity|chill activity|easy activity/i.test(query) ||
        (/date night/i.test(query) &&
            /walkable|walking distance|everything|outing|plan/i.test(query)) ||
        /\b(drinks|cocktails)\b[^.?!]{0,40}\b(after|then|before)\b|\b(after|then|before)\b[^.?!]{0,40}\b(drinks|cocktails)\b/i.test(query);
    merged.needsRestaurant =
        hasRestaurant && !/^\s*hookah\s+(in|near)/i.test(query);
    merged.needsActivity = hasActivity;
    const preserveActivityPair = llmIntent?.searchType === "activity_pair" || merged.activityPairIntent;
    merged.wantsPairing = preserveActivityPair ? true : merged.needsRestaurant && merged.needsActivity;
    if (preserveActivityPair) {
        merged.needsRestaurant = false;
        merged.needsActivity = true;
        merged.searchType = "activity_pair";
        merged.primaryDomain = "activity";
    }
    else {
        merged.searchType = merged.wantsPairing
            ? "mixed_outing"
            : merged.needsRestaurant
                ? "restaurant"
                : merged.needsActivity
                    ? "activity"
                    : "any";
        merged.primaryDomain = merged.wantsPairing
            ? "mixed"
            : merged.needsRestaurant
                ? "restaurant"
                : merged.needsActivity
                    ? "activity"
                    : "any";
    }
    const detectedPreference = detectPairingPreference(query, merged.wantsPairing);
    const llmPreference = llmIntent?.pairingPreference;
    merged.pairingPreference =
        detectedPreference.distanceMode !== "any"
            ? detectedPreference
            : {
                ...detectedPreference,
                ...(llmPreference ?? {}),
                requiresPairing: merged.wantsPairing || Boolean(llmPreference?.requiresPairing),
            };
    if (!merged.wantsPairing && merged.pairingPreference.distanceMode === "any")
        merged.pairingPreference.requiresPairing = false;
    const unsafeVibe = merged.vibe;
    merged.vibe = Array.isArray(unsafeVibe)
        ? unsafeVibe
            .map(String)
            .map((item) => item.trim())
            .filter(Boolean)
        : typeof unsafeVibe === "string"
            ? [unsafeVibe.trim()].filter(Boolean)
            : Array.isArray(base.vibe)
                ? base.vibe
                : [];
    let finalIntent = protectBroadOccasionMixedIntent(merged, options?.explicitSearchLane ?? null);
    finalIntent = applyForceActivityOnlyVenue(finalIntent);
    finalIntent = cleanupSportsWatchIntentTerms(finalIntent);
    finalIntent = cleanupRelaxedIntent(finalIntent);
    finalIntent = finalDomainCleanup(finalIntent);
    finalIntent = finalCleanIntentTerms(finalIntent);
    const finalActivitySignals = stripDistanceTerms((0, taxonomy_1.detectActivityTerms)(query));
    const finalHasMixedPairingLanguage = finalActivitySignals.length > 0 ||
        (0, taxonomy_1.hasGenericActivitySignal)(query) ||
        /\b(and|with|then|after|before|plus)\b[^.?!]{0,80}\b(activity|activities|things to do|something fun|bowling|karaoke|hookah|museum|arcade|drinks|cocktails|bar|lounge)\b/i.test(query);
    const singleVenueWithIntent = createSingleVenueWithSearchIntent(query);
    const sameVenuePreferred = Boolean(singleVenueWithIntent);
    const sequenceDetected = (0, taxonomy_1.hasTrueSequenceConnector)(query);
    const proximityDetected = (0, taxonomy_1.hasTrueProximityPairingConnector)(query);
    if (singleVenueWithIntent && sameVenuePreferred && !(0, taxonomy_1.hasGenericActivitySignal)(query) && !/\bsomething\s+(?:unique|fun|to do)\b/i.test(query) && !sequenceDetected && !proximityDetected) {
        const singleVenue = (0, taxonomy_1.detectSingleVenueWithIntent)(query);
        const guarded = {
            ...finalIntent,
            ...singleVenueWithIntent,
            searchType: "restaurant",
            primaryDomain: "restaurant",
            needsRestaurant: true,
            needsActivity: false,
            wantsPairing: false,
            geo: finalIntent.geo?.raw ? finalIntent.geo : singleVenueWithIntent.geo,
            restaurantIntent: {
                ...singleVenueWithIntent.restaurantIntent,
                mealTerms: (0, exports.uniq)([
                    ...(singleVenueWithIntent.restaurantIntent.mealTerms ?? []),
                    ...(finalIntent.restaurantIntent.mealTerms ?? []),
                ]),
                foodTerms: (0, exports.uniq)([
                    ...(singleVenueWithIntent.restaurantIntent.foodTerms ?? []),
                    ...(finalIntent.restaurantIntent.foodTerms ?? []),
                ]),
                cuisineTerms: (0, exports.uniq)([
                    ...(singleVenueWithIntent.restaurantIntent.cuisineTerms ?? []),
                    ...(finalIntent.restaurantIntent.cuisineTerms ?? []),
                ]),
                categoryTerms: (0, exports.uniq)([
                    ...(singleVenueWithIntent.restaurantIntent.categoryTerms ?? []),
                    ...(finalIntent.restaurantIntent.categoryTerms ?? []),
                ]),
                featureTerms: (0, exports.uniq)([
                    ...(singleVenueWithIntent.restaurantIntent.featureTerms ?? []),
                    ...(finalIntent.restaurantIntent.featureTerms ?? []),
                ]),
            },
            activityIntent: (0, taxonomy_1.createEmptyActivityIntent)(),
            pairingPreference: resetPairingPreference(),
        };
        guarded.sameVenuePreferred = true;
        guarded.sequenceDetected = false;
        guarded.proximityDetected = false;
        guarded.sameVenueReason = "with_connector_same_location_attribute";
        guarded.coLocationTermsMatched = (0, exports.uniq)([...singleVenue.venueTerms, ...singleVenue.foodTerms, ...singleVenue.featureTerms]);
        guarded.primaryTerms = (0, exports.uniq)([...singleVenue.venueTerms, ...singleVenue.foodTerms]);
        guarded.secondaryAttributeTerms = singleVenue.featureTerms;
        guarded.parserPriorityApplied = true;
        guarded.parserPriorityReason = "same_venue_with_overrode_mixed_outing_without_sequence_or_proximity";
        guarded.wantsPairingBeforeSameVenueGuard = finalIntent.wantsPairing;
        guarded.wantsPairingAfterSameVenueGuard = false;
        guarded.needsActivityBeforeSameVenueGuard = finalIntent.needsActivity;
        guarded.needsActivityAfterSameVenueGuard = false;
        return applyPublicSearchMode(guarded);
    }
    const qForFinalOverrides = normalizeIntentTerm(query);
    if (/\brooftop (?:dinner|restaurant|dining)|(?:dinner|restaurant|dining) spot (?:with |in |on )?(?:a )?rooftop|not (?:a )?(?:separate|rooftop lounge|rooftop bar)|same place|one place\b/.test(qForFinalOverrides) && /\brooftop\b/.test(qForFinalOverrides) && /\b(dinner|restaurant|dining|brunch|lunch)\b/.test(qForFinalOverrides)) {
        finalIntent = {
            ...finalIntent,
            searchType: "restaurant",
            primaryDomain: "restaurant",
            needsRestaurant: true,
            needsActivity: false,
            wantsPairing: false,
            activityIntent: (0, taxonomy_1.createEmptyActivityIntent)(),
            fallbackPairAllowed: false,
            pairingPreference: resetPairingPreference(),
        };
        finalIntent.sameVenuePreferred = true;
        finalIntent.sameLocationRequired = true;
        finalIntent.sameVenueReason = "rooftop_restaurant_same_location";
        finalIntent.parserPriorityReason = /\bnot (?:a )?(?:separate|rooftop lounge|rooftop bar)\b/.test(qForFinalOverrides)
            ? "mixed_outing_suppressed_not_separate_rooftop_lounge"
            : "matched_rooftop_restaurant_same_location";
    }
    else if (hasSameLocationSportsWatchFoodIntent(qForFinalOverrides) || /\bwings and a bar where i can watch|not .*separate activity|bar with wings to watch|sports bar with wings|game day wings\b/.test(qForFinalOverrides)) {
        finalIntent = {
            ...finalIntent,
            searchType: "same_location_combo",
            primaryDomain: "restaurant",
            needsRestaurant: true,
            needsActivity: false,
            wantsPairing: false,
            sameLocationRequired: true,
            sameVenuePreferred: true,
            fallbackPairAllowed: false,
            normalizedIntent: "same_location_combo",
            pairingIntent: "same_location",
            pairRequested: false,
            restaurantIntent: {
                ...finalIntent.restaurantIntent,
                mealTerms: (0, exports.uniq)([...(finalIntent.restaurantIntent.mealTerms ?? []), "dinner"]),
                foodTerms: (0, exports.uniq)([...(finalIntent.restaurantIntent.foodTerms ?? []), "wings", "chicken wings", "bar food"]),
                categoryTerms: (0, exports.uniq)([...(finalIntent.restaurantIntent.categoryTerms ?? []), "sports bar", "bar and grill"]),
                featureTerms: (0, exports.uniq)([...(finalIntent.restaurantIntent.featureTerms ?? []), "game watch", "tv", "tvs", "screens", "basketball", "knicks game"]),
            },
            activityIntent: (0, taxonomy_1.createEmptyActivityIntent)(),
            pairingPreference: resetPairingPreference(),
        };
        finalIntent.sameVenueReason = "sports_watch_food_same_location";
        finalIntent.parserPriorityReason = "matched sports-watch food-and-TV same-location fast path";
    }
    else if (/\b(?:live jazz|jazz|live music)\b/.test(qForFinalOverrides) && /\bnearby|close by|near each other|walking distance\b/.test(qForFinalOverrides) && /\b(dinner|restaurant|food|eat|seafood)\b/.test(qForFinalOverrides)) {
        finalIntent = {
            ...finalIntent,
            searchType: "mixed_outing",
            primaryDomain: "mixed",
            needsRestaurant: true,
            needsActivity: true,
            wantsPairing: true,
            activityIntent: {
                ...finalIntent.activityIntent,
                activityTerms: (0, exports.uniq)([...(finalIntent.activityIntent.activityTerms ?? []), "live jazz", "jazz", "live music"]),
            },
            pairingPreference: detectPairingPreference(query, true),
        };
    }
    finalIntent = applyPublicSearchMode(finalIntent);
    if (/\brooftop (?:dinner|restaurant|dining)|not (?:a )?separate rooftop bar|not (?:a )?separate\b/.test(qForFinalOverrides) && /\brooftop\b/.test(qForFinalOverrides) && /\b(dinner|restaurant|dining|brunch|lunch)\b/.test(qForFinalOverrides)) {
        finalIntent = {
            ...finalIntent,
            searchType: "restaurant",
            primaryDomain: "restaurant",
            needsRestaurant: true,
            needsActivity: false,
            wantsPairing: false,
            activityIntent: (0, taxonomy_1.createEmptyActivityIntent)(),
            pairingPreference: resetPairingPreference(),
        };
    }
    if (hasSameLocationSportsWatchFoodIntent(qForFinalOverrides) || /\b(?:wings and a bar where i can watch|not .*separate activity|bar with wings to watch|sports bar with wings|game day wings)\b/.test(qForFinalOverrides)) {
        finalIntent = {
            ...finalIntent,
            searchType: "same_location_combo",
            primaryDomain: "restaurant",
            needsRestaurant: true,
            needsActivity: false,
            wantsPairing: false,
            sameLocationRequired: true,
            sameVenuePreferred: true,
            fallbackPairAllowed: false,
            normalizedIntent: "same_location_combo",
            pairingIntent: "same_location",
            pairRequested: false,
            activityIntent: (0, taxonomy_1.createEmptyActivityIntent)(),
            pairingPreference: resetPairingPreference(),
        };
    }
    finalIntent.sameVenuePreferred = finalIntent.sameVenuePreferred === true || sameVenuePreferred;
    finalIntent.sequenceDetected = sequenceDetected;
    finalIntent.proximityDetected = proximityDetected;
    finalIntent.parserPriorityApplied = false;
    return finalIntent;
}
function mergeLlmIntentWithPreIntent(args) {
    const { rawQuery, preIntent, llmIntent } = args;
    if (!preIntent)
        return llmIntent;
    const q = rawQuery.toLowerCase();
    const llm = { ...llmIntent };
    const rawHasFood = /\b(restaurant|dinner|brunch|lunch|breakfast|eat|food|steak|seafood|sushi|pizza|tacos)\b/.test(q);
    const rawHasActivity = /\b(activity|drinks|cocktails|bar|lounge|rooftop|hookah|comedy|theater|theatre|museum|arcade|bowling|karaoke|sports bar|watch|game)\b/.test(q);
    if (preIntent.searchType === "activity" && !rawHasFood && rawHasActivity) {
        llm.searchType = "activity";
        llm.primaryDomain = "activity";
        llm.needsRestaurant = false;
        llm.needsActivity = true;
        llm.wantsPairing = false;
    }
    if (/\b(watch|game|knicks|nets|yankees|mets|giants|jets|rangers|nba|nfl|mlb|nhl|ufc)\b/.test(q)) {
        llm.activityIntent = {
            ...(llm.activityIntent ?? {}),
            activityTerms: (0, exports.uniq)([
                ...(preIntent.activityIntent?.activityTerms ?? []),
                ...(llm.activityIntent?.activityTerms ?? []),
            ]),
            categoryTerms: (0, exports.uniq)([
                "sports bar",
                ...(preIntent.activityIntent?.categoryTerms ?? []),
                ...(llm.activityIntent?.categoryTerms ?? []),
            ]),
            featureTerms: (0, exports.uniq)([
                "tv",
                ...(preIntent.activityIntent?.featureTerms ?? []),
                ...(llm.activityIntent?.featureTerms ?? []),
            ]),
            vibeTerms: (0, exports.uniq)([
                ...(preIntent.activityIntent?.vibeTerms ?? []),
                ...(llm.activityIntent?.vibeTerms ?? []),
            ]),
            negativeTerms: (0, exports.uniq)([
                ...(preIntent.activityIntent?.negativeTerms ?? []),
                ...(llm.activityIntent?.negativeTerms ?? []),
            ]),
            alternativeGroups: llm.activityIntent?.alternativeGroups ?? [],
        };
    }
    return llm;
}
function restaurantSearchTerms(intent) {
    if (!intent.needsRestaurant)
        return [];
    const rooftopRestaurantTerms = intent.needsRestaurant && !intent.needsActivity && (0, taxonomy_1.hasRooftopRestaurantFeatureLanguage)(intent.rawQuery)
        ? [
            "restaurant",
            "rooftop restaurant",
            "rooftop dining",
            "rooftop",
            "skyline",
            "skyline views",
            "scenic views",
            "terrace",
            "patio",
            "outdoor dining",
            "outdoor seating",
            "views",
            "roof deck",
        ]
        : [];
    const broadMixedRestaurantTerms = broadRestaurantFallbackTerms(intent);
    const mealTermsToStrip = new Set(broadMixedRestaurantTerms.length > 0
        ? ["birthday dinner"]
        : ["dinner", "birthday dinner", "brunch", "lunch", "breakfast"]);
    const activitySideOnlyTerms = intent.needsActivity && ((0, taxonomy_1.hasTrueSequenceConnector)(intent.rawQuery) || (0, taxonomy_1.hasTrueProximityPairingConnector)(intent.rawQuery))
        ? new Set(["live music", "music", "jazz", "dancing", "dance", "nightlife", "karaoke"])
        : new Set();
    const dominicanPrimaryQuery = /\bdominican\b/i.test(intent.rawQuery ?? "");
    const dominicanBroadFallbackTerms = new Set([
        "puerto rican",
        "west indian",
        "island food",
        "jerk chicken",
        "curry goat",
    ]);
    return finalCleanTermList(stripBlockedTerms(stripBlockedTerms((0, exports.uniq)([
        ...intent.restaurantIntent.mealTerms,
        ...intent.restaurantIntent.foodTerms,
        ...intent.restaurantIntent.cuisineTerms,
        ...intent.restaurantIntent.categoryTerms,
        ...intent.restaurantIntent.featureTerms,
        ...(intent.restaurantIntent.alternativeGroups ?? []).flat(),
        ...rooftopRestaurantTerms,
        ...broadMixedRestaurantTerms,
    ]).filter((term) => {
        const normalizedTerm = normalizeIntentTerm(term);
        if (activitySideOnlyTerms.has(normalizedTerm))
            return false;
        if (dominicanPrimaryQuery && dominicanBroadFallbackTerms.has(normalizedTerm))
            return false;
        return true;
    }), mealTermsToStrip), RESTAURANT_SEARCH_TERM_BLOCKLIST), exports.RESTAURANT_ALLOWED_SINGLE_WORDS);
}
function broadRestaurantFallbackTerms(intent) {
    if (intent.searchType !== "mixed_outing" || !intent.needsRestaurant)
        return [];
    const q = normalizeIntentTerm(intent.rawQuery ?? "");
    const terms = [];
    if (/\bbrunch|spot for brunch\b/.test(q))
        terms.push("brunch", "breakfast", "restaurant", "food");
    if (/\bbreakfast\b/.test(q))
        terms.push("breakfast", "restaurant", "food");
    if (/\blunch\b/.test(q))
        terms.push("lunch", "restaurant", "food");
    if (/\bdinner|girls night dinner|birthday dinner|casual date night|romantic dinner|eat first\b/.test(q))
        terms.push("dinner", "restaurant", "food");
    if (/\brestaurant|food|eat|eats|dining\b/.test(q))
        terms.push("restaurant", "food", "dining");
    if (/\bgirls night\b/.test(q))
        terms.push("dinner", "restaurant", "social");
    if (/\bwings|chicken wings|bar food|sports bar|bar and grill\b/.test(q))
        terms.push("wings", "chicken wings", "bar food", "sports bar", "bar and grill");
    if (terms.length === 0 && intent.restaurantIntent.mealTerms.length === 0 && intent.restaurantIntent.foodTerms.length === 0 && intent.restaurantIntent.cuisineTerms.length === 0) {
        terms.push("restaurant", "food", "dinner");
    }
    return (0, exports.uniq)(terms);
}
function shouldAddGenericActivityFallback(intent, terms) {
    return isBroadGenericActivityIntent(intent, terms);
}
function isBroadGenericActivityIntent(intent, terms = [
    ...intent.activityIntent.activityTerms,
    ...intent.activityIntent.categoryTerms,
    ...intent.activityIntent.featureTerms,
    ...(intent.activityIntent.alternativeGroups ?? []).flat(),
]) {
    return (intent.searchType === "mixed_outing" &&
        intent.needsActivity === true &&
        ((0, taxonomy_1.hasOnlyGenericActivityTerms)(terms) ||
            /\b(something fun|activity|activities|relaxed activity|casual activity|chill activity)\b/i.test(intent.rawQuery ?? "")));
}
function genericActivityFallbackTerms(intent) {
    const terms = [...taxonomy_1.GENERIC_ACTIVITY_FALLBACK_TERMS];
    if (intent && hasRelaxedActivityAlternativeIntent(intent.rawQuery)) {
        terms.push("relaxed activity", "board games", "museum", "art gallery", "cafe", "dessert", "scenic walk", "park", "bowling", "mini golf", "billiards", "paint and sip", "low-key live music");
    }
    return (0, exports.uniq)(terms);
}
function activitySearchTerms(intent) {
    if (!intent.needsActivity)
        return [];
    const raw = (0, exports.uniq)([
        ...intent.activityIntent.activityTerms,
        ...intent.activityIntent.categoryTerms,
        ...intent.activityIntent.featureTerms,
        ...(intent.activityIntent.alternativeGroups ?? []).flat(),
    ]);
    const contextualTerms = (0, exports.uniq)([
        ...raw,
        ...(hasRelaxedActivityAlternativeIntent(intent.rawQuery) ? exports.RELAXED_ACTIVITY_REQUIRED_TERMS : []),
        ...(hasNoClubOrQuietVenueIntent(intent.rawQuery) ? venueTermsFromRawQuery(intent.rawQuery) : []),
    ]);
    const withFallback = shouldAddGenericActivityFallback(intent, contextualTerms)
        ? (0, exports.uniq)([...contextualTerms, ...genericActivityFallbackTerms(intent)])
        : contextualTerms;
    const cleaned = stripBlockedTerms(withFallback, ACTIVITY_SEARCH_TERM_BLOCKLIST);
    const finalTerms = finalCleanTermList(cleanPlaceOfWorshipTerms(cleaned, intent.rawQuery), exports.ACTIVITY_ALLOWED_SINGLE_WORDS);
    if (/\bhookah\b/i.test(intent.rawQuery) && !/\bdrinks?|cocktails?|wine\b/i.test(intent.rawQuery)) {
        return finalTerms.filter((term) => !["lounge", "bar", "cocktail bar"].includes(term));
    }
    return finalTerms;
}
function restaurantSearchTermsOriginal(intent) {
    return (0, exports.uniq)([
        ...intent.restaurantIntent.mealTerms,
        ...intent.restaurantIntent.foodTerms,
        ...intent.restaurantIntent.cuisineTerms,
        ...intent.restaurantIntent.categoryTerms,
        ...intent.restaurantIntent.featureTerms,
        ...(intent.restaurantIntent.alternativeGroups ?? []).flat(),
    ]);
}
function activitySearchTermsOriginal(intent) {
    const raw = (0, exports.uniq)([
        ...intent.activityIntent.activityTerms,
        ...intent.activityIntent.categoryTerms,
        ...intent.activityIntent.featureTerms,
        ...(intent.activityIntent.alternativeGroups ?? []).flat(),
    ]);
    return shouldAddGenericActivityFallback(intent, raw)
        ? (0, exports.uniq)([...raw, ...genericActivityFallbackTerms(intent)])
        : raw;
}
function hasRelaxedActivityIntent(query) {
    return hasRelaxedActivityAlternativeIntent(query) || hasNoClubOrQuietVenueIntent(query);
}
function hasSpecificRestaurantFoodOrCuisine(intent) {
    return [
        ...intent.restaurantIntent.foodTerms,
        ...intent.restaurantIntent.cuisineTerms,
    ].some((term) => ![
        "restaurant",
        "restaurants",
        "dining",
        "dinner",
        "birthday dinner",
    ].includes(term.toLowerCase()));
}
function pruneActivityRpcTerms(intent, terms = activitySearchTermsOriginal(intent)) {
    if (/\bhookah\b/i.test(intent.rawQuery))
        return terms;
    return terms.filter((term) => !/\bhookah\b/i.test(term));
}
function pruneRelaxedActivityTerms(intent, terms = activitySearchTermsOriginal(intent)) {
    if (!hasRelaxedActivityIntent(intent.rawQuery))
        return terms;
    return cleanupRelaxedActivityTerms(terms, intent.rawQuery);
}
function hasSportsWatchIntent(query) {
    const q = String(query ?? "")
        .toLowerCase()
        .replaceAll("_", " ")
        .replaceAll("-", " ");
    const sportsOrGame = /\b(watch|showing|viewing|game|match|fight|ufc|boxing|nba|nfl|mlb|nhl|wnba|soccer|football|basketball|baseball|hockey|knicks|nets|lakers|warriors|celtics|cowboys|eagles|chiefs|dodgers|red sox|duke|uconn|yankees|mets|giants|jets|rangers|islanders|devils|march madness|final four)\b/.test(q);
    const venueOrViewing = /\b(bar|sports bar|sports lounge|sport lounge|pub|tavern|lounge|grill|tv|tvs|screen|screens|watch party|game day|game night|live sports)\b/.test(q);
    return sportsOrGame && venueOrViewing;
}
const SPORTS_WATCH_BLOCKED_ACTIVITY_TERMS = new Set([
    "nightlife", "lounge", "rooftop lounge", "rooftop", "roof top", "club", "dance club", "dancing", "nightclub", "live dj", "dj", "speakeasy", "skating", "roller skating", "ice skating", "golf", "driving range", "batting cages", "climbing", "rock climbing", "gym", "roller", "ice", "driving", "range", "batting", "cages", "rock",
]);
const SPORTS_WATCH_REQUIRED_ACTIVITY_TERMS = [
    "sports bar", "sports lounge", "sport lounge", "bar with tv", "bar with tvs", "bar with screens", "tv bar", "big screen", "big screens", "watch party", "game day", "game night", "live sports", "sports viewing", "pub", "tavern", "bar and grill", "bar", "tv", "tvs", "screens",
];
const sportsWatchRemovedActivityTermsByIntent = new WeakMap();
function normalizeSportsWatchTerm(term) {
    return String(term || "")
        .toLowerCase()
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .trim()
        .replace(/\s+/g, " ");
}
const SPORTS_WATCH_TEAM_TOKENS = [
    "lakers", "warriors", "celtics", "cowboys", "eagles", "dodgers", "duke",
    "knicks", "nets", "yankees", "mets", "giants", "jets", "rangers",
    "islanders", "devils", "march madness", "final four",
];
function cleanupSportsWatchActivityTerms(terms, rawQuery = "") {
    const q = String(rawQuery || "").toLowerCase();
    const added = SPORTS_WATCH_TEAM_TOKENS
        .filter((team) => new RegExp(`(^|[^a-z0-9])${team.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}([^a-z0-9]|$)`, "i").test(q))
        .map((team) => `${team} game`);
    if (/\b(basketball|nba|knicks|nets|lakers|warriors|celtics|heat|bucks|sixers|76ers|bulls|mavericks|mavs|suns|clippers|nuggets|timberwolves|wolves|thunder|grizzlies|pelicans|kings|blazers|jazz|rockets|spurs|raptors|pacers|cavaliers|cavs|magic|hawks|hornets|pistons|wizards|duke|uconn|march madness|final four)\b/.test(q))
        added.push("basketball", "watch basketball");
    if (/\b(football|nfl|giants|jets|cowboys|eagles|commanders|patriots|chiefs|ravens|steelers|bills|dolphins|bengals|browns|texans|colts|jaguars|titans|broncos|raiders|chargers|packers|bears|lions|vikings|falcons|panthers|saints|buccaneers|bucs|cardinals|rams|49ers|seahawks)\b/.test(q))
        added.push("football", "watch football");
    if (/\b(baseball|mlb|yankees|mets|dodgers|red sox|cubs|phillies|braves|astros|blue jays|orioles|rays|guardians|tigers|royals|twins|angels|athletics|mariners|nationals|marlins|brewers|pirates|reds|diamondbacks|rockies|padres)\b/.test(q))
        added.push("baseball", "watch baseball");
    if (/\b(hockey|nhl|rangers|islanders|devils|bruins|flyers|penguins|capitals|hurricanes|panthers|lightning|maple leafs|leafs|canadiens|senators|sabres|red wings|blackhawks|blues|predators|wild|stars|avalanche|golden knights|knights|kraken|canucks|oilers|flames|ducks|sharks|coyotes)\b/.test(q))
        added.push("hockey", "watch hockey");
    if (/\b(ufc|boxing|fight)\b/.test(q))
        added.push("fight night", "ufc fight", "boxing fight");
    return finalCleanTermList((0, exports.uniq)([
        ...terms.map(normalizeSportsWatchTerm).filter((term) => term && !SPORTS_WATCH_BLOCKED_ACTIVITY_TERMS.has(term)),
        ...SPORTS_WATCH_REQUIRED_ACTIVITY_TERMS,
        ...added,
    ]), exports.ACTIVITY_ALLOWED_SINGLE_WORDS);
}
function sportsWatchTermsRemoved(terms) {
    return (0, exports.uniq)(terms
        .map(normalizeSportsWatchTerm)
        .filter((term) => term && SPORTS_WATCH_BLOCKED_ACTIVITY_TERMS.has(term)));
}
function cleanupSportsWatchIntentTerms(intent) {
    if (!hasSportsWatchIntent(intent.rawQuery))
        return intent;
    const activityIntent = intent.activityIntent ?? (0, taxonomy_1.createEmptyActivityIntent)();
    const removedTerms = sportsWatchTermsRemoved(activityIntent.activityTerms ?? []);
    const cleaned = {
        ...intent,
        searchType: "activity",
        primaryDomain: "activity",
        needsRestaurant: false,
        needsActivity: true,
        wantsPairing: false,
        activityIntent: {
            ...activityIntent,
            activityTerms: cleanupSportsWatchActivityTerms(activityIntent.activityTerms ?? [], intent.rawQuery),
            categoryTerms: (0, exports.uniq)([
                "sports bar",
                ...(activityIntent.categoryTerms ?? []).map(normalizeSportsWatchTerm),
            ]),
            featureTerms: (0, exports.uniq)([
                "tv",
                ...(activityIntent.featureTerms ?? []).map(normalizeSportsWatchTerm),
            ]),
        },
        restaurantIntent: {
            ...(0, taxonomy_1.createEmptyRestaurantIntent)(),
        },
        pairingPreference: {
            requiresPairing: false,
            distanceMode: "any",
            maxPairDistanceMiles: null,
            maxPairWalkingMinutes: null,
            requireWalkablePair: false,
        },
    };
    sportsWatchRemovedActivityTermsByIntent.set(cleaned, removedTerms);
    return cleaned;
}
function pruneSportsWatchActivityTerms(intent, terms = activitySearchTermsOriginal(intent)) {
    if (!hasSportsWatchIntent(intent.rawQuery))
        return terms;
    return cleanupSportsWatchActivityTerms(terms, intent.rawQuery);
}
function activityRpcTerms(intent) {
    const original = activitySearchTermsOriginal(intent);
    const broadGenericActivity = isBroadGenericActivityIntent(intent);
    const afterDomainPruning = pruneActivityRpcTerms(intent, original);
    const afterSportsWatchPruning = pruneSportsWatchActivityTerms(intent, afterDomainPruning);
    const expandedTerms = pruneRelaxedActivityTerms(intent, afterSportsWatchPruning);
    const terms = intent.needsActivity
        ? finalCleanTermList(broadGenericActivity ? taxonomy_1.COMPACT_GENERIC_ACTIVITY_RPC_TERMS : expandedTerms, exports.ACTIVITY_ALLOWED_SINGLE_WORDS)
        : [];
    return {
        terms,
        compactGenericActivityRpcApplied: broadGenericActivity,
        expandedTerms,
        removedForSportsWatchIntent: hasSportsWatchIntent(intent.rawQuery)
            ? (0, exports.uniq)([
                ...(sportsWatchRemovedActivityTermsByIntent.get(intent) ?? []),
                ...sportsWatchTermsRemoved(afterDomainPruning),
                ...(sportsWatchRemovedActivityTermsByIntent.get(intent)?.length ? [] : [
                    "nightlife",
                    "rooftop lounge",
                    "club",
                    "dance club",
                    "live dj",
                    "speakeasy",
                ]),
            ])
            : [],
        removedForRelaxedIntent: hasRelaxedActivityIntent(intent.rawQuery)
            ? (0, exports.uniq)([
                ...(relaxedRemovedActivityTermsByIntent.get(intent) ?? []),
                ...relaxedActivityTermsRemoved(afterSportsWatchPruning),
            ])
            : [],
    };
}
