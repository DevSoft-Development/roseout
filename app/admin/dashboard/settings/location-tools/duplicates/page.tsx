import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyDuplicateReviewPage() {
  redirect("/admin/dashboard/crm/location-health#duplicates");
}
