import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { BusinessActionButton, BusinessKpiCard, BusinessKpiGrid, BusinessPageHeader, BusinessPageShell, BusinessStatusBadge } from "@/components/business/BusinessDesignSystem";

export const dynamic = "force-dynamic";

type Params = Promise<{ experienceId: string }>;

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default async function ExperienceOverviewPage({ params }: { params: Params }) {
  const { experienceId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(`/locations/dashboard/events-experiences/experiences/${experienceId}`)}`);

  const { data: experience, error } = await supabaseAdmin
    .from("experiences")
    .select("id,location_id,title,slug,category,status,searchable,duration_minutes,min_party_size,max_party_size,price_per_person,created_at")
    .eq("id", experienceId)
    .maybeSingle();

  if (error) throw error;
  if (!experience?.location_id) redirect("/locations/dashboard/events-experiences?tab=experiences");

  const access = await getLocationOwnerAccess(data.user.id, data.user.email ?? null);
  if (!access.isAdmin && !access.ownedLocationIds.includes(experience.location_id)) redirect("/locations/dashboard");

  const [{ data: location }, { data: slots }, { data: bookings }] = await Promise.all([
    supabaseAdmin.from("locations").select("id,name").eq("id", experience.location_id).maybeSingle(),
    supabaseAdmin.from("experience_slots").select("id,starts_at,ends_at,capacity,status").eq("experience_id", experience.id).order("starts_at", { ascending: true }),
    supabaseAdmin.from("experience_bookings").select("id,party_size,checked_in_count,status,created_at").eq("experience_id", experience.id).order("created_at", { ascending: false }),
  ]);

  const bookingRows = bookings || [];
  const activeBookings = bookingRows.filter((booking: any) => !["cancelled", "refunded"].includes(String(booking.status)));
  const guestsBooked = activeBookings.reduce((sum: number, booking: any) => sum + Number(booking.party_size || 0), 0);
  const checkedIn = activeBookings.reduce((sum: number, booking: any) => sum + Number(booking.checked_in_count || 0), 0);
  const estimatedValue = activeBookings.reduce((sum: number, booking: any) => sum + Number(booking.party_size || 0) * Number(experience.price_per_person || 0), 0);
  const avgParty = activeBookings.length ? guestsBooked / activeBookings.length : 0;
  const now = Date.now();
  const upcomingSlots = (slots || []).filter((slot: any) => slot.status === "open" && new Date(slot.starts_at).getTime() >= now);
  const nextSlot = upcomingSlots[0];
  const backHref = `/locations/dashboard/events-experiences?tab=experiences&locationId=${encodeURIComponent(experience.location_id)}`;

  return (
    <BusinessPageShell>
      <BusinessPageHeader
        eyebrow="Events & Experiences · Experience"
        title={experience.title}
        subtitle={`${location?.name || "Your location"} · ${experience.duration_minutes} min · ${money(Number(experience.price_per_person || 0))}/person`}
        badge={<BusinessStatusBadge tone={experience.searchable && experience.status === "published" ? "green" : "blue"}>{experience.status}</BusinessStatusBadge>}
        actions={<><BusinessActionButton href={backHref}>Experiences</BusinessActionButton><BusinessActionButton href={`/experiences/${experience.slug || experience.id}`} variant="primary">Public page</BusinessActionButton></>}
      />
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">Performance</p>
          <h2 className="mt-1 text-xl font-black">How this experience is doing</h2>
          <BusinessKpiGrid>
            <BusinessKpiCard label="Bookings" value={activeBookings.length} helper="Active bookings" />
            <BusinessKpiCard label="Guests booked" value={guestsBooked} helper={`${checkedIn} checked in`} />
            <BusinessKpiCard label="Booking value" value={money(estimatedValue)} helper="Based on current price" />
            <BusinessKpiCard label="Upcoming times" value={upcomingSlots.length} helper={nextSlot ? `Next ${new Date(nextSlot.starts_at).toLocaleDateString()}` : "No upcoming availability"} />
          </BusinessKpiGrid>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
            <h2 className="text-xl font-black">Experience details</h2>
            <div className="mt-4 space-y-3 text-sm font-semibold">
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3"><span className="text-white/40">Category</span><span>{experience.category || "Experience"}</span></div>
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3"><span className="text-white/40">Price</span><span>{money(Number(experience.price_per_person || 0))}/person</span></div>
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3"><span className="text-white/40">Duration</span><span>{experience.duration_minutes} minutes</span></div>
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3"><span className="text-white/40">Party size</span><span>{experience.min_party_size}–{experience.max_party_size} guests</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/40">Public</span><span>{experience.searchable ? "Yes" : "Not yet"}</span></div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
            <h2 className="text-xl font-black">Recent bookings</h2>
            <div className="mt-4 space-y-3">
              {activeBookings.slice(0, 8).map((booking: any) => (
                <div key={booking.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div>
                    <p className="text-sm font-black">{Number(booking.party_size || 0)} guest{Number(booking.party_size || 0) === 1 ? "" : "s"}</p>
                    <p className="mt-1 text-xs font-semibold text-white/35">{new Date(booking.created_at).toLocaleString()} · {booking.status}</p>
                  </div>
                  <p className="text-sm font-black">{money(Number(booking.party_size || 0) * Number(experience.price_per_person || 0))}</p>
                </div>
              ))}
              {!activeBookings.length ? <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm font-semibold text-white/40">No bookings yet.</p> : null}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
          <h2 className="text-xl font-black">Upcoming times</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcomingSlots.slice(0, 9).map((slot: any) => (
              <div key={slot.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-black">{new Date(slot.starts_at).toLocaleString()}</p>
                <p className="mt-1 text-xs font-semibold text-white/35">Capacity {slot.capacity} · {slot.status}</p>
              </div>
            ))}
            {!upcomingSlots.length ? <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm font-semibold text-white/40">No upcoming times.</p> : null}
          </div>
        </section>
    </BusinessPageShell>
  );
}
