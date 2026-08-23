import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { validateNewYorkHiringText } from "@/lib/careers/new-york-compliance";
import { supabaseAdmin } from "@/lib/supabase-admin";

function scorecardComplete(scorecard: Record<string, unknown> | null) {
  if (!scorecard) return false;
  const values = [
    scorecard.communication_score,
    scorecard.experience_score,
    scorecard.role_fit_score,
    scorecard.availability_score,
    scorecard.professionalism_score,
    scorecard.overall_score,
  ];
  return values.every((value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5) && Boolean(scorecard.recommendation);
}

export async function GET() {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { data } = await supabaseAdmin.from("career_offers").select("*").limit(100);
    return NextResponse.json({ records: data || [] });
  } catch {
    return NextResponse.json({ error: "We could not load these careers records." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const body = await req.json().catch(() => ({}));
    const applicationId = typeof body.application_id === "string" ? body.application_id : "";
    if (!applicationId) return NextResponse.json({ error: "Choose a candidate before preparing an offer." }, { status: 400 });
    if (body.status && body.status !== "draft") {
      return NextResponse.json({ error: "Create offers as drafts. Use the guided Hiring Workflow to send or accept an offer so New York safeguards and the audit trail are enforced." }, { status: 400 });
    }

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
    if (!scorecardComplete(scorecard)) {
      return NextResponse.json({ error: "Complete the structured job-related scorecard before preparing an offer." }, { status: 400 });
    }

    const record = {
      application_id: applicationId,
      job_id: body.job_id || null,
      status: "draft",
      employment_type: body.employment_type || null,
      pay_type: body.pay_type || null,
      compensation_text: typeof body.compensation_text === "string" ? body.compensation_text.trim().slice(0, 1000) : null,
      start_date: body.start_date || null,
      expires_at: body.expires_at || null,
      created_by: admin.user_id,
    };
    const { data, error } = await supabaseAdmin.from("career_offers").insert(record).select("*").single();
    if (error) return NextResponse.json({ error: "We could not save this careers record." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch (error) {
    console.error("career offer create failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "We could not save this careers record." }, { status: 500 });
  }
}
