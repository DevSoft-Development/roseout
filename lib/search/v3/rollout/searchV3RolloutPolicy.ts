export type SearchV3RolloutMode = "shadow" | "canary" | "primary";

export type SearchV3RolloutPolicy = {
  mode: SearchV3RolloutMode;
  canaryPercent: number;
  serveV3: boolean;
  runV3Shadow: boolean;
  allowV2Fallback: boolean;
  bucket: number;
};

export function resolveSearchV3RolloutPolicy(
  requestId: string,
  env: NodeJS.ProcessEnv = process.env,
): SearchV3RolloutPolicy {
  const rawMode = String(env.SEARCH_V3_ROLLOUT_MODE ?? "shadow").trim().toLowerCase();
  const mode: SearchV3RolloutMode =
    rawMode === "primary" || rawMode === "canary" ? rawMode : "shadow";
  const canaryPercent = clampPercent(Number(env.SEARCH_V3_CANARY_PERCENT ?? 5));
  const bucket = stableBucket(requestId);
  const fallbackSetting = String(
    env.SEARCH_V3_V2_FALLBACK_ENABLED ?? "true",
  ).trim().toLowerCase();
  const allowV2Fallback = fallbackSetting !== "false";

  const serveV3 =
    mode === "primary" ||
    (mode === "canary" && bucket < canaryPercent);

  return {
    mode,
    canaryPercent,
    serveV3,
    runV3Shadow: mode === "shadow" || (mode === "canary" && !serveV3),
    allowV2Fallback,
    bucket,
  };
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function stableBucket(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

/**
 * Server-side DB-backed rollout resolution. Keep this separate from the legacy
 * env-only function for backwards-compatible tests and shadow-mode consumers.
 * A serving handler must explicitly await this function before choosing V3.
 */
export async function resolveSearchV3DatabaseRolloutPolicy(
  requestId: string,
  client: { from(table: string): any },
): Promise<SearchV3RolloutPolicy> {
  // Dynamic import avoids importing DB controls into client/browser bundles.
  const { readSearchV3RuntimeControls } = await import("../controls/searchV3Controls");
  const controls = await readSearchV3RuntimeControls(client);
  const bucket = stableBucket(requestId);
  const canaryPercent = clampPercent(controls.canaryPercent);
  const coreHealthy = Object.entries(controls.lanes)
    .filter(([lane]) => lane !== "review_intelligence")
    .every(([, config]) => config.enabled && !config.forceOpen);
  const mode: SearchV3RolloutMode = coreHealthy ? controls.mode : "shadow";
  const serveV3 = mode === "primary" || (mode === "canary" && bucket < canaryPercent);
  return {
    mode,
    bucket,
    canaryPercent: mode === "shadow" ? 0 : canaryPercent,
    serveV3,
    runV3Shadow: mode === "shadow" || (mode === "canary" && !serveV3),
    allowV2Fallback: true,
  };
}
