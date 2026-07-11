import { runEnterpriseSearch } from "@/lib/search/enterprise";
import type { EnterpriseSearchResult } from "@/lib/search/enterprise/types";
import type { UserSearchLocation } from "@/lib/search/enterprise/markets";
import { runAnchoredNearbySearch } from "@/lib/search/enterprise/anchoredNearby";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type RunOutingSearchInput = {
  query: string;
  userLocation?: UserSearchLocation | null;
  market?: string | null;
  source?: string | null;
  route?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  filters?: Record<string, unknown> | null;
  body?: Record<string, any> | null;
  supabase?: any;
  displayLimit?: number;
  useLLM?: boolean;
  logPerformance?: boolean;
  betaDebug?: boolean;
  betaAssignmentId?: string | null;
  betaTesterId?: string | null;
  usedCustomPrompt?: boolean;
  useFastPath?: boolean;
  createdByUserId?: string | null;
  searchHealthDebug?: boolean;
  betaFeedbackSubmitted?: boolean;
};

/** Canonical app-side public outing search orchestration. */
export async function runOutingSearch(input: RunOutingSearchInput): Promise<EnterpriseSearchResult> {
  const query = String(input.query || "").trim();
  if (!query) throw new Error("Search query is required.");

  const body = {
    ...(input.body ?? {}),
    ...(input.filters ? { filters: input.filters } : {}),
    query,
    input: query,
    message: query,
  };

  const anchored = await runAnchoredNearbySearch({
    query,
    supabase: input.supabase ?? supabaseAdmin,
    displayLimit: input.displayLimit,
  });
  if (anchored) return anchored;

  return runEnterpriseSearch(query, {
    ...input,
    body,
    userLocation: input.userLocation ?? null,
    selectedMarketId: input.market ?? input.body?.selectedMarketId ?? input.body?.selected_market_id ?? null,
    source: input.source ?? "public_outing_search",
    route: input.route ?? null,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
  });
}
