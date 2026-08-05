import { requireAdminRole } from "@/lib/admin-auth";
import { createTeamAssignmentsAndTasks, searchAssignmentLocations } from "@/lib/team-assignment-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const admin = await requireAdminRole(["superadmin", "admin", "manager"]);
    const body = await req.json();
    const scope = body.scope || {};
    let locationIds = Array.isArray(body.locationIds) ? body.locationIds : [];

    if (body.assignmentMode === "all_matching") {
      const result = await searchAssignmentLocations({ ...scope, q: body.q || scope.q, limit: 500 });
      locationIds = result.locations.map((location) => location.id);
    }

    const result = await createTeamAssignmentsAndTasks({
      locationIds,
      assignedTo: String(body.assignedTo || ""),
      assignedBy: admin.user_id,
      workType: String(body.workType || "follow_up"),
      priority: String(body.priority || "normal"),
      dueAt: body.dueAt || null,
      reason: body.reason || null,
      notes: body.notes || null,
      campaign: body.campaign || "team_assignment",
      scope,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create team assignments." },
      { status: 400 },
    );
  }
}
