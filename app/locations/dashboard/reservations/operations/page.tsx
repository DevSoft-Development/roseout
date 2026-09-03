import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { hostAttentionItems, pacingWarnings } from "@/lib/reservations/enterpriseHost";

type ReserveOperationsReservation = {
  id: string;
  location_id: string;
  status: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number | null;
  seated_at: string | null;
  duration_minutes: number | null;
  turn_time_minutes: number | null;
  bookable_item_name: string | null;
};

type ReserveOperationsWaitlistEntry = {
  id: string;
  location_id: string;
  status: string | null;
  party_size: number | null;
  created_at: string;
};

type ReserveOperationsSettings = {
  location_id: string;
  max_covers_15m: number | null;
  max_covers_30m: number | null;
  assignment_mode: string | null;
};

function easternDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function ReserveOperationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/locations/dashboard/reservations/operations");
  const access = await getLocationOwnerAccess(user.id, user.email ?? null);
  let locationQuery = supabaseAdmin.from("locations").select("id,name,city,state,location_type").order("name").limit(100);
  if (!access.isAdmin) {
    const ids = [...new Set([...access.ownedLocationIds, ...access.ownedSourceLocationIds])];
    if (!ids.length) redirect("/locations/dashboard");
    locationQuery = locationQuery.in("id", ids);
  }
  const locationsResult = await locationQuery;
  const locations = locationsResult.data || [];
  const ids = locations.map((location) => location.id);
  const date = easternDate();
  const [reservationsResult, waitlistResult, settingsResult] = ids.length ? await Promise.all([
    supabaseAdmin.from("location_reservations").select("id,location_id,status,reservation_date,reservation_time,party_size,seated_at,duration_minutes,turn_time_minutes,bookable_item_name").in("location_id", ids).eq("reservation_date", date),
    supabaseAdmin.from("reservation_waitlist").select("id,location_id,status,party_size,created_at").in("location_id", ids).in("status", ["waiting","waitlisted","notified","pending"]),
    supabaseAdmin.from("reserve_service_settings").select("location_id,max_covers_15m,max_covers_30m,assignment_mode").in("location_id", ids),
  ]) : [{ data: [] }, { data: [] }, { data: [] }] as any;
  const reservations = (reservationsResult.data || []) as ReserveOperationsReservation[];
  const waitlist = (waitlistResult.data || []) as ReserveOperationsWaitlistEntry[];
  const settings = (settingsResult.data || []) as ReserveOperationsSettings[];
  const rows = locations.map((location) => {
    const locReservations = reservations.filter((row) => row.location_id === location.id);
    const locWaitlist = waitlist.filter((row) => row.location_id === location.id);
    const locSettings: Partial<ReserveOperationsSettings> = settings.find((row) => row.location_id === location.id) ?? {};
    const active = locReservations.filter((row) => !["cancelled","declined","completed","no_show"].includes(String(row.status || "").toLowerCase()));
    const seated = active.filter((row) => ["seated","occupied"].includes(String(row.status || "").toLowerCase()));
    const attention = hostAttentionItems(locReservations).length;
    const pacing = pacingWarnings(locReservations, locSettings).length;
    const assignmentMode = String(locSettings.assignment_mode || "balanced");
    return { location, reservations: locReservations.length, active: active.length, seatedCovers: seated.reduce((sum, row) => sum + Math.max(1, Number(row.party_size || 1)), 0), waiting: locWaitlist.length, attention, pacing, assignmentMode, healthy: attention === 0 && pacing === 0 };
  }).sort((a, b) => Number(a.healthy) - Number(b.healthy) || b.waiting - a.waiting);

  return <main className="min-h-screen bg-[#050607] p-4 text-white sm:p-6 lg:p-8"><div className="mx-auto max-w-7xl"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">TheOutHaven Reserve</p><h1 className="mt-1 text-3xl font-black">Multi-location operations</h1><p className="mt-2 text-sm font-semibold text-white/45">Live service pressure across every Reserve location you can operate.</p></div><div className="mt-6 grid gap-3">{rows.map((row) => <Link key={row.location.id} href={`/locations/dashboard/reservations?host=1&locationId=${encodeURIComponent(row.location.id)}`} className="group rounded-[1.25rem] border border-white/10 bg-[#0a0c10] p-4 transition hover:border-[#e1062a]/35 hover:bg-white/[0.04]"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2">{row.healthy ? <CheckCircle2 size={16} className="text-emerald-300" /> : <AlertTriangle size={16} className="text-[#ff8aa0]" />}<p className="truncate text-lg font-black">{row.location.name}</p></div><p className="mt-1 text-xs font-semibold text-white/35">{[row.location.city,row.location.state].filter(Boolean).join(", ")} · {row.assignmentMode} assignment</p></div><div className="flex flex-wrap gap-2"><span className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-black"><UsersRound size={13} className="mr-1 inline" />{row.seatedCovers} seated covers</span><span className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-black">{row.waiting} waiting</span><span className={`rounded-xl border px-3 py-2 text-xs font-black ${row.attention || row.pacing ? "border-[#e1062a]/35 bg-[#e1062a]/10 text-[#ff9bad]" : "border-white/10 bg-white/[0.035]"}`}>{row.attention + row.pacing} alerts</span></div></div></Link>)}{!rows.length ? <div className="rounded-2xl border border-dashed border-white/12 p-10 text-center text-sm font-bold text-white/35">No Reserve locations are available to this account.</div> : null}</div></div></main>;
}
