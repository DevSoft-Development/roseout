import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyClaimsPage() {
  redirect("/admin/dashboard/crm/locations?view=pending-claims");
}
