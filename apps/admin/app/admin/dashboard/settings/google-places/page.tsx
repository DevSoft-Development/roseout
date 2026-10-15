import { redirect } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";

export default async function RetiredGooglePlacesSettingsPage() {
  await requireAdminRole(["superadmin", "admin"]);
  redirect("/admin/dashboard/settings/location-tools");
}
