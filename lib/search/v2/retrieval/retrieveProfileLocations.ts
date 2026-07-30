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

const BROAD_MARKETS = new Set(["NYC_LONG_ISLAND", "NYC + LONG ISLAND", "NYC + Long Island"]);
const PROFILE_TERM_EXPANSIONS: Record<string, readonly string[]> = {
  wings: ["chicken", "fried chicken", "chicken wings", "buffalo wings", "sports bar", "bar food"],
  "chicken wings": ["wings", "chicken", "fried chicken", "buffalo wings", "sports bar", "bar food"],
  "buffalo wings": ["wings", "chicken", "fried chicken", "chicken wings", "sports bar", "bar food"],
  cocktails: ["cocktail bar", "lounge", "bar", "serves alcohol"],
  drinks: ["cocktails", "cocktail bar", "lounge", "bar", "serves alcohol"],
  "rooftop drinks": ["rooftop", "rooftop bar", "rooftop lounge", "lounge"],
};

const cleanTerms = (values: readonly string[]) => [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
const expandTerms = (values: readonly string[]) => cleanTerms(values.flatMap((value) => [value, ...(PROFILE_TERM_EXPANSIONS[value.trim().toLowerCase()] ?? [])]));

export function buildProfileRpcParams(request: RetrievalRequest, limit = 60): ProfileRpcParams {
  const geo = request.geo;
  const hasCoordinateScope = geo.latitude != null && geo.longitude != null && geo.radiusMiles != null;
  const desiredDomain = request.desiredRole === "restaurant" ? "restaurant" : "activity";
  const expandedRetrievalTerms = expandTerms(request.retrievalTerms);
  const expandedFoods = expandTerms(request.foods);
  const categories = cleanTerms([
    ...request.categories,
    ...request.cuisines,
    ...expandedFoods,
    ...request.features,
    ...expandedRetrievalTerms,
  ]).slice(0, 30);

  const neighborhood = !hasCoordinateScope ? geo.neighborhood ?? null : null;
  const borough = !hasCoordinateScope && !neighborhood ? geo.borough ?? null : null;
  const city = !hasCoordinateScope && !neighborhood && !borough ? geo.city ?? null : null;
  const county = !hasCoordinateScope && !neighborhood && !borough && !city ? geo.county ?? null : null;
  const rawMarket = !hasCoordinateScope && !neighborhood && !borough && !city && !county ? geo.market ?? null : null;
  const market = rawMarket && !BROAD_MARKETS.has(rawMarket) ? rawMarket : null;

  return {
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
  if (!rows.length && process.env.SEARCH_PROFILE_DIAGNOSTICS === "true") {
    void Promise.resolve(supabase.rpc("enterprise_search_profile_location_diagnostics", params))
      .then(({ data: diagnostics, error: diagnosticsError }) => {
        if (!diagnosticsError) {
          console.info("SEARCH_PROFILE_RETRIEVAL_EMPTY", {
            desiredRole: request.desiredRole,
            params,
            diagnostics,
          });
        }
      })
      .catch(() => undefined);
  }

  return rows;
}