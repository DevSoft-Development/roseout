import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import AdminReserveLiveClient from "./AdminReserveLiveClient";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Live Reserve Operations | TheOutHaven Admin",
  description: "Admin-wide live reservation, waitlist, occupancy, and floor operations dashboard for every TheOutHaven location.",
};

export default async function AdminReservePage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservations);

  return <AdminReserveLiveClient />;
}
