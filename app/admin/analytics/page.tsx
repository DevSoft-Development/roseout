import { requireAdminRole } from "@/lib/admin-auth";
import AdminAnalyticsClient from "./AdminAnalyticsClient";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  await requireAdminRole(["superuser", "admin", "viewer"]);

  return <AdminAnalyticsClient />;
}
