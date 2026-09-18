import { requireAdminRole } from "@theouthaven/auth/admin-session";
import ReservationOpportunitiesClient from "./ReservationOpportunitiesClient";

export const metadata = {
  title: "Reservation Opportunities | TheOutHaven Admin",
  description: "Sales opportunities for locations that may fit TheOutHaven Reserve.",
};

export default async function ReservationOpportunitiesPage() {
  await requireAdminRole(["superadmin", "admin", "manager", "ambassador", "partner_ambassador"]);
  return <ReservationOpportunitiesClient />;
}
