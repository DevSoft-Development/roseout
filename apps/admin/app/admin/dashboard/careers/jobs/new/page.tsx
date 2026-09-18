import { AdminActionButton, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminDesignSystem";
import { CareerJobEditForm } from "@/components/admin/careers/CareerJobEditForm";
import { requireAdminRole } from "@theouthaven/auth/admin-session";

export default async function Page() {
  await requireAdminRole(["superadmin", "admin", "manager", "editor", "reviewer", "ambassador", "experience_team", "viewer"]);
  return <AdminPageShell><AdminPageHeader eyebrow="Careers CRM" title="Create Job Posting" subtitle="Create a production-safe TheOutHaven role with core posting and internship fields." actions={<><AdminActionButton href="/admin/dashboard/careers/jobs">Back to Jobs</AdminActionButton><AdminActionButton href="/admin/dashboard/careers">Overview</AdminActionButton></>} /><CareerJobEditForm mode="create" /></AdminPageShell>;
}
