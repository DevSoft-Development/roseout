import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnterpriseLocation } from "../../enterprise/types";
import type { RetrievalRequest } from "./retrievalTypes";

export type ProfileRpcParams = {
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

export type ProfileRetrievalAttempt = {
  attempt: number;
  desiredRole: string;
  domain: "restaurant" | "activity";
  predicates: ProfileRpcParams;
  resultCount: number;
  error: string | null;
};

const BROAD_MARKETS = new Set(["NYC_LONG_ISLAND", "NYC + LONG ISLAND", "NYC + Long Island"]);
const GENERIC_TERMS = new Set(["restaurant", "activity", "entertainment", "things to do", "general"]);
const SOFT_MODIFIERS = new Set([
  "affordable", "casual", "relaxed", "relaxing", "low key", "low-key", "quiet", "romantic",
  "family friendly", "family-friendly", "date night", "fun", "best", "good", "nice",
]);

const PROFILE_TERM_EXPANSIONS: Record<string, readonly string[]> = {
  wings: ["chicken", "fried chicken", "chicken wings", "buffalo wings", "sports bar", "bar food", "pub"],
  "chicken wings": ["wings", "chicken", "fried chicken", "buffalo wings", "sports bar", "bar food", "pub"],
  "buffalo wings": ["wings", "chicken", "fried chicken", "chicken wings", "sports bar", "bar food", "pub"],
  halal: ["zabiha", "halal food", "halal restaurant", "zabiha restaurant", "middle eastern", "mediterranean", "south asian"],
  zabiha: ["halal", "halal food", "halal restaurant", "zabiha restaurant"],
  "halal food": ["halal", "zabiha", "halal restaurant", "zabiha restaurant", "middle eastern", "mediterranean", "south asian"],
  "halal restaurant": ["halal", "zabiha", "halal food", "zabiha restaurant"],
  cocktails: ["cocktail bar", "cocktails", "lounge", "bar", "serves alcohol", "nightlife"],
  drinks: ["cocktails", "cocktail bar", "lounge", "bar", "serves alcohol", "nightlife"],
  lounge: ["cocktail lounge", "hotel lounge", "bar", "nightlife", "relaxed lounge", "chill lounge"],
  "relaxed lounge": ["lounge", "cocktail lounge", "hotel lounge", "chill lounge", "bar"],
  "chill lounge": ["lounge", "cocktail lounge", "hotel lounge", "bar"],
  "rooftop drinks": ["rooftop", "rooftop bar", "rooftop lounge", "lounge", "nightlife"],
  rooftop: ["rooftop bar", "rooftop lounge", "rooftop drinks", "lounge"],
  "sports viewing": ["sports bar", "watch sports", "game viewing", "bar", "pub"],
  "watch sports": ["sports viewing", "sports bar", "game viewing", "bar", "pub"],
  "game viewing": ["sports viewing", "sports bar", "watch sports", "bar", "pub"],
  "art gallery": ["gallery", "art exhibition", "museum", "arts"],
  karaoke: ["ktv", "singing room", "singing rooms", "sing-along", "sing along", "karaoke bar", "private karaoke", "private rooms", "karaoke lounge"],
  ktv: ["karaoke", "singing room", "singing rooms", "sing-along", "karaoke lounge"],
  "singing room": ["karaoke", "ktv", "singing rooms", "sing-along", "private karaoke"],
  "sing-along": ["karaoke", "ktv", "singing room", "singing rooms", "sing along"],
  "karaoke bar": ["karaoke", "ktv", "private karaoke", "singing room", "singing rooms", "sing-along", "private rooms", "karaoke lounge"],
  "escape room": ["escape game", "puzzle room", "immersive game", "escape rooms"],
};

const cleanTerms = (values: readonly string[]) => [
  ...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)),
];
const expandTerms = (values: readonly string[]) => cleanTerms(
  values.flatMap((value) => [value, ...(PROFILE_TERM_EXPANSIONS[value.trim().toLowerCase()] ?? [])]),
);

