import { runEnterpriseSearch } from "@/lib/search/enterprise";
import type {
  EnterpriseLocation,
  EnterpriseSearchResult,
} from "@/lib/search/enterprise/types";
import type { UserSearchLocation } from "@/lib/search/enterprise/markets";
import { runAnchoredNearbySearch } from "@/lib/search/enterprise/anchoredNearby";
import { filterAnchoredRestaurantResults } from "@/lib/search/enterprise/anchoredRestaurantEligibility";
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

type AnchoredResultWithCards = EnterpriseSearchResult & {
  cards?: EnterpriseLocation[];
};

function finalizeAnchoredResult(
  result: EnterpriseSearchResult,
  query: string,
  displayLimit: number,
): EnterpriseSearchResult {
  const anchored = result as AnchoredResultWithCards;

  if (anchored.restaurants.length > 0) {
    const filtered = filterAnchoredRestaurantResults(
      anchored.restaurants,
      query,
      displayLimit,
    );

    anchored.restaurants = filtered.results;
    anchored.cards = filtered.results;
    anchored.success = filtered.results.length > 0;
    anchored.card_counts.restaurants = filtered.results.length;

    if (anchored.cardCounts) {
      anchored.cardCounts.restaurants = filtered.results.length;
    }

    anchored.debug = {
      ...(anchored.debug ?? {}),
      excludedBakeryOnlyCount: filtered.excludedBakeryOnlyCount,
      finalDisplayedResultCount: filtered.results.length,
    };

    return anchored;
  }

  if (anchored.activities.length > displayLimit) {
    anchored.activities = anchored.activities.slice(0, displayLimit);
    anchored.cards = anchored.activities;
    anchored.card_counts.activities = anchored.activities.length;
  }

  return anchored;
}

/** Canonical app-side public outing search orchestration. */
export async function runOutingSearch(
  input: RunOutingSearchInput,
): Promise<EnterpriseSearchResult> {
  const query = String(input.query || "").trim();
  if (!query) throw new Error("Search query is required.");

  const body = {
    ...(input.body ?? {}),
    ...(input.filters ? { filters: input.filters } : {}),
    query,
    input: query,
    message: query,
  };

  const displayLimit = Math.max(1, input.displayLimit ?? 12);
  const anchored = await runAnchoredNearbySearch({
    query,
    supabase: input.supabase ?? supabaseAdmin,
    // Pull extra nearby candidates so eligibility filtering can remove bakery-only
    // rows without shrinking the final restaurant result set.
    displayLimit: Math.max(displayLimit * 2, 24),
  });

  if (anchored) {
    return finalizeAnchoredResult(anchored, query, displayLimit);
  }

  return runEnterpriseSearch(query, {
    ...input,
    body,
    userLocation: input.userLocation ?? null,
    selectedMarketId:
      input.market ??
      input.body?.selectedMarketId ??
      input.body?.selected_market_id ??
      null,
    source: input.source ?? "public_outing_search",
    route: input.route ?? null,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
  });
}
