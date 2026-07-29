export type SearchProfileMode = "off" | "shadow" | "canary" | "primary";

const VALID_MODES = new Set<SearchProfileMode>(["off", "shadow", "canary", "primary"]);

export function getSearchProfileMode(): SearchProfileMode {
  const configured = String(process.env.SEARCH_PROFILE_MODE ?? "off").trim().toLowerCase() as SearchProfileMode;
  return VALID_MODES.has(configured) ? configured : "off";
}

export function getSearchProfileCanaryPercent(): number {
  const parsed = Number(process.env.SEARCH_PROFILE_CANARY_PERCENT ?? 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function stableBucket(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

export function resolveSearchProfileRollout(requestId: string) {
  const mode = getSearchProfileMode();
  const canaryPercent = getSearchProfileCanaryPercent();
  const bucket = stableBucket(requestId);
  const serveProfiles = mode === "primary" || (mode === "canary" && bucket < canaryPercent);
  return { mode, canaryPercent, bucket, serveProfiles, shadowProfiles: mode === "shadow" };
}
