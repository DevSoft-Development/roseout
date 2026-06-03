import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Admin Location Layout | TheOutHaven Admin",
  description: "Admin and superadmin reservation layout management.",
};

export default async function AdminDashboardLocationLayoutPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservationLayouts);

  return <LocationLayoutClient backHref="/admin/dashboard" adminMode />;
}
