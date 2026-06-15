import { requireAdminRole } from "@/lib/admin-auth";
import { assignLocationsToWorkspaceUser } from "@/lib/team-tools";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const admin = await requireAdminRole(["superadmin", "admin"]);
    const body = await req.json();
    const result = await assignLocationsToWorkspaceUser(body.locationIds || [], body.assignedTo || null, { assignedBy: admin.user_id, assignmentType: "partner_launch", campaign: body.campaign || "partner_launch", priority: body.priority || "normal", reason: body.reason, notes: body.notes, tag: body.tag, nextActionType: body.nextActionType, nextActionNote: body.nextActionNote, nextActionDueAt: body.nextActionDueAt });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not assign locations." }, { status: 400 });
  }
}
