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

function normalizedMarket(value: string | null | undefined) {
  return value && !BROAD_MARKETS.has(value) ? value : null;
}

function baseProfileRpcParams(request: RetrievalRequest, limit: number): ProfileRpcParams {
  const terms = focusedTerms(request);
  return {
    p_query: terms[0] ?? "",
    p_domain: request.desiredRole === "restaurant" ? "restaurant" : "activity",
    p_categories: terms.slice(0, 40),
    p_market: normalizedMarket(request.geo.market),
    p_state: request.geo.state ?? null,
    p_county: request.geo.county ?? null,
    p_borough: request.geo.borough ?? null,
    p_city: request.geo.city ?? null,
    p_neighborhood: request.geo.neighborhood ?? null,
    p_latitude: request.geo.latitude ?? null,
    p_longitude: request.geo.longitude ?? null,
    p_radius_miles: request.geo.radiusMiles ?? null,
    p_limit: Math.min(Math.max(limit, 1), 250),
  };
}

function textualAttempt(base: ProfileRpcParams, patch: Partial<ProfileRpcParams>): ProfileRpcParams {
  return {
    ...base,
    p_latitude: null,
    p_longitude: null,
    p_radius_miles: null,
    p_neighborhood: null,
    p_borough: null,
    p_city: null,
    p_county: null,
    p_market: null,
    ...patch,
  };
}

export function buildProfileRpcParams(request: RetrievalRequest, limit = 60): ProfileRpcParams {
  return buildProfileRpcAttempts(request, limit, false)[0];
}

export function buildProfileRpcAttempts(
  request: RetrievalRequest,
  limit = 60,
  allowBroaderGeo = true,
): ProfileRpcParams[] {
  const base = baseProfileRpcParams(request, limit);
  const geo = request.geo;
  const attempts: ProfileRpcParams[] = [];
  const hasCoordinates = geo.latitude != null && geo.longitude != null && geo.radiusMiles != null;

  if (hasCoordinates) attempts.push(base);

  attempts.push(textualAttempt(base, {
    p_neighborhood: geo.neighborhood ?? null,
    p_city: geo.city ?? null,
    p_borough: geo.borough ?? null,
    p_county: geo.county ?? null,
    p_market: normalizedMarket(geo.market),
  }));

  if (allowBroaderGeo) {
    if (geo.city) attempts.push(textualAttempt(base, {
      p_city: geo.city,
      p_county: geo.county ?? null,
      p_market: normalizedMarket(geo.market),
    }));
    if (geo.borough) attempts.push(textualAttempt(base, {
      p_borough: geo.borough,
      p_market: normalizedMarket(geo.market),
    }));
    if (geo.county) attempts.push(textualAttempt(base, {
      p_county: geo.county,
      p_market: normalizedMarket(geo.market),
    }));
    if (normalizedMarket(geo.market)) attempts.push(textualAttempt(base, {
      p_market: normalizedMarket(geo.market),
    }));
    if (geo.state) attempts.push(textualAttempt(base, {
      p_state: geo.state,
    }));
  }

  return attempts.filter((params, index, all) =>
    all.findIndex((other) => JSON.stringify(other) === JSON.stringify(params)) === index,
  );
}

export async function retrieveProfileLocations(
  supabase: SupabaseClient,
  request: RetrievalRequest,
  limit = 60,
  allowBroaderGeo = true,
): Promise<EnterpriseLocation[]> {
  const attempts = buildProfileRpcAttempts(request, limit, allowBroaderGeo);
  let lastError: string | null = null;

  for (const params of attempts) {
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
    void Promise.resolve(supabase.rpc("enterprise_search_profile_location_diagnostics", attempts[0]))
      .then(({ data: diagnostics, error: diagnosticsError }) => {
        if (!diagnosticsError) console.info("SEARCH_PROFILE_RETRIEVAL_EMPTY", {
          desiredRole: request.desiredRole,
          attempts,
          diagnostics,
        });
      })
      .catch(() => undefined);
  }

  return [];
}
