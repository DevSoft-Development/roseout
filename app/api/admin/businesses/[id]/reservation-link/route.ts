import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminApiRole(["superadmin", "admin", "editor"]);
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { data, error: uErr } = await supabaseAdmin.from("locations").update({ reservation_link: body.reservation_link ?? null, reservation_link_found: body.reservation_link_found ?? null }).eq("id", id).select("id,reservation_link,reservation_link_found").maybeSingle();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  return NextResponse.json({ location: data });
}

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminApiRole(["superadmin", "admin", "editor"]);
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await supabaseAdmin.from("locations").update({ reservation_link_checked_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ success: true, message: "Discovery queued placeholder", id });
}
