import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

export const metadata: Metadata = {
  title: "Admin Location Layout | TheOutHaven Admin",
  description: "Admin and superadmin reservation layout management.",
};

export default async function AdminDashboardLocationLayoutPage() {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);

  return <LocationLayoutClient backHref="/admin/dashboard" adminMode />;
}
