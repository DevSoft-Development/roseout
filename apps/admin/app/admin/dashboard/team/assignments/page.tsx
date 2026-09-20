import { requireAdminRole } from "@theouthaven/auth/admin-session";
import AdminAssignLocationsClient from "@/components/AdminAssignLocationsClient";
import {
  getSafeAssignmentFacets,
  searchSafeAssignmentLocations,
} from "@/lib/team-assignment-query-safe";
import { listAssignableTeamMembers } from "@/lib/team-assignment-members";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function TeamAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminRole(["superadmin", "admin", "manager"]);
  const sp = await searchParams;
  const initialFilters = {
    q: sp.q || "",
    market: sp.market || "all",
    city: sp.city || "all",
    town: sp.town || "all",
    borough: sp.borough || "all",
    neighborhood: sp.neighborhood || "all",
    zip: sp.zip || "all",
    state: sp.state || "all",
  };

  const [searchResultState, teamMembersState, facetsState] =
    await Promise.allSettled([
      searchSafeAssignmentLocations({ ...initialFilters, limit: 100 }),
      listAssignableTeamMembers(),
      getSafeAssignmentFacets(),
    ]);

  const searchResult =
    searchResultState.status === "fulfilled"
      ? searchResultState.value
      : {
          locations: [],
          count: 0,
          limited: false,
          scope: "All locations",
          warning: "Locations could not be loaded.",
        };
  const teamMembers =
    teamMembersState.status === "fulfilled" ? teamMembersState.value : [];
  const facets =
    facetsState.status === "fulfilled"
      ? facetsState.value
      : {
          markets: [],
          cities: [],
          boroughs: [],
          neighborhoods: [],
          zips: [],
          states: [],
        };

  const pageWarnings = [
    searchResult.warning,
    teamMembersState.status === "rejected"
      ? "Team members could not be loaded."
      : null,
    facetsState.status === "rejected"
      ? "Area filters could not be loaded."
      : null,
  ].filter(Boolean) as string[];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Team · Assignment Operations"
        title="Assign Work by Territory"
        subtitle="Choose any combination of market, state, city or town, ZIP code, borough, neighborhood, or individual locations. Every assignment creates a real CRM task and appears in My Work."
        badge={<AdminStatusBadge tone={pageWarnings.length ? "amber" : "green"}>{pageWarnings.length ? "Assignment data warning" : "Assignment tools ready"}</AdminStatusBadge>}
      />

        {pageWarnings.length ? (
          <section className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
            {pageWarnings.join(" ")} The page remains available so you can
            retry or use the filters that loaded successfully.
          </section>
        ) : null}

        <AdminAssignLocationsClient
          initialLocations={searchResult.locations}
          initialCount={searchResult.count}
          initialScope={searchResult.scope}
          teamMembers={teamMembers}
          initialFilters={initialFilters}
          facets={facets}
        />
    </AdminPageShell>
  );
}
