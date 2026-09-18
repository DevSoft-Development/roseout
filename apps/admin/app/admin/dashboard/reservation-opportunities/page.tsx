import type { Metadata } from "next";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import ReservationOpportunitiesClient from "./ReservationOpportunitiesClient";

export const metadata: Metadata = {
  title: "Reservation Opportunities | TheOutHaven Admin",
  description:
    "Businesses without external reservation links that may fit TheOutHaven Reservations.",
};

export default async function ReservationOpportunitiesPage() {
  await requireAdminRole(["superadmin", "admin", "manager", "editor", "reviewer", "ambassador", "experience_team", "viewer"]);
  return <ReservationOpportunitiesClient />;
}
