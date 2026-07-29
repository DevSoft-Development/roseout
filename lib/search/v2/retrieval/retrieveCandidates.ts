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

function candidateFrom(location: any, request: ReturnType<typeof buildRetrievalRequests>[number], source: string): RetrievedCandidate {
  const serialized = JSON.stringify(location).toLowerCase();
  return { location, retrievalSources: [source], matchedRetrievalTerms: request.retrievalTerms.filter((term) => serialized.includes(term.toLowerCase())), requestedRoles: [request.desiredRole], distanceMiles: typeof location.distance_miles === "number" ? location.distance_miles : null };
}

export async function retrieveCandidates({ plan, supabase, trace, rolloutOverride }: { plan: SearchPlan; supabase: SupabaseClient; trace: SearchTrace; rolloutOverride?: { mode: SearchProfileMode; canaryPercent: number; killSwitch?: boolean } }): Promise<RetrievalResult> {
  const requests = buildRetrievalRequests(plan);
  const budget = new RetrievalBudget();
  const effectiveConfig = rolloutOverride ?? await getEffectiveSearchProfileRolloutConfig();
  const rollout = resolveSearchProfileRollout(trace.requestId, effectiveConfig);
  trace.retrieval.configuredMode = rollout.mode;
  trace.retrieval.canaryBucket = rollout.bucket;
  trace.retrieval.canaryPercent = rollout.canaryPercent;
  trace.retrieval.profileVersion = 3;

  const lanes = await Promise.all(requests.map(async (request) => {
    const key = JSON.stringify(request);
    if (!budget.claim(key)) return [];
    const started = performance.now();
    let profileRows: any[] = [];
    let legacyRows: any[] = [];
    if (rollout.serveProfiles || rollout.shadowProfiles) {
      try { profileRows = await retrieveProfileLocations(supabase, request); }
      catch (error) { trace.decisions.push({ stage: "retrieval", decision: "profile_rpc_failed", reason: error instanceof Error ? error.message : "unknown profile retrieval failure" }); }
      trace.retrieval.profileCandidateCount += profileRows.length;
    }
    if (!rollout.serveProfiles || rollout.shadowProfiles || profileRows.length === 0) {
      legacyRows = await retrieveUnifiedLocations(supabase, request, 60, trace);
      trace.retrieval.legacyCandidateCount += legacyRows.length;
    }
    const domain = request.desiredRole === "restaurant" ? "restaurant" : "activity";
    const useFallback = rollout.serveProfiles && profileRows.length === 0 && legacyRows.length > 0;
    if (useFallback) { trace.retrieval.legacyFallbackUsed = true; trace.retrieval.fallbackDomains = [...new Set([...trace.retrieval.fallbackDomains, domain])]; }
    const servedRows = rollout.serveProfiles ? (profileRows.length ? profileRows : legacyRows) : legacyRows;
    const source = rollout.serveProfiles && profileRows.length ? "canonical_profile" : "legacy";
    trace.retrievalCalls.push({ role: request.desiredRole, reason: useFallback ? "profile_empty_domain_fallback" : `${source}_primary_retrieval`, durationMs: performance.now() - started, resultCount: servedRows.length });
    return servedRows.map((location) => candidateFrom(location, request, source === "canonical_profile" ? "enterprise_search_profile_locations" : "enterprise_search_locations"));
  }));
  const byId = new Map<string, RetrievedCandidate>();
  for (const item of lanes.flat()) {
    const key = String(item.location.id);
    const previous = byId.get(key);
    if (previous) { previous.retrievalSources = [...new Set([...previous.retrievalSources, ...item.retrievalSources])]; previous.requestedRoles = [...new Set([...previous.requestedRoles, ...item.requestedRoles])]; previous.matchedRetrievalTerms = [...new Set([...previous.matchedRetrievalTerms, ...item.matchedRetrievalTerms])]; }
    else byId.set(key, item);
  }
  trace.retrieval.servedSource = trace.retrieval.legacyFallbackUsed ? "mixed" : rollout.serveProfiles ? "canonical_profile" : "legacy";
  trace.counts.retrieved = byId.size;
  return { candidates: [...byId.values()], requests, callsUsed: budget.used };
}
