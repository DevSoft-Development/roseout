import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SearchProfileMode } from "./searchProfileMode";

export type SearchProfileRolloutConfig = {
  mode: SearchProfileMode;
  canaryPercent: number;
  killSwitch: boolean;
  source: "database" | "environment" | "default";
  updatedAt: string | null;
  updatedBy: string | null;
};

export const SEARCH_PROFILE_ROLLOUT_KEY = "search_profile_rollout";
const CACHE_TAG = "search-profile-rollout";
const validModes = new Set<SearchProfileMode>(["off", "shadow", "canary", "primary"]);

function boundedPercent(value: unknown, fallback = 5) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : fallback;
}

export function normalizeSearchProfileRolloutConfig(
  value: Pick<SearchProfileRolloutConfig, "mode" | "canaryPercent" | "killSwitch">,
) {
  if (value.killSwitch) {
    return {
      mode: "off" as const,
      canaryPercent: 0,
      killSwitch: true,
    };
  }

  if (value.mode === "primary" || (value.mode === "canary" && value.canaryPercent === 100)) {
    return {
      mode: "primary" as const,
      canaryPercent: 100,
      killSwitch: false,
    };
  }

  return {
    mode: value.mode,
    canaryPercent: value.mode === "off" || value.mode === "shadow" ? 0 : value.canaryPercent,
    killSwitch: false,
  };
}

function environmentConfig(): SearchProfileRolloutConfig {
  const rawMode = String(process.env.SEARCH_PROFILE_MODE ?? "off").trim().toLowerCase() as SearchProfileMode;
  const mode = validModes.has(rawMode) ? rawMode : "off";
  const normalized = normalizeSearchProfileRolloutConfig({
    mode,
    canaryPercent: boundedPercent(process.env.SEARCH_PROFILE_CANARY_PERCENT, mode === "primary" ? 100 : 5),
    killSwitch: false,
  });
  return {
    ...normalized,
    source: process.env.SEARCH_PROFILE_MODE ? "environment" : "default",
    updatedAt: null,
    updatedBy: null,
  };
}

const readConfig = unstable_cache(
  async (): Promise<SearchProfileRolloutConfig> => {
    const fallback = environmentConfig();
    try {
      const { data, error } = await supabaseAdmin
        .from("app_settings")
        .select("value,updated_at,updated_by")
        .eq("key", SEARCH_PROFILE_ROLLOUT_KEY)
        .maybeSingle();
      if (error || !data?.value) return fallback;
      const value = data.value as Partial<SearchProfileRolloutConfig>;
      const mode = validModes.has(value.mode as SearchProfileMode)
        ? (value.mode as SearchProfileMode)
        : fallback.mode;
      const normalized = normalizeSearchProfileRolloutConfig({
        mode,
        canaryPercent: boundedPercent(value.canaryPercent, mode === "primary" ? 100 : fallback.canaryPercent),
        killSwitch: Boolean(value.killSwitch),
      });
      return {
        ...normalized,
        source: "database",
        updatedAt: data.updated_at ?? null,
        updatedBy: data.updated_by ?? null,
      };
    } catch {
      return fallback;
    }
  },
  [SEARCH_PROFILE_ROLLOUT_KEY],
  { tags: [CACHE_TAG], revalidate: 30 },
);

export const getEffectiveSearchProfileRolloutConfig = readConfig;

export function validateSearchProfileRolloutConfig(value: Partial<SearchProfileRolloutConfig>) {
  if (!validModes.has(value.mode as SearchProfileMode)) throw new Error("Invalid search profile mode.");
  const canaryPercent = Number(value.canaryPercent);
  if (!Number.isInteger(canaryPercent) || canaryPercent < 0 || canaryPercent > 100) {
    throw new Error("Canary percentage must be an integer from 0 through 100.");
  }
  return normalizeSearchProfileRolloutConfig({
    mode: value.mode as SearchProfileMode,
    canaryPercent,
    killSwitch: Boolean(value.killSwitch),
  });
}

export async function updateSearchProfileRolloutConfig(
  value: Partial<SearchProfileRolloutConfig>,
  actorId: string,
  reason?: string,
) {
  const next = validateSearchProfileRolloutConfig(value);
  const previous = await getEffectiveSearchProfileRolloutConfig();
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("app_settings").upsert({
    key: SEARCH_PROFILE_ROLLOUT_KEY,
    value: next,
    updated_by: actorId,
    updated_at: now,
  });
  if (error) throw error;

  await supabaseAdmin.from("admin_audit_logs").insert({
    actor_user_id: actorId,
    action: "search_profile_rollout.updated",
    entity_type: "app_setting",
    entity_id: SEARCH_PROFILE_ROLLOUT_KEY,
    summary:
      next.mode === "primary"
        ? "Canonical search profile retrieval enabled for all V2 traffic"
        : "Search profile rollout configuration updated",
    metadata: {
      previous,
      next,
      reason: reason?.trim() || null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    },
  });

  revalidateTag(CACHE_TAG, "max");
  return { ...next, source: "database" as const, updatedAt: now, updatedBy: actorId };
}
