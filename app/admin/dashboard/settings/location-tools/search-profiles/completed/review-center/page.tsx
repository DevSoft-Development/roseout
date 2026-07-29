import Link from "next/link";

import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type ProfileRow = {
  location_id: string;
  primary_domain: string;
  canonical_terms: string[] | null;
  confidence: number;
  needs_review: boolean;
  profile_version: number;
  reviewed_at: string | null;
  reviewed_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  verification_source: string | null;
  verification_note: string | null;
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

const PROFILE_SELECT =
  "location_id,primary_domain,canonical_terms,confidence,needs_review,profile_version,reviewed_at,reviewed_by,verified_at,verified_by,verification_source,verification_note";

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

async function loadReviewedProfiles(status: string, from: number, to: number) {
  const base = () =>
    supabaseAdmin
      .from("location_search_profiles")
      .select(PROFILE_SELECT, { count: "exact" })
      .not("reviewed_at", "is", null);

  if (status === "verified") {
    return base()
      .not("verified_at", "is", null)
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .range(from, to);
  }

  if (status === "review") {
    return base()
      .eq("needs_review", true)
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .range(from, to);
  }

  if (status === "clear") {
    return base()
      .eq("needs_review", false)
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .range(from, to);
  }

  return base()
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .range(from, to);
}

export default async function CompletedReviewCenterUpdatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminRole(["superadmin", "admin"]);

  const params = await searchParams;
  const search = safeSearch(singleParam(params.search));
  const status = singleParam(params.status);
  const page = Math.max(1, Number.parseInt(singleParam(params.page) || "1", 10) || 1);
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const profilesResult = await loadReviewedProfiles(status, from, to);
  assertQuery("Reviewed profile lookup failed", profilesResult);

  const profiles = (profilesResult.data ?? []) as unknown as ProfileRow[];
  const locationIds = [...new Set(profiles.map((profile) => profile.location_id))];
  const locations: LocationRow[] = [];

  for (const ids of chunk(locationIds, 100)) {
    const locationResult = await supabaseAdmin
      .from("locations")
      .select("id,name,restaurant_name,activity_name,location_type,city,state")
      .in("id", ids);
    assertQuery("Reviewed location lookup failed", locationResult);
    locations.push(...((locationResult.data ?? []) as LocationRow[]));
  }

  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const filteredProfiles = search
    ? profiles.filter((profile) => {
        const location = locationsById.get(profile.location_id);
        const haystack = [
          location?.name,
          location?.restaurant_name,
          location?.activity_name,
          location?.location_type,
          location?.city,
          location?.state,
          profile.primary_domain,
          ...(profile.canonical_terms ?? []),
          profile.verification_source,
          profile.verification_note,
          profile.location_id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
    : profiles;

  const verifiedCount = filteredProfiles.filter((profile) => Boolean(profile.verified_at)).length;
  const reviewCount = filteredProfiles.filter((profile) => profile.needs_review).length;
  const averageConfidence = filteredProfiles.length
    ? Math.round(
        (filteredProfiles.reduce((sum, profile) => sum + Number(profile.confidence ?? 0), 0) /
          filteredProfiles.length) *
          100,
      )
    : 0;
  const totalRows = profilesResult.count ?? 0;

  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (search) next.set("search", search);
    if (status) next.set("status", status);
    next.set("page", String(nextPage));
    return `?${next.toString()}`;
  };

  return (
    <LocationToolShell
      title="Completed Review Center Updates"
      description="See profiles manually corrected, applied, or verified from the Search Profile Review Center."
      stats={[
        { label: "Reviewed", value: totalRows },
        { label: "Showing", value: filteredProfiles.length },
        { label: "Verified", value: verifiedCount },
        { label: "Still Needs Review", value: reviewCount },
        { label: "Average Confidence", value: `${averageConfidence}%` },
      ]}
    >
      <ToolCard title="Find Review Center updates">
        <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_auto]">
          <input
            name="search"
            defaultValue={search}
            placeholder="Location, city, domain, term, or note"
            className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
          />
          <select name="status" defaultValue={status} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <option value="">All reviewed profiles</option>
            <option value="verified">Verified</option>
            <option value="clear">Review cleared</option>
            <option value="review">Still needs review</option>
          </select>
          <button className="rounded-full border border-white/15 px-5 py-3 text-sm font-black">Apply filters</button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/admin/dashboard/settings/location-tools/search-profiles/completed" className="rounded-full border border-emerald-300/25 px-4 py-2 text-emerald-100">Nightly completed</Link>
          <Link href="/admin/dashboard/settings/location-tools/search-profiles/review" className="rounded-full border border-amber-300/25 px-4 py-2 text-amber-100">Open Review Queue</Link>
          <Link href="/admin/dashboard/settings/location-tools/search-profiles" className="rounded-full border border-white/15 px-4 py-2">Back to Search Profiles</Link>
        </div>
      </ToolCard>

      <ToolCard title={`Review Center updates (${totalRows.toLocaleString()})`}>
        <div className="space-y-3">
          {filteredProfiles.map((profile) => {
            const location = locationsById.get(profile.location_id);
            const name = location?.name ?? location?.restaurant_name ?? location?.activity_name ?? "Unnamed location";
            const source = profile.verification_source || "review_center";
            return (
              <article key={profile.location_id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-white">{name}</h3>
                        <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-[10px] font-black uppercase text-violet-200">Review Center</span>
                        {profile.verified_at ? <span className="rounded-full bg-sky-400/10 px-2.5 py-1 text-[10px] font-black uppercase text-sky-200">Verified</span> : null}
                        {profile.needs_review ? <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase text-amber-200">Still needs review</span> : <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-200">Review cleared</span>}
                      </div>
                      <p className="mt-1 text-xs text-white/50">{[location?.location_type, location?.city, location?.state].filter(Boolean).join(" · ") || "Location details unavailable"}</p>
                      <code className="mt-1 block text-[10px] text-white/30">{profile.location_id}</code>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div><p className="text-[10px] font-black uppercase tracking-wide text-white/35">Classification</p><p className="mt-1 font-semibold">{profile.primary_domain}</p></div>
                      <div><p className="text-[10px] font-black uppercase tracking-wide text-white/35">Confidence</p><p className="mt-1 font-semibold">{Math.round(Number(profile.confidence) * 100)}%</p></div>
                      <div><p className="text-[10px] font-black uppercase tracking-wide text-white/35">Profile version</p><p className="mt-1 font-semibold">v{profile.profile_version}</p></div>
                      <div><p className="text-[10px] font-black uppercase tracking-wide text-white/35">Reviewed</p><p className="mt-1 font-semibold">{profile.reviewed_at ? new Date(profile.reviewed_at).toLocaleString() : "—"}</p></div>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-white/35">Search terms</p>
                      <p className="mt-1 text-sm text-white/75">{profile.canonical_terms?.slice(0, 12).join(", ") || "No canonical terms stored"}</p>
                    </div>
                    <p className="text-[11px] text-white/35">Source: {source}{profile.verification_note ? ` · ${profile.verification_note}` : ""}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link href={`/admin/dashboard/settings/location-tools/search-profiles/${profile.location_id}`} className="rounded-full border border-emerald-300/25 px-4 py-2 text-xs font-black text-emerald-100">View profile</Link>
                  </div>
                </div>
              </article>
            );
          })}

          {filteredProfiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-white/55">No completed Review Center updates match these filters yet.</div>
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
