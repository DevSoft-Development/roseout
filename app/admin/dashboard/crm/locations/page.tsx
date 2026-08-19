import CRMPage from "../page";
import AdminClaimsPage from "@/app/admin/claims/AdminClaimsPage";

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
    return <AdminClaimsPage />;
  }

  return <CRMPage searchParams={Promise.resolve(params)} />;
}
