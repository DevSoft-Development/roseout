import { AdminActionButton, AdminEmptyState, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminDesignSystem";
import { CareerJobEditForm } from "@/components/admin/careers/CareerJobEditForm";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import type { CareerJob } from "@/lib/careers/types";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminRole(["superadmin", "admin", "manager", "editor", "reviewer", "ambassador", "experience_team", "viewer"]);
  const { id } = await params;
  const { data } = await getAdminDatabaseClient().from("career_jobs").select("*").eq("id", id).maybeSingle();
  const job = data as CareerJob | null;
  if (!job) return <AdminPageShell><AdminPageHeader eyebrow="Careers CRM" title="Job posting not found" subtitle="We could not find that job posting." /><AdminEmptyState title="Job posting not found" body="This job may have been archived or removed." action={<AdminActionButton href="/admin/dashboard/careers/jobs">Back to Jobs</AdminActionButton>} /></AdminPageShell>;
  return <AdminPageShell><AdminPageHeader eyebrow="Careers CRM" title="Edit Job Posting" subtitle="Update role details, status, visibility, internship settings, and public posting copy." actions={<><AdminActionButton href="/admin/dashboard/careers/jobs">Back to Jobs</AdminActionButton>{job.slug ? <AdminActionButton href={`/careers/${job.slug}`}>Preview Public Posting</AdminActionButton> : null}<AdminActionButton href={`/admin/dashboard/careers/applications?jobId=${job.id}`}>View Applications</AdminActionButton></>} /><CareerJobEditForm job={job} /></AdminPageShell>;
}
