import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeAnchorText } from "@/lib/search/anchors/normalize";

export const dynamic = "force-dynamic";
const roles = ["superadmin", "admin", "manager"] as const;
const writable = ["canonical_name","aliases","anchor_type","source_type","city","state","borough","neighborhood","county","market","latitude","longitude","default_radius_miles","max_radius_miles","radius_strategy","google_place_id","external_id","linked_location_id","priority","confidence","is_active","is_searchable","review_status","metadata"];
function body(input: any) { const out: any = {}; for (const key of writable) if (key in (input ?? {})) out[key] = input[key]; if (out.canonical_name) out.normalized_name = normalizeAnchorText(out.canonical_name); return out; }

export async function GET(req: NextRequest) {
  const auth = await requireAdminApiRole(roles); if (auth.error) return auth.error;
  const url = new URL(req.url); const page = Math.max(1, Number(url.searchParams.get("page") || 1)); const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 25))); const from = (page - 1) * limit;
  let q = supabaseAdmin.from("search_anchors").select("*", { count: "exact" }).order("priority", { ascending: false }).order("canonical_name").range(from, from + limit - 1);
  for (const key of ["anchor_type","market","borough","county","source_type","review_status"]) { const value = url.searchParams.get(key); if (value) q = q.eq(key, value); }
  const active = url.searchParams.get("is_active"); if (active === "true" || active === "false") q = q.eq("is_active", active === "true");
  const search = url.searchParams.get("q"); if (search) q = q.or(`canonical_name.ilike.%${search.replace(/[%,]/g," ")}%,normalized_name.ilike.%${normalizeAnchorText(search)}%`);
  const { data, count, error } = await q; if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  const { count: activeCount } = await supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).eq("is_active", true);
  return NextResponse.json({ success: true, anchors: data ?? [], pagination: { page, limit, total: count ?? 0 }, summary: { active: activeCount ?? 0 } });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApiRole(roles); if (auth.error) return auth.error;
  const payload = body(await req.json().catch(() => ({}))); if (!payload.canonical_name || !payload.anchor_type || !payload.latitude || !payload.longitude) return NextResponse.json({ success: false, error: "Missing required anchor fields" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("search_anchors").insert(payload).select("*").single(); if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, anchor: data });
}
