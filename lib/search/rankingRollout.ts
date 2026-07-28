import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type RankingVariant = "control" | "hybrid";
export type RolloutSettings = {
  enabled: boolean;
  rollout_percent: number;
  admin_only: boolean;
  shadow_enabled: boolean;
  kill_switch: boolean;
  eligible_markets: string[];
  assignment_salt: string;
  model_version: string;
  updated_by?: string | null;
  updated_at?: string | null;
};

const DEFAULTS: RolloutSettings = {
  enabled: false,
  rollout_percent: 0,
  admin_only: true,
  shadow_enabled: false,
  kill_switch: false,
  eligible_markets: ["nyc"],
  assignment_salt: "phase4d:v1",
  model_version: "hybrid:v1",
  updated_by: null,
  updated_at: null,
};

function clampPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 100) {
    throw new Error("ML rollout percentage must be an integer from 0 through 100.");
  }
  return numeric;
}

export async function getRankingRolloutSettings(): Promise<RolloutSettings> {
  const { data, error } = await supabaseAdmin
    .from("search_ranking_rollout_settings")
    .select(
      "enabled,rollout_percent,admin_only,shadow_enabled,kill_switch,eligible_markets,assignment_salt,model_version,updated_by,updated_at",
    )
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return DEFAULTS;
  return {
    ...DEFAULTS,
    ...data,
    rollout_percent: Math.max(
      0,
      Math.min(100, Number(data.rollout_percent || 0)),
    ),
    eligible_markets: Array.isArray(data.eligible_markets)
      ? data.eligible_markets.map(String)
      : DEFAULTS.eligible_markets,
  };
}

export function validateRankingRolloutSettings(
  input: Partial<RolloutSettings>,
): RolloutSettings {
  const eligibleMarkets = Array.isArray(input.eligible_markets)
    ? input.eligible_markets.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : DEFAULTS.eligible_markets;
  const modelVersion = String(input.model_version ?? DEFAULTS.model_version).trim();
  if (!modelVersion) throw new Error("ML model version is required.");
  return {
    enabled: Boolean(input.enabled),
    rollout_percent: clampPercent(input.rollout_percent ?? 0),
    admin_only: Boolean(input.admin_only),
    shadow_enabled: Boolean(input.shadow_enabled),
    kill_switch: Boolean(input.kill_switch),
    eligible_markets: [...new Set(eligibleMarkets)],
    assignment_salt: String(input.assignment_salt ?? DEFAULTS.assignment_salt).trim() || DEFAULTS.assignment_salt,
    model_version: modelVersion,
    updated_by: input.updated_by ?? null,
    updated_at: input.updated_at ?? null,
  };
}

export async function updateRankingRolloutSettings(
  input: Partial<RolloutSettings>,
  actorId: string,
  reason?: string,
) {
  const previous = await getRankingRolloutSettings();
  const next = validateRankingRolloutSettings(input);
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("search_ranking_rollout_settings")
    .upsert({
      id: true,
      enabled: next.enabled,
      rollout_percent: next.rollout_percent,
      admin_only: next.admin_only,
      shadow_enabled: next.shadow_enabled,
      kill_switch: next.kill_switch,
      eligible_markets: next.eligible_markets,
      assignment_salt: next.assignment_salt,
      model_version: next.model_version,
      updated_by: actorId,
      updated_at: now,
    });
  if (error) throw error;

  await supabaseAdmin.from("admin_audit_logs").insert({
    actor_user_id: actorId,
    action: "search_ml_rollout.updated",
    entity_type: "search_ranking_rollout_settings",
    entity_id: "global",
    summary: "Search ML rollout configuration updated",
    metadata: {
      previous,
      next,
      reason: reason || null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    },
  });

  return { ...next, updated_by: actorId, updated_at: now };
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
  shadow: boolean;
  reason:
    | "kill_switch"
    | "disabled"
    | "admin_only"
    | "market_ineligible"
    | "shadow"
    | "rollout"
    | "control";
  assignmentKeyHash: string;
} {
  const market = String(input.market || "").toLowerCase();
  const marketEligible =
    !input.settings.eligible_markets.length ||
    input.settings.eligible_markets.some((value) =>
      market.includes(value.toLowerCase()),
    );
  const digest = createHash("sha256")
    .update(`${input.settings.assignment_salt}:${input.identityKey}`)
    .digest("hex");
  const bucket = parseInt(digest.slice(0, 8), 16) % 100;

  if (input.settings.kill_switch) {
    return {
      variant: "control",
      bucket,
      eligible: false,
      shadow: false,
      reason: "kill_switch",
      assignmentKeyHash: digest,
    };
  }
  if (!input.settings.enabled) {
    return {
      variant: "control",
      bucket,
      eligible: false,
      shadow: false,
      reason: "disabled",
      assignmentKeyHash: digest,
    };
  }
  if (input.settings.admin_only && !input.isAdmin) {
    return {
      variant: "control",
      bucket,
      eligible: false,
      shadow: false,
      reason: "admin_only",
      assignmentKeyHash: digest,
    };
  }
  if (!marketEligible) {
    return {
      variant: "control",
      bucket,
      eligible: false,
      shadow: false,
      reason: "market_ineligible",
      assignmentKeyHash: digest,
    };
  }
  if (input.settings.shadow_enabled) {
    return {
      variant: "control",
      bucket,
      eligible: true,
      shadow: true,
      reason: "shadow",
      assignmentKeyHash: digest,
    };
  }
  const hybrid = bucket < input.settings.rollout_percent;
  return {
    variant: hybrid ? "hybrid" : "control",
    bucket,
    eligible: true,
    shadow: false,
    reason: hybrid ? "rollout" : "control",
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
