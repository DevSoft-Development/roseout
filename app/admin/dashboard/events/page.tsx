import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS, canAdmin } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  createNativeEventAction,
  runEventIngestionAction,
  updateEventLifecycleAction,
  updateNativeEventAction,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "scheduled", "postponed", "cancelled", "completed"] as const;
const PROVIDERS = ["ticketmaster", "nyc_events", "nyc_parks", "native"] as const;

type Params = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function dateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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
  const source = first(params.source) || "";
  const timing = first(params.timing) || "all";
  const notice = first(params.notice) || "";
  const now = new Date().toISOString();

  let query = supabaseAdmin
    .from("events")
    .select(
      "id,title,description,category,venue_name,address,city,state,zip_code,starts_at,ends_at,timezone,external_url,image_url,status,searchable,source_kind,updated_at",
      { count: "exact" },
    )
    .order("starts_at", { ascending: timing !== "past" })
    .limit(75);

  if (q) query = query.ilike("title", `%${q}%`);
  if (STATUSES.includes(status as (typeof STATUSES)[number])) query = query.eq("status", status);
  if (source === "native" || source === "provider") query = query.eq("source_kind", source);
  if (timing === "upcoming") query = query.gte("starts_at", now);
  if (timing === "past") query = query.lt("starts_at", now);

  const [eventsResult, totalResult, upcomingResult, publicResult, nativeResult, ...providerResults] = await Promise.all([
    query,
    supabaseAdmin.from("events").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("events").select("id", { count: "exact", head: true }).gte("starts_at", now),
    supabaseAdmin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("searchable", true)
      .in("status", ["scheduled", "postponed"])
      .gte("starts_at", now),
    supabaseAdmin.from("events").select("id", { count: "exact", head: true }).eq("source_kind", "native"),
    ...PROVIDERS.map((provider) =>
      supabaseAdmin
        .from("event_sources")
        .select("last_seen_at", { count: "exact" })
        .eq("provider", provider)
        .order("last_seen_at", { ascending: false })
        .limit(1),
    ),
  ]);

  if (eventsResult.error) throw eventsResult.error;
  const events = eventsResult.data || [];
  const eventIds = events.map((event) => event.id);
  const sourceRows = eventIds.length
    ? await supabaseAdmin.from("event_sources").select("event_id,provider,source_url,last_seen_at").in("event_id", eventIds)
    : { data: [], error: null };
  if (sourceRows.error) throw sourceRows.error;

  const sourcesByEvent = new Map<string, Array<{ provider: string; source_url: string | null; last_seen_at: string | null }>>();
  for (const row of sourceRows.data || []) {
    const rows = sourcesByEvent.get(String(row.event_id)) || [];
    rows.push({ provider: String(row.provider), source_url: row.source_url, last_seen_at: row.last_seen_at });
    sourcesByEvent.set(String(row.event_id), rows);
  }

  const canManage = canAdmin(admin.role, "eventsManage");
  const canImport = canAdmin(admin.role, "eventsImport");
  const providerHealth = PROVIDERS.map((provider, index) => ({
    provider,
    count: providerResults[index]?.count || 0,
    lastSeen: providerResults[index]?.data?.[0]?.last_seen_at || null,
    error: providerResults[index]?.error?.message || null,
  }));

  return (
    <main className="min-h-screen bg-[#080706] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.28em] text-rose-300">Marketplace</p>
            <h1 className="mt-2 text-4xl font-black">Events</h1>
            <p className="mt-2 max-w-3xl text-sm font-bold text-white/55">
              Operate canonical event inventory, provider ingestion, publishing, lifecycle, and native TheOutHaven events from one workspace.
            </p>
          </div>
          <Link href="/events" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black text-white/80">
            Public event experience
          </Link>
        </header>

        {notice ? <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-100">{notice}</div> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Canonical inventory", totalResult.count || 0],
            ["Upcoming", upcomingResult.count || 0],
            ["Public upcoming", publicResult.count || 0],
            ["Native", nativeResult.count || 0],
            ["Filtered results", eventsResult.count || 0],
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
              <p className="text-xs font-black uppercase tracking-widest text-white/40">{label}</p>
              <p className="mt-2 text-3xl font-black">{value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Provider health</h2>
              <p className="mt-1 text-sm text-white/50">Source volume and the latest provider record seen by ingestion.</p>
            </div>
            {canImport ? (
              <form action={runEventIngestionAction} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                {PROVIDERS.filter((provider) => provider !== "native").map((provider) => (
                  <label key={provider} className="flex items-center gap-2 text-xs font-bold text-white/70">
                    <input type="checkbox" name={provider} defaultChecked /> {provider.replaceAll("_", " ")}
                  </label>
                ))}
                <button className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black">Run ingestion</button>
              </form>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {providerHealth.map((provider) => (
              <article key={provider.provider} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <b className="capitalize">{provider.provider.replaceAll("_", " ")}</b>
                  <span className="text-sm text-white/50">{provider.count}</span>
                </div>
                <p className="mt-2 text-xs text-white/45">Last seen: {formatDate(provider.lastSeen)}</p>
                {provider.error ? <p className="mt-2 text-xs font-bold text-red-300">{provider.error}</p> : null}
              </article>
            ))}
          </div>
        </section>

        {canManage ? (
          <details className="rounded-3xl border border-rose-400/20 bg-rose-500/[.05] p-5">
            <summary className="cursor-pointer text-lg font-black">Create native event</summary>
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
              <input name="external_url" type="url" placeholder="External URL" className="rounded-xl bg-black/35 p-3" />
              <input name="image_url" type="url" placeholder="Image URL" className="rounded-xl bg-black/35 p-3" />
              <textarea name="description" placeholder="Description" className="min-h-28 rounded-xl bg-black/35 p-3 md:col-span-2 xl:col-span-3" />
              <div className="space-y-3">
                <select name="status" defaultValue="draft" className="w-full rounded-xl bg-black p-3">
                  {STATUSES.map((eventStatus) => <option key={eventStatus}>{eventStatus}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm font-bold"><input name="searchable" type="checkbox" /> Publish to search</label>
                <button className="w-full rounded-xl bg-rose-600 px-4 py-3 font-black">Create event</button>
              </div>
            </form>
          </details>
        ) : null}

        <form className="grid gap-2 rounded-2xl border border-white/10 bg-white/[.03] p-4 md:grid-cols-5">
          <input name="q" defaultValue={q} placeholder="Search event title" className="rounded-xl bg-black/30 p-3" />
          <select name="status" defaultValue={status} className="rounded-xl bg-black p-3">
            <option value="">All statuses</option>
            {STATUSES.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select name="source" defaultValue={source} className="rounded-xl bg-black p-3">
            <option value="">All sources</option><option value="provider">Provider</option><option value="native">Native</option>
          </select>
          <select name="timing" defaultValue={timing} className="rounded-xl bg-black p-3">
            <option value="all">All dates</option><option value="upcoming">Upcoming</option><option value="past">Past</option>
          </select>
          <button className="rounded-xl bg-white font-black text-black">Apply filters</button>
        </form>

        <section className="space-y-3">
          {events.map((event) => {
            const sources = sourcesByEvent.get(event.id) || [];
            return (
              <article key={event.id} className="rounded-3xl border border-white/10 bg-white/[.035] p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-white/45">
                      <span>{event.source_kind}</span><span>·</span><span>{event.status}</span><span>·</span><span>{event.searchable ? "public" : "hidden"}</span>
                    </div>
                    <h2 className="mt-2 text-xl font-black">{event.title}</h2>
                    <p className="mt-1 text-sm text-white/55">{event.venue_name || "Venue not set"} · {event.city || "City not set"}</p>
                    <p className="mt-2 text-sm font-bold text-rose-100">{formatDate(event.starts_at)}{event.ends_at ? ` → ${formatDate(event.ends_at)}` : ""}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sources.map((item) => item.source_url ? (
                        <a key={`${item.provider}-${item.source_url}`} href={item.source_url} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/60">
                          {item.provider.replaceAll("_", " ")}
                        </a>
                      ) : <span key={item.provider} className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/60">{item.provider.replaceAll("_", " ")}</span>)}
                      <Link href={`/events/${event.id}`} className="rounded-full border border-rose-300/20 px-3 py-1 text-xs font-bold text-rose-200">Public detail</Link>
                    </div>
                  </div>

                  {canManage ? (
                    <form action={updateEventLifecycleAction} className="flex min-w-72 flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                      <input type="hidden" name="id" value={event.id} />
                      <select name="status" defaultValue={event.status} className="rounded-lg bg-black p-2 text-sm">
                        {STATUSES.map((item) => <option key={item}>{item}</option>)}
                      </select>
                      <label className="flex items-center gap-2 text-xs font-bold"><input name="searchable" type="checkbox" defaultChecked={event.searchable} /> Public</label>
                      <button className="rounded-lg bg-white px-3 py-2 text-xs font-black text-black">Save lifecycle</button>
                    </form>
                  ) : null}
                </div>

                {canManage && event.source_kind === "native" ? (
                  <details className="mt-4 border-t border-white/10 pt-4">
                    <summary className="cursor-pointer text-sm font-black text-white/70">Edit native event details</summary>
                    <form action={updateNativeEventAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <input type="hidden" name="id" value={event.id} />
                      <input name="title" required defaultValue={event.title} className="rounded-xl bg-black/35 p-3" />
                      <input name="category" defaultValue={event.category || ""} placeholder="Category" className="rounded-xl bg-black/35 p-3" />
                      <input name="venue_name" defaultValue={event.venue_name || ""} placeholder="Venue" className="rounded-xl bg-black/35 p-3" />
                      <input name="city" defaultValue={event.city || ""} placeholder="City" className="rounded-xl bg-black/35 p-3" />
                      <input name="address" defaultValue={event.address || ""} placeholder="Address" className="rounded-xl bg-black/35 p-3" />
                      <input name="state" defaultValue={event.state || "NY"} placeholder="State" className="rounded-xl bg-black/35 p-3" />
                      <input name="zip_code" defaultValue={event.zip_code || ""} placeholder="ZIP" className="rounded-xl bg-black/35 p-3" />
                      <input name="timezone" defaultValue={event.timezone || "America/New_York"} className="rounded-xl bg-black/35 p-3" />
                      <input name="starts_at" required type="datetime-local" defaultValue={dateTimeLocal(event.starts_at)} className="rounded-xl bg-black/35 p-3" />
                      <input name="ends_at" type="datetime-local" defaultValue={dateTimeLocal(event.ends_at)} className="rounded-xl bg-black/35 p-3" />
                      <input name="external_url" type="url" defaultValue={event.external_url || ""} placeholder="External URL" className="rounded-xl bg-black/35 p-3" />
                      <input name="image_url" type="url" defaultValue={event.image_url || ""} placeholder="Image URL" className="rounded-xl bg-black/35 p-3" />
                      <textarea name="description" defaultValue={event.description || ""} className="min-h-24 rounded-xl bg-black/35 p-3 md:col-span-2 xl:col-span-3" />
                      <button className="rounded-xl bg-rose-600 px-4 py-3 font-black">Save details</button>
                    </form>
                  </details>
                ) : null}
              </article>
            );
          })}
          {!events.length ? <p className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-white/50">No events match these filters.</p> : null}
        </section>
      </div>
    </main>
  );
}
