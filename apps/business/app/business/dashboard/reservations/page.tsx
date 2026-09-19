import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function LegacyBusinessReservationsPage() {
  redirect(ROUTES.reserveDashboardReservations);
}
