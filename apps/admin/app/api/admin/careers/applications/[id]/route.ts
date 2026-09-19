import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CAREER_APPLICATION_FIELDS = "id,job_id,user_id,first_name,last_name,email,phone,city,state,linkedin_url,portfolio_url,website_url,social_handle,resume_url,cover_letter,status,stage,score,source,assigned_to,last_contacted_at,submitted_at,created_at,updated_at" as const;
const ALLOWED_EDIT_FIELDS = new Set([
  "job_id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "city",
  "state",
  "linkedin_url",
  "portfolio_url",
  "website_url",
  "social_handle",
  "resume_url",
  "cover_letter",
  "status",
  "stage",
  "score",
  "source",
  "assigned_to",
  "last_contacted_at",
]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("career_applications")
      .select(CAREER_APPLICATION_FIELDS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
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
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_EDIT_FIELDS.has(key)) continue;
      if (key === "score") {
        patch.score = value === "" || value == null ? null : Number(value);
      } else if (typeof value === "string") {
        patch[key] = value.trim() || null;
      } else {
        patch[key] = value;
      }
    }
    if (Object.keys(patch).length === 1) return NextResponse.json({ error: "No editable fields were provided." }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from("career_applications")
      .update(patch)
      .eq("id", id)
      .select(CAREER_APPLICATION_FIELDS)
      .single();
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
    const { error } = await supabaseAdmin.from("career_applications").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "We could not archive this careers record." }, { status: 500 });
  }
}
