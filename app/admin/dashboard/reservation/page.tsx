import { requireAdminRole } from "@/lib/admin-auth";
import ReservationDiscoveryClient from "./ReservationDiscoveryClient";

export default async function AdminReservationPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  return <ReservationDiscoveryClient />;
}
