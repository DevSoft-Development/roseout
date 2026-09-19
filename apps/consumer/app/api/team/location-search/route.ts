import { ensureTeamProfileForCurrentUser, searchWorkspaceLocationsForUser } from "@/lib/team-tools";
import { getCurrentAdmin } from "@/lib/admin-auth";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const { user, profile } = await ensureTeamProfileForCurrentUser();
    const admin = await getCurrentAdmin().catch(() => null as any);
    const role = admin?.role || profile.team_type;
    const locations = await searchWorkspaceLocationsForUser(user.id, role, q, { limit: Number(searchParams.get("limit") || 15) });
    return Response.json({ locations, canSearchAll: ["superadmin","admin","manager"].includes(String(role)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not search locations." }, { status: 401 });
  }
}
