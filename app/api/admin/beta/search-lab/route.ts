import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runOutingSearch } from "@/lib/search/runSearch";
import type { SearchCoreOverride } from "@/lib/search/searchCoreConfig";
const modes = new Set<SearchCoreOverride>(["legacy", "v2", "compare"]);
export async function POST(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const query = String(body.query ?? body.rawQuery ?? "").trim();
  const override = String(
    body.searchCoreOverride ?? "legacy",
  ) as SearchCoreOverride;
  if (!query)
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  if (!modes.has(override))
    return NextResponse.json(
      { error: "Invalid Search Core override." },
      { status: 400 },
    );
  const common = {
    query,
    body: {
      ...body,
      searchCoreOverride: undefined,
      requestId: crypto.randomUUID(),
    },
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
    const [legacy, v2] = await Promise.all([
      runOutingSearch({ ...common, searchCoreOverride: "legacy" }),
      runOutingSearch({
        ...common,
        body: { ...common.body, requestId: crypto.randomUUID() },
        searchCoreOverride: "v2",
      }),
    ]);
    return NextResponse.json({
      success: true,
      searchCoreOverride: "compare",
      comparisonMode: true,
      legacy,
      v2,
    });
  }
  const result = await runOutingSearch({
    ...common,
    searchCoreOverride: override,
  });
  return NextResponse.json({
    ...result,
    searchCoreOverride: override,
    searchLabRequest: true,
  });
}
