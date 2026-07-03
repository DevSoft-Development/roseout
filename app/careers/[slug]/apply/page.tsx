import { notFound } from "next/navigation";
import CareersApplyForm from "@/components/CareersApplyForm";
import { getCareerJobQuestions, getPublicCareerJobBySlug } from "@/lib/careers/queries";
import { requiresInternshipComplianceChecklist, isMarketingJob } from "@/lib/careers/format";

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job: any = await getPublicCareerJobBySlug(slug);
  if (!job || job.status !== "open") notFound();
  const questions: any[] = await getCareerJobQuestions(job.id);

  return <main className="min-h-screen bg-[#050505] text-white"><section className="mx-auto max-w-3xl px-4 py-12"><p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Apply to TheOutHaven</p><h1 className="mt-3 text-3xl font-black">{job.title}</h1><p className="mt-3 text-sm leading-6 text-white/65">Tell us about yourself and the work you are excited to do with TheOutHaven. Your application stays private with our hiring team.</p><CareersApplyForm job={job} questions={questions} showMarketingLinks={isMarketingJob(job)} showSchoolCredit={requiresInternshipComplianceChecklist(job)} /></section></main>;
}
