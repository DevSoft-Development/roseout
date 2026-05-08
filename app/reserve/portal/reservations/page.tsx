import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Portal Reservations",
  description:
    "Review and manage reservation requests in the TheOutHaven partner portal.",
  path: "/reserve/portal/reservations",
  noIndex: true,
});
export default function OldReservePortalReservationsPage() {
  redirect("/reserve/dashboard/reservations");
}
