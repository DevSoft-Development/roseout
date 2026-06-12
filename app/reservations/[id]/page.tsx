import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { formatFullAddress } from "@/lib/address-utils";
import ReservationStatusBadge from "@/components/reservations/status-badge";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatTime(value: string) {
  const [hourRaw, minuteRaw = "00"] = String(value || "00:00").slice(0, 5).split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minuteRaw.padStart(2, "0")} ${suffix}`;
}

export default async function ReservationDetailsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: reservation } = await supabaseAdmin
    .from("location_reservations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!reservation) notFound();

  const ownsReservation = reservation.user_id === user.id || reservation.customer_email === user.email;
  if (!ownsReservation) redirect("/reservations");

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("id, name, restaurant_name, activity_name, business_name, address, city, state, zip_code")
    .eq("id", reservation.location_id)
    .maybeSingle();

  const locationName = getLocationName(location || {}, "TheOutHaven location");
  const address = formatFullAddress({
    address: location?.address,
    city: location?.city,
    state: location?.state,
    zip_code: location?.zip_code,
    fallback: "",
  });
  const timeline = [
    { label: "Requested", value: reservation.created_at },
    { label: "Confirmed", value: reservation.status === "confirmed" ? reservation.updated_at : null },
    { label: "Checked in", value: reservation.checked_in_at || reservation.arrived_at },
    { label: "Completed", value: reservation.completed_at },
    { label: "Cancelled", value: reservation.cancelled_at || reservation.customer_cancelled_at },
  ].filter((item) => item.value);

  return (
    <main className="min-h-screen bg-[#1b1210] px-5 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/reservations" className="text-sm font-black text-rose-200">← Back to reservations</Link>
        <div className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">Reservation details</p>
              <h1 className="mt-2 text-3xl font-black">{locationName}</h1>
              {reservation.confirmation_code ? <p className="mt-2 text-sm font-bold text-white/60">Confirmation code {reservation.confirmation_code}</p> : null}
            </div>
            <ReservationStatusBadge status={reservation.status} />
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl bg-white/10 p-5"><CalendarDays className="text-rose-200" /><p className="mt-3 text-sm font-black uppercase text-white/45">Date</p><p className="text-lg font-black">{formatDate(reservation.reservation_date)}</p></div>
            <div className="rounded-3xl bg-white/10 p-5"><Clock className="text-rose-200" /><p className="mt-3 text-sm font-black uppercase text-white/45">Time</p><p className="text-lg font-black">{formatTime(reservation.reservation_time)}</p></div>
            <div className="rounded-3xl bg-white/10 p-5"><Users className="text-rose-200" /><p className="mt-3 text-sm font-black uppercase text-white/45">Party size</p><p className="text-lg font-black">{reservation.party_size || 2}</p></div>
            <div className="rounded-3xl bg-white/10 p-5"><MapPin className="text-rose-200" /><p className="mt-3 text-sm font-black uppercase text-white/45">Directions</p>{address ? <a className="text-lg font-black underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}>{address}</a> : <p className="text-lg font-black">Address unavailable</p>}</div>
          </div>

          <section className="mt-8 rounded-3xl bg-white p-5 text-[#1b1210]" id="modify">
            <h2 className="text-xl font-black">Modify booking</h2>
            <p className="mt-2 text-sm font-bold text-black/55">Use the reservation modify API to change date, time, or party size. Availability is rechecked before updates are saved.</p>
            <code className="mt-3 block rounded-2xl bg-black/5 p-3 text-xs">POST /api/reservations/{reservation.id}/modify</code>
          </section>

          <section className="mt-5 rounded-3xl border border-rose-300/30 bg-rose-500/10 p-5" id="cancel">
            <h2 className="text-xl font-black">Cancel booking</h2>
            <p className="mt-2 text-sm font-bold text-white/60">Cancelling releases capacity and notifies the first matching waitlist guest when one exists.</p>
            <code className="mt-3 block rounded-2xl bg-black/30 p-3 text-xs">POST /api/reservations/{reservation.id}/cancel</code>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-black">Status timeline</h2>
            <div className="mt-4 space-y-3">
              {timeline.map((item) => <div key={item.label} className="rounded-2xl bg-white/10 p-4"><p className="text-sm font-black">{item.label}</p><p className="text-xs font-bold text-white/55">{new Date(item.value as string).toLocaleString()}</p></div>)}
            </div>
          </section>

          {reservation.special_requests || reservation.special_request ? <section className="mt-8"><h2 className="text-xl font-black">Special requests</h2><p className="mt-2 rounded-3xl bg-white/10 p-4 text-sm font-bold text-white/70">{reservation.special_requests || reservation.special_request}</p></section> : null}
        </div>
      </div>
    </main>
  );
}
