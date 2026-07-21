import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type RankingVariant = "control" | "hybrid";
export type RolloutSettings = {
  enabled: boolean;
  rollout_percent: number;
  admin_only: boolean;
  shadow_test_enabled: boolean;
  eligible_markets: string[];
  assignment_salt: string;
  model_version: string;
};

const DEFAULTS: RolloutSettings = {
  enabled: false,
  rollout_percent: 0,
  admin_only: true,
  shadow_test_enabled: false,
  eligible_markets: ["nyc"],
  assignment_salt: "phase4d:v1",
  model_version: "hybrid:v1",
};

export async function getRankingRolloutSettings(): Promise<RolloutSettings> {
  const { data, error } = await supabaseAdmin
    .from("search_ranking_rollout_settings")
    .select("enabled,rollout_percent,admin_only,shadow_test_enabled,eligible_markets,assignment_salt,model_version")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return DEFAULTS;
  return {
    ...DEFAULTS,
    ...data,
    rollout_percent: Math.max(0, Math.min(100, Number(data.rollout_percent || 0))),
  };
}

export function assignRankingVariant(input: {
  identityKey: string;
  market?: string | null;
  isAdmin?: boolean;
  settings: RolloutSettings;
}): {
  variant: RankingVariant;
  bucket: number;
  eligible: boolean;
  liveEligible: boolean;
  shadowTest: boolean;
  assignmentKeyHash: string;
} {
  const market = String(input.market || "").toLowerCase();
  const marketEligible =
    !input.settings.eligible_markets.length ||
    input.settings.eligible_markets.some((value) => market.includes(value.toLowerCase()));
  const liveEligible =
    input.settings.enabled &&
    marketEligible &&
    (!input.settings.admin_only || Boolean(input.isAdmin));
  const shadowTest =
    !liveEligible &&
    input.settings.shadow_test_enabled &&
    marketEligible &&
    Boolean(input.isAdmin);
  const digest = createHash("sha256")
    .update(`${input.settings.assignment_salt}:${input.identityKey}`)
    .digest("hex");
  const bucket = parseInt(digest.slice(0, 8), 16) % 100;
  return {
    variant: liveEligible && bucket < input.settings.rollout_percent ? "hybrid" : "control",
    bucket,
    eligible: liveEligible || shadowTest,
    liveEligible,
    shadowTest,
    assignmentKeyHash: digest,
  };
}

export async function logRankingExperiment(input: {
  searchId?: string | null;
  assignmentKeyHash: string;
  variant: RankingVariant;
  rolloutPercent: number;
  market?: string | null;
  adminEligible?: boolean;
  modelVersion: string;
  restaurantControlOrder?: string[];
  restaurantHybridOrder?: string[];
  activityControlOrder?: string[];
  activityHybridOrder?: string[];
  latencyMs?: number | null;
  noResults?: boolean;
  pairCount?: number;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("search_ranking_experiments").insert({
    search_id: input.searchId || null,
    assignment_key_hash: input.assignmentKeyHash,
    variant: input.variant,
    rollout_percent: input.rolloutPercent,
    market: input.market || null,
    admin_eligible: Boolean(input.adminEligible),
    model_version: input.modelVersion,
    restaurant_control_order: input.restaurantControlOrder || [],
    restaurant_hybrid_order: input.restaurantHybridOrder || [],
    activity_control_order: input.activityControlOrder || [],
    activity_hybrid_order: input.activityHybridOrder || [],
    latency_ms: input.latencyMs ?? null,
    no_results: Boolean(input.noResults),
    pair_count: input.pairCount || 0,
    metadata: input.metadata || {},
  });
}
