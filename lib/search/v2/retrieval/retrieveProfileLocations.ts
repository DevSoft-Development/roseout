import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnterpriseLocation } from "../../enterprise/types";
import type { RetrievalRequest } from "./retrievalTypes";

export async function retrieveProfileLocations(
  supabase: SupabaseClient,
  request: RetrievalRequest,
  limit = 60,
): Promise<EnterpriseLocation[]> {
  const geo = request.geo;
  const desiredDomain = request.desiredRole === "restaurant" ? "restaurant" : "activity";
  const { data, error } = await supabase.rpc("enterprise_search_profile_locations", {
    p_query: request.retrievalTerms.join(" "),
    p_domain: desiredDomain,
    p_categories: request.retrievalTerms.slice(0, 20),
    p_market: geo.market ?? null,
    p_state: geo.state ?? null,
    p_county: geo.county ?? null,
    p_borough: geo.borough ?? null,
    p_city: geo.city ?? null,
    p_neighborhood: geo.neighborhood ?? null,
    p_latitude: geo.latitude ?? null,
    p_longitude: geo.longitude ?? null,
    p_radius_miles: geo.radiusMiles ?? null,
    p_limit: limit,
  });
  if (error) throw new Error(`SEARCH_PROFILE_RETRIEVAL_FAILED:${error.message}`);
  return (Array.isArray(data) ? data : []) as EnterpriseLocation[];
}
