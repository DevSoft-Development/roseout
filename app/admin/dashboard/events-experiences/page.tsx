import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminEventsExperiencesPage({ searchParams }: { searchParams: Params }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.events);
  const params = await searchParams;
  const q = (first(params.q) || "").replace(/[%,]/g, " ").trim();

  let locationsQuery = supabaseAdmin
    .from("locations")
    .select("id,name,city,state")
    .order("name", { ascending: true })
    .limit(100);

  if (q) locationsQuery = locationsQuery.ilike("name", `%${q}%`);

  const { data: locations, error } = await locationsQuery;
  if (error) throw error;

  const locationIds = (locations || []).map((location) => String(location.id));
  const [{ data: eventRows }, { data: experienceRows }] = await Promise.all([
    locationIds.length
      ? supabaseAdmin.from("events").select("location_id,status,searchable").in("location_id", locationIds).eq("source_kind", "native")
      : Promise.resolve({ data: [] as Array<{ location_id: string; status: string; searchable: boolean }> }),
    locationIds.length
      ? supabaseAdmin.from("experiences").select("location_id,status,searchable").in("location_id", locationIds)
      : Promise.resolve({ data: [] as Array<{ location_id: string; status: string; searchable: boolean }> }),
  ]);

  const eventsByLocation = new Map<string, { total: number; live: number }>();
  for (const row of eventRows || []) {
    const key = String(row.location_id || "");
    const current = eventsByLocation.get(key) || { total: 0, live: 0 };
    current.total += 1;
    if (row.status === "scheduled" && row.searchable) current.live += 1;
    eventsByLocation.set(key, current);
  }

  const experiencesByLocation = new Map<string, { total: number; live: number }>();
  for (const row of experienceRows || []) {
    const key = String(row.location_id || "");
    const current = experiencesByLocation.get(key) || { total: 0, live: 0 };
    current.total += 1;
    if (row.status === "published" && row.searchable) current.live += 1;
    experiencesByLocation.set(key, current);
  }

  return (
    <main className="min-h-screen bg-[#050607] p-6 text-white">
      <div className="mx-auto max-w-[1600px]">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Marketplace</p>
          <h1 className="mt-2 text-3xl font-black">Events & Experiences</h1>
          <p className="mt-1 max-w-3xl text-sm font-semibold text-white/45">
            Choose a location to open its combined Events & Experiences workspace, performance overview, and individual event or experience dashboards.
          </p>
        </div>

        <form className="mt-6 flex flex-wrap gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search locations"
            className="min-w-64 flex-1 rounded-xl border border-white/10 bg-black/30 p-3 text-sm font-semibold outline-none placeholder:text-white/25 focus:border-[#ff2142]/60"
          />
          <button className="rounded-xl bg-[#e1062a] px-5 py-3 text-sm font-black">Search</button>
        </form>

        <div className="mt-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {(locations || []).map((location) => {
            const events = eventsByLocation.get(String(location.id)) || { total: 0, live: 0 };
            const experiences = experiencesByLocation.get(String(location.id)) || { total: 0, live: 0 };
            const base = `/locations/dashboard/events-experiences?adminLocationId=${encodeURIComponent(String(location.id))}&locationId=${encodeURIComponent(String(location.id))}`;

            return (
              <article key={location.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
                <p className="text-xs font-black uppercase tracking-[.14em] text-[#ff5570]">Location</p>
                <h2 className="mt-1 text-lg font-black">{location.name}</h2>
                <p className="mt-1 text-xs font-semibold text-white/35">
                  {location.city || ""}{location.city && location.state ? ", " : ""}{location.state || ""}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs font-bold text-white/35">Events</p>
                    <p className="mt-1 text-xl font-black">{events.total}</p>
                    <p className="text-xs font-semibold text-white/30">{events.live} live</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs font-bold text-white/35">Experiences</p>
                    <p className="mt-1 text-xl font-black">{experiences.total}</p>
                    <p className="text-xs font-semibold text-white/30">{experiences.live} live</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`${base}&tab=overview`} className="rounded-xl bg-[#e1062a] px-4 py-2.5 text-xs font-black">Open workspace</Link>
                  <Link href={`${base}&tab=events`} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black">Events</Link>
                  <Link href={`${base}&tab=experiences`} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black">Experiences</Link>
                </div>
              </article>
            );
          })}
        </div>

        {!locations?.length ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm font-semibold text-white/40">
            No locations match this search.
          </div>
        ) : null}
      </div>
    </main>
  );
}
