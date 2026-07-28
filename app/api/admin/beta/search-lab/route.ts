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
    return NextResponse.json(
      {
        success: false,
        error: "Search Lab authorization failed.",
        code: "SEARCH_LAB_AUTH_FAILED",
        searchCoreOverride: modes.has(override) ? override : "legacy",
        requestId,
      },
      { status: 401 },
    );
  }
  if (auth.error) {
    console.error("[search-lab] authorization denied", { requestId });
    return NextResponse.json(
      {
        success: false,
        error: "Search Lab authorization failed.",
        code: "SEARCH_LAB_AUTH_FAILED",
        searchCoreOverride: modes.has(override) ? override : "legacy",
        requestId,
      },
      { status: auth.error.status || 403 },
    );
  }
  if (!query) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  }
  if (!modes.has(override)) {
    return NextResponse.json(
      { error: "Invalid Search Core override." },
      { status: 400 },
    );
  }
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
        const result = await runOutingSearch({
          ...common,
          body: { ...common.body, requestId: `${requestId}:${engine}` },
          searchCoreOverride: engine,
        });
        return { ok: true as const, result };
      } catch (error) {
        console.error("[search-lab] engine failed", { requestId, engine, error });
        return { ok: false as const, error: safeError(error, requestId) };
      }
    };
    const [legacy, v2] = await Promise.all([execute("legacy"), execute("v2")]);
    return NextResponse.json({
      success: legacy.ok || v2.ok,
      searchCoreOverride: "compare",
      requestId,
      comparisonMode: true,
      legacy,
      v2,
    });
  }

  try {
    const result = await runOutingSearch({ ...common, searchCoreOverride: override });
    return NextResponse.json({
      ...result,
      searchCoreOverride: override,
      requestId,
      searchLabRequest: true,
    });
  } catch (error) {
    console.error("[search-lab] search failed", { requestId, engine: override, error });
    return NextResponse.json(
      { success: false, ...safeError(error, requestId), searchCoreOverride: override },
      { status: 500 },
    );
  }
}
