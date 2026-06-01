import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import ReservationDiscoveryClient from "./ReservationDiscoveryClient";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Reservation Link Discovery | TheOutHaven Admin",
  description: "Safely discover reservation links from Google Places, provider search, and small opt-in website batches.",
};

export default async function AdminReservationDiscoveryPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservations);
  return <ReservationDiscoveryClient />;
}
