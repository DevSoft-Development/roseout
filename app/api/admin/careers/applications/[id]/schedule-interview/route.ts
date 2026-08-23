import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { generateInterviewGuide } from "@/lib/careers/interview-guide";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { createMicrosoft365CalendarEvent } from "@/lib/microsoft-365/calendar";
import { normalizePhone, sendCrmSms } from "@/lib/sms/telnyx";
import { supabaseAdmin } from "@/lib/supabase-admin";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ALLOWED_MEETING_TYPES = new Set(["video", "phone", "in_person"]);

function addMinutes(time: string, minutes: number) {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  const endHours = Math.floor(total / 60);
  const endMinutes = total % 60;
  if (endHours >= 24) return null;
  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}

function formatEastern(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const local = new Date(year, month - 1, day, hour, minute);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York",
  }).format(local);
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const date = typeof body.date === "string" ? body.date.trim() : "";
    const startTime = typeof body.startTime === "string" ? body.startTime.trim() : "";
    const durationMinutes = Math.max(15, Math.min(180, Number(body.durationMinutes) || 30));
    const meetingType = ALLOWED_MEETING_TYPES.has(body.meetingType) ? body.meetingType : "video";
    const location = typeof body.location === "string" ? body.location.trim().slice(0, 500) : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
    const sendEmail = body.sendEmail !== false;
    const sendSms = body.sendSms !== false;

    if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(startTime)) {
      return NextResponse.json({ error: "Choose a valid interview date and start time." }, { status: 400 });
    }
    const endTime = addMinutes(startTime, durationMinutes);
    if (!endTime) return NextResponse.json({ error: "Choose an interview time that ends before midnight." }, { status: 400 });
    if (meetingType === "in_person" && !location) {
      return NextResponse.json({ error: "Add the interview location." }, { status: 400 });
    }

    const { data: application, error: applicationError } = await supabaseAdmin
      .from("career_applications")
      .select("id,job_id,first_name,last_name,email,phone,stage,career_jobs(title,summary,overview,responsibilities,requirements)")
      .eq("id", id)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return NextResponse.json({ error: "Candidate application was not found." }, { status: 404 });

    const jobRelation = Array.isArray(application.career_jobs) ? application.career_jobs[0] : application.career_jobs;
    const jobTitle = jobRelation?.title || "TheOutHaven opportunity";
    const candidateName = `${application.first_name || ""} ${application.last_name || ""}`.trim() || "Candidate";
    const candidateEmail = String(application.email || "").trim().toLowerCase();
    const meetingLocation = meetingType === "video" ? "Teams" : meetingType === "in_person" ? location : "Phone interview";
    const subject = `TheOutHaven interview — ${jobTitle}`;
    const calendarNotes = [
      `Interview with ${candidateName} for ${jobTitle}.`,
      notes || null,
      "Hiring note: use the approved structured interview criteria and keep evaluation job-related.",
    ].filter(Boolean).join("\n\n");

    const interviewGuide = await generateInterviewGuide({
      title: jobRelation?.title,
      summary: jobRelation?.summary,
      overview: jobRelation?.overview,
      responsibilities: jobRelation?.responsibilities,
      requirements: jobRelation?.requirements,
    });

    let teamsJoinUrl: string | null = null;
    let outlookEventId: string | null = null;
    try {
      const event: any = await createMicrosoft365CalendarEvent(admin.user_id, {
        subject,
        date,
        startTime,
        endTime,
        allDay: false,
        location: meetingLocation,
        notes: calendarNotes,
        attendeeEmails: candidateEmail ? [candidateEmail] : [],
      });
      outlookEventId = event?.id || null;
      teamsJoinUrl = event?.onlineMeeting?.joinUrl?.trim() || null;
    } catch (error) {
      console.error("Career interview Outlook event creation failed", error);
      const message = error instanceof Error && error.message === "M365_NOT_CONNECTED"
        ? "Microsoft 365 is not connected for this administrator. Connect Microsoft 365 before scheduling the interview."
        : "The Outlook interview event could not be created. No interview was scheduled.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (meetingType === "video" && !teamsJoinUrl) {
      return NextResponse.json({ error: "Microsoft Teams did not return a meeting link. The interview was not saved; try again." }, { status: 502 });
    }

    const scheduledAt = new Date(`${date}T${startTime}:00-04:00`).toISOString();
    const { data: interview, error: interviewError } = await supabaseAdmin
      .from("career_interviews")
      .insert({
        application_id: id,
        interviewer_id: admin.user_id,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes,
        meeting_type: meetingType,
        meeting_url: teamsJoinUrl,
        location: meetingType === "in_person" ? location : meetingLocation,
        status: "scheduled",
        candidate_notes: notes || null,
        internal_notes: `Structured interview scheduled through Microsoft 365. Outlook event: ${outlookEventId || "created"}. Guide source: ${interviewGuide.source}.`,
        interview_guide: interviewGuide.questions,
        interview_answers: [],
        interview_guide_generated_at: new Date().toISOString(),
      })
      .select("id,scheduled_at,status,meeting_type,meeting_url,location,interview_guide")
      .single();
    if (interviewError) throw interviewError;

    const stageResult = await supabaseAdmin.rpc("career_set_application_stage", {
      p_application_id: id,
      p_stage: "interview_scheduled",
      p_changed_by: admin.user_id,
      p_reason: "Hiring workflow: structured interview scheduled with Microsoft 365 calendar",
    });
    if (stageResult.error) throw stageResult.error;

    const when = formatEastern(date, startTime);
    const channel = meetingType === "video" ? "Microsoft Teams" : meetingType === "phone" ? "Phone" : location;
    const notificationResults: { email: string; sms: string } = { email: "not_requested", sms: "not_requested" };

    if (sendEmail && candidateEmail) {
      const result = await sendRawBrandedEmail({
        to: candidateEmail,
        department: "account",
        replyTo: "support@theouthaven.com",
        subject: `Interview scheduled: ${jobTitle}`,
        heading: "Your interview is scheduled",
        preview: `Interview for ${jobTitle} on ${when}`,
        body: `Hi ${candidateName},\n\nYour interview with TheOutHaven for ${jobTitle} is scheduled for ${when}.\n\nFormat: ${channel}.${teamsJoinUrl ? `\nTeams link: ${teamsJoinUrl}` : ""}\n\nYou will also receive the Outlook calendar invitation. If you need a reasonable accommodation for the interview process, reply to this email or contact support@theouthaven.com.`,
      });
      notificationResults.email = result.status;
      await supabaseAdmin.from("career_email_events").insert({
        application_id: id,
        template_key: "career_interview_scheduled",
        recipient_email: candidateEmail,
        subject: `Interview scheduled: ${jobTitle}`,
        status: result.status === "sent" ? "sent" : result.status,
        error: result.error || null,
        sent_at: result.status === "sent" ? new Date().toISOString() : null,
        created_by: admin.user_id,
      });
    }

    const normalizedPhone = normalizePhone(application.phone);
    if (sendSms && normalizedPhone) {
      try {
        const smsBody = `TheOutHaven: Your interview for ${jobTitle} is scheduled for ${when}.${teamsJoinUrl ? ` Join: ${teamsJoinUrl}` : ""} Reply to your interview email if you need help.`;
        await sendCrmSms({ to: normalizedPhone, body: smsBody.slice(0, 1500) });
        notificationResults.sms = "sent";
      } catch (error) {
        console.error("Career interview SMS notification failed", error);
        notificationResults.sms = "error";
      }
    } else if (sendSms) {
      notificationResults.sms = "skipped_no_phone";
    }

    return NextResponse.json({
      success: true,
      stage: "interview_scheduled",
      interview,
      teamsJoinUrl,
      outlookEventId,
      interviewGuideSource: interviewGuide.source,
      notifications: notificationResults,
      summary: `${htmlEscape(candidateName)} · ${when}`,
    });
  } catch (error) {
    console.error("Career interview scheduling failed", error);
    return NextResponse.json({ error: "The interview could not be scheduled. Please try again." }, { status: 500 });
  }
}
