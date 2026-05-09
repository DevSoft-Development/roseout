import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Reservation Portal",
  description:
    "Access reservation tools and booking management for TheOutHaven partners.",
  path: "/reserve/portal",
  noIndex: true,
});
export default function OldReservePortalPage() {
  redirect("/reserve/dashboard");
}
