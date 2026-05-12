import { redirect } from "next/navigation";

export default function AdminDashboardReservationsRedirect() {
  redirect("/reserve/dashboard/reservations");
}
