import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { validateNewYorkJobPosting } from "@/lib/careers/new-york-compliance";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

const JOB_FIELDS = "id,title,slug,department,subdepartment,role_track,location,workplace_type,employment_type,compensation_type,compensation_min,compensation_max,compensation_text,summary,overview,responsibilities,requirements,nice_to_have,benefits,schedule,hiring_process,status,visibility,is_internship,internship_type,is_paid,supports_college_credit,requires_school_credit,weekly_hours_min,weekly_hours_max,program_duration_weeks,learning_objectives,compliance_status,compliance_notes,hiring_manager_id,created_by,created_at,updated_at";
const editableFields = new Set(["title","slug","department","subdepartment","role_track","location","workplace_type","employment_type","compensation_type","compensation_min","compensation_max","compensation_text","summary","overview","responsibilities","requirements","nice_to_have","benefits","schedule","hiring_process","status","visibility","is_internship","internship_type","is_paid","supports_college_credit","requires_school_credit","weekly_hours_min","weekly_hours_max","program_duration_weeks","learning_objectives","compliance_status","compliance_notes"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function buildRecord(body: Record<string, unknown>, userId?: string) {
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) if (editableFields.has(key)) record[key] = value;
  if (typeof record.title !== "string" || !record.title.trim()) return { error: "A role title is required." };
  if (typeof record.slug !== "string" || !slugPattern.test(record.slug)) return { error: "Use a lowercase slug with letters, numbers, and hyphens only." };
  record.title = record.title.trim();
  record.slug = record.slug.trim();
  record.created_by = userId;
  record.updated_at = new Date().toISOString();
  return { record };
}

export async function GET() {
  try {
    const auth = await requireAdminApiRole(["superadmin", "admin", "manager", "editor", "reviewer", "ambassador", "experience_team", "viewer"]);
    if (auth.error) return auth.error;
    const { data } = await getAdminDatabaseClient().from("career_jobs").select(JOB_FIELDS).limit(100);
    return NextResponse.json({ records: data || [] });
  } catch {
    return NextResponse.json({ error: "We could not load these job postings." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdminApiRole(["superadmin", "admin", "editor"]);
    if (auth.error) return auth.error;
    const admin = auth.adminUser;
    const body = await req.json().catch(() => ({}));
    const result = buildRecord(body, admin.user_id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    if (!result.record) return NextResponse.json({ error: "We could not create this job posting." }, { status: 400 });

    const complianceError = validateNewYorkJobPosting(result.record);
    if (complianceError) {
      return NextResponse.json({ error: complianceError.message, compliance: "new_york", code: complianceError.key }, { status: 400 });
    }

    const { data, error } = await getAdminDatabaseClient().from("career_jobs").insert(result.record).select(JOB_FIELDS).single();
    if (error) return NextResponse.json({ error: "We could not create this job posting." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: "We could not create this job posting." }, { status: 500 });
  }
}