function focusedTerms(request: RetrievalRequest) {
  const restaurant = request.desiredRole === "restaurant";
  const base = restaurant
    ? [...request.cuisines, ...request.foods, ...request.features, ...request.retrievalTerms]
    : [...request.categories, ...request.features, ...request.retrievalTerms];
  return expandTerms(base).filter((term) => !GENERIC_TERMS.has(term));
}

function normalizedMarket(value: string | null | undefined) {
  return value && !BROAD_MARKETS.has(value) ? value : null;
}

function termVariants(request: RetrievalRequest) {
  const focused = focusedTerms(request);
  const withoutSoftModifiers = focused.filter((term) => !SOFT_MODIFIERS.has(term));
  const atomic = cleanTerms(
    withoutSoftModifiers.flatMap((term) => term.split(/\s+(?:and|with|after|near)\s+|[,/]/g)),
  );
  const domainCore = request.desiredRole === "restaurant"
    ? cleanTerms([...request.cuisines, ...request.foods, ...request.features])
    : cleanTerms([...request.categories, ...request.features]);
  const expandedCore = expandTerms(domainCore).filter(
    (term) => !GENERIC_TERMS.has(term) && !SOFT_MODIFIERS.has(term),
  );
  const variants = [
    focused,
    withoutSoftModifiers,
    expandedCore,
    atomic,
    focused.slice(0, 8),
    expandedCore.slice(0, 8),
  ].filter((terms) => terms.length);
  return variants.filter(
    (terms, index, all) => all.findIndex((other) => JSON.stringify(other) === JSON.stringify(terms)) === index,
  );
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

function withTerms(params: ProfileRpcParams, terms: string[]): ProfileRpcParams {
  return { ...params, p_query: terms[0] ?? "", p_categories: terms.slice(0, 40) };
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
  const geoAttempts: ProfileRpcParams[] = [];
  const hasCoordinates = geo.latitude != null && geo.longitude != null && geo.radiusMiles != null;
  if (hasCoordinates) geoAttempts.push(base);
  geoAttempts.push(textualAttempt(base, {
    p_neighborhood: geo.neighborhood ?? null,
    p_city: geo.city ?? null,
    p_borough: geo.borough ?? null,
    p_county: geo.county ?? null,
    p_market: normalizedMarket(geo.market),
  }));
  if (allowBroaderGeo) {
    if (geo.city) geoAttempts.push(textualAttempt(base, {
      p_city: geo.city,
      p_county: geo.county ?? null,
      p_market: normalizedMarket(geo.market),
    }));
    if (geo.borough) geoAttempts.push(textualAttempt(base, {
      p_borough: geo.borough,
      p_market: normalizedMarket(geo.market),
    }));
    if (geo.county) geoAttempts.push(textualAttempt(base, {
      p_county: geo.county,
      p_market: normalizedMarket(geo.market),
    }));
    if (normalizedMarket(geo.market)) geoAttempts.push(textualAttempt(base, {
      p_market: normalizedMarket(geo.market),
    }));
    if (geo.state) geoAttempts.push(textualAttempt(base, { p_state: geo.state }));
  }
  const attempts = geoAttempts.flatMap((geoAttempt) =>
    termVariants(request).map((terms) => withTerms(geoAttempt, terms)),
  );
  return attempts.filter(
    (params, index, all) => all.findIndex((other) => JSON.stringify(other) === JSON.stringify(params)) === index,
  );
}

export async function retrieveProfileLocations(
  supabase: SupabaseClient,
  request: RetrievalRequest,
  limit = 60,
  allowBroaderGeo = true,
  onAttempt?: (attempt: ProfileRetrievalAttempt) => void,
): Promise<EnterpriseLocation[]> {
  const attempts = buildProfileRpcAttempts(request, limit, allowBroaderGeo);
  let lastError: string | null = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const params = attempts[index];
    const { data, error } = await supabase.rpc("enterprise_search_profile_locations", params);
    const rows = (Array.isArray(data) ? data : []) as EnterpriseLocation[];
    const errorMessage = error?.message ?? null;
    onAttempt?.({
      attempt: index + 1,
      desiredRole: request.desiredRole,
      domain: params.p_domain,
      predicates: params,
      resultCount: rows.length,
      error: errorMessage,
    });
    if (error) {
      lastError = error.message;
      continue;
    }
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
