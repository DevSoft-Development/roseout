import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  image_url: string | null;
  is_free: boolean;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  ticketing_enabled: boolean | null;
  capacity: number | null;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string, timezone?: string | null) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function priceLabel(event: EventRow) {
  if (event.is_free) return "Free";
  if (event.price_min == null && event.price_max == null) return "See event";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: event.currency || "USD",
    maximumFractionDigits: 0,
  });
  if (event.price_min != null && event.price_max != null && event.price_min !== event.price_max) {
    return `${formatter.format(event.price_min)}–${formatter.format(event.price_max)}`;
  }
  return formatter.format(event.price_min ?? event.price_max ?? 0);
}

function localDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function weekendKeys(now = new Date()) {
  const weekday = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).formatToParts(now).find((part) => part.type === "weekday")?.value === "Sun" ? 0 : now.getDay());
  const local = new Date(now);
  const day = local.getDay();
  const daysToSaturday = day === 0 ? -1 : 6 - day;
  const saturday = new Date(local);
  saturday.setDate(local.getDate() + daysToSaturday);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  void weekday;
  return new Set([localDayKey(saturday), localDayKey(sunday)]);
}

export default async function EventsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const q = (first(params.q) || "").trim();
  const category = (first(params.category) || "").trim();
  const city = (first(params.city) || "").trim();
  const timing = first(params.timing) || "upcoming";
  const freeOnly = first(params.free) === "1";
  const now = new Date();
  const lookback = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from("events")
    .select("id,title,description,category,venue_name,city,state,starts_at,ends_at,timezone,image_url,is_free,price_min,price_max,currency,ticketing_enabled,capacity")
    .eq("source_kind", "native")
    .eq("searchable", true)
    .in("status", ["scheduled", "postponed"])
    .gte("starts_at", lookback)
    .order("starts_at", { ascending: true })
    .limit(120);

  if (q) query = query.or(`title.ilike.%${q.replace(/[%,]/g, " ")}%,description.ilike.%${q.replace(/[%,]/g, " ")}%`);
  if (category) query = query.ilike("category", category);
  if (city) query = query.ilike("city", city);
  if (freeOnly) query = query.eq("is_free", true);

  const { data, error } = await query;
  if (error) throw error;

  const weekend = weekendKeys(now);
  const todayKey = localDayKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowKey = localDayKey(tomorrow);

  const liveEvents = ((data || []) as EventRow[]).filter((event) => {
    const end = new Date(event.ends_at || event.starts_at).getTime();
    if (!Number.isFinite(end) || end < now.getTime()) return false;
    if (timing === "today") return localDayKey(new Date(event.starts_at)) === todayKey;
    if (timing === "tomorrow") return localDayKey(new Date(event.starts_at)) === tomorrowKey;
    if (timing === "weekend") return weekend.has(localDayKey(new Date(event.starts_at)));
    return true;
  });

  const categories = Array.from(new Set(liveEvents.map((event) => event.category).filter((value): value is string => Boolean(value)))).sort();
  const cities = Array.from(new Set(liveEvents.map((event) => event.city).filter((value): value is string => Boolean(value)))).sort();

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#191013] via-[#100d0e] to-[#090909] p-6 sm:p-9">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[.28em] text-rose-300">TheOutHaven Events</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Find something worth going out for.</h1>
            <p className="mt-4 text-base font-semibold leading-7 text-white/60">
              Discover events created by TheOutHaven, locations, and verified organizers. Browse what is happening now, this weekend, and beyond.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/create" className="rounded-2xl bg-[#e1062a] px-5 py-3 text-sm font-black text-white">Search all outings</Link>
            <Link href="/organizer/dashboard" className="rounded-2xl border border-white/15 bg-white/[.04] px-5 py-3 text-sm font-black text-white/80">Create or manage an event</Link>
          </div>
        </section>

        <form className="mt-6 grid gap-3 rounded-3xl border border-white/10 bg-white/[.035] p-4 md:grid-cols-6">
          <input name="q" defaultValue={q} placeholder="Search events" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none md:col-span-2" />
          <select name="timing" defaultValue={timing} className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm">
            <option value="upcoming">Upcoming</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="weekend">This weekend</option>
          </select>
          <select name="category" defaultValue={category} className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm">
            <option value="">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select name="city" defaultValue={city} className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm">
            <option value="">All cities</option>
            {cities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-black">Find events</button>
          <label className="flex items-center gap-2 text-sm font-bold text-white/65 md:col-span-6">
            <input type="checkbox" name="free" value="1" defaultChecked={freeOnly} /> Free events only
          </label>
        </form>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.22em] text-white/35">Upcoming discovery</p>
            <h2 className="mt-1 text-2xl font-black">{liveEvents.length} event{liveEvents.length === 1 ? "" : "s"}</h2>
          </div>
        </div>

        {liveEvents.length ? (
          <section className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {liveEvents.map((event) => (
              <Link key={event.id} href={`/events/${event.id}`} className="group overflow-hidden rounded-3xl border border-white/10 bg-[#111] transition hover:-translate-y-0.5 hover:border-rose-400/30">
                <div className="h-52 bg-[#171717] bg-cover bg-center" style={event.image_url ? { backgroundImage: `linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,.05)), url(${JSON.stringify(event.image_url).slice(1, -1)})` } : undefined}>
                  {!event.image_url ? <div className="grid h-full place-items-center text-sm font-black uppercase tracking-[.2em] text-white/20">TheOutHaven Event</div> : null}
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[.14em] text-rose-300">
                    <span>{formatDate(event.starts_at, event.timezone)}</span>
                    {event.category ? <><span>•</span><span>{event.category.replaceAll("_", " ")}</span></> : null}
                  </div>
                  <h3 className="mt-3 text-xl font-black leading-tight group-hover:text-rose-100">{event.title}</h3>
                  <p className="mt-2 text-sm font-semibold text-white/50">{[event.venue_name, event.city, event.state].filter(Boolean).join(" · ") || "Location details coming soon"}</p>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                    <span className="font-black">{priceLabel(event)}</span>
                    <span className="text-xs font-black text-white/50">{event.ticketing_enabled ? "Tickets available →" : "View event →"}</span>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        ) : (
          <section className="mt-5 rounded-3xl border border-white/10 bg-white/[.03] p-10 text-center">
            <h3 className="text-xl font-black">No matching events yet</h3>
            <p className="mt-2 text-sm font-semibold text-white/45">Try another date, city, or category.</p>
            <Link href="/events" className="mt-5 inline-block rounded-2xl bg-white px-5 py-3 text-sm font-black text-black">Clear filters</Link>
          </section>
        )}
      </div>
    </main>
  );
}
