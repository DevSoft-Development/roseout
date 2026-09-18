import { redirect } from "next/navigation";

export default function LegacyAdminReservePage() {
  redirect("/admin/dashboard/reservations?tab=floor");
}
