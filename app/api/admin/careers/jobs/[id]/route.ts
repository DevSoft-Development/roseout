import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const editableFields = new Set(["title","slug","department","subdepartment","role_track","location","workplace_type","employment_type","compensation_type","compensation_min","compensation_max","compensation_text","summary","overview","responsibilities","requirements","nice_to_have","benefits","schedule","hiring_process","status","visibility","is_internship","internship_type","is_paid","supports_college_credit","requires_school_credit","weekly_hours_min","weekly_hours_max","program_duration_weeks","learning_objectives","compliance_status","compliance_notes"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function buildPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) if (editableFields.has(key)) patch[key] = value;
  if (typeof patch.title === "string" && !patch.title.trim()) return { error: "A role title is required." };
  if (typeof patch.slug === "string" && !slugPattern.test(patch.slug)) return { error: "Use a lowercase slug with letters, numbers, and hyphens only." };
  if (typeof patch.title === "string") patch.title = patch.title.trim();
  if (typeof patch.slug === "string") patch.slug = patch.slug.trim();
  patch.updated_at = new Date().toISOString();
  return { patch };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { id } = await params;
    const { data, error } = await supabaseAdmin.from("career_jobs").select("*").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: "We could not load this job posting." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Job posting not found." }, { status: 404 });
    return NextResponse.json({ record: data });
  } catch { return NextResponse.json({ error: "We could not load this job posting." }, { status: 500 }); }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = buildPatch(body);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    if (!result.patch) return NextResponse.json({ error: "We could not update this job posting." }, { status: 400 });
    const { data, error } = await supabaseAdmin.from("career_jobs").update(result.patch).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: "We could not update this job posting." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch { return NextResponse.json({ error: "We could not update this job posting." }, { status: 500 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const { id } = await params;
    const { error } = await supabaseAdmin.from("career_jobs").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: "We could not archive this job posting." }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "We could not archive this job posting." }, { status: 500 }); }
}
