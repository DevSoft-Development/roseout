import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { validateNewYorkJobPosting } from "@/lib/careers/new-york-compliance";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

const JOB_FIELDS = "id,title,slug,department,subdepartment,role_track,location,workplace_type,employment_type,compensation_type,compensation_min,compensation_max,compensation_text,summary,overview,responsibilities,requirements,nice_to_have,benefits,schedule,hiring_process,status,visibility,is_internship,internship_type,is_paid,supports_college_credit,requires_school_credit,weekly_hours_min,weekly_hours_max,program_duration_weeks,learning_objectives,compliance_status,compliance_notes,hiring_manager_id,created_by,created_at,updated_at";
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
    const auth = await requireAdminApiRole(["superadmin", "admin", "manager", "editor", "reviewer", "ambassador", "experience_team", "viewer"]);
    if (auth.error) return auth.error;
    const { id } = await params;
    const { data, error } = await getAdminDatabaseClient().from("career_jobs").select(JOB_FIELDS).eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: "We could not load this job posting." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Job posting not found." }, { status: 404 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: "We could not load this job posting." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminApiRole(["superadmin", "admin", "editor"]);
    if (auth.error) return auth.error;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = buildPatch(body);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    if (!result.patch) return NextResponse.json({ error: "We could not update this job posting." }, { status: 400 });

    const { data: existing, error: existingError } = await getAdminDatabaseClient().from("career_jobs").select(JOB_FIELDS).eq("id", id).maybeSingle();
    if (existingError) return NextResponse.json({ error: "We could not load this job posting for compliance review." }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Job posting not found." }, { status: 404 });

    const complianceError = validateNewYorkJobPosting({ ...existing, ...result.patch });
    if (complianceError) {
      return NextResponse.json({ error: complianceError.message, compliance: "new_york", code: complianceError.key }, { status: 400 });
    }

    const { data, error } = await getAdminDatabaseClient().from("career_jobs").update(result.patch).eq("id", id).select(JOB_FIELDS).single();
    if (error) return NextResponse.json({ error: "We could not update this job posting." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: "We could not update this job posting." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminApiRole(["superadmin", "admin", "editor"]);
    if (auth.error) return auth.error;
    const { id } = await params;
    const { error } = await getAdminDatabaseClient().from("career_jobs").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: "We could not archive this job posting." }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "We could not archive this job posting." }, { status: 500 });
  }
}
