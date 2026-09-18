import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { CAREERS_VIEW_ROLES } from "@/lib/careers/access";
import {
  formatCareerDate,
  getCompensationLabel,
  getJobStatusTone,
} from "@/lib/careers/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs Manager – Careers CRM" };

type CareerJob = {
  id: string;
  title?: string | null;
  slug?: string | null;
  department?: string | null;
  location?: string | null;
  employment_type?: string | null;
  compensation_text?: string | null;
  compensation_min?: number | null;
  compensation_max?: number | null;
  compensation_type?: string | null;
  internship_type?: string | null;
  is_paid?: boolean | null;
  status?: string | null;
  visibility?: string | null;
  created_at?: string | null;
};

function formatValue(value?: string | null) {
  return value ? value.replaceAll("_", " ") : "—";
}

function toneClass(tone: ReturnType<typeof getJobStatusTone>) {
  if (tone === "green") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (tone === "amber") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (tone === "red") return "border-red-400/25 bg-red-400/10 text-red-100";
  if (tone === "blue") return "border-sky-400/25 bg-sky-400/10 text-sky-100";
  if (tone === "rose") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  return "border-white/10 bg-white/[.04] text-white/60";
}

export default async function CareersJobsPage() {
  await requireAdminRole([...CAREERS_VIEW_ROLES]);
  const db = getAdminDatabaseClient();

  const jobsResult = await db
    .from("career_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const jobs = (jobsResult.data || []) as CareerJob[];
  const counts: Record<string, number> = {};

  if (jobs.length) {
    const applicationsResult = await db
      .from("career_applications")
      .select("job_id")
      .in("job_id", jobs.map((job) => job.id));

    for (const application of applicationsResult.data || []) {
      if (application.job_id) {
        counts[application.job_id] = (counts[application.job_id] || 0) + 1;
      }
    }
  }

  const consumerOrigin = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Careers CRM</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Jobs Manager</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                Create, edit, pause, close, archive, and preview TheOutHaven career roles.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/dashboard/careers" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-black text-white/80">
                Overview
              </Link>
              <Link href="/admin/dashboard/careers/jobs/new" className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black">
                Create Job
              </Link>
            </div>
          </div>
        </header>

        {jobsResult.error ? (
          <section className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
            Unable to load career jobs: {jobsResult.error.message}
          </section>
        ) : null}

        {!jobs.length ? (
          <section className="rounded-3xl border border-dashed border-white/15 bg-[#120d0b] p-10 text-center">
            <h2 className="text-xl font-black">No career jobs have been created yet.</h2>
            <p className="mt-2 text-sm text-white/50">Create your first public or private career posting for TheOutHaven.</p>
            <Link href="/admin/dashboard/careers/jobs/new" className="mt-5 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black">
              Create Job
            </Link>
          </section>
        ) : (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-white/[.03] text-left text-[10px] uppercase tracking-[.16em] text-white/40">
                  <tr>
                    {["Role", "Department", "Type", "Compensation", "Status", "Visibility", "Applicants", "Created", "Actions"].map((heading) => (
                      <th key={heading} className="p-3">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const statusTone = getJobStatusTone(job.status);
                    return (
                      <tr key={job.id} className="border-t border-white/10 align-top">
                        <td className="p-3">
                          <Link className="font-black text-white hover:text-rose-100" href={`/admin/dashboard/careers/jobs/${job.id}`}>
                            {job.title || "Untitled role"}
                          </Link>
                          <p className="mt-1 text-xs text-white/45">{job.location || "Location not set"}</p>
                        </td>
                        <td className="p-3 capitalize text-white/70">{formatValue(job.department)}</td>
                        <td className="p-3 capitalize text-white/70">{formatValue(job.employment_type)}</td>
                        <td className="p-3 text-white/70">{getCompensationLabel(job)}</td>
                        <td className="p-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${toneClass(statusTone)}`}>
                            {formatValue(job.status)}
                          </span>
                        </td>
                        <td className="p-3 capitalize text-white/70">{formatValue(job.visibility)}</td>
                        <td className="p-3 font-black text-white">{counts[job.id] || 0}</td>
                        <td className="p-3 text-white/60">{formatCareerDate(job.created_at)}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-3">
                            <Link className="font-black text-rose-200" href={`/admin/dashboard/careers/jobs/${job.id}`}>Open</Link>
                            <Link className="font-black text-rose-200" href={`/admin/dashboard/careers/jobs/${job.id}`}>Edit</Link>
                            {job.slug ? (
                              <Link className="font-black text-rose-200" href={`${consumerOrigin}/careers/${job.slug}`}>Preview</Link>
                            ) : null}
                            <Link className="font-black text-rose-200" href={`/admin/dashboard/careers/applications?jobId=${job.id}`}>Applications</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
