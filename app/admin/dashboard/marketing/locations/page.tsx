import { redirect } from "next/navigation";

export default function MarketingLocationsPage() {
  redirect("/admin/dashboard/marketing/reports?type=locations&autorun=1");
}
