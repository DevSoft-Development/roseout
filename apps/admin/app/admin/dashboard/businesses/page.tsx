export const dynamic = "force-dynamic";

import BusinessViewPage from "./view/page";

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; locationId?: string }>;
}) {
  return <BusinessViewPage searchParams={searchParams} />;
}
