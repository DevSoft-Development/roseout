import Link from "next/link";
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

  return (
    <main className="min-h-screen bg-[#050505] pt-20 text-white">
      <div className="border-b border-white/10 bg-[#09090b]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff2142]">TheOutHaven Careers</p>
            <p className="mt-1 text-sm font-bold text-white/55">Secure application portal</p>
          </div>
          <Link href={`/careers/${job.slug}`} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-white/70 transition hover:bg-white/[0.08] hover:text-white">
            Back to job posting
          </Link>
        </div>
      </div>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Apply to TheOutHaven</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{job.title}</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">Complete the application in four short steps. Your information stays private with authorized members of our hiring team.</p>
        </div>

        <CareersApplyForm
          job={job}
          questions={questions}
          showMarketingLinks={isMarketingJob(job)}
          showSchoolCredit={requiresInternshipComplianceChecklist(job)}
          applicantNotice={NEW_YORK_APPLICANT_NOTICE}
        />
      </section>
    </main>
  );
}
