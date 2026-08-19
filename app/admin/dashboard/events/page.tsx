import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS, canAdmin } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createNativeEventAction, updateEventLifecycleAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "scheduled", "postponed", "cancelled", "completed"] as const;
type Params = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default async function EventsAdminPage({ searchParams }: { searchParams: Params }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.events);
  const params = await searchParams;
  const q = (first(params.q) || "").replace(/[%,]/g, " ").trim();
  const status = first(params.status) || "";
  const notice = first(params.notice) || "";
  const now = new Date().toISOString();

  let query = supabaseAdmin
    .from("events")
    .select("id,title,category,venue_name,city,state,starts_at,ends_at,status,searchable,is_free,price_min,ticketing_enabled,capacity,organization_id,location_id,metadata,created_at", { count: "exact" })
    .eq("source_kind", "native")
    .order("starts_at", { ascending: true })
    .limit(100);
  if (q) query = query.ilike("title", `%${q}%`);
  if (STATUSES.includes(status as (typeof STATUSES)[number])) query = query.eq("status", status);

  const [eventsResult, totalResult, publicResult, upcomingResult] = await Promise.all([
    query,
    supabaseAdmin.from("events").select("id", { count: "exact", head: true }).eq("source_kind", "native"),
    supabaseAdmin.from("events").select("id", { count: "exact", head: true }).eq("source_kind", "native").eq("searchable", true).in("status", ["scheduled", "postponed"]),
    supabaseAdmin.from("events").select("id", { count: "exact", head: true }).eq("source_kind", "native").or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`).not("status", "in", "(cancelled,completed)"),
  ]);
  if (eventsResult.error) throw eventsResult.error;

  const events = eventsResult.data || [];
  const eventIds = events.map((event) => event.id);
  const organizationIds = [...new Set(events.map((event) => event.organization_id).filter(Boolean))] as string[];
  const locationIds = [...new Set(events.map((event) => event.location_id).filter(Boolean))] as string[];

  const [ticketsResult, organizationsResult, locationsResult] = await Promise.all([
    eventIds.length ? supabaseAdmin.from("event_tickets").select("event_id,status").in("event_id", eventIds) : Promise.resolve({ data: [], error: null }),
    organizationIds.length ? supabaseAdmin.from("organizations").select("id,name").in("id", organizationIds) : Promise.resolve({ data: [], error: null }),
    locationIds.length ? supabaseAdmin.from("locations").select("id,name,restaurant_name,activity_name").in("id", locationIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (ticketsResult.error) throw ticketsResult.error;
  if (organizationsResult.error) throw organizationsResult.error;
  if (locationsResult.error) throw locationsResult.error;

  const orgNames = new Map((organizationsResult.data || []).map((row: any) => [String(row.id), String(row.name || "Organization")]));
  const locationNames = new Map((locationsResult.data || []).map((row: any) => [String(row.id), String(row.name || row.restaurant_name || row.activity_name || "Location")]));
  const ticketCounts = new Map<string, { total: number; checkedIn: number }>();
  for (const ticket of ticketsResult.data || []) {
    const current = ticketCounts.get(String(ticket.event_id)) || { total: 0, checkedIn: 0 };
    current.total += 1;
    if (ticket.status === "checked_in") current.checkedIn += 1;
    ticketCounts.set(String(ticket.event_id), current);
  }

  const canManage = canAdmin(admin.role, "eventsManage");

  return (
    <main className="min-h-screen bg-[#080706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.28em] text-rose-300">Marketplace</p>
            <h1 className="mt-2 text-4xl font-black">Events</h1>
            <p className="mt-2 max-w-3xl text-sm font-bold text-white/55">Manage events created by TheOutHaven, locations, and verified organizers. Provider imports are intentionally not the primary operating model.</p>
          </div>
          <div className="flex gap-2"><Link href="/events" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black text-white/80">Public events</Link><Link href="/organizers/dashboard" className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-2 text-sm font-black text-rose-100">Organizer dashboard</Link></div>
        </header>

        {notice ? <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-100">{notice}</div> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[["First-party events", totalResult.count || 0], ["Active / upcoming", upcomingResult.count || 0], ["Public", publicResult.count || 0], ["Filtered", eventsResult.count || 0]].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs font-black uppercase tracking-widest text-white/40">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></article>)}
        </section>

        {canManage ? (
          <details className="rounded-3xl border border-rose-400/20 bg-rose-500/[.05] p-5">
            <summary className="cursor-pointer text-lg font-black">Create TheOutHaven event</summary>
            <form action={createNativeEventAction} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input name="title" required placeholder="Event title" className="rounded-xl bg-black/35 p-3" />
              <input name="category" placeholder="Category" className="rounded-xl bg-black/35 p-3" />
              <input name="venue_name" placeholder="Venue" className="rounded-xl bg-black/35 p-3" />
              <input name="city" placeholder="City" className="rounded-xl bg-black/35 p-3" />
              <input name="address" placeholder="Address" className="rounded-xl bg-black/35 p-3" />
              <input name="state" defaultValue="NY" placeholder="State" className="rounded-xl bg-black/35 p-3" />
              <input name="zip_code" placeholder="ZIP" className="rounded-xl bg-black/35 p-3" />
              <input name="timezone" defaultValue="America/New_York" className="rounded-xl bg-black/35 p-3" />
              <label className="text-xs font-bold text-white/60">Starts<input name="starts_at" required type="datetime-local" className="mt-1 w-full rounded-xl bg-black/35 p-3 text-white" /></label>
              <label className="text-xs font-bold text-white/60">Ends<input name="ends_at" type="datetime-local" className="mt-1 w-full rounded-xl bg-black/35 p-3 text-white" /></label>
              <input name="capacity" type="number" min="1" placeholder="Capacity" className="rounded-xl bg-black/35 p-3" />
              <input name="image_url" type="url" placeholder="Image URL" className="rounded-xl bg-black/35 p-3" />
              <textarea name="description" placeholder="Description" className="min-h-28 rounded-xl bg-black/35 p-3 md:col-span-2 xl:col-span-2" />
              <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3"><label className="flex items-center gap-2 text-sm font-bold"><input name="ticketing_enabled" type="checkbox" defaultChecked /> Tickets / registration</label><label className="flex items-center gap-2 text-sm font-bold"><input name="is_free" type="checkbox" defaultChecked /> Free event</label><input name="price_min" type="number" min="0" step="0.01" placeholder="Min price" className="w-full rounded-xl bg-black/35 p-2" /></div>
              <div className="space-y-2"><select name="status" defaultValue="draft" className="w-full rounded-xl bg-black p-3">{STATUSES.map((eventStatus) => <option key={eventStatus}>{eventStatus}</option>)}</select><label className="flex items-center gap-2 text-sm font-bold"><input name="searchable" type="checkbox" /> Publish to search</label><button className="w-full rounded-xl bg-rose-600 px-4 py-3 font-black">Create event</button></div>
            </form>
          </details>
        ) : null}

        <form className="grid gap-2 rounded-2xl border border-white/10 bg-white/[.03] p-4 md:grid-cols-3">
          <input name="q" defaultValue={q} placeholder="Search event title" className="rounded-xl bg-black/30 p-3" />
          <select name="status" defaultValue={status} className="rounded-xl bg-black p-3"><option value="">All statuses</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
          <button className="rounded-xl bg-white font-black text-black">Apply filters</button>
        </form>

        <section className="space-y-3">
          {events.map((event) => {
            const ticket = ticketCounts.get(event.id) || { total: 0, checkedIn: 0 };
            const owner = event.organization_id ? orgNames.get(event.organization_id) || "Organizer" : event.location_id ? locationNames.get(event.location_id) || "Location" : "TheOutHaven";
            const ownerType = event.organization_id ? "Organizer" : event.location_id ? "Location" : "TheOutHaven";
            return <article key={event.id} className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-white/45"><span>{ownerType}</span><span>·</span><span>{event.status}</span><span>·</span><span>{event.searchable ? "public" : "hidden"}</span><span>·</span><span>{event.ticketing_enabled ? "ticketing on" : "ticketing off"}</span></div><h2 className="mt-2 text-xl font-black">{event.title}</h2><p className="mt-1 text-sm text-white/55">{owner} · {event.venue_name || "Venue not set"} · {event.city || "City not set"}</p><p className="mt-2 text-sm font-bold text-rose-100">{formatDate(event.starts_at)}{event.ends_at ? ` → ${formatDate(event.ends_at)}` : ""}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/60">{ticket.total} tickets</span><span className="rounded-full border border-emerald-400/20 px-3 py-1 text-xs font-bold text-emerald-200">{ticket.checkedIn} checked in</span><Link href={`/events/${event.id}`} className="rounded-full border border-rose-300/20 px-3 py-1 text-xs font-bold text-rose-200">Public detail</Link></div></div>{canManage ? <form action={updateEventLifecycleAction} className="flex min-w-72 flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/25 p-3"><input type="hidden" name="id" value={event.id} /><select name="status" defaultValue={event.status} className="rounded-lg bg-black p-2 text-sm">{STATUSES.map((item) => <option key={item}>{item}</option>)}</select><label className="flex items-center gap-2 text-xs font-bold"><input name="searchable" type="checkbox" defaultChecked={event.searchable} /> Public</label><button className="rounded-lg bg-white px-3 py-2 text-xs font-black text-black">Save</button></form> : null}</div></article>;
          })}
          {!events.length ? <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-white/40">No first-party events match these filters.</div> : null}
        </section>
      </div>
    </main>
  );
}
