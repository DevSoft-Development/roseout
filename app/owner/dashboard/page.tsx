import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Owner Dashboard",
  description:
    "Update your TheOutHaven business listing and review performance from the owner dashboard.",
  path: "/owner/dashboard",
  noIndex: true,
});
export default function OwnerDashboardPage() {
  redirect("/locations/dashboard");
}
