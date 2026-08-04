import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSearchPlan } from "./planner/buildSearchPlan";
import type { SearchPlan, SearchPlannerInput } from "./planner/searchPlanTypes";
import { createSearchTrace, recordTiming, type AnchorResolutionTrace, type CandidateStageRejection } from "./observability/searchTrace";
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

function anchorCandidate(candidate: any) {
  return {
    id: candidate?.linkedLocationId ?? candidate?.linked_location_id ?? candidate?.id ?? null,
    name: candidate?.canonicalName ?? candidate?.canonical_name ?? candidate?.name ?? null,
  };
}

async function resolvePlanAnchor(plan: SearchPlan, supabase: SupabaseClient): Promise<{ plan: SearchPlan; trace: AnchorResolutionTrace }> {
  if (!plan.anchor.requested || !plan.anchor.rawName) {
    return {
      plan,
      trace: { status: "not_requested", requested: false, rawName: null, resolvedLocationId: null, requiresClarification: false, candidateCount: 0, candidates: [], diagnostics: null },
    };
  }

  const resolution = await resolveSearchAnchor(supabase, plan.anchor.rawName, plan.geo.city || plan.geo.borough);
  const candidates = Array.isArray(resolution.candidates) ? resolution.candidates.map(anchorCandidate) : [];
  const baseTrace = {
    requested: true,
    rawName: plan.anchor.rawName,
    resolvedLocationId: null,
    requiresClarification: false,
    candidateCount: candidates.length,
    candidates,
    diagnostics: (resolution as any).diagnostics ?? null,
  };

  if (resolution.status === "ambiguous") {
    return { plan, trace: { ...baseTrace, status: "clarification_required", requiresClarification: true } };
  }
  if (resolution.status === "not_found" || !resolution.anchor) {
    return { plan, trace: { ...baseTrace, status: "not_found" } };
  }
  if (resolution.status === "missing_coordinates") {
    return { plan, trace: { ...baseTrace, status: "missing_coordinates" } };
  }

  const anchor = resolution.anchor;
  const latitude = Number(anchor.latitude);
  const longitude = Number(anchor.longitude);
  const resolvedLocationId = anchor.linkedLocationId ?? anchor.linked_location_id ?? anchor.id ?? null;
  if (!resolvedLocationId) {
    return { plan, trace: { ...baseTrace, status: "not_found" } };
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { plan, trace: { ...baseTrace, status: "missing_coordinates", resolvedLocationId: String(resolvedLocationId) } };
  }

  const defaultRadius = Number(anchor.defaultRadiusMiles ?? anchor.default_radius_miles ?? 1.5);
  const hardRadius = plan.travel.constraint === "hard" && plan.pairing.maxDistanceMiles != null ? plan.pairing.maxDistanceMiles : null;
  return {
    plan: {
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
        locationId: String(resolvedLocationId),
        name: anchor.canonicalName ?? anchor.canonical_name ?? anchor.name,
        latitude,
        longitude,
      },
    },
    trace: { ...baseTrace, status: "resolved", resolvedLocationId: String(resolvedLocationId), candidateCount: Math.max(1, candidates.length) },
  };
}

export function enforceRequestedDomains(plan: SearchPlan, scored: { all: ScoredCandidate[]; restaurants: ScoredCandidate[]; activities: ScoredCandidate[] }) {
  const restaurants = plan.restaurant.required ? scored.restaurants : [];
  const activities = plan.activity.required ? scored.activities : [];
  const allowed = new Set([...restaurants, ...activities]);
  return { all: scored.all.filter((candidate) => allowed.has(candidate)), restaurants, activities };
}

function retrievedLocation(candidate: any) {
  return candidate?.location ?? candidate?.candidate?.location ?? candidate?.candidate?.candidate?.location ?? null;
}

function candidateLocationId(candidate: any) {
  const id = retrievedLocation(candidate)?.id;
  return id == null ? null : String(id);
}

function candidateOriginalType(candidate: any) {
  const location = retrievedLocation(candidate);
  return location?.location_type ?? location?.type ?? location?.primary_category ?? location?.activity_type ?? null;
}

