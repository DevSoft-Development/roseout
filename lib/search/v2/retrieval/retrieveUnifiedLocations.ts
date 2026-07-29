import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import type { EnterpriseLocation } from "../../enterprise/types";
import type { SearchTrace } from "../observability/searchTrace";
import type { RetrievalRequest } from "./retrievalTypes";

function resolveRegion(request: RetrievalRequest): string | null {
  const geo = request.geo;
  const record = normalizeGeoTerm(geo.neighborhood ?? geo.borough ?? geo.city ?? geo.county ?? geo.market ?? geo.state);
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
  return {
    ...location,
    latitude,
    longitude,
    distance_miles: computedDistance,
    distanceMiles: computedDistance,
  } as EnterpriseLocation;
}

function matchesStrictGeo(location: EnterpriseLocation, request: RetrievalRequest) {
  const geo = request.geo;
  if (geo.strictness !== "strict") return true;
  const city = normalize(location.city);
  const neighborhood = normalize(location.neighborhood);
  const borough = normalize(location.borough);
  const county = normalize(location.county);
  const state = normalize(location.state);
  const requestedBorough = normalize(geo.borough);
  const requestedCity = normalize(geo.city);
  const requestedNeighborhood = normalize(geo.neighborhood);
  if (geo.state && state && state !== normalize(geo.state)) return false;
  if (geo.borough && borough && borough !== requestedBorough) return false;
  if (geo.county && county && county !== normalize(geo.county)) return false;
  if (requestedCity || requestedNeighborhood) {
    const requestedPlace = requestedNeighborhood || requestedCity;
    const exactPlaceMatch = city === requestedPlace || neighborhood === requestedPlace;
    const boroughBackedSparseRow = Boolean(requestedBorough) && borough === requestedBorough && !neighborhood && (!city || city === "new york" || city === "manhattan" || city === "brooklyn" || city === "queens");
    if (!exactPlaceMatch && !boroughBackedSparseRow) return false;
  }
  return true;
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
): Promise<EnterpriseLocation[]> {
  const geo = request.geo;
  const searchTerms = [...new Set(request.retrievalTerms)].slice(0, 20);
  const liveMusic = isLiveMusicRequest(request);
  const rpcName = liveMusic ? "enterprise_search_live_music_locations" : "enterprise_search_locations";
  const params = liveMusic
    ? { p_search_terms: searchTerms, p_neighborhood: geo.neighborhood ?? null, p_borough: geo.borough ?? null, p_city: geo.city ?? null, p_county: geo.county ?? null, p_state: geo.state ?? null, p_latitude: geo.latitude ?? null, p_longitude: geo.longitude ?? null, p_radius_miles: geo.radiusMiles ?? null, p_limit: limit }
    : { p_search_terms: searchTerms, p_domain: request.desiredRole === "restaurant" ? "restaurant" : "activity", p_neighborhood: geo.neighborhood ?? null, p_borough: geo.borough ?? null, p_city: geo.city ?? null, p_county: geo.county ?? null, p_region: resolveRegion(request), p_state: geo.state ?? null, p_latitude: geo.latitude ?? null, p_longitude: geo.longitude ?? null, p_radius_miles: geo.radiusMiles ?? null, p_limit: limit, p_allow_places_of_worship: false, p_allow_low_level: false };

  const { data, error } = await supabase.rpc(rpcName, params);
  if (error) throw new Error(`SEARCH_V2_RETRIEVAL_FAILED:${rpcName}:${error.message}`);
  const raw = (Array.isArray(data) ? data : []).map((location) => normalizeCoordinates(location as EnterpriseLocation, request));
  const strict = raw.filter((location) => matchesStrictGeo(location, request));
  if (trace) {
    if (!raw.length) trace.rejections.retrievalRpcEmpty += 1;
    trace.rejections.strictGeo += raw.length - strict.length;
    trace.rejections.missingCoordinates += strict.filter((location) => finiteNumber(location.latitude) == null || finiteNumber(location.longitude) == null).length;
    trace.decisions.push({
      stage: "retrieval",
      decision: strict.length ? "candidates_retained" : "no_candidates_retained",
      reason: `${rpcName}: raw=${raw.length}, strict_geo_rejected=${raw.length - strict.length}, missing_coordinates=${strict.filter((location) => finiteNumber(location.latitude) == null || finiteNumber(location.longitude) == null).length}`,
    });
  }
  return strict.slice(0, limit);
}
