import { detectRequestedMarket } from "@/lib/location-markets";
import { hasNearMeIntent, hasPairProximityIntent, hasTypedLocationIntent, stripNearMeIntent } from "@/lib/search/near-me";

export type NormalizeCreateSearchRequestInput = {
  rawQuery: string;
  body?: Record<string, any>;
  source: "public_create" | "admin_search_lab";
};

export type SelectedSearchLane = "auto" | "restaurant" | "activity" | "mixed";

export type NormalizedCreateSearchRequest = {
  rawQuery: string;
  cleanedQuery: string;
  nearMeIntent: boolean;
  pairProximityIntent: boolean;
  typedLocationIntent: boolean;
  useCurrentLocation: boolean;
  userLatitude: number | null;
  userLongitude: number | null;
  rawQueryBeforeNearMeStrip: string;
  rawQueryAfterNearMeStrip: string;
  selectedSearchLane: SelectedSearchLane;
  searchBody: Record<string, any>;
  debugParity: Record<string, any>;
};

function normalizeSelectedSearchLane(value: unknown): SelectedSearchLane | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim().replace(/_/g, "-");
  if (["restaurant", "restaurants", "food", "dining", "restaurant-only", "restaurant only"].includes(normalized)) return "restaurant";
  if (["activity", "activities", "things-to-do", "things to do", "activity-only", "activity only"].includes(normalized)) return "activity";
  if (["mixed", "mixed-outing", "mixed outing", "outing", "pairing"].includes(normalized)) return "mixed";
  if (["auto", "any", "all", "default"].includes(normalized)) return "auto";
  return null;
}

function selectedSearchLaneFromRequestBody(body: Record<string, any>): SelectedSearchLane {
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

export function normalizeCreateSearchRequest(input: NormalizeCreateSearchRequestInput): NormalizedCreateSearchRequest {
  const body = input.body ?? {};
  const rawQuery = String(input.rawQuery || "").trim();
  const rawQueryBeforeNearMeStrip =
    typeof body.rawQueryBeforeNearMeStrip === "string" && body.rawQueryBeforeNearMeStrip.trim()
      ? body.rawQueryBeforeNearMeStrip.trim()
      : rawQuery;
  const nearMeIntent = body.nearMeIntent === true || hasNearMeIntent(rawQueryBeforeNearMeStrip) || hasNearMeIntent(rawQuery);
  const typedLocationIntent = body.typedLocationIntent === true || hasTypedLocationIntent(rawQueryBeforeNearMeStrip) || hasTypedLocationIntent(rawQuery);
  const pairProximityIntent = body.pairProximityIntent === true || hasPairProximityIntent(rawQueryBeforeNearMeStrip) || hasPairProximityIntent(rawQuery);
  const rawQueryAfterNearMeStrip = nearMeIntent
    ? stripNearMeIntent(rawQuery || rawQueryBeforeNearMeStrip) || stripNearMeIntent(rawQueryBeforeNearMeStrip) || rawQueryBeforeNearMeStrip
    : rawQuery;
  const cleanedQuery = rawQueryAfterNearMeStrip.trim();
  const userLatitude = finiteNumberFrom(body.latitude, body.lat, body.userLatitude, body.user_latitude, body.userLocation?.latitude, body.user_location?.latitude, body.userLocation?.lat, body.user_location?.lat);
  const userLongitude = finiteNumberFrom(body.longitude, body.lng, body.lon, body.userLongitude, body.user_longitude, body.userLocation?.longitude, body.user_location?.longitude, body.userLocation?.lng, body.user_location?.lng);
  const selectedSearchLane = selectedSearchLaneFromRequestBody(body);
  const useCurrentLocation = Boolean((body.useCurrentLocation === true || body.use_current_location === true) || (nearMeIntent && !typedLocationIntent && userLatitude != null && userLongitude != null));
  const userLocationSoftBoostOnly = Boolean(typedLocationIntent && nearMeIntent && userLatitude != null && userLongitude != null);
  const currentLocationUserLocation = useCurrentLocation && userLatitude != null && userLongitude != null
    ? { latitude: userLatitude, longitude: userLongitude, radiusMiles: Number.isFinite(Number(body.radiusMiles ?? body.radius_miles)) ? Number(body.radiusMiles ?? body.radius_miles) : 12, label: "Current location" }
    : null;
  const market = detectRequestedMarket(cleanedQuery || rawQueryBeforeNearMeStrip);
  const inferredSearchType = /date night|date|dinner.*(activity|drinks|bowling|show)|restaurant.*activity/i.test(cleanedQuery) || (selectedSearchLane as string) === "mixed" ? "mixed_outing" : selectedSearchLane;
  const wantsPairing = inferredSearchType === "mixed_outing" || inferredSearchType === "mixed";
  const debugParity = {
    source: input.source,
    rawQuery,
    cleanedQuery,
    rawQueryBeforeNearMeStrip,
    rawQueryAfterNearMeStrip,
    nearMeIntent,
    pairProximityIntent,
    typedLocationIntent,
    useCurrentLocation,
    userLatitudePresent: userLatitude != null,
    userLongitudePresent: userLongitude != null,
    userLocationUsedAsPrimaryGeo: Boolean(currentLocationUserLocation),
    userLocationUsedAsSoftBoost: userLocationSoftBoostOnly,
    resolvedMarket: market.resolvedMarket,
    requestedMarket: market.requestedMarket,
    allowedMarkets: market.allowedMarkets,
    explicitMarketRequested: market.marketIntent === "explicit",
    geoSource: market.marketIntent === "explicit" ? "typed_location" : useCurrentLocation ? "current_location" : "default_market",
    selectedSearchLane,
    searchType: inferredSearchType,
    wantsPairing,
    needsRestaurant: wantsPairing || selectedSearchLane !== "activity",
    needsActivity: wantsPairing || selectedSearchLane !== "restaurant",
    searchBackendUsed: "enterprise",
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
    useCurrentLocation,
    selectedSearchLane,
    userLatitude: userLatitude ?? undefined,
    userLongitude: userLongitude ?? undefined,
    latitude: userLatitude ?? undefined,
    longitude: userLongitude ?? undefined,
    userLocationSoftBoostOnly,
    ...(currentLocationUserLocation ? { userLocation: currentLocationUserLocation } : {}),
    ...(selectedSearchLane === "auto" ? { searchType: "auto" } : { searchType: selectedSearchLane }),
    debugParity,
  };
  return { rawQuery, cleanedQuery, nearMeIntent, pairProximityIntent, typedLocationIntent, useCurrentLocation, userLatitude, userLongitude, rawQueryBeforeNearMeStrip, rawQueryAfterNearMeStrip, selectedSearchLane, searchBody, debugParity };
}
