import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSearchMlRuntimeConfig } from "../../huggingFaceEmbedding";
import type { SearchTrace } from "../observability/searchTrace";
import type { ScoredCandidate } from "./scoringTypes";

function locationId(candidate: ScoredCandidate) {
  const anyCandidate: any = candidate;
  return String(anyCandidate?.candidate?.candidate?.location?.id ?? anyCandidate?.candidate?.location?.id ?? "");
}

function applyLane(rows: ScoredCandidate[], similarities: Map<string, number>) {
  return rows.map((row) => {
    const similarity = similarities.get(locationId(row));
    if (!Number.isFinite(similarity)) return row;
    const boost = Math.max(0, Math.min(0.04, (Number(similarity) - 0.55) * 0.08));
    if (boost <= 0) return row;
    return {
      ...row,
      scores: { ...row.scores, total: row.scores.total + boost },
      reasons: [...row.reasons, `Personal preference similarity +${boost.toFixed(3)}`],
    };
  }).sort((a, b) => b.scores.total - a.scores.total);
}

export async function applyHfPersonalization({ userId, supabase, scored, trace }: {
  userId?: string | null;
  supabase: SupabaseClient;
  scored: { all: ScoredCandidate[]; restaurants: ScoredCandidate[]; activities: ScoredCandidate[] };
  trace: SearchTrace;
}) {
  const config = await resolveSearchMlRuntimeConfig();
  if (!userId || config.personalizationMode === "disabled") return scored;
  const ids = [...new Set(scored.all.map(locationId).filter(Boolean))];
  if (!ids.length) return scored;
  try {
    const { data, error } = await supabase.rpc("get_user_location_preference_similarity", { p_user_id: userId, p_location_ids: ids, p_embedding_version: config.embeddingVersion });
    if (error) throw error;
    const similarities = new Map((data ?? []).map((row: any) => [String(row.location_id), Number(row.similarity)]));
    trace.decisions.push({ stage: "hf_personalization", decision: config.personalizationMode === "enabled" ? "bounded_preference_boost_applied" : "preference_boost_shadowed", reason: JSON.stringify({ candidateCount: similarities.size, maxBoost: 0.04 }) });
    if (config.personalizationMode !== "enabled") return scored;
    const restaurants = applyLane(scored.restaurants, similarities);
    const activities = applyLane(scored.activities, similarities);
    const byId = new Map([...restaurants, ...activities].map((row) => [locationId(row), row]));
    return { restaurants, activities, all: scored.all.map((row) => byId.get(locationId(row)) ?? row).sort((a, b) => b.scores.total - a.scores.total) };
  } catch (error) {
    trace.decisions.push({ stage: "hf_personalization", decision: "personalization_fallback", reason: error instanceof Error ? error.message : "unknown" });
    return scored;
  }
}
