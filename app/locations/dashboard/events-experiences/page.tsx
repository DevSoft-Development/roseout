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
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">Build what guests can attend or book step by step</h1>
              <p className="mt-1 max-w-3xl text-sm font-semibold text-white/45">Use the same guided setup pattern as your menu: choose what you are managing, complete each section, review it, then publish when it is ready.</p>
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
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">1</span>
                  <div>
                    <h2 className="text-xl font-black">Choose what you are working on</h2>
                    <p className="mt-1 text-sm font-semibold text-white/45">Events and Experiences share one workspace, but each keeps its own ticketing, booking, availability, and publishing rules.</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <Link href={tabHref("events")} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#ff2142]/45 hover:bg-[#ff2142]/10">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#ff6b86]">Event</p>
                    <h3 className="mt-2 text-xl font-black">Create or manage an event</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-white/40">For dinners, parties, workshops, concerts, tastings, special nights, and ticketed one-time events.</p>
                    <p className="mt-4 text-xs font-black text-white/60">{eventMetrics.events} total · {eventMetrics.published} published</p>
                  </Link>
                  <Link href={tabHref("experiences")} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#ff2142]/45 hover:bg-[#ff2142]/10">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#ff6b86]">Experience</p>
                    <h3 className="mt-2 text-xl font-black">Create or manage an experience</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-white/40">For repeatable bookable activities, classes, packages, tastings, tours, and other scheduled experiences.</p>
                    <p className="mt-4 text-xs font-black text-white/60">{experienceMetrics.experiences} total · {experienceMetrics.published} published</p>
                  </Link>
                </div>
              </div>

              <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Workspace readiness</p>
                <div className="mt-3 flex items-end gap-2"><p className="text-4xl font-black">{readiness}%</p><p className="pb-1 text-xs font-bold text-white/30">ready</p></div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#ff2142]" style={{ width: `${readiness}%` }} /></div>
                <div className="mt-5 space-y-2 text-sm font-semibold">
                  <p className={readinessChecks[0] ? "text-emerald-300" : "text-white/35"}>{readinessChecks[0] ? "✓" : "·"} At least one offering created</p>
                  <p className={readinessChecks[1] ? "text-emerald-300" : "text-white/35"}>{readinessChecks[1] ? "✓" : "·"} At least one offering published</p>
                  <p className={readinessChecks[2] ? "text-emerald-300" : "text-white/35"}>{readinessChecks[2] ? "✓" : "·"} Upcoming inventory available</p>
                </div>
                <div className="mt-5 border-t border-white/10 pt-4 text-xs font-semibold text-white/35">{draftTotal} draft offering{draftTotal === 1 ? "" : "s"} still being prepared.</div>
              </aside>
            </section>

            <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">2</span>
                <div>
                  <h2 className="text-xl font-black">See what is performing</h2>
                  <p className="mt-1 text-sm font-semibold text-white/45">These numbers come from the location's actual event tickets, paid orders, experience bookings, and availability.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Published offerings" value={publishedTotal} />
                <Metric label="Upcoming inventory" value={eventMetrics.upcoming + experienceMetrics.upcomingSlots} detail={`${eventMetrics.upcoming} events · ${experienceMetrics.upcomingSlots} experience times`} />
                <Metric label="Tickets + bookings" value={eventMetrics.tickets + experienceMetrics.bookings} detail={`${eventMetrics.tickets} tickets · ${experienceMetrics.bookings} bookings`} />
                <Metric label="Guests checked in" value={eventMetrics.checkedIn + experienceMetrics.checkedIn} />
                <Metric label="Gross event sales" value={money(eventMetrics.grossSalesCents)} />
                <Metric label="Location event net" value={money(eventMetrics.netSalesCents)} />
                <Metric label="Experience guests" value={experienceMetrics.guests} />
                <Metric label="Est. experience value" value={new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(experienceMetrics.estimatedRevenue)} detail="Booked guests × current experience price" />
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">3</span>
                <div>
                  <h2 className="text-xl font-black">Create the next offering</h2>
                  <p className="mt-1 text-sm font-semibold text-white/45">Open the Event or Experience tab and follow the same stacked setup pattern used on the Menu page.</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={tabHref("events")} className="rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[#ff1654]/20">Create an event</Link>
                <Link href={tabHref("experiences")} className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-black text-white hover:bg-white/[0.08]">Create an experience</Link>
              </div>
            </section>
          </>
        ) : null}

        {tab === "events" ? <LocationEventManager locationId={locationId} location={location} events={events} metrics={eventMetrics} /> : null}
        {tab === "experiences" ? <LocationExperienceManager locationId={locationId} location={location} experiences={experiences} slots={slotRows} bookings={bookingRows} metrics={experienceMetrics} /> : null}
      </div>
    </main>
  );
}
