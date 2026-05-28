import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

export const metadata: Metadata = {
  title: "Location Layout | TheOutHaven Reserve",
  description: "Business-friendly reservation layout editor for TheOutHaven Reserve.",
};

export default async function ReserveDashboardLocationLayoutPage() {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);

  return <LocationLayoutClient backHref="/reserve/dashboard" />;
}
