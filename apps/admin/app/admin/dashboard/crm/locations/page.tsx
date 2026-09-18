import { redirect } from "next/navigation";
import CRMPage from "../page";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  view?: string;
  filter?: string;
  page?: string;
  pageSize?: string;
  market?: string;
};

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requestedView = String(params.view || params.filter || "").toLowerCase();

  if (requestedView === "pending-claims") {
    redirect("/admin/dashboard/crm/claims");
  }

  return <CRMPage searchParams={Promise.resolve(params)} />;
}
