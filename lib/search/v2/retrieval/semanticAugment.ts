import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import { geoTierRank } from "../geo/geoPolicy";
import { candidateFrom } from "./retrieveCandidates";
import type { RetrievalRequest, RetrievalResult, RetrievedCandidate } from "./retrievalTypes";

const queryEmbeddingCache = new Map<string, { embedding: number[]; expiresAt: number }>();
const MAX_QUERY_CACHE = 100;
const QUERY_CACHE_TTL_MS = 30 * 60 * 1000;

const flag = (name: string, fallback = false) => {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
};

function requestDomain(request: RetrievalRequest): "restaurant" | "activity" {
  return request.desiredRole === "restaurant" ? "restaurant" : "activity";
}

function shouldUseSemantic(plan: SearchPlan) {
  if (!flag("SEARCH_SEMANTIC_ENABLED", true)) return false;
  if (flag("SEARCH_SEMANTIC_ALWAYS", false)) return true;
  if (plan.preferences?.vibes?.length || plan.preferences?.subjectiveTerms?.length || plan.preferences?.budget || plan.preferences?.noise) return true;
  return /\b(romantic|intimate|chill|quiet|conversation|talk|upscale|classy|casual|low key|low-key|laid back|laid-back|lively|cozy|fun|interesting|different|vibe|date night|girls night|family|not too|affordable|budget|premium)\b/i.test(plan.rawQuery);
}

function semanticQueryText(plan: SearchPlan) {
  return [
    plan.rawQuery,
    plan.occasion ? `Occasion: ${plan.occasion}.` : "",
    plan.preferences?.vibes?.length ? `Desired vibe: ${plan.preferences.vibes.join(", ")}.` : "",
    plan.preferences?.budget ? `Price preference: ${plan.preferences.budget}.` : "",
    plan.preferences?.noise ? `Noise preference: ${plan.preferences.noise}.` : "",
    plan.restaurant.cuisines.length ? `Cuisine: ${plan.restaurant.cuisines.join(", ")}.` : "",
    plan.restaurant.foods.length ? `Food: ${plan.restaurant.foods.join(", ")}.` : "",
    plan.activity.categories.length ? `Activity: ${plan.activity.categories.join(", ")}.` : "",
    [...plan.restaurant.exclusions, ...plan.activity.exclusions, ...(plan.preferences?.avoidVibes ?? [])].length
      ? `Avoid: ${[...plan.restaurant.exclusions, ...plan.activity.exclusions, ...(plan.preferences?.avoidVibes ?? [])].join(", ")}.`
      : "",
  ].filter(Boolean).join("\n");
}

async function embedQuery(plan: SearchPlan) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.SEARCH_EMBEDDING_MODEL || "text-embedding-3-small";
  const input = semanticQueryText(plan);
  const cacheKey = `${model}:${input.toLowerCase().replace(/\s+/g, " ").trim()}`;
  const cached = queryEmbeddingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.embedding;

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });
  if (!response.ok) throw new Error(`embedding request failed: ${response.status}`);
  const payload = await response.json();
  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) throw new Error("embedding response missing vector");

  if (queryEmbeddingCache.size >= MAX_QUERY_CACHE) {
    const first = queryEmbeddingCache.keys().next().value;
    if (first) queryEmbeddingCache.delete(first);
  }
  queryEmbeddingCache.set(cacheKey, { embedding, expiresAt: Date.now() + QUERY_CACHE_TTL_MS });
  return embedding as number[];
}

async function semanticMatches(
  supabase: SupabaseClient,
  embedding: number[],
  domain: "restaurant" | "activity",
  market: string | null,
) {
  const { data, error } = await supabase.rpc("match_location_search_embeddings", {
    p_query_embedding: embedding,
    p_expected_domain: domain,
    p_market_key: market,
    p_match_count: Number(process.env.SEARCH_SEMANTIC_MATCH_COUNT || 60),
    p_min_similarity: Number(process.env.SEARCH_SEMANTIC_MIN_SIMILARITY || 0.55),
    p_embedding_version: process.env.SEARCH_EMBEDDING_VERSION || "search-embedding:v1",
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    locationId: String(row.location_id),
    similarity: Number(row.similarity ?? 0),
  })).filter((row) => row.locationId && Number.isFinite(row.similarity));
}

function laneKey(candidate: RetrievedCandidate) {
  const lane = candidate.requestedRoles.some((role) => role === "restaurant" || role.endsWith("_restaurant"))
    ? "restaurant"
    : "activity";
  return `${lane}:${String(candidate.location.id)}`;
}

