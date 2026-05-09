import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Owner Portal",
  description:
    "Manage your business presence and customer engagement on TheOutHaven.",
  path: "/owner",
  noIndex: true,
});
export default function OwnerPage() {
  redirect("/locations/dashboard");
}
