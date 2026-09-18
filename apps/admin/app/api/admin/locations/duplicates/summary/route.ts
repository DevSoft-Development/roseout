import { NextResponse } from "next/server";
import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { LOCATION_READ_ROLES } from "@/lib/crm/location-health-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function count(status: string, minScore?: number, reason?: string) {
  let q = getAdminDatabaseClient().from("location_duplicate_review").select("id", { count: "exact", head: true }).eq("status", status);
  if (minScore) q = q.gte("duplicate_score", minScore);
  if (reason) q = q.contains("match_reasons", [reason]);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function GET() {
  const admin = await getCurrentAdminOrNull();
  if (!admin) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  if (!LOCATION_READ_ROLES.includes(admin.role as (typeof LOCATION_READ_ROLES)[number])) {
    return NextResponse.json({ success: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const [pending, highConfidencePending, bothSearchablePending, merged, ignored, notDuplicate] = await Promise.all([
      count("pending"),
      count("pending", 95),
      count("pending", undefined, "both_searchable"),
      count("merged"),
      count("ignored"),
      count("not_duplicate"),
    ]);
    return NextResponse.json({ success: true, pending, highConfidencePending, bothSearchablePending, merged, ignored, notDuplicate });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load duplicate summary" }, { status: 500 });
  }
}
