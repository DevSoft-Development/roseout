import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, QrCode, TicketCheck, Building2, Plus, ExternalLink, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUserOrganizationContext } from "@/lib/organizations/context";
import { createOrganizerEventAction, updateOrganizerEventLifecycleAction } from "./actions";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;
type Tab = "overview" | "events" | "tickets" | "scanner" | "payments" | "profile";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function tabHref(organizationId: string, tab: Tab) {
  return `/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=${tab}`;
}

const tabs: Array<[Tab, string]> = [
  ["overview", "Overview"],
  ["events", "Events"],
  ["tickets", "Tickets & Attendees"],
  ["scanner", "Scanner"],
  ["payments", "TheOutHaven Payments"],
  ["profile", "Organization / Profile"],
];

export default async function OrganizerDashboardPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect(`/login?next=${encodeURIComponent("/organizers/dashboard")}`);

  const requestedOrganizationId = first(params.organizationId) || null;
  const organizationContext = await getUserOrganizationContext(user.id, requestedOrganizationId);
  if (!organizationContext.organizations.length || !organizationContext.currentOrganizationId) {
    redirect("/business/onboarding");
  }

  const organizationId = organizationContext.currentOrganizationId;
  const organization = organizationContext.currentOrganization!;
  const activeTab = (tabs.some(([id]) => id === first(params.tab)) ? first(params.tab) : "overview") as Tab;
  const notice = first(params.notice) || "";
  const now = new Date().toISOString();

  const [{ data: profile }, { data: events, error: eventsError }, { data: paymentAccount, error: paymentAccountError }] = await Promise.all([
    supabaseAdmin
      .from("organizer_profiles")
      .select("display_name,bio,website,instagram,phone,verification_status,publishing_status,phone_verified")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabaseAdmin
      .from("events")
      .select("id,title,category,venue_name,city,state,starts_at,ends_at,status,searchable,is_free,price_min,ticketing_enabled,capacity,image_url,created_at,fee_payer,platform_fee_bps")
      .eq("organization_id", organizationId)
      .eq("source_kind", "native")
      .order("starts_at", { ascending: true }),
    supabaseAdmin
      .from("organizations")
      .select("stripe_connect_account_id,stripe_connect_onboarding_status,stripe_connect_details_submitted,stripe_connect_charges_enabled,stripe_connect_payouts_enabled,stripe_connect_updated_at")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);
  if (eventsError) throw eventsError;
  if (paymentAccountError) throw paymentAccountError;

  const eventRows = events || [];
  const eventIds = eventRows.map((event) => event.id);
  const ticketRows = eventIds.length
    ? await supabaseAdmin
        .from("event_tickets")
        .select("id,event_id,status,checked_in_at,attendee_name,attendee_email,created_at")
        .in("event_id", eventIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (ticketRows.error) throw ticketRows.error;

  const tickets = ticketRows.data || [];
  const ticketsByEvent = new Map<string, typeof tickets>();
  for (const ticket of tickets) {
    const rows = ticketsByEvent.get(String(ticket.event_id)) || [];
    rows.push(ticket);
    ticketsByEvent.set(String(ticket.event_id), rows);
  }

  const upcoming = eventRows.filter((event) => new Date(event.ends_at || event.starts_at).toISOString() >= now && !["cancelled", "completed"].includes(event.status));
  const published = eventRows.filter((event) => event.searchable && event.status === "scheduled");
  const checkedIn = tickets.filter((ticket) => ticket.status === "checked_in").length;
  const paymentsReady = Boolean(paymentAccount?.stripe_connect_account_id && paymentAccount?.stripe_connect_charges_enabled && paymentAccount?.stripe_connect_payouts_enabled);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050607] pt-20 text-white [&+footer]:hidden">
      <div className="grid min-h-[calc(100vh-5rem)] lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/10 bg-[#08090a] p-4 lg:block">
          <div className="mb-5 px-2">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#ff2142]">Organizer Dashboard</p>
            <h1 className="mt-2 text-xl font-black">Your organizations</h1>
          </div>
          <div className="space-y-2">
            {organizationContext.organizations.map((item) => (
              <Link key={item.id} href={`/organizers/dashboard?organizationId=${encodeURIComponent(item.id)}`} className={`block rounded-2xl border p-3 transition ${item.id === organizationId ? "border-[#ff2142]/60 bg-[#e1062a]/15" : "border-white/10 bg-white/[.03] hover:bg-white/[.06]"}`}>
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white/[.06] p-2"><Building2 size={16} /></div>
                  <div className="min-w-0"><p className="truncate text-sm font-black">{item.name}</p><p className="mt-1 text-[11px] text-white/45">{item.role} · {item.organizationType}</p></div>
                </div>
              </Link>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-white/10 bg-[#070809]/95 px-4 py-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1760px] flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-white/35">Organizer</p>
                <h2 className="mt-1 text-2xl font-black">{profile?.display_name || organization.name}</h2>
                <p className="mt-1 text-xs text-white/45">{profile?.verification_status || "verification pending"} · {profile?.publishing_status || "publishing review"}</p>
              </div>
              <Link href={tabHref(organizationId, "events")} className="inline-flex items-center gap-2 rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black shadow-lg shadow-[#e1062a]/20"><Plus size={16} /> Create Event</Link>
            </div>
          </header>

          <div className="border-b border-white/10 px-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1760px] gap-2 overflow-x-auto pb-3 pt-2">
              {tabs.map(([id, label]) => (
                <Link key={id} href={tabHref(organizationId, id)} className={`shrink-0 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition ${activeTab === id ? "border-[#ff2142]/70 bg-[#e1062a]/20 text-white" : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white"}`}>{label}</Link>
              ))}
            </div>
          </div>

          <div className="mx-auto max-w-[1760px] space-y-5 px-4 pb-8 pt-5 sm:px-6 lg:px-8">
            {notice ? <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-100">{notice}</div> : null}

            {activeTab === "overview" ? (
              <>
                <Panel eyebrow="Overview" title="Event Overview" description="A simple view of your event activity, registrations, and check-ins.">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <Metric icon={<CalendarDays size={18} />} label="Events" value={eventRows.length} note="All events created by this organization" />
                    <Metric icon={<CalendarDays size={18} />} label="Upcoming" value={upcoming.length} note="Active events that have not ended" />
                    <Metric icon={<ExternalLink size={18} />} label="Published" value={published.length} note="Visible in TheOutHaven event discovery" />
                    <Metric icon={<TicketCheck size={18} />} label="Tickets" value={tickets.length} note="Issued admission tickets" />
                    <Metric icon={<CheckCircle2 size={18} />} label="Checked In" value={checkedIn} note="Attendees scanned at entry" />
                  </div>
                </Panel>
                <Panel eyebrow="Next up" title="Upcoming Events" description="The events you are actively preparing for."><EventCards events={upcoming.slice(0, 6)} organizationId={organizationId} ticketsByEvent={ticketsByEvent} /></Panel>
              </>
            ) : null}

            {activeTab === "events" ? (
              <>
                <Panel eyebrow="Create" title="Create an Event" description="Choose dates from the calendar and times from the time picker. All event times are Eastern Time.">
                  <form action={createOrganizerEventAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <input type="hidden" name="organization_id" value={organizationId} />
                    <input name="title" required placeholder="Event title" className="rounded-xl border border-white/10 bg-black/30 p-3" />
                    <input name="category" placeholder="Category" className="rounded-xl border border-white/10 bg-black/30 p-3" />
                    <input name="venue_name" placeholder="Venue name" className="rounded-xl border border-white/10 bg-black/30 p-3" />
                    <input name="city" placeholder="City" className="rounded-xl border border-white/10 bg-black/30 p-3" />
                    <input name="address" placeholder="Address" className="rounded-xl border border-white/10 bg-black/30 p-3" />
                    <input name="state" defaultValue="NY" placeholder="State" className="rounded-xl border border-white/10 bg-black/30 p-3" />
                    <input name="zip_code" placeholder="ZIP" className="rounded-xl border border-white/10 bg-black/30 p-3" />
                    <label className="text-xs font-bold text-white/55">Start date<input name="starts_date" required type="date" className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label>
                    <label className="text-xs font-bold text-white/55">Start time<input name="starts_time" required type="time" step="900" className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label>
                    <label className="text-xs font-bold text-white/55">End date <span className="font-normal text-white/35">optional</span><input name="ends_date" type="date" className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label>
                    <label className="text-xs font-bold text-white/55">End time <span className="font-normal text-white/35">optional</span><input name="ends_time" type="time" step="900" className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label>
                    <div className="flex items-end pb-3 text-xs font-semibold text-white/40">Eastern Time is applied automatically.</div>
                    <input name="image_url" type="url" placeholder="Event image URL" className="rounded-xl border border-white/10 bg-black/30 p-3" />
                    <input name="capacity" type="number" min="1" placeholder="Capacity (optional)" className="rounded-xl border border-white/10 bg-black/30 p-3" />
                    <textarea name="description" placeholder="Tell guests what to expect" className="min-h-32 rounded-xl border border-white/10 bg-black/30 p-3 md:col-span-2 xl:col-span-3" />
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <label className="flex items-center gap-2 text-sm font-bold"><input name="ticketing_enabled" type="checkbox" defaultChecked /> Enable tickets / registration</label>
                      <label className="flex items-center gap-2 text-sm font-bold"><input name="is_free" type="checkbox" defaultChecked /> Free event</label>
                      <input name="price_min" type="number" min="0" step="0.01" placeholder="Ticket price if paid" className="w-full rounded-xl border border-white/10 bg-black/30 p-3" />
                      <label className="block text-xs font-bold text-white/55">Who pays event fees?
                        <select name="fee_payer" defaultValue="customer" className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white">
                          <option value="customer">Customer pays fees</option>
                          <option value="organizer">Organizer pays fees</option>
                          <option value="split">Split fees 50 / 50</option>
                        </select>
                      </label>
                      <p className="text-[11px] leading-5 text-white/40">Paid tickets use a 5% TheOutHaven platform fee plus estimated Stripe processing. The selected fee responsibility is snapshotted on every order.</p>
                      <button className="w-full rounded-xl bg-[#e1062a] px-4 py-3 font-black">Create Draft Event</button>
                    </div>
                  </form>
                </Panel>
                <Panel eyebrow="Manage" title="Your Events" description="Performance numbers stay on Overview. Use this area to update status, open the public listing, manage attendees, or scan tickets."><EventCards events={eventRows} organizationId={organizationId} ticketsByEvent={ticketsByEvent} editable /></Panel>
              </>
            ) : null}

            {activeTab === "tickets" ? (
              <Panel eyebrow="Admission" title="Tickets & Attendees" description="See registrations and check-in status by event.">
                <div className="space-y-3">
                  {eventRows.map((event) => {
                    const rows = ticketsByEvent.get(event.id) || [];
                    return (
                      <article key={event.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div><h3 className="font-black">{event.title}</h3><p className="mt-1 text-xs text-white/45">{formatDate(event.starts_at)}</p></div>
                          <div className="flex gap-3 text-sm font-black"><span>{rows.length} tickets</span><span className="text-emerald-300">{rows.filter((ticket) => ticket.status === "checked_in").length} checked in</span></div>
                        </div>
                        {rows.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{rows.slice(0, 12).map((ticket) => <div key={ticket.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm"><b>{ticket.attendee_name}</b><p className="text-xs text-white/45">{ticket.attendee_email}</p><p className={`mt-2 text-xs font-black uppercase ${ticket.status === "checked_in" ? "text-emerald-300" : "text-white/55"}`}>{ticket.status.replaceAll("_", " ")}</p></div>)}</div> : <p className="mt-3 text-sm text-white/40">No registrations yet.</p>}
                      </article>
                    );
                  })}
                </div>
              </Panel>
            ) : null}

            {activeTab === "scanner" ? (
              <Panel eyebrow="Door operations" title="Scan Tickets" description="Choose an event and open the camera scanner on the device being used at entry.">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{upcoming.map((event) => <Link key={event.id} href={`/organizers/dashboard/events/${event.id}/scanner`} className="rounded-2xl border border-white/10 bg-white/[.035] p-5 transition hover:border-[#ff2142]/40 hover:bg-[#e1062a]/10"><QrCode size={24} className="text-[#ff2142]" /><h3 className="mt-4 font-black">{event.title}</h3><p className="mt-1 text-xs text-white/45">{formatDate(event.starts_at)}</p><p className="mt-4 text-sm font-black text-[#ff5570]">Open scanner →</p></Link>)}</div>
              </Panel>
            ) : null}

            {activeTab === "payments" ? (
              <>
                <Panel eyebrow="Commerce" title="TheOutHaven Payments" description="Accept paid event bookings while Stripe handles identity verification, balances, and bank payouts.">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Metric icon={<CreditCard size={18} />} label="Status" value={paymentsReady ? "Ready" : paymentAccount?.stripe_connect_onboarding_status || "Not started"} note={paymentsReady ? "Paid events can accept checkout." : "Finish payment onboarding before scheduling paid events."} />
                    <Metric label="Charges" value={paymentAccount?.stripe_connect_charges_enabled ? "Enabled" : "Disabled"} note="Stripe permission to accept payments" />
                    <Metric label="Payouts" value={paymentAccount?.stripe_connect_payouts_enabled ? "Enabled" : "Disabled"} note="Stripe permission to pay your bank" />
                    <Metric label="Platform fee" value="5%" note="TheOutHaven fee on paid event ticket subtotal" />
                  </div>
                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
                    <h3 className="font-black">{paymentsReady ? "Payment account connected" : "Set up payments and payouts"}</h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">TheOutHaven does not create a separate organizer wallet. Your connected Stripe account owns the paid event charge and Stripe sends payouts to your bank. TheOutHaven receives its application fee automatically.</p>
                    <form action="/api/organizers/stripe-connect/onboard" method="post" className="mt-4">
                      <input type="hidden" name="organization_id" value={organizationId} />
                      <button className="rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black">{paymentsReady ? "Manage / Update Payment Account" : "Set Up TheOutHaven Payments"}</button>
                    </form>
                    <p className="mt-3 text-[11px] text-white/35">Payments and payouts powered by Stripe.</p>
                  </div>
                </Panel>
                <Panel eyebrow="Fee responsibility" title="Customer, Organizer, or Split" description="Choose the fee responsibility separately when creating each paid event.">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Metric label="Customer pays" value="100%" note="Checkout adds a service fee designed to cover the 5% platform fee and estimated processing cost." />
                    <Metric label="Organizer pays" value="0%" note="Customer sees the ticket price; platform and processing costs reduce organizer proceeds." />
                    <Metric label="Split" value="50 / 50" note="Customer and organizer share the combined fee burden equally." />
                  </div>
                </Panel>
              </>
            ) : null}

            {activeTab === "profile" ? (
              <Panel eyebrow="Organizer" title="Organization / Profile" description="The identity guests will associate with your events.">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Organization" value={organization.name} note={organization.organizationType} />
                  <Metric label="Verification" value={profile?.verification_status || "pending"} note={profile?.phone_verified ? "Phone verified" : "Phone not verified"} />
                  <Metric label="Publishing" value={profile?.publishing_status || "review"} note="Publishing access status" />
                  <Metric label="Role" value={organization.role} note="Your organization membership" />
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60"><p><b className="text-white">Bio:</b> {profile?.bio || "Not added yet"}</p><p className="mt-2"><b className="text-white">Website:</b> {profile?.website || "Not added yet"}</p><p className="mt-2"><b className="text-white">Instagram:</b> {profile?.instagram || "Not added yet"}</p></div>
              </Panel>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-white/10 bg-white/[.025] p-5 sm:p-6"><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#ff2142]">{eyebrow}</p><h2 className="mt-2 text-xl font-black">{title}</h2><p className="mt-1 text-sm text-white/45">{description}</p><div className="mt-5">{children}</div></section>;
}

function Metric({ icon, label, value, note }: { icon?: React.ReactNode; label: string; value: React.ReactNode; note: string }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="flex items-center justify-between text-white/45"><p className="text-[10px] font-black uppercase tracking-[.14em]">{label}</p>{icon}</div><div className="mt-3 text-2xl font-black capitalize">{value}</div><p className="mt-2 text-xs leading-5 text-white/40">{note}</p></article>;
}

function EventCards({ events, organizationId, ticketsByEvent, editable = false }: { events: any[]; organizationId: string; ticketsByEvent: Map<string, any[]>; editable?: boolean }) {
  if (!events.length) return <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/40">No events here yet.</div>;
  return <div className="grid gap-3 lg:grid-cols-2">{events.map((event) => {
    const tickets = ticketsByEvent.get(event.id) || [];
    return <article key={event.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[.12em] text-white/40"><span>{event.status}</span><span>·</span><span>{event.searchable ? "public" : "not public"}</span><span>·</span><span>{event.ticketing_enabled ? "tickets on" : "tickets off"}</span></div><h3 className="mt-2 text-lg font-black">{event.title}</h3><p className="mt-1 text-sm text-white/45">{event.venue_name || "Venue TBD"} · {event.city || "City TBD"}</p><p className="mt-2 text-xs font-bold text-[#ff8a9d]">{formatDate(event.starts_at)}</p>{!event.is_free ? <p className="mt-2 text-xs text-white/50">${Number(event.price_min || 0).toFixed(2)} · 5% fee · {event.fee_payer === "organizer" ? "organizer pays" : event.fee_payer === "split" ? "split fees" : "customer pays"}</p> : null}</div><div className="text-right text-xs text-white/45"><b className="block text-lg text-white">{tickets.length}</b>tickets</div></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/events/${event.id}`} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black">Public page</Link><Link href={`/organizers/dashboard/events/${event.id}/scanner`} className="rounded-lg border border-[#ff2142]/30 px-3 py-2 text-xs font-black text-[#ff5570]">Scan tickets</Link></div>{editable ? <form action={updateOrganizerEventLifecycleAction} className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4"><input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="event_id" value={event.id} /><select name="status" defaultValue={event.status} className="rounded-lg border border-white/10 bg-black p-2 text-xs"><option value="draft">draft</option><option value="scheduled">scheduled</option><option value="postponed">postponed</option><option value="cancelled">cancelled</option><option value="completed">completed</option></select><button className="rounded-lg bg-white px-3 py-2 text-xs font-black text-black">Update status</button></form> : null}</article>;
  })}</div>;
}
