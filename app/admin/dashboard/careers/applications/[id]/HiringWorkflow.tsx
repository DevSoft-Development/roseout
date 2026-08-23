"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import InterviewSessionPanel from "./InterviewSessionPanel";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  FileCheck2,
  Mail,
  MapPin,
  MessageSquareText,
  MonitorUp,
  Phone,
  Scale,
  Send,
  ShieldCheck,
  UserCheck,
  UserRoundSearch,
  UsersRound,
  Video,
  X,
} from "lucide-react";

type Scorecard = {
  id: string;
  communication_score: number | null;
  experience_score: number | null;
  role_fit_score: number | null;
  availability_score: number | null;
  professionalism_score: number | null;
  market_knowledge_score: number | null;
  overall_score: number | null;
  recommendation: string | null;
  notes: string | null;
} | null;

type Interview = { id: string; status: string | null; scheduled_at: string | null; meeting_type: string | null } | null;
type Offer = { id: string; status: string | null; compensation_text: string | null; start_date: string | null } | null;

type Props = {
  applicationId: string;
  candidateName: string;
  stage: string;
  latestScorecard: Scorecard;
  latestInterview: Interview;
  latestOffer: Offer;
  hasProvisioningProfile: boolean;
};

type Panel = "scorecard" | "interview" | "complete_interview" | "offer" | "hire" | "reject" | "talent" | null;

const steps = [
  { key: "application", label: "Application", description: "Review candidate", stages: ["submitted", "portfolio_review", "under_review"], icon: UserRoundSearch },
  { key: "qualified", label: "Qualified", description: "Structured scorecard", stages: ["shortlisted"], icon: Scale },
  { key: "interview", label: "Interview", description: "Schedule & evaluate", stages: ["interview_requested", "interview_scheduled", "interview_completed", "content_test"], icon: CalendarClock },
  { key: "offer", label: "Offer", description: "Prepare & deliver", stages: ["offer_pending", "offer_sent"], icon: FileCheck2 },
  { key: "hired", label: "Hired", description: "Onboard employee", stages: ["hired"], icon: UserCheck },
] as const;

const scoreCriteria = [
  ["communication_score", "Role-relevant communication", "Communication required to perform this specific job."],
  ["experience_score", "Required experience", "Evidence of the experience stated in the job requirements."],
  ["role_fit_score", "Required skills", "Demonstrated skills and competencies needed for the role."],
  ["availability_score", "Schedule / availability", "Only score availability that is an actual job requirement."],
  ["professionalism_score", "Execution / work quality", "Quality, preparation, accuracy, or work-sample execution."],
  ["market_knowledge_score", "Market knowledge (optional)", "Use only when market knowledge is genuinely job-related."],
] as const;

const hireReasons = [
  ["meets_role_requirements", "Meets documented role requirements"],
  ["strong_structured_scorecard", "Strong structured scorecard"],
  ["demonstrated_required_skills", "Demonstrated required skills"],
  ["successful_interview", "Successful structured interview"],
  ["accepted_offer", "Accepted approved offer"],
  ["other_job_related", "Other job-related reason"],
];
const rejectReasons = [
  ["required_experience_not_met", "Required experience not met"],
  ["required_skill_not_met", "Required skill not met"],
  ["schedule_requirement_not_met", "Documented schedule requirement not met"],
  ["work_sample_below_standard", "Job-related work sample below standard"],
  ["interview_evidence_not_met", "Structured interview evidence did not meet standard"],
  ["role_filled", "Role filled / position no longer available"],
  ["candidate_withdrew", "Candidate withdrew"],
  ["other_job_related", "Other job-related reason"],
];
const talentReasons = [
  ["strong_candidate_future_role", "Strong candidate for a future role"],
  ["timing_or_capacity", "Timing / current hiring capacity"],
  ["alternate_role_fit", "Better fit for another role"],
  ["other_job_related", "Other job-related reason"],
];

