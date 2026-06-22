import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCATION_FIELDS = "id,name,restaurant_name,activity_name,location_type,primary_category,cuisine,cuisine_type,activity_type,address,city,state,market,is_searchable,duplicate_status,quality_score,review_count,rating,main_image,image_url,created_at,updated_at";

async function authorize() {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locations);
  return error;
}
function bounded(value: string | null, fallback: number, max: number) {
  const n = Number(value || fallback);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), max) : fallback;
}
async function attachLocations(rows: any[]) {
  const ids = [...new Set(rows.flatMap((r) => [r.location_a_id, r.location_b_id]).filter(Boolean))];
  const { data, error } = ids.length ? await supabaseAdmin.from("locations").select(LOCATION_FIELDS).in("id", ids) : { data: [], error: null } as any;
  if (error) throw new Error(error.message);
  const byId = new Map((data || []).map((l: any) => [l.id, l]));
  return rows.map((r) => ({ ...r, locationA: byId.get(r.location_a_id) || null, locationB: byId.get(r.location_b_id) || null }));
}

export async function GET(request: NextRequest) {
  const auth = await authorize();
  if (auth) return auth;
  try {
    const params = request.nextUrl.searchParams;
    const status = params.get("status") || "pending";
    const limit = bounded(params.get("limit"), 50, 200);
    const offset = bounded(params.get("offset"), 0, 100000);
    const minScore = Number(params.get("minScore") || 0);
    const q = params.get("q")?.trim().toLowerCase();

    let query = supabaseAdmin.from("location_duplicate_review").select("*").eq("status", status).gte("duplicate_score", minScore).order("duplicate_score", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    let rows = await attachLocations(data || []);
    if (q) rows = rows.filter((r: any) => [r.locationA, r.locationB].some((l: any) => [l?.name, l?.restaurant_name, l?.activity_name, l?.address, l?.city].some((v) => String(v || "").toLowerCase().includes(q))));
    return NextResponse.json({ success: true, rows, limit, offset });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if (auth) return auth;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "scan") {
      const { data: refreshed, error: refreshError } = await supabaseAdmin.rpc("oh_refresh_location_identity");
      if (refreshError) throw new Error(refreshError.message);
      const { data: found, error: findError } = await supabaseAdmin.rpc("oh_find_live_location_duplicates", { p_limit: bounded(String(body.limit || 500), 500, 5000) });
      if (findError) throw new Error(findError.message);
      return NextResponse.json({ success: true, refreshed, found });
    }
    if (body.action === "merge") {
      const { data, error } = await supabaseAdmin.rpc("oh_merge_live_location_duplicate", { p_master_id: body.masterId, p_duplicate_id: body.duplicateId, p_reason: body.reason || "admin_merge" });
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, result: data });
    }
    if (body.action === "ignore" || body.action === "not_duplicate") {
      const { data, error } = await supabaseAdmin.rpc("oh_ignore_live_location_duplicate", { p_location_a_id: body.locationAId, p_location_b_id: body.locationBId, p_status: body.action === "ignore" ? "ignored" : "not_duplicate", p_reason: body.reason || null });
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, result: data });
    }
    return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
