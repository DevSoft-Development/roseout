import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Create/Edit Location Layout | TheOutHaven Admin",
  description: "Admin create/edit flow for any location layout.",
};

export default async function AdminLocationLayoutCreatePage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservationLayouts);
  return <LocationLayoutClient backHref="/admin/dashboard/location-layout" createMode adminMode />;
}
