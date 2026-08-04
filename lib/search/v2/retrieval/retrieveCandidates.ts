import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyCandidateGeo, geoTierRank, type GeoScopeLevel } from "../geo/geoPolicy";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { buildRetrievalRequests } from "./buildRetrievalRequests";
import {
  buildLegacyGeoLevels,
  retrieveUnifiedLocations,
  type GeoLevel,
} from "./retrieveUnifiedLocations";
import { retrieveProfileLocations } from "./retrieveProfileLocations";
import { resolveSearchProfileRollout, type SearchProfileMode } from "./searchProfileMode";
import { getEffectiveSearchProfileRolloutConfig } from "./searchProfileRolloutConfig";
import { RetrievalBudget } from "./retrievalBudget";
import type { RetrievalResult, RetrievedCandidate } from "./retrievalTypes";

export type SearchProfileRolloutOverride = {
  mode: SearchProfileMode;
  canaryPercent: number;
  killSwitch?: boolean;
  strictNoFallback?: boolean;
};

export function candidateFrom(
  location: any,
  request: ReturnType<typeof buildRetrievalRequests>[number],
  source: string,
  plan: SearchPlan,
  retrievalGeoLevel: GeoScopeLevel | null = null,
): RetrievedCandidate {
  const canonicalProfile = source === "enterprise_search_profile_locations";
  const serialized = JSON.stringify(location).toLowerCase();
  const matchedRetrievalTerms = canonicalProfile
    ? [...request.retrievalTerms]
    : request.retrievalTerms.filter((term) => serialized.includes(term.toLowerCase()));
  const geoMatch = classifyCandidateGeo(plan, location);
  return {
    location,
    retrievalSources: [source],
    matchedRetrievalTerms,
    requestedRoles: [request.desiredRole],
    distanceMiles: typeof location.distance_miles === "number" ? location.distance_miles : null,
    geoMatch,
    retrievalGeoLevel: retrievalGeoLevel ?? geoMatch.scopeLevel,
  };
}

function retrievalDomain(role: string) {
  return role === "restaurant" || role.endsWith("_restaurant") ? "restaurant" : "activity";
}

function requiredDomains(plan: SearchPlan) {
  return {
    restaurant: Boolean(plan.restaurant?.required),
    activity: Boolean(plan.activity?.required),
  };
}

function candidateOriginDistanceIsHard(plan: SearchPlan) {
  return (
    plan.travel.constraint === "hard" &&
    plan.pairing.maxDistanceMiles != null &&
    (plan.geo.source === "anchor" || plan.geo.source === "current_location")
  );
}

function enforceHardDistanceRows(rows: any[], plan: SearchPlan, trace: SearchTrace, stage: string) {
  if (!candidateOriginDistanceIsHard(plan)) return rows;
  const max = Number(plan.pairing.maxDistanceMiles);
  const filtered = rows.filter((row) => typeof row.distance_miles === "number" && Number.isFinite(row.distance_miles) && row.distance_miles <= max);
  const rejected = rows.length - filtered.length;
  if (rejected) {
    trace.decisions.push({
      stage,
      decision: "hard_candidate_origin_distance_rows_removed",
      reason: JSON.stringify({ rejected, maxDistanceMiles: max, travelMode: plan.travel.mode, geoSource: plan.geo.source }),
    });
  }
  return filtered;
}

