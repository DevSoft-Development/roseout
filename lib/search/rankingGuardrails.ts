import { supabaseAdmin } from "@/lib/supabase-admin";

export type GuardrailDecision = {
  status: "disabled" | "insufficient_sample" | "healthy" | "warning" | "rollback";
  reasons: string[];
  rolledBack: boolean;
  health: Record<string, unknown> | null;
};

export async function evaluateRankingGuardrails(): Promise<GuardrailDecision> {
  const { data: healthRows, error: healthError } = await supabaseAdmin
    .from("search_ranking_guardrail_health_v1")
    .select("*")
    .limit(1);
  if (healthError) throw healthError;

  const health = (healthRows?.[0] ?? null) as any;
  if (!health?.enabled) {
    return { status: "disabled", reasons: [], rolledBack: false, health };
  }

  const controlSample = Number(health.control_sample_size || 0);
  const hybridSample = Number(health.hybrid_sample_size || 0);
  const minimumSample = Number(health.minimum_sample_size || 0);
  if (controlSample < minimumSample || hybridSample < minimumSample) {
    return {
      status: "insufficient_sample",
      reasons: [`Minimum ${minimumSample} samples per variant required`],
      rolledBack: false,
      health,
    };
  }

  const reasons: string[] = [];
  const controlNoResults = Number(health.control_no_result_rate || 0);
  const hybridNoResults = Number(health.hybrid_no_result_rate || 0);
  if (hybridNoResults - controlNoResults > Number(health.max_no_result_rate_delta || 0)) {
    reasons.push("Hybrid no-result rate exceeded the allowed delta");
  }

  const hybridP95 = Number(health.hybrid_p95_latency_ms || 0);
  if (hybridP95 > Number(health.max_p95_latency_ms || 0)) {
    reasons.push("Hybrid P95 latency exceeded the configured maximum");
  }

  const controlPairs = Number(health.control_avg_pair_count || 0);
  const hybridPairs = Number(health.hybrid_avg_pair_count || 0);
  const pairDrop = controlPairs > 0 ? (controlPairs - hybridPairs) / controlPairs : 0;
  if (pairDrop > Number(health.max_pair_count_drop || 0)) {
    reasons.push("Hybrid average pair count dropped beyond the allowed threshold");
  }

  if (!reasons.length) {
    await supabaseAdmin.from("search_ranking_rollout_events").insert({
      event_type: "evaluation",
      status: "healthy",
      control_sample_size: controlSample,
      hybrid_sample_size: hybridSample,
      settings_snapshot: health,
    });
    return { status: "healthy", reasons: [], rolledBack: false, health };
  }

  const { error: rollbackError } = await supabaseAdmin
    .from("search_ranking_rollout_settings")
    .update({ enabled: false, rollout_percent: 0, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (rollbackError) throw rollbackError;

  await supabaseAdmin.from("search_ranking_rollout_events").insert({
    event_type: "automatic_rollback",
    status: "rollback",
    reason: reasons.join("; "),
    control_sample_size: controlSample,
    hybrid_sample_size: hybridSample,
    control_no_result_rate: health.control_no_result_rate,
    hybrid_no_result_rate: health.hybrid_no_result_rate,
    control_p95_latency_ms: health.control_p95_latency_ms,
    hybrid_p95_latency_ms: health.hybrid_p95_latency_ms,
    control_avg_pair_count: health.control_avg_pair_count,
    hybrid_avg_pair_count: health.hybrid_avg_pair_count,
    settings_snapshot: health,
  });

  return { status: "rollback", reasons, rolledBack: true, health };
}
