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
  action?: unknown;
  rejection_reason?: unknown;
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
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadError || !entry)
    return NextResponse.json(
      { success: false, error: "Entry not found" },
      { status: 404 },
    );

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (body.action === "approve_beta") {
    const testerType = ["user", "location_owner", "ambassador", "experience_team"].includes(String(entry.tester_type)) ? entry.tester_type : "user";
    const inviteCode = `BETA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data: beta, error: betaError } = await supabaseAdmin.from("beta_testers").upsert({ application_id: entry.beta_application_id ?? null, name: entry.full_name, email: entry.email, phone: entry.phone, tester_type: testerType, status: "active", weekly_required_tests: 5, invite_code: inviteCode, approved_by: auth.adminUser?.user_id ?? null, approved_at: new Date().toISOString() }, { onConflict: "email" }).select("*").single();
    if (betaError) return NextResponse.json({ success: false, error: betaError.message }, { status: 500 });
    await supabaseAdmin.from("launch_waitlist_signups").update({ beta_application_status: "approved", beta_approved_at: new Date().toISOString(), beta_approved_by: auth.adminUser?.user_id ?? null }).eq("id", id);
    if (entry.beta_application_id) await supabaseAdmin.from("beta_applications").update({ status: "approved", reviewed_by: auth.adminUser?.user_id ?? null, reviewed_at: new Date().toISOString() }).eq("id", entry.beta_application_id);
    await supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: auth.adminUser?.user_id ?? null, actor_email: auth.adminUser?.email ?? null, actor_role: auth.adminUser?.role ?? null, target_email: entry.email, action: "beta_user_approved", entity_type: "beta_tester", entity_id: beta.id, summary: "Approved launch list signup as beta user", metadata: { launchSignupId: id, testerType } });
    return NextResponse.json({ success: true, entry: { ...entry, beta_application_status: "approved" }, beta });
  }
  if (body.action === "reject_beta") {
    await supabaseAdmin.from("launch_waitlist_signups").update({ beta_application_status: "rejected", giveaway_notes: String(body.rejection_reason || entry.giveaway_notes || "") }).eq("id", id);
    if (entry.beta_application_id) await supabaseAdmin.from("beta_applications").update({ status: "rejected", reviewed_by: auth.adminUser?.user_id ?? null, reviewed_at: new Date().toISOString(), notes: String(body.rejection_reason || "") }).eq("id", entry.beta_application_id);
    await supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: auth.adminUser?.user_id ?? null, actor_email: auth.adminUser?.email ?? null, actor_role: auth.adminUser?.role ?? null, target_email: entry.email, action: "beta_user_rejected", entity_type: "beta_application", entity_id: entry.beta_application_id || id, summary: "Rejected beta application", metadata: { reason: String(body.rejection_reason || "") } });
    return NextResponse.json({ success: true, entry: { ...entry, beta_application_status: "rejected" } });
  }
  if (body.action === "verify_social") { updates.followed_social = true; updates.followed_social_verified_at = new Date().toISOString() as any; updates.followed_social_verified_by = auth.adminUser?.user_id ?? null as any; }
  if (body.action === "verify_tags") { updates.tagged_two_friends = true; updates.tagged_friends_verified_at = new Date().toISOString() as any; updates.tagged_friends_verified_by = auth.adminUser?.user_id ?? null as any; }

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
    if (body.giveaway_status === "verified" && (!entry.email_verified || !entry.social_handle || !entry.social_platform || !(entry.followed_social || entry.followed_social_verified_at) || !(entry.tagged_two_friends || entry.tagged_friends_verified_at) || entry.duplicate_flag)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Email, social handle/platform, follow, tags, and duplicate checks must pass before marking verified.",
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
  await supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: auth.adminUser?.user_id ?? null, actor_email: auth.adminUser?.email ?? null, actor_role: auth.adminUser?.role ?? null, target_email: data.email, action: "giveaway_status_changed", entity_type: "launch_waitlist_signup", entity_id: id, summary: `Giveaway/admin review updated to ${data.giveaway_status}`, before_data: entry, after_data: data, metadata: { action: body.action || null } });
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
