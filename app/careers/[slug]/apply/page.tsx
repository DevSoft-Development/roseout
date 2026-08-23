import { notFound } from "next/navigation";
import CareersApplyForm from "@/components/CareersApplyForm";
import { requiresInternshipComplianceChecklist, isMarketingJob } from "@/lib/careers/format";
import { NEW_YORK_APPLICANT_NOTICE } from "@/lib/careers/new-york-compliance";
import { getCareerJobQuestions, getPublicCareerJobBySlug } from "@/lib/careers/queries";

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job: any = await getPublicCareerJobBySlug(slug);
  if (!job || job.status !== "open") notFound();
  const questions: any[] = await getCareerJobQuestions(job.id);

  return <main className="min-h-screen bg-[#050505] text-white"><section className="mx-auto max-w-3xl px-4 py-12"><p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Apply to TheOutHaven</p><h1 className="mt-3 text-3xl font-black">{job.title}</h1><p className="mt-3 text-sm leading-6 text-white/65">Tell us about yourself and the work you are excited to do with TheOutHaven. Your application stays private with our hiring team.</p><div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-500/[0.08] p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100">New York applicant rights</p><p className="mt-2 text-sm leading-6 text-white/70">{NEW_YORK_APPLICANT_NOTICE}</p><p className="mt-2 text-xs leading-5 text-white/50">If you need a reasonable accommodation to apply or interview, request it from the hiring team. Accommodation information is handled separately and is not part of candidate scoring.</p></div><CareersApplyForm job={job} questions={questions} showMarketingLinks={isMarketingJob(job)} showSchoolCredit={requiresInternshipComplianceChecklist(job)} /></section></main>;
}
