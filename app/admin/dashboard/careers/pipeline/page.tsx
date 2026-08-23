import Link from "next/link";
import { AdminActionButton, AdminPageHeader, AdminPageShell, AdminSectionCard, AdminStatusBadge } from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatCareerDate, formatCareerStage, getCareerStageTone } from "@/lib/careers/format";
import { CheckCircle2, ClipboardList, MessagesSquare, Send, UserCheck, UsersRound } from "lucide-react";

const columns = [
  { key: "review", label: "Review", icon: ClipboardList, stages: ["submitted", "portfolio_review", "under_review"] },
  { key: "qualified", label: "Qualified", icon: CheckCircle2, stages: ["shortlisted"] },
  { key: "interview", label: "Interview", icon: MessagesSquare, stages: ["interview_requested", "interview_scheduled", "interview_completed", "content_test"] },
  { key: "offer", label: "Offer", icon: Send, stages: ["offer_pending", "offer_sent"] },
  { key: "hired", label: "Hired", icon: UserCheck, stages: ["hired"] },
] as const;

export default async function Page() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
  const { data, error } = await supabaseAdmin
    .from("career_applications")
    .select("id,first_name,last_name,email,stage,score,submitted_at,updated_at,career_jobs(title,department)")
    .order("updated_at", { ascending: false })
    .limit(150);
  if (error) throw new Error(`Unable to load hiring pipeline: ${error.message}`);
  const rows = data || [];
  const active = rows.filter((row) => !["not_selected", "withdrawn", "talent_pool"].includes(row.stage));
  const talent = rows.filter((row) => row.stage === "talent_pool");
  const closed = rows.filter((row) => ["not_selected", "withdrawn"].includes(row.stage));

  return <AdminPageShell>
    <AdminPageHeader eyebrow="Careers CRM" title="Hiring Pipeline" subtitle="A single operational board from application review through employee handoff. Open a candidate to evaluate, interview, offer, hire, or move them to the talent pool." actions={<><AdminActionButton href="/admin/dashboard/careers/applications">Applications</AdminActionButton><AdminActionButton href="/admin/dashboard/careers/jobs/new" variant="primary">Create Job</AdminActionButton></>} />

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Active candidates" value={active.length} />
      <Metric label="In interview" value={rows.filter((row) => ["interview_requested","interview_scheduled","interview_completed","content_test"].includes(row.stage)).length} />
      <Metric label="Offers" value={rows.filter((row) => ["offer_pending","offer_sent"].includes(row.stage)).length} />
      <Metric label="Hired" value={rows.filter((row) => row.stage === "hired").length} />
    </div>

    <AdminSectionCard className="p-4"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /><div><p className="font-black text-white">Structured hiring controls</p><p className="mt-1 text-sm leading-6 text-white/55">Candidates are moved through a documented flow. Shortlisting and hiring require a structured job-related scorecard, decision reasons use controlled job-related categories, and the profile includes EEO guardrails for interview notes and hiring decisions.</p></div></div></AdminSectionCard>

    <div className="overflow-x-auto pb-3"><div className="grid min-w-[1180px] grid-cols-5 gap-4">{columns.map((column) => {
      const Icon = column.icon;
      const candidates = rows.filter((row) => (column.stages as readonly string[]).includes(row.stage));
      return <section key={column.key} className="rounded-[1.35rem] border border-white/10 bg-[#0d0d0f] p-3 shadow-xl shadow-black/20">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-1 pb-3"><div className="flex items-center gap-2"><span className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-rose-100"><Icon className="h-4 w-4" /></span><div><h2 className="font-black text-white">{column.label}</h2><p className="text-xs text-white/35">{candidates.length} candidate{candidates.length === 1 ? "" : "s"}</p></div></div></div>
        <div className="mt-3 grid gap-3">{candidates.length ? candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} />) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs font-bold text-white/30">No candidates in this stage</div>}</div>
      </section>;
    })}</div></div>

    <div className="grid gap-4 lg:grid-cols-2">
      <AdminSectionCard className="p-5"><div className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-rose-200" /><h2 className="text-lg font-black">Talent pool</h2></div><p className="mt-1 text-sm text-white/45">Qualified people worth revisiting for a future role.</p><div className="mt-4 grid gap-2">{talent.length ? talent.slice(0, 12).map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} />) : <p className="text-sm text-white/35">No candidates in the talent pool.</p>}</div></AdminSectionCard>
      <AdminSectionCard className="p-5"><h2 className="text-lg font-black">Closed applications</h2><p className="mt-1 text-sm text-white/45">Not selected or withdrawn. Records remain available for audit and retention purposes.</p><div className="mt-4 grid gap-2">{closed.length ? closed.slice(0, 12).map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} />) : <p className="text-sm text-white/35">No closed applications.</p>}</div></AdminSectionCard>
    </div>
  </AdminPageShell>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{label}</p><p className="mt-1 text-2xl font-black text-white">{value}</p></div>; }

function CandidateCard({ candidate }: { candidate: any }) {
  const job = Array.isArray(candidate.career_jobs) ? candidate.career_jobs[0] : candidate.career_jobs;
  const name = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || candidate.email;
  return <Link href={`/admin/dashboard/careers/applications/${candidate.id}`} className="block rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-rose-300/30 hover:bg-white/[0.055]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black text-white">{name}</p><p className="mt-1 truncate text-xs text-white/45">{job?.title || "Career application"}</p></div><AdminStatusBadge tone={getCareerStageTone(candidate.stage)}>{formatCareerStage(candidate.stage)}</AdminStatusBadge></div><div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30">Score</p><p className="mt-1 text-sm font-black text-white/70">{candidate.score ? `${candidate.score}/5` : "Not scored"}</p></div><p className="text-right text-[11px] text-white/35">Applied {formatCareerDate(candidate.submitted_at)}</p></div></Link>;
}

function CandidateRow({ candidate }: { candidate: any }) { const name = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || candidate.email; return <Link href={`/admin/dashboard/careers/applications/${candidate.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3 hover:border-rose-300/30"><span className="min-w-0 truncate text-sm font-black text-white/75">{name}</span><AdminStatusBadge tone={getCareerStageTone(candidate.stage)}>{formatCareerStage(candidate.stage)}</AdminStatusBadge></Link>; }
