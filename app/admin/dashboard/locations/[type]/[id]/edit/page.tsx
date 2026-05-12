import { requireAdminRole } from "@/lib/admin-auth";
import EditLocationPage from "@/app/locations/[type]/[id]/edit/page";

export default async function AdminDashboardEditLocationPage() {
  await requireAdminRole(["superuser", "admin"]);

  return <EditLocationPage />;
}
