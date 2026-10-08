import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { SEARCH_V3_LANES } from "@/lib/search/v3/controls/searchV3Controls";

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const laneId = String(body.laneId ?? "").trim();
  if (!SEARCH_V3_LANES.some(lane => lane.id === laneId)) {
    return NextResponse.json({ error: "Invalid Search V3 lane" }, { status: 400 });
  }
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 8) {
    return NextResponse.json({ error: "An audit reason with 8+ characters is required" }, { status: 400 });
  }
  const db = getAdminDatabaseClient();
  // Refuse privileged changes unless the audit record is durable.
  const { error: auditError } = await db.from("admin_audit_logs").insert({
    actor_user_id: auth.adminUser!.user_id,
    action: "search_v3_breaker.reset_requested",
    entity_type: "search_v3_lane_breaker",
    entity_id: laneId,
    summary: reason,
    metadata: { requestedAt: new Date().toISOString(), laneId },
  });
  if (auditError) {
    return NextResponse.json({ error: "Audit logging unavailable: breaker reset blocked" }, { status: 503 });
  }
  const { error } = await db.rpc("search_v3_breaker_reset", { p_lane: laneId });
  if (error) {
    return NextResponse.json({ error: "Shared breaker reset failed; check migration and service permissions." }, { status: 503 });
  }
  return NextResponse.json({ success: true, laneId });
}