async function retrieveLegacyAtSharedLevel(
  supabase: SupabaseClient,
  requests: ReturnType<typeof buildRetrievalRequests>,
  plan: SearchPlan,
  trace: SearchTrace,
) {
  const required = requiredDomains(plan);
  const levels = buildLegacyGeoLevels(requests[0], plan.fallback.allowBroaderGeo);
  let bestPartial: {
    level: GeoLevel;
    rows: Array<{ request: (typeof requests)[number]; rows: any[] }>;
    coveredDomains: number;
    rowCount: number;
  } | null = null;

  for (const level of levels) {
    const rows = await Promise.all(requests.map(async (request) => ({
      request,
      rows: enforceHardDistanceRows(
        await retrieveUnifiedLocations(supabase, request, 60, trace, { allowBroaderGeo: false, forcedGeoLevel: level }),
        plan,
        trace,
        "legacy_shared_geo",
      ),
    })));
    const hasRestaurant = rows.some(({ request, rows }) => retrievalDomain(request.desiredRole) === "restaurant" && rows.length > 0);
    const hasActivity = rows.some(({ request, rows }) => retrievalDomain(request.desiredRole) === "activity" && rows.length > 0);
    const viable = (!required.restaurant || hasRestaurant) && (!required.activity || hasActivity);
    const coveredDomains = Number(hasRestaurant) + Number(hasActivity);
    const rowCount = rows.reduce((sum, lane) => sum + lane.rows.length, 0);
    trace.decisions.push({ stage: "paired_geo_scope", decision: viable ? "shared_geo_level_succeeded" : "shared_geo_level_incomplete", reason: `level=${level}, restaurant=${hasRestaurant}, activity=${hasActivity}` });
    if (viable) return { level, rows };
    if (plan.fallback.allowPartial && rowCount > 0 && (!bestPartial || coveredDomains > bestPartial.coveredDomains || (coveredDomains === bestPartial.coveredDomains && rowCount > bestPartial.rowCount))) {
      bestPartial = { level, rows, coveredDomains, rowCount };
    }
  }

  if (bestPartial) {
    trace.decisions.push({ stage: "paired_geo_scope", decision: "best_partial_geo_level_preserved", reason: `level=${bestPartial.level}, covered_domains=${bestPartial.coveredDomains}, rows=${bestPartial.rowCount}` });
    return { level: bestPartial.level, rows: bestPartial.rows };
  }
  return { level: null as GeoLevel | null, rows: requests.map((request) => ({ request, rows: [] as any[] })) };
}

function asGeoScopeLevel(level: GeoLevel | null | undefined): GeoScopeLevel | null {
  switch (level) {
    case "exact_neighborhood":
      return "neighborhood";
    case "city":
      return "city";
    case "borough_or_county":
      return "county";
    case "market":
      return "market";
    case "state":
    case null:
    case undefined:
      return null;
    default: {
      const exhaustive: never = level;
      return exhaustive;
    }
  }
}

