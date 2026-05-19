import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminApiRole(["superuser", "admin", "editor", "viewer"]);
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error: qErr } = await supabaseAdmin.from("business_crm_notes").select("*").eq("location_id", id).order("created_at", { ascending: false });
  if (qErr) return NextResponse.json({ notes: [], warning: qErr.message });
  return NextResponse.json({ notes: data || [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminApiRole(["superuser", "admin", "editor"]);
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { data, error: iErr } = await supabaseAdmin.from("business_crm_notes").insert({ location_id: id, note: String(body.note || ""), note_type: body.note_type || "general" }).select("*").maybeSingle();
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