function pretty(value?: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function currentStepIndex(stage: string) {
  if (["not_selected", "withdrawn", "talent_pool"].includes(stage)) return -1;
  return steps.findIndex((step) => (step.stages as readonly string[]).includes(stage));
}
function primaryFor(stage: string) {
  switch (stage) {
    case "submitted":
    case "portfolio_review": return { label: "Start review", action: "start_review", help: "Begin a structured review using the job requirements." };
    case "under_review": return { label: "Shortlist candidate", action: "shortlist", help: "Advance after the structured scorecard is complete." };
    case "shortlisted": return { label: "Request interview", action: "request_interview", help: "Move this candidate into interview planning." };
    case "interview_requested": return { label: "Schedule interview", action: "schedule_interview", help: "Create the interview, Outlook invitation, Teams link, and candidate notifications." };
    case "interview_scheduled": return { label: "Conduct interview", action: "complete_interview", help: "Open the live interview workspace with role-specific questions, answer fields, and interviewer notes." };
    case "interview_completed":
    case "content_test": return { label: "Prepare offer", action: "prepare_offer", help: "Prepare an offer using the approved role and compensation." };
    case "offer_pending": return { label: "Mark offer sent", action: "send_offer", help: "Confirm the approved offer was delivered." };
    case "offer_sent": return { label: "Mark accepted & hire", action: "hire", help: "Record acceptance and complete the hiring decision." };
    case "hired": return { label: "Hiring complete", action: "done", help: "Continue to employee onboarding and access provisioning." };
    default: return { label: "Reopen review", action: "reopen", help: "Return this candidate to structured review." };
  }
}

export default function HiringWorkflow({ applicationId, candidateName, stage, latestScorecard, latestInterview, latestOffer, hasProvisioningProfile }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [panel, setPanel] = useState<Panel>(null);

  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("10:00");
  const [duration, setDuration] = useState("30");
  const [meetingType, setMeetingType] = useState("video");
  const [location, setLocation] = useState("");
  const [schedulerNotes, setSchedulerNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(true);

  const [compensation, setCompensation] = useState(latestOffer?.compensation_text || "");
  const [startDate, setStartDate] = useState(latestOffer?.start_date || "");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [payType, setPayType] = useState("salary");
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [recommendation, setRecommendation] = useState(latestScorecard?.recommendation || "");
  const [scoreNotes, setScoreNotes] = useState(latestScorecard?.notes || "");
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(scoreCriteria.map(([key]) => [key, latestScorecard?.[key] == null ? "" : String(latestScorecard[key])] )));

  const stepIndex = currentStepIndex(stage);
  const primary = useMemo(() => primaryFor(stage), [stage]);
  const scorecardReady = Boolean(latestScorecard?.overall_score && latestScorecard?.recommendation);
  const progress = stepIndex < 0 ? 0 : Math.min(100, ((stepIndex + 1) / steps.length) * 100);

  async function callWorkflow(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/admin/careers/applications/${applicationId}/workflow`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We could not update this candidate.");
      setPanel(null); setReasonCode(""); setReason(""); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "We could not update this candidate."); }
    finally { setBusy(false); }
  }

  async function saveScorecard() {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/admin/careers/applications/${applicationId}/scorecard`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...scores, recommendation, notes: scoreNotes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We could not save the scorecard.");
      setPanel(null); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "We could not save the scorecard."); }
    finally { setBusy(false); }
  }

  async function scheduleInterview() {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/admin/careers/applications/${applicationId}/schedule-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: interviewDate,
          startTime: interviewTime,
          durationMinutes: duration,
          meetingType,
          location,
          notes: schedulerNotes,
          sendEmail,
          sendSms,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The interview could not be scheduled.");
      const channels = [data.notifications?.email === "sent" ? "email" : null, data.notifications?.sms === "sent" ? "SMS" : null].filter(Boolean).join(" + ");
      setSuccess(`Interview scheduled in Outlook${data.teamsJoinUrl ? " with a Microsoft Teams link" : ""}${channels ? `; ${channels} notification sent` : ""}. A role-specific structured interview guide was also created.`);
      setPanel(null);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "The interview could not be scheduled."); }
    finally { setBusy(false); }
  }

  function openDecision(next: Panel) { setReasonCode(""); setReason(""); setPanel(next); setError(""); setSuccess(""); }
  function primaryClick() {
    if (primary.action === "done") return;
    if (primary.action === "schedule_interview") return setPanel("interview");
    if (primary.action === "complete_interview") return setPanel("complete_interview");
    if (primary.action === "prepare_offer") return setPanel("offer");
    if (primary.action === "hire") return openDecision("hire");
    void callWorkflow(primary.action);
  }

  const decisionOptions = panel === "hire" ? hireReasons : panel === "reject" ? rejectReasons : talentReasons;

  return <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,0.12),transparent_32%),#101012] shadow-2xl shadow-black/25">
    <div className="border-b border-white/10 p-5 sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-rose-200"><BriefcaseBusiness className="h-4 w-4" /> Enterprise hiring workflow</div><h2 className="mt-2 text-2xl font-black sm:text-3xl">Applicant → Employee</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">One guided workflow for review, qualification, interview scheduling, offer, decision, and employee onboarding. Complete the current step and the system guides you to the next action.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPanel("scorecard")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white/75 transition hover:border-white/20 hover:text-white"><Scale className="h-4 w-4" /> {scorecardReady ? "Update scorecard" : "Complete scorecard"}</button>
          {!['hired','not_selected','withdrawn'].includes(stage) ? <button type="button" onClick={() => openDecision("talent")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white/70"><UsersRound className="h-4 w-4" /> Talent pool</button> : null}
          {!['hired','not_selected','withdrawn'].includes(stage) ? <button type="button" onClick={() => openDecision("reject")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-300/20 bg-red-500/10 px-4 text-sm font-black text-red-100"><X className="h-4 w-4" /> Not selected</button> : null}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-white/40"><span>Hiring progress</span><span>{stepIndex >= 0 ? `Step ${Math.min(stepIndex + 1, 5)} of 5` : pretty(stage)}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-[#ec0b5b] transition-all" style={{ width: `${progress}%` }} /></div>
      </div>
    </div>

    <div className="border-b border-white/10 bg-black/15 p-4 sm:p-5">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{steps.map((step, index) => { const Icon = step.icon; const active = stepIndex === index; const complete = stepIndex > index || stage === "hired"; return <div key={step.key} className={`rounded-2xl border p-3.5 transition ${active ? "border-rose-300/45 bg-rose-500/10" : complete ? "border-emerald-300/20 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.025]"}`}><div className="flex items-start gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-[#ec0b5b] text-white" : complete ? "bg-emerald-500/15 text-emerald-200" : "bg-white/[0.05] text-white/30"}`}>{complete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</div><div className="min-w-0"><p className={`text-sm font-black ${active ? "text-white" : complete ? "text-emerald-100" : "text-white/45"}`}>{step.label}</p><p className="mt-0.5 text-xs text-white/35">{active ? pretty(stage) : complete ? "Complete" : step.description}</p></div></div></div>; })}</div>
    </div>

    <div className="p-5 sm:p-6">
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 sm:p-6"><p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Recommended next action</p><h3 className="mt-2 text-2xl font-black">{primary.label}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{primary.help}</p>{primary.action !== "done" ? <button disabled={busy} type="button" onClick={primaryClick} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#ec0b5b] px-6 text-sm font-black text-white transition hover:bg-rose-500 disabled:opacity-50">{busy ? "Working…" : primary.label}<ArrowRight className="h-4 w-4" /></button> : <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-100"><CheckCircle2 className="h-4 w-4" /> Hiring workflow complete</div>}</div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Readiness</p><div className="mt-3 space-y-3 text-sm"><Row label="Structured scorecard" value={scorecardReady ? `${latestScorecard?.overall_score}/5 · ${pretty(latestScorecard?.recommendation)}` : "Required"} good={scorecardReady} /><Row label="Interview" value={latestInterview ? pretty(latestInterview.status) : "Not scheduled"} good={latestInterview?.status === "completed"} /><Row label="Offer" value={latestOffer ? pretty(latestOffer.status) : "Not prepared"} good={latestOffer?.status === "accepted"} /><Row label="Provisioning" value={hasProvisioningProfile ? "Ready" : "Needs setup"} good={hasProvisioningProfile} /></div></div>
      </div>

      <div className="mt-4 rounded-2xl border border-blue-300/15 bg-blue-500/[0.06] p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" /><div><p className="font-black text-blue-100">Structured human review</p><p className="mt-1 text-sm leading-6 text-white/55">Use the same job-related criteria for candidates considered for the same role. Protected characteristics, medical/accommodation information, prior compensation, consumer credit, and pre-offer criminal-history information stay outside standard selection scoring.</p></div></div></div>
      {success ? <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-100">{success}</div> : null}
      {error ? <div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-sm font-bold text-red-100">{error}</div> : null}

      {panel === "scorecard" ? <Panel title="Structured scorecard" subtitle="Step through the same job-related rubric for every candidate." onClose={() => setPanel(null)}><div className="grid gap-3 md:grid-cols-2">{scoreCriteria.map(([key, label, helper], index) => <label key={key} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-white/75"><span>{label}</span><span className="mt-1 block text-xs font-medium leading-5 text-white/40">{helper}</span><select value={scores[key]} onChange={(e) => setScores((current) => ({ ...current, [key]: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-base text-white"><option value="">{index === 5 ? "Not applicable" : "Select 1–5"}</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}</div><label className="mt-4 block text-sm font-bold text-white/75">Recommendation<select value={recommendation} onChange={(e) => setRecommendation(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-base text-white"><option value="">Choose</option><option value="strong_yes">Strong yes</option><option value="yes">Yes</option><option value="hold">Hold / more evidence needed</option><option value="no">No</option></select></label><label className="mt-4 block text-sm font-bold text-white/75">Job-related evidence<textarea value={scoreNotes} onChange={(e) => setScoreNotes(e.target.value)} placeholder="Document evidence tied to the role requirements." className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-base text-white" /></label><ActionBar busy={busy} primaryLabel="Save scorecard" onPrimary={() => void saveScorecard()} onBack={() => setPanel(null)} /></Panel> : null}

      {panel === "interview" ? <Panel title="Schedule interview" subtitle={`Create the interview for ${candidateName} using the same Microsoft 365 calendar workflow as CRM.`} onClose={() => setPanel(null)}>
        <div className="rounded-2xl border border-rose-300/20 bg-rose-500/[0.07] p-4"><div className="flex gap-3"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-rose-200" /><div><p className="font-black">Microsoft 365 interview scheduler</p><p className="mt-1 text-sm leading-6 text-white/55">A video interview automatically creates an Outlook calendar event, invites the candidate, generates a Microsoft Teams meeting link, saves the link to the interview record, and sends the selected notifications.</p></div></div></div>
        <div className="mt-5 grid gap-4 md:grid-cols-3"><Input label="Interview date" type="date" value={interviewDate} onChange={setInterviewDate} /><Input label="Start time" type="time" value={interviewTime} onChange={setInterviewTime} /><label className="text-sm font-bold text-white/70">Duration<select value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-base text-white"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option></select></label></div>
        <div className="mt-5"><p className="text-sm font-black text-white/75">Interview format</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><FormatButton active={meetingType === "video"} icon={Video} title="Microsoft Teams" help="Creates Teams link" onClick={() => setMeetingType("video")} /><FormatButton active={meetingType === "phone"} icon={Phone} title="Phone" help="Calendar + notifications" onClick={() => setMeetingType("phone")} /><FormatButton active={meetingType === "in_person"} icon={MapPin} title="In person" help="Add an address" onClick={() => setMeetingType("in_person")} /></div></div>
        {meetingType === "in_person" ? <div className="mt-4"><Input label="Interview location" value={location} onChange={setLocation} placeholder="Office, venue, or address" /></div> : null}
        <label className="mt-5 block text-sm font-bold text-white/70">Candidate-facing note / agenda<textarea value={schedulerNotes} onChange={(e) => setSchedulerNotes(e.target.value)} placeholder="Optional preparation details or interview agenda." className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-base text-white" /></label>
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">Candidate notifications</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Toggle checked={sendEmail} onChange={setSendEmail} icon={Mail} title="Email confirmation" help="Branded interview confirmation plus Outlook invitation" /><Toggle checked={sendSms} onChange={setSendSms} icon={MessageSquareText} title="SMS confirmation" help="Date, time, and Teams link when available" /></div></div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs leading-5 text-white/45"><MonitorUp className="mt-0.5 h-4 w-4 shrink-0" />Times are scheduled in Eastern Time. The Microsoft 365 calendar event remains the source of truth for the meeting invitation and Teams join link. Scheduling also creates a structured role-specific interview guide for the interviewer.</div>
        <ActionBar busy={busy} primaryLabel={busy ? "Scheduling…" : "Create interview & notify"} onPrimary={() => void scheduleInterview()} onBack={() => setPanel(null)} />
      </Panel> : null}

      {panel === "complete_interview" ? <InterviewSessionPanel applicationId={applicationId} candidateName={candidateName} onClose={() => setPanel(null)} /> : null}

      {panel === "offer" ? <Panel title="Prepare offer" subtitle="Build the offer from the approved role, posted compensation, and documented evaluation." onClose={() => setPanel(null)}><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-bold text-white/70">Employment type<select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-base text-white"><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="internship">Internship</option><option value="contract">Contract</option></select></label><label className="text-sm font-bold text-white/70">Pay type<select value={payType} onChange={(e) => setPayType(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-base text-white"><option value="salary">Salary</option><option value="hourly">Hourly</option><option value="stipend">Stipend</option><option value="unpaid">Unpaid / credit</option></select></label><Input label="Proposed start date" type="date" value={startDate} onChange={setStartDate} /><Input label="Compensation / offer terms" value={compensation} onChange={setCompensation} placeholder="$18–$20/hour, 10 hours/week" /></div><ActionBar busy={busy} primaryLabel="Prepare offer" onPrimary={() => void callWorkflow("prepare_offer", { employmentType, payType, compensationText: compensation, startDate })} onBack={() => setPanel(null)} /></Panel> : null}

      {panel && ["hire", "reject", "talent"].includes(panel) ? <Panel title={panel === "hire" ? "Complete hiring decision" : panel === "reject" ? "Mark candidate not selected" : "Move candidate to talent pool"} subtitle="Use a documented, job-related reason for the decision." onClose={() => setPanel(null)}><label className="block text-sm font-bold text-white/70">Decision reason<select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-base text-white"><option value="">Choose a reason</option>{decisionOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{reasonCode === "other_job_related" ? <label className="mt-4 block text-sm font-bold text-white/70">Job-related explanation<textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-base text-white" /></label> : null}<ActionBar busy={busy} primaryLabel={panel === "hire" ? "Confirm hire" : panel === "reject" ? "Confirm not selected" : "Add to talent pool"} onPrimary={() => void callWorkflow(panel === "hire" ? "hire" : panel === "reject" ? "reject" : "talent_pool", { reasonCode, reason })} onBack={() => setPanel(null)} /></Panel> : null}
    </div>
  </section>;
}

function Panel({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0d]"><div className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5"><div><p className="text-lg font-black">{title}</p>{subtitle ? <p className="mt-1 max-w-3xl text-sm leading-6 text-white/50">{subtitle}</p> : null}</div><button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/60 hover:text-white"><X className="h-4 w-4" /></button></div><div className="p-4 sm:p-5">{children}</div></div>;
}
function Input({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="block text-sm font-bold text-white/70">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-base text-white [color-scheme:dark]" /></label>;
}
function FormatButton({ active, icon: Icon, title, help, onClick }: { active: boolean; icon: typeof Video; title: string; help: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`min-h-20 rounded-2xl border p-3 text-left transition ${active ? "border-rose-300/50 bg-rose-500/10" : "border-white/10 bg-white/[0.025] hover:border-white/20"}`}><div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${active ? "text-rose-200" : "text-white/40"}`} /><span className={`text-sm font-black ${active ? "text-white" : "text-white/65"}`}>{title}</span></div><p className="mt-1 text-xs text-white/35">{help}</p></button>;
}
function Toggle({ checked, onChange, icon: Icon, title, help }: { checked: boolean; onChange: (value: boolean) => void; icon: typeof Mail; title: string; help: string }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4" /><Icon className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" /><span><span className="block text-sm font-black text-white/75">{title}</span><span className="mt-0.5 block text-xs leading-5 text-white/35">{help}</span></span></label>;
}
function ActionBar({ busy, primaryLabel, onPrimary, onBack }: { busy: boolean; primaryLabel: string; onPrimary: () => void; onBack: () => void }) {
  return <div className="mt-6 flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={onBack} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white/65"><ChevronLeft className="h-4 w-4" /> Back</button><button type="button" disabled={busy} onClick={onPrimary} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-5 text-sm font-black text-white disabled:opacity-50">{primaryLabel}<ArrowRight className="h-4 w-4" /></button></div>;
}
function Row({ label, value, good = false }: { label: string; value: string; good?: boolean }) {
  return <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2 last:border-0 last:pb-0"><span className="text-white/45">{label}</span><span className={`text-right font-black ${good ? "text-emerald-200" : "text-white/70"}`}>{value}</span></div>;
}
