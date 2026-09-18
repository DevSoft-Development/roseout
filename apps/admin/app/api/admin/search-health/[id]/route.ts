import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

const REVIEW_STATUSES = new Set(["new", "reviewing", "fixed", "ignored", "archived"]);
const SEARCH_HEALTH_DETAIL_FIELDS = [
  "id","created_at","source","environment","raw_query","normalized_search_type","primary_domain",
  "default_market_applied","default_market_id","distance_mode","max_pair_distance_miles","max_pair_walking_minutes",
  "restaurant_count","activity_count","pair_count","pair_candidates_evaluated","valid_pair_count_before_render",
  "no_results_reason","no_pairs_reason","errors","warnings","debug","timing_ms","speed_status","review_status",
  "review_notes","reviewed_at","event_type","severity","event_label","required_pairing_suppressed_fallback",
  "required_pairing_failure_reason",
].join(",");

function safeDebug(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const allowed = ["search_id","request_id","route","mode","decisions","canonicalCounts","wrongDomainCount","geographyLeakageCount","failure_class"];
  const out: Record<string, unknown> = {};
  for (const key of allowed) if (key in source) out[key] = source[key];
  return out;
}

function responseRow(data: Record<string, any>) {
  return { ...data, debug: safeDebug(data.debug) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "experience_team"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  const { data, error } = await getAdminDatabaseClient()
    .from("search_health_events")
    .select(SEARCH_HEALTH_DETAIL_FIELDS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("ADMIN_SEARCH_HEALTH_DETAIL_ERROR", error);
    return NextResponse.json({ success: false, error: "Failed to load search health event" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const row = responseRow(data);
  return NextResponse.json({ success: true, row, debug: row.debug });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "experience_team"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (typeof body.review_status === "string") {
      if (!REVIEW_STATUSES.has(body.review_status)) {
        return NextResponse.json({ success: false, error: "Invalid review_status" }, { status: 400 });
      }
      updates.review_status = body.review_status;
      updates.reviewed_by = auth.adminUser?.user_id ?? null;
      updates.reviewed_at = new Date().toISOString();
    }

    if (typeof body.review_notes === "string") updates.review_notes = body.review_notes.trim().slice(0, 2000);
    if (!Object.keys(updates).length) return NextResponse.json({ success: false, error: "No allowed updates" }, { status: 400 });

    const { data, error } = await getAdminDatabaseClient()
      .from("search_health_events")
      .update(updates)
      .eq("id", id)
      .select(SEARCH_HEALTH_DETAIL_FIELDS)
      .single();

    if (error) throw error;
    const row = responseRow(data);
    return NextResponse.json({ success: true, row, debug: row.debug });
  } catch (error) {
    console.error("ADMIN_SEARCH_HEALTH_PATCH_ERROR", error);
    return NextResponse.json({ success: false, error: "Failed to update search health event" }, { status: 500 });
  }
}
