import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { validateNewYorkHiringText } from "@/lib/careers/new-york-compliance";
import { supabaseAdmin } from "@/lib/supabase-admin";

const INTERVIEW_FIELDS = "id,application_id,interviewer_id,scheduled_at,duration_minutes,meeting_type,meeting_url,location,status,candidate_notes,internal_notes,outcome,created_at,updated_at,interview_guide,interview_answers,interview_live_notes,interview_guide_generated_at" as const;
const ALLOWED_CREATE_FIELDS = new Set(["application_id", "scheduled_at", "duration_minutes", "meeting_type", "meeting_url", "location", "status", "candidate_notes", "internal_notes", "outcome"]);

export async function GET() {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { data, error } = await supabaseAdmin.from("career_interviews").select(INTERVIEW_FIELDS).order("scheduled_at", { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({ records: data || [] });
  } catch {
    return NextResponse.json({ error: "We could not load these careers records." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const body = await req.json().catch(() => ({}));
    for (const value of [body.internal_notes, body.candidate_notes, body.outcome]) {
      const issue = validateNewYorkHiringText(value);
      if (issue) return NextResponse.json({ error: issue.message, compliance: "new_york", code: issue.key }, { status: 400 });
    }

    const record: Record<string, unknown> = { interviewer_id: admin.user_id };
    for (const [key, value] of Object.entries(body)) if (ALLOWED_CREATE_FIELDS.has(key)) record[key] = value;
    if (!record.application_id) return NextResponse.json({ error: "Choose a candidate before scheduling an interview." }, { status: 400 });
    if (typeof record.internal_notes === "string") record.internal_notes = record.internal_notes.trim().slice(0, 2000);
    if (typeof record.candidate_notes === "string") record.candidate_notes = record.candidate_notes.trim().slice(0, 2000);
    if (typeof record.outcome === "string") record.outcome = record.outcome.trim().slice(0, 120);

    const { data, error } = await supabaseAdmin.from("career_interviews").insert(record).select(INTERVIEW_FIELDS).single();
    if (error) return NextResponse.json({ error: "We could not save this careers record." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch (error) {
    console.error("career interview create failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "We could not save this careers record." }, { status: 500 });
  }
}
