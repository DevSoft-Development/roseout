import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runOutingSearch } from "@/lib/search/runSearch";
import type { SearchCoreOverride } from "@/lib/search/searchCoreConfig";

const modes = new Set<SearchCoreOverride>(["legacy", "v2", "compare"]);
const safeCodes = new Set([
  "SEARCH_V2_RETRIEVAL_FAILED",
  "SEARCH_V2_PLANNER_FAILED",
  "SEARCH_V2_VALIDATION_FAILED",
  "SEARCH_LAB_AUTH_FAILED",
  "SEARCH_LAB_COMPARE_FAILED",
]);

export type SafeSearchError = { error: string; code: string; requestId: string };

function safeError(error: unknown, requestId: string): SafeSearchError {
  const message = error instanceof Error ? error.message : String(error);
  const candidate = message.match(/\b[A-Z][A-Z0-9_]+_FAILED\b/)?.[0];
  const code = candidate && safeCodes.has(candidate) ? candidate : "SEARCH_LAB_COMPARE_FAILED";
  const safeMessage: Record<string, string> = {
    SEARCH_V2_RETRIEVAL_FAILED: "Search Core V2 could not retrieve locations.",
    SEARCH_V2_PLANNER_FAILED: "Search Core V2 could not plan this search.",
    SEARCH_V2_VALIDATION_FAILED: "Search Core V2 could not validate its results.",
    SEARCH_LAB_AUTH_FAILED: "Search Lab authorization failed.",
    SEARCH_LAB_COMPARE_FAILED: "Search Lab could not complete this search.",
  };
  return { error: safeMessage[code], code, requestId };
}

function normalizeSearchLabResult(result: any, engine: "legacy" | "v2") {
  if (engine !== "v2" || !result || typeof result !== "object") return result;
  const v2 = result.searchV2 ?? result;
  const canonical = v2.counts ?? result.debug?.canonicalCounts ?? {};
  const restaurantCards = Array.isArray(result.restaurants) ? result.restaurants : [];
  const activityCards = Array.isArray(result.activities) ? result.activities : [];
  const rawPairs = Array.isArray(result.pairs) ? result.pairs : [];
  const pairCards = rawPairs.map((pair: any) => ({
    ...pair,
    distance_miles: pair.distance_miles ?? pair.distanceMiles ?? null,
    walking_minutes: pair.walking_minutes ?? pair.walkingMinutes ?? null,
    walking_time: pair.walking_time ?? (pair.walkingMinutes != null ? `${pair.walkingMinutes} min` : null),
  }));
  const matchedCards = Array.isArray(result.matched_locations)
    ? result.matched_locations
    : Array.isArray(result.matchedLocations)
      ? result.matchedLocations
      : [];
  const cards = Array.isArray(result.cards)
    ? result.cards
    : [...matchedCards, ...restaurantCards, ...activityCards];
  const plan = v2.searchPlan ?? result.debug?.searchPlan ?? result.searchPlan ?? null;
  const firstLocation = restaurantCards[0] ?? activityCards[0] ?? pairCards[0]?.restaurant ?? pairCards[0]?.activity ?? null;
  const market = plan?.geo?.market ?? result.market ?? firstLocation?.market ?? (plan?.geo?.borough || plan?.geo?.city ? "NYC" : "NYC_LONG_ISLAND");
  const requestedMode = v2.requestedMode ?? result.search_type ?? null;
  const primaryDomain = requestedMode === "activity_only"
    ? "activity"
    : requestedMode === "restaurant_only" || requestedMode === "anchored_nearby"
      ? "restaurant"
      : requestedMode
        ? "paired"
        : null;

  return {
    ...result,
    restaurants: Number(canonical.restaurantCards ?? restaurantCards.length),
    activities: Number(canonical.activityCards ?? activityCards.length),
    pairs: Number(canonical.pairs ?? pairCards.length),
    restaurantCards,
    activityCards,
    pairCards,
    cards,
    result_count: Number(canonical.displayedResults ?? cards.length + pairCards.length),
    restaurant_count: Number(canonical.restaurantCards ?? restaurantCards.length),
    activity_count: Number(canonical.activityCards ?? activityCards.length),
    pair_count: Number(canonical.pairs ?? pairCards.length),
    search_type: requestedMode,
    searchType: requestedMode,
    primary_domain: primaryDomain,
    primaryDomain,
    market,
    parsedIntent: {
      ...(result.parsedIntent ?? {}),
      searchType: requestedMode,
      primaryDomain,
      needsRestaurant: Boolean(plan?.restaurant?.required),
      needsActivity: Boolean(plan?.activity?.required),
      wantsPairing: Boolean(plan?.pairing?.required),
      geo: plan?.geo ?? null,
    },
    marketFiltering: {
      ...(result.marketFiltering ?? {}),
      resolvedMarket: market,
    },
    debug: {
      ...(result.debug ?? {}),
      canonicalCounts: canonical,
      searchPlan: plan,
    },
  };
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const body = await request.json().catch(() => ({}));
  const query = String(body.query ?? body.rawQuery ?? "").trim();
  const override = String(body.searchCoreOverride ?? "legacy") as SearchCoreOverride;
  let auth;
  try {
    auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  } catch (error) {
    console.error("[search-lab] authorization failed", { requestId, error });
    return NextResponse.json({ success: false, error: "Search Lab authorization failed.", code: "SEARCH_LAB_AUTH_FAILED", searchCoreOverride: modes.has(override) ? override : "legacy", requestId }, { status: 401 });
  }
  if (auth.error) {
    console.error("[search-lab] authorization denied", { requestId });
    return NextResponse.json({ success: false, error: "Search Lab authorization failed.", code: "SEARCH_LAB_AUTH_FAILED", searchCoreOverride: modes.has(override) ? override : "legacy", requestId }, { status: auth.error.status || 403 });
  }
  if (!query) return NextResponse.json({ error: "Query is required." }, { status: 400 });
  if (!modes.has(override)) return NextResponse.json({ error: "Invalid Search Core override." }, { status: 400 });

  const common = {
    query,
    body: { ...body, searchCoreOverride: undefined, requestId },
    source: "admin_search_lab",
    route: "/api/admin/beta/search-lab",
    userId: auth.adminUser!.user_id,
    isAdmin: true,
    authorizedSearchCoreOverride: true,
    suppressSearchCoreShadow: true,
    betaDebug: true,
    searchHealthDebug: true,
  };

  if (override === "compare") {
    const execute = async (engine: "legacy" | "v2") => {
      try {
        const result = await runOutingSearch({ ...common, body: { ...common.body, requestId: `${requestId}:${engine}` }, searchCoreOverride: engine });
        return { ok: true as const, result: normalizeSearchLabResult(result, engine) };
      } catch (error) {
        console.error("[search-lab] engine failed", { requestId, engine, error });
        return { ok: false as const, error: safeError(error, requestId) };
      }
    };
    const [legacy, v2] = await Promise.all([execute("legacy"), execute("v2")]);
    return NextResponse.json({ success: legacy.ok || v2.ok, searchCoreOverride: "compare", requestId, comparisonMode: true, legacy, v2 });
  }

  try {
    const result = await runOutingSearch({ ...common, searchCoreOverride: override });
    return NextResponse.json({ ...normalizeSearchLabResult(result, override), searchCoreOverride: override, requestId, searchLabRequest: true });
  } catch (error) {
    console.error("[search-lab] search failed", { requestId, engine: override, error });
    return NextResponse.json({ success: false, ...safeError(error, requestId), searchCoreOverride: override }, { status: 500 });
  }
}
