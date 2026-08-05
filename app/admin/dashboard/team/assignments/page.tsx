import { requireAdminRole } from "@/lib/admin-auth";
import { listAssignableTeamMembers } from "@/lib/team-tools";
import { getAssignmentFacets, searchAssignmentLocations } from "@/lib/team-assignment-service";
import AdminAssignLocationsClient from "@/components/AdminAssignLocationsClient";

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
    state: sp.state || "all",
  };
  const [searchResult, teamMembers, facets] = await Promise.all([
    searchAssignmentLocations({ ...initialFilters, limit: 100 }),
    listAssignableTeamMembers(),
    getAssignmentFacets(),
  ]);

  return (
    <main className="px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,.2),transparent_34%),#0d0d0f] p-6">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">Team operations</p>
          <h1 className="mt-3 text-4xl font-black">Assign Work by Area</h1>
          <p className="mt-3 max-w-4xl text-sm font-bold leading-6 text-white/60">
            Choose a market, city or town, borough, neighborhood, or individual locations. Assign a work type and due date. Every assignment creates a real CRM task for the team member and appears in My Work.
          </p>
        </section>
        <AdminAssignLocationsClient
          initialLocations={searchResult.locations}
          initialCount={searchResult.count}
          initialScope={searchResult.scope}
          teamMembers={teamMembers}
          initialFilters={initialFilters}
          facets={facets}
        />
      </div>
    </main>
  );
}
