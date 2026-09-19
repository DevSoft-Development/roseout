import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TALENT_POOL_FIELDS = "id,application_id,candidate_name,email,tags,owner_id,notes,status,last_contacted_at,created_at,updated_at";
const ALLOWED_EDIT_FIELDS = new Set(["candidate_name","email","tags","owner_id","notes","status","last_contacted_at"]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { id } = await params;
    const { data } = await supabaseAdmin.from("career_talent_pool").select(TALENT_POOL_FIELDS).eq("id", id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: "We could not load this careers record." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(body)) if (ALLOWED_EDIT_FIELDS.has(key)) patch[key] = value;
    if (typeof patch.candidate_name === "string") patch.candidate_name = patch.candidate_name.trim().slice(0, 200);
    if (typeof patch.email === "string") patch.email = patch.email.trim().toLowerCase().slice(0, 320);
    if (typeof patch.notes === "string") patch.notes = patch.notes.trim().slice(0, 4000);
    const { data, error } = await supabaseAdmin.from("career_talent_pool").update(patch).eq("id", id).select(TALENT_POOL_FIELDS).single();
    if (error) return NextResponse.json({ error: "We could not update this careers record." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: "We could not update this careers record." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const { id } = await params;
    await supabaseAdmin.from("career_talent_pool").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "We could not archive this careers record." }, { status: 500 });
  }
}
