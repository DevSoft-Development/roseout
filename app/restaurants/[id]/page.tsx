import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Restaurant Details",
  description:
    "View restaurant details, rankings, and outing recommendations on TheOutHaven.",
  path: "/restaurants",
});
type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RestaurantRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/locations/restaurants/${id}`);
}
