import { redirect } from "next/navigation";

export default function RedirectPage() {
  redirect("/admin/dashboard/settings/location-tools/duplicates");
}
