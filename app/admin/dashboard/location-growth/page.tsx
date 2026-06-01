import { redirect } from "next/navigation";

export default function LocationGrowthRedirectPage() {
  redirect("/admin/dashboard/import?tab=nyc");
}
