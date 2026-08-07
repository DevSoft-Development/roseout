import { detectRequestedMarket } from "@/lib/location-markets";
import { detectGeoIntent } from "@/lib/search/enterprise/geo-taxonomy";
import {
  hasNearMeIntent,
  hasPairProximityIntent,
  hasTypedLocationIntent,
  stripNearMeIntent,
} from "@/lib/search/near-me";

export type NormalizeCreateSearchRequestInput = {
  rawQuery: string;
  body?: Record<string, any>;
  source: "public_create" | "admin_search_lab";
};

export type SelectedSearchLane =
  | "auto"
  | "restaurant"
  | "activity"
  | "mixed"
  | "anchored_restaurant"
  | "anchored_activity";

export type NormalizedCreateSearchRequest = {
  rawQuery: string;
  cleanedQuery: string;
  nearMeIntent: boolean;
  typedLocationIntent: boolean;
  typedLocationDiagnostic: string | null;
  canonicalGeo: Record<string, any> | null;
  useCurrentLocation: boolean;
  userLatitude: number | null;
  userLongitude: number | null;
  rawQueryBeforeNearMeStrip: string;
  rawQueryAfterNearMeStrip: string;
  selectedSearchLane: SelectedSearchLane;
  searchBody: Record<string, any>;
  debugParity: Record<string, any>;
  pairProximityIntent: boolean;
};

function normalizeSelectedSearchLane(
  value: unknown,
): SelectedSearchLane | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim().replace(/_/g, "-");
  if (
    [
      "restaurant",
      "restaurants",
      "food",
      "dining",
      "restaurant-only",
      "restaurant only",
    ].includes(normalized)
  ) {
    return "restaurant";
  }
  if (
    [
      "activity",
      "activities",
      "things-to-do",
      "things to do",
      "activity-only",
      "activity only",
    ].includes(normalized)
  ) {
    return "activity";
  }
  if (
    ["mixed", "mixed-outing", "mixed outing", "outing", "pairing"].includes(
      normalized,
    )
  ) {
    return "mixed";
  }
  if (normalized === "anchored-restaurant") return "anchored_restaurant";
  if (normalized === "anchored-activity") return "anchored_activity";
  if (["auto", "any", "all", "default"].includes(normalized)) return "auto";
  return null;
}

function selectedSearchLaneFromRequestBody(
  body: Record<string, any>,
): SelectedSearchLane {
  return (
    normalizeSelectedSearchLane(body?.selectedSearchLane) ??
    normalizeSelectedSearchLane(body?.selected_search_lane) ??
    normalizeSelectedSearchLane(body?.searchLane) ??
    normalizeSelectedSearchLane(body?.search_lane) ??
    normalizeSelectedSearchLane(body?.lane) ??
    normalizeSelectedSearchLane(body?.searchType) ??
    normalizeSelectedSearchLane(body?.search_type) ??
    "auto"
  );
}