export async function augmentRetrievalWithSemantic({
  plan,
  retrieved,
  supabase,
  trace,
}: {
  plan: SearchPlan;
  retrieved: RetrievalResult;
  supabase: SupabaseClient;
  trace: SearchTrace;
}): Promise<RetrievalResult> {
  if (!shouldUseSemantic(plan)) {
    trace.decisions.push({ stage: "semantic_retrieval", decision: "not_requested", reason: "query has no semantic preference signal" });
    return retrieved;
  }
  if (flag("SEARCH_SEMANTIC_SHADOW_ONLY", false)) {
    trace.decisions.push({ stage: "semantic_retrieval", decision: "shadow_only", reason: "SEARCH_SEMANTIC_SHADOW_ONLY enabled" });
    return retrieved;
  }

  const domains = [
    plan.restaurant.required ? "restaurant" as const : null,
    plan.activity.required ? "activity" as const : null,
  ].filter((value): value is "restaurant" | "activity" => Boolean(value));
  if (!domains.length) return retrieved;

  const started = performance.now();
  try {
    const embedding = await embedQuery(plan);
    if (!embedding) {
      trace.decisions.push({ stage: "semantic_retrieval", decision: "embedding_unavailable", reason: "OPENAI_API_KEY unavailable" });
      return retrieved;
    }

    const laneMatches = await Promise.all(domains.map(async (domain) => ({
      domain,
      matches: await semanticMatches(supabase, embedding, domain, plan.geo.market),
    })));
    const similarityByLaneAndId = new Map<string, number>();
    for (const lane of laneMatches) {
      for (const match of lane.matches) similarityByLaneAndId.set(`${lane.domain}:${match.locationId}`, match.similarity);
    }

    const ids = [...new Set(laneMatches.flatMap((lane) => lane.matches.map((match) => match.locationId)))];
    if (!ids.length) {
      trace.decisions.push({ stage: "semantic_retrieval", decision: "no_matches", reason: JSON.stringify({ domains, durationMs: performance.now() - started }) });
      return retrieved;
    }

    const { data, error } = await supabase
      .from("locations")
      .select("*")
      .in("id", ids.slice(0, 120));
    if (error) throw error;
    const rowsById = new Map((Array.isArray(data) ? data : []).map((row: any) => [String(row.id), row]));

    const merged = new Map<string, RetrievedCandidate>();
    for (const candidate of retrieved.allCandidates) merged.set(laneKey(candidate), candidate);

    let added = 0;
    let enriched = 0;
    for (const lane of laneMatches) {
      const request = retrieved.requests.find((item) => requestDomain(item) === lane.domain);
      if (!request) continue;
      for (const match of lane.matches) {
        const row = rowsById.get(match.locationId);
        if (!row) continue;
        const semanticRow = { ...row, semantic_similarity: match.similarity };
        const candidate = candidateFrom(semanticRow, request, "semantic_vector", plan);
        const key = `${lane.domain}:${match.locationId}`;
        const existing = merged.get(key);
        if (existing) {
          merged.set(key, {
            ...existing,
            location: {
              ...semanticRow,
              ...existing.location,
              semantic_similarity: Math.max(Number((existing.location as any).semantic_similarity ?? 0), match.similarity),
            },
            retrievalSources: [...new Set([...existing.retrievalSources, "semantic_vector"])],
          });
          enriched++;
        } else {
          merged.set(key, candidate);
          added++;
        }
      }
    }

    const allCandidates = [...merged.values()].sort((a, b) =>
      geoTierRank(a.geoMatch.tier) - geoTierRank(b.geoMatch.tier)
      || Number((b.location as any).semantic_similarity ?? 0) - Number((a.location as any).semantic_similarity ?? 0),
    );
    const candidates = allCandidates.filter((candidate) => candidate.geoMatch.accepted);
    trace.counts.retrieved = candidates.length;
    trace.decisions.push({
      stage: "semantic_retrieval",
      decision: added > 0 ? "semantic_candidates_served" : "existing_candidates_enriched",
      reason: JSON.stringify({
        domains,
        matchCounts: Object.fromEntries(laneMatches.map((lane) => [lane.domain, lane.matches.length])),
        added,
        enriched,
        durationMs: performance.now() - started,
      }),
    });
    return { ...retrieved, allCandidates, candidates };
  } catch (error) {
    trace.decisions.push({
      stage: "semantic_retrieval",
      decision: "failed_open",
      reason: error instanceof Error ? error.message : "unknown semantic retrieval failure",
    });
    return retrieved;
  }
}