function candidateTerms(candidate: any) {
  const terms = candidate?.matchedRetrievalTerms ?? candidate?.candidate?.matchedRetrievalTerms ?? candidate?.candidate?.candidate?.matchedRetrievalTerms;
  return Array.isArray(terms) ? terms.map(String) : [];
}

function recordCandidateStageDiagnostics({ trace, plan, retrieved, qualified, rawScored, scored }: {
  trace: ReturnType<typeof createSearchTrace>;
  plan: SearchPlan;
  retrieved: any;
  qualified: any[];
  rawScored: { all: ScoredCandidate[]; restaurants: ScoredCandidate[]; activities: ScoredCandidate[] };
  scored: { all: ScoredCandidate[]; restaurants: ScoredCandidate[]; activities: ScoredCandidate[] };
}) {
  const retrievedCandidates: any[] = Array.isArray(retrieved.candidates) ? retrieved.candidates : [];
  const qualifiedIds = new Set(qualified.map(candidateLocationId).filter(Boolean));
  const taxonomyIds = new Set(rawScored.all.map(candidateLocationId).filter(Boolean));
  const finalRestaurantIds = new Set(scored.restaurants.map(candidateLocationId).filter(Boolean));
  const finalActivityIds = new Set(scored.activities.map(candidateLocationId).filter(Boolean));
  const finalIds = new Set([...finalRestaurantIds, ...finalActivityIds]);
  const rejectedCandidates: CandidateStageRejection[] = [];

  for (const candidate of retrievedCandidates) {
    const locationId = candidateLocationId(candidate);
    if (!candidate?.geoMatch?.accepted) {
      rejectedCandidates.push({ locationId, desiredRole: candidate?.requestedRoles?.[0] ?? null, originalType: candidateOriginalType(candidate), assignedDomain: null, rejectedAtStage: "geo", rejectionReason: candidate?.geoMatch?.reason ?? "geo_not_accepted", matchedTerms: candidateTerms(candidate) });
    } else if (locationId && !qualifiedIds.has(locationId)) {
      rejectedCandidates.push({ locationId, desiredRole: candidate?.requestedRoles?.[0] ?? null, originalType: candidateOriginalType(candidate), assignedDomain: null, rejectedAtStage: "domain_assignment", rejectionReason: "no_qualified_requested_role", matchedTerms: candidateTerms(candidate) });
    } else if (locationId && !taxonomyIds.has(locationId)) {
      rejectedCandidates.push({ locationId, desiredRole: candidate?.requestedRoles?.[0] ?? null, originalType: candidateOriginalType(candidate), assignedDomain: null, rejectedAtStage: "taxonomy", rejectionReason: "taxonomy_or_scoring_excluded", matchedTerms: candidateTerms(candidate) });
    } else if (locationId && !finalIds.has(locationId)) {
      rejectedCandidates.push({ locationId, desiredRole: candidate?.requestedRoles?.[0] ?? null, originalType: candidateOriginalType(candidate), assignedDomain: null, rejectedAtStage: "final_domain", rejectionReason: "not_in_required_final_domain", matchedTerms: candidateTerms(candidate) });
    }
  }

  trace.candidateStages = {
    profileCandidates: trace.retrieval.profileCandidateCount,
    rawProfileCandidates: trace.retrieval.profileCandidateCount,
    rawLegacyCandidates: trace.retrieval.legacyCandidateCount,
    geoEligibleCandidates: retrievedCandidates.length,
    domainAssignedCandidates: qualified.length,
    taxonomyEligibleCandidates: rawScored.all.length,
    publishableCandidates: rawScored.all.length,
    finalRestaurantCandidates: scored.restaurants.length,
    finalActivityCandidates: scored.activities.length,
    rejectedCandidates,
  };

  const restaurantRequired = Boolean(plan.restaurant.required);
  const activityRequired = Boolean(plan.activity.required);
  const rawRestaurantEvidence = trace.retrievalCalls.filter((call) => call.domain === "restaurant").reduce((sum, call) => sum + call.resultCount, 0);
  const rawActivityEvidence = trace.retrievalCalls.filter((call) => call.domain === "activity").reduce((sum, call) => sum + call.resultCount, 0);
  const missingRestaurant = restaurantRequired && scored.restaurants.length === 0;
  const missingActivity = activityRequired && scored.activities.length === 0;
  const completeEvidence = (!missingRestaurant || rawRestaurantEvidence === 0) && (!missingActivity || rawActivityEvidence === 0);
  const confirmedGap = (missingRestaurant || missingActivity) && completeEvidence && trace.retrieval.profileCandidateCount === 0 && trace.retrieval.legacyCandidateCount === 0;
  const supportedMarket = Boolean(plan.geo.city || plan.geo.borough || plan.geo.neighborhood || plan.geo.county || plan.geo.source === "anchor" || plan.geo.source === "current_location");

  trace.inventoryAudit = {
    id: `${trace.requestId}:inventory`,
    status: confirmedGap ? "confirmed_gap" : completeEvidence ? "complete" : "inconclusive",
    supportedMarket,
    rawCounts: {
      profile: trace.retrieval.profileCandidateCount,
      legacy: trace.retrieval.legacyCandidateCount,
      restaurant: rawRestaurantEvidence,
      activity: rawActivityEvidence,
    },
    evidence: [
      `restaurantRequired=${restaurantRequired}`,
      `activityRequired=${activityRequired}`,
      `finalRestaurantCandidates=${scored.restaurants.length}`,
      `finalActivityCandidates=${scored.activities.length}`,
      `candidateStageRejections=${rejectedCandidates.length}`,
    ],
  };

  trace.decisions.push({ stage: "candidate_stage_trace", decision: rejectedCandidates.length ? "candidate_loss_attributed" : "candidate_stages_complete", reason: JSON.stringify(trace.candidateStages) });
  trace.decisions.push({ stage: "inventory_audit", decision: trace.inventoryAudit.status, reason: JSON.stringify(trace.inventoryAudit) });
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
  const anchorResult = await resolvePlanAnchor(draftPlan, input.supabase);
  const plan = anchorResult.plan;
  trace.anchorResolution = anchorResult.trace;
  trace.decisions.push({ stage: "anchor_resolution", decision: trace.anchorResolution.status, reason: JSON.stringify(trace.anchorResolution) });
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
  recordCandidateStageDiagnostics({ trace, plan, retrieved, qualified: qualified as any[], rawScored, scored });
  trace.decisions.push({ stage: "requested_domain_contract", decision: "candidate_domains_constrained", reason: JSON.stringify({ restaurantRequired: plan.restaurant.required, activityRequired: plan.activity.required, removedRestaurantCandidates: rawScored.restaurants.length - scored.restaurants.length, removedActivityCandidates: rawScored.activities.length - scored.activities.length }) });
  recordTiming(trace, "scoringMs", started);
  started = performance.now();
  const pairs = plan.restaurant.required && plan.activity.required
    ? await buildPairs({ plan, restaurants: scored.restaurants, activities: scored.activities, trace })
    : [];
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
  response.debug = {
    ...(response.debug ?? {}),
    retrievalCalls: trace.retrievalCalls,
    decisions: trace.decisions,
    taxonomy: runtimeTaxonomyStatus(),
    pairingDebug: trace.pairingDebug,
    candidateStages: trace.candidateStages,
    inventoryAudit: trace.inventoryAudit,
    anchorResolution: trace.anchorResolution,
    diagnosticsContractViolation: trace.pairingDebug?.eligibilityContractValid === false
      ? trace.pairingDebug.eligibilityContractViolation
      : null,
  };
  response.anchorResolution = trace.anchorResolution;
  if (trace.anchorResolution.status === "clarification_required") response.outcome = "clarification_required";
  if (trace.anchorResolution.status === "not_found") response.outcome = "anchor_not_found";
  return response;
}

export * from "./planner/searchPlanTypes";
export * from "./roles/roleTypes";
export * from "./scoring/scoringTypes";
export * from "./pairing/pairingTypes";
export * from "./response/responseTypes";
