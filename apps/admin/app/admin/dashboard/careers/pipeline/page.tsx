import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { CAREERS_VIEW_ROLES } from "@/lib/careers/access";
import { formatCareerDate, formatCareerStage, getCareerStageTone } from "@/lib/careers/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hiring Pipeline – Careers CRM" };

const COLUMNS = [
  { key: "review", label: "Review", stages: ["submitted", "portfolio_review", "under_review"] },
  { key: "qualified", label: "Qualified", stages: ["shortlisted"] },
  { key: "interview", label: "Interview", stages: ["interview_requested", "interview_scheduled", "interview_completed", "content_test"] },
  { key: "offer", label: "Offer", stages: ["offer_pending", "offer_sent"] },
  { key: "hired", label: "Hired", stages: ["hired"] },
] as const;

function toneClass(tone: ReturnType<typeof getCareerStageTone>) {
  if (tone === "green") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (tone === "amber") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (tone === "red") return "border-red-400/25 bg-red-400/10 text-red-100";
  if (tone === "blue") return "border-sky-400/25 bg-sky-400/10 text-sky-100";
  if (tone === "rose") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  return "border-white/10 bg-white/[.04] text-white/60";
}

function CandidateBadge({ stage }: { stage?: string | null }) {
  const tone = getCareerStageTone(stage);
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${toneClass(tone)}`}>
      {formatCareerStage(stage)}
    </span>
  );
}

function CandidateCard({ candidate }: { candidate: any }) {
  const job = Array.isArray(candidate.career_jobs) ? candidate.career_jobs[0] : candidate.career_jobs;
  const name = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || candidate.email;
  return (
    <Link href={`/admin/dashboard/careers/applications/${candidate.id}`} className="block rounded-2xl border border-white/10 bg-white/[.035] p-4 transition hover:border-rose-300/30 hover:bg-white/[.055]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-black text-white">{name}</p>
          <p className="mt-1 truncate text-xs text-white/45">{job?.title || "Career application"}</p>
        </div>
        <CandidateBadge stage={candidate.stage} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30">Score</p>
          <p className="mt-1 text-sm font-black text-white/70">{candidate.score ? `${candidate.score}/5` : "Not scored"}</p>
        </div>
        <p className="text-right text-[11px] text-white/35">Applied {formatCareerDate(candidate.submitted_at)}</p>
      </div>
    </Link>
  );
}

function CandidateRow({ candidate }: { candidate: any }) {
  const name = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || candidate.email;
  return (
    <Link href={`/admin/dashboard/careers/applications/${candidate.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3 hover:border-rose-300/30">
      <span className="min-w-0 truncate text-sm font-black text-white/75">{name}</span>
      <CandidateBadge stage={candidate.stage} />
    </Link>
  );
}

export default async function CareersPipelinePage() {
  await requireAdminRole([...CAREERS_VIEW_ROLES]);
  const result = await getAdminDatabaseClient()
    .from("career_applications")
    .select("id,first_name,last_name,email,stage,score,submitted_at,updated_at,career_jobs(title,department)")
    .order("updated_at", { ascending: false })
    .limit(150);

  if (result.error) {
    throw new Error(`Unable to load hiring pipeline: ${result.error.message}`);
  }

  const rows = result.data || [];
  const active = rows.filter((row) => !["not_selected", "withdrawn", "talent_pool"].includes(row.stage));
  const talent = rows.filter((row) => row.stage === "talent_pool");
  const closed = rows.filter((row) => ["not_selected", "withdrawn"].includes(row.stage));

  const metrics = [
    ["Active candidates", active.length],
    ["In interview", rows.filter((row) => ["interview_requested", "interview_scheduled", "interview_completed", "content_test"].includes(row.stage)).length],
    ["Offers", rows.filter((row) => ["offer_pending", "offer_sent"].includes(row.stage)).length],
    ["Hired", rows.filter((row) => row.stage === "hired").length],
  ];

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">Careers CRM</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Hiring Pipeline</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                One recruiting workspace from application review through interviews, offers, hiring, and employee handoff.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/dashboard/careers/applications" className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-white/80">Applications</Link>
              <Link href="/admin/dashboard/careers/interviews" className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-white/80">Interviews</Link>
              <Link href="/admin/dashboard/careers/offers" className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-white/80">Offers</Link>
              <Link href="/admin/dashboard/careers/jobs/new" className="rounded-xl bg-white px-3 py-2 text-xs font-black text-black">Create Job</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.035] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{label}</p>
              <p className="mt-1 text-2xl font-black text-white">{value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.05] p-4">
          <p className="font-black text-white">Structured hiring controls</p>
          <p className="mt-1 text-sm leading-6 text-white/55">
            Candidates move through documented stages. Applicant detail workflows remain separate isolated route slices.
          </p>
        </section>

        <div className="overflow-x-auto pb-3">
          <div className="grid min-w-[1180px] grid-cols-5 gap-4">
            {COLUMNS.map((column) => {
              const candidates = rows.filter((row) => (column.stages as readonly string[]).includes(row.stage));
              return (
                <section key={column.key} className="rounded-[1.35rem] border border-white/10 bg-[#0d0d0f] p-3 shadow-xl shadow-black/20">
                  <div className="border-b border-white/10 px-1 pb-3">
                    <h2 className="font-black text-white">{column.label}</h2>
                    <p className="text-xs text-white/35">{candidates.length} candidate{candidates.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {candidates.length ? candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} />) : (
                      <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs font-bold text-white/30">No candidates in this stage</div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
            <h2 className="text-lg font-black">Talent pool</h2>
            <p className="mt-1 text-sm text-white/45">Qualified people worth revisiting for a future role.</p>
            <div className="mt-4 grid gap-2">
              {talent.length ? talent.slice(0, 12).map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} />) : <p className="text-sm text-white/35">No candidates in the talent pool.</p>}
            </div>
          </section>
          <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
            <h2 className="text-lg font-black">Closed applications</h2>
            <p className="mt-1 text-sm text-white/45">Not selected or withdrawn. Records remain available for audit and retention purposes.</p>
            <div className="mt-4 grid gap-2">
              {closed.length ? closed.slice(0, 12).map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} />) : <p className="text-sm text-white/35">No closed applications.</p>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
