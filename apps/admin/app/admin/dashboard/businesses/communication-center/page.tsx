import { redirect } from "next/navigation";

export default function LegacyBusinessCommunicationCenterPage() {
  redirect("/admin/dashboard/crm/operations?view=communication-center");
}
