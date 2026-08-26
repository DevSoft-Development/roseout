import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LargeGroupReservationSettingsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  const adminLocationId = first(params.adminLocationId);
  const locationId = first(params.locationId);
  const type = first(params.type);
  const demo = first(params.demo);
  const fromDemoCenter = first(params.fromDemoCenter);

  if (adminLocationId) query.set("adminLocationId", adminLocationId);
  else if (locationId) query.set("locationId", locationId);
  if (type) query.set("type", type);
  if (demo) query.set("demo", demo);
  if (fromDemoCenter) query.set("fromDemoCenter", fromDemoCenter);
  query.set("section", "policies");

  redirect(`/locations/dashboard/reservations/settings?${query.toString()}`);
}
