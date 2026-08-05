import "@/lib/search/enterprise/activityIntentContract";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SearchSpeedStatus } from "@/types/beta";

export function getSearchSpeedStatus(input: { totalMs?: number | null; success?: boolean; timedOut?: boolean }): SearchSpeedStatus {
  if (input.timedOut) return "timeout";
  if (input.success === false) return "failed";
  const totalMs = Number(input.totalMs ?? 0);
  if (totalMs <= 1000) return "fast";
  if (totalMs <= 2500) return "good";
  if (totalMs <= 5000) return "slow";
  return "critical";
}

export function safeNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}

export function createSearchTimer() {
  const started = safeNowMs();
  const marks = new Map<string, number>();
  return {
    mark(name: string) { marks.set(name, safeNowMs()); },
    duration(start: string, end: string) {
      const s = marks.get(start); const e = marks.get(end);
      return typeof s === "number" && typeof e === "number" ? Math.max(0, Math.round(e - s)) : null;
    },
    total() { return Math.max(0, Math.round(safeNowMs() - started)); },
  };
}

type LogInput = {
  userId?: string | null; sessionId?: string | null; source?: string | null; route?: string | null; searchQuery: string;
  betaAssignmentId?: string | null; betaTesterId?: string | null; usedCustomPrompt?: boolean | null; parsedIntent?: unknown;
  searchMode?: string | null; locationArea?: string | null; startedAt?: string | Date | null; completedAt?: string | Date | null;
  totalMs?: number | null; llmMs?: number | null; rpcMs?: number | null; restaurantRpcMs?: number | null; activityRpcMs?: number | null;
  rankingMs?: number | null; pairingMs?: number | null; photoFilterMs?: number | null; resultCount?: number | null;
  restaurantCount?: number | null; activityCount?: number | null; pairCount?: number | null; usedLlm?: boolean | null;
  usedFallback?: boolean | null; timedOut?: boolean | null; success?: boolean | null; errorMessage?: string | null; debug?: unknown;
};

function iso(value?: string | Date | null) { return value instanceof Date ? value.toISOString() : value ?? undefined; }

export async function logSearchPerformance(input: LogInput) {
  try {
    const success = input.success !== false;
    const speedStatus = getSearchSpeedStatus({ totalMs: input.totalMs, success, timedOut: Boolean(input.timedOut) });
    await supabaseAdmin.from("search_performance_logs").insert({
      user_id: input.userId ?? null,
      session_id: input.sessionId ?? null,
      source: input.source || "enterprise_search",
      route: input.route ?? null,
      search_query: input.searchQuery,
      beta_assignment_id: input.betaAssignmentId ?? null,
      beta_tester_id: input.betaTesterId ?? null,
      used_custom_prompt: Boolean(input.usedCustomPrompt),
      parsed_intent: input.parsedIntent ?? null,
      search_mode: input.searchMode ?? null,
      location_area: input.locationArea ?? null,
      started_at: iso(input.startedAt),
      completed_at: iso(input.completedAt),
      total_ms: input.totalMs ?? null,
      llm_ms: input.llmMs ?? null,
      rpc_ms: input.rpcMs ?? null,
      restaurant_rpc_ms: input.restaurantRpcMs ?? null,
      activity_rpc_ms: input.activityRpcMs ?? null,
      ranking_ms: input.rankingMs ?? null,
      pairing_ms: input.pairingMs ?? null,
      photo_filter_ms: input.photoFilterMs ?? null,
      result_count: input.resultCount ?? 0,
      restaurant_count: input.restaurantCount ?? 0,
      activity_count: input.activityCount ?? 0,
      pair_count: input.pairCount ?? 0,
      used_llm: Boolean(input.usedLlm),
      used_fallback: Boolean(input.usedFallback),
      timed_out: Boolean(input.timedOut),
      speed_status: speedStatus,
      success,
      error_message: input.errorMessage ?? null,
      debug: input.debug ?? null,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.warn("Search performance logging failed", error);
  }
}
