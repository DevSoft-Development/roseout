import { redirect } from "next/navigation";

export default function LegacyBusinessFollowupsPage() {
  redirect("/admin/dashboard/crm/work-queue?view=follow-ups");
}
