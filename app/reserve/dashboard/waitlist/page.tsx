import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const dynamic = "force-dynamic";

type WaitlistRow = {
  id: string;
  location_id: string;
  reservation_date?: string | null;
  reservation_time?: string | null;
  party_size?: number | null;
  contact_name?: string | null;
  customer_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  customer_phone?: string | null;
  status?: string | null;
};

type LocationRow = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  business_name?: string | null;
};

function formatSlot(date: string, time: string) {
  return new Date(`${date}T${String(time || "00:00").slice(0, 5)}:00`).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function ReservationWaitlistDashboardPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.reservations);

  const { data: waitlist } = await supabaseAdmin
    .from("reservation_waitlist")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(200);

  const rows = (waitlist || []) as WaitlistRow[];
  const locationIds = Array.from(new Set(rows.map((row) => row.location_id).filter(Boolean)));
  const { data: locations } = locationIds.length
    ? await supabaseAdmin.from("locations").select("id, name, restaurant_name, activity_name, business_name").in("id", locationIds)
    : { data: [] };
  const locationMap = new Map(((locations || []) as LocationRow[]).map((location) => [location.id, location]));

  return (
    <main className="min-h-screen bg-[#1b1210] px-5 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/reserve/dashboard" className="text-sm font-black text-rose-200">← Back to reserve dashboard</Link>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">Reservation operations</p>
            <h1 className="mt-2 text-4xl font-black">Waitlist</h1>
          </div>
          <p className="rounded-full bg-white/10 px-4 py-2 text-sm font-black">{rows.length} entries</p>
        </div>

        <div className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06]">
          <div className="grid grid-cols-6 gap-3 border-b border-white/10 px-5 py-3 text-xs font-black uppercase tracking-wide text-white/45">
            <span className="col-span-2">Guest</span><span>Location</span><span>Slot</span><span>Party</span><span>Status</span>
          </div>
          {rows.length ? rows.map((row) => {
            const location = locationMap.get(row.location_id) || {};
            return (
              <div key={row.id} className="grid grid-cols-6 gap-3 border-b border-white/10 px-5 py-4 text-sm font-bold text-white/75 last:border-b-0">
                <div className="col-span-2"><p className="font-black text-white">{row.contact_name || row.customer_name || "Guest"}</p><p className="text-xs text-white/45">{row.contact_email || row.contact_phone || row.customer_phone || "No contact"}</p></div>
                <span>{getLocationName(location, "Location")}</span>
                <span>{row.reservation_date ? formatSlot(row.reservation_date, row.reservation_time || "00:00") : "Flexible"}</span>
                <span>{row.party_size || 2}</span>
                <span className="capitalize">{row.status || "waiting"}</span>
              </div>
            );
          }) : <div className="p-8 text-center text-sm font-bold text-white/45">No waitlist guests yet.</div>}
        </div>
      </div>
    </main>
  );
}
