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
const percent = (value: unknown, fallback = 100) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : fallback;
};
function environmentConfig(): SearchCoreConfig {
  const raw = String(process.env.SEARCH_CORE_VERSION ?? "v2").toLowerCase();
  const emergencyLegacy = raw === "legacy";
  return {
    enabled: !emergencyLegacy,
    mode: emergencyLegacy ? "legacy" : "v2",
    rolloutPercentage: emergencyLegacy ? 0 : 100,
    shadowEnabled: false,
    killSwitch: emergencyLegacy,
    internalOnly: false,
    source: "environment",
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
      const requestedMode = modes.has(value.mode as SearchCoreMode)
        ? (value.mode as SearchCoreMode)
        : fallback.mode;
      const rollbackRequested = Boolean(value.killSwitch) || requestedMode === "legacy";
      return {
        enabled: !rollbackRequested,
        mode: rollbackRequested ? "legacy" : "v2",
        rolloutPercentage: rollbackRequested ? 0 : 100,
        shadowEnabled: false,
        killSwitch: rollbackRequested,
        internalOnly: false,
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
  const rollbackRequested = Boolean(value.killSwitch) || value.mode === "legacy";
  return {
    enabled: !rollbackRequested,
    mode: rollbackRequested ? "legacy" : "v2",
    rolloutPercentage: rollbackRequested ? 0 : 100,
    shadowEnabled: false,
    killSwitch: rollbackRequested,
    internalOnly: false,
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
  await supabaseAdmin.from("admin_audit_logs").insert({
    actor_user_id: actorId,
    action: "search_core_config.updated",
    entity_type: "app_setting",
    entity_id: SEARCH_CORE_CONFIG_KEY,
    summary: next.mode === "legacy" ? "Search Core emergency rollback enabled" : "Search Core V2 enabled for all public traffic",
    metadata: {
      previous,
      next,
      reason: reason || null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
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
  const key = input.userId ?? input.anonymousSessionId ?? input.stableClientId ?? input.requestId;
  const bucket = rolloutBucket(key);
  if (input.authorizedOverride && input.override) {
    return {
      engine: input.override,
      bucket,
      keyType,
      percentage: input.override === "v2" ? 100 : 0,
      reason: "admin_override",
    } as const;
  }
  if (config.killSwitch || config.mode === "legacy") {
    return {
      engine: "legacy",
      bucket,
      keyType,
      percentage: 0,
      reason: "emergency_rollback",
    } as const;
  }
  return {
    engine: "v2",
    bucket,
    keyType,
    percentage: 100,
    reason: "v2_primary",
  } as const;
}
