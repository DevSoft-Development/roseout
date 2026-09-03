import Link from "next/link";
import { redirect } from "next/navigation";
import ReserveEnterpriseReports from "@/components/reserve/ReserveEnterpriseReports";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function ReserveReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const locationId = first(params.adminLocationId) || first(params.locationId) || "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/locations/dashboard/reservations/reports");
  const access = await getLocationOwnerAccess(user.id, user.email ?? null);
  if (!access.isAdmin && locationId && !access.ownedLocationIds.includes(locationId) && !access.ownedSourceLocationIds.includes(locationId)) redirect("/locations/dashboard");
  if (!locationId) redirect("/locations/dashboard/reservations");
  const key = first(params.adminLocationId) ? "adminLocationId" : "locationId";
  return <div className="min-h-screen bg-[#050607] text-white"><div className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-[#07090d]/95 px-4 py-3 backdrop-blur-xl"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff6b86]">Reserve analytics</p><p className="text-sm font-black">Operational reporting</p></div><Link href={`/locations/dashboard/reservations?${key}=${encodeURIComponent(locationId)}`} className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-xs font-black">Back to Reserve</Link></div><ReserveEnterpriseReports locationId={locationId} /></div>;
}