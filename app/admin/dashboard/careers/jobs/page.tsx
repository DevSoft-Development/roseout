import Link from "next/link";
import { AdminActionButton, AdminDataTableShell, AdminEmptyState, AdminPageHeader, AdminPageShell, AdminStatusBadge } from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatCareerDate, getCompensationLabel, getJobStatusTone } from "@/lib/careers/format";
import type { CareerJob } from "@/lib/careers/types";

type CareerApplicationJobReference = { job_id: string | null };
function formatValue(value?: string | null) { return value ? value.replace(/_/g, " ") : "—"; }

export default async function Page() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
  const { data } = await supabaseAdmin.from("career_jobs").select("*").order("created_at", { ascending: false }).limit(100);
  const jobs = (data || []) as CareerJob[];
  let counts: Record<string, number> = {};
  if (jobs.length) {
    const { data: applications } = await supabaseAdmin.from("career_applications").select("job_id").in("job_id", jobs.map((job) => job.id));
    const applicationRows = (applications || []) as CareerApplicationJobReference[];
    counts = applicationRows.reduce<Record<string, number>>((acc, app) => { if (app.job_id) acc[app.job_id] = (acc[app.job_id] || 0) + 1; return acc; }, {});
  }

  return <AdminPageShell><AdminPageHeader eyebrow="Careers CRM" title="Jobs Manager" subtitle="Create, edit, pause, close, archive, and preview TheOutHaven career roles." actions={<><AdminActionButton href="/admin/dashboard/careers">Overview</AdminActionButton><AdminActionButton href="/admin/dashboard/careers/jobs/new" variant="primary">Create Job</AdminActionButton></>} />
    {jobs.length === 0 ? <AdminEmptyState title="No career jobs have been created yet." body="Create your first public or private career posting for TheOutHaven." action={<AdminActionButton href="/admin/dashboard/careers/jobs/new" variant="primary">Create Job</AdminActionButton>} /> : <AdminDataTableShell><table className="min-w-[980px] text-sm"><thead className="text-left text-xs uppercase tracking-wider text-white/40"><tr><th className="p-3">Role</th><th className="p-3">Department</th><th className="p-3">Type</th><th className="p-3">Compensation</th><th className="p-3">Status</th><th className="p-3">Visibility</th><th className="p-3">Applicants</th><th className="p-3">Created</th><th className="p-3">Actions</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id} className="border-t border-white/10 align-top"><td className="p-3"><Link className="font-black text-white hover:text-rose-100" href={`/admin/dashboard/careers/jobs/${job.id}`}>{job.title || "Untitled role"}</Link><p className="mt-1 text-xs text-white/45">{job.location || "Location not set"}</p></td><td className="p-3 capitalize text-white/70">{formatValue(job.department)}</td><td className="p-3 capitalize text-white/70">{formatValue(job.employment_type)}</td><td className="p-3 text-white/70">{getCompensationLabel(job)}</td><td className="p-3"><AdminStatusBadge tone={getJobStatusTone(job.status)}>{formatValue(job.status)}</AdminStatusBadge></td><td className="p-3 capitalize text-white/70">{formatValue(job.visibility)}</td><td className="p-3 font-black text-white">{counts[job.id] || 0}</td><td className="p-3 text-white/60">{formatCareerDate(job.created_at)}</td><td className="p-3"><div className="flex flex-wrap gap-3"><Link className="font-black text-rose-200" href={`/admin/dashboard/careers/jobs/${job.id}`}>Open</Link><Link className="font-black text-rose-200" href={`/admin/dashboard/careers/jobs/${job.id}`}>Edit</Link>{job.slug ? <Link className="font-black text-rose-200" href={`/careers/${job.slug}`}>Preview</Link> : null}<Link className="font-black text-rose-200" href={`/admin/dashboard/careers/applications?jobId=${job.id}`}>Applications</Link></div></td></tr>)}</tbody></table></AdminDataTableShell>}
  </AdminPageShell>;
}
