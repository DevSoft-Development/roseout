import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Create Location Layout | TheOutHaven Reserve",
  description: "Create layout areas guests can reserve.",
};

export default async function CreateReserveDashboardLocationLayoutPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservationLayouts);

  return <LocationLayoutClient backHref="/reserve/dashboard/location-layout" createMode />;
}
