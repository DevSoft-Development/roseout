import Link from "next/link";
import { redirect } from "next/navigation";
import ReserveServiceControlPanel from "@/components/reserve/ReserveServiceControlPanel";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReserveServicePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const locationId = first(params.adminLocationId) || first(params.locationId) || "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/locations/dashboard/reservations/service?locationId=${locationId}`)}`);
  const access = await getLocationOwnerAccess(user.id, user.email ?? null);
  if (!access.isAdmin && locationId && !access.ownedLocationIds.includes(locationId) && !access.ownedSourceLocationIds.includes(locationId)) redirect("/locations/dashboard");
  if (!locationId) redirect("/locations/dashboard/reservations");
  const query = new URLSearchParams();
  if (first(params.adminLocationId)) query.set("adminLocationId", locationId); else query.set("locationId", locationId);
  return (
    <div className="min-h-screen bg-[#050607] text-white">
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-[#07090d]/95 px-4 py-3 backdrop-blur-xl">
        <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff6b86]">Reserve operations</p><p className="text-sm font-black">Manager service setup</p></div>
        <Link href={`/locations/dashboard/reservations?host=1&${query.toString()}`} className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-xs font-black">Back to Host View</Link>
      </div>
      <ReserveServiceControlPanel locationId={locationId} />
    </div>
  );
}
