import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";

export const dynamic = "force-dynamic";

type Params = Promise<{ eventId: string }>;

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

export default async function EventOverviewPage({ params }: { params: Params }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(`/locations/dashboard/events-experiences/events/${eventId}`)}`);

  const { data: event, error } = await supabaseAdmin
    .from("events")
    .select("id,location_id,title,slug,category,starts_at,ends_at,status,searchable,is_free,price_min,capacity")
    .eq("id", eventId)
    .eq("source_kind", "native")
    .maybeSingle();

  if (error) throw error;
  if (!event?.location_id) redirect("/locations/dashboard/events-experiences?tab=events");

  const access = await getLocationOwnerAccess(data.user.id, data.user.email ?? null);
  if (!access.isAdmin && !access.ownedLocationIds.includes(event.location_id)) redirect("/locations/dashboard");

  const [{ data: location }, { data: tickets }, { data: orders }] = await Promise.all([
    supabaseAdmin.from("locations").select("id,name").eq("id", event.location_id).maybeSingle(),
    supabaseAdmin.from("event_tickets").select("id,status,checked_in_at").eq("event_id", event.id),
    supabaseAdmin.from("event_ticket_orders").select("id,quantity,payment_status,status,ticket_subtotal_cents,total_cents,organizer_net_estimate_cents,created_at").eq("event_id", event.id).order("created_at", { ascending: false }),
  ]);

  const validTickets = (tickets || []).filter((ticket: any) => ticket.status !== "void");
  const paidOrders = (orders || []).filter((order: any) => order.payment_status === "paid" || order.status === "confirmed");
  const ticketsSold = validTickets.length;
  const checkedIn = validTickets.filter((ticket: any) => Boolean(ticket.checked_in_at)).length;
  const grossSalesCents = paidOrders.reduce((sum: number, order: any) => sum + Number(order.ticket_subtotal_cents || order.total_cents || 0), 0);
  const netSalesCents = paidOrders.reduce((sum: number, order: any) => sum + Number(order.organizer_net_estimate_cents || 0), 0);
  const attendanceRate = ticketsSold ? Math.round((checkedIn / ticketsSold) * 100) : 0;
  const capacityRemaining = event.capacity == null ? null : Math.max(0, Number(event.capacity) - ticketsSold);
  const backHref = `/locations/dashboard/events-experiences?tab=events&locationId=${encodeURIComponent(event.location_id)}`;

  return (
    <main className="min-h-screen bg-[#050607] text-white">
      <div className="border-b border-white/10 bg-[#050607]/95 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href={backHref} className="text-xs font-black text-white/45 hover:text-white">← Back to Events</Link>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Event overview</p>
              <h1 className="mt-1 text-3xl font-black">{event.title}</h1>
              <p className="mt-2 text-sm font-semibold text-white/45">{location?.name || "Your location"} · {new Date(event.starts_at).toLocaleString()}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black capitalize">{event.status}</span>
              <Link href={`/events/${event.slug || event.id}`} className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-black hover:bg-white/[0.08]">Public page</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">Performance</p>
          <h2 className="mt-1 text-xl font-black">How this event is doing</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Event sales" value={money(grossSalesCents)} />
            <Metric label="Event earnings" value={money(netSalesCents)} detail="After event fees" />
            <Metric label="Orders" value={paidOrders.length} />
            <Metric label="Tickets sold" value={ticketsSold} />
            <Metric label="Checked in" value={checkedIn} />
            <Metric label="Attendance" value={`${attendanceRate}%`} />
            <Metric label="Capacity" value={event.capacity ?? "No limit"} />
            <Metric label="Spots left" value={capacityRemaining ?? "No limit"} />
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
            <h2 className="text-xl font-black">Event details</h2>
            <div className="mt-4 space-y-3 text-sm font-semibold">
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3"><span className="text-white/40">Category</span><span>{event.category || "Event"}</span></div>
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3"><span className="text-white/40">Starts</span><span className="text-right">{new Date(event.starts_at).toLocaleString()}</span></div>
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3"><span className="text-white/40">Ends</span><span className="text-right">{event.ends_at ? new Date(event.ends_at).toLocaleString() : "Not set"}</span></div>
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3"><span className="text-white/40">Ticket price</span><span>{event.is_free ? "Free" : `$${Number(event.price_min || 0).toFixed(2)}`}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/40">Public</span><span>{event.searchable ? "Yes" : "Not yet"}</span></div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
            <h2 className="text-xl font-black">Recent orders</h2>
            <div className="mt-4 space-y-3">
              {paidOrders.slice(0, 8).map((order: any) => (
                <div key={order.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div>
                    <p className="text-sm font-black">{Number(order.quantity || 0)} ticket{Number(order.quantity || 0) === 1 ? "" : "s"}</p>
                    <p className="mt-1 text-xs font-semibold text-white/35">{new Date(order.created_at).toLocaleString()}</p>
                  </div>
                  <p className="text-sm font-black">{money(Number(order.ticket_subtotal_cents || order.total_cents || 0))}</p>
                </div>
              ))}
              {!paidOrders.length ? <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm font-semibold text-white/40">No event orders yet.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
