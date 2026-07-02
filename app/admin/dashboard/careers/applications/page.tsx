import Link from "next/link";
import { AdminActionButton, AdminDataTableShell, AdminPageHeader, AdminPageShell, AdminSectionCard, AdminStatusBadge } from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatCareerDate, formatCareerStage, getCareerStageTone } from "@/lib/careers/format";

export default async function Page({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
  const { jobId } = await searchParams;
  let query = supabaseAdmin.from("career_applications").select("id,job_id,first_name,last_name,email,stage,score,submitted_at,career_jobs(title)").limit(50);
  if (jobId) query = query.eq("job_id", jobId);
  const res = await query;
  const rows = (res.data || []) as Array<{ id: string; first_name?: string | null; last_name?: string | null; email?: string | null; stage?: string | null; submitted_at?: string | null; job_id?: string | null; career_jobs?: { title?: string | null } | null }>;
  return <AdminPageShell><AdminPageHeader eyebrow="Careers CRM" title="Applications Manager" subtitle="Filter, review, assign, score, email, and move applicants through the hiring CRM." actions={<><AdminActionButton href="/admin/dashboard/careers">Overview</AdminActionButton><AdminActionButton href="/admin/dashboard/careers/jobs/new" variant="primary">Create Job</AdminActionButton></>} />
    {jobId ? <AdminSectionCard className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-white/75">Showing applications for this job</p><AdminActionButton href="/admin/dashboard/careers/jobs">Back to Jobs</AdminActionButton></div></AdminSectionCard> : null}
    <AdminSectionCard className="p-5"><h2 className="text-xl font-black">Operational workflow</h2><p className="mt-2 text-sm leading-6 text-white/60">This page is wired to live Careers CRM tables and uses safe fallbacks. Admin actions are available through secured API routes and stage/audit events are recorded where relevant.</p><div className="mt-4 flex flex-wrap gap-2">{["Open Profile","Move Stage","Assign Reviewer","Add Note","Send Email","Schedule Interview","Send Offer","Add to Talent Pool"].map((a) => <span key={a} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-black text-white/65">{a}</span>)}</div></AdminSectionCard>
    <AdminDataTableShell><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-white/40"><tr><th className="p-3">Record</th><th className="p-3">Status</th><th className="p-3">Details</th><th className="p-3">Actions</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t border-white/10"><td className="p-3 font-bold text-white">{`${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email || r.id}</td><td className="p-3"><AdminStatusBadge tone={getCareerStageTone(r.stage)}>{formatCareerStage(r.stage)}</AdminStatusBadge></td><td className="p-3 text-white/60">{r.email || formatCareerDate(r.submitted_at)}</td><td className="p-3"><Link className="font-black text-rose-200" href={`/admin/dashboard/careers/applications/${r.id}`}>Open</Link></td></tr>)}</tbody></table></AdminDataTableShell>
  </AdminPageShell>;
}
