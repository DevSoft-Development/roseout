import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { logSearchHealthEvent } from "@/lib/search/enterprise/searchHealthLogger";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  const result = await logSearchHealthEvent({
    source: "admin_test_event",
    environment: process.env.NODE_ENV || "production",
    rawQuery: "TEST search health event",
    result: {
      restaurants: [],
      activities: [],
      pairs: [],
      render_mode: "test",
    },
    debug: {
      test: true,
      createdBy: "admin_test_event_endpoint",
      normalizedIntent: {
        searchType: "test",
        primaryDomain: "test",
        needsRestaurant: false,
        needsActivity: false,
        wantsPairing: false,
      },
      defaultMarketApplied: false,
      defaultMarketId: null,
      pairCandidatesEvaluated: 0,
      validPairCountBeforeRender: 0,
    },
    restaurant_count: 0,
    activity_count: 0,
    pair_count: 0,
    pairCandidatesEvaluated: 0,
    validPairCountBeforeRender: 0,
    noResultsReason: "admin_test_event",
    noPairsReason: "admin_test_event",
    errors: [],
    warnings: ["Manually inserted admin Search Health test event"],
    timingMs: 1,
    speedStatus: "test",
    forceLog: true,
    createdByUserId: auth.adminUser?.user_id ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: "Failed to insert test event" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
