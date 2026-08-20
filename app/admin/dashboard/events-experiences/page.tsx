import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

type OfferingSummary = { events: number; liveEvents: number; experiences: number; liveExperiences: number };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function addSummary(map: Map<string, OfferingSummary>, key: string, kind: "event" | "experience", live: boolean) {
  if (!key) return;
  const current = map.get(key) || { events: 0, liveEvents: 0, experiences: 0, liveExperiences: 0 };
  if (kind === "event") {
    current.events += 1;
    if (live) current.liveEvents += 1;
  } else {
    current.experiences += 1;
    if (live) current.liveExperiences += 1;
  }
  map.set(key, current);
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
      <p className="text-xs font-black uppercase tracking-[.12em] text-white/35">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-white/35">{detail}</p> : null}
    </div>
  );
}

export default async function AdminEventsExperiencesPage({ searchParams }: { searchParams: Params }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.events);
  const params = await searchParams;
  const q = (first(params.q) || "").replace(/[%,]/g, " ").trim();
  const now = new Date().toISOString();

  const [{ data: activeEventRows, error: eventsError }, { data: activeExperienceRows, error: experiencesError }] = await Promise.all([
    supabaseAdmin
      .from("events")
      .select("id,location_id,organization_id,status,searchable,starts_at,ends_at")
      .eq("source_kind", "native")
      .in("status", ["scheduled", "postponed"]),
    supabaseAdmin
      .from("experiences")
      .select("id,location_id,organization_id,status,searchable")
      .eq("status", "published"),
  ]);
  if (eventsError) throw eventsError;
  if (experiencesError) throw experiencesError;

  const activeEvents = (activeEventRows || []).filter((event) => {
    const end = event.ends_at || event.starts_at;
    return end ? new Date(end).getTime() >= new Date(now).getTime() : false;
  });
  const activeExperiences = activeExperienceRows || [];
  const activeExperienceIds = activeExperiences.map((experience) => String(experience.id));

  const { data: upcomingSlots, error: slotsError } = activeExperienceIds.length
    ? await supabaseAdmin
        .from("experience_slots")
        .select("id,experience_id,starts_at,status")
        .in("experience_id", activeExperienceIds)
        .eq("status", "open")
        .gte("starts_at", now)
    : { data: [] as Array<{ id: string; experience_id: string; starts_at: string; status: string }>, error: null };
  if (slotsError) throw slotsError;

  const locationSummary = new Map<string, OfferingSummary>();
  const organizationSummary = new Map<string, OfferingSummary>();

  for (const event of activeEvents) {
    const live = event.status === "scheduled" && Boolean(event.searchable);
    if (event.location_id) addSummary(locationSummary, String(event.location_id), "event", live);
    if (event.organization_id) addSummary(organizationSummary, String(event.organization_id), "event", live);
  }
  for (const experience of activeExperiences) {
    const live = experience.status === "published" && Boolean(experience.searchable);
    if (experience.location_id) addSummary(locationSummary, String(experience.location_id), "experience", live);
    if (experience.organization_id) addSummary(organizationSummary, String(experience.organization_id), "experience", live);
  }

  const activeLocationIds = [...locationSummary.keys()];
  const activeOrganizationIds = [...organizationSummary.keys()];

  let locations: Array<{ id: string; name: string; city: string | null; state: string | null }> = [];
  if (q) {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select("id,name,city,state")
      .ilike("name", `%${q}%`)
      .order("name", { ascending: true })
      .limit(50);
    if (error) throw error;
    locations = (data || []).map((location) => ({ ...location, id: String(location.id) }));
  } else if (activeLocationIds.length) {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select("id,name,city,state")
      .in("id", activeLocationIds)
      .order("name", { ascending: true });
    if (error) throw error;
    locations = (data || []).map((location) => ({ ...location, id: String(location.id) }));
  }

  const { data: organizations, error: organizationsError } = !q && activeOrganizationIds.length
    ? await supabaseAdmin
        .from("organizations")
        .select("id,name")
        .in("id", activeOrganizationIds)
        .order("name", { ascending: true })
    : { data: [] as Array<{ id: string; name: string }>, error: null };
  if (organizationsError) throw organizationsError;

  const visibleLocationIds = locations.map((location) => location.id);
  if (q && visibleLocationIds.length) {
    const [{ data: searchedEvents }, { data: searchedExperiences }] = await Promise.all([
      supabaseAdmin
        .from("events")
        .select("location_id,status,searchable,starts_at,ends_at")
        .eq("source_kind", "native")
        .in("location_id", visibleLocationIds),
      supabaseAdmin
        .from("experiences")
        .select("location_id,status,searchable")
        .in("location_id", visibleLocationIds),
    ]);
    for (const event of searchedEvents || []) {
      const key = String(event.location_id || "");
      const end = event.ends_at || event.starts_at;
      const active = ["scheduled", "postponed"].includes(event.status) && Boolean(end) && new Date(end).getTime() >= new Date(now).getTime();
      if (active) addSummary(locationSummary, key, "event", event.status === "scheduled" && Boolean(event.searchable));
    }
    for (const experience of searchedExperiences || []) {
      if (experience.status !== "published") continue;
      addSummary(locationSummary, String(experience.location_id || ""), "experience", Boolean(experience.searchable));
    }
  }

  const activeLocations = activeLocationIds.length;
  const activeOrganizations = activeOrganizationIds.length;
  const liveEvents = activeEvents.filter((event) => event.status === "scheduled" && event.searchable).length;
  const liveExperiences = activeExperiences.filter((experience) => experience.searchable).length;

  return (
    <main className="min-h-screen bg-[#050607] p-6 text-white">
      <div className="mx-auto max-w-[1600px]">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Marketplace</p>
          <h1 className="mt-2 text-3xl font-black">Events & Experiences</h1>
          <p className="mt-1 max-w-3xl text-sm font-semibold text-white/45">
            See active event and experience activity across TheOutHaven, then open a location workspace or search for any location.
          </p>
        </div>

        <section className="mt-6">
          <div className="mb-3">
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#ff5570]">Marketplace performance</p>
            <h2 className="mt-1 text-xl font-black">Across all active creators</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Metric label="Active locations" value={activeLocations} detail="With an active event or experience" />
            <Metric label="Active organizations" value={activeOrganizations} detail="With an active event or experience" />
            <Metric label="Active events" value={activeEvents.length} detail={`${liveEvents} live`} />
            <Metric label="Active experiences" value={activeExperiences.length} detail={`${liveExperiences} live`} />
            <Metric label="Upcoming events" value={activeEvents.length} detail="Scheduled or postponed" />
            <Metric label="Upcoming experience times" value={(upcomingSlots || []).length} detail="Open times available to book" />
          </div>
        </section>

        <form className="mt-6 flex flex-wrap gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search locations"
            className="min-w-64 flex-1 rounded-xl border border-white/10 bg-black/30 p-3 text-sm font-semibold outline-none placeholder:text-white/25 focus:border-[#ff2142]/60"
          />
          <button className="rounded-xl bg-[#e1062a] px-5 py-3 text-sm font-black">Search</button>
          {q ? <Link href="/admin/dashboard/events-experiences" className="rounded-xl border border-white/10 px-5 py-3 text-sm font-black">Clear</Link> : null}
        </form>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-white/35">{q ? "Location search" : "Active creators"}</p>
            <h2 className="mt-1 text-xl font-black">{q ? `Results for “${q}”` : "Locations & organizations with activity"}</h2>
          </div>
          {!q ? <p className="text-xs font-semibold text-white/35">Inactive locations are hidden until you search for them.</p> : null}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {locations.map((location) => {
            const summary = locationSummary.get(location.id) || { events: 0, liveEvents: 0, experiences: 0, liveExperiences: 0 };
            const base = `/locations/dashboard/events-experiences?adminLocationId=${encodeURIComponent(location.id)}&locationId=${encodeURIComponent(location.id)}`;
            return (
              <article key={`location-${location.id}`} className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
                <p className="text-xs font-black uppercase tracking-[.14em] text-[#ff5570]">Location</p>
                <h3 className="mt-1 text-lg font-black">{location.name}</h3>
                <p className="mt-1 text-xs font-semibold text-white/35">{location.city || ""}{location.city && location.state ? ", " : ""}{location.state || ""}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Metric label="Events" value={summary.events} detail={`${summary.liveEvents} live`} />
                  <Metric label="Experiences" value={summary.experiences} detail={`${summary.liveExperiences} live`} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`${base}&tab=overview`} className="rounded-xl bg-[#e1062a] px-4 py-2.5 text-xs font-black">Open workspace</Link>
                  <Link href={`${base}&tab=events`} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black">Events</Link>
                  <Link href={`${base}&tab=experiences`} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black">Experiences</Link>
                </div>
              </article>
            );
          })}

          {!q ? (organizations || []).map((organization) => {
            const id = String(organization.id);
            const summary = organizationSummary.get(id) || { events: 0, liveEvents: 0, experiences: 0, liveExperiences: 0 };
            return (
              <article key={`organization-${id}`} className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
                <p className="text-xs font-black uppercase tracking-[.14em] text-[#ff5570]">Organization</p>
                <h3 className="mt-1 text-lg font-black">{organization.name}</h3>
                <p className="mt-1 text-xs font-semibold text-white/35">Organizer-managed offerings</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Metric label="Events" value={summary.events} detail={`${summary.liveEvents} live`} />
                  <Metric label="Experiences" value={summary.experiences} detail={`${summary.liveExperiences} live`} />
                </div>
              </article>
            );
          }) : null}
        </div>

        {!locations.length && (q || !(organizations || []).length) ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm font-semibold text-white/40">
            {q ? "No locations match this search." : "No active locations or organizations have events or experiences right now."}
          </div>
        ) : null}
      </div>
    </main>
  );
}
