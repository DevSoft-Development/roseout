import { requireAdminRole } from "@/lib/admin-auth";
import { getAssignmentFacets, searchAssignmentLocations } from "@/lib/team-assignment-service";

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
      searchAssignmentLocations(filters),
      searchParams.get("includeFacets") === "1" ? getAssignmentFacets() : Promise.resolve(null),
    ]);
    return Response.json({ ...result, facets });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not search locations." },
      { status: 400 },
    );
  }
}
