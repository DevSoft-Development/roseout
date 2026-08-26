import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { SEARCH_RELEASE_GATE_BATCHES, SEARCH_RELEASE_GATE_QUERIES } from "@/lib/search/quality/releaseGateQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  return NextResponse.json({
    ok: true,
    suite: "search-release-gate-v1",
    queryCount: SEARCH_RELEASE_GATE_QUERIES.length,
    batchSize: 50,
    batchCount: SEARCH_RELEASE_GATE_BATCHES.length,
    batches: SEARCH_RELEASE_GATE_BATCHES.map((queries, index) => ({
      batch: index + 1,
      queries,
    })),
  });
}
