import Link from "next/link";

import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type CompletedItem = {
  id: string;
  run_id: string;
  location_id: string;
  result: { needs_review?: boolean } | null;
  completed_at: string | null;
};
type LocationRow = {
  id: string;
  name: string | null;
  restaurant_name: string | null;
  activity_name: string | null;
  location_type: string | null;
  city: string | null;
  state: string | null;
};
type ProfileRow = {
  location_id: string;
  primary_domain: string;
  canonical_terms: string[] | null;
  confidence: number;
  needs_review: boolean;
  profile_version: number;
  generated_at: string;
  verified_at: string | null;
};
type RunRow = {
  id: string;
  mode: string;
  configuration: Record<string, unknown> | null;
  created_at: string;
};

function singleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function safeSearch(value: string) {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

function assertQuery(label: string, result: { error: { message: string } | null }) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
}

function chunk<T>(values: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

export default async function CompletedSearchProfileEnrichmentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminRole(["superadmin", "admin"]);

  const params = await searchParams;
  const search = safeSearch(singleParam(params.search));
  const review = singleParam(params.review);
  const page = Math.max(1, Number.parseInt(singleParam(params.page) || "1", 10) || 1);
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const nightlyRunsResult = await supabaseAdmin
    .from("location_search_profile_runs")
    .select("id,mode,configuration,created_at")
    .eq("mode", "nightly_priority_rebuild")
    .order("created_at", { ascending: false })
    .limit(100);
  assertQuery("Nightly run lookup failed", nightlyRunsResult);

  const runs = (nightlyRunsResult.data ?? []) as RunRow[];
  const runIds = runs.map((run) => run.id);
  let completedItems: CompletedItem[] = [];
  let totalRows = 0;

  if (runIds.length > 0) {
    let itemsQuery = supabaseAdmin
      .from("location_search_profile_run_items")
      .select("id,run_id,location_id,result,completed_at", { count: "exact" })
      .in("run_id", runIds)
      .eq("status", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (review === "yes") itemsQuery = itemsQuery.eq("result->>needs_review", "true");
    if (review === "no") itemsQuery = itemsQuery.eq("result->>needs_review", "false");

    const itemsResult = await itemsQuery;
    assertQuery("Completed enrichment lookup failed", itemsResult);
    completedItems = (itemsResult.data ?? []) as CompletedItem[];
    totalRows = itemsResult.count ?? 0;
  }

  const locationIds = [...new Set(completedItems.map((item) => item.location_id))];
  const locations: LocationRow[] = [];
  const profiles: ProfileRow[] = [];

  for (const ids of chunk(locationIds, 100)) {
    const [locationResult, profileResult] = await Promise.all([
      supabaseAdmin
        .from("locations")
        .select("id,name,restaurant_name,activity_name,location_type,city,state")
        .in("id", ids),
      supabaseAdmin
        .from("location_search_profiles")
        .select("location_id,primary_domain,canonical_terms,confidence,needs_review,profile_version,generated_at,verified_at")
        .in("location_id", ids),
    ]);
    assertQuery("Completed location lookup failed", locationResult);
    assertQuery("Completed profile lookup failed", profileResult);
    locations.push(...((locationResult.data ?? []) as LocationRow[]));
    profiles.push(...((profileResult.data ?? []) as ProfileRow[]));
  }

  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const profilesById = new Map(profiles.map((profile) => [profile.location_id, profile]));
  const runsById = new Map(runs.map((run) => [run.id, run]));

  const filteredItems = search
    ? completedItems.filter((item) => {
        const location = locationsById.get(item.location_id);
        const profile = profilesById.get(item.location_id);
        const haystack = [
          location?.name,
          location?.restaurant_name,
          location?.activity_name,
          location?.location_type,
          location?.city,
          location?.state,
          profile?.primary_domain,
          ...(profile?.canonical_terms ?? []),
          item.location_id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
    : completedItems;

  const reviewCount = filteredItems.filter((item) => profilesById.get(item.location_id)?.needs_review).length;
  const verifiedCount = filteredItems.filter((item) => Boolean(profilesById.get(item.location_id)?.verified_at)).length;
  const averageConfidence = filteredItems.length
    ? Math.round(
        (filteredItems.reduce((sum, item) => sum + Number(profilesById.get(item.location_id)?.confidence ?? 0), 0) /
          filteredItems.length) *
          100,
      )
    : 0;

  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (search) next.set("search", search);
    if (review) next.set("review", review);
    next.set("page", String(nextPage));
    return `?${next.toString()}`;
  };

  return (
    <LocationToolShell
      title="Completed Profile Enrichment"
      description="See locations successfully rebuilt by the nightly search-profile Edge Function and inspect the classification now used by search."
      stats={[
        { label: "Completed", value: totalRows },
        { label: "Showing", value: filteredItems.length },
        { label: "Needs Review", value: reviewCount },
        { label: "Verified", value: verifiedCount },
        { label: "Average Confidence", value: `${averageConfidence}%` },
      ]}
    >
      <ToolCard title="Find completed locations">
        <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <input
            name="search"
            defaultValue={search}
            placeholder="Location, city, state, domain, or term"
            className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
          />
          <select name="review" defaultValue={review} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <option value="">All outcomes</option>
            <option value="no">No review needed</option>
            <option value="yes">Needs review</option>
          </select>
          <button className="rounded-full border border-white/15 px-5 py-3 text-sm font-black">Apply filters</button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/admin/dashboard/settings/location-tools/search-profiles" className="rounded-full border border-white/15 px-4 py-2">Back to Search Profiles</Link>
          <Link href="/admin/dashboard/settings/location-tools/search-profiles/review" className="rounded-full border border-amber-300/25 px-4 py-2 text-amber-100">Open Review Queue</Link>
        </div>
      </ToolCard>

      <ToolCard title={`Completed locations (${totalRows.toLocaleString()})`}>
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const location = locationsById.get(item.location_id);
            const profile = profilesById.get(item.location_id);
            const run = runsById.get(item.run_id);
            const name = location?.name ?? location?.restaurant_name ?? location?.activity_name ?? "Unnamed location";
            const needsReview = profile?.needs_review ?? item.result?.needs_review ?? false;

            return (
              <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-white">{name}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${needsReview ? "bg-amber-400/10 text-amber-200" : "bg-emerald-400/10 text-emerald-200"}`}>
                          {needsReview ? "Needs review" : "Completed"}
                        </span>
                        {profile?.verified_at ? <span className="rounded-full bg-sky-400/10 px-2.5 py-1 text-[10px] font-black uppercase text-sky-200">Verified</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-white/50">
                        {[location?.location_type, location?.city, location?.state].filter(Boolean).join(" · ") || "Location details unavailable"}
                      </p>
                      <code className="mt-1 block text-[10px] text-white/30">{item.location_id}</code>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div><p className="text-[10px] font-black uppercase tracking-wide text-white/35">Classification</p><p className="mt-1 font-semibold">{profile?.primary_domain ?? "—"}</p></div>
                      <div><p className="text-[10px] font-black uppercase tracking-wide text-white/35">Confidence</p><p className="mt-1 font-semibold">{profile ? `${Math.round(Number(profile.confidence) * 100)}%` : "—"}</p></div>
                      <div><p className="text-[10px] font-black uppercase tracking-wide text-white/35">Profile version</p><p className="mt-1 font-semibold">{profile ? `v${profile.profile_version}` : "—"}</p></div>
                      <div><p className="text-[10px] font-black uppercase tracking-wide text-white/35">Completed</p><p className="mt-1 font-semibold">{item.completed_at ? new Date(item.completed_at).toLocaleString() : "—"}</p></div>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-white/35">Search terms</p>
                      <p className="mt-1 text-sm text-white/75">{profile?.canonical_terms?.slice(0, 12).join(", ") || "No canonical terms stored"}</p>
                    </div>

                    <p className="text-[11px] text-white/35">
                      Source: {String(run?.configuration?.source ?? "nightly-search-profile-queue-edge")} · Run {item.run_id.slice(0, 8)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link href={`/admin/dashboard/settings/location-tools/search-profiles/${item.location_id}`} className="rounded-full border border-emerald-300/25 px-4 py-2 text-xs font-black text-emerald-100">Review profile</Link>
                    <Link href={`/admin/dashboard/settings/location-tools/search-profiles/runs/${item.run_id}`} className="rounded-full border border-white/15 px-4 py-2 text-xs font-black">View run</Link>
                  </div>
                </div>
              </article>
            );
          })}

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-white/55">
              No completed nightly profile enrichments match these filters yet.
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between text-sm text-white/60">
          <span>Page {page}</span>
          <div className="flex gap-2">
            {page > 1 ? <a href={pageHref(page - 1)} className="rounded-full border border-white/15 px-4 py-2">Previous</a> : null}
            {to + 1 < totalRows ? <a href={pageHref(page + 1)} className="rounded-full border border-white/15 px-4 py-2">Next</a> : null}
          </div>
        </div>
      </ToolCard>
    </LocationToolShell>
  );
}
