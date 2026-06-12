import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { formatFullAddress } from "@/lib/address-utils";
import ReservationStatusBadge from "@/components/reservations/status-badge";

export const dynamic = "force-dynamic";

type LocationRow = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  business_name?: string | null;
  main_image?: string | null;
  image_url?: string | null;
  photo_url?: string | null;
  images?: string[] | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
};

type ReservationRow = {
  id: string;
  location_id: string;
  customer_email?: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number | null;
  status: string | null;
  confirmation_code?: string | null;
};

function formatDateTime(date: string, time: string) {
  const value = new Date(`${date}T${String(time || "00:00").slice(0, 5)}:00`);
  return value.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function sectionFor(reservation: ReservationRow) {
  const status = String(reservation.status || "pending");
  if (status === "waitlisted") return "Waitlist";
  if (["cancelled", "no_show", "declined"].includes(status)) return "Cancelled";
  if (status === "completed") return "Completed";
  return "Upcoming";
}

export default async function MyReservationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: reservations } = await supabaseAdmin
    .from("location_reservations")
    .select("id, location_id, customer_email, reservation_date, reservation_time, party_size, status, confirmation_code")
    .or(`user_id.eq.${user.id},customer_email.eq.${user.email || ""}`)
    .order("reservation_date", { ascending: false })
    .order("reservation_time", { ascending: false });

  const rows = (reservations || []) as ReservationRow[];
  const locationIds = Array.from(new Set(rows.map((row) => row.location_id).filter(Boolean)));
  const { data: locations } = locationIds.length
    ? await supabaseAdmin.from("locations").select("id, name, restaurant_name, activity_name, business_name, main_image, image_url, photo_url, images, address, city, state, zip_code").in("id", locationIds)
    : { data: [] };

  const locationMap = new Map(((locations || []) as LocationRow[]).map((location) => [location.id, location]));
  const sections = ["Upcoming", "Completed", "Cancelled", "Waitlist"];

  return (
    <main className="min-h-screen bg-[#1b1210] px-5 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">TheOutHaven Reserve</p>
        <h1 className="mt-3 text-4xl font-black">My Reservations</h1>
        <p className="mt-3 max-w-2xl text-white/65">Manage upcoming bookings, past visits, cancellations, and waitlist entries tied to your account.</p>

        <div className="mt-8 space-y-8">
          {sections.map((section) => {
            const items = rows.filter((reservation) => sectionFor(reservation) === section);
            return (
              <section key={section}>
                <h2 className="text-2xl font-black">{section}</h2>
                {!items.length ? (
                  <div className="mt-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm font-bold text-white/45">No {section.toLowerCase()} reservations.</div>
                ) : (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {items.map((reservation) => {
                      const location = locationMap.get(reservation.location_id) || ({} as LocationRow);
                      const image = getLocationImage(location) || "/placeholder.jpg";
                      const directions = formatFullAddress({
                        address: location.address,
                        city: location.city,
                        state: location.state,
                        zip_code: location.zip_code,
                        fallback: "",
                      });
                      return (
                        <article key={reservation.id} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] shadow-2xl">
                          <div className="relative h-40 bg-white/10">
                            <Image src={image} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
                          </div>
                          <div className="p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-xl font-black">{getLocationName(location, "TheOutHaven location")}</h3>
                                <p className="mt-1 flex items-center gap-2 text-sm font-bold text-white/60"><CalendarDays size={16} />{formatDateTime(reservation.reservation_date, reservation.reservation_time)}</p>
                              </div>
                              <ReservationStatusBadge status={reservation.status} />
                            </div>
                            <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold text-white/70">
                              <span className="inline-flex items-center gap-2"><Users size={16} />Party of {reservation.party_size || 2}</span>
                              {reservation.confirmation_code ? <span>Code {reservation.confirmation_code}</span> : null}
                            </div>
                            <div className="mt-5 flex flex-wrap gap-2">
                              <Link href={`/reservations/${reservation.id}`} className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#1b1210]">View</Link>
                              <Link href={`/reservations/${reservation.id}#modify`} className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white">Modify</Link>
                              <Link href={`/reservations/${reservation.id}#cancel`} className="rounded-full border border-rose-400/40 px-4 py-2 text-sm font-black text-rose-100">Cancel</Link>
                              {directions ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directions)}`} className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white"><MapPin className="mr-1 inline" size={15} />Directions</a> : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
