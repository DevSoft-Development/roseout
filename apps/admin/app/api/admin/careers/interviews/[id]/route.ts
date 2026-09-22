import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { validateNewYorkHiringText } from "@/lib/careers/new-york-compliance";
import { supabaseAdmin } from "@/lib/supabase-admin";

const INTERVIEW_FIELDS = "id,application_id,interviewer_id,scheduled_at,duration_minutes,meeting_type,meeting_url,location,status,candidate_notes,internal_notes,outcome,created_at,updated_at,interview_guide,interview_answers,interview_live_notes,interview_guide_generated_at" as const;
const ALLOWED_EDIT_FIELDS = new Set(["scheduled_at", "duration_minutes", "meeting_type", "meeting_url", "location", "status", "candidate_notes", "internal_notes", "outcome"]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { id } = await params;
    const { data, error } = await supabaseAdmin.from("career_interviews").select(INTERVIEW_FIELDS).eq("id", id).maybeSingle();
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
    for (const value of [body.internal_notes, body.candidate_notes, body.outcome]) {
      const issue = validateNewYorkHiringText(value);
      if (issue) return NextResponse.json({ error: issue.message, compliance: "new_york", code: issue.key }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(body)) if (ALLOWED_EDIT_FIELDS.has(key)) patch[key] = value;
    if (typeof patch.internal_notes === "string") patch.internal_notes = patch.internal_notes.trim().slice(0, 2000);
    if (typeof patch.candidate_notes === "string") patch.candidate_notes = patch.candidate_notes.trim().slice(0, 2000);
    if (typeof patch.outcome === "string") patch.outcome = patch.outcome.trim().slice(0, 120);

    const { data, error } = await supabaseAdmin.from("career_interviews").update(patch).eq("id", id).select(INTERVIEW_FIELDS).single();
    if (error) return NextResponse.json({ error: "We could not update this careers record." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch (error) {
    console.error("career interview update failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "We could not update this careers record." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const { id } = await params;
    const { error } = await supabaseAdmin.from("career_interviews").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "We could not archive this careers record." }, { status: 500 });
  }
}
