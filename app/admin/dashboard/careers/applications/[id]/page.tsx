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

type CareerJobRelation = { title: string; department: string; slug: string; is_internship: boolean | null; internship_type: string | null };
type ApplicationRow = { id: string; first_name: string; last_name: string; email: string; phone: string | null; city: string | null; state: string | null; resume_url: string | null; linkedin_url: string | null; portfolio_url: string | null; website_url: string | null; social_handle: string | null; source: string | null; submitted_at: string | null; stage: string; score: number | null; cover_letter: string | null; career_jobs: CareerJobRelation | readonly CareerJobRelation[] | null };
type AnswerRow = { id: string; question_label: string; answer_text: string | null };
type NoteRow = { id: string; note: string };
type HistoryRow = { id: string; created_at: string; from_stage: string | null; to_stage: string };

const applicationProjection = "id,first_name,last_name,email,phone,city,state,resume_url,linkedin_url,portfolio_url,website_url,social_handle,source,submitted_at,stage,score,cover_letter,career_jobs(title,department,slug,is_internship,internship_type)";

export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
  const { id } = await params;
  const results = await Promise.all([
    supabaseAdmin.from("career_applications").select(applicationProjection).eq("id", id).maybeSingle(),
    supabaseAdmin.from("career_application_answers").select("id,question_label,answer_text").eq("application_id", id),
    supabaseAdmin.from("career_application_notes").select("id,note,created_at").eq("application_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("career_application_stage_history").select("id,created_at,from_stage,to_stage").eq("application_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("career_interviews").select("id,status,scheduled_at").eq("application_id", id),
    supabaseAdmin.from("career_offers").select("id,status,created_at,start_date,accepted_at").eq("application_id", id),
    supabaseAdmin.from("career_content_tests").select("id,status,score").eq("application_id", id),
    supabaseAdmin.from("career_team_conversions").select("id,company_email,provisioning_status,offboarding_status").eq("application_id", id).maybeSingle(),
  ]);
  const [applicationResult, answersResult, notesResult, historyResult, interviewsResult, offersResult, testsResult, conversionResult] = results;
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

  return <AdminPageShell>
    <AdminPageHeader eyebrow="Applicant CRM Profile" title={name} subtitle={`${job?.title ?? "Career application"} · Applied ${formatCareerDate(application.submitted_at)} · ${getNextRecommendedAction(application.stage)}`} badge={<AdminStatusBadge tone={getCareerStageTone(application.stage)}>{formatCareerStage(application.stage)}</AdminStatusBadge>} actions={<><AdminActionButton href="/admin/dashboard/careers/applications">Applications</AdminActionButton><AdminActionButton href={`mailto:${application.email}`} variant="primary">Email</AdminActionButton></>} />
    {canOnboard ? <AdminSectionCard className="mb-5 p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-rose-200">Employee lifecycle</p><h2 className="mt-1 text-xl font-black">{conversion?.provisioning_status === "completed" ? "Employee provisioned" : "Candidate ready for onboarding"}</h2><p className="mt-1 text-sm text-white/60">Company email defaults to firstname@theouthaven.com. Provisioning uses the job's approved CRM role and employee profile.</p></div><EmployeeLifecycleActions conversionId={conversion?.id} applicationId={application.id} companyEmail={conversion?.company_email} provisioningStatus={conversion?.provisioning_status} offboardingStatus={conversion?.offboarding_status} /></div></AdminSectionCard> : null}
    <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
      <AdminDetailPanel><AdminDetailSection title="Profile"><div className="space-y-2 text-sm text-white/70"><p className="font-black text-white">{name}</p><p>{application.email}</p><p>{application.phone ?? "No phone"}</p><p>{[application.city, application.state].filter(Boolean).join(", ") || "No location"}</p>{application.resume_url ? <p><Link className="text-rose-200" href={application.resume_url}>View resume</Link></p> : null}{[["LinkedIn", application.linkedin_url], ["Portfolio", application.portfolio_url], ["Website", application.website_url]].map(([label, url]) => url ? <p key={label}><Link className="text-rose-200" href={url}>{label}</Link></p> : null)}<p>Social: {application.social_handle ?? "—"}</p><p>Source: {application.source ?? "careers_page"}</p></div></AdminDetailSection></AdminDetailPanel>
      <div className="space-y-4">
        <AdminSectionCard className="p-5"><h2 className="text-xl font-black">Overview</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/65">{application.cover_letter ?? "No cover letter provided."}</p></AdminSectionCard>
        <AdminSectionCard className="p-5"><h2 className="text-xl font-black">Application Answers</h2><div className="mt-3 grid gap-3">{answers.map((answer) => <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={answer.id}><p className="text-xs font-black text-white/45">{answer.question_label}</p><p className="mt-1 whitespace-pre-line text-sm text-white/75">{answer.answer_text}</p></div>)}</div></AdminSectionCard>
        <AdminSectionCard className="p-5"><h2 className="text-xl font-black">Notes</h2><div className="mt-3 grid gap-2">{notes.map((note) => <p className="rounded-xl bg-black/20 p-3 text-sm text-white/70" key={note.id}>{note.note}</p>)}</div></AdminSectionCard>
        <AdminSectionCard className="p-5"><h2 className="text-xl font-black">Hiring records</h2><p className="mt-2 text-sm text-white/60">{interviewsResult.data?.length ?? 0} interviews · {offersResult.data?.length ?? 0} offers · {testsResult.data?.length ?? 0} content tests · Score {application.score ?? "not scored"}</p></AdminSectionCard>
        <AdminSectionCard className="p-5"><h2 className="text-xl font-black">Timeline</h2><div className="mt-3 grid gap-2">{history.map((item) => <p className="text-sm text-white/60" key={item.id}>{formatCareerDate(item.created_at)} · {formatCareerStage(item.from_stage)} → {formatCareerStage(item.to_stage)}</p>)}</div></AdminSectionCard>
      </div>
    </div>
  </AdminPageShell>;
}
