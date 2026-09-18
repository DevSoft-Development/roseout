import { redirect } from "next/navigation";

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

  redirect(`/admin/dashboard/locations?${query.toString()}`);
}