import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ACTIVE_STAGES = new Set([
  "submitted",
  "portfolio_review",
  "under_review",
  "shortlisted",
  "interview_requested",
  "interview_scheduled",
  "interview_completed",
  "content_test",
  "offer_pending",
  "offer_sent",
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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const application = await getApplication(id);

    if (action === "start_review") {
      await setStage(id, "under_review", admin.user_id, "Hiring workflow: review started");
      return NextResponse.json({ success: true, stage: "under_review" });
    }

    if (action === "shortlist") {
      await setStage(id, "shortlisted", admin.user_id, "Hiring workflow: candidate shortlisted");
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
          internal_notes: typeof body.internalNotes === "string" && body.internalNotes.trim() ? body.internalNotes.trim() : null,
        })
        .select("id,scheduled_at,status")
        .single();
      if (error) throw new Error(error.message);
      await setStage(id, "interview_scheduled", admin.user_id, "Hiring workflow: interview scheduled");
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
      if (latest?.id) {
        const { error } = await supabaseAdmin
          .from("career_interviews")
          .update({
            status: "completed",
            outcome: typeof body.outcome === "string" && body.outcome.trim() ? body.outcome.trim() : "completed",
            internal_notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : undefined,
            updated_at: new Date().toISOString(),
          })
          .eq("id", latest.id);
        if (error) throw new Error(error.message);
      }
      await setStage(id, "interview_completed", admin.user_id, "Hiring workflow: interview completed");
      return NextResponse.json({ success: true, stage: "interview_completed" });
    }

    if (action === "prepare_offer") {
      const compensationText = typeof body.compensationText === "string" ? body.compensationText.trim() : "";
      const startDate = typeof body.startDate === "string" ? body.startDate : "";
      if (!compensationText) return NextResponse.json({ error: "Add compensation or offer terms." }, { status: 400 });
      if (!startDate) return NextResponse.json({ error: "Choose a proposed start date." }, { status: 400 });
      const expiresAt = typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : null;
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
          expires_at: expiresAt,
          created_by: admin.user_id,
        })
        .select("id,status,start_date,compensation_text")
        .single();
      if (error) throw new Error(error.message);
      await setStage(id, "offer_pending", admin.user_id, "Hiring workflow: offer prepared");
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
      if (!latest) return NextResponse.json({ error: "Prepare an offer before sending it." }, { status: 400 });
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("career_offers")
        .update({ status: "sent", sent_at: now, updated_at: now })
        .eq("id", latest.id);
      if (error) throw new Error(error.message);
      await setStage(id, "offer_sent", admin.user_id, "Hiring workflow: offer marked sent");
      return NextResponse.json({ success: true, stage: "offer_sent", offerId: latest.id });
    }

    if (action === "hire") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      const directHire = application.stage !== "offer_sent";
      if (directHire && !reason) {
        return NextResponse.json({ error: "Add an audit reason for a direct hire." }, { status: 400 });
      }
      const { data: latest } = await supabaseAdmin
        .from("career_offers")
        .select("id,status")
        .eq("application_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest?.id) {
        const now = new Date().toISOString();
        const { error } = await supabaseAdmin
          .from("career_offers")
          .update({ status: "accepted", accepted_at: now, updated_at: now })
          .eq("id", latest.id);
        if (error) throw new Error(error.message);
      }
      await setStage(
        id,
        "hired",
        admin.user_id,
        directHire ? `Direct hire: ${reason}` : "Hiring workflow: offer accepted and candidate hired",
      );
      return NextResponse.json({ success: true, stage: "hired", directHire });
    }

    if (action === "reject") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) return NextResponse.json({ error: "Add a reason for the hiring audit trail." }, { status: 400 });
      await setStage(id, "not_selected", admin.user_id, `Not selected: ${reason}`);
      return NextResponse.json({ success: true, stage: "not_selected" });
    }

    if (action === "talent_pool") {
      const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Strong candidate for a future role";
      await setStage(id, "talent_pool", admin.user_id, `Talent pool: ${reason}`);
      return NextResponse.json({ success: true, stage: "talent_pool" });
    }

    if (action === "reopen") {
      await setStage(id, "under_review", admin.user_id, "Hiring workflow: candidate reopened for review");
      return NextResponse.json({ success: true, stage: "under_review" });
    }

    if (ACTIVE_STAGES.has(action)) {
      await setStage(id, action, admin.user_id, "Hiring workflow: stage updated");
      return NextResponse.json({ success: true, stage: action });
    }

    return NextResponse.json({ error: "Unsupported hiring workflow action." }, { status: 400 });
  } catch (error) {
    console.error("career hiring workflow failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "We could not update this candidate." },
      { status: 500 },
    );
  }
}
