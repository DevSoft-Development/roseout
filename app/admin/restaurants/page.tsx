import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Restaurants Admin",
  description: "Manage restaurant listings in TheOutHaven admin.",
  path: "/admin/restaurants",
  noIndex: true,
});
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
  }>;
};

export default async function AdminRestaurantsRedirectPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();

  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", params.page);

  query.set("type", "restaurants");

  redirect(`/admin/locations?${query.toString()}`);
}
