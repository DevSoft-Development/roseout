import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { buildRetrievalRequests } from "./buildRetrievalRequests";
import { retrieveUnifiedLocations } from "./retrieveUnifiedLocations";
import { retrieveProfileLocations } from "./retrieveProfileLocations";
import { resolveSearchProfileRollout, type SearchProfileMode } from "./searchProfileMode";
import { getEffectiveSearchProfileRolloutConfig } from "./searchProfileRolloutConfig";
import { RetrievalBudget } from "./retrievalBudget";
import type { RetrievalResult, RetrievedCandidate } from "./retrievalTypes";

export type SearchProfileRolloutOverride = { mode: SearchProfileMode; canaryPercent: number; killSwitch?: boolean; strictNoFallback?: boolean };
export function candidateFrom(location: any, request: ReturnType<typeof buildRetrievalRequests>[number], source: string): RetrievedCandidate { const canonicalProfile = source === "enterprise_search_profile_locations"; const serialized = JSON.stringify(location).toLowerCase(); const matchedRetrievalTerms = canonicalProfile ? [...request.retrievalTerms] : request.retrievalTerms.filter((term) => serialized.includes(term.toLowerCase())); return { location, retrievalSources: [source], matchedRetrievalTerms, requestedRoles: [request.desiredRole], distanceMiles: typeof location.distance_miles === "number" ? location.distance_miles : null }; }
function retrievalDomain(role: string) { return role === "restaurant" || role.endsWith("_restaurant") ? "restaurant" : "activity"; }

export async function retrieveCandidates({ plan, supabase, trace, rolloutOverride }: { plan: SearchPlan; supabase: SupabaseClient; trace: SearchTrace; rolloutOverride?: SearchProfileRolloutOverride }): Promise<RetrievalResult> {
  const requests = buildRetrievalRequests(plan); const budget = new RetrievalBudget(); const effectiveConfig = rolloutOverride ?? await getEffectiveSearchProfileRolloutConfig(); const rollout = resolveSearchProfileRollout(trace.requestId, effectiveConfig); const strictNoFallback = Boolean(rolloutOverride?.strictNoFallback);
  trace.retrieval.configuredMode = rollout.mode; trace.retrieval.canaryBucket = rollout.bucket; trace.retrieval.canaryPercent = rollout.canaryPercent; trace.retrieval.profileVersion = 3;
  const lanes = await Promise.all(requests.map(async (request) => {
    const key = JSON.stringify(request); if (!budget.claim(key)) return []; const started = performance.now(); let profileRows: any[] = []; let legacyRows: any[] = []; const domain = retrievalDomain(request.desiredRole);
    if (rollout.serveProfiles || rollout.shadowProfiles) { try { profileRows = await retrieveProfileLocations(supabase, request, 60, plan.fallback.allowBroaderGeo); } catch (error) { trace.decisions.push({ stage: "retrieval", decision: "profile_rpc_failed", reason: `${domain}:${error instanceof Error ? error.message : "unknown profile retrieval failure"}` }); } trace.retrieval.profileCandidateCount += profileRows.length; }
    const legacyAllowed = !strictNoFallback && (!rollout.serveProfiles || rollout.shadowProfiles || profileRows.length === 0);
    if (legacyAllowed) { legacyRows = await retrieveUnifiedLocations(supabase, request, 60, trace, { allowBroaderGeo: plan.fallback.allowBroaderGeo }); trace.retrieval.legacyCandidateCount += legacyRows.length; }
    const useFallback = !strictNoFallback && rollout.serveProfiles && profileRows.length === 0 && legacyRows.length > 0; if (useFallback) { trace.retrieval.legacyFallbackUsed = true; trace.retrieval.fallbackDomains = [...new Set([...trace.retrieval.fallbackDomains, domain])]; }
    const servedRows = rollout.serveProfiles ? (profileRows.length ? profileRows : strictNoFallback ? [] : legacyRows) : legacyRows; const source = rollout.serveProfiles && profileRows.length ? "canonical_profile" : "legacy";
    trace.retrievalCalls.push({ role: request.desiredRole, domain, retrievalTerms: [...request.retrievalTerms], categories: [...request.categories], cuisines: [...request.cuisines], foods: [...request.foods], features: [...request.features], reason: strictNoFallback && rollout.serveProfiles && profileRows.length === 0 ? "canonical_profile_strict_empty" : useFallback ? "profile_empty_domain_fallback" : `${source}_primary_retrieval`, durationMs: performance.now() - started, resultCount: servedRows.length });
    trace.decisions.push({ stage: "retrieval_domain", decision: servedRows.length ? "domain_candidates_served" : "domain_candidates_missing", reason: `domain=${domain}, role=${request.desiredRole}, profile=${profileRows.length}, legacy=${legacyRows.length}, fallback=${useFallback}, strict_no_fallback=${strictNoFallback}, broader_geo=${plan.fallback.allowBroaderGeo}` });
    return servedRows.map((location) => candidateFrom(location, request, source === "canonical_profile" ? "enterprise_search_profile_locations" : "enterprise_search_locations"));
  }));
  const byLaneAndId = new Map<string, RetrievedCandidate>(); for (const item of lanes.flat()) { const lane = item.requestedRoles.some((role) => retrievalDomain(role) === "restaurant") ? "restaurant" : "activity"; const key = `${lane}:${String(item.location.id)}`; const previous = byLaneAndId.get(key); if (previous) { previous.retrievalSources = [...new Set([...previous.retrievalSources, ...item.retrievalSources])]; previous.requestedRoles = [...new Set([...previous.requestedRoles, ...item.requestedRoles])]; previous.matchedRetrievalTerms = [...new Set([...previous.matchedRetrievalTerms, ...item.matchedRetrievalTerms])]; } else byLaneAndId.set(key, item); }
  trace.retrieval.servedSource = strictNoFallback ? "canonical_profile" : trace.retrieval.legacyFallbackUsed ? "mixed" : rollout.serveProfiles ? "canonical_profile" : "legacy"; trace.counts.retrieved = byLaneAndId.size; return { candidates: [...byLaneAndId.values()], requests, callsUsed: budget.used };
}
