import { redirect } from "next/navigation";

export default function LegacyNewLocationPage() {
  redirect("/admin/dashboard/crm/new");
}
