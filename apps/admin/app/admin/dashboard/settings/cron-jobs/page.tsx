import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { AdminPageShell } from "../../../../../components/admin/AdminDesignSystem";
import CronJobsClient from "./CronJobsClient";

export const dynamic = "force-dynamic";

export default async function AdminCronJobsPage() {
  await requireAdminRole(["superadmin", "admin"]);
  return (
    <AdminPageShell>
      <CronJobsClient />
    </AdminPageShell>
  );
}
