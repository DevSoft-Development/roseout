import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnterpriseLocation } from "../../enterprise/types";
import type { RetrievalRequest } from "./retrievalTypes";

type ProfileRpcParams = {
  p_query: string;
  p_domain: "restaurant" | "activity";
  p_categories: string[];
  p_market: string | null;
  p_state: string | null;
  p_county: string | null;
  p_borough: string | null;
  p_city: string | null;
  p_neighborhood: string | null;
  p_latitude: number | null;
  p_longitude: number | null;
  p_radius_miles: number | null;
  p_limit: number;
};

const cleanTerms = (values: readonly string[]) => [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];

export function buildProfileRpcParams(request: RetrievalRequest, limit = 60): ProfileRpcParams {
  const geo = request.geo;
  const hasCoordinateScope = geo.latitude != null && geo.longitude != null && geo.radiusMiles != null;
  const desiredDomain = request.desiredRole === "restaurant" ? "restaurant" : "activity";
  const categories = cleanTerms([
    ...request.categories,
    ...request.cuisines,
    ...request.foods,
    ...request.features,
    ...request.retrievalTerms,
  ]).slice(0, 20);

  // Coordinates are authoritative when available. Otherwise send only the most
  // specific reliable text scope instead of stacking mutually inconsistent
  // market/county/city/borough/neighborhood requirements.
  const neighborhood = !hasCoordinateScope ? geo.neighborhood ?? null : null;
  const borough = !hasCoordinateScope && !neighborhood ? geo.borough ?? null : null;
  const city = !hasCoordinateScope && !neighborhood && !borough ? geo.city ?? null : null;
  const county = !hasCoordinateScope && !neighborhood && !borough && !city ? geo.county ?? null : null;
  const market = !hasCoordinateScope && !neighborhood && !borough && !city && !county ? geo.market ?? null : null;

  return {
    // Category overlap is the canonical matcher. Keep full-text query narrow so
    // synonym lists do not become an accidental all-terms requirement.
    p_query: request.retrievalTerms[0]?.trim() ?? "",
    p_domain: desiredDomain,
    p_categories: categories,
    p_market: market,
    p_state: hasCoordinateScope ? null : geo.state ?? null,
    p_county: county,
    p_borough: borough,
    p_city: city,
    p_neighborhood: neighborhood,
    p_latitude: hasCoordinateScope ? geo.latitude : null,
    p_longitude: hasCoordinateScope ? geo.longitude : null,
    p_radius_miles: hasCoordinateScope ? geo.radiusMiles : null,
    p_limit: Math.min(Math.max(limit, 1), 250),
  };
}

export async function retrieveProfileLocations(
  supabase: SupabaseClient,
  request: RetrievalRequest,
  limit = 60,
): Promise<EnterpriseLocation[]> {
  const params = buildProfileRpcParams(request, limit);
  const { data, error } = await supabase.rpc("enterprise_search_profile_locations", params);
  if (error) throw new Error(`SEARCH_PROFILE_RETRIEVAL_FAILED:${error.message}`);

  const rows = (Array.isArray(data) ? data : []) as EnterpriseLocation[];
  if (!rows.length) {
    const diagnostics = await supabase.rpc("enterprise_search_profile_location_diagnostics", params).catch(() => null);
    if (diagnostics && !diagnostics.error) {
      console.info("SEARCH_PROFILE_RETRIEVAL_EMPTY", {
        desiredRole: request.desiredRole,
        params,
        diagnostics: diagnostics.data,
      });
    }
  }
  return rows;
}
