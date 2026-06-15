import { requireAdminRole } from "@/lib/admin-auth";
import { searchWorkspaceLocationsForUser } from "@/lib/team-tools";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const admin = await requireAdminRole(["superadmin", "admin"]);
    const url = new URL(req.url);
    const filters = Object.fromEntries(url.searchParams.entries());
    const locations = await searchWorkspaceLocationsForUser(admin.user_id, admin.role, url.searchParams.get("q") || "", {
      ...filters,
      limit: Number(url.searchParams.get("limit") || 50),
    });
    return Response.json({ locations });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to search assignable locations." }, { status: 400 });
  }
}
