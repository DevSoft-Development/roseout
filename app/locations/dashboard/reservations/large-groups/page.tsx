import Link from "next/link";
import { redirect } from "next/navigation";
import ReserveLargeGroupSettings from "@/components/reserve/ReserveLargeGroupSettings";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function LargeGroupReservationSettingsPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const locationId = first(params.locationId) || first(params.adminLocationId) || "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/locations/dashboard/reservations/large-groups");

  const access = await getLocationOwnerAccess(user.id, user.email ?? null);
  if (locationId && !access.isAdmin && !access.ownedLocationIds.includes(locationId) && !access.ownedSourceLocationIds.includes(locationId)) redirect("/locations/dashboard");
  if (!access.isAdmin && !access.ownedLocationIds.length && !access.ownedSourceLocationIds.length) redirect("/create");

  const fallbackId = access.ownedLocationIds[0] || access.ownedSourceLocationIds[0] || "";
  const resolvedLocationId = locationId || fallbackId;
  const backParams = new URLSearchParams();
  if (first(params.adminLocationId)) backParams.set("adminLocationId", first(params.adminLocationId)!);
  else if (resolvedLocationId) backParams.set("locationId", resolvedLocationId);
  const backHref = `/locations/dashboard/reservations${backParams.toString() ? `?${backParams.toString()}` : ""}`;

  return <main className="min-h-screen bg-[#050607] px-4 py-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">TheOutHaven Reserve</p><h1 className="mt-1 text-3xl font-black">Large Group Settings</h1></div>
        <Link href={backHref} className="reserve-soft rounded-full px-4 py-2 text-sm font-black">← Back to Reserve</Link>
      </div>
      <ReserveLargeGroupSettings locationId={resolvedLocationId} />
    </div>
  </main>;
}
