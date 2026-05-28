import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import ReservationDiscoveryClient from "./ReservationDiscoveryClient";

export const metadata: Metadata = {
  title: "Reservation Link Discovery | TheOutHaven Admin",
  description: "Safely discover reservation links from Google Places, provider search, and small opt-in website batches.",
};

export default async function AdminReservationDiscoveryPage() {
  await requireAdminRole(["superadmin", "admin", "editor"]);
  return <ReservationDiscoveryClient />;
}
