import Link from "next/link";
import { redirect } from "next/navigation";
import EventOrderRefundButton from "@/components/events/EventOrderRefundButton";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { BusinessActionButton, BusinessKpiCard, BusinessKpiGrid, BusinessPageHeader, BusinessPageShell, BusinessStatusBadge } from "@/components/business/BusinessDesignSystem";

export const dynamic = "force-dynamic";

type Params = Promise<{ eventId: string }>;

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
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
    supabaseAdmin
      .from("event_ticket_orders")
      .select("id,quantity,payment_status,status,ticket_subtotal_cents,total_cents,organizer_net_estimate_cents,provider_account_id,provider_payment_intent_id,refunded_at,created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false }),
  ]);

  const validTickets = (tickets || []).filter((ticket: any) => ticket.status !== "void");
  const paidOrders = (orders || []).filter((order: any) => order.payment_status === "paid" && order.status !== "refunded");
  const ticketsSold = validTickets.length;
  const checkedIn = validTickets.filter((ticket: any) => Boolean(ticket.checked_in_at)).length;
  const grossSalesCents = paidOrders.reduce((sum: number, order: any) => sum + Number(order.ticket_subtotal_cents || order.total_cents || 0), 0);
  const netSalesCents = paidOrders.reduce((sum: number, order: any) => sum + Number(order.organizer_net_estimate_cents || 0), 0);
  const attendanceRate = ticketsSold ? Math.round((checkedIn / ticketsSold) * 100) : 0;
  const capacityRemaining = event.capacity == null ? null : Math.max(0, Number(event.capacity) - ticketsSold);
  const backHref = `/locations/dashboard/events-experiences?tab=events&locationId=${encodeURIComponent(event.location_id)}`;

  return (
    <BusinessPageShell>
      <BusinessPageHeader
        eyebrow="Events & Experiences · Event"
        title={event.title}
        subtitle={`${location?.name || "Your location"} · ${new Date(event.starts_at).toLocaleString()}`}
        badge={<BusinessStatusBadge tone={event.searchable && event.status === "scheduled" ? "green" : "blue"}>{event.status}</BusinessStatusBadge>}
        actions={<><BusinessActionButton href={backHref}>Events</BusinessActionButton><BusinessActionButton href={`/events/${event.slug || event.id}`} variant="primary">Public page</BusinessActionButton></>}
      />
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">Performance</p>
          <h2 className="mt-1 text-xl font-black">How this event is doing</h2>
          <BusinessKpiGrid>
            <BusinessKpiCard label="Event sales" value={money(grossSalesCents)} helper="Gross sales" />
            <BusinessKpiCard label="Event earnings" value={money(netSalesCents)} helper="After event fees" />
            <BusinessKpiCard label="Orders" value={paidOrders.length} helper="Paid orders" />
            <BusinessKpiCard label="Tickets sold" value={ticketsSold} helper={`${checkedIn} checked in · ${attendanceRate}% attendance`} />
          </BusinessKpiGrid>
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
            <p className="mt-1 text-xs font-semibold text-white/35">Paid orders can be refunded in full. Stripe confirms the refund before tickets are voided.</p>
            <div className="mt-4 space-y-3">
              {(orders || []).slice(0, 8).map((order: any) => {
                const refundable = order.payment_status === "paid" && order.status !== "refunded" && Boolean(order.provider_account_id && order.provider_payment_intent_id);
                const refunded = order.payment_status === "refunded" || order.status === "refunded" || Boolean(order.refunded_at);
                return (
                  <div key={order.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div>
                      <p className="text-sm font-black">{Number(order.quantity || 0)} ticket{Number(order.quantity || 0) === 1 ? "" : "s"}</p>
                      <p className="mt-1 text-xs font-semibold text-white/35">{new Date(order.created_at).toLocaleString()}</p>
                      <p className={`mt-1 text-[11px] font-black uppercase tracking-wide ${refunded ? "text-red-300" : order.payment_status === "refund_pending" ? "text-yellow-200" : "text-emerald-300"}`}>{refunded ? "Refunded" : String(order.payment_status || order.status || "pending").replaceAll("_", " ")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-black">{money(Number(order.ticket_subtotal_cents || order.total_cents || 0))}</p>
                      {refundable ? <EventOrderRefundButton orderId={order.id} /> : null}
                    </div>
                  </div>
                );
              })}
              {!(orders || []).length ? <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm font-semibold text-white/40">No event orders yet.</p> : null}
            </div>
          </div>
        </section>
    </BusinessPageShell>
  );
}
