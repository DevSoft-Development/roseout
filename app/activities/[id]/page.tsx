import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Activity Details",
  description: "View activity details and recommendations on TheOutHaven.",
  path: "/activities",
});
type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ActivityRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/locations/activities/${id}`);
}
