import { redirect } from "next/navigation";

export default function LegacyAdminLocationsPage() {
  redirect("/admin/dashboard/locations");
}
