import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { createTeamAssignmentsAndTasks } from "@/lib/team-assignment-service";
import { searchSafeAssignmentLocations } from "@/lib/team-assignment-query-safe";

export const dynamic = "force-dynamic";

const ASSIGNMENT_BATCH_SIZE = 500;
const MAX_BULK_ASSIGNMENT = 5000;

function chunks<T>(values: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdminRole(["superadmin", "admin", "manager"]);
    const body = await req.json();
    const scope = body.scope || {};
    let locationIds: string[] = Array.isArray(body.locationIds)
      ? body.locationIds.map((value: unknown) => String(value)).filter(Boolean)
      : [];

    if (body.assignmentMode === "all_matching") {
      const first = await searchSafeAssignmentLocations({
        ...scope,
        q: body.q || scope.q,
        page: 1,
        limit: ASSIGNMENT_BATCH_SIZE,
      });

      if (first.count > MAX_BULK_ASSIGNMENT) {
        throw new Error(
          `This territory contains ${first.count} locations. Narrow the filters to ${MAX_BULK_ASSIGNMENT} or fewer locations for a single bulk assignment.`,
        );
      }

      locationIds = first.locations.map((location) => String(location.id));
      for (let page = 2; page <= first.totalPages; page += 1) {
        const result = await searchSafeAssignmentLocations({
          ...scope,
          q: body.q || scope.q,
          page,
          limit: ASSIGNMENT_BATCH_SIZE,
        });
        locationIds.push(
          ...result.locations.map((location) => String(location.id)),
        );
      }
    }

    locationIds = Array.from(new Set<string>(locationIds));
    if (!locationIds.length) {
      throw new Error("Select at least one location.");
    }
    if (locationIds.length > MAX_BULK_ASSIGNMENT) {
      throw new Error(
        `A single bulk assignment supports up to ${MAX_BULK_ASSIGNMENT} locations. Narrow the filters and try again.`,
      );
    }

    let assignedCount = 0;
    let taskCount = 0;
    let assignedUserId: string | null = null;
    let myWorkHref = "/admin/dashboard/crm/my-work?view=my-queue";

    for (const batch of chunks(locationIds, ASSIGNMENT_BATCH_SIZE)) {
      const result = await createTeamAssignmentsAndTasks({
        locationIds: batch,
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

      assignedCount += result.assignedCount;
      taskCount += result.taskCount;
      assignedUserId = result.assignedUserId || assignedUserId;
      myWorkHref = result.myWorkHref || myWorkHref;
    }

    return Response.json({
      success: true,
      assignedCount,
      taskCount,
      assignedUserId,
      myWorkHref,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create team assignments.",
      },
      { status: 400 },
    );
  }
}
