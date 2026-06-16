import { requireAdminRole } from "@/lib/admin-auth";
import { searchWorkspaceLocationsForUser } from "@/lib/team-tools";

export const dynamic = "force-dynamic";

const FILTER_KEYS = [
  "partnerSalesStatus",
  "claimOutreachStatus",
  "reservationPortalStatus",
  "reservationEmbedStatus",
  "discoveryProfileStatus",
  "planStatus",
  "assigned",
  "launchPilot",
  "partnerLaunchSelected",
] as const;

function cleanParam(value: string | null) {
  const clean = String(value || "").trim();
  return clean || "all";
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdminRole(["superadmin", "admin"]);
    const url = new URL(req.url);
    const filters: Record<string, string | number> = {};
    for (const key of FILTER_KEYS) filters[key] = cleanParam(url.searchParams.get(key));
    filters.limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 5000);
    const q = url.searchParams.get("q") || "";
    const locations = await searchWorkspaceLocationsForUser(admin.user_id, admin.role, q, filters);
    return Response.json({ locations, count: locations.length });
  } catch (error) {
    console.warn("Assignable location search failed", error instanceof Error ? error.message : error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to search assignable locations." }, { status: 400 });
  }
}
