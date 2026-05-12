import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";

export default async function ReserveDashboardPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  redirect("/reserve/dashboard/reservations");
}
