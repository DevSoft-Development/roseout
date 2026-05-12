import { requireAdminRole } from "@/lib/admin-auth";
import ReserveReservationsDashboardClient from "@/app/reserve/dashboard/reservations/ReserveReservationsDashboardClient";

export default async function AdminDashboardReservationsPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  return <ReserveReservationsDashboardClient />;
}
