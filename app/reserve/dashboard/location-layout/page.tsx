import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Location Layout | TheOutHaven Reserve",
  description: "Business-friendly reservation layout editor for TheOutHaven Reserve.",
};

export default async function ReserveDashboardLocationLayoutPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservationLayouts);

  return <LocationLayoutClient backHref="/reserve/dashboard" />;
}
