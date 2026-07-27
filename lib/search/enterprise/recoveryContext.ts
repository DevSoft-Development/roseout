import type { EnterpriseSearchResult } from "./types";

export type RecoveryLane = "restaurant" | "activity" | "both";

export type RecoveryRequestContext = {
  cache: Map<string, Promise<EnterpriseSearchResult> | EnterpriseSearchResult>;
  executedKeys: Set<string>;
  rpcKeys: string[];
  recoveryCacheHitCount: number;
  rpcDedupedCount: number;
  recoveryRpcCount: number;
  recoveryRestaurantRpcCount: number;
  recoveryActivityRpcCount: number;
};

export type RecoveryKeyInput = {
  query: string;
  lane: RecoveryLane;
  latitude: number | null;
  longitude: number | null;
  radiusMiles: number | null;
  market: string | null;
  borough: string | null;
  city: string | null;
  state: string | null;
  stage: string;
  relaxedCandidateEligibility: boolean;
  allowCrossDomain: boolean;
  maxPairDistanceMiles: number | null;
  source?: string | null;
};

const text = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const coordinate = (value: number | null) =>
  value != null && Number.isFinite(value) ? Number(value).toFixed(4) : "";
const number = (value: number | null) =>
  value != null && Number.isFinite(value) ? String(Number(value)) : "";

/** Stable, deliberately non-JSON key used by every post-filter recovery RPC. */
export function buildRecoveryKey(input: RecoveryKeyInput): string {
  return [
    "recovery-v1",
    text(input.source ?? "enterprise-search-v1"),
    text(input.stage),
    input.lane,
    text(input.query),
    coordinate(input.latitude),
    coordinate(input.longitude),
    number(input.radiusMiles),
    text(input.market),
    text(input.borough),
    text(input.city),
    text(input.state),
    input.relaxedCandidateEligibility ? "relaxed" : "strict",
    input.allowCrossDomain ? "cross-domain" : "same-domain",
    number(input.maxPairDistanceMiles),
  ].join("|");
}

export function createRecoveryRequestContext(): RecoveryRequestContext {
  return {
    cache: new Map(),
    executedKeys: new Set(),
    rpcKeys: [],
    recoveryCacheHitCount: 0,
    rpcDedupedCount: 0,
    recoveryRpcCount: 0,
    recoveryRestaurantRpcCount: 0,
    recoveryActivityRpcCount: 0,
  };
}

export function executeRecoveryOnce(
  context: RecoveryRequestContext,
  key: string,
  lane: RecoveryLane,
  execute: () => Promise<EnterpriseSearchResult>,
): Promise<EnterpriseSearchResult> {
  const cached = context.cache.get(key);
  if (cached) {
    context.recoveryCacheHitCount += 1;
    context.rpcDedupedCount += 1;
    return Promise.resolve(cached);
  }

  context.executedKeys.add(key);
  context.rpcKeys.push(key);
  context.recoveryRpcCount += 1;
  if (lane === "restaurant" || lane === "both")
    context.recoveryRestaurantRpcCount += 1;
  if (lane === "activity" || lane === "both")
    context.recoveryActivityRpcCount += 1;
  const pending = execute();
  context.cache.set(key, pending);
  pending.then(
    (result) => context.cache.set(key, result),
    () => context.cache.delete(key),
  );
  return pending;
}

export function recoveryContextTelemetry(
  context: RecoveryRequestContext,
  explicitDebug = false,
) {
  return {
    recoveryCacheHitCount: context.recoveryCacheHitCount,
    rpcDedupedCount: context.rpcDedupedCount,
    recoveryRpcCount: context.recoveryRpcCount,
    recoveryRestaurantRpcCount: context.recoveryRestaurantRpcCount,
    recoveryActivityRpcCount: context.recoveryActivityRpcCount,
    ...(explicitDebug ? { recoveryKeys: [...context.rpcKeys] } : {}),
  };
}
