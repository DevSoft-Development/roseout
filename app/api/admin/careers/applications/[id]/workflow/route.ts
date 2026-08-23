import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const HIRE_REASON_CODES = new Set([
  "meets_role_requirements",
  "strong_structured_scorecard",
  "demonstrated_required_skills",
  "successful_interview",
  "accepted_offer",
  "other_job_related",
]);

const REJECT_REASON_CODES = new Set([
  "required_experience_not_met",
  "required_skill_not_met",
  "schedule_requirement_not_met",
  "work_sample_below_standard",
  "interview_evidence_not_met",
  "role_filled",
  "candidate_withdrew",
  "other_job_related",
]);

const TALENT_REASON_CODES = new Set([
  "strong_candidate_future_role",
  "timing_or_capacity",
  "alternate_role_fit",
  "other_job_related",
]);

async function setStage(applicationId: string, stage: string, userId: string, reason: string) {
  const { error } = await supabaseAdmin.rpc("career_set_application_stage", {
    p_application_id: applicationId,
    p_stage: stage,
    p_changed_by: userId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

async function getApplication(applicationId: string) {
  const { data, error } = await supabaseAdmin
    .from("career_applications")
    .select("id,job_id,stage,first_name,last_name,email")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Candidate application was not found.");
  return data;
}

async function getLatestScorecard(applicationId: string) {
  const { data, error } = await supabaseAdmin
    .from("career_application_scorecards")
    .select("id,communication_score,experience_score,role_fit_score,availability_score,professionalism_score,overall_score,recommendation")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function hasCompletedStructuredScorecard(scorecard: Awaited<ReturnType<typeof getLatestScorecard>>) {
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

function decisionReason(prefix: string, reasonCode: string, note: unknown) {
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 500) : "";
  return `${prefix}: ${reasonCode}${cleanNote ? ` — ${cleanNote}` : ""}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const application = await getApplication(id);

    if (action === "start_review") {
      await setStage(id, "under_review", admin.user_id, "Hiring workflow: structured review started");
      return NextResponse.json({ success: true, stage: "under_review" });
    }

    if (action === "shortlist") {
      const scorecard = await getLatestScorecard(id);
      if (!hasCompletedStructuredScorecard(scorecard)) {
        return NextResponse.json({ error: "Complete the job-related structured scorecard before shortlisting this candidate." }, { status: 400 });
      }
      await setStage(id, "shortlisted", admin.user_id, "Hiring workflow: candidate shortlisted after structured review");
      return NextResponse.json({ success: true, stage: "shortlisted" });
    }

    if (action === "request_interview") {
      await setStage(id, "interview_requested", admin.user_id, "Hiring workflow: interview requested");
      return NextResponse.json({ success: true, stage: "interview_requested" });
    }

    if (action === "schedule_interview") {
      const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt : "";
      if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
        return NextResponse.json({ error: "Choose a valid interview date and time." }, { status: 400 });
      }
      const durationMinutes = Math.max(15, Math.min(180, Number(body.durationMinutes) || 30));
      const meetingType = ["video", "phone", "in_person"].includes(body.meetingType) ? body.meetingType : "video";
      const { data: interview, error } = await supabaseAdmin
        .from("career_interviews")
        .insert({
          application_id: id,
          interviewer_id: admin.user_id,
          scheduled_at: scheduledAt,
          duration_minutes: durationMinutes,
          meeting_type: meetingType,
          meeting_url: typeof body.meetingUrl === "string" && body.meetingUrl.trim() ? body.meetingUrl.trim() : null,
          location: typeof body.location === "string" && body.location.trim() ? body.location.trim() : null,
          status: "scheduled",
          internal_notes: "Use the same job-related interview questions and evaluation criteria for candidates being considered for this role.",
        })
        .select("id,scheduled_at,status")
        .single();
      if (error) throw new Error(error.message);
      await setStage(id, "interview_scheduled", admin.user_id, "Hiring workflow: structured interview scheduled");
      return NextResponse.json({ success: true, stage: "interview_scheduled", interview });
    }

    if (action === "complete_interview") {
      const { data: latest } = await supabaseAdmin
        .from("career_interviews")
        .select("id")
        .eq("application_id", id)
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest?.id) return NextResponse.json({ error: "Schedule the interview before completing it." }, { status: 400 });
      const { error } = await supabaseAdmin
        .from("career_interviews")
        .update({
          status: "completed",
          outcome: typeof body.outcome === "string" && body.outcome.trim() ? body.outcome.trim().slice(0, 120) : "completed",
          internal_notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 2000) : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", latest.id);
      if (error) throw new Error(error.message);
      await setStage(id, "interview_completed", admin.user_id, "Hiring workflow: structured interview completed");
      return NextResponse.json({ success: true, stage: "interview_completed" });
    }

    if (action === "prepare_offer") {
      const scorecard = await getLatestScorecard(id);
      if (!hasCompletedStructuredScorecard(scorecard)) {
        return NextResponse.json({ error: "Complete the structured scorecard before preparing an offer." }, { status: 400 });
      }
      const compensationText = typeof body.compensationText === "string" ? body.compensationText.trim().slice(0, 1000) : "";
      const startDate = typeof body.startDate === "string" ? body.startDate : "";
      if (!compensationText) return NextResponse.json({ error: "Add compensation or offer terms." }, { status: 400 });
      if (!startDate) return NextResponse.json({ error: "Choose a proposed start date." }, { status: 400 });
      const { data: offer, error } = await supabaseAdmin
        .from("career_offers")
        .insert({
          application_id: id,
          job_id: application.job_id,
          status: "draft",
          employment_type: typeof body.employmentType === "string" ? body.employmentType : null,
          pay_type: typeof body.payType === "string" ? body.payType : null,
          compensation_text: compensationText,
          start_date: startDate,
          expires_at: typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : null,
          created_by: admin.user_id,
        })
        .select("id,status,start_date,compensation_text")
        .single();
      if (error) throw new Error(error.message);
      await setStage(id, "offer_pending", admin.user_id, "Hiring workflow: offer prepared from job-related evaluation");
      return NextResponse.json({ success: true, stage: "offer_pending", offer });
    }

    if (action === "send_offer") {
      const { data: latest } = await supabaseAdmin
        .from("career_offers")
        .select("id,status")
        .eq("application_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return NextResponse.json({ error: "Prepare an offer before marking it sent." }, { status: 400 });
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin.from("career_offers").update({ status: "sent", sent_at: now, updated_at: now }).eq("id", latest.id);
      if (error) throw new Error(error.message);
      await setStage(id, "offer_sent", admin.user_id, "Hiring workflow: offer marked sent");
      return NextResponse.json({ success: true, stage: "offer_sent", offerId: latest.id });
    }

    if (action === "hire") {
      const scorecard = await getLatestScorecard(id);
      if (!hasCompletedStructuredScorecard(scorecard)) {
        return NextResponse.json({ error: "Complete the job-related structured scorecard before hiring this candidate." }, { status: 400 });
      }
      const reasonCode = typeof body.reasonCode === "string" ? body.reasonCode : "";
      if (!HIRE_REASON_CODES.has(reasonCode)) {
        return NextResponse.json({ error: "Choose a job-related hiring reason." }, { status: 400 });
      }
      if (reasonCode === "other_job_related" && !(typeof body.reason === "string" && body.reason.trim())) {
        return NextResponse.json({ error: "Describe the job-related reason for this hiring decision." }, { status: 400 });
      }
      const directHire = application.stage !== "offer_sent";
      const { data: latest } = await supabaseAdmin
        .from("career_offers")
        .select("id,status")
        .eq("application_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest?.id) {
        const now = new Date().toISOString();
        const { error } = await supabaseAdmin.from("career_offers").update({ status: "accepted", accepted_at: now, updated_at: now }).eq("id", latest.id);
        if (error) throw new Error(error.message);
      }
      await setStage(id, "hired", admin.user_id, decisionReason(directHire ? "Direct hire decision" : "Hire decision", reasonCode, body.reason));
      return NextResponse.json({ success: true, stage: "hired", directHire });
    }

    if (action === "reject") {
      const reasonCode = typeof body.reasonCode === "string" ? body.reasonCode : "";
      if (!REJECT_REASON_CODES.has(reasonCode)) {
        return NextResponse.json({ error: "Choose a job-related reason for this decision." }, { status: 400 });
      }
      if (reasonCode === "other_job_related" && !(typeof body.reason === "string" && body.reason.trim())) {
        return NextResponse.json({ error: "Describe the job-related reason for this decision." }, { status: 400 });
      }
      await setStage(id, "not_selected", admin.user_id, decisionReason("Not selected", reasonCode, body.reason));
      return NextResponse.json({ success: true, stage: "not_selected" });
    }

    if (action === "talent_pool") {
      const reasonCode = typeof body.reasonCode === "string" ? body.reasonCode : "";
      if (!TALENT_REASON_CODES.has(reasonCode)) {
        return NextResponse.json({ error: "Choose a job-related talent-pool reason." }, { status: 400 });
      }
      if (reasonCode === "other_job_related" && !(typeof body.reason === "string" && body.reason.trim())) {
        return NextResponse.json({ error: "Describe the job-related reason." }, { status: 400 });
      }
      await setStage(id, "talent_pool", admin.user_id, decisionReason("Talent pool", reasonCode, body.reason));
      return NextResponse.json({ success: true, stage: "talent_pool" });
    }

    if (action === "reopen") {
      await setStage(id, "under_review", admin.user_id, "Hiring workflow: candidate reopened for structured review");
      return NextResponse.json({ success: true, stage: "under_review" });
    }

    return NextResponse.json({ error: "Unsupported hiring workflow action." }, { status: 400 });
  } catch (error) {
    console.error("career hiring workflow failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "We could not update this candidate." }, { status: 500 });
  }
}
