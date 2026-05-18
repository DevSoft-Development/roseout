import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

export const metadata: Metadata = {
  title: "Create Location Layout | TheOutHaven Reserve",
  description: "Create layout areas guests can reserve.",
};

export default async function CreateReserveDashboardLocationLayoutPage() {
  await requireAdminRole(["superuser", "admin", "editor"]);

  return <LocationLayoutClient backHref="/reserve/dashboard/location-layout" createMode />;
}