export async function retrieveCandidates({ plan, supabase, trace, rolloutOverride }: {
  plan: SearchPlan;
  supabase: SupabaseClient;
  trace: SearchTrace;
  rolloutOverride?: SearchProfileRolloutOverride;
}): Promise<RetrievalResult> {
  const requests = buildRetrievalRequests(plan);
  const budget = new RetrievalBudget();
  const effectiveConfig = rolloutOverride ?? (await getEffectiveSearchProfileRolloutConfig());
  const rollout = resolveSearchProfileRollout(trace.requestId, effectiveConfig);
  const strictNoFallback = Boolean(rolloutOverride?.strictNoFallback);

  trace.retrieval.configuredMode = rollout.mode;
  trace.retrieval.canaryBucket = rollout.bucket;
  trace.retrieval.canaryPercent = rollout.canaryPercent;
  trace.retrieval.profileVersion = 4;

  const paired = Boolean(plan.restaurant?.required && plan.activity?.required);
  let sharedLegacy: Awaited<ReturnType<typeof retrieveLegacyAtSharedLevel>> | null = null;
  if (paired && !strictNoFallback && !rollout.serveProfiles) sharedLegacy = await retrieveLegacyAtSharedLevel(supabase, requests, plan, trace);

  const lanes = await Promise.all(requests.map(async (request) => {
    const key = JSON.stringify(request);
    if (!budget.claim(key)) return [];
    const started = performance.now();
    let profileRows: any[] = [];
    let legacyRows: any[] = [];
    const domain = retrievalDomain(request.desiredRole);

    if (rollout.serveProfiles || rollout.shadowProfiles) {
      try {
        profileRows = enforceHardDistanceRows(await retrieveProfileLocations(supabase, request, 60, plan.fallback.allowBroaderGeo, (attempt) => {
          trace.decisions.push({ stage: "profile_retrieval_predicates", decision: attempt.error ? "profile_attempt_failed" : attempt.resultCount ? "profile_attempt_succeeded" : "profile_attempt_empty", reason: JSON.stringify(attempt) });
        }), plan, trace, "profile_retrieval");
      } catch (error) {
        trace.decisions.push({ stage: "retrieval", decision: "profile_rpc_failed", reason: `${domain}:${error instanceof Error ? error.message : "unknown profile retrieval failure"}` });
      }
      trace.retrieval.profileCandidateCount += profileRows.length;
    }

    const profileMissingForLane = profileRows.length === 0;
    const legacyAllowed = !strictNoFallback && (!rollout.serveProfiles || rollout.shadowProfiles || profileMissingForLane);
    if (legacyAllowed) {
      const shared = sharedLegacy?.rows.find((lane) => lane.request === request);
      const rawLegacyRows = shared ? shared.rows : await retrieveUnifiedLocations(supabase, request, 60, trace, { allowBroaderGeo: candidateOriginDistanceIsHard(plan) ? false : plan.fallback.allowBroaderGeo });
      legacyRows = enforceHardDistanceRows(rawLegacyRows, plan, trace, "legacy_retrieval");
      trace.retrieval.legacyCandidateCount += legacyRows.length;
    }

    const useFallback = !strictNoFallback && rollout.serveProfiles && profileMissingForLane && legacyRows.length > 0;
    if (useFallback) {
      trace.retrieval.legacyFallbackUsed = true;
      trace.retrieval.fallbackDomains = [...new Set([...trace.retrieval.fallbackDomains, domain])];
      trace.decisions.push({ stage: "retrieval", decision: "missing_profile_lane_legacy_recovery", reason: JSON.stringify({ domain, desiredRole: request.desiredRole, profileCandidateCount: profileRows.length, legacyCandidateCount: legacyRows.length, requestedAreaRadiusMiles: request.geo.radiusMiles, pairMaxWalkingMinutes: plan.pairing.maxWalkingMinutes, pairMaxDistanceMiles: plan.pairing.maxDistanceMiles }) });
    }

    const servedRows = rollout.serveProfiles ? profileRows.length ? profileRows : strictNoFallback ? [] : legacyRows : legacyRows;
    const source = rollout.serveProfiles && profileRows.length ? "canonical_profile" : "legacy";
    const retrievalGeoLevel = source === "legacy" ? asGeoScopeLevel(sharedLegacy?.level) : null;

    trace.retrievalCalls.push({
      role: request.desiredRole,
      domain,
      retrievalTerms: [...request.retrievalTerms],
      categories: [...request.categories],
      cuisines: [...request.cuisines],
      foods: [...request.foods],
      features: [...request.features],
      reason: sharedLegacy?.level ? `legacy_shared_geo_${sharedLegacy.level}` : strictNoFallback && rollout.serveProfiles && profileRows.length === 0 ? "canonical_profile_strict_empty" : useFallback ? "profile_empty_domain_fallback" : `${source}_primary_retrieval`,
      durationMs: performance.now() - started,
      resultCount: servedRows.length,
    });

    return servedRows.map((location) => candidateFrom(location, request, source === "canonical_profile" ? "enterprise_search_profile_locations" : "enterprise_search_locations", plan, retrievalGeoLevel));
  }));

  const byLaneAndId = new Map<string, RetrievedCandidate>();
  for (const item of lanes.flat()) {
    const lane = item.requestedRoles.some((role) => retrievalDomain(role) === "restaurant") ? "restaurant" : "activity";
    const key = `${lane}:${String(item.location.id)}`;
    const previous = byLaneAndId.get(key);
    if (previous) {
      previous.retrievalSources = [...new Set([...previous.retrievalSources, ...item.retrievalSources])];
      previous.requestedRoles = [...new Set([...previous.requestedRoles, ...item.requestedRoles])];
      previous.matchedRetrievalTerms = [...new Set([...previous.matchedRetrievalTerms, ...item.matchedRetrievalTerms])];
      if (geoTierRank(item.geoMatch.tier) < geoTierRank(previous.geoMatch.tier)) {
        previous.geoMatch = item.geoMatch;
        previous.retrievalGeoLevel = item.retrievalGeoLevel;
      }
    } else {
      byLaneAndId.set(key, item);
    }
  }

  const candidates = [...byLaneAndId.values()].filter((candidate) => candidate.geoMatch.accepted).sort((a, b) => geoTierRank(a.geoMatch.tier) - geoTierRank(b.geoMatch.tier));
  const geoCounts = candidates.reduce((counts, candidate) => {
    counts[candidate.geoMatch.tier] = (counts[candidate.geoMatch.tier] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  trace.decisions.push({ stage: "geo_policy", decision: "candidate_geo_tiers_classified", reason: JSON.stringify(geoCounts) });

  trace.retrieval.servedSource = strictNoFallback ? "canonical_profile" : trace.retrieval.legacyFallbackUsed ? "mixed" : rollout.serveProfiles ? "canonical_profile" : "legacy";
  trace.counts.retrieved = candidates.length;
  return { candidates, requests, callsUsed: budget.used };
}
