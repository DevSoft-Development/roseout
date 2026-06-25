import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { assignWeeklyBetaTasksForTester } from "@/lib/beta/weeklyTasks";
import {
  repairBetaAccessForEmail,
  syncUserBetaAccess,
} from "@/lib/beta/programAccess";
import { getBetaGiveawayEligibilityForEmail } from "@/lib/beta-giveaway-eligibility";
import { getBetaAccountReadinessForEmail } from "@/lib/beta/accountReadiness";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { buildSiteUrl } from "@/lib/site-url";
import type { AdminRole } from "@/lib/users/roles";

const allowedStatuses = new Set([
  "pending_verification",
  "verified",
  "disqualified",
  "winner",
  "alternate",
  "pending_beta_tasks",
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
    const email = String(entry.email || "").trim().toLowerCase();
    const testerType = ["user", "location_owner", "ambassador", "experience_team", "admin", "superadmin"].includes(String(entry.tester_type)) ? entry.tester_type : "user";
    try {
      const sync = await syncUserBetaAccess({ email, name: entry.full_name, phone: entry.phone, testerType, applicationId: entry.beta_application_id ?? null, requestedBetaStatus: "approved", source: "giveaway_admin", adminUserId: auth.adminUser?.user_id ?? null, actor: auth.adminUser });
      return NextResponse.json({
        success: true,
        message: "Applicant approved and beta access synced.",
        entry: {
          ...entry,
          beta_application_status: "approved",
          beta_account_readiness: await getBetaAccountReadinessForEmail(entry),
          beta_giveaway_eligibility: await getBetaGiveawayEligibilityForEmail(email),
        },
        beta: sync.tester,
        sync,
      });
    } catch (error) {
      await supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: auth.adminUser?.user_id ?? null, target_email: email, action: "beta_approve_failed", entity_type: "launch_waitlist_signup", entity_id: id, summary: "Beta approval failed", metadata: { error: error instanceof Error ? error.message : "Unknown error" } });
      return NextResponse.json({ success: false, error: "Beta approval could not be completed. Please try Repair Beta Access or Resend Setup Email." }, { status: 500 });
    }
  }
  if (
    [
      "resend_beta_invite",
      "link_beta_user",
      "assign_beta_tasks",
      "repair_beta_access",
    ].includes(String(body.action))
  ) {
    try {
      const repaired = await repairBetaAccessForEmail({
        email: entry.email,
        fullName: entry.full_name,
        phone: entry.phone,
        testerType: entry.tester_type,
        applicationId: entry.beta_application_id,
        actor: auth.adminUser,
        sendInviteIfNeeded:
          body.action === "resend_beta_invite" ||
          body.action === "repair_beta_access",
      });
      return NextResponse.json({
        success: true,
        message:
          body.action === "resend_beta_invite"
            ? "Setup email resent and beta access checked."
            : "Beta access repaired. Account links and weekly tasks were checked.",
        entry: {
          ...entry,
          beta_application_status: "approved",
          beta_account_readiness: await getBetaAccountReadinessForEmail(entry),
          beta_giveaway_eligibility: await getBetaGiveawayEligibilityForEmail(
            entry.email || "",
          ),
        },
        repair: repaired,
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to repair beta access.",
        },
        { status: 500 },
      );
    }
  }
  if (body.action === "reject_beta") {
    await supabaseAdmin
      .from("launch_waitlist_signups")
      .update({
        beta_application_status: "rejected",
        giveaway_notes: String(
          body.rejection_reason || entry.giveaway_notes || "",
        ),
      })
      .eq("id", id);
    if (entry.beta_application_id)
      await supabaseAdmin
        .from("beta_applications")
        .update({
          status: "rejected",
          reviewed_by: auth.adminUser?.user_id ?? null,
          reviewed_at: new Date().toISOString(),
          notes: String(body.rejection_reason || ""),
        })
        .eq("id", entry.beta_application_id);
    await supabaseAdmin
      .from("admin_audit_logs")
      .insert({
        actor_user_id: auth.adminUser?.user_id ?? null,
        actor_email: auth.adminUser?.email ?? null,
        actor_role: auth.adminUser?.role ?? null,
        target_email: entry.email,
        action: "beta_user_rejected",
        entity_type: "beta_application",
        entity_id: entry.beta_application_id || id,
        summary: "Rejected beta application",
        metadata: { reason: String(body.rejection_reason || "") },
      });
    return NextResponse.json({
      success: true,
      entry: { ...entry, beta_application_status: "rejected" },
    });
  }
  if (
    [
      "verify_social",
      "verify_instagram_follow",
      "verify_tiktok_follow",
      "verify_bonus_follow",
    ].includes(String(body.action))
  ) {
    updates.followed_social = true;
    updates.followed_social_verified_at = new Date().toISOString() as any;
    updates.followed_social_verified_by =
      auth.adminUser?.user_id ?? (null as any);
    await supabaseAdmin
      .from("admin_audit_logs")
      .insert({
        actor_user_id: auth.adminUser?.user_id ?? null,
        target_email: entry.email,
        action: "beta_bonus_follow_verified",
        entity_type: "launch_waitlist_signup",
        entity_id: id,
        summary:
          "Optional bonus social follow verified for $500 gift card giveaway",
        metadata: { action: body.action },
      });
  }

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
    const betaEligibility = await getBetaGiveawayEligibilityForEmail(
      entry.email || "",
    );
    const accountReadiness = await getBetaAccountReadinessForEmail(entry);
    if (
      body.giveaway_status === "verified" &&
      (!betaEligibility.isBetaTester ||
        !["active", "approved"].includes(
          String(betaEligibility.betaStatus || ""),
        ) ||
        !betaEligibility.weeklyTasksComplete ||
        !accountReadiness.loginReady ||
        !entry.wants_giveaway ||
        !entry.age_18_confirmed ||
        !(entry.giveaway_rules_agreed || entry.prize_rules_confirmed) ||
        entry.duplicate_flag ||
        entry.giveaway_status === "disqualified")
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Beta tester must be active, weekly beta steps complete, login ready, 18+ and giveaway rules confirmed, opted into the giveaway, and not duplicate/disqualified before marking Prize Qualified. Instagram and TikTok follows are optional bonus entries.",
        },
        { status: 400 },
      );
    }
    updates.giveaway_status = body.giveaway_status;
    updates.weekly_task_eligibility_status = (
      await getBetaGiveawayEligibilityForEmail(entry.email || "")
    ).eligibilityStatus;
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
  if (
    data.giveaway_status === "verified" &&
    entry.giveaway_status !== "verified"
  ) {
    const firstName =
      String(data.full_name || "there").split(/\s+/)[0] || "there";
    try {
      await sendRawBrandedEmail({
        to: data.email,
        department: "account",
        subject:
          "You’re prize qualified for TheOutHaven’s $500 gift card giveaway",
        heading: "Prize Qualified",
        preview: "You are now prize qualified for the $500 gift card giveaway.",
        sections: [
          { type: "paragraph", text: `Congratulations ${firstName},` },
          {
            type: "paragraph",
            text: "You completed the required beta tester requirements for TheOutHaven’s Beta Tester Program.",
          },
          {
            type: "paragraph",
            text: "Your required beta/account requirements were verified. You are now prize-ready for the $500 gift card giveaway. Instagram and TikTok follows are optional bonus entries.",
          },
          {
            type: "paragraph",
            text: "Keep an eye on your email for winner updates. Thank you for helping shape TheOutHaven.",
          },
        ],
        cta: {
          label: "Open Beta Dashboard",
          url: buildSiteUrl("/user/dashboard/beta"),
        },
      });
      await supabaseAdmin
        .from("admin_audit_logs")
        .insert({
          actor_user_id: auth.adminUser?.user_id ?? null,
          target_email: data.email,
          action: "prize_qualified",
          entity_type: "launch_waitlist_signup",
          entity_id: id,
          summary: "Prize qualified email sent",
          metadata: { rewardName: "$500 gift card giveaway" },
        });
    } catch (emailError) {
      await supabaseAdmin
        .from("admin_audit_logs")
        .insert({
          actor_user_id: auth.adminUser?.user_id ?? null,
          target_email: data.email,
          action: "beta_reminder_failed",
          entity_type: "launch_waitlist_signup",
          entity_id: id,
          summary: "Prize qualified email failed",
          metadata: {
            error:
              emailError instanceof Error
                ? emailError.message
                : "Unknown error",
          },
        });
    }
  }
  if (
    data.giveaway_status === "disqualified" &&
    entry.giveaway_status !== "disqualified"
  )
    await supabaseAdmin
      .from("admin_audit_logs")
      .insert({
        actor_user_id: auth.adminUser?.user_id ?? null,
        target_email: data.email,
        action: "beta_entry_disqualified",
        entity_type: "launch_waitlist_signup",
        entity_id: id,
        summary: "$500 gift card giveaway entry disqualified",
        metadata: { notes: data.giveaway_notes },
      });
  await supabaseAdmin
    .from("admin_audit_logs")
    .insert({
      actor_user_id: auth.adminUser?.user_id ?? null,
      actor_email: auth.adminUser?.email ?? null,
      actor_role: auth.adminUser?.role ?? null,
      target_email: data.email,
      action:
        data.giveaway_status === "winner"
          ? "reward_winner_selected"
          : data.giveaway_status === "alternate"
            ? "alternate_selected"
            : "beta_prize_status_changed",
      entity_type: "launch_waitlist_signup",
      entity_id: id,
      summary: `Beta Prize Eligibility updated to ${data.giveaway_status}`,
      before_data: entry,
      after_data: data,
      metadata: { action: body.action || null },
    });
  return NextResponse.json({
    success: true,
    entry: {
      ...data,
      beta_account_readiness: await getBetaAccountReadinessForEmail(data),
      beta_giveaway_eligibility: await getBetaGiveawayEligibilityForEmail(
        data.email || "",
      ),
    },
  });
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
