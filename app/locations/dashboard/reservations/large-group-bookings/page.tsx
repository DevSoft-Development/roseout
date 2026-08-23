import Link from "next/link";
import { redirect } from "next/navigation";
import LargeGroupReviewActions, { REVIEW_MARKER } from "@/components/reserve/LargeGroupReviewActions";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { parseDemoOwnerParams, requireDemoOwnerLocation, type DemoSearchParams } from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;
function first(value: SearchValue) { return Array.isArray(value) ? value[0] : value; }
function formatTime(value: string | null) {
  if (!value) return "—";
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function reviewLabel(booking: any) {
  if (booking.status === "confirmed") return "Approved";
  if (booking.status === "declined") return "Rejected";
  if (String(booking.special_request || "").includes(REVIEW_MARKER)) return "More info needed";
  return "Awaiting approval";
}

export default async function LargeGroupBookingsPage({ searchParams }: { searchParams?: Promise<DemoSearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const parsedDemo = parseDemoOwnerParams(params);
  const requestedLocationId = first(params.adminLocationId) || first(params.locationId) || "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/locations/dashboard/reservations/large-group-bookings");

  let locationId = requestedLocationId;
  if (parsedDemo.demo || first(params.fromDemoCenter) === "1") {
    const demo = await requireDemoOwnerLocation(params);
    locationId = String(demo.locationId || requestedLocationId);
  } else {
    const access = await getLocationOwnerAccess(user.id, user.email ?? null);
    if (locationId && !access.isAdmin && !access.ownedLocationIds.includes(locationId) && !access.ownedSourceLocationIds.includes(locationId)) redirect("/locations/dashboard");
    if (!access.isAdmin && !access.ownedLocationIds.length && !access.ownedSourceLocationIds.length) redirect("/create");
    locationId = locationId || access.ownedLocationIds[0] || access.ownedSourceLocationIds[0] || "";
  }

  const { data: bookings, error } = locationId
    ? await supabaseAdmin
        .from("location_reservations")
        .select("id,location_id,location_type,customer_name,customer_email,customer_phone,reservation_date,reservation_time,party_size,status,occasion,prix_fixe_interest,group_booking_notes,special_request,large_group_payment_mode,deposit_status,guarantee_status,created_at")
        .eq("location_id", locationId)
        .eq("booking_kind", "large_group")
        .order("reservation_date", { ascending: true })
        .order("reservation_time", { ascending: true })
        .limit(250)
    : { data: [], error: null };

  const back = new URLSearchParams();
  if (first(params.adminLocationId)) back.set("adminLocationId", first(params.adminLocationId)!);
  else if (locationId) back.set("locationId", locationId);
  if (first(params.type)) back.set("type", first(params.type)!);
  if (first(params.demo)) back.set("demo", first(params.demo)!);
  if (first(params.fromDemoCenter)) back.set("fromDemoCenter", first(params.fromDemoCenter)!);
  const query = back.toString();
  const backHref = `/locations/dashboard/reservations${query ? `?${query}` : ""}`;
  const settingsHref = `/locations/dashboard/reservations/large-groups${query ? `?${query}` : ""}`;

  const pendingCount = (bookings || []).filter((booking: any) => booking.status === "pending").length;

  return (
    <main className="min-h-screen bg-[#050607] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">TheOutHaven Reserve</p>
            <h1 className="mt-1 text-3xl font-black">Large Group Bookings</h1>
            <p className="mt-2 text-sm text-white/60">Review every large-party request before it moves into confirmed reservation operations.</p>
            {pendingCount ? <p className="mt-2 text-sm font-black text-amber-200">{pendingCount} request{pendingCount === 1 ? "" : "s"} waiting for action</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={settingsHref} className="reserve-soft rounded-full px-4 py-2 text-sm font-black">Large Group Settings</Link>
            <Link href={backHref} className="reserve-primary rounded-full px-4 py-2 text-sm font-black">← Back to Reserve</Link>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 font-bold text-red-100">Unable to load large group bookings.</div>
        ) : bookings?.length ? (
          <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.03]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-wide text-white/50">
                  <tr><th className="px-4 py-3">Guest</th><th className="px-4 py-3">Date / time</th><th className="px-4 py-3">Party</th><th className="px-4 py-3">Review</th><th className="px-4 py-3">Occasion</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {bookings.map((booking: any) => (
                    <tr key={booking.id} className="align-top">
                      <td className="px-4 py-4"><p className="font-black">{booking.customer_name || "Guest"}</p>{booking.group_booking_notes ? <p className="mt-1 max-w-xs text-xs text-white/50">{booking.group_booking_notes}</p> : null}</td>
                      <td className="px-4 py-4 font-bold">{booking.reservation_date}<br/><span className="text-white/60">{formatTime(booking.reservation_time)}</span></td>
                      <td className="px-4 py-4 font-black">{booking.party_size || "—"}</td>
                      <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${booking.status === "confirmed" ? "bg-emerald-500/15 text-emerald-200" : booking.status === "declined" ? "bg-red-500/15 text-red-200" : String(booking.special_request || "").includes(REVIEW_MARKER) ? "bg-amber-500/15 text-amber-100" : "bg-white/10 text-white"}`}>{reviewLabel(booking)}</span></td>
                      <td className="px-4 py-4">{booking.occasion || "—"}</td>
                      <td className="px-4 py-4 text-xs"><p className="font-black capitalize">{String(booking.large_group_payment_mode || "none").replaceAll("_", " ")}</p>{booking.deposit_status ? <p className="mt-1 text-white/50">Deposit: {booking.deposit_status}</p> : null}{booking.guarantee_status ? <p className="text-white/50">Guarantee: {booking.guarantee_status}</p> : null}</td>
                      <td className="px-4 py-4 text-xs"><p>{booking.customer_email || "—"}</p><p className="mt-1 text-white/50">{booking.customer_phone || "—"}</p></td>
                      <td className="px-4 py-4"><LargeGroupReviewActions reservationId={booking.id} locationId={booking.location_id} locationType={booking.location_type || "restaurant"} adminLocationId={first(params.adminLocationId) || undefined} currentStatus={booking.status || "pending"} currentSpecialRequest={booking.special_request} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-8 text-center"><h2 className="text-xl font-black">No large group bookings yet</h2><p className="mt-2 text-sm text-white/60">New large-party requests will appear here automatically, including requests still waiting for approval.</p></div>
        )}
      </div>
    </main>
  );
}
