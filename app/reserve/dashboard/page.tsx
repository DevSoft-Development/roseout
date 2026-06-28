import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import ReserveCommandCenterPage from "@/components/reserve/ReserveCommandCenterPage";

export const metadata: Metadata = {
  title: "Reserve Command Center | TheOutHaven",
  description: "Run TheOutHaven Reserve bookings, floor flow, waitlist, guests, and setup from one command center.",
};

export const dynamic = "force-dynamic";

export default async function ReserveDashboardPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservations);
  return <ReserveCommandCenterPage />;
}
