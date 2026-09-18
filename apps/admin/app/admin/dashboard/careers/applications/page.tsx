import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { CAREERS_VIEW_ROLES } from "@/lib/careers/access";
import { formatCareerDate, formatCareerStage, getCareerStageTone } from "@/lib/careers/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applications Manager – Careers CRM" };

type Params = Promise<{ jobId?: string }>;

function toneClass(tone: ReturnType<typeof getCareerStageTone>) {
  if (tone === "green") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (tone === "amber") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (tone === "red") return "border-red-400/25 bg-red-400/10 text-red-100";
  if (tone === "blue") return "border-sky-400/25 bg-sky-400/10 text-sky-100";
  if (tone === "rose") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  return "border-white/10 bg-white/[.04] text-white/60";
}

export default async function CareersApplicationsPage({ searchParams }: { searchParams: Params }) {
  await requireAdminRole([...CAREERS_VIEW_ROLES]);
  const { jobId } = await searchParams;
  const db = getAdminDatabaseClient();

  let query = db
    .from("career_applications")
    .select("id,job_id,first_name,last_name,email,stage,score,submitted_at,career_jobs(title)")
    .order("submitted_at", { ascending: false })
    .limit(50);

  if (jobId) query = query.eq("job_id", jobId);
  const result = await query;
  const rows = result.data || [];

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Careers CRM</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Applications Manager</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                Filter and review applicants across the live Careers CRM.
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

        {jobId ? (
          <section className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-bold text-white/75">Showing applications for the selected job.</p>
              <Link href="/admin/dashboard/careers/jobs" className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-white/75">
                Back to Jobs
              </Link>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <h2 className="text-xl font-black">Operational workflow</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            This list reads from the live Careers CRM. Applicant detail actions remain isolated as separate route slices.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Open Profile", "Move Stage", "Assign Reviewer", "Add Note", "Send Email", "Schedule Interview", "Send Offer", "Add to Talent Pool"].map((action) => (
              <span key={action} className="rounded-full border border-white/10 bg-white/[.05] px-3 py-1 text-xs font-black text-white/65">
                {action}
              </span>
            ))}
          </div>
        </section>

        {result.error ? (
          <section className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
            Unable to load career applications: {result.error.message}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-white/[.03] text-left text-[10px] uppercase tracking-[.16em] text-white/40">
                  <tr><th className="p-3">Applicant</th><th className="p-3">Role</th><th className="p-3">Stage</th><th className="p-3">Applied</th><th className="p-3">Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => {
                    const job = Array.isArray(row.career_jobs) ? row.career_jobs[0] : row.career_jobs;
                    const name = `${row.first_name || ""} ${row.last_name || ""}`.trim() || row.email || row.id;
                    const tone = getCareerStageTone(row.stage);
                    return (
                      <tr key={row.id} className="border-t border-white/10">
                        <td className="p-3">
                          <p className="font-black text-white">{name}</p>
                          <p className="mt-1 text-xs text-white/40">{row.email || "No email"}</p>
                        </td>
                        <td className="p-3 text-white/65">{job?.title || "—"}</td>
                        <td className="p-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${toneClass(tone)}`}>
                            {formatCareerStage(row.stage)}
                          </span>
                        </td>
                        <td className="p-3 text-white/55">{formatCareerDate(row.submitted_at)}</td>
                        <td className="p-3">
                          <Link className="font-black text-rose-200" href={`/admin/dashboard/careers/applications/${row.id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-6 text-sm text-white/50">No applications match this view.</p>
          )}
        </section>
      </div>
    </main>
  );
}