function finiteNumberFrom(...values: unknown[]): number | null {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function anchoredLaneFromQuery(query: string): SelectedSearchLane | null {
  const match = query.match(
    /^\s*(restaurant|restaurants|food|dinner|lunch|brunch|breakfast|activity|activities|something fun|things to do)\s+(near|close to|next to|around|within(?: a)?(?: \d+[- ]minute)? walk(?:ing distance)? (?:of|from))\s+.+$/i,
  );
  if (!match) return null;
  return /activity|something fun|things to do/i.test(match[1])
    ? "anchored_activity"
    : "anchored_restaurant";
}

function authoritativeRawQuery(
  incomingRawQuery: string,
  body: Record<string, any>,
) {
  const preserved =
    typeof body.rawQueryBeforeNearMeStrip === "string"
      ? body.rawQueryBeforeNearMeStrip.trim()
      : "";
  if (!preserved) return incomingRawQuery;

  const incoming = incomingRawQuery.trim();
  const syntheticActivitySuffix =
    incoming.toLowerCase() === `${preserved.toLowerCase()} activity`;

  // rawQueryBeforeNearMeStrip is the preserved user-authored query. If another
  // layer appended the synthetic lane hint "activity", never let that hint
  // replace the user's words before V2 planning, regardless of where a
  // sequence connector or geo/time modifier appears.
  return syntheticActivitySuffix ? preserved : incoming;
}

export function normalizeCreateSearchRequest(
  input: NormalizeCreateSearchRequestInput,
): NormalizedCreateSearchRequest {
  const body = input.body ?? {};
  const incomingRawQuery = String(input.rawQuery || "").trim();
  const rawQuery = authoritativeRawQuery(incomingRawQuery, body);
  const rawQueryBeforeNearMeStrip =
    typeof body.rawQueryBeforeNearMeStrip === "string" &&
    body.rawQueryBeforeNearMeStrip.trim()
      ? body.rawQueryBeforeNearMeStrip.trim()
      : rawQuery;
  const nearMeIntent =
    body.nearMeIntent === true ||
    hasNearMeIntent(rawQueryBeforeNearMeStrip) ||
    hasNearMeIntent(rawQuery);
  const pairProximityIntent =
    hasPairProximityIntent(rawQueryBeforeNearMeStrip) ||
    hasPairProximityIntent(rawQuery);
  const rawQueryAfterNearMeStrip = nearMeIntent
    ? stripNearMeIntent(rawQuery || rawQueryBeforeNearMeStrip) ||
      stripNearMeIntent(rawQueryBeforeNearMeStrip) ||
      rawQueryBeforeNearMeStrip
    : rawQuery;
  const cleanedQuery = rawQueryAfterNearMeStrip.trim();
  const userLatitude = finiteNumberFrom(
    body.latitude,
    body.lat,
    body.userLatitude,
    body.user_latitude,
    body.userLocation?.latitude,
    body.user_location?.latitude,
    body.userLocation?.lat,
    body.user_location?.lat,
  );
  const userLongitude = finiteNumberFrom(
    body.longitude,
    body.lng,
    body.lon,
    body.userLongitude,
    body.user_longitude,
    body.userLocation?.longitude,
    body.user_location?.longitude,
    body.userLocation?.lng,
    body.user_location?.lng,
  );
  const anchoredLane = anchoredLaneFromQuery(cleanedQuery);
  const selectedSearchLane =
    anchoredLane ?? selectedSearchLaneFromRequestBody(body);
  const geo = detectGeoIntent(cleanedQuery || rawQueryBeforeNearMeStrip);
  const usableTypedGeo = Boolean(
    geo.raw &&
    (geo.city ||
      geo.borough ||
      geo.neighborhood ||
      geo.county ||
      geo.region ||
      geo.state),
  );
  const typedLocationDetected =
    body.typedLocationIntent === true ||
    hasTypedLocationIntent(rawQueryBeforeNearMeStrip) ||
    hasTypedLocationIntent(rawQuery);
  const typedLocationIntent = typedLocationDetected && usableTypedGeo;
  const typedLocationDiagnostic = typedLocationDetected
    ? typedLocationIntent
      ? null
      : "typed_location_unresolved"
    : null;
  const market = detectRequestedMarket(
    cleanedQuery || rawQueryBeforeNearMeStrip,
  );
  const canonicalGeo = usableTypedGeo
    ? {
        raw: geo.raw,
        city: geo.city ?? null,
        state: geo.state ?? null,
        borough: geo.borough ?? null,
        neighborhood: geo.neighborhood ?? null,
        county: geo.county ?? null,
        region: geo.region ?? null,
        latitude: geo.latitude ?? null,
        longitude: geo.longitude ?? null,
        radiusMiles: geo.radiusMiles ?? null,
        market: geo.resolvedMarket ?? market.resolvedMarket ?? null,
        requestedMarket: geo.requestedMarket ?? market.requestedMarket ?? null,
        resolvedMarket: geo.resolvedMarket ?? market.resolvedMarket ?? null,
      }
    : null;
  const useCurrentLocation =
    nearMeIntent &&
    !typedLocationIntent &&
    (body.useCurrentLocation === true ||
      body.use_current_location === true ||
      (userLatitude != null && userLongitude != null));
  const userLocationSoftBoostOnly = Boolean(
    typedLocationIntent &&
    nearMeIntent &&
    userLatitude != null &&
    userLongitude != null,
  );
  const currentLocationUserLocation =
    useCurrentLocation && userLatitude != null && userLongitude != null
      ? {
          latitude: userLatitude,
          longitude: userLongitude,
          radiusMiles: Number.isFinite(
            Number(body.radiusMiles ?? body.radius_miles),
          )
            ? Number(body.radiusMiles ?? body.radius_miles)
            : 12,
          label: "Current location",
        }
      : null;
  const inferredSearchType = anchoredLane
    ? "anchored_nearby"
    : /date night|date|(?:dinner|brunch|lunch|breakfast|restaurant|food).*(activity|activities|things to do|something fun|drinks|bowling|show|hookah|lounge|bar)|restaurant.*activity/i.test(
          cleanedQuery,
        ) || selectedSearchLane === "mixed"
      ? "mixed_outing"
      : selectedSearchLane;
  const wantsPairing = inferredSearchType === "mixed_outing";
  const needsRestaurant = anchoredLane
    ? anchoredLane === "anchored_restaurant"
    : wantsPairing || selectedSearchLane !== "activity";
  const needsActivity = anchoredLane
    ? anchoredLane === "anchored_activity"
    : wantsPairing || selectedSearchLane !== "restaurant";
  const debugParity = {
    source: input.source,
    rawQuery,
    incomingRawQuery,
    queryMutationPrevented: rawQuery !== incomingRawQuery,
    cleanedQuery,
    rawQueryBeforeNearMeStrip,
    rawQueryAfterNearMeStrip,
    nearMeIntent,
    pairProximityIntent,
    typedLocationIntent,
    typedLocationDiagnostic,
    canonicalGeo,
    useCurrentLocation,
    userLatitudePresent: userLatitude != null,
    userLongitudePresent: userLongitude != null,
    userLocationUsedAsPrimaryGeo: Boolean(currentLocationUserLocation),
    userLocationUsedAsSoftBoost: userLocationSoftBoostOnly,
    resolvedMarket: canonicalGeo?.resolvedMarket ?? market.resolvedMarket,
    city: canonicalGeo?.city ?? null,
    state: canonicalGeo?.state ?? null,
    borough: canonicalGeo?.borough ?? null,
    neighborhood: canonicalGeo?.neighborhood ?? null,
    requestedMarket: market.requestedMarket,
    allowedMarkets: market.allowedMarkets,
    explicitMarketRequested:
      typedLocationIntent || market.marketIntent === "explicit",
    geoSource: anchoredLane
      ? "named_location_anchor"
      : market.marketIntent === "explicit"
        ? "typed_location"
        : useCurrentLocation
          ? "current_location"
          : "default_market",
    selectedSearchLane,
    searchType: inferredSearchType,
    wantsPairing,
    needsRestaurant,
    needsActivity,
    distanceMode: anchoredLane
      ? "anchor_radius"
      : pairProximityIntent
        ? "nearby"
        : null,
    intentParserSource: anchoredLane ? "named_location_anchor" : null,
    primaryIntent: anchoredLane
      ? anchoredLane === "anchored_restaurant"
        ? "anchored_nearby_restaurant"
        : "anchored_nearby_activity"
      : null,
    searchBackendUsed: "enterprise",
    currentLocationBackendDecision: useCurrentLocation
      ? "enterprise_with_user_location"
      : "enterprise_without_user_location",
    enterpriseSearchUsed: true,
    legacyFallbackUsed: false,
    legacyFallbackReason: null,
  };
  const searchBody: Record<string, any> = {
    ...body,
    input: cleanedQuery,
    message: cleanedQuery,
    query: cleanedQuery,
    prompt: cleanedQuery,
    rawQueryBeforeNearMeStrip,
    rawQueryAfterNearMeStrip,
    nearMeIntent,
    pairProximityIntent,
    typedLocationIntent,
    typedLocationDiagnostic,
    canonicalGeo,
    useCurrentLocation,
    selectedSearchLane,
    userLatitude: userLatitude ?? undefined,
    userLongitude: userLongitude ?? undefined,
    latitude: userLatitude ?? undefined,
    longitude: userLongitude ?? undefined,
    userLocationSoftBoostOnly,
    ...(currentLocationUserLocation
      ? { userLocation: currentLocationUserLocation }
      : {}),
    ...(selectedSearchLane === "auto"
      ? { searchType: "auto" }
      : { searchType: selectedSearchLane }),
    debugParity,
    city: canonicalGeo?.city ?? body.city,
    state: canonicalGeo?.state ?? body.state,
    borough: canonicalGeo?.borough ?? body.borough,
    neighborhood: canonicalGeo?.neighborhood ?? body.neighborhood,
    market: canonicalGeo?.market ?? body.market,
  };
  return {
    rawQuery,
    cleanedQuery,
    nearMeIntent,
    typedLocationIntent,
    typedLocationDiagnostic,
    canonicalGeo,
    useCurrentLocation,
    userLatitude,
    userLongitude,
    rawQueryBeforeNearMeStrip,
    rawQueryAfterNearMeStrip,
    selectedSearchLane,
    searchBody,
    debugParity,
    pairProximityIntent,
  };
}
