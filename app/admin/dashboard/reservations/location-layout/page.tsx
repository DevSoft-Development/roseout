import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

export default async function AdminReservationLocationLayoutPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  return (
    <LocationLayoutClient
      backHref="/admin/dashboard/reservations"
      adminMode
    />
  );
}