export type StructuredSearchError = {
  message: string;
  code?: string | null;
  details?: unknown;
  hint?: string | null;
  status?: number | null;
};

export function serializeSearchError(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const payload: StructuredSearchError = {
      message:
        typeof record.message === "string" && record.message.trim()
          ? record.message
          : typeof record.error === "string" && record.error.trim()
            ? record.error
            : "Unknown search error",
      code: typeof record.code === "string" ? record.code : null,
      details: record.details ?? null,
      hint: typeof record.hint === "string" ? record.hint : null,
      status: Number.isFinite(Number(record.status)) ? Number(record.status) : null,
    };
    return JSON.stringify(payload);
  }
  return String(value);
}

export function resolvePrimaryResultType(input: {
  searchType?: string | null;
  restaurants?: unknown[];
  activities?: unknown[];
  pairs?: unknown[];
  current?: string | null;
}) {
  const restaurantCount = Array.isArray(input.restaurants) ? input.restaurants.length : 0;
  const activityCount = Array.isArray(input.activities) ? input.activities.length : 0;
  const pairCount = Array.isArray(input.pairs) ? input.pairs.length : 0;

  if (input.searchType === "mixed_outing") {
    if (pairCount > 0) return "pairs";
    if (restaurantCount > 0 || activityCount > 0) return "partial_mixed";
    return "empty";
  }

  return input.current ?? null;
}

export type RecoveryAttemptTiming = {
  lane: "restaurant" | "activity";
  reason: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  resultCount: number;
  error: string | null;
};

export function createRecoveryAttemptTiming(input: {
  lane: RecoveryAttemptTiming["lane"];
  reason: string;
  startedAt: number;
  completedAt?: number;
  resultCount?: number;
  error?: unknown;
}): RecoveryAttemptTiming {
  const completedAt = input.completedAt ?? Date.now();
  return {
    lane: input.lane,
    reason: input.reason,
    startedAt: input.startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - input.startedAt),
    resultCount: Number.isFinite(Number(input.resultCount)) ? Number(input.resultCount) : 0,
    error: input.error == null ? null : serializeSearchError(input.error),
  };
}
