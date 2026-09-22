import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CONTENT_TEST_FIELDS = "id,application_id,prompt,submission_text,submission_url,score,review_notes,status,created_at,updated_at";
const ALLOWED_EDIT_FIELDS = new Set(["prompt","submission_text","submission_url","score","review_notes","status"]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { id } = await params;
    const { data } = await supabaseAdmin.from("career_content_tests").select(CONTENT_TEST_FIELDS).eq("id", id).maybeSingle();
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
    if (typeof patch.prompt === "string") patch.prompt = patch.prompt.trim().slice(0, 4000);
    if (typeof patch.submission_text === "string") patch.submission_text = patch.submission_text.trim().slice(0, 12000);
    if (typeof patch.review_notes === "string") patch.review_notes = patch.review_notes.trim().slice(0, 4000);
    const { data, error } = await supabaseAdmin.from("career_content_tests").update(patch).eq("id", id).select(CONTENT_TEST_FIELDS).single();
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
    await supabaseAdmin.from("career_content_tests").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "We could not archive this careers record." }, { status: 500 });
  }
}
