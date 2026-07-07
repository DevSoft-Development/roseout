"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPairDistanceMiles = void 0;
exports.createPairingDebug = createPairingDebug;
exports.buildPairDistanceLabel = buildPairDistanceLabel;
exports.scorePair = scorePair;
exports.buildPairTitle = buildPairTitle;
exports.buildPairExplanation = buildPairExplanation;
exports.createSearchPairs = createSearchPairs;
exports.getPairCityState = getPairCityState;
exports.getPairGeoPriority = getPairGeoPriority;
exports.createActivityActivityPairs = createActivityActivityPairs;
const distance_1 = require("./distance");
Object.defineProperty(exports, "getPairDistanceMiles", { enumerable: true, get: function () { return distance_1.getPairDistanceMiles; } });
const geo_taxonomy_1 = require("./geo-taxonomy");
const titleCase = (s) => s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
const sameText = (a, b) => Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());
function createPairingDebug() {
    return {
        pairCandidatesEvaluated: 0,
        pairsRejectedForDistance: 0,
        pairsRejectedForMissingCoordinates: 0,
        walkablePairsFound: 0,
        validPairCountBeforeRender: 0,
        pairsRejectedForWalkingMinutes: 0,
        walkingPairsHiddenOverLimit: 0,
        walkingPairRejectReasons: {},
        extremeWalkingRoutesRejected: 0,
        invalidWalkingRoutesHiddenFromDisplay: 0,
        suppressedLowQualityPairCount: 0,
        pairCandidatesRejectedByDistance: 0,
        pairDistanceGuardApplied: false,
        invalidPairsSuppressed: 0,
        rejectedPairs: [],
    };
}
function pairPreference(intent) {
    return (intent.pairingPreference ?? {
        requiresPairing: intent.wantsPairing,
        distanceMode: "any",
        maxPairDistanceMiles: null,
        maxPairWalkingMinutes: null,
        requireWalkablePair: false,
    });
}
function distanceBonus(distanceMiles, mode) {
    if (distanceMiles == null)
        return 0;
    if (distanceMiles <= 0.25)
        return 50;
    if (distanceMiles <= 0.5)
        return 40;
    if (distanceMiles <= 0.75)
        return 30;
    if (distanceMiles <= 1.5 && mode === "nearby")
        return 15;
    if (distanceMiles <= 3 && mode === "same_area")
        return 5;
    return 0;
}
function buildPairDistanceLabel(distanceMiles) {
    if (distanceMiles == null)
        return "Distance unavailable";
    if (distanceMiles <= 3)
        return `About a ${(0, distance_1.estimateWalkingMinutes)(distanceMiles)}-minute walk`;
    return "Not walking distance";
}
function scorePair(pair, intent) {
    const pref = pairPreference(intent);
    let score = Number(pair.restaurant.match_score ?? 0) +
        Number(pair.activity.match_score ?? 0) +
        (0, geo_taxonomy_1.scoreGeoMatch)(pair.restaurant, intent.geo) +
        (0, geo_taxonomy_1.scoreGeoMatch)(pair.activity, intent.geo);
    if (sameText(pair.restaurant.neighborhood, pair.activity.neighborhood))
        score += 120;
    else if (sameText(pair.restaurant.borough, pair.activity.borough))
        score += 80;
    else if (sameText(pair.restaurant.city, pair.activity.city))
        score += 50;
    score += distanceBonus(pair.pairDistanceMiles ?? pair.distance_miles, pref.distanceMode);
    return score;
}
function buildPairTitle(_pair, intent) {
    const food = intent.restaurantIntent.foodTerms.find((t) => !["restaurant", "dining"].includes(t)) ??
        intent.restaurantIntent.cuisineTerms[0] ??
        intent.restaurantIntent.mealTerms[0] ??
        "Food";
    const act = intent.activityIntent.activityTerms.find((t) => !["activity", "things to do"].includes(t)) ?? "Activity";
    return `${titleCase(food)} + ${titleCase(act)}`;
}
function buildPairExplanation(pair, intent) {
    const geo = intent.geo.neighborhood ??
        intent.geo.borough ??
        intent.geo.city ??
        intent.geo.county ??
        "your area";
    if (pair.isWalkable && pair.pairWalkingMinutes != null)
        return `This pair is walkable: the restaurant and activity are about a ${pair.pairWalkingMinutes}-minute walk apart.`;
    if (pair.isWalkable)
        return `Both spots are in ${geo} and close enough for an easy outing.`;
    const distance = pair.pairDistanceMiles != null
        ? `, about ${pair.pairDistanceMiles} miles apart`
        : "";
    return `This works because both options fit ${geo}${distance}, and match your restaurant + activity request.`;
}
function sortPairs(pairs, pref) {
    return pairs.sort((a, b) => {
        if (pref.requireWalkablePair && pref.distanceMode === "walking") {
            const am = a.pairWalkingMinutes ?? Number.POSITIVE_INFINITY;
            const bm = b.pairWalkingMinutes ?? Number.POSITIVE_INFINITY;
            if (am !== bm)
                return am - bm;
        }
        return b.score - a.score;
    });
}
function diversifyPairs(sortedPairs, limit = 3, maxPerRestaurant = 1, maxPerActivity = 1) {
    const finalPairs = [];
    const restaurantCounts = new Map();
    const activityCounts = new Map();
    const getRestaurantId = (pair) => String(pair.restaurant?.id || "");
    const getActivityId = (pair) => String(pair.activity?.id || "");
    const alreadyAdded = (pair) => finalPairs.some((existing) => getRestaurantId(existing) === getRestaurantId(pair) &&
        getActivityId(existing) === getActivityId(pair));
    const canAdd = (pair, options) => {
        const restaurantId = getRestaurantId(pair);
        const activityId = getActivityId(pair);
        if (!restaurantId || !activityId)
            return false;
        if (restaurantId === activityId)
            return false;
        if (alreadyAdded(pair))
            return false;
        const restaurantCount = restaurantCounts.get(restaurantId) || 0;
        const activityCount = activityCounts.get(activityId) || 0;
        if (options.requireNewRestaurant && restaurantCount > 0)
            return false;
        if (options.requireNewActivity && activityCount > 0)
            return false;
        if (restaurantCount >= maxPerRestaurant)
            return false;
        if (activityCount >= maxPerActivity)
            return false;
        return true;
    };
    const addPair = (pair) => {
        const restaurantId = getRestaurantId(pair);
        const activityId = getActivityId(pair);
        finalPairs.push(pair);
        restaurantCounts.set(restaurantId, (restaurantCounts.get(restaurantId) || 0) + 1);
        activityCounts.set(activityId, (activityCounts.get(activityId) || 0) + 1);
    };
    for (const pair of sortedPairs) {
        if (finalPairs.length >= limit)
            break;
        if (canAdd(pair, { requireNewRestaurant: true, requireNewActivity: true }))
            addPair(pair);
    }
    for (const pair of sortedPairs) {
        if (finalPairs.length >= limit)
            break;
        if (canAdd(pair, { requireNewRestaurant: false, requireNewActivity: true }))
            addPair(pair);
    }
    for (const pair of sortedPairs) {
        if (finalPairs.length >= limit)
            break;
        if (canAdd(pair, { requireNewRestaurant: false, requireNewActivity: false }))
            addPair(pair);
    }
    return finalPairs;
}
function createSearchPairs(restaurants, activities, intent, debug = createPairingDebug()) {
    const pairs = [];
    const pref = pairPreference(intent);
    debug.pairDistanceMode = pref.distanceMode;
    debug.maxAllowedPairDistanceMiles = pref.maxPairDistanceMiles;
    debug.maxAllowedPairWalkingMinutes = pref.maxPairWalkingMinutes;
    debug.pairDistanceGuardApplied = pref.requireWalkablePair || pref.distanceMode === "nearby" || pref.distanceMode === "walking";
    for (const restaurant of restaurants.slice(0, 12))
        for (const activity of activities.slice(0, 12)) {
            debug.pairCandidatesEvaluated += 1;
            if (String(restaurant.id) === String(activity.id)) {
                continue;
            }
            const walkability = (0, distance_1.isWalkablePair)(restaurant, activity, pref);
            const pairDistanceMiles = walkability.pairDistanceMiles;
            const pairWalkingMinutes = walkability.pairWalkingMinutes ??
                (pairDistanceMiles == null
                    ? null
                    : (0, distance_1.estimateWalkingMinutes)(pairDistanceMiles));
            const missingCoordinates = walkability.warnings.includes("missing_coordinates");
            if (missingCoordinates && pref.requireWalkablePair) {
                debug.pairsRejectedForMissingCoordinates += 1;
                debug.invalidPairsSuppressed += 1;
                debug.rejectedPairs.push({
                    restaurantId: restaurant.id,
                    activityId: activity.id,
                    reason: "missing_coordinates",
                    pairDistanceMiles,
                });
                continue;
            }
            if (!walkability.isWalkable && pref.requireWalkablePair) {
                debug.pairsRejectedForDistance += 1;
                debug.pairCandidatesRejectedByDistance += 1;
                debug.invalidPairsSuppressed += 1;
                const reason = pref.maxPairWalkingMinutes != null
                    ? "walking_route_exceeds_requested_minutes"
                    : "pair_distance_exceeds_requested_max";
                debug.rejectedPairs.push({
                    restaurantId: restaurant.id,
                    activityId: activity.id,
                    reason,
                    pairDistanceMiles,
                });
                continue;
            }
            const isWalkable = !missingCoordinates &&
                pairDistanceMiles != null &&
                (pref.distanceMode === "walking" || pref.distanceMode === "nearby"
                    ? walkability.isWalkable
                    : pairDistanceMiles <= 0.75);
            if (walkability.isWalkable && !missingCoordinates)
                debug.walkablePairsFound += 1;
            const pair = {
                restaurant,
                activity,
                distance_miles: pairDistanceMiles,
                pairDistanceMiles,
                pairWalkingMinutes,
                pairDistanceLabel: buildPairDistanceLabel(pairDistanceMiles),
                pairWarnings: walkability.warnings,
                isWalkable,
                title: "",
                explanation: "",
                pairExplanation: "",
                score: 0,
                pairScore: 0,
            };
            pair.title = buildPairTitle(pair, intent);
            pair.explanation = buildPairExplanation(pair, intent);
            pair.pairExplanation = pair.explanation;
            pair.score = scorePair(pair, intent);
            pair.pairScore = pair.score;
            pairs.push(pair);
        }
    debug.validPairCountBeforeRender = pairs.length;
    const sortedPairs = sortPairs(pairs, pref);
    const maxPerRestaurant = restaurants.length <= 1 ? 3 : 1;
    const maxPerActivity = activities.length <= 1 ? 3 : 1;
    return diversifyPairs(sortedPairs, 3, maxPerRestaurant, maxPerActivity);
}
function getPairCityState(pair) {
    const restaurantCity = pair.restaurant.city ?? null;
    const activityCity = pair.activity.city ?? null;
    const restaurantState = pair.restaurant.state ?? null;
    const activityState = pair.activity.state ?? null;
    return {
        restaurantCity,
        activityCity,
        restaurantState,
        activityState,
        samePairCity: sameText(restaurantCity, activityCity),
        samePairState: sameText(restaurantState, activityState),
        hasBothCoords: pair.restaurant.latitude != null &&
            pair.restaurant.longitude != null &&
            pair.activity.latitude != null &&
            pair.activity.longitude != null,
    };
}
function getPairGeoPriority(pair, intentGeo) {
    const rs = (0, geo_taxonomy_1.scoreGeoMatch)(pair.restaurant, intentGeo);
    const as = (0, geo_taxonomy_1.scoreGeoMatch)(pair.activity, intentGeo);
    if (rs >= 80 && as >= 80)
        return "both_geo_match";
    if (rs >= 80 || as >= 80)
        return "one_geo_match";
    if ((pair.restaurant.state &&
        intentGeo.state &&
        pair.restaurant.state !== intentGeo.state) ||
        (pair.activity.state &&
            intentGeo.state &&
            pair.activity.state !== intentGeo.state))
        return "cross_state_low_priority";
    return "standard";
}
function createActivityActivityPairs(firstActivities, secondActivities, intent, debug = createPairingDebug()) {
    const pairs = createSearchPairs(firstActivities, secondActivities, intent, debug).map((pair, index) => {
        const firstName = pair.restaurant.name || pair.restaurant.activity_name || null;
        const secondName = pair.activity.name || pair.activity.activity_name || null;
        return {
            ...pair,
            pair_type: "activity_activity",
            first_activity_location_id: pair.restaurant.id,
            second_activity_location_id: pair.activity.id,
            activity_location_id: pair.restaurant.id,
            paired_activity_location_id: pair.activity.id,
            first_activity_name: firstName,
            second_activity_name: secondName,
            title: [firstName, secondName].filter(Boolean).join(" + ") || pair.title,
            explanation: pair.pairDistanceMiles != null
                ? `These two activity picks work as a two-stop outing about ${pair.pairDistanceMiles} miles apart.`
                : "These two activity picks work as a two-stop outing.",
            pairExplanation: pair.pairDistanceMiles != null
                ? `These two activity picks work as a two-stop outing about ${pair.pairDistanceMiles} miles apart.`
                : "These two activity picks work as a two-stop outing.",
            score: pair.score - index * 0.01,
            pairScore: pair.pairScore - index * 0.01,
        };
    });
    return pairs;
}
