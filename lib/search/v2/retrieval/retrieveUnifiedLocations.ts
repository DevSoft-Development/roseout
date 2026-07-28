import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import type { EnterpriseLocation } from "../../enterprise/types";
import type { RetrievalRequest } from "./retrievalTypes";

function resolveRegion(request: RetrievalRequest): string | null {
  const geo = request.geo;
  const record = normalizeGeoTerm(
    geo.neighborhood ??
      geo.borough ??
      geo.city ??
      geo.county ??
      geo.market ??
      geo.state,
  );

  return record?.region ?? (record?.type === "region" ? record.name : null);
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
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
    const exactPlaceMatch =
      city === requestedPlace || neighborhood === requestedPlace;
    const boroughBackedSparseRow =
      Boolean(requestedBorough) &&
      borough === requestedBorough &&
      !neighborhood &&
      (!city || city === "new york" || city === "manhattan" || city === "brooklyn" || city === "queens");

    if (!exactPlaceMatch && !boroughBackedSparseRow) return false;
  }

  return true;
}

export async function retrieveUnifiedLocations(
  supabase: SupabaseClient,
  request: RetrievalRequest,
  limit = 60,
): Promise<EnterpriseLocation[]> {
  const geo = request.geo;
  const params = {
    p_search_terms: [...new Set(request.retrievalTerms)].slice(0, 20),
    p_domain:
      request.desiredRole === "restaurant" ? "restaurant" : "activity",
    p_neighborhood: geo.neighborhood ?? null,
    p_borough: geo.borough ?? null,
    p_city: geo.city ?? null,
    p_county: geo.county ?? null,
    p_region: resolveRegion(request),
    p_state: geo.state ?? null,
    p_latitude: geo.latitude ?? null,
    p_longitude: geo.longitude ?? null,
    p_radius_miles: geo.radiusMiles ?? null,
    p_limit: limit,
    p_allow_places_of_worship: false,
    p_allow_low_level: false,
  };
  const { data, error } = await supabase.rpc(
    "enterprise_search_locations",
    params,
  );
  if (error) {
    throw new Error(`SEARCH_V2_RETRIEVAL_FAILED:${error.message}`);
  }
  return (Array.isArray(data) ? data : [])
    .filter((location) => matchesStrictGeo(location as EnterpriseLocation, request))
    .slice(0, limit) as EnterpriseLocation[];
}
