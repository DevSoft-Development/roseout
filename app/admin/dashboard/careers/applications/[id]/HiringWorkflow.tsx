"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Circle,
  FileCheck2,
  Scale,
  Send,
  ShieldCheck,
  UserCheck,
  UserRoundSearch,
  UsersRound,
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

const stageGroups = [
  { key: "application", label: "Application", stages: ["submitted", "portfolio_review", "under_review"] },
  { key: "qualified", label: "Qualified", stages: ["shortlisted"] },
  { key: "interview", label: "Interview", stages: ["interview_requested", "interview_scheduled", "interview_completed", "content_test"] },
  { key: "offer", label: "Offer", stages: ["offer_pending", "offer_sent"] },
  { key: "hired", label: "Hired", stages: ["hired"] },
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

function groupIndex(stage: string) {
  if (["not_selected", "withdrawn", "talent_pool"].includes(stage)) return -1;
  return stageGroups.findIndex((group) => (group.stages as readonly string[]).includes(stage));
}

function primaryFor(stage: string) {
  switch (stage) {
    case "submitted":
    case "portfolio_review": return { label: "Start review", action: "start_review", icon: UserRoundSearch, help: "Open a structured, job-related candidate review." };
    case "under_review": return { label: "Shortlist candidate", action: "shortlist", icon: CheckCircle2, help: "Requires a completed structured scorecard." };
    case "shortlisted": return { label: "Request interview", action: "request_interview", icon: CalendarClock, help: "Move the candidate into interview planning." };
    case "interview_requested": return { label: "Schedule interview", action: "schedule_interview", icon: CalendarClock, help: "Choose a date, time, and interview format." };
    case "interview_scheduled": return { label: "Complete interview", action: "complete_interview", icon: FileCheck2, help: "Capture only job-related interview evidence." };
    case "interview_completed":
    case "content_test": return { label: "Prepare offer", action: "prepare_offer", icon: FileCheck2, help: "Build the offer from the documented evaluation." };
    case "offer_pending": return { label: "Mark offer sent", action: "send_offer", icon: Send, help: "Confirm the approved offer was delivered to the candidate." };
    case "offer_sent": return { label: "Mark accepted & hire", action: "hire", icon: UserCheck, help: "Record acceptance and complete the hiring decision." };
    case "hired": return { label: "Hiring complete", action: "done", icon: ShieldCheck, help: "Use the Employee lifecycle card below to provision access." };
    default: return { label: "Reopen review", action: "reopen", icon: ArrowRight, help: "Return this candidate to structured review." };
  }
}

export default function HiringWorkflow({ applicationId, candidateName, stage, latestScorecard, latestInterview, latestOffer, hasProvisioningProfile }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState("30");
  const [meetingType, setMeetingType] = useState("video");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [location, setLocation] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [compensation, setCompensation] = useState(latestOffer?.compensation_text || "");
  const [startDate, setStartDate] = useState(latestOffer?.start_date || "");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [payType, setPayType] = useState("salary");
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [recommendation, setRecommendation] = useState(latestScorecard?.recommendation || "");
  const [scoreNotes, setScoreNotes] = useState(latestScorecard?.notes || "");
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(scoreCriteria.map(([key]) => [key, latestScorecard?.[key] == null ? "" : String(latestScorecard[key])] )));

  const currentGroup = groupIndex(stage);
  const primary = useMemo(() => primaryFor(stage), [stage]);
  const PrimaryIcon = primary.icon;
  const scorecardReady = Boolean(latestScorecard?.overall_score && latestScorecard?.recommendation);

  async function callWorkflow(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError("");
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
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/careers/applications/${applicationId}/scorecard`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scores, recommendation, notes: scoreNotes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We could not save the scorecard.");
      setPanel(null); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "We could not save the scorecard."); }
    finally { setBusy(false); }
  }

  function openDecision(next: Panel) { setReasonCode(""); setReason(""); setPanel(next); }
  function primaryClick() {
    if (primary.action === "done") return;
    if (primary.action === "schedule_interview") return setPanel("interview");
    if (primary.action === "complete_interview") return setPanel("complete_interview");
    if (primary.action === "prepare_offer") return setPanel("offer");
    if (primary.action === "hire") return openDecision("hire");
    void callWorkflow(primary.action);
  }

  const decisionOptions = panel === "hire" ? hireReasons : panel === "reject" ? rejectReasons : talentReasons;

  return <section className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,0.10),transparent_34%),#101012] shadow-2xl shadow-black/25">
    <div className="border-b border-white/10 p-5 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-rose-200"><BriefcaseBusiness className="h-4 w-4" /> Hiring workflow</div><h2 className="mt-2 text-2xl font-black">Applicant → Employee</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-white/55">A guided hiring flow with structured evaluation, interview, offer, hiring decision, and employee-provisioning handoff.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPanel("scorecard")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white/75 hover:text-white"><Scale className="h-4 w-4" /> {scorecardReady ? "Update scorecard" : "Complete scorecard"}</button>
          {!['hired','not_selected','withdrawn'].includes(stage) ? <button onClick={() => openDecision("hire")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-4 text-sm font-black text-emerald-100"><UserCheck className="h-4 w-4" /> Hire candidate</button> : null}
          {!['hired','not_selected','withdrawn'].includes(stage) ? <button onClick={() => openDecision("talent")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white/70"><UsersRound className="h-4 w-4" /> Talent pool</button> : null}
          {!['hired','not_selected','withdrawn'].includes(stage) ? <button onClick={() => openDecision("reject")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-300/20 bg-red-500/10 px-4 text-sm font-black text-red-100"><X className="h-4 w-4" /> Not selected</button> : null}
        </div>
      </div>
    </div>

    <div className="p-5 sm:p-6">
      <div className="overflow-x-auto pb-2"><div className="grid min-w-[760px] grid-cols-5 gap-2">{stageGroups.map((group, index) => { const active = currentGroup === index; const complete = currentGroup > index || stage === "hired"; return <div key={group.key} className={`rounded-2xl border p-3 ${active ? "border-rose-300/50 bg-rose-500/10" : complete ? "border-emerald-300/20 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.025]"}`}><div className="flex items-center gap-2">{complete ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Circle className={`h-4 w-4 ${active ? "text-rose-200" : "text-white/25"}`} />}<span className={`text-xs font-black uppercase tracking-[0.14em] ${active ? "text-rose-100" : complete ? "text-emerald-100" : "text-white/35"}`}>{group.label}</span></div><p className="mt-2 text-xs text-white/45">{active ? pretty(stage) : complete ? "Complete" : "Upcoming"}</p></div>; })}</div></div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5"><div className="flex gap-4"><div className="h-fit rounded-2xl border border-rose-300/20 bg-rose-500/10 p-3 text-rose-100"><PrimaryIcon className="h-5 w-5" /></div><div><p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Recommended next action</p><h3 className="mt-1 text-xl font-black">{primary.label}</h3><p className="mt-1 text-sm text-white/55">{primary.help}</p>{primary.action !== "done" ? <button disabled={busy} onClick={primaryClick} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ec0b5b] px-5 text-sm font-black text-white disabled:opacity-50">{busy ? "Working…" : primary.label}<ArrowRight className="h-4 w-4" /></button> : null}</div></div></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Hiring readiness</p><div className="mt-3 space-y-3 text-sm"><Row label="Structured scorecard" value={scorecardReady ? `${latestScorecard?.overall_score}/5 · ${pretty(latestScorecard?.recommendation)}` : "Required"} good={scorecardReady} /><Row label="Interview" value={latestInterview ? pretty(latestInterview.status) : "Not scheduled"} /><Row label="Offer" value={latestOffer ? pretty(latestOffer.status) : "Not prepared"} /><Row label="Provisioning profile" value={hasProvisioningProfile ? "Ready" : "Needs setup"} good={hasProvisioningProfile} /></div></div>
      </div>

      <div className="mt-4 rounded-2xl border border-blue-300/15 bg-blue-500/[0.06] p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" /><div><p className="font-black text-blue-100">EEO guardrails active</p><p className="mt-1 text-sm leading-6 text-white/55">Use the same job-related criteria for candidates considered for the same role. Do not use race, color, religion, sex, pregnancy, sexual orientation, gender identity, national origin, age, disability, genetic information, or other protected characteristics in a hiring decision. Do not enter protected-trait or medical information in evaluation notes. Accommodation requests should be handled separately from candidate scoring. This workflow does not make automated hiring decisions.</p></div></div></div>
      {error ? <div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-sm font-bold text-red-100">{error}</div> : null}

      {panel === "scorecard" ? <Panel title="Structured job-related scorecard" onClose={() => setPanel(null)}><p className="mb-4 text-sm leading-6 text-white/55">Score observable, job-related evidence only. Apply the same rubric to people being considered for this role. 1 = does not meet documented requirement; 5 = clearly exceeds it.</p><div className="grid gap-3 md:grid-cols-2">{scoreCriteria.map(([key, label, helper], index) => <label key={key} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-white/75"><span>{label}</span><span className="mt-1 block text-xs font-medium leading-5 text-white/40">{helper}</span><select value={scores[key]} onChange={(e) => setScores((current) => ({ ...current, [key]: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-2.5 text-white"><option value="">{index === 5 ? "Not applicable" : "Select 1–5"}</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}</div><label className="mt-3 block text-sm font-bold text-white/75">Recommendation<select value={recommendation} onChange={(e) => setRecommendation(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-2.5 text-white"><option value="">Choose</option><option value="strong_yes">Strong yes</option><option value="yes">Yes</option><option value="hold">Hold / more evidence needed</option><option value="no">No</option></select></label><label className="mt-3 block text-sm font-bold text-white/75">Job-related evidence notes<textarea value={scoreNotes} onChange={(e) => setScoreNotes(e.target.value)} placeholder="Document evidence tied to the job requirements. Do not record protected characteristics or medical information." className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label><ActionButton busy={busy} label="Save structured scorecard" onClick={() => void saveScorecard()} /></Panel> : null}

      {panel === "interview" ? <Panel title="Schedule structured interview" onClose={() => setPanel(null)}><div className="grid gap-3 md:grid-cols-2"><Input label="Date & time" type="datetime-local" value={scheduledAt} onChange={setScheduledAt} /><label className="text-sm font-bold text-white/70">Duration<select value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-white"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label><label className="text-sm font-bold text-white/70">Format<select value={meetingType} onChange={(e) => setMeetingType(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-white"><option value="video">Video</option><option value="phone">Phone</option><option value="in_person">In person</option></select></label><Input label={meetingType === "in_person" ? "Location" : "Meeting link (optional)"} value={meetingType === "in_person" ? location : meetingUrl} onChange={meetingType === "in_person" ? setLocation : setMeetingUrl} /></div><p className="mt-3 text-xs leading-5 text-white/40">Use the same core interview questions for candidates considered for this role. Handle disability or religious accommodation requests without changing the candidate's score.</p><ActionButton busy={busy} label="Schedule interview" onClick={() => void callWorkflow("schedule_interview", { scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : "", durationMinutes: duration, meetingType, meetingUrl, location })} /></Panel> : null}

      {panel === "complete_interview" ? <Panel title="Complete structured interview" onClose={() => setPanel(null)}><label className="text-sm font-bold text-white/70">Job-related interview evidence<textarea value={interviewNotes} onChange={(e) => setInterviewNotes(e.target.value)} placeholder="Record evidence tied to the interview questions and role requirements. Do not record protected-trait or medical information." className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label><ActionButton busy={busy} label="Complete interview" onClick={() => void callWorkflow("complete_interview", { outcome: "completed", notes: interviewNotes })} /></Panel> : null}

      {panel === "offer" ? <Panel title="Prepare offer" onClose={() => setPanel(null)}><div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-bold text-white/70">Employment type<select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-white"><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="internship">Internship</option><option value="contract">Contract</option></select></label><label className="text-sm font-bold text-white/70">Pay type<select value={payType} onChange={(e) => setPayType(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-white"><option value="salary">Salary</option><option value="hourly">Hourly</option><option value="stipend">Stipend</option><option value="unpaid">Unpaid / credit</option></select></label><Input label="Proposed start date" type="date" value={startDate} onChange={setStartDate} /></div><label className="mt-3 block text-sm font-bold text-white/70">Compensation / approved terms<textarea value={compensation} onChange={(e) => setCompensation(e.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label><ActionButton busy={busy} label="Prepare offer" onClick={() => void callWorkflow("prepare_offer", { compensationText: compensation, startDate, employmentType, payType })} /></Panel> : null}

      {panel === "hire" || panel === "reject" || panel === "talent" ? <Panel title={panel === "hire" ? `Hire ${candidateName}` : panel === "reject" ? "Mark candidate not selected" : "Move candidate to talent pool"} onClose={() => setPanel(null)}><p className="text-sm leading-6 text-white/55">Choose a documented, job-related reason. Avoid subjective labels such as “culture fit” and never reference a protected characteristic.</p><label className="mt-3 block text-sm font-bold text-white/70">Decision reason<select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0b0d] p-3 text-white"><option value="">Choose a reason</option>{decisionOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="mt-3 block text-sm font-bold text-white/70">Optional job-related note<textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required when choosing Other job-related reason." className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label>{panel === "hire" && !hasProvisioningProfile ? <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">This job does not currently have an active employee provisioning profile. You can complete the hiring decision, but onboarding must be configured before account provisioning.</p> : null}<ActionButton busy={busy} label={panel === "hire" ? "Confirm hire" : panel === "reject" ? "Confirm not selected" : "Add to talent pool"} onClick={() => void callWorkflow(panel === "hire" ? "hire" : panel === "reject" ? "reject" : "talent_pool", { reasonCode, reason })} /></Panel> : null}
    </div>
  </section>;
}

function Row({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="flex items-center justify-between gap-3"><span className="text-white/50">{label}</span><span className={good ? "text-right font-black text-emerald-200" : "text-right font-black text-white"}>{value}</span></div>; }
function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="mt-5 rounded-2xl border border-rose-300/20 bg-[#0b0b0d] p-5"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-lg font-black">{title}</h3><button type="button" onClick={onClose} className="rounded-lg p-2 text-white/45 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button></div>{children}</div>; }
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="text-sm font-bold text-white/70">{label}<input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none focus:border-rose-300/40" /></label>; }
function ActionButton({ busy, label, onClick }: { busy: boolean; label: string; onClick: () => void }) { return <div className="mt-4 flex justify-end"><button type="button" disabled={busy} onClick={onClick} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ec0b5b] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Working…" : label}<ArrowRight className="h-4 w-4" /></button></div>; }
