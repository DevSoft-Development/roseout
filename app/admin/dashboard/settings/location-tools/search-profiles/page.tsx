import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import {
  ProfileAction,
  SearchProfilesClient,
} from "@/components/admin/location-tools/SearchProfilesClient";
import { requireAdminRole } from "@/lib/admin-auth";
import { SEARCH_PROFILE_VERSION } from "@/lib/search/profile";
import { getSearchProfileStatus } from "@/lib/search/profile/profileFilters";
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
  generated_at: string;
  verified_at: string | null;
};

function singleParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeIlikeTerm(value: string): string {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

function assertQuerySucceeded(
  label: string,
  result: { error: { message: string } | null },
): void {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
}

export default async function SearchProfilesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminRole(["superadmin", "admin"]);

  const params = await searchParams;
  const search = singleParam(params.search);
  const page = Math.max(1, Number.parseInt(singleParam(params.page) || "1", 10) || 1);
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let locationsQuery = supabaseAdmin
    .from("locations")
    .select(
      "id,name,restaurant_name,activity_name,location_type,market,city,neighborhood,borough,county,state,active,is_searchable,is_hidden,is_low_level,updated_at",
      { count: "exact" },
    )
    .order("name", { ascending: true, nullsFirst: false })
    .range(from, to);

  if (search) {
    if (isUuid(search)) {
      locationsQuery = locationsQuery.eq("id", search);
    } else {
      const term = safeIlikeTerm(search);
      if (term) {
        const pattern = `%${term}%`;
        locationsQuery = locationsQuery.or(
          [
            `name.ilike.${pattern}`,
            `restaurant_name.ilike.${pattern}`,
            `activity_name.ilike.${pattern}`,
            `market.ilike.${pattern}`,
            `city.ilike.${pattern}`,
            `neighborhood.ilike.${pattern}`,
            `borough.ilike.${pattern}`,
            `county.ilike.${pattern}`,
            `state.ilike.${pattern}`,
          ].join(","),
        );
      }
    }
  }

  const [locationsResult, eligibleResult, profilesResult, staleResult, reviewResult, lowResult, failedResult, activeRunsResult] =
    await Promise.all([
      locationsQuery,
      supabaseAdmin
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .eq("is_searchable", true)
        .eq("is_hidden", false)
        .eq("is_low_level", false),
      supabaseAdmin
        .from("location_search_profiles")
        .select("location_id", { count: "exact", head: true }),
      supabaseAdmin
        .from("location_search_profiles")
        .select("location_id", { count: "exact", head: true })
        .lt("profile_version", SEARCH_PROFILE_VERSION),
      supabaseAdmin
        .from("location_search_profiles")
        .select("location_id", { count: "exact", head: true })
        .eq("needs_review", true),
      supabaseAdmin
        .from("location_search_profiles")
        .select("location_id", { count: "exact", head: true })
        .lt("confidence", 0.55),
      supabaseAdmin
        .from("location_search_profile_refresh_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      supabaseAdmin
        .from("location_search_profile_runs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "running", "cancelling"]),
    ]);

  assertQuerySucceeded("Location list query failed", locationsResult);
  assertQuerySucceeded("Eligible-location count failed", eligibleResult);
  assertQuerySucceeded("Profile count failed", profilesResult);
  assertQuerySucceeded("Stale-profile count failed", staleResult);
  assertQuerySucceeded("Review count failed", reviewResult);
  assertQuerySucceeded("Low-confidence count failed", lowResult);
  assertQuerySucceeded("Failed-queue count failed", failedResult);
  assertQuerySucceeded("Active-run count failed", activeRunsResult);

  const locations = locationsResult.data ?? [];
  const locationIds = locations.map((location) => location.id);
  let profilesByLocation = new Map<string, ProfileRow>();

  if (locationIds.length > 0) {
    const profileRowsResult = await supabaseAdmin
      .from("location_search_profiles")
      .select(
        "location_id,primary_domain,canonical_terms,confidence,needs_review,profile_version,generated_at,verified_at",
      )
      .in("location_id", locationIds);

    assertQuerySucceeded("Location profile query failed", profileRowsResult);
    profilesByLocation = new Map(
      ((profileRowsResult.data ?? []) as unknown as ProfileRow[]).map((profile) => [
        profile.location_id,
        profile,
      ]),
    );
  }

  const eligibleCount = eligibleResult.count ?? 0;
  const profileCount = profilesResult.count ?? 0;
  const stats = [
    { label: "Eligible Locations", value: eligibleCount },
    { label: "Profiles Generated", value: profileCount },
    { label: "Missing Profiles", value: Math.max(0, eligibleCount - profileCount) },
    { label: "Stale Profiles", value: staleResult.count ?? 0 },
    { label: "Needs Review", value: reviewResult.count ?? 0 },
    { label: "Low Confidence", value: lowResult.count ?? 0 },
    { label: "Failed Queue Items", value: failedResult.count ?? 0 },
    { label: "Active Backfill Runs", value: activeRunsResult.count ?? 0 },
  ];

  const totalRows = locationsResult.count ?? 0;
  const hasPrevious = page > 1;
  const hasNext = to + 1 < totalRows;
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (search) next.set("search", search);
    next.set("page", String(nextPage));
    return `?${next.toString()}`;
  };

  return (
    <LocationToolShell
      title="Search Profiles"
      description="Inspect canonical search classification, review flagged profiles, apply corrections, and verify profiles in bulk."
      stats={stats}
    >
      <ToolCard title="Search and backfill">
        <form className="mb-4 flex gap-2">
          <input
            name="search"
            defaultValue={search}
            placeholder="Name, UUID, market, city, area"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
          />
          <button className="rounded-full border border-white/15 px-5 font-black">
            Search
          </button>
        </form>
        <SearchProfilesClient eligibleCount={eligibleCount} />
      </ToolCard>

      <ToolCard title={`Locations (${totalRows})`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-white/45">
                <th className="p-2">Location</th>
                <th>Type</th>
                <th>Market</th>
                <th>City / Area</th>
                <th>Status</th>
                <th>Domain</th>
                <th>Categories</th>
                <th>Confidence</th>
                <th>Version</th>
                <th>Generated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => {
                const profile = profilesByLocation.get(location.id) ?? null;
                const eligibleLocation =
                  location.active === true &&
                  location.is_searchable === true &&
                  location.is_hidden !== true &&
                  location.is_low_level !== true;
                const status = profile?.verified_at
                  ? "Verified"
                  : getSearchProfileStatus({
                      eligible: eligibleLocation,
                      profileVersion: profile?.profile_version,
                      currentVersion: SEARCH_PROFILE_VERSION,
                      needsReview: profile?.needs_review,
                      confidence: profile?.confidence,
                    });

                return (
                  <tr key={location.id} className="border-t border-white/10">
                    <td className="p-2">
                      <strong>{location.name ?? location.restaurant_name ?? location.activity_name ?? "Unnamed location"}</strong>
                      <code className="block text-[10px] text-white/35">{location.id}</code>
                    </td>
                    <td>{location.location_type ?? "—"}</td>
                    <td>{location.market ?? "—"}</td>
                    <td>
                      {[location.city, location.neighborhood, location.borough]
                        .filter(Boolean)
                        .join(" / ") || "—"}
                    </td>
                    <td>{status}</td>
                    <td>{profile?.primary_domain ?? "—"}</td>
                    <td className="max-w-48 truncate">
                      {profile?.canonical_terms?.slice(0, 4).join(", ") || "—"}
                    </td>
                    <td>
                      {profile ? `${Math.round(Number(profile.confidence) * 100)}%` : "—"}
                    </td>
                    <td>{profile?.profile_version ?? "—"}</td>
                    <td>
                      {profile?.generated_at
                        ? new Date(profile.generated_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <ProfileAction locationId={location.id} hasProfile={Boolean(profile)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-white/60">
          <span>Page {page}</span>
          <div className="flex gap-2">
            {hasPrevious ? (
              <a className="rounded-full border border-white/15 px-4 py-2" href={pageHref(page - 1)}>
                Previous
              </a>
            ) : null}
            {hasNext ? (
              <a className="rounded-full border border-white/15 px-4 py-2" href={pageHref(page + 1)}>
                Next
              </a>
            ) : null}
          </div>
        </div>
      </ToolCard>
    </LocationToolShell>
  );
}
