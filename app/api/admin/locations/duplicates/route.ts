import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCATION_FIELDS = "id,name,restaurant_name,activity_name,location_type,primary_category,cuisine,cuisine_type,activity_type,address,city,state,market,is_searchable,duplicate_status,quality_score,review_count,rating,main_image,image_url,created_at,updated_at";
const REVIEW_FIELDS = "id,location_a_id,location_b_id,suggested_master_id,duplicate_score,match_reasons,status,decision_reason,decided_at,created_at,updated_at";

async function authorize() {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locations);
  return error;
}

function bounded(value: string | number | null | undefined, fallback: number, max: number, min = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : fallback;
}

async function attachLocations(rows: any[]) {
  const ids = [...new Set(rows.flatMap((r) => [r.location_a_id, r.location_b_id]).filter(Boolean))];
  const { data, error } = ids.length
    ? await supabaseAdmin.from("locations").select(LOCATION_FIELDS).in("id", ids)
    : ({ data: [], error: null } as any);
  if (error) throw new Error(error.message);
  const byId = new Map((data || []).map((l: any) => [l.id, l]));
  return rows.map((r) => ({ ...r, locationA: byId.get(r.location_a_id) || null, locationB: byId.get(r.location_b_id) || null }));
}

async function findLocationIds(q: string) {
  const term = `%${q.replaceAll("%", "").replaceAll("_", "")}%`;
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id")
    .or(`name.ilike.${term},restaurant_name.ilike.${term},activity_name.ilike.${term},address.ilike.${term},city.ilike.${term}`)
    .limit(200);
  if (error) throw new Error(error.message);
  return (data || []).map((row: { id: string }) => row.id);
}

export async function GET(request: NextRequest) {
  const auth = await authorize();
  if (auth) return auth;
  try {
    const params = request.nextUrl.searchParams;
    const status = params.get("status") || "pending";
    const limit = bounded(params.get("limit"), 25, 100, 1);
    const page = bounded(params.get("page"), 1, 100000, 1);
    const offset = params.has("offset") ? bounded(params.get("offset"), 0, 100000) : (page - 1) * limit;
    const minScore = bounded(params.get("minScore"), 0, 100, 0);
    const q = params.get("q")?.trim();

    let query = supabaseAdmin
      .from("location_duplicate_review")
      .select(REVIEW_FIELDS, { count: "exact" })
      .eq("status", status)
      .gte("duplicate_score", minScore)
      .order("duplicate_score", { ascending: false })
      .order("created_at", { ascending: false });

    if (q) {
      const ids = await findLocationIds(q);
      if (ids.length === 0) return NextResponse.json({ success: true, rows: [], total: 0, hasMore: false, page, limit, offset });
      query = query.or(`location_a_id.in.(${ids.join(",")}),location_b_id.in.(${ids.join(",")})`).limit(Math.min(limit, 100));
    } else {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    const rows = await attachLocations(data || []);
    return NextResponse.json({ success: true, rows, total: count || 0, hasMore: offset + rows.length < (count || 0), page, limit, offset });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load duplicate review rows" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if (auth) return auth;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "scan") {
      const limit = bounded(body.limit, 500, 2000, 1);
      const { data: found, error: findError } = await supabaseAdmin.rpc("oh_find_live_location_duplicates", { p_limit: limit });
      if (findError) throw new Error(findError.message);
      return NextResponse.json({ success: true, summary: found });
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
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message.includes("timeout") ? "Scan was too large or timed out. Try a smaller batch. Existing review rows are still available." : message }, { status: 500 });
  }
}
