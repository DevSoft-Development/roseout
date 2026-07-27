"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MIXED_OUTING_MAX_PAIR_DISTANCE_MILES = exports.MAX_WALKING_DISTANCE_MINUTES = exports.WALKING_MINUTES_PER_MILE = void 0;
exports.toRadians = toRadians;
exports.haversineMiles = haversineMiles;
exports.getLocationDistanceMiles = getLocationDistanceMiles;
exports.scoreDistance = scoreDistance;
exports.sortByDistanceWithinRelevance = sortByDistanceWithinRelevance;
exports.getRecordDistanceMiles = getRecordDistanceMiles;
exports.getPairDistanceMiles = getPairDistanceMiles;
exports.estimateWalkingMinutes = estimateWalkingMinutes;
exports.walkingMinutesToMiles = walkingMinutesToMiles;
exports.isWalkablePair = isWalkablePair;
exports.userAskedForWalking = userAskedForWalking;
exports.getEffectiveWalkingPairLimitMinutes = getEffectiveWalkingPairLimitMinutes;
exports.isWalkingDistanceSearch = isWalkingDistanceSearch;
exports.getRawWalkingMinutes = getRawWalkingMinutes;
exports.getSafeWalkingMinutes = getSafeWalkingMinutes;
exports.shouldHidePairForWalkingLimit = shouldHidePairForWalkingLimit;
exports.isSafeWalkingLabel = isSafeWalkingLabel;
exports.cleanDistanceLabel = cleanDistanceLabel;
exports.formatDistanceFromRestaurant = formatDistanceFromRestaurant;
exports.WALKING_MINUTES_PER_MILE = 20;
exports.MAX_WALKING_DISTANCE_MINUTES = 60;
exports.DEFAULT_MIXED_OUTING_MAX_PAIR_DISTANCE_MILES = 3;
function toRadians(value) {
    return (value * Math.PI) / 180;
}
function haversineMiles(lat1, lon1, lat2, lon2) {
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
            Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) ** 2;
    return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const num = (v) => typeof v === "number"
    ? v
    : typeof v === "string" && v.trim()
        ? Number(v)
        : null;
