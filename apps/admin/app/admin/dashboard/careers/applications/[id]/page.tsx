import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { calculateApplicantDisplayName, formatCareerDate, formatCareerStage, getCareerStageTone, getNextRecommendedAction } from "@/lib/careers/format";
import HiringWorkflow from "./HiringWorkflow";

export const dynamic = "force-dynamic";

function toneClass(tone:string){
  if(tone==="green")return"border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if(tone==="amber")return"border-amber-400/25 bg-amber-400/10 text-amber-100";
  if(tone==="red")return"border-red-400/25 bg-red-400/10 text-red-100";
  if(tone==="blue")return"border-sky-400/25 bg-sky-400/10 text-sky-100";
  if(tone==="rose")return"border-rose-400/25 bg-rose-400/10 text-rose-100";
  return"border-white/10 bg-white/[.04] text-white/70";
}
function relation(value:any){return Array.isArray(value)?value[0]||null:value||null}
function dt(value:any){if(!value)return"—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleString("en-US");}

export default async function ApplicationDetail({params}:{params:Promise<{id:string}>}){
  await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
  const {id}=await params;
  const db=getAdminDatabaseClient();
  const results=await Promise.all([
    db.from("career_applications").select("id,job_id,first_name,last_name,email,phone,city,state,resume_url,linkedin_url,portfolio_url,website_url,social_handle,source,submitted_at,stage,score,cover_letter,career_jobs(title,department,slug,is_internship,internship_type)").eq("id",id).maybeSingle(),
    db.from("career_application_answers").select("id,question_label,answer_text").eq("application_id",id),
    db.from("career_application_notes").select("id,note,created_at").eq("application_id",id).order("created_at",{ascending:false}),
    db.from("career_application_stage_history").select("id,created_at,from_stage,to_stage").eq("application_id",id).order("created_at",{ascending:false}),
    db.from("career_interviews").select("id,status,scheduled_at,meeting_type").eq("application_id",id).order("scheduled_at",{ascending:false}),
    db.from("career_offers").select("id,status,created_at,start_date,accepted_at,compensation_text").eq("application_id",id).order("created_at",{ascending:false}),
    db.from("career_application_scorecards").select("id,communication_score,experience_score,role_fit_score,availability_score,professionalism_score,market_knowledge_score,overall_score,recommendation,notes,created_at").eq("application_id",id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
  ]);
  for(const r of results)if(r.error)throw new Error(r.error.message);
  const application:any=results[0].data;if(!application)notFound();
  const job:any=relation(application.career_jobs);
  const name=calculateApplicantDisplayName(application);
  const interviews:any[]=results[4].data||[];
  const offers:any[]=results[5].data||[];
  const latestInterview=interviews[0]||null;
  const latestOffer=offers[0]||null;
  const latestScorecard:any=results[6].data||null;
  let hasProvisioningProfile=false;
  if(application.job_id){
    const pr=await db.from("career_job_provisioning_profiles").select("id").eq("job_id",application.job_id).eq("is_active",true).maybeSingle();
    if(pr.error)throw pr.error;hasProvisioningProfile=Boolean(pr.data);
  }
  const tone=getCareerStageTone(application.stage);
  return <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-[1450px] space-y-5">
    <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.24em] text-rose-300">Applicant CRM Profile</p><h1 className="mt-2 text-4xl font-black">{name}</h1><p className="mt-2 text-white/55">{job?.title||"Career application"} · Applied {formatCareerDate(application.submitted_at)} · {getNextRecommendedAction(application.stage)}</p></div><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-2 text-xs font-black ${toneClass(tone)}`}>{formatCareerStage(application.stage)}</span><Link href="/admin/dashboard/careers/applications" className="rounded-xl border border-white/15 px-4 py-2.5 font-black">Applications</Link><a href={`mailto:${application.email}`} className="rounded-xl bg-white px-4 py-2.5 font-black text-black">Email</a></div></div></header>
    <section className="rounded-3xl border border-emerald-300/15 bg-emerald-500/[.05] p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Structured human hiring</p><h2 className="mt-1 text-xl font-black">Job-related criteria only</h2><p className="mt-2 text-sm leading-6 text-white/60">Salary history, protected characteristics, medical/accommodation information, consumer credit history, and pre-offer criminal-history information remain outside standard selection scoring. AI assists workflow administration but does not make the employment decision.</p></section>
    <HiringWorkflow applicationId={application.id} candidateName={name} stage={application.stage} latestScorecard={latestScorecard} latestInterview={latestInterview} latestOffer={latestOffer} hasProvisioningProfile={hasProvisioningProfile}/>
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <aside className="space-y-4"><section className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><h2 className="font-black">Candidate profile</h2><div className="mt-3 space-y-2 text-sm text-white/65"><p><b className="text-white">{name}</b></p><p>{application.email}</p><p>{application.phone||"No phone"}</p><p>{[application.city,application.state].filter(Boolean).join(", ")||"No location"}</p>{application.resume_url?<p><Link className="text-rose-200" href={application.resume_url}>Resume</Link></p>:null}{application.linkedin_url?<p><Link className="text-rose-200" href={application.linkedin_url}>LinkedIn</Link></p>:null}{application.portfolio_url?<p><Link className="text-rose-200" href={application.portfolio_url}>Portfolio</Link></p>:null}<p>Source: {application.source||"careers_page"}</p></div></section>
      <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><h2 className="font-black">Interviews</h2><div className="mt-3 space-y-2">{interviews.map((x:any)=><div key={x.id} className="rounded-xl bg-black/25 p-3 text-sm"><b>{formatCareerStage(x.status||"scheduled")}</b><p className="mt-1 text-xs text-white/40">{dt(x.scheduled_at)} · {x.meeting_type||"—"}</p></div>)}{!interviews.length?<p className="text-sm text-white/45">No interviews yet.</p>:null}</div></section></aside>
      <div className="space-y-4">
        <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><h2 className="text-xl font-black">Cover letter</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/65">{application.cover_letter||"No cover letter provided."}</p></section>
        <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><h2 className="text-xl font-black">Application answers</h2><div className="mt-3 space-y-3">{(results[1].data||[]).map((a:any)=><div key={a.id} className="rounded-xl bg-black/25 p-4"><p className="text-xs font-black uppercase tracking-wide text-white/40">{a.question_label}</p><p className="mt-2 whitespace-pre-wrap text-sm text-white/70">{a.answer_text||"—"}</p></div>)}{!(results[1].data||[]).length?<p className="text-sm text-white/45">No custom answers.</p>:null}</div></section>
        <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><h2 className="text-xl font-black">Stage history</h2><div className="mt-3 space-y-2">{(results[3].data||[]).map((h:any)=><div key={h.id} className="flex justify-between gap-4 rounded-xl bg-black/25 p-3 text-sm"><span>{formatCareerStage(h.from_stage||"submitted")} → <b>{formatCareerStage(h.to_stage)}</b></span><span className="text-white/40">{dt(h.created_at)}</span></div>)}</div></section>
        <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><h2 className="text-xl font-black">Internal notes</h2><div className="mt-3 space-y-2">{(results[2].data||[]).map((n:any)=><div key={n.id} className="rounded-xl bg-black/25 p-3 text-sm"><p>{n.note}</p><p className="mt-1 text-xs text-white/35">{dt(n.created_at)}</p></div>)}{!(results[2].data||[]).length?<p className="text-sm text-white/45">No notes.</p>:null}</div></section>
      </div>
    </div>
  </div></main>;
}
