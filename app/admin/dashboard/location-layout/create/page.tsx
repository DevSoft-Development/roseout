import type { Metadata } from "next";
import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

export const metadata: Metadata = {
  title: "Create/Edit Location Layout | TheOutHaven Admin",
  description: "Admin create/edit flow for any location layout.",
};

export default async function AdminLocationLayoutCreatePage() {
  await requireAdminRole(["superadmin", "admin", "editor"]);
  return <LocationLayoutClient backHref="/admin/dashboard/location-layout" createMode adminMode />;
}
