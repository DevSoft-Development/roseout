import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

export const metadata: Metadata = {
  title: "Location Layout",
  description: "Admin visual reservation layout editor.",
};

export default async function AdminReservationLocationLayoutPage() {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);

  return (
    <LocationLayoutClient
      backHref="/admin/dashboard/reservations"
      adminMode
    />
  );
}
