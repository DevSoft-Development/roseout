import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { validateNewYorkHiringText } from "@/lib/careers/new-york-compliance";
import { supabaseAdmin } from "@/lib/supabase-admin";

type AnswerInput = { questionId?: unknown; answer?: unknown };

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function latestInterview(applicationId: string) {
  const { data, error } = await supabaseAdmin
    .from("career_interviews")
    .select("id,status,scheduled_at,meeting_type,meeting_url,location,interview_guide,interview_answers,interview_live_notes,interview_guide_generated_at")
    .eq("application_id", applicationId)
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
    const { id } = await params;
    const interview = await latestInterview(id);
    if (!interview) return NextResponse.json({ error: "Schedule the interview before opening the interview workspace." }, { status: 404 });
    return NextResponse.json({ interview });
  } catch (error) {
    console.error("Career interview session load failed", error);
    return NextResponse.json({ error: "The interview workspace could not be loaded." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const interview = await latestInterview(id);
    if (!interview) return NextResponse.json({ error: "Schedule the interview before completing it." }, { status: 400 });

    const guide = Array.isArray(interview.interview_guide) ? interview.interview_guide : [];
    if (!guide.length) return NextResponse.json({ error: "This interview does not have a structured question guide. Reschedule or regenerate the interview guide before completing it." }, { status: 400 });

    const rawAnswers = Array.isArray(body.answers) ? body.answers as AnswerInput[] : [];
    const answerMap = new Map(rawAnswers.map((item) => [clean(item.questionId, 80), clean(item.answer, 4000)]));
    const answers = guide.map((question: any) => ({
      questionId: clean(question?.id, 80),
      competency: clean(question?.competency, 120),
      question: clean(question?.question, 500),
      answer: answerMap.get(clean(question?.id, 80)) || "",
    }));

    const missing = answers.filter((item) => !item.answer).length;
    if (missing) {
      return NextResponse.json({ error: `Enter interview evidence for all ${guide.length} structured questions before completing the interview. ${missing} ${missing === 1 ? "answer is" : "answers are"} still blank.` }, { status: 400 });
    }

    const liveNotes = clean(body.notes, 6000);
    for (const item of answers) {
      const issue = validateNewYorkHiringText(item.answer);
      if (issue) return NextResponse.json({ error: issue.message, compliance: "new_york", code: issue.key }, { status: 400 });
    }
    const noteIssue = validateNewYorkHiringText(liveNotes);
    if (noteIssue) return NextResponse.json({ error: noteIssue.message, compliance: "new_york", code: noteIssue.key }, { status: 400 });

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("career_interviews")
      .update({
        status: "completed",
        outcome: "completed",
        interview_answers: answers,
        interview_live_notes: liveNotes || null,
        internal_notes: liveNotes || "Structured interview completed with question-by-question evidence.",
        updated_at: now,
      })
      .eq("id", interview.id);
    if (updateError) throw updateError;

    const stageResult = await supabaseAdmin.rpc("career_set_application_stage", {
      p_application_id: id,
      p_stage: "interview_completed",
      p_changed_by: admin.user_id,
      p_reason: "Hiring workflow: structured interview completed with role-specific question evidence",
    });
    if (stageResult.error) throw stageResult.error;

    return NextResponse.json({ success: true, stage: "interview_completed", interviewId: interview.id, answered: answers.length });
  } catch (error) {
    console.error("Career interview session save failed", error);
    return NextResponse.json({ error: "The interview record could not be completed. Please try again." }, { status: 500 });
  }
}
