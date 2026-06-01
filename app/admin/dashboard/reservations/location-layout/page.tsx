import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Location Layout",
  description: "Admin visual reservation layout editor.",
};

export default async function AdminReservationLocationLayoutPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservationLayouts);

  return (
    <LocationLayoutClient
      backHref="/admin/dashboard/reservations"
      adminMode
    />
  );
}
