import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import type { EnterpriseLocation } from "../../enterprise/types";
import type { SearchTrace } from "../observability/searchTrace";
import type { RetrievalRequest } from "./retrievalTypes";

type GeoLevel = "exact_neighborhood" | "city" | "borough_or_county" | "market" | "state";

type LegacyGeoScope = {
  level: GeoLevel;
  neighborhood: string | null;
  city: string | null;
  borough: string | null;
  county: string | null;
  market: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMiles: number | null;
};

function resolveRegion(request: RetrievalRequest, marketOverride?: string | null): string | null {
  const geo = request.geo;
  const record = normalizeGeoTerm(geo.neighborhood ?? geo.borough ?? geo.city ?? geo.county ?? marketOverride ?? geo.market ?? geo.state);
  return record?.region ?? (record?.type === "region" ? record.name : null);
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusMiles = 3958.7613;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCoordinates(location: EnterpriseLocation, request: RetrievalRequest): EnterpriseLocation {
  const row = location as EnterpriseLocation & Record<string, unknown>;
  const latitude = finiteNumber(row.latitude ?? row.lat);
  const longitude = finiteNumber(row.longitude ?? row.lng ?? row.lon);
  const originLatitude = finiteNumber(request.geo.latitude);
  const originLongitude = finiteNumber(request.geo.longitude);
  const rpcDistance = finiteNumber(row.distance_miles ?? row.distanceMiles);
  const computedDistance = rpcDistance ?? (latitude != null && longitude != null && originLatitude != null && originLongitude != null
    ? haversineMiles(originLatitude, originLongitude, latitude, longitude)
    : null);
  return { ...location, latitude, longitude, distance_miles: computedDistance, distanceMiles: computedDistance } as EnterpriseLocation;
}

function matchesScope(location: EnterpriseLocation, request: RetrievalRequest, scope: LegacyGeoScope) {
  const city = normalize(location.city);
  const neighborhood = normalize(location.neighborhood);
  const borough = normalize(location.borough);
  const county = normalize(location.county);
  const state = normalize(location.state);
  const market = normalize((location as EnterpriseLocation & Record<string, unknown>).market);
  if (scope.state && state && state !== normalize(scope.state)) return false;
  if (scope.neighborhood && city !== normalize(scope.neighborhood) && neighborhood !== normalize(scope.neighborhood)) return false;
  if (scope.city && city !== normalize(scope.city) && neighborhood !== normalize(scope.city)) return false;
  if (scope.borough && borough !== normalize(scope.borough)) return false;
  if (scope.county && county !== normalize(scope.county)) return false;
  if (scope.market && market && market !== normalize(scope.market)) return false;
  return true;
}

function buildGeoScopes(request: RetrievalRequest, allowBroaderGeo: boolean): LegacyGeoScope[] {
  const geo = request.geo;
  const scopes: LegacyGeoScope[] = [{
    level: "exact_neighborhood",
    neighborhood: geo.neighborhood ?? null,
    city: geo.city ?? null,
    borough: geo.borough ?? null,
    county: geo.county ?? null,
    market: geo.market ?? null,
    state: geo.state ?? null,
    latitude: geo.latitude ?? null,
    longitude: geo.longitude ?? null,
    radiusMiles: geo.radiusMiles ?? null,
  }];
  if (!allowBroaderGeo) return scopes;
  if (geo.city) scopes.push({ level: "city", neighborhood: null, city: geo.city, borough: null, county: geo.county ?? null, market: geo.market ?? null, state: geo.state ?? null, latitude: null, longitude: null, radiusMiles: null });
  if (geo.borough || geo.county) scopes.push({ level: "borough_or_county", neighborhood: null, city: null, borough: geo.borough ?? null, county: geo.county ?? null, market: geo.market ?? null, state: geo.state ?? null, latitude: null, longitude: null, radiusMiles: null });
  if (geo.market) scopes.push({ level: "market", neighborhood: null, city: null, borough: null, county: null, market: geo.market, state: geo.state ?? null, latitude: null, longitude: null, radiusMiles: null });
  if (geo.state) scopes.push({ level: "state", neighborhood: null, city: null, borough: null, county: null, market: null, state: geo.state, latitude: null, longitude: null, radiusMiles: null });
  return scopes.filter((scope, index, all) => all.findIndex((other) => JSON.stringify(other) === JSON.stringify(scope)) === index);
}

function isLiveMusicRequest(request: RetrievalRequest) {
  const role = normalize(request.desiredRole);
  const terms = request.retrievalTerms.map(normalize);
  return role === "live_music_activity" || terms.some((term) => /^(live music|music venue|jazz|concert|live band)$/.test(term));
}

export async function retrieveUnifiedLocations(
  supabase: SupabaseClient,
  request: RetrievalRequest,
  limit = 60,
  trace?: SearchTrace,
  options: { allowBroaderGeo?: boolean } = {},
): Promise<EnterpriseLocation[]> {
  const searchTerms = [...new Set(request.retrievalTerms)].slice(0, 20);
  const liveMusic = isLiveMusicRequest(request);
  const rpcName = liveMusic ? "enterprise_search_live_music_locations" : "enterprise_search_locations";
  const scopes = buildGeoScopes(request, Boolean(options.allowBroaderGeo));

  for (const scope of scopes) {
    const params = liveMusic
      ? { p_search_terms: searchTerms, p_neighborhood: scope.neighborhood, p_borough: scope.borough, p_city: scope.city, p_county: scope.county, p_state: scope.state, p_latitude: scope.latitude, p_longitude: scope.longitude, p_radius_miles: scope.radiusMiles, p_limit: limit }
      : { p_search_terms: searchTerms, p_domain: request.desiredRole === "restaurant" ? "restaurant" : "activity", p_neighborhood: scope.neighborhood, p_borough: scope.borough, p_city: scope.city, p_county: scope.county, p_region: resolveRegion(request, scope.market), p_state: scope.state, p_latitude: scope.latitude, p_longitude: scope.longitude, p_radius_miles: scope.radiusMiles, p_limit: limit, p_allow_places_of_worship: false, p_allow_low_level: false };

    const { data, error } = await supabase.rpc(rpcName, params);
    if (error) throw new Error(`SEARCH_V2_RETRIEVAL_FAILED:${rpcName}:${error.message}`);
    const raw = (Array.isArray(data) ? data : []).map((location) => normalizeCoordinates(location as EnterpriseLocation, request));
    const retained = raw.filter((location) => matchesScope(location, request, scope));
    if (trace) {
      if (!raw.length) trace.rejections.retrievalRpcEmpty += 1;
      trace.rejections.strictGeo += raw.length - retained.length;
      trace.decisions.push({
        stage: "retrieval_geo_fallback",
        decision: retained.length ? "geo_level_succeeded" : "geo_level_empty",
        reason: `${rpcName}: level=${scope.level}, raw=${raw.length}, retained=${retained.length}`,
      });
    }
    if (retained.length) return retained.slice(0, limit);
  }

  return [];
}
