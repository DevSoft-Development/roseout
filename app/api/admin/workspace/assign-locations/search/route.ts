import { requireAdminRole } from "@/lib/admin-auth";
import { getSafeAssignmentFacets, searchSafeAssignmentLocations } from "@/lib/team-assignment-query-safe";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdminRole(["superadmin", "admin", "manager"]);
    const { searchParams } = new URL(req.url);
    const filters = {
      q: searchParams.get("q") || undefined,
      market: searchParams.get("market") || undefined,
      city: searchParams.get("city") || undefined,
      town: searchParams.get("town") || undefined,
      borough: searchParams.get("borough") || undefined,
      neighborhood: searchParams.get("neighborhood") || undefined,
      state: searchParams.get("state") || undefined,
      limit: Number(searchParams.get("limit") || 100),
    };
    const [result, facets] = await Promise.all([
      searchSafeAssignmentLocations(filters),
      searchParams.get("includeFacets") === "1" ? getSafeAssignmentFacets() : Promise.resolve(null),
    ]);
    return Response.json({ ...result, facets });
  } catch (error) {
    console.error("TEAM_ASSIGNMENT_SEARCH_FAILED", error);
    return Response.json(
      { error: "Could not search locations right now. Reload and try again." },
      { status: 500 },
    );
  }
}
