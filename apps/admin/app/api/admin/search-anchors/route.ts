import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeAnchorText } from "@/lib/search/anchors/normalize";
import { SEARCH_ANCHOR_DETAIL_FIELDS, SEARCH_ANCHOR_LIST_FIELDS, sanitizeSearchAnchorPayload } from "@/lib/admin/search-security-projections";

export const dynamic = "force-dynamic";
const roles = ["superadmin", "admin", "manager"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdminApiRole(roles); if (auth.error) return auth.error;
  const url = new URL(req.url); const page = Math.max(1, Number(url.searchParams.get("page") || 1)); const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 25))); const from = (page - 1) * limit;
  let q = supabaseAdmin.from("search_anchors").select(SEARCH_ANCHOR_LIST_FIELDS, { count: "exact" }).order("priority", { ascending: false }).order("canonical_name").range(from, from + limit - 1);
  for (const key of ["anchor_type","market","borough","county","source_type","review_status"]) { const value = url.searchParams.get(key); if (value) q = q.eq(key, value); }
  const active = url.searchParams.get("is_active"); if (active === "true" || active === "false") q = q.eq("is_active", active === "true");
  const search = url.searchParams.get("q"); if (search) q = q.or(`canonical_name.ilike.%${search.replace(/[%,]/g," ")}%,normalized_name.ilike.%${normalizeAnchorText(search)}%`);
  const { data, count, error } = await q; if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  const { count: activeCount } = await supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).eq("is_active", true);
  return NextResponse.json({ success: true, anchors: data ?? [], pagination: { page, limit, total: count ?? 0 }, summary: { active: activeCount ?? 0 } });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApiRole(roles); if (auth.error) return auth.error;
  const payload = sanitizeSearchAnchorPayload(await req.json().catch(() => ({})));
  if (typeof payload.canonical_name === "string") payload.normalized_name = normalizeAnchorText(payload.canonical_name);
  if (!payload.canonical_name || !payload.anchor_type || payload.latitude == null || payload.longitude == null) return NextResponse.json({ success: false, error: "Missing required anchor fields" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("search_anchors").insert(payload).select(SEARCH_ANCHOR_DETAIL_FIELDS).single(); if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, anchor: data });
}
