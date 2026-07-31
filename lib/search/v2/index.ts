import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSearchPlan } from "./planner/buildSearchPlan";
import type { SearchPlan, SearchPlannerInput } from "./planner/searchPlanTypes";
import { createSearchTrace, recordTiming } from "./observability/searchTrace";
import { retrieveCandidates, type SearchProfileRolloutOverride } from "./retrieval/retrieveCandidates";
import { assignCandidateRoles } from "./roles/assignCandidateRoles";
import { scoreCandidates } from "./scoring/scoreCandidates";
import type { ScoredCandidate } from "./scoring/scoringTypes";
import { buildPairs } from "./pairing/buildPairs";
import { resolveFallback } from "./fallback/resolveFallback";
import { validateSearchResult } from "./validation/validateSearchResult";
import { buildPublicSearchResponse } from "./response/buildPublicSearchResponse";
import { validatePublicSearchResponse } from "./response/validatePublicSearchResponse";
import { resolveSearchAnchor } from "../anchors/resolve";
import { hydrateRuntimeTaxonomy, runtimeTaxonomyStatus } from "./taxonomy/runtimeTaxonomy";

async function resolvePlanAnchor(plan: SearchPlan, supabase: SupabaseClient): Promise<SearchPlan> {
  if (!plan.anchor.requested || !plan.anchor.rawName) return plan;
  const resolution = await resolveSearchAnchor(supabase, plan.anchor.rawName, plan.geo.city || plan.geo.borough);
  if (resolution.status !== "resolved" || !resolution.anchor) return plan;
  const anchor = resolution.anchor;
  const latitude = Number(anchor.latitude);
  const longitude = Number(anchor.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return plan;
  const defaultRadius = Number(anchor.defaultRadiusMiles ?? anchor.default_radius_miles ?? 1.5);
  const hardRadius = plan.travel.constraint === "hard" && plan.pairing.maxDistanceMiles != null ? plan.pairing.maxDistanceMiles : null;
  return {
    ...plan,
    geo: {
      ...plan.geo,
      source: "anchor",
      latitude,
      longitude,
      radiusMiles: hardRadius ?? defaultRadius,
      strictness: plan.travel.constraint === "hard" ? "strict" : "preferred",
      city: null,
      borough: null,
      neighborhood: null,
      county: null,
    },
    anchor: {
      ...plan.anchor,
      locationId: String(anchor.linkedLocationId ?? anchor.linked_location_id ?? anchor.id),
      name: anchor.canonicalName ?? anchor.canonical_name ?? anchor.name,
      latitude,
      longitude,
    },
  };
}

export function enforceRequestedDomains(plan: SearchPlan, scored: { all: ScoredCandidate[]; restaurants: ScoredCandidate[]; activities: ScoredCandidate[] }) {
  const restaurants = plan.restaurant.required ? scored.restaurants : [];
  const activities = plan.activity.required ? scored.activities : [];
  const allowed = new Set([...restaurants, ...activities]);
  return { all: scored.all.filter((candidate) => allowed.has(candidate)), restaurants, activities };
}

export async function searchV2(input: SearchPlannerInput & { supabase: SupabaseClient; rolloutOverride?: SearchProfileRolloutOverride }) {
  const total = performance.now();
  const trace = createSearchTrace(input.requestId ?? crypto.randomUUID());
  const taxonomyStarted = performance.now();
  await hydrateRuntimeTaxonomy(input.supabase);
  trace.decisions.push({ stage: "taxonomy", decision: "runtime_taxonomy_ready", reason: JSON.stringify(runtimeTaxonomyStatus()) });
  recordTiming(trace, "taxonomyMs" as any, taxonomyStarted);
  let started = performance.now();
  const draftPlan = await buildSearchPlan({ input: { ...input, requestId: trace.requestId } });
  const plan = await resolvePlanAnchor(draftPlan, input.supabase);
  trace.decisions.push({ stage: "travel_distance_policy", decision: plan.travel.constraint === "hard" ? "hard_distance_enforced" : "distance_used_for_ranking", reason: JSON.stringify({ travel: plan.travel, maxDistanceMiles: plan.pairing.maxDistanceMiles, maxWalkingMinutes: plan.pairing.maxWalkingMinutes, anchorResolved: Boolean(plan.anchor.locationId) }) });
  recordTiming(trace, "plannerMs", started);
  started = performance.now();
  const retrieved = await retrieveCandidates({ plan, supabase: input.supabase, trace, rolloutOverride: input.rolloutOverride });
  recordTiming(trace, "retrievalMs", started);
  started = performance.now();
  const qualified = assignCandidateRoles({ plan, candidates: retrieved.candidates, trace });
  recordTiming(trace, "roleAssignmentMs", started);
  started = performance.now();
  const rawScored = await scoreCandidates({ plan, candidates: qualified, trace });
  const scored = enforceRequestedDomains(plan, rawScored);
  trace.decisions.push({ stage: "requested_domain_contract", decision: "candidate_domains_constrained", reason: JSON.stringify({ restaurantRequired: plan.restaurant.required, activityRequired: plan.activity.required, removedRestaurantCandidates: rawScored.restaurants.length - scored.restaurants.length, removedActivityCandidates: rawScored.activities.length - scored.activities.length }) });
  recordTiming(trace, "scoringMs", started);
  started = performance.now();
  const pairs = plan.restaurant.required && plan.activity.required ? await buildPairs({ plan, restaurants: scored.restaurants, activities: scored.activities, trace }) : [];
  recordTiming(trace, "pairingMs", started);
  started = performance.now();
  const resolved = await resolveFallback({ plan, scored, pairs, retrievedCount: retrieved.candidates.length, trace });
  recordTiming(trace, "fallbackMs", started);
  started = performance.now();
  const validated = validateSearchResult({ plan, result: resolved, trace });
  recordTiming(trace, "validationMs", started);
  started = performance.now();
  const response = buildPublicSearchResponse({ plan, result: validated.result, trace });
  validatePublicSearchResponse(response);
  recordTiming(trace, "serializationMs", started);
  trace.timing.totalMs = performance.now() - total;
  response.timing = { ...trace.timing };
  response.debug = { ...(response.debug ?? {}), retrievalCalls: trace.retrievalCalls, decisions: trace.decisions, taxonomy: runtimeTaxonomyStatus() };
  return response;
}

export * from "./planner/searchPlanTypes";
export * from "./roles/roleTypes";
export * from "./scoring/scoringTypes";
export * from "./pairing/pairingTypes";
export * from "./response/responseTypes";
