import { requireAdminRole } from "@/lib/admin-auth";
import { searchWorkspaceLocationsForUser } from "@/lib/team-tools";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const admin = await requireAdminRole(["superadmin", "admin"]);
    const { searchParams } = new URL(req.url);

    const locations = await searchWorkspaceLocationsForUser(
      admin.user_id,
      admin.role,
      searchParams.get("q") || "",
      {
        limit: Number(searchParams.get("limit") || 50),
        partnerSalesStatus: searchParams.get("partnerSalesStatus") || undefined,
        claimOutreachStatus: searchParams.get("claimOutreachStatus") || undefined,
        reservationPortalStatus: searchParams.get("reservationPortalStatus") || undefined,
        reservationEmbedStatus: searchParams.get("reservationEmbedStatus") || undefined,
        discoveryProfileStatus: searchParams.get("discoveryProfileStatus") || undefined,
        planStatus: searchParams.get("planStatus") || undefined,
      },
    );

    return Response.json({ locations });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not search locations." },
      { status: 400 },
    );
  }
}
