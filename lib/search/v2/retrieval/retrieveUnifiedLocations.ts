import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import type { EnterpriseLocation } from "../../enterprise/types";
import { buildGeoPredicateDiagnostics } from "../geo/localityResolver";
import { candidateMatchesRequestedGeo, sameGeoValue } from "../geo/geoBoundary";
import type { SearchTrace } from "../observability/searchTrace";
import type { RetrievalRequest } from "./retrievalTypes";

export type GeoLevel = "exact_neighborhood" | "city" | "borough_or_county" | "market" | "state";
type LegacyGeoScope = { level: GeoLevel; neighborhood: string | null; city: string | null; borough: string | null; county: string | null; market: string | null; state: string | null; latitude: number | null; longitude: number | null; radiusMiles: number | null };
const LEVEL_ORDER: GeoLevel[] = ["exact_neighborhood", "city", "borough_or_county", "market", "state"];
const GENERIC_TERMS = new Set(["restaurant", "activity", "dinner", "lunch", "brunch", "breakfast", "food", "things to do"]);

export function normalizeDomainEvidence(value: unknown) {
  return typeof value === "string"
    ? value.toLowerCase().normalize("NFKD").replace(/[’']/g, "").replace(/[_\-–—/]+/g, " ").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim()
    : "";
}
function normalize(value: unknown) { return normalizeDomainEvidence(value).replace(/\bcounty\b/g, "").replace(/\bcore\b/g, "").replace(/\s+/g, " ").trim(); }
function finiteNumber(value: unknown): number | null { const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN; return Number.isFinite(parsed) ? parsed : null; }
function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) { const r = 3958.7613; const rad = (d: number) => d * Math.PI / 180; const dLat = rad(lat2 - lat1); const dLon = rad(lon2 - lon1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2; return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
function resolveRegion(request: RetrievalRequest, marketOverride?: string | null): string | null { const geo = request.geo; const record = normalizeGeoTerm(marketOverride ?? geo.neighborhood ?? geo.borough ?? geo.city ?? geo.county ?? geo.market ?? geo.state); return record?.region ?? (record?.type === "region" ? record.name : null); }
function hasOrigin(request: RetrievalRequest) { return finiteNumber(request.geo.latitude) != null && finiteNumber(request.geo.longitude) != null; }
function normalizeCoordinates(location: EnterpriseLocation, request: RetrievalRequest): EnterpriseLocation { const row = location as EnterpriseLocation & Record<string, unknown>; const latitude = finiteNumber(row.latitude ?? row.lat); const longitude = finiteNumber(row.longitude ?? row.lng ?? row.lon); const originLatitude = finiteNumber(request.geo.latitude); const originLongitude = finiteNumber(request.geo.longitude); const rpcDistance = finiteNumber(row.distance_miles ?? row.distanceMiles); const computedDistance = latitude != null && longitude != null && originLatitude != null && originLongitude != null ? haversineMiles(originLatitude, originLongitude, latitude, longitude) : rpcDistance; return { ...location, latitude, longitude, distance_miles: computedDistance, distanceMiles: computedDistance } as EnterpriseLocation; }
function textualScopeMatch(location: EnterpriseLocation, scope: LegacyGeoScope) { const row = location as EnterpriseLocation & Record<string, unknown>; if (scope.state && row.state && !sameGeoValue(row.state, scope.state)) return false; if (scope.neighborhood && ![row.neighborhood, row.city].some((value) => sameGeoValue(value, scope.neighborhood))) return false; if (scope.city && ![row.city, row.neighborhood].some((value) => sameGeoValue(value, scope.city))) return false; if (scope.borough && row.borough && !sameGeoValue(row.borough, scope.borough)) return false; if (scope.county && row.county && !sameGeoValue(row.county, scope.county)) return false; if (scope.market && row.market && !sameGeoValue(row.market, scope.market)) return false; return true; }
function coordinateScopeMatch(location: EnterpriseLocation, request: RetrievalRequest, cap: number) { const distance = finiteNumber((location as EnterpriseLocation & Record<string, unknown>).distance_miles); const boundary = candidateMatchesRequestedGeo({ ...request.geo, radiusMiles: cap }, location); return boundary.matches && distance != null && cap > 0 && distance <= cap; }
function flattenEvidence(location: EnterpriseLocation) { const row = location as EnterpriseLocation & Record<string, unknown>; const fields = [row.name, row.restaurant_name, row.activity_name, row.description, row.cuisine, row.cuisine_type, row.food_type, row.primary_category, row.activity_type, row.category, row.primary_tag, row.search_keywords, row.semantic_tags, row.intent_tags, row.tags, row.special_features, row.best_for, row.search_document, row.semantic_search_text]; return normalizeDomainEvidence(fields.flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean).join(" ")); }
function aliasesForTerm(term: string) { const n = normalizeDomainEvidence(term); const aliases: Record<string, string[]> = { italian: ["italian", "pasta", "pizza", "trattoria", "osteria"], sushi: ["sushi", "japanese", "omakase", "sashimi"], halal: ["halal", "zabiha"], "escape room": ["escape room", "escape rooms", "escape game", "escape games", "escape experience", "puzzle room", "puzzle rooms", "immersive game"], "live music": ["live music", "music venue", "concert", "concert venue", "jazz", "jazz club", "live band", "performance venue"], karaoke: ["karaoke", "ktv", "singing room", "sing along"] }; return (aliases[n] ?? [n]).map(normalizeDomainEvidence); }
export function hasStrongDomainEvidence(location: EnterpriseLocation, request: RetrievalRequest) { const requested = [...request.cuisines, ...request.foods, ...request.categories].map(normalizeDomainEvidence).filter((term) => term && !GENERIC_TERMS.has(term)); if (!requested.length) return true; const evidence = ` ${flattenEvidence(location)} `; return requested.some((term) => aliasesForTerm(term).some((alias) => evidence.includes(` ${alias} `))); }
function explicitLocalGeo(request: RetrievalRequest) { return Boolean(request.geo.neighborhood || request.geo.city || request.geo.borough || request.geo.county); }
function maxOriginMiles(request: RetrievalRequest, level: GeoLevel) { const base = finiteNumber(request.geo.radiusMiles) ?? 6; if (level === "exact_neighborhood" || level === "city") return Math.max(base, 6); if (level === "borough_or_county") return Math.min(Math.max(base * 2, 12), 25); if (level === "market") return Math.min(Math.max(base * 3, 18), 35); return explicitLocalGeo(request) ? 0 : Math.min(Math.max(base * 4, 25), 60); }
export function buildLegacyGeoLevels(request: RetrievalRequest, allowBroaderGeo: boolean): GeoLevel[] { const levels: GeoLevel[] = ["exact_neighborhood"]; if (!allowBroaderGeo) return levels; if (request.geo.city) levels.push("city"); if (request.geo.borough || request.geo.county) levels.push("borough_or_county"); if (request.geo.market) levels.push("market"); if (!explicitLocalGeo(request) && request.geo.state) levels.push("state"); return LEVEL_ORDER.filter((level) => levels.includes(level)); }
function scopeFor(request: RetrievalRequest, level: GeoLevel): LegacyGeoScope { const geo = request.geo; if (level === "exact_neighborhood") return { level, neighborhood: geo.neighborhood ?? null, city: geo.city ?? null, borough: geo.borough ?? null, county: geo.county ?? null, market: geo.market ?? null, state: geo.state ?? null, latitude: geo.latitude ?? null, longitude: geo.longitude ?? null, radiusMiles: geo.radiusMiles ?? null }; if (level === "city") return { level, neighborhood: null, city: geo.city ?? null, borough: null, county: geo.county ?? null, market: geo.market ?? null, state: geo.state ?? null, latitude: geo.latitude ?? null, longitude: geo.longitude ?? null, radiusMiles: hasOrigin(request) ? maxOriginMiles(request, level) : null }; if (level === "borough_or_county") return { level, neighborhood: null, city: null, borough: geo.borough ?? null, county: geo.county ?? null, market: geo.market ?? null, state: geo.state ?? null, latitude: geo.latitude ?? null, longitude: geo.longitude ?? null, radiusMiles: hasOrigin(request) ? maxOriginMiles(request, level) : null }; if (level === "market") return { level, neighborhood: null, city: null, borough: null, county: null, market: geo.market ?? null, state: geo.state ?? null, latitude: geo.latitude ?? null, longitude: geo.longitude ?? null, radiusMiles: hasOrigin(request) ? maxOriginMiles(request, level) : null }; return { level, neighborhood: null, city: null, borough: null, county: null, market: null, state: geo.state ?? null, latitude: geo.latitude ?? null, longitude: geo.longitude ?? null, radiusMiles: hasOrigin(request) ? maxOriginMiles(request, level) : null }; }
function isLiveMusicRequest(request: RetrievalRequest) { const role = normalizeDomainEvidence(request.desiredRole); const terms = request.retrievalTerms.map(normalizeDomainEvidence); return role === "live music activity" || terms.some((term) => /^(live music|music venue|jazz|concert|live band)$/.test(term)); }

export async function retrieveUnifiedLocations(supabase: SupabaseClient, request: RetrievalRequest, limit = 60, trace?: SearchTrace, options: { allowBroaderGeo?: boolean; forcedGeoLevel?: GeoLevel } = {}): Promise<EnterpriseLocation[]> {
  const searchTerms = [...new Set(request.retrievalTerms)].slice(0, 20); const liveMusic = isLiveMusicRequest(request); const rpcName = liveMusic ? "enterprise_search_live_music_locations" : "enterprise_search_locations";
  const levels = options.forcedGeoLevel ? [options.forcedGeoLevel] : buildLegacyGeoLevels(request, Boolean(options.allowBroaderGeo));
  for (const level of levels) {
    const scope = scopeFor(request, level); if (level === "state" && maxOriginMiles(request, level) === 0) continue;
    const params = liveMusic ? { p_search_terms: searchTerms, p_neighborhood: scope.neighborhood, p_borough: scope.borough, p_city: scope.city, p_county: scope.county, p_state: scope.state, p_latitude: scope.latitude, p_longitude: scope.longitude, p_radius_miles: scope.radiusMiles, p_limit: limit } : { p_search_terms: searchTerms, p_domain: request.desiredRole === "restaurant" ? "restaurant" : "activity", p_neighborhood: scope.neighborhood, p_borough: scope.borough, p_city: scope.city, p_county: scope.county, p_region: resolveRegion(request, scope.market), p_state: scope.state, p_latitude: scope.latitude, p_longitude: scope.longitude, p_radius_miles: scope.radiusMiles, p_limit: limit, p_allow_places_of_worship: false, p_allow_low_level: false };
    const { data, error } = await supabase.rpc(rpcName, params); if (error) throw new Error(`SEARCH_V2_RETRIEVAL_FAILED:${rpcName}:${error.message}`);
    const raw = (Array.isArray(data) ? data : []).map((location) => normalizeCoordinates(location as EnterpriseLocation, request));
    const cap = maxOriginMiles(request, level); const originAvailable = hasOrigin(request); const geoQualified = raw.filter((location) => originAvailable ? coordinateScopeMatch(location, request, cap) : textualScopeMatch(location, scope)); const retained = geoQualified.filter((location) => hasStrongDomainEvidence(location, request)).map((location) => ({ ...location, retrieval_geo_level: level } as EnterpriseLocation));
    if (trace) {
      if (!raw.length) trace.rejections.retrievalRpcEmpty += 1;
      trace.rejections.strictGeo += raw.length - geoQualified.length;
      trace.decisions.push({
        stage: "retrieval_geo_predicates",
        decision: retained.length ? "geo_level_succeeded" : "geo_level_empty",
        reason: JSON.stringify({
          lane: request.desiredRole,
          rpcName,
          level,
          locality: buildGeoPredicateDiagnostics({ ...request.geo, radiusMiles: scope.radiusMiles }),
          rpcPredicates: params,
          requestedAreaRadiusMiles: scope.radiusMiles,
          pairWalkingMinutes: null,
          rawCount: raw.length,
          geoQualifiedCount: geoQualified.length,
          strongEvidenceCount: retained.length,
        }),
      });
    }
    if (retained.length) return retained.slice(0, limit);
  }
  return [];
}
