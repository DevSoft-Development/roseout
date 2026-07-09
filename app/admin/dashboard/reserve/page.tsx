import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function LegacyAdminReservePage() {
  redirect(`${ROUTES.adminReservations}?tab=floor`);
}
