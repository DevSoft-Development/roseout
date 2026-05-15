import { requireAdminRole } from "@/lib/admin-auth";
import LocationLayoutClient from "@/components/LocationLayoutClient";

export default async function ReserveLocationLayoutPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  return <LocationLayoutClient backHref="/reserve/dashboard" />;
}