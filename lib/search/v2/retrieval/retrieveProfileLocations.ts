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
const GENERIC_TERMS = new Set(["restaurant", "activity", "entertainment", "things to do", "general"]);
const PROFILE_TERM_EXPANSIONS: Record<string, readonly string[]> = {
  wings: ["chicken", "fried chicken", "chicken wings", "buffalo wings", "sports bar", "bar food", "pub"],
  "chicken wings": ["wings", "chicken", "fried chicken", "buffalo wings", "sports bar", "bar food", "pub"],
  "buffalo wings": ["wings", "chicken", "fried chicken", "chicken wings", "sports bar", "bar food", "pub"],
  cocktails: ["cocktail bar", "cocktails", "lounge", "bar", "serves alcohol", "nightlife"],
  drinks: ["cocktails", "cocktail bar", "lounge", "bar", "serves alcohol", "nightlife"],
  "rooftop drinks": ["rooftop", "rooftop bar", "rooftop lounge", "lounge", "nightlife"],
  rooftop: ["rooftop bar", "rooftop lounge", "rooftop drinks", "lounge"],
  "sports viewing": ["sports bar", "watch sports", "game viewing", "bar", "pub"],
  "watch sports": ["sports viewing", "sports bar", "game viewing", "bar", "pub"],
  "game viewing": ["sports viewing", "sports bar", "watch sports", "bar", "pub"],
  "art gallery": ["gallery", "art exhibition", "museum", "arts"],
  karaoke: ["karaoke bar", "private karaoke", "singing rooms", "private rooms"],
  "escape room": ["escape game", "puzzle room", "immersive game"],
};

const cleanTerms = (values: readonly string[]) => [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
const expandTerms = (values: readonly string[]) => cleanTerms(values.flatMap((value) => [value, ...(PROFILE_TERM_EXPANSIONS[value.trim().toLowerCase()] ?? [])]));

function focusedTerms(request: RetrievalRequest) {
  const desiredDomain = request.desiredRole === "restaurant" ? "restaurant" : "activity";
  const base = desiredDomain === "restaurant"
    ? [...request.cuisines, ...request.foods, ...request.features, ...request.retrievalTerms]
    : [...request.categories, ...request.features, ...request.retrievalTerms];
  return expandTerms(base).filter((term) => !GENERIC_TERMS.has(term));
}

export function buildProfileRpcParams(request: RetrievalRequest, limit = 60): ProfileRpcParams {
  const geo = request.geo;
  const hasCoordinateScope = geo.latitude != null && geo.longitude != null && geo.radiusMiles != null;
  const desiredDomain = request.desiredRole === "restaurant" ? "restaurant" : "activity";
  const terms = focusedTerms(request);
  const categories = terms.slice(0, 40);
  const neighborhood = !hasCoordinateScope ? geo.neighborhood ?? null : null;
  const borough = !hasCoordinateScope && !neighborhood ? geo.borough ?? null : null;
  const city = !hasCoordinateScope && !neighborhood && !borough ? geo.city ?? null : null;
  const county = !hasCoordinateScope && !neighborhood && !borough && !city ? geo.county ?? null : null;
  const rawMarket = !hasCoordinateScope && !neighborhood && !borough && !city && !county ? geo.market ?? null : null;
  const market = rawMarket && !BROAD_MARKETS.has(rawMarket) ? rawMarket : null;

  return {
    p_query: terms[0] ?? "",
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

function geoFallbackParams(base: ProfileRpcParams): ProfileRpcParams[] {
  const attempts: ProfileRpcParams[] = [base];
  const push = (patch: Partial<ProfileRpcParams>) => attempts.push({ ...base, ...patch });

  if (base.p_latitude != null && base.p_longitude != null && base.p_radius_miles != null) {
    push({ p_latitude: null, p_longitude: null, p_radius_miles: null });
  }
  if (base.p_neighborhood) push({ p_neighborhood: null, p_borough: base.p_borough, p_city: base.p_city });
  if (base.p_borough) push({ p_neighborhood: null, p_borough: null, p_city: base.p_city });
  if (base.p_city) push({ p_neighborhood: null, p_borough: null, p_city: null, p_county: base.p_county });
  if (base.p_county) push({ p_neighborhood: null, p_borough: null, p_city: null, p_county: null, p_market: base.p_market });
  if (base.p_market || base.p_state) push({ p_neighborhood: null, p_borough: null, p_city: null, p_county: null, p_market: null, p_state: base.p_state });

  return attempts.filter((params, index, all) => all.findIndex((other) => JSON.stringify(other) === JSON.stringify(params)) === index);
}

export async function retrieveProfileLocations(
  supabase: SupabaseClient,
  request: RetrievalRequest,
  limit = 60,
): Promise<EnterpriseLocation[]> {
  const baseParams = buildProfileRpcParams(request, limit);
  let lastError: string | null = null;

  for (const params of geoFallbackParams(baseParams)) {
    const { data, error } = await supabase.rpc("enterprise_search_profile_locations", params);
    if (error) {
      lastError = error.message;
      continue;
    }
    const rows = (Array.isArray(data) ? data : []) as EnterpriseLocation[];
    if (rows.length) return rows;
  }

  if (lastError) throw new Error(`SEARCH_PROFILE_RETRIEVAL_FAILED:${lastError}`);

  if (process.env.SEARCH_PROFILE_DIAGNOSTICS === "true") {
    void Promise.resolve(supabase.rpc("enterprise_search_profile_location_diagnostics", baseParams))
      .then(({ data: diagnostics, error: diagnosticsError }) => {
        if (!diagnosticsError) console.info("SEARCH_PROFILE_RETRIEVAL_EMPTY", { desiredRole: request.desiredRole, params: baseParams, diagnostics });
      })
      .catch(() => undefined);
  }

  return [];
}
