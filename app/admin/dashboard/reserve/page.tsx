import { redirect } from "next/navigation";

export default function RedirectLegacyReservationAdminPage() {
  redirect("/admin/dashboard/reservations?tab=floor");
}
