import { requireAdminRole } from "@theouthaven/auth/admin-session";
import CronJobsClient from "./CronJobsClient";

export const dynamic = "force-dynamic";

export default async function AdminCronJobsPage() {
  await requireAdminRole(["superadmin", "admin"]);
  return <section className="grid gap-6"><CronJobsClient /></section>;
}
