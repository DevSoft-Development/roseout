import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import LocationEventManager from "@/components/events/LocationEventManager";
import LocationExperienceManager from "@/components/experiences/LocationExperienceManager";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;
type Tab = "overview" | "events" | "experiences";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeTab(value: string | undefined): Tab {
  return value === "events" || value === "experiences" ? value : "overview";
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-white/35">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-white/30">{detail}</p> : null}
    </div>
  );
}

export default async function EventsExperiencesPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const tab = safeTab(first(params.tab));
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent("/locations/dashboard/events-experiences")}`);

  const access = await getLocationOwnerAccess(data.user.id, data.user.email ?? null);
  const requested = first(params.locationId) || first(params.adminLocationId) || "";
  const locationId = requested || access.ownedLocationIds[0] || "";
  if (!locationId) redirect("/locations/dashboard");
  if (!access.isAdmin && !access.ownedLocationIds.includes(locationId)) redirect("/locations/dashboard");

  const [{ data: location }, { data: eventRows, error: eventError }, { data: experienceRows, error: experienceError }] = await Promise.all([
    supabaseAdmin.from("locations").select("id,name,address,city,state,zip_code").eq("id", locationId).maybeSingle(),
    supabaseAdmin.from("events").select("id,title,slug,category,starts_at,ends_at,status,searchable,is_free,price_min,capacity,image_url").eq("location_id", locationId).eq("source_kind", "native").order("starts_at", { ascending: true }),
    supabaseAdmin.from("experiences").select("id,title,slug,description,category,status,searchable,duration_minutes,min_party_size,max_party_size,price_per_person,created_at").eq("location_id", locationId).order("created_at", { ascending: false }),
  ]);

  if (eventError) throw eventError;
  if (experienceError) throw experienceError;
  if (!location) redirect("/locations/dashboard");

  const events = eventRows || [];
  const experiences = experienceRows || [];
  const eventIds = events.map((entry) => entry.id);
  const experienceIds = experiences.map((entry) => entry.id);

  const [{ data: tickets }, { data: orders }, { data: slots }, { data: bookings }] = await Promise.all([
    eventIds.length
      ? supabaseAdmin.from("event_tickets").select("id,event_id,status,checked_in_at").in("event_id", eventIds)
      : Promise.resolve({ data: [] as any[] }),
    eventIds.length
      ? supabaseAdmin.from("event_ticket_orders").select("event_id,quantity,payment_status,status,ticket_subtotal_cents,total_cents,organizer_net_estimate_cents").in("event_id", eventIds)
      : Promise.resolve({ data: [] as any[] }),
    experienceIds.length
      ? supabaseAdmin.from("experience_slots").select("id,experience_id,starts_at,ends_at,capacity,status").in("experience_id", experienceIds).order("starts_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    experienceIds.length
      ? supabaseAdmin.from("experience_bookings").select("id,experience_id,party_size,checked_in_count,status,created_at").in("experience_id", experienceIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const validTickets = (tickets || []).filter((ticket: any) => ticket.status !== "void");
  const paidOrders = (orders || []).filter((order: any) => order.payment_status === "paid" || order.status === "confirmed");
  const bookingRows = bookings || [];
  const slotRows = slots || [];
  const priceByExperienceId = new Map(experiences.map((entry) => [String(entry.id), Number(entry.price_per_person || 0)]));
  const now = Date.now();

  const eventMetrics = {
    events: events.length,
    upcoming: events.filter((entry) => new Date(entry.ends_at || entry.starts_at).getTime() >= now && !["cancelled", "completed"].includes(entry.status)).length,
    published: events.filter((entry) => entry.searchable && entry.status === "scheduled").length,
    orders: paidOrders.length,
    tickets: validTickets.length,
    checkedIn: validTickets.filter((ticket: any) => Boolean(ticket.checked_in_at)).length,
    grossSalesCents: paidOrders.reduce((sum: number, order: any) => sum + Number(order.ticket_subtotal_cents || order.total_cents || 0), 0),
    netSalesCents: paidOrders.reduce((sum: number, order: any) => sum + Number(order.organizer_net_estimate_cents || 0), 0),
  };

  const experienceMetrics = {
    experiences: experiences.length,
    published: experiences.filter((entry) => entry.status === "published" && entry.searchable).length,
    bookings: bookingRows.length,
    guests: bookingRows.reduce((sum: number, booking: any) => sum + Number(booking.party_size || 0), 0),
    checkedIn: bookingRows.reduce((sum: number, booking: any) => sum + Number(booking.checked_in_count || 0), 0),
    upcomingSlots: slotRows.filter((slot: any) => slot.status === "open" && new Date(slot.starts_at).getTime() >= now).length,
    estimatedRevenue: bookingRows
      .filter((booking: any) => !["cancelled", "refunded"].includes(String(booking.status)))
      .reduce((sum: number, booking: any) => sum + Number(booking.party_size || 0) * (priceByExperienceId.get(String(booking.experience_id)) || 0), 0),
  };

  const publishedTotal = eventMetrics.published + experienceMetrics.published;
  const draftTotal = events.filter((entry) => entry.status === "draft").length + experiences.filter((entry) => entry.status === "draft").length;
  const readinessChecks = [events.length + experiences.length > 0, publishedTotal > 0, eventMetrics.upcoming + experienceMetrics.upcomingSlots > 0];
  const readiness = Math.round((readinessChecks.filter(Boolean).length / readinessChecks.length) * 100);

  function tabHref(nextTab: Tab) {
    const query = new URLSearchParams();
    query.set("tab", nextTab);
    query.set("locationId", locationId);
    const adminLocationId = first(params.adminLocationId);
    if (adminLocationId) query.set("adminLocationId", adminLocationId);
    return `/locations/dashboard/events-experiences?${query.toString()}`;
  }

  return (
    <main className="min-h-screen bg-[#050607] text-white">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#050607]/95 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Events & Experiences</p>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">Create, manage, and grow your events and experiences</h1>
              <p className="mt-1 max-w-3xl text-sm font-semibold text-white/45">See how things are going, create something new, or update what you already offer.</p>
            </div>
            <p className="text-sm font-black text-white/60">{location.name}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["overview", "events", "experiences"] as const).map((entry) => (
              <Link key={entry} href={tabHref(entry)} className={`rounded-full border px-4 py-2 text-xs font-black capitalize transition ${tab === entry ? "border-[#ff2142]/60 bg-[#e1062a]/20 text-white" : "border-white/10 bg-white/[0.03] text-white/45 hover:border-white/20 hover:text-white"}`}>{entry}</Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {tab === "overview" ? (
          <>
            <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">Performance</p>
                <h2 className="mt-1 text-xl font-black">Your numbers at a glance</h2>
                <p className="mt-1 text-sm font-semibold text-white/45">A quick look at sales, bookings, attendance, and what is coming up.</p>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Event sales" value={money(eventMetrics.grossSalesCents)} />
                <Metric label="Event earnings" value={money(eventMetrics.netSalesCents)} detail="After event fees" />
                <Metric label="Event orders" value={eventMetrics.orders} detail="Paid or confirmed orders" />
                <Metric label="Tickets sold" value={eventMetrics.tickets} />
                <Metric label="Experience bookings" value={experienceMetrics.bookings} />
                <Metric label="Experience value" value={new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(experienceMetrics.estimatedRevenue)} detail="Estimated from current prices" />
                <Metric label="Guests booked" value={experienceMetrics.guests} />
                <Metric label="Checked in" value={eventMetrics.checkedIn + experienceMetrics.checkedIn} />
                <Metric label="Coming up" value={eventMetrics.upcoming + experienceMetrics.upcomingSlots} detail={`${eventMetrics.upcoming} events · ${experienceMetrics.upcomingSlots} experience times`} />
                <Metric label="Live now" value={publishedTotal} detail={`${eventMetrics.published} events · ${experienceMetrics.published} experiences`} />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">1</span>
                  <div>
                    <h2 className="text-xl font-black">What would you like to manage?</h2>
                    <p className="mt-1 text-sm font-semibold text-white/45">Choose Events for one-time occasions or Experiences for activities guests can book.</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <Link href={tabHref("events")} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#ff2142]/45 hover:bg-[#ff2142]/10">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#ff6b86]">Event</p>
                    <h3 className="mt-2 text-xl font-black">Create or manage an event</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-white/40">For dinners, parties, workshops, concerts, tastings, special nights, and other one-time events.</p>
                    <p className="mt-4 text-xs font-black text-white/60">{eventMetrics.events} total · {eventMetrics.published} live</p>
                  </Link>
                  <Link href={tabHref("experiences")} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#ff2142]/45 hover:bg-[#ff2142]/10">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#ff6b86]">Experience</p>
                    <h3 className="mt-2 text-xl font-black">Create or manage an experience</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-white/40">For classes, packages, tastings, tours, and other activities guests can book.</p>
                    <p className="mt-4 text-xs font-black text-white/60">{experienceMetrics.experiences} total · {experienceMetrics.published} live</p>
                  </Link>
                </div>
              </div>

              <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Ready to go</p>
                <div className="mt-3 flex items-end gap-2"><p className="text-4xl font-black">{readiness}%</p><p className="pb-1 text-xs font-bold text-white/30">ready</p></div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#ff2142]" style={{ width: `${readiness}%` }} /></div>
                <div className="mt-5 space-y-2 text-sm font-semibold">
                  <p className={readinessChecks[0] ? "text-emerald-300" : "text-white/35"}>{readinessChecks[0] ? "✓" : "·"} Something has been created</p>
                  <p className={readinessChecks[1] ? "text-emerald-300" : "text-white/35"}>{readinessChecks[1] ? "✓" : "·"} Something is live</p>
                  <p className={readinessChecks[2] ? "text-emerald-300" : "text-white/35"}>{readinessChecks[2] ? "✓" : "·"} Guests have something upcoming to book</p>
                </div>
                <div className="mt-5 border-t border-white/10 pt-4 text-xs font-semibold text-white/35">{draftTotal} draft{draftTotal === 1 ? "" : "s"} still need finishing.</div>
              </aside>
            </section>
          </>
        ) : null}

        {tab === "events" ? <LocationEventManager locationId={locationId} location={location} events={events} metrics={eventMetrics} /> : null}
        {tab === "experiences" ? <LocationExperienceManager locationId={locationId} location={location} experiences={experiences} slots={slotRows} bookings={bookingRows} metrics={experienceMetrics} /> : null}
      </div>
    </main>
  );
}
