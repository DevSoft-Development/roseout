import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AdminRole } from "@/lib/users/roles";

const allowedStatuses = new Set([
  "pending_verification",
  "verified",
  "disqualified",
  "winner",
  "alternate",
]);

const giveawayAdminRoles: AdminRole[] = [
  "superadmin",
  "admin",
  "experience",
  "experience_team",
];

type PatchBody = {
  giveaway_status?: unknown;
  giveaway_notes?: unknown;
  duplicate_flag?: unknown;
  duplicate_reason?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.giveawayManage);
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const { data: entry, error: loadError } = await supabaseAdmin
    .from("launch_waitlist_signups")
    .select("id,wants_giveaway,email_verified,giveaway_status")
    .eq("id", id)
    .maybeSingle();
  if (loadError || !entry)
    return NextResponse.json(
      { success: false, error: "Entry not found" },
      { status: 404 },
    );

  const updates: Record<string, string | boolean | null> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.giveaway_notes === "string")
    updates.giveaway_notes = body.giveaway_notes;
  if (typeof body.duplicate_flag === "boolean") {
    updates.duplicate_flag = body.duplicate_flag;
    updates.duplicate_checked_at = new Date().toISOString();
  }
  if (typeof body.duplicate_reason === "string")
    updates.duplicate_reason = body.duplicate_reason || null;

  if (typeof body.giveaway_status === "string") {
    if (!allowedStatuses.has(body.giveaway_status))
      return NextResponse.json(
        { success: false, error: "Invalid status" },
        { status: 400 },
      );
    if (
      (body.giveaway_status === "verified" ||
        body.giveaway_status === "winner") &&
      !entry.wants_giveaway
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Launch List-only users are not eligible for winner selection.",
        },
        { status: 400 },
      );
    }
    if (body.giveaway_status === "verified" && !entry.email_verified) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Email must be verified before this entry can be marked verified.",
        },
        { status: 400 },
      );
    }
    updates.giveaway_status = body.giveaway_status;
    if (
      body.giveaway_status === "verified" ||
      body.giveaway_status === "winner"
    ) {
      updates.giveaway_verified_at = new Date().toISOString();
      updates.giveaway_verified_by = auth.adminUser?.user_id ?? null;
    }
    if (body.giveaway_status === "pending_verification") {
      updates.giveaway_verified_at = null;
      updates.giveaway_verified_by = null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("launch_waitlist_signups")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  return NextResponse.json({ success: true, entry: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiRole(giveawayAdminRoles);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing giveaway entry id." },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("launch_waitlist_signups")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("ADMIN_GIVEAWAY_DELETE_ENTRY", error);
      return NextResponse.json(
        { success: false, error: "Unable to delete giveaway entry." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ADMIN_GIVEAWAY_DELETE_ENTRY_UNHANDLED", error);
    return NextResponse.json(
      { success: false, error: "Unable to delete giveaway entry." },
      { status: 500 },
    );
  }
}
