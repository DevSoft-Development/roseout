"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyActivityIntent = exports.createEmptyRestaurantIntent = exports.RESTAURANT_CATEGORY_TERMS = exports.NON_RESTAURANT_CATEGORY_TERMS = exports.PLACE_OF_WORSHIP_TERMS = exports.ACTIVITY_TERMS = exports.MEAL_TERMS = exports.FOOD_TERMS = exports.TRUE_SEQUENCE_CONNECTORS = exports.SINGLE_VENUE_FEATURE_TERMS = exports.VENUE_WITH_TERMS = exports.FOOD_WITH_TERMS = exports.GENERIC_ACTIVITY_FALLBACK_TERMS = exports.COMPACT_GENERIC_ACTIVITY_RPC_TERMS = exports.GENERIC_ACTIVITY_SIGNAL_TERMS = exports.ACTIVITY_SYNONYMS = exports.ROOFTOP_RESTAURANT_FEATURE_TERMS = exports.FOOD_SYNONYMS = exports.MEAL_SYNONYMS = exports.includesPhrase = void 0;
exports.hasRooftopRestaurantFeatureLanguage = hasRooftopRestaurantFeatureLanguage;
exports.userAskedForRooftopRestaurant = userAskedForRooftopRestaurant;
exports.hasBroadOutingOccasionLanguage = hasBroadOutingOccasionLanguage;
exports.hasRestaurantOnlyLanguage = hasRestaurantOnlyLanguage;
exports.hasActivityOnlyLanguage = hasActivityOnlyLanguage;
exports.detectBroadOutingOccasion = detectBroadOutingOccasion;
exports.hasGenericActivitySignal = hasGenericActivitySignal;
exports.hasOnlyGenericActivityTerms = hasOnlyGenericActivityTerms;
exports.escapeRegex = escapeRegex;
exports.uniqueIntentTerms = uniqueIntentTerms;
exports.hasExplicitTwoStopLanguage = hasExplicitTwoStopLanguage;
exports.hasSameLocationFoodFeatureIntent = hasSameLocationFoodFeatureIntent;
exports.hasTrueSequenceConnector = hasTrueSequenceConnector;
exports.hasTrueProximityPairingConnector = hasTrueProximityPairingConnector;
exports.hasSingleVenueWithConnector = hasSingleVenueWithConnector;
exports.expandVenueTerms = expandVenueTerms;
exports.expandFoodTerms = expandFoodTerms;
exports.expandFeatureTerms = expandFeatureTerms;
exports.extractSingleVenueWithTerms = extractSingleVenueWithTerms;
exports.detectSingleVenueWithIntent = detectSingleVenueWithIntent;
exports.isSingleVenueWithIntent = isSingleVenueWithIntent;
exports.detectFoodTerms = detectFoodTerms;
exports.detectCuisineTerms = detectCuisineTerms;
exports.detectMealTerms = detectMealTerms;
exports.hasExplicitHookahIntent = hasExplicitHookahIntent;
exports.detectActivityTerms = detectActivityTerms;
exports.qualifyExplicitActivityIntent = qualifyExplicitActivityIntent;
exports.expandFoodSynonyms = expandFoodSynonyms;
exports.expandActivitySynonyms = expandActivitySynonyms;
exports.isSpecificFoodIntent = isSpecificFoodIntent;
exports.isGenericMealIntent = isGenericMealIntent;
exports.isSpecificActivityIntent = isSpecificActivityIntent;
exports.textForRecord = textForRecord;
exports.termMatchesRecord = termMatchesRecord;
exports.activityTermMatches = activityTermMatches;
exports.hasAnyTerm = hasAnyTerm;
exports.userAskedForPlaceOfWorship = userAskedForPlaceOfWorship;
const uniq = (items) => Array.from(new Set(items.map((x) => x.toLowerCase().trim()).filter(Boolean)));
const includesPhrase = (query, phrase) => new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(query);
exports.includesPhrase = includesPhrase;
exports.MEAL_SYNONYMS = {
    breakfast: ["breakfast"], brunch: ["brunch", "eggs benedict", "pancakes", "waffles", "mimosa", "bottomless brunch", "breakfast"], lunch: ["lunch"], dinner: ["dinner", "restaurant", "dining"], "late night": ["late night"], dessert: ["dessert", "cake", "bakery", "pastries", "ice cream", "gelato", "sweets", "chocolate"], coffee: ["coffee", "cafe", "espresso", "latte", "cappuccino", "coffee shop"], drinks: ["drinks", "cocktails"], "happy hour": ["happy hour"], "date night": ["date night", "romantic"], "romantic dinner": ["romantic dinner", "romantic"], "quick bite": ["quick bite"], "casual dinner": ["casual dinner"], "fine dining": ["fine dining"], "group dinner": ["group dinner"], "birthday dinner": ["birthday dinner"], "group night": ["group night"], "business dinner": ["business dinner"]
};
exports.FOOD_SYNONYMS = {
    steak: ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon", "sirloin", "tomahawk", "prime rib", "brazilian steakhouse", "churrasco", "grill"],
    seafood: ["seafood", "fish", "lobster", "crab", "shrimp", "oyster", "oysters", "raw bar", "clam", "mussels", "scallops", "sushi"],
    sushi: ["sushi", "sashimi", "omakase", "nigiri", "maki", "rolls", "japanese sushi", "japanese", "izakaya"],
    italian: ["italian", "pasta", "pizza", "trattoria", "osteria", "ristorante", "italian restaurant"],
    mexican: ["mexican", "tacos", "taco", "burritos", "birria", "tequila", "taqueria", "tex-mex"],
    caribbean: ["caribbean", "west indian", "island food", "jamaican", "jerk chicken", "oxtail", "curry goat", "roti", "doubles", "patties", "trinidadian", "haitian", "cuban"],
    dominican: ["dominican", "dominican restaurant", "dominican food", "mangu", "mangú", "mofongo", "pernil", "tostones", "latin", "caribbean"],
    "puerto rican": ["puerto rican", "boricua", "mofongo", "pernil", "tostones"],
    jamaican: ["jamaican", "jerk chicken", "curry goat", "oxtail"],
    american: ["american", "new american", "southern", "soul food"], latin: ["latin", "latin american", "colombian", "peruvian", "brazilian", "argentinian", "cuban", "puerto rican"], mediterranean: ["mediterranean", "greek", "turkish", "lebanese", "middle eastern", "israeli", "moroccan"], french: ["french"], spanish: ["spanish", "tapas"], portuguese: ["portuguese"], german: ["german"], irish: ["irish"], british: ["british"], indian: ["indian"], pakistani: ["pakistani"], bangladeshi: ["bangladeshi"], nepalese: ["nepalese"], thai: ["thai"], vietnamese: ["vietnamese"], chinese: ["chinese", "cantonese", "szechuan", "sichuan", "shanghainese", "taiwanese", "dim sum", "hot pot"], korean: ["korean"], japanese: ["japanese", "ramen", "izakaya", "teppanyaki", "hibachi"], filipino: ["filipino"], indonesian: ["indonesian"], malaysian: ["malaysian"], singaporean: ["singaporean"], african: ["african", "nigerian", "ethiopian", "senegalese", "ghanaian", "south african"], vegan: ["vegan", "plant-based"], vegetarian: ["vegetarian"], "gluten-free": ["gluten-free"], kosher: ["kosher"], halal: ["halal"], bbq: ["bbq", "barbecue"], burger: ["burger"], chicken: ["chicken", "wings", "fried chicken"], bakery: ["bakery"], cafe: ["cafe"], "wine bar": ["wine bar"], "cocktail bar": ["cocktail bar"], lounge: ["lounge restaurant"]
};
exports.ROOFTOP_RESTAURANT_FEATURE_TERMS = [
    "rooftop",
    "rooftop restaurant",
    "rooftop dining",
    "terrace",
    "outdoor dining",
    "skyline",
    "skyline views",
    "scenic views",
    "views",
    "roof deck",
    "roof top",
    "patio",
    "outdoor seating",
    "city views",
    "waterfront views",
];
function hasRooftopRestaurantFeatureLanguage(query) {
    const q = String(query || "").toLowerCase();
    return /\b(rooftop|roof top|roof deck|terrace|patio|outdoor dining|outdoor seating|skyline|skyline views|scenic views|city views|waterfront views|views)\b/i.test(q);
}
function userAskedForRooftopRestaurant(query) {
    const q = String(query || "").toLowerCase();
    const rooftopRestaurant = /\b(rooftop|roof top)\s+(restaurant|dinner|dining|brunch|lunch|breakfast|vibes?|with views)\b/i.test(q) ||
        /\b(rooftop|roof top)\s+(?:in|near|around)\s+[a-z][a-z\s-]+\b/i.test(q) ||
        /\b(restaurant|dinner|dining|brunch|lunch|breakfast)\s+(on|at|with|inside)?\s*(a\s+)?(rooftop|roof top)\b/i.test(q) ||
        /\brestaurant with (?:a )?(rooftop|roof top|skyline views|views|outdoor dining|terrace)\b/i.test(q) ||
        /\b(skyline views|scenic views|terrace|outdoor dining|roof deck)\b/i.test(q) ||
        /\b(skyline views|terrace|outdoor dining)\s+vibes?\b/i.test(q);
    const rooftopActivity = /\b(rooftop|roof top)\s+(drinks?|cocktails?|bars?|lounges?|nightlife)\b/i.test(q) ||
        /\b(drinks?|cocktails?|bars?|lounges?|nightlife)\b[^.?!]{0,50}\b(rooftop|roof top)\b/i.test(q);
    return rooftopRestaurant && !rooftopActivity;
}
function hasBroadOutingOccasionLanguage(query) {
    const q = String(query || "").toLowerCase();
    return /\b(date night|first date|romantic date|anniversary date|couples night|double date|girls night|girls night out|birthday night out|night out)\b/i.test(q);
}
function hasRestaurantOnlyLanguage(query) {
    const q = String(query || "").toLowerCase();
    return /\b(restaurant|restaurants|dinner only|food only|just dinner|only dinner|romantic restaurant|date night restaurant|date night dinner)\b/i.test(q);
}
function hasActivityOnlyLanguage(query) {
    const q = String(query || "").toLowerCase();
    return /\b(activity only|activities only|things to do only|just activities|only activities|date ideas|date activities)\b/i.test(q);
}
function detectBroadOutingOccasion(query) {
    const q = String(query || "").toLowerCase();
    const match = q.match(/\b(date night|first date|romantic date|anniversary date|couples night|double date|girls night out|girls night|birthday night out|night out)\b/i);
    return match?.[1]?.toLowerCase() ?? null;
}
exports.ACTIVITY_SYNONYMS = {
    bowling: ["bowling", "bowling alley", "bowling lanes", "games", "entertainment"],
    karaoke: ["karaoke", "karaoke bar", "private karaoke", "karaoke lounge", "sing along"],
    hookah: ["hookah", "hookah lounge", "hookah bar", "shisha"],
    "live music": ["live music", "concert", "jazz club"],
    dancing: ["dancing", "dance", "dance club", "nightlife", "music"],
    museum: ["museum", "exhibit", "exhibition", "cultural center"],
    lounge: ["lounge", "bar", "cocktail bar"],
    rooftop: [
        "rooftop",
        "roof top",
        "rooftop bar",
        "rooftop lounge",
        "rooftop drinks",
        "rooftop cocktails",
        "terrace bar",
        "terrace lounge",
        "skyline bar",
        "skyline lounge",
        "city views",
        "view",
        "views",
        "roof deck",
        "outdoor bar",
    ],
    drinks: [
        "drinks",
        "cocktails",
        "cocktail bar",
        "bar",
        "wine bar",
        "lounge",
        "speakeasy",
    ],
    "group night": [
        "group night",
    ],
    "relaxed activity": [
        "relaxed activity",
        "relaxing activity",
        "chill activity",
        "easy activity",
        "casual activity",
        "dessert",
        "coffee",
        "cafe",
        "board games",
        "mini golf",
        "bowling",
        "gallery",
        "art gallery",
        "museum",
        "scenic walk",
        "park",
        "billiards",
        "paint and sip",
        "low-key live music",
    ],
    comedy: ["comedy club", "comedy show", "comedy", "stand up comedy", "standup comedy", "improv", "live entertainment"],
    "wine tasting": ["wine tasting"],
    brewery: ["brewery", "beer garden"],
    arcade: ["arcade", "games", "game room", "amusement", "entertainment"],
    billiards: ["pool hall", "billiards", "pool table", "games"],
    darts: ["darts"],
    "axe throwing": ["axe throwing"],
    "escape room": ["escape room"],
    vr: ["vr", "virtual reality", "immersive experience"],
    trivia: ["trivia"],
    "board games": ["board games"],
    "paint and sip": ["paint and sip", "sip and paint"],
    pottery: ["pottery"],
    "cooking class": ["cooking class"],
    "dance class": ["dance class"],
    movies: ["movie theater", "cinema", "movie", "movies"],
    theater: ["theater", "theatre", "broadway", "off-broadway", "show", "play", "musical"],
    gallery: ["art gallery", "gallery"],
    poetry: ["poetry"],
    bookstore: ["bookstore", "library event"],
    park: ["park", "waterfront", "pier", "beach", "boardwalk", "garden", "botanical garden", "zoo", "aquarium", "boat ride", "cruise", "rooftop view", "observation deck", "walking tour", "sightseeing"],
    spa: ["spa", "massage", "sauna", "wellness", "head spa", "float spa", "yoga spa", "recovery spa"],
    "active recreation": [
        "skating", "roller skating", "ice skating", "batting cages", "climbing", "rock climbing", "gym",
    ],
    "mini golf": ["mini golf", "putt putt", "games"],
    golf: ["golf"],
    sports: ["basketball", "football", "baseball", "hockey", "soccer"],
    "sports bar": [
        "sports bar", "sports lounge", "sport lounge", "bar with tv", "bar with tvs", "bar with screens", "tv bar", "tvs", "tv", "big screen", "big screens", "watch party", "game day", "game night", "live sports", "sports viewing", "pub", "tavern", "bar and grill",
    ],
    shopping: ["mall", "shopping", "market", "flea market", "pop-up", "festival", "fair"],
    "family friendly": ["family friendly", "kid friendly", "kids", "all ages"],
    "romantic activity": ["romantic activity", "date activity", "date idea"],
    "outdoor activity": ["outdoor activity", "park", "garden", "botanical garden", "waterfront", "pier", "walking tour", "boat ride", "observation deck"],
};
exports.GENERIC_ACTIVITY_SIGNAL_TERMS = [
    "activity",
    "activities",
    "thing to do",
    "things to do",
    "something to do",
    "something fun",
    "fun",
    "fun activity",
    "relaxed activity",
    "chill activity",
    "low key activity",
    "date idea",
    "date activity",
    "outing",
    "experience",
    "entertainment",
    "indoor activity",
    "outdoor activity",
];
exports.COMPACT_GENERIC_ACTIVITY_RPC_TERMS = [
    "arcade",
    "bowling",
    "billiards",
    "games",
    "museum",
    "gallery",
    "mini golf",
    "lounge",
];
exports.GENERIC_ACTIVITY_FALLBACK_TERMS = [
    "activity",
    "things to do",
    "entertainment",
    "experience",
    "lounge",
    "arcade",
    "bowling",
    "billiards",
    "games",
    "mini golf",
    "museum",
    "gallery",
    "live music",
    "rooftop",
    "comedy",
    "karaoke",
];
function hasGenericActivitySignal(query) {
    const q = String(query || "").toLowerCase();
    return exports.GENERIC_ACTIVITY_SIGNAL_TERMS.some((term) => (0, exports.includesPhrase)(q, term));
}
function hasOnlyGenericActivityTerms(terms) {
    if (!terms.length)
        return true;
    const generic = new Set(exports.GENERIC_ACTIVITY_SIGNAL_TERMS.map((term) => term.toLowerCase()));
    generic.add("thing to do");
    generic.add("things to do");
    return terms.every((term) => generic.has(term.toLowerCase()));
}
exports.FOOD_WITH_TERMS = [
    "wings", "wing", "chicken wings", "chicken", "fried chicken", "hot chicken",
    "burger", "burgers", "taco", "tacos", "pizza", "pasta", "sushi", "ramen",
    "seafood", "steak", "steakhouse", "brunch", "breakfast", "lunch", "dinner",
    "dessert", "pastries", "coffee", "vegan", "vegetarian", "halal", "jamaican",
    "caribbean", "thai", "italian", "mexican", "soul food", "bbq", "bar food",
    "small bites", "food", "mediterranean", "bottomless mimosas",
];
exports.VENUE_WITH_TERMS = [
    "restaurant", "spot", "place", "bar", "bars", "sports bar", "pub", "tavern",
    "brewery", "beer hall", "gastropub", "lounge", "rooftop", "rooftop bar",
    "cafe", "coffee shop", "bakery", "diner", "brunch spot", "pizza place",
    "burger spot", "seafood restaurant", "steakhouse", "sushi spot", "ramen spot",
    "halal restaurant", "vegan restaurant",
];
exports.SINGLE_VENUE_FEATURE_TERMS = [
    "drinks", "cocktails", "beer", "wine", "happy hour", "outdoor seating", "patio",
    "rooftop", "views", "hookah", "live music", "dj", "dancing", "karaoke",
    "games", "arcade", "pool", "billiards", "sports", "tv", "game watch",
    "dessert", "coffee", "pastries", "small bites", "bottomless mimosas", "rooftop views", "food",
];
exports.TRUE_SEQUENCE_CONNECTORS = [
    "then", "after", "afterwards", "before", "later", "nearby after",
    "activity after", "things to do after", "drinks after", "bar after",
    "lounge after", "hookah after", "show after",
];
function escapeRegex(term) {
    return String(term || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function withTermPattern(term) {
    return new RegExp(`\\b${escapeRegex(term).replace(/\\s+/g, "\\\\s+")}\\b`, "i");
}
function uniqueIntentTerms(items) {
    return uniq(items);
}
function hasExplicitTwoStopLanguage(query) {
    const q = String(query || "").toLowerCase().replaceAll("_", " ").replaceAll("-", " ").replace(/\s+/g, " ").trim();
    return /\b(after|afterward|afterwards|before|then|followed by|next|second stop|separate spots|nearby|close by|close to|near each other|walking distance|walkable|around the corner|apart)\b/.test(q)
        || /\b(?:pairs?|two places?|two spots?)\b[^.?!]{0,60}\b(?:close together|near each other|nearby|close by|walkable|walking distance)\b/.test(q)
        || /\b(?:close together|near each other|nearby|close by|walkable|walking distance)\b[^.?!]{0,60}\b(?:pairs?|two places?|two spots?)\b/.test(q)
        || /\bwithin\s+\d+\s*(?:minutes?|mins?|miles?|mi)\b/.test(q)
        || /\b\d+\s*(?:minute|min)\s+walk\b/.test(q)
        || /\bnear\s+(?:a|the)\s+hookah\b/.test(q)
        || /\bhookah\b[^.?!]{0,40}\bafter\b[^.?!]{0,40}\b(?:dinner|food|restaurant|dining)\b/.test(q)
        || /\b(?:dinner|food|restaurant|dining)\b[^.?!]{0,40}\bthen\b[^.?!]{0,40}\bhookah\b/.test(q);
}
function hasSameLocationFoodFeatureIntent(query) {
    const q = String(query || "").toLowerCase().replaceAll("_", " ").replaceAll("-", " ").replace(/\s+/g, " ").trim();
    if (hasExplicitTwoStopLanguage(q))
        return false;
    const hasFood = /\b(dinner|food|eat|eats|restaurant|restaurants|dining|brunch|lunch|breakfast|cuisine|steak|steakhouse|seafood|sushi|italian|mexican|caribbean|mediterranean|pizza|coffee shop|coffee|cafe|café|bakery|burger|ramen|thai|chinese|japanese|korean|indian|halal|vegan|vegetarian|bbq|barbecue)\b/.test(q);
    const hasFeature = /\b(hookah|shisha|live music|live jazz|jazz|rooftop views|rooftop|roof top|lounge|cocktails|drinks|karaoke|arcade games|arcade|outdoor seating|outdoor dining|patio|terrace)\b/.test(q);
    return hasFood && hasFeature;
}
function hasTrueSequenceConnector(q) {
    const text = String(q || "").toLowerCase();
    return /\b(then|after|afterwards|afterward|followed by|next|second stop|first|before|later)\b/.test(text)
        || /\b(things to do after|activity after|drinks after|bar after|lounge after|hookah after|show after)\b/.test(text);
}
function hasTrueProximityPairingConnector(q) {
    const text = String(q || "").toLowerCase();
    return /\b(near a|near the|nearby a|nearby|close to|close together|walking distance to|within walking distance of|around the corner from|next to)\b/.test(text)
        || /\b(?:pairs?|two places?|two spots?)\b[^.?!]{0,60}\b(?:close together|near each other|nearby|close by|walkable|walking distance)\b/.test(text);
}
function hasSingleVenueWithConnector(q) {
    const text = String(q || "").toLowerCase();
    return /\b(with|has|have|that has|that have|serving|serves|offering|offers|featuring|features|including|includes)\b/.test(text);
}
function expandVenueTerms(terms) {
    return uniq(terms.flatMap((term) => {
        switch (term.toLowerCase()) {
            case "bar":
            case "bars":
                return ["bar", "sports bar", "pub"];
            case "sports bar":
                return ["sports bar", "bar", "pub", "game watch", "tv"];
            case "lounge":
                return ["lounge", "bar", "nightlife"];
            case "rooftop":
                return ["rooftop", "rooftop bar", "views"];
            default:
                return [term];
        }
    }));
}
function expandFoodTerms(terms) {
    return uniq(terms.flatMap((term) => {
        switch (term.toLowerCase()) {
            case "wing":
            case "wings":
                return ["wings", "chicken wings"];
            case "burger":
            case "burgers":
                return ["burger", "burgers"];
            case "taco":
            case "tacos":
                return ["taco", "tacos", "mexican"];
            case "vegan":
                return ["vegan", "vegan restaurant", "plant based", "plant-based"];
            case "halal":
                return ["halal", "halal food", "halal restaurant"];
            default:
                return [term];
        }
    }));
}
function expandFeatureTerms(terms) {
    return uniq(terms.flatMap((term) => {
        switch (term.toLowerCase()) {
            case "drinks":
                return ["drinks", "cocktails", "bar"];
            case "cocktails":
                return ["drinks", "cocktails", "bar"];
            case "happy hour":
                return ["happy hour", "drinks", "bar"];
            case "hookah":
                return ["hookah", "hookah lounge", "shisha", "lounge"];
            case "live music":
                return ["live music", "music"];
            case "games":
                return ["games", "arcade", "pool", "billiards"];
            case "outdoor seating":
                return ["outdoor seating", "patio"];
            default:
                return [term];
        }
    }));
}
function extractSingleVenueWithTerms(q) {
    const text = String(q || "").toLowerCase();
    const venueTerms = exports.VENUE_WITH_TERMS.filter((term) => withTermPattern(term).test(text));
    const foodTerms = exports.FOOD_WITH_TERMS.filter((term) => withTermPattern(term).test(text));
    const featureTerms = exports.SINGLE_VENUE_FEATURE_TERMS.filter((term) => withTermPattern(term).test(text));
    return {
        venueTerms: uniq(expandVenueTerms(venueTerms)),
        foodTerms: uniq(expandFoodTerms(foodTerms)),
        featureTerms: uniq(expandFeatureTerms(featureTerms)),
    };
}
function detectSingleVenueWithIntent(q) {
    const text = String(q || "").toLowerCase();
    const sameLocationFoodFeature = hasSameLocationFoodFeatureIntent(text);
    if ((!hasSingleVenueWithConnector(text) && !sameLocationFoodFeature) || hasExplicitTwoStopLanguage(text) || hasTrueSequenceConnector(text)) {
        return { matched: false, venueTerms: [], foodTerms: [], featureTerms: [], activityLikeFeatureTerms: [], geoText: null };
    }
    const terms = extractSingleVenueWithTerms(text);
    const hasRestaurantStyleVenue = terms.venueTerms.some((term) => /restaurant|spot|place|cafe|coffee shop|bakery|diner|steakhouse|bar|lounge|rooftop/.test(term));
    const hasValidPair = (terms.venueTerms.length > 0 && terms.featureTerms.length > 0) ||
        (terms.venueTerms.length > 0 && terms.foodTerms.length > 0) ||
        (terms.foodTerms.length > 0 && terms.featureTerms.length > 0) ||
        (hasRestaurantStyleVenue && terms.featureTerms.length > 0);
    const matched = hasValidPair;
    return {
        matched,
        ...terms,
        activityLikeFeatureTerms: terms.featureTerms.filter((term) => /hookah|live music|music|dj|dancing|karaoke|games|arcade|pool|billiards|sports|tv|game watch/.test(term)),
        geoText: null,
    };
}
function isSingleVenueWithIntent(q) {
    return detectSingleVenueWithIntent(q).matched;
}
exports.FOOD_TERMS = uniq(Object.values(exports.FOOD_SYNONYMS).flat());
exports.MEAL_TERMS = uniq(Object.values(exports.MEAL_SYNONYMS).flat());
exports.ACTIVITY_TERMS = uniq(Object.values(exports.ACTIVITY_SYNONYMS).flat());
function detectFromMap(query, map) {
    const q = query.toLowerCase();
    return uniq(Object.entries(map).flatMap(([canonical, terms]) => terms.some((term) => (0, exports.includesPhrase)(q, term)) ? [canonical, ...terms.filter((term) => (0, exports.includesPhrase)(q, term))] : []));
}
function detectFoodTerms(query) { return detectFromMap(query, exports.FOOD_SYNONYMS); }
function detectCuisineTerms(query) { return detectFoodTerms(query).filter((t) => !["rooftop"].includes(t)); }
function detectMealTerms(query) { return detectFromMap(query, exports.MEAL_SYNONYMS); }
function hasExplicitHookahIntent(query) {
    return /\b(hookah|shisha|hookah lounge|hookah bar)\b/i.test(query);
}
const HOOKAH_FOCUSED_ACTIVITY_TERMS = ["hookah", "hookah lounge", "shisha", "hookah bar"];
const HOOKAH_PRUNED_BROAD_ACTIVITY_TERMS = ["nightlife", "bar", "rooftop lounge", "club", "dance club", "dancing", "live dj", "speakeasy", "drinks", "cocktails"];
const ROOFTOP_ACTIVITY_TERMS = new Set([
    "rooftop",
    "roof top",
    "rooftop bar",
    "rooftop lounge",
    "rooftop drinks",
    "rooftop cocktails",
    "terrace bar",
    "terrace lounge",
    "skyline bar",
    "skyline lounge",
    "city views",
    "view",
    "views",
    "roof deck",
    "outdoor bar",
]);
function queryOutsideHookahPhrases(query) {
    return query
        .toLowerCase()
        .replace(/\bhookah\s+(?:lounge|bar)\b/gi, " ")
        .replace(/\b(?:hookah|shisha)\b/gi, " ");
}
function explicitHookahCompatibleActivityTerms(query) {
    const qWithoutHookah = queryOutsideHookahPhrases(query);
    const terms = HOOKAH_PRUNED_BROAD_ACTIVITY_TERMS.filter((term) => (0, exports.includesPhrase)(qWithoutHookah, term));
    if (terms.includes("drinks") && !terms.includes("cocktails")) {
        terms.push("cocktails");
    }
    if (terms.includes("cocktails") && !terms.includes("drinks")) {
        terms.push("drinks");
    }
    return terms;
}
function detectActivityTerms(query) {
    const q = query.toLowerCase();
    const hasExplicitRelaxedActivity = (0, exports.includesPhrase)(q, "relaxed activity") ||
        (0, exports.includesPhrase)(q, "relaxing activity") ||
        (0, exports.includesPhrase)(q, "chill activity") ||
        (0, exports.includesPhrase)(q, "easy activity") ||
        (0, exports.includesPhrase)(q, "quiet activity") ||
        (0, exports.includesPhrase)(q, "casual activity") ||
        (0, exports.includesPhrase)(q, "something fun") ||
        (0, exports.includesPhrase)(q, "fun but not loud") ||
        (0, exports.includesPhrase)(q, "not a club but still fun") ||
        (0, exports.includesPhrase)(q, "activity no club");
    const relaxedActivityTerms = new Set([
        "relaxed activity",
        "relaxing activity",
        "chill activity",
        "easy activity",
        "casual activity",
    ]);
    const hasRooftop = (0, exports.includesPhrase)(q, "rooftop") || (0, exports.includesPhrase)(q, "roof top");
    const hasDrinkOrNightlife = (0, exports.includesPhrase)(q, "drinks") ||
        (0, exports.includesPhrase)(q, "cocktails") ||
        (0, exports.includesPhrase)(q, "bar") ||
        (0, exports.includesPhrase)(q, "lounge") ||
        (0, exports.includesPhrase)(q, "nightlife");
    const rooftopActivityContext = hasRooftop && hasDrinkOrNightlife;
    const terms = detectFromMap(query, exports.ACTIVITY_SYNONYMS).filter((term) => (hasExplicitRelaxedActivity || !relaxedActivityTerms.has(term)) &&
        (rooftopActivityContext || !ROOFTOP_ACTIVITY_TERMS.has(term)));
    if ((0, exports.includesPhrase)(q, "things to do") || (0, exports.includesPhrase)(q, "thing to do") || (0, exports.includesPhrase)(q, "something to do") || (0, exports.includesPhrase)(q, "fun things")) {
        terms.push("things to do", "activity");
    }
    if ((0, exports.includesPhrase)(q, "something fun")) {
        terms.push("something fun", "fun", "activity");
    }
    if ((0, exports.includesPhrase)(q, "fun activity")) {
        terms.push("fun activity", "fun", "activity");
    }
    if ((0, exports.includesPhrase)(q, "date idea") || (0, exports.includesPhrase)(q, "date activity")) {
        terms.push("date idea", "date activity", "activity");
    }
    if ((0, exports.includesPhrase)(q, "outing") || (0, exports.includesPhrase)(q, "experience") || (0, exports.includesPhrase)(q, "entertainment")) {
        terms.push(...["outing", "experience", "entertainment"].filter((term) => (0, exports.includesPhrase)(q, term)));
    }
    if ((0, exports.includesPhrase)(q, "activity") || (0, exports.includesPhrase)(q, "activities")) {
        terms.push("activity");
    }
    if ((0, exports.includesPhrase)(q, "indoor activity")) {
        terms.push("indoor activity", "activity", "arcade", "bowling", "museum", "gallery", "games");
    }
    if ((0, exports.includesPhrase)(q, "outdoor activity")) {
        terms.push("outdoor activity", "activity", "park", "rooftop", "walking tour");
    }
    if (hasExplicitRelaxedActivity) {
        terms.push("relaxed activity", "chill activity", "easy activity", "low key", "laid back", "casual activity", "board games", "arcade", "mini golf", "bowling", "gallery", "museum", "billiards", "pool hall", "paint and sip", "cafe", "dessert");
    }
    if ((0, exports.includesPhrase)(q, "group night") || (0, exports.includesPhrase)(q, "group night")) {
        terms.push("group night");
        if (/\b(nightlife|club|dancing|dance club|live dj|rooftop lounge|lounge|bar)\b/i.test(q)) {
            terms.push(...["nightlife", "club", "dancing", "dance club", "live dj", "rooftop lounge", "lounge", "bar"].filter((term) => (0, exports.includesPhrase)(q, term)));
        }
    }
    if ((0, exports.includesPhrase)(q, "drinks") || (0, exports.includesPhrase)(q, "cocktails")) {
        terms.push("drinks", "cocktails", "lounge", "bar", "wine bar", "speakeasy");
    }
    if (rooftopActivityContext) {
        terms.push("rooftop", "rooftop bar", "rooftop lounge", "rooftop drinks", "rooftop cocktails", "drinks", "cocktails", "bar", "lounge");
    }
    if ((0, exports.includesPhrase)(q, "bowl") && /(lane|game|entertainment|alley|bowling|activity)/i.test(q)) {
        terms.push("bowling");
    }
    if (hasExplicitHookahIntent(query)) {
        return uniq([
            ...HOOKAH_FOCUSED_ACTIVITY_TERMS,
            ...explicitHookahCompatibleActivityTerms(query),
        ]);
    }
    return uniq(terms);
}
const TRUSTED_ACTIVITY_FIELDS = [
    "activity_type",
    "primary_category",
    "category",
    "categories",
    "subcategories",
    "google_types",
    "osm_tags",
    "location_type",
    "primary_tag",
    "source_category",
    "source_categories",
    "provider_category",
    "provider_categories",
    "provider_types",
    "canonical_category",
    "canonical_categories",
    "canonical_activity_type",
    "verified_category",
    "verified_categories",
    "place_types",
];
const WEAK_ACTIVITY_FIELDS = [
    "tags",
    "search_terms",
    "search_keywords",
    "amenities",
    "vibe_tags",
    "best_for_tags",
    "date_style_tags",
    "semantic_tags",
    "intent_tags",
    "search_document",
    "semantic_search_text",
];
const NAME_ONLY_FIELDS = ["name", "restaurant_name", "activity_name"];
const CONFLICTING_ACTIVITY_CATEGORIES = [
    "park",
    "public park",
    "garden",
    "plaza",
    "playground",
    "monument",
    "landmark",
    "transit station",
    "subway station",
    "neighborhood",
    "road",
    "street",
];
const STRUCTURED_ACTIVITY_EVIDENCE = {
    bowling: [
        "bowling",
        "bowling alley",
        "bowling center",
        "bowling centre",
        "bowling lounge",
        "ten pin bowling",
        "ten-pin bowling",
        "duckpin bowling",
        "duck pin bowling",
        "bowling_alley",
    ],
    golf: ["golf", "mini golf", "miniature golf", "golf course", "driving range"],
    museum: ["museum", "art museum", "history museum"],
    cinema: ["cinema", "movie theater", "movie theatre", "film center", "film centre"],
    comedy: ["comedy", "comedy club", "stand up comedy", "stand-up comedy"],
    park: ["park", "public park", "garden", "outdoor", "green space"],
};
function normalizeEvidenceText(value) {
    return value.toLowerCase().replaceAll("_", " ").replaceAll("-", " ").trim();
}
function evidenceValues(record, fields) {
    return fields.flatMap((field) => {
        const value = record[field];
        if (Array.isArray(value))
            return value.map(String);
        if (value && typeof value === "object")
            return Object.entries(value).flatMap(([key, item]) => [key, String(item)]);
        return value == null ? [] : [String(value)];
    }).map(normalizeEvidenceText).filter(Boolean);
}
function matchingEvidence(values, terms) {
    return values.filter((value) => terms.some((term) => (0, exports.includesPhrase)(value, term)));
}
function nameOnlyRecordText(record) {
    return NAME_ONLY_FIELDS
        .map((field) => record[field])
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}
function canonicalActivityTerm(term) {
    const normalized = term.toLowerCase().replaceAll("_", " ").replaceAll("-", " ").trim();
    if (/\bbowling\b|\bbowling alley\b/.test(normalized))
        return "bowling";
    if (/\bgolf\b/.test(normalized))
        return "golf";
    if (/\bmuseum\b/.test(normalized))
        return "museum";
    if (/\bcinema\b|\bmovie theater\b|\bmovie theatre\b/.test(normalized))
        return "cinema";
    if (/\bcomedy\b/.test(normalized))
        return "comedy";
    if (/\bpark\b/.test(normalized))
        return "park";
    return normalized;
}
function qualifyExplicitActivityIntent(record, terms) {
    const specificTerms = uniq(terms).filter((term) => !["activity", "activities", "things to do", "experience"].includes(term));
    if (specificTerms.length === 0)
        return { matches: true, reason: "generic_activity_intent" };
    const trustedValues = evidenceValues(record, TRUSTED_ACTIVITY_FIELDS);
    const weakValues = evidenceValues(record, WEAK_ACTIVITY_FIELDS);
    const nameText = nameOnlyRecordText(record);
    const requestedCanonicalActivities = specificTerms.map(canonicalActivityTerm);
    const requestedCanonicalActivity = requestedCanonicalActivities[0] ?? null;
    const conflictEvidence = matchingEvidence(trustedValues, CONFLICTING_ACTIVITY_CATEGORIES);
    const hasConflict = conflictEvidence.length > 0;
    const trustedMatchTerms = requestedCanonicalActivities.flatMap((canonical, index) => {
        const evidence = STRUCTURED_ACTIVITY_EVIDENCE[canonical];
        if (evidence)
            return evidence;
        return [specificTerms[index] ?? canonical];
    });
    const trustedEvidence = matchingEvidence(trustedValues, trustedMatchTerms);
    const weakEvidence = [
        ...matchingEvidence(weakValues, trustedMatchTerms),
        ...requestedCanonicalActivities.filter((term) => (0, exports.includesPhrase)(nameText, term)),
    ];
    const hasStructuredMatch = trustedEvidence.length > 0;
    if (hasConflict) {
        return {
            matches: false,
            reason: "conflicting_authoritative_category",
            requestedCanonicalActivity,
            trustedEvidence,
            weakEvidence,
            conflictingTrustedEvidence: conflictEvidence,
        };
    }
    if (hasStructuredMatch) {
        return {
            matches: true,
            reason: "structured_activity_match",
            requestedCanonicalActivity,
            trustedEvidence,
            weakEvidence,
            conflictingTrustedEvidence: [],
        };
    }
    return {
        matches: false,
        reason: "missing_structured_activity_evidence",
        requestedCanonicalActivity,
        trustedEvidence,
        weakEvidence,
        conflictingTrustedEvidence: [],
    };
}
function expandFoodSynonyms(terms) { return uniq(terms.flatMap((term) => exports.FOOD_SYNONYMS[term.toLowerCase()] ?? [term])); }
function expandActivitySynonyms(terms) { return uniq(terms.flatMap((term) => exports.ACTIVITY_SYNONYMS[term.toLowerCase()] ?? [term])); }
function isSpecificFoodIntent(intent) { return intent.foodTerms.length > 0 || intent.cuisineTerms.length > 0 || intent.categoryTerms.some((t) => !["restaurant", "dining"].includes(t)); }
function isGenericMealIntent(intent) { return !isSpecificFoodIntent(intent) && intent.mealTerms.length > 0; }
function isSpecificActivityIntent(intent) { return intent.activityTerms.some((t) => !["things to do", "activity"].includes(t)) || intent.categoryTerms.length > 0; }
function textForRecord(record) { return [record.name, record.restaurant_name, record.activity_name, record.location_type, record.primary_category, record.cuisine, record.cuisine_type, record.activity_type, record.description, record.neighborhood, record.borough, record.city, record.state, record.search_document, record.semantic_search_text, record.tags, record.vibe_tags, record.best_for_tags, record.date_style_tags, record.search_keywords, record.google_types, record.semantic_tags, record.intent_tags].flat().join(" ").toLowerCase(); }
function termMatchesRecord(record, terms) { const text = textForRecord(record); return terms.some((term) => (0, exports.includesPhrase)(text, term) || text.includes(term.toLowerCase())); }
function activityTermMatches(record, terms) { return qualifyExplicitActivityIntent(record, terms).matches; }
exports.PLACE_OF_WORSHIP_TERMS = [
    "temple",
    "hindu temple",
    "church",
    "chapel",
    "cathedral",
    "mosque",
    "masjid",
    "synagogue",
    "shul",
    "place of worship",
    "religious organization",
    "religious center",
    "worship center",
    "spiritual center",
    "shrine",
    "mission",
    "ministry",
    "parish",
    "congregation",
];
exports.NON_RESTAURANT_CATEGORY_TERMS = [
    ...exports.PLACE_OF_WORSHIP_TERMS,
    "theater",
    "theatre",
    "performing arts",
    "movie theater",
    "cinema",
    "museum",
    "gallery",
    "art gallery",
    "park",
    "garden",
    "botanical garden",
    "zoo",
    "aquarium",
    "bowling",
    "bowling alley",
    "arcade",
    "escape room",
    "karaoke",
    "night club",
    "dance club",
    "club",
    "event venue",
    "auditorium",
    "stadium",
    "arena",
    "library",
    "bookstore",
    "spa",
    "gym",
    "fitness",
];
exports.RESTAURANT_CATEGORY_TERMS = [
    "restaurant",
    "restaurants",
    "dining",
    "food",
    "eatery",
    "cafe",
    "coffee",
    "bakery",
    "brunch",
    "breakfast",
    "lunch",
    "dinner",
    "steakhouse",
    "seafood",
    "sushi",
    "italian",
    "mexican",
    "caribbean",
    "american",
    "latin",
    "mediterranean",
    "french",
    "spanish",
    "indian restaurant",
    "thai restaurant",
    "chinese restaurant",
    "japanese restaurant",
    "korean restaurant",
    "bar and grill",
    "grill",
    "bistro",
    "tavern",
    "gastropub",
    "wine bar",
    "cocktail bar",
    "lounge restaurant",
];
function hasAnyTerm(text, terms) {
    const normalized = String(text || "")
        .toLowerCase()
        .replaceAll("_", " ")
        .replaceAll("-", " ");
    return terms.some((term) => {
        const t = term.toLowerCase();
        return (0, exports.includesPhrase)(normalized, t) || normalized.includes(t);
    });
}
function userAskedForPlaceOfWorship(query) {
    const normalized = String(query || "").toLowerCase();
    if (/\b(dinner|restaurant|restaurants|dining|brunch|lunch|breakfast|food)\b/.test(normalized) &&
        /\b(near|nearby|by|around|close to)\b/.test(normalized) &&
        hasAnyTerm(normalized, exports.PLACE_OF_WORSHIP_TERMS)) {
        return false;
    }
    return hasAnyTerm(query, exports.PLACE_OF_WORSHIP_TERMS);
}
const createEmptyRestaurantIntent = () => ({ mealTerms: [], foodTerms: [], cuisineTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [], alternativeGroups: [] });
exports.createEmptyRestaurantIntent = createEmptyRestaurantIntent;
const createEmptyActivityIntent = () => ({ activityTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [], alternativeGroups: [] });
exports.createEmptyActivityIntent = createEmptyActivityIntent;
