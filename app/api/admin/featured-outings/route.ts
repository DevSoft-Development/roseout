import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { error } = await requireAdminApiRole(["superadmin", "admin", "editor", "viewer"]);
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q")?.trim();
  let query = supabaseAdmin.from("featured_outings").select("*").order("priority", { ascending: true }).limit(100);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error: qErr } = await query;
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdminApiRole(["superadmin", "admin", "editor"]);
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { data, error: cErr } = await supabaseAdmin.from("featured_outings").insert(body).select("*").maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireAdminApiRole(["superadmin", "admin", "editor"]);
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const id = body.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error: uErr } = await supabaseAdmin.from("featured_outings").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id).select("*").maybeSingle();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