const sameText = (a, b) => Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());
const finitePositive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
function getLocationDistanceMiles(location, geo) {
    const lat = num(location.latitude), lon = num(location.longitude);
    if (lat == null ||
        lon == null ||
        geo.latitude == null ||
        geo.longitude == null ||
        Number.isNaN(lat) ||
        Number.isNaN(lon))
        return null;
    return haversineMiles(geo.latitude, geo.longitude, lat, lon);
}
function scoreDistance(location, geo) {
    const d = location.distance_miles ?? getLocationDistanceMiles(location, geo);
    if (d == null)
        return 0;
    if (d <= 1)
        return 35;
    if (d <= 3)
        return 25;
    if (d <= 5)
        return 15;
    if (d <= 8)
        return 5;
    return geo.neighborhood ? -20 : -5;
}
function sortByDistanceWithinRelevance(results, geo) {
    return [...results].sort((a, b) => Number(b.match_score ?? 0) +
        Number(b.term_score ?? 0) +
        Number(b.geo_score ?? 0) +
        scoreDistance(b, geo) -
        (Number(a.match_score ?? 0) +
            Number(a.term_score ?? 0) +
            Number(a.geo_score ?? 0) +
            scoreDistance(a, geo)));
}
function getRecordDistanceMiles(a, b) {
    const alat = num(a.latitude), alon = num(a.longitude), blat = num(b.latitude), blon = num(b.longitude);
    if ([alat, alon, blat, blon].some((x) => x == null || Number.isNaN(x)))
        return null;
    return haversineMiles(alat, alon, blat, blon);
}
function getPairDistanceMiles(restaurantOrPair, activity) {
    if (activity) {
        const d = getRecordDistanceMiles(restaurantOrPair, activity);
        return d == null ? null : Number(d.toFixed(2));
    }
    const pair = restaurantOrPair;
    const existing = pair.pairDistanceMiles ??
        pair.pair_distance_miles ??
        pair.distance_miles ??
        null;
    return existing == null ? null : Number(existing);
}
function estimateWalkingMinutes(distanceMiles) {
    return Math.round(distanceMiles * exports.WALKING_MINUTES_PER_MILE);
}
function walkingMinutesToMiles(minutes) {
    return Number((minutes / exports.WALKING_MINUTES_PER_MILE).toFixed(2));
}
function clampedWalkingMinutes(minutes) {
    return Math.min(minutes, exports.MAX_WALKING_DISTANCE_MINUTES);
}
function maxMilesForPreference(pref, fallbackMiles, fallbackMinutes) {
    const candidates = [];
    if (finitePositive(pref.maxPairDistanceMiles)) {
        candidates.push(pref.maxPairDistanceMiles);
    }
    if (finitePositive(pref.maxPairWalkingMinutes)) {
        candidates.push(walkingMinutesToMiles(clampedWalkingMinutes(pref.maxPairWalkingMinutes)));
    }
    if (!candidates.length && fallbackMinutes) {
        candidates.push(walkingMinutesToMiles(fallbackMinutes));
    }
    if (!candidates.length) {
        candidates.push(fallbackMiles);
    }
    return Math.min(...candidates);
}
function maxMinutesForPreference(pref, fallbackMinutes) {
    const minutes = finitePositive(pref.maxPairWalkingMinutes)
        ? pref.maxPairWalkingMinutes
        : fallbackMinutes;
    return clampedWalkingMinutes(minutes);
}
function isWalkablePair(restaurant, activity, preference) {
    const pref = preference ?? {
        requiresPairing: false,
        distanceMode: "any",
        maxPairDistanceMiles: null,
        maxPairWalkingMinutes: null,
        requireWalkablePair: false,
    };
    const warnings = [];
    const pairDistanceMiles = getPairDistanceMiles(restaurant, activity);
    const pairWalkingMinutes = pairDistanceMiles == null
        ? null
        : estimateWalkingMinutes(pairDistanceMiles);
    if (pairDistanceMiles == null) {
        warnings.push("missing_coordinates");
        return {
            isWalkable: !pref.requireWalkablePair,
            warnings,
            pairDistanceMiles,
            pairWalkingMinutes,
        };
    }
    if (pref.distanceMode === "walking") {
        const maxMiles = maxMilesForPreference(pref, 3, exports.MAX_WALKING_DISTANCE_MINUTES);
        const maxMinutes = maxMinutesForPreference(pref, exports.MAX_WALKING_DISTANCE_MINUTES);
        return {
            isWalkable: pairDistanceMiles <= maxMiles &&
                pairWalkingMinutes != null &&
                pairWalkingMinutes <= maxMinutes,
            warnings,
            pairDistanceMiles,
            pairWalkingMinutes,
        };
    }
    if (pref.distanceMode === "nearby") {
        const maxMiles = maxMilesForPreference(pref, 1.5, 30);
        const maxMinutes = maxMinutesForPreference(pref, 30);
        return {
            isWalkable: pairDistanceMiles <= maxMiles &&
                pairWalkingMinutes != null &&
                pairWalkingMinutes <= maxMinutes,
            warnings,
            pairDistanceMiles,
            pairWalkingMinutes,
        };
    }
    if (pref.distanceMode === "same_area") {
        const closeEnough = pairDistanceMiles <= (pref.maxPairDistanceMiles ?? 3);
        const sameArea = sameText(restaurant.neighborhood, activity.neighborhood) ||
            sameText(restaurant.borough, activity.borough);
        return {
            isWalkable: closeEnough || sameArea,
            warnings,
            pairDistanceMiles,
            pairWalkingMinutes,
        };
    }
    return {
        isWalkable: pairDistanceMiles <=
            (pref.maxPairDistanceMiles ??
                exports.DEFAULT_MIXED_OUTING_MAX_PAIR_DISTANCE_MILES),
        warnings,
        pairDistanceMiles,
        pairWalkingMinutes,
    };
}
function userAskedForWalking(preference) {
    if (!preference)
        return false;
    return (preference.requireWalkablePair === true ||
        ["short_walk", "walking", "nearby"].includes(String(preference.distanceMode ?? "")) ||
        finitePositive(preference.maxPairWalkingMinutes));
}
function getEffectiveWalkingPairLimitMinutes(preference) {
    if (!preference)
        return null;
    if (finitePositive(preference.maxPairWalkingMinutes))
        return clampedWalkingMinutes(preference.maxPairWalkingMinutes);
    if (preference.distanceMode === "short_walk")
        return 15;
    if (preference.distanceMode === "nearby")
        return 30;
    if (preference.distanceMode === "walking")
        return exports.MAX_WALKING_DISTANCE_MINUTES;
    return null;
}
function isWalkingDistanceSearch(preference) {
    return userAskedForWalking(preference);
}
function getRawWalkingMinutes(pair) {
    const value = pair?.googleWalkingDurationMinutes ??
        pair?.routeDurationMinutes ??
        pair?.walking_route_minutes ??
        pair?.walkingDurationMinutes ??
        null;
    return finitePositive(value) ? Number(value) : null;
}
function getSafeWalkingMinutes(pair) {
    const raw = getRawWalkingMinutes(pair);
    if (raw != null)
        return raw;
    const distance = pair?.pairDistanceMiles ?? pair?.distance_miles ?? null;
    return finitePositive(distance)
        ? estimateWalkingMinutes(Number(distance))
        : null;
}
function shouldHidePairForWalkingLimit(pair, preference) {
    const limit = getEffectiveWalkingPairLimitMinutes(preference);
    if (!limit || !userAskedForWalking(preference))
        return { hide: false, reason: null };
    const minutes = getSafeWalkingMinutes(pair);
    if (minutes == null)
        return {
            hide: preference?.requireWalkablePair === true,
            reason: "missing_coordinates",
        };
    return minutes > limit
        ? { hide: true, reason: "walking_route_exceeds_requested_minutes" }
        : { hide: false, reason: null };
}
function isSafeWalkingLabel(label) {
    return /\b\d+\s+min(?:ute)?s?\s+walk\b/i.test(String(label ?? ""));
}
function cleanDistanceLabel(label) {
    const trimmed = String(label ?? "").trim();
    return trimmed && trimmed !== "Distance unavailable" ? trimmed : null;
}
function formatDistanceFromRestaurant({ pair, restaurantName, pairingPreference, }) {
    const minutes = getSafeWalkingMinutes(pair);
    if (userAskedForWalking(pairingPreference) && minutes != null)
        return `${minutes} min walk from ${restaurantName ?? "restaurant"}`;
    const distance = pair.pairDistanceMiles ?? pair.distance_miles ?? null;
    if (distance != null)
        return `${Number(distance).toFixed(Number(distance) < 1 ? 1 : 0)} mi from ${restaurantName ?? "restaurant"}`;
    return cleanDistanceLabel(pair.pairDistanceLabel) ?? "Distance unavailable";
}
