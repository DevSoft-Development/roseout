import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Careers CRM – Admin" };

const CAREER_ROLES = [
  "superadmin",
  "admin",
  "manager",
  "editor",
  "reviewer",
  "ambassador",
  "experience_team",
  "viewer",
] as const;

const STAGE_LABELS: Record<string, string> = {
  submitted: "Submitted",
  portfolio_review: "Portfolio Review",
  under_review: "Under Review",
  shortlisted: "Shortlisted",
  interview_requested: "Interview Requested",
  interview_scheduled: "Interview Scheduled",
  interview_completed: "Interview Completed",
  content_test: "Content Test",
  offer_pending: "Offer Pending",
  offer_sent: "Offer Sent",
  hired: "Hired",
  not_selected: "No Longer Moving Forward",
  withdrawn: "Withdrawn",
  talent_pool: "Talent Pool",
};

function formatCareerDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCareerStage(stage?: string | null) {
  return STAGE_LABELS[String(stage || "")] || "Under Review";
}

function stageClass(stage?: string | null) {
  const value = String(stage || "");
  if (["offer_pending", "offer_sent", "hired"].includes(value)) {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  }
  if (["submitted", "interview_completed", "talent_pool"].includes(value)) {
    return "border-sky-400/25 bg-sky-400/10 text-sky-100";
  }
  if (["portfolio_review", "under_review", "content_test"].includes(value)) {
    return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  }
  if (["shortlisted", "interview_requested", "interview_scheduled"].includes(value)) {
    return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  }
  return "border-white/10 bg-white/[.04] text-white/60";
}

export default async function CareersAdminPage() {
  await requireAdminRole([...CAREER_ROLES]);
  const db = getAdminDatabaseClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const now = new Date();
  const sevenDaysAhead = new Date(now.getTime() + 7 * 864e5).toISOString();

  const [
    openRoles,
    newApplications,
    needsReview,
    marketingApplicants,
    internshipApplicants,
    interviews,
    offers,
    hired,
    recent,
  ] = await Promise.all([
    db.from("career_jobs").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("career_applications").select("id", { count: "exact", head: true }).gte("submitted_at", sevenDaysAgo),
    db.from("career_applications").select("id", { count: "exact", head: true }).in("stage", ["submitted", "portfolio_review", "under_review"]),
    db.from("career_applications").select("id", { count: "exact", head: true }).not("job_id", "is", null),
    db.from("career_applications").select("id", { count: "exact", head: true }).in("stage", ["submitted", "under_review", "interview_scheduled"]),
    db.from("career_interviews").select("id", { count: "exact", head: true }).gte("scheduled_at", now.toISOString()).lte("scheduled_at", sevenDaysAhead),
    db.from("career_offers").select("id", { count: "exact", head: true }).in("status", ["draft", "sent"]),
    db.from("career_applications").select("id", { count: "exact", head: true }).eq("stage", "hired"),
    db
      .from("career_applications")
      .select("id,first_name,last_name,email,stage,submitted_at,career_jobs(title,department)")
      .order("submitted_at", { ascending: false })
      .limit(8),
  ]);

  const metrics = [
    ["Open Roles", openRoles.count || 0],
    ["New Applications", newApplications.count || 0],
    ["Needs Review", needsReview.count || 0],
    ["Marketing Applicants", marketingApplicants.count || 0],
    ["Internship Applicants", internshipApplicants.count || 0],
    ["Interviews This Week", interviews.count || 0],
    ["Offers Pending", offers.count || 0],
    ["Hired", hired.count || 0],
  ];

  const tabs = [
    "jobs",
    "applications",
    "pipeline",
    "interviews",
    "offers",
    "talent-pool",
    "internships",
    "team-conversion",
    "marketing",
    "settings",
  ];

  const loadError =
    openRoles.error ||
    newApplications.error ||
    needsReview.error ||
    marketingApplicants.error ||
    internshipApplicants.error ||
    interviews.error ||
    offers.error ||
    hired.error ||
    recent.error;

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Careers CRM</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Hiring Command Center</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                Manage TheOutHaven roles, applicants, interviews, offers, internships, marketing hiring, and team conversion.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/dashboard/careers/jobs/new" className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black">
                Create Job
              </Link>
              <Link href="https://theouthaven.com/careers" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-black text-white/80">
                Public Careers
              </Link>
            </div>
          </div>
        </header>

        <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Careers sections">
          {tabs.map((tab) => (
            <Link
              className="shrink-0 rounded-xl border border-white/10 bg-white/[.05] px-3 py-2 text-xs font-black capitalize text-white/70"
              href={`/admin/dashboard/careers/${tab}`}
              key={tab}
            >
              {tab.replaceAll("-", " ")}
            </Link>
          ))}
        </nav>

        {loadError ? (
          <section className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
            Some careers metrics could not be loaded: {loadError.message}
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/40">{label}</p>
              <p className="mt-2 text-3xl font-black">{value}</p>
            </article>
          ))}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#120d0b]">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="text-xl font-black">Recent applications</h2>
              <p className="mt-1 text-sm text-white/45">Newest candidate activity across open hiring workflows.</p>
            </div>
            {recent.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-white/[.03] text-left text-[10px] uppercase tracking-[.16em] text-white/40">
                    <tr><th className="p-3">Applicant</th><th className="p-3">Role</th><th className="p-3">Stage</th><th className="p-3">Applied</th></tr>
                  </thead>
                  <tbody>
                    {recent.data.map((application: any) => {
                      const job = Array.isArray(application.career_jobs)
                        ? application.career_jobs[0]
                        : application.career_jobs;
                      return (
                        <tr key={application.id} className="border-t border-white/10">
                          <td className="p-3">
                            <Link href={`/admin/dashboard/careers/applications/${application.id}`} className="font-black text-white hover:text-rose-200">
                              {application.first_name} {application.last_name}
                            </Link>
                            <p className="mt-1 text-xs text-white/40">{application.email}</p>
                          </td>
                          <td className="p-3 text-white/65">{job?.title || "—"}</td>
                          <td className="p-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${stageClass(application.stage)}`}>
                              {formatCareerStage(application.stage)}
                            </span>
                          </td>
                          <td className="p-3 text-white/55">{formatCareerDate(application.submitted_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-6 text-sm text-white/50">No recent applications.</p>
            )}
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
            <h2 className="text-xl font-black">Quick Actions</h2>
            <p className="mt-1 text-sm text-white/45">Daily hiring queues to review.</p>
            <div className="mt-4 grid gap-2">
              {[
                ["Review stale applications", "/admin/dashboard/careers/applications"],
                ["Open portfolio review queue", "/admin/dashboard/careers/pipeline"],
                ["Check internship compliance", "/admin/dashboard/careers/internships"],
                ["Prepare pending offers", "/admin/dashboard/careers/offers"],
              ].map(([label, href]) => (
                <Link key={label} href={href} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-white/70 hover:border-rose-300/30 hover:text-white">
                  {label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
