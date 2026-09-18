import { revalidatePath } from "next/cache";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

const WORK_SESSION_RESPONSE_FIELDS =
  "id,status,approval_status,updated_at";
const WORK_SESSION_ACTIONS = new Set(["approve", "reject", "correction"]);
const MAX_REVIEW_TEXT = 1000;

export async function PATCH(req: Request) {
  const admin = await requireAdminRole(["superadmin", "admin", "manager"]);

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.sessionId || "").trim();
    if (!id) {
      return Response.json(
        { error: "Session id is required." },
        { status: 400 },
      );
    }

    const action = String(body.action || "");
    if (!WORK_SESSION_ACTIONS.has(action)) {
      return Response.json(
        { error: "Unsupported review action." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const adminNotes = String(body.adminNotes || "")
      .trim()
      .slice(0, MAX_REVIEW_TEXT);
    const reason = String(body.reason || "")
      .trim()
      .slice(0, MAX_REVIEW_TEXT);
    const updates: Record<string, unknown> = {
      updated_at: now,
      admin_notes: adminNotes || null,
    };

    if (action === "approve") {
      Object.assign(updates, {
        status: "approved",
        approval_status: "approved",
        approved_by: admin.user_id,
        approved_at: now,
        rejection_reason: null,
      });
    } else if (action === "reject") {
      Object.assign(updates, {
        status: "rejected",
        approval_status: "rejected",
        rejection_reason: reason || "Rejected by manager",
      });
    } else {
      Object.assign(updates, {
        status: "needs_correction",
        approval_status: "needs_correction",
        rejection_reason: reason || "Correction requested",
      });
    }

    const { data, error } = await getAdminDatabaseClient()
      .from("team_work_sessions")
      .update(updates)
      .eq("id", id)
      .select(WORK_SESSION_RESPONSE_FIELDS)
      .single();

    if (error) throw error;

    revalidatePath("/admin/dashboard/team/work-sessions");
    return Response.json({ session: data });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not review session.",
      },
      { status: 400 },
    );
  }
}
