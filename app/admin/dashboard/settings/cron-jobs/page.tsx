import { AdminPageShell } from "@/components/admin/AdminDesignSystem";
import CronJobsClient from "./CronJobsClient";

export const dynamic = "force-dynamic";

export default function AdminCronJobsPage() {
  return (
    <AdminPageShell>
      <CronJobsClient />
    </AdminPageShell>
  );
}
