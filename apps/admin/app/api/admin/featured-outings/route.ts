import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const FEATURED_OUTING_FIELDS = "id,title,placement,priority,is_active,created_at,updated_at";

export async function GET(request: NextRequest) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingEdit);
  if (error) return error;
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 120);
  let query = supabaseAdmin.from("featured_outings").select(FEATURED_OUTING_FIELDS).order("priority", { ascending: true }).limit(100);
  if (q) query = query.ilike("title", `%${q.replace(/[%_,]/g, "")}%`);
  const { data, error: qErr } = await query;
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingEdit);
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const { data, error: cErr } = await supabaseAdmin.from("featured_outings").insert(body).select(FEATURED_OUTING_FIELDS).maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingEdit);
  if (error) return error;
  const body = await request.json();
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { id: _id, ...changes } = body;
  const { data, error: uErr } = await supabaseAdmin.from("featured_outings").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id).select(FEATURED_OUTING_FIELDS).maybeSingle();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
