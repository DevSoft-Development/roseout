import { redirect } from "next/navigation";

export default function LegacyAdminReservationPage() {
  redirect("/admin/dashboard/reservations?tab=opportunities");
}
