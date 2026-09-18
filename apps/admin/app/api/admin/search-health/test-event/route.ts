import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;
  const now = new Date().toISOString();
  const { error } = await getAdminDatabaseClient().from("search_health_events").insert({
    created_at: now,
    source: "admin_test_event",
    environment: process.env.NODE_ENV || "production",
    raw_query: "TEST search health event",
    event_type: "admin_test_event",
    severity: "info",
    event_label: "Manual Search Health test event",
    restaurant_count: 0,
    activity_count: 0,
    pair_count: 0,
    pair_candidates_evaluated: 0,
    valid_pair_count_before_render: 0,
    no_results_reason: "admin_test_event",
    no_pairs_reason: "admin_test_event",
    warnings: ["Manually inserted admin Search Health test event"],
    timing_ms: 1,
    speed_status: "test",
    review_status: "new",
    created_by_user_id: auth.adminUser?.user_id ?? null,
    debug: { test: true, createdBy: "isolated_admin_test_event_endpoint" },
  });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
