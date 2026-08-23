import {
  AdminActionButton,
  AdminDetailPanel,
  AdminDetailSection,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { calculateApplicantDisplayName, formatCareerDate, formatCareerStage, getCareerStageTone, getNextRecommendedAction } from "@/lib/careers/format";
import { normalizeSingleRelation } from "@/lib/supabase/relations";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmployeeLifecycleActions from "../../team-conversion/EmployeeLifecycleActions";
import HiringWorkflow from "./HiringWorkflow";

type CareerJobRelation = { title: string; department: string; slug: string; is_internship: boolean | null; internship_type: string | null };
type ApplicationRow = { id: string; job_id: string | null; first_name: string; last_name: string; email: string; phone: string | null; city: string | null; state: string | null; resume_url: string | null; linkedin_url: string | null; portfolio_url: string | null; website_url: string | null; social_handle: string | null; source: string | null; submitted_at: string | null; stage: string; score: number | null; cover_letter: string | null; career_jobs: CareerJobRelation | readonly CareerJobRelation[] | null };
type AnswerRow = { id: string; question_label: string; answer_text: string | null };
type NoteRow = { id: string; note: string };
type HistoryRow = { id: string; created_at: string; from_stage: string | null; to_stage: string };

const applicationProjection = "id,job_id,first_name,last_name,email,phone,city,state,resume_url,linkedin_url,portfolio_url,website_url,social_handle,source,submitted_at,stage,score,cover_letter,career_jobs(title,department,slug,is_internship,internship_type)";

export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
  const { id } = await params;
  const results = await Promise.all([
    supabaseAdmin.from("career_applications").select(applicationProjection).eq("id", id).maybeSingle(),
    supabaseAdmin.from("career_application_answers").select("id,question_label,answer_text").eq("application_id", id),
    supabaseAdmin.from("career_application_notes").select("id,note,created_at").eq("application_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("career_application_stage_history").select("id,created_at,from_stage,to_stage").eq("application_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("career_interviews").select("id,status,scheduled_at,meeting_type").eq("application_id", id).order("scheduled_at", { ascending: false }),
    supabaseAdmin.from("career_offers").select("id,status,created_at,start_date,accepted_at,compensation_text").eq("application_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("career_content_tests").select("id,status,score").eq("application_id", id),
    supabaseAdmin.from("career_team_conversions").select("id,company_email,provisioning_status,offboarding_status").eq("application_id", id).maybeSingle(),
    supabaseAdmin.from("career_application_scorecards").select("id,communication_score,experience_score,role_fit_score,availability_score,professionalism_score,market_knowledge_score,overall_score,recommendation,notes,created_at").eq("application_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const [applicationResult, answersResult, notesResult, historyResult, interviewsResult, offersResult, testsResult, conversionResult, scorecardResult] = results;
  for (const result of results) if (result.error) throw new Error(`Unable to load applicant CRM: ${result.error.message}`);
  if (!applicationResult.data) notFound();

  const application: ApplicationRow = applicationResult.data;
  const job = normalizeSingleRelation(application.career_jobs);
  const answers: AnswerRow[] = answersResult.data ?? [];
  const notes: NoteRow[] = notesResult.data ?? [];
  const history: HistoryRow[] = historyResult.data ?? [];
  const name = calculateApplicantDisplayName(application);
  const acceptedOffer = (offersResult.data ?? []).some((offer) => offer.status === "accepted");
  const canOnboard = application.stage === "hired" || acceptedOffer;
  const conversion = conversionResult.data;
  const latestInterview = interviewsResult.data?.[0] ?? null;
  const latestOffer = offersResult.data?.[0] ?? null;
  const latestScorecard = scorecardResult.data ?? null;

  let hasProvisioningProfile = false;
  if (application.job_id) {
    const profileResult = await supabaseAdmin.from("career_job_provisioning_profiles").select("id").eq("job_id", application.job_id).eq("is_active", true).maybeSingle();
    if (profileResult.error) throw new Error(`Unable to load provisioning profile: ${profileResult.error.message}`);
    hasProvisioningProfile = Boolean(profileResult.data);
  }

  return <AdminPageShell>
    <AdminPageHeader eyebrow="Applicant CRM Profile" title={name} subtitle={`${job?.title ?? "Career application"} · Applied ${formatCareerDate(application.submitted_at)} · ${getNextRecommendedAction(application.stage)}`} badge={<AdminStatusBadge tone={getCareerStageTone(application.stage)}>{formatCareerStage(application.stage)}</AdminStatusBadge>} actions={<><AdminActionButton href="/admin/dashboard/careers/pipeline">Hiring Pipeline</AdminActionButton><AdminActionButton href="/admin/dashboard/careers/applications">Applications</AdminActionButton><AdminActionButton href={`mailto:${application.email}`} variant="primary">Email</AdminActionButton></>} />

    <AdminSectionCard className="border-emerald-300/15 p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100">New York selection controls</p><h2 className="mt-1 text-xl font-black">Job-related, structured, human-decided hiring</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-white/60">Apply the same documented requirements and interview criteria to candidates for this role. Salary history, protected characteristics, medical/accommodation information, consumer credit history, and criminal-history information are blocked from standard selection notes. For NYC applicants, criminal history belongs only in a separate post-conditional-offer Fair Chance process.</p></div><span className="inline-flex h-fit rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-100">NY / NYC</span></div><div className="mt-4 grid gap-2 text-xs leading-5 text-white/55 md:grid-cols-2"><p>• No salary-history questions or reliance on prior pay.</p><p>• No protected-class or medical information in scoring/notes.</p><p>• No pre-offer NYC criminal-history inquiries or background-check language.</p><p>• No consumer-credit screening in the standard NYC workflow.</p><p>• Accommodation requests stay separate from selection scoring.</p><p>• AI may assist drafting/admin work, but does not make the employment decision.</p></div></AdminSectionCard>

    <HiringWorkflow applicationId={application.id} candidateName={name} stage={application.stage} latestScorecard={latestScorecard} latestInterview={latestInterview} latestOffer={latestOffer} hasProvisioningProfile={hasProvisioningProfile} />

    {canOnboard ? <AdminSectionCard className="p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-rose-200">Employee lifecycle</p><h2 className="mt-1 text-xl font-black">{conversion?.provisioning_status === "completed" ? "Employee provisioned" : "Hiring complete — ready for onboarding"}</h2><p className="mt-1 text-sm text-white/60">The hiring decision is complete. Provisioning uses the job's approved CRM role, Microsoft 365 Business Premium license, and employee profile.</p></div><EmployeeLifecycleActions conversionId={conversion?.id} applicationId={application.id} companyEmail={conversion?.company_email} provisioningStatus={conversion?.provisioning_status} offboardingStatus={conversion?.offboarding_status} /></div></AdminSectionCard> : null}

    <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
      <AdminDetailPanel><AdminDetailSection title="Candidate profile"><div className="space-y-2 text-sm text-white/70"><p className="font-black text-white">{name}</p><p>{application.email}</p><p>{application.phone ?? "No phone"}</p><p>{[application.city, application.state].filter(Boolean).join(", ") || "No location"}</p>{application.resume_url ? <p><Link className="text-rose-200" href={application.resume_url}>View resume</Link></p> : null}{[["LinkedIn", application.linkedin_url], ["Portfolio", application.portfolio_url], ["Website", application.website_url]].map(([label, url]) => url ? <p key={label}><Link className="text-rose-200" href={url}>{label}</Link></p> : null)}<p>Social: {application.social_handle ?? "—"}</p><p>Source: {application.source ?? "careers_page"}</p></div></AdminDetailSection><div className="mt-4"><AdminDetailSection title="Evaluation discipline"><p className="text-xs leading-5 text-white/55">Use candidate links only when they are relevant to the work being evaluated. Do not infer or record protected characteristics from a name, photo, school, social profile, address, or other personal information.</p></AdminDetailSection></div></AdminDetailPanel>
      <div className="space-y-4">
        <AdminSectionCard className="p-5"><h2 className="text-xl font-black">Overview</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/65">{application.cover_letter ?? "No cover letter provided."}</p></AdminSectionCard>
        <AdminSectionCard className="p-5"><h2 className="text-xl font-black">Application answers</h2><div className="mt-3 grid gap-3">{answers.length ? answers.map((answer) => <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={answer.id}><p className="text-xs font-black text-white/45">{answer.question_label}</p><p className="mt-1 whitespace-pre-line text-sm text-white/75">{answer.answer_text}</p></div>) : <p className="text-sm text-white/45">No custom application answers.</p>}</div></AdminSectionCard>
        <AdminSectionCard className="p-5"><h2 className="text-xl font-black">Hiring records</h2><p className="mt-2 text-sm text-white/60">{interviewsResult.data?.length ?? 0} interviews · {offersResult.data?.length ?? 0} offers · {testsResult.data?.length ?? 0} content tests · Structured score {latestScorecard?.overall_score ?? application.score ?? "not scored"}</p>{latestScorecard ? <p className="mt-2 text-xs text-white/45">Latest recommendation: {formatCareerStage(latestScorecard.recommendation)}</p> : null}</AdminSectionCard>
        <AdminSectionCard className="p-5"><h2 className="text-xl font-black">Internal notes</h2><p className="mt-1 text-xs text-white/40">Keep notes job-related. New York salary history, protected characteristics, medical information, accommodation details, credit history, and criminal-history information are blocked from this note stream.</p><div className="mt-3 grid gap-2">{notes.length ? notes.map((note) => <p className="rounded-xl bg-black/20 p-3 text-sm text-white/70" key={note.id}>{note.note}</p>) : <p className="text-sm text-white/45">No internal notes.</p>}</div></AdminSectionCard>
        <AdminSectionCard className="p-5"><h2 className="text-xl font-black">Audit timeline</h2><div className="mt-3 grid gap-2">{history.length ? history.map((item) => <p className="text-sm text-white/60" key={item.id}>{formatCareerDate(item.created_at)} · {formatCareerStage(item.from_stage)} → {formatCareerStage(item.to_stage)}</p>) : <p className="text-sm text-white/45">No stage changes yet.</p>}</div></AdminSectionCard>
      </div>
    </div>
  </AdminPageShell>;
}
