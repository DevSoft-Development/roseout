import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import ReservationOpportunitiesClient from "./ReservationOpportunitiesClient";

export const metadata: Metadata = {
  title: "Reservation Opportunities | TheOutHaven Admin",
  description:
    "Businesses without external reservation links that may fit TheOutHaven Reservations.",
};

export default async function ReservationOpportunitiesPage() {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);
  return <ReservationOpportunitiesClient />;
}
