import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Admin Home",
  description: "TheOutHaven administration home.",
  path: "/admin",
  noIndex: true,
});
export default function AdminPage() {
  redirect("/admin/dashboard");
}
