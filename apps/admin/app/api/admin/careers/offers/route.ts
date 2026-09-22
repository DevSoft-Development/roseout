import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { validateNewYorkHiringText } from "@/lib/careers/new-york-compliance";
import { supabaseAdmin } from "@/lib/supabase-admin";

const OFFER_FIELDS = "id,application_id,job_id,status,employment_type,pay_type,compensation_text,start_date,expires_at,sent_at,accepted_at,declined_at,withdrawn_at,created_by,created_at,updated_at" as const;

function scorecardComplete(scorecard: Record<string, unknown> | null) {
  if (!scorecard) return false;
  const values = [scorecard.communication_score, scorecard.experience_score, scorecard.role_fit_score, scorecard.availability_score, scorecard.professionalism_score, scorecard.overall_score];
  return values.every((value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5) && Boolean(scorecard.recommendation);
}

export async function GET() {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { data, error } = await supabaseAdmin.from("career_offers").select(OFFER_FIELDS).order("created_at", { ascending: false }).limit(100);
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
    const applicationId = typeof body.application_id === "string" ? body.application_id.trim() : "";
    if (!applicationId) return NextResponse.json({ error: "Choose a candidate before preparing an offer." }, { status: 400 });
    if (body.status && body.status !== "draft") return NextResponse.json({ error: "Create offers as drafts. Use the guided Hiring Workflow to send or accept an offer so New York safeguards and the audit trail are enforced." }, { status: 400 });

    const issue = validateNewYorkHiringText(body.compensation_text);
    if (issue) return NextResponse.json({ error: issue.message, compliance: "new_york", code: issue.key }, { status: 400 });

    const { data: scorecard, error: scoreError } = await supabaseAdmin
      .from("career_application_scorecards")
      .select("communication_score,experience_score,role_fit_score,availability_score,professionalism_score,overall_score,recommendation")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (scoreError) throw new Error(scoreError.message);
    if (!scorecardComplete(scorecard)) return NextResponse.json({ error: "Complete the structured job-related scorecard before preparing an offer." }, { status: 400 });

    const record = {
      application_id: applicationId,
      job_id: typeof body.job_id === "string" ? body.job_id.trim() || null : null,
      status: "draft",
      employment_type: typeof body.employment_type === "string" ? body.employment_type.trim() || null : null,
      pay_type: typeof body.pay_type === "string" ? body.pay_type.trim() || null : null,
      compensation_text: typeof body.compensation_text === "string" ? body.compensation_text.trim().slice(0, 1000) || null : null,
      start_date: typeof body.start_date === "string" ? body.start_date.trim() || null : null,
      expires_at: typeof body.expires_at === "string" ? body.expires_at.trim() || null : null,
      created_by: admin.user_id,
    };
    const { data, error } = await supabaseAdmin.from("career_offers").insert(record).select(OFFER_FIELDS).single();
    if (error) return NextResponse.json({ error: "We could not save this careers record." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch (error) {
    console.error("career offer create failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "We could not save this careers record." }, { status: 500 });
  }
}
