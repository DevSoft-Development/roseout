import { requireAdminRole } from "@/lib/admin-auth";
import ReserveReservationsDashboardClient from "./ReserveReservationsDashboardClient";

export default async function ReserveDashboardReservationsPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  return <ReserveReservationsDashboardClient />;
}
