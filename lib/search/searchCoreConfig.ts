import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type SearchCoreMode = "legacy" | "shadow" | "percentage" | "v2";
export type SearchCoreOverride = "legacy" | "v2" | "compare";
export type SearchCoreConfig = {
  enabled: boolean;
  mode: SearchCoreMode;
  rolloutPercentage: number;
  shadowEnabled: boolean;
  killSwitch: boolean;
  internalOnly: boolean;
  source: "database" | "environment" | "legacy_fallback";
  updatedAt: string | null;
  updatedBy: string | null;
};
export const SEARCH_CORE_CONFIG_KEY = "search_core_v2_rollout";
const TAG = "search-core-config";
const modes = new Set<SearchCoreMode>(["legacy", "shadow", "percentage", "v2"]);
const percent = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : fallback;
};
function environmentConfig(): SearchCoreConfig {
  const raw = String(process.env.SEARCH_CORE_VERSION ?? "legacy").toLowerCase();
  const mode: SearchCoreMode =
    raw === "v2" ? "v2" : raw === "shadow" ? "shadow" : "legacy";
  return {
    enabled: mode !== "legacy",
    mode,
    rolloutPercentage: percent(
      process.env.SEARCH_CORE_V2_ROLLOUT_PERCENT,
      mode === "v2" ? 100 : 0,
    ),
    shadowEnabled: mode === "shadow",
    killSwitch: false,
    internalOnly: false,
    source: raw ? "environment" : "legacy_fallback",
    updatedAt: null,
    updatedBy: null,
  };
}
const read = unstable_cache(
  async () => {
    const fallback = environmentConfig();
    try {
      const { data, error } = await supabaseAdmin
        .from("app_settings")
        .select("value,updated_at,updated_by")
        .eq("key", SEARCH_CORE_CONFIG_KEY)
        .maybeSingle();
      if (error || !data?.value) return fallback;
      const value = data.value as Partial<SearchCoreConfig>;
      return {
        enabled: value.enabled !== false,
        mode: modes.has(value.mode as SearchCoreMode)
          ? (value.mode as SearchCoreMode)
          : fallback.mode,
        rolloutPercentage: percent(
          value.rolloutPercentage,
          fallback.rolloutPercentage,
        ),
        shadowEnabled: Boolean(value.shadowEnabled),
        killSwitch: Boolean(value.killSwitch),
        internalOnly: Boolean(value.internalOnly),
        source: "database",
        updatedAt: data.updated_at ?? null,
        updatedBy: data.updated_by ?? null,
      } satisfies SearchCoreConfig;
    } catch {
      return fallback;
    }
  },
  [SEARCH_CORE_CONFIG_KEY],
  { tags: [TAG], revalidate: 30 },
);
export const getEffectiveSearchCoreConfig = read;
export function validateSearchCoreConfig(
  value: Partial<SearchCoreConfig>,
): Omit<SearchCoreConfig, "source" | "updatedAt" | "updatedBy"> {
  if (!modes.has(value.mode as SearchCoreMode))
    throw new Error("Invalid serving mode.");
  const rolloutPercentage = Number(value.rolloutPercentage);
  if (
    !Number.isInteger(rolloutPercentage) ||
    rolloutPercentage < 0 ||
    rolloutPercentage > 100
  )
    throw new Error(
      "Rollout percentage must be an integer from 0 through 100.",
    );
  return {
    enabled: Boolean(value.enabled),
    mode: value.mode!,
    rolloutPercentage,
    shadowEnabled: Boolean(value.shadowEnabled),
    killSwitch: Boolean(value.killSwitch),
    internalOnly: Boolean(value.internalOnly),
  };
}
export async function updateSearchCoreConfig(
  value: Partial<SearchCoreConfig>,
  actorId: string,
  reason?: string,
) {
  const next = validateSearchCoreConfig(value);
  const previous = await getEffectiveSearchCoreConfig();
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({
      key: SEARCH_CORE_CONFIG_KEY,
      value: next,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
  await supabaseAdmin
    .from("admin_audit_logs")
    .insert({
      actor_user_id: actorId,
      action: "search_core_config.updated",
      entity_type: "app_setting",
      entity_id: SEARCH_CORE_CONFIG_KEY,
      summary: "Search Core V2 rollout configuration updated",
      metadata: {
        previous,
        next,
        reason: reason || null,
        environment:
          process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      },
    });
  revalidateTag(TAG, "max");
  return next;
}
export function rolloutBucket(key: string) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100;
}
export function assignSearchCoreVersion(input: {
  config: SearchCoreConfig;
  override?: SearchCoreOverride | null;
  authorizedOverride?: boolean;
  isAdmin?: boolean;
  userId?: string | null;
  anonymousSessionId?: string | null;
  stableClientId?: string | null;
  requestId: string;
}) {
  const { config } = input;
  const keyType = input.userId
    ? "user"
    : input.anonymousSessionId
      ? "anonymous_session"
      : input.stableClientId
        ? "client"
        : "request";
  const key =
    input.userId ??
    input.anonymousSessionId ??
    input.stableClientId ??
    input.requestId;
  const bucket = rolloutBucket(key);
  if (input.authorizedOverride && input.override)
    return {
      engine: input.override,
      bucket,
      keyType,
      percentage: config.rolloutPercentage,
      reason: "admin_override",
    } as const;
  if (config.killSwitch || !config.enabled)
    return {
      engine: "legacy",
      bucket,
      keyType,
      percentage: config.rolloutPercentage,
      reason: config.killSwitch ? "kill_switch" : "disabled",
    } as const;
  if (config.internalOnly && !input.isAdmin)
    return {
      engine: "legacy",
      bucket,
      keyType,
      percentage: config.rolloutPercentage,
      reason: "internal_only",
    } as const;
  if (config.mode === "v2")
    return {
      engine: "v2",
      bucket,
      keyType,
      percentage: 100,
      reason: "v2_only",
    } as const;
  if (config.mode === "shadow")
    return {
      engine: "legacy",
      bucket,
      keyType,
      percentage: config.rolloutPercentage,
      reason: "shadow",
    } as const;
  if (config.mode === "percentage" && bucket < config.rolloutPercentage)
    return {
      engine: "v2",
      bucket,
      keyType,
      percentage: config.rolloutPercentage,
      reason: "rollout",
    } as const;
  return {
    engine: "legacy",
    bucket,
    keyType,
    percentage: config.rolloutPercentage,
    reason: "legacy",
  } as const;
}
