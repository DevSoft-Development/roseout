import "server-only";

import { createUserPasswordInvite } from "@/lib/admin/createUserPasswordInvite";
import {
  assignWeeklyBetaTasksForTester,
  createInviteCode,
} from "@/lib/beta/weeklyTasks";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { buildSiteUrl } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Actor =
  | { user_id?: string | null; email?: string | null; role?: string | null }
  | null
  | undefined;

export function normalizeBetaEmail(email: string | null | undefined) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export async function logBetaProgramAudit(input: {
  action: string;
  entityType: string;
  entityId?: string | null;
  targetEmail?: string | null;
  actor?: Actor;
  summary?: string;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin
    .from("admin_audit_logs")
    .insert({
      actor_user_id: input.actor?.user_id ?? null,
      actor_email: input.actor?.email ?? null,
      actor_role: input.actor?.role ?? null,
      target_email: input.targetEmail ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary ?? null,
      metadata: input.metadata || {},
    })
    .then(
      () => undefined,
      (error) => console.error("BETA_PROGRAM_AUDIT_FAILED", error),
    );
}

export async function findAuthUserIdByEmail(email: string) {
  const normalized = normalizeBetaEmail(email);
  const listed = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listed.error) return null;
  return (
    listed.data.users?.find((user) => user.email?.toLowerCase() === normalized)
      ?.id ?? null
  );
}

export async function safeUpsertBetaTester(input: {
  email: string;
  fullName?: string | null;
  phone?: string | null;
  testerType?: string | null;
  applicationId?: string | null;
  userId?: string | null;
  approvedBy?: string | null;
  status?: string;
}) {
  const email = normalizeBetaEmail(input.email);
  const now = new Date().toISOString();
  const row = {
    user_id: input.userId ?? null,
    application_id: input.applicationId ?? null,
    name: input.fullName ?? null,
    email,
    phone: input.phone ?? null,
    tester_type: input.testerType || "user",
    status: input.status || "active",
    weekly_required_tests: 5,
    invite_code: createInviteCode(),
    approved_by: input.approvedBy ?? null,
    approved_at: now,
  };
  const upsert = await supabaseAdmin
    .from("beta_testers")
    .upsert(row, { onConflict: "email" })
    .select("*")
    .single();
  if (!upsert.error && upsert.data) return { data: upsert.data, error: null };

  const existing = await supabaseAdmin
    .from("beta_testers")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (existing.data) {
    const updated = await supabaseAdmin
      .from("beta_testers")
      .update({
        user_id: existing.data.user_id || input.userId || null,
        application_id:
          existing.data.application_id || input.applicationId || null,
        name: input.fullName || existing.data.name,
        phone: input.phone || existing.data.phone,
        tester_type: input.testerType || existing.data.tester_type || "user",
        status: input.status || "active",
        weekly_required_tests: existing.data.weekly_required_tests || 5,
        approved_by: existing.data.approved_by || input.approvedBy || null,
        approved_at: existing.data.approved_at || now,
      })
      .eq("id", existing.data.id)
      .select("*")
      .single();
    return { data: updated.data, error: updated.error };
  }
  const inserted = await supabaseAdmin
    .from("beta_testers")
    .insert(row)
    .select("*")
    .single();
  return { data: inserted.data, error: inserted.error || upsert.error };
}

export async function syncUserBetaAccess(input: {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  requestedBetaStatus: string;
  source: string;
  adminUserId?: string | null;
  applicationId?: string | null;
  testerType?: string | null;
  actor?: Actor;
}) {
  const now = new Date().toISOString();
  let userId = input.userId || null;
  let email = normalizeBetaEmail(input.email);
  let name = input.name || null;
  let phone = input.phone || null;

  if (userId) {
    const { data: userRow } = await supabaseAdmin.from("users").select("id,email,full_name,phone").eq("id", userId).maybeSingle();
    const authUser = await supabaseAdmin.auth.admin.getUserById(userId).then((r) => r.data.user, () => null);
    email = email || normalizeBetaEmail((userRow as any)?.email || authUser?.email);
    name = name || (userRow as any)?.full_name || (authUser?.user_metadata as any)?.full_name || (authUser?.user_metadata as any)?.name || null;
    phone = phone || (userRow as any)?.phone || null;
  }
  if (!userId && email) userId = await findAuthUserIdByEmail(email);
  if (!email && userId) throw new Error("User email is required before beta access can be updated.");
  if (!email) throw new Error("Email is required before beta access can be updated.");

  const requested = String(input.requestedBetaStatus || "").toLowerCase();
  const removing = ["none", "remove", "removed", "inactive", "paused"].includes(requested);
  const testerStatus = removing ? "removed" : "active";
  const applicationStatus = removing ? "rejected" : requested === "invite" || requested === "invited" ? "invited" : "approved";
  let updatedProfile = false;

  if (userId) {
    await supabaseAdmin.from("user_profiles").upsert({ id: userId, email, full_name: name, phone, updated_at: now } as any, { onConflict: "id" }).then((r) => { if (!r.error) updatedProfile = true; });
    await supabaseAdmin.from("users").upsert({ id: userId, email, full_name: name, phone, updated_at: now } as any, { onConflict: "id" }).then(() => undefined, () => undefined);
  }

  const { data: existingByUser } = userId ? await supabaseAdmin.from("beta_testers").select("*").eq("user_id", userId).maybeSingle() : { data: null } as any;
  const { data: existingByEmail } = !existingByUser ? await supabaseAdmin.from("beta_testers").select("*").eq("email", email).maybeSingle() : { data: null } as any;
  const existing = existingByUser || existingByEmail;
  const payload: any = {
    user_id: existing?.user_id || userId || null,
    application_id: existing?.application_id || input.applicationId || null,
    name: name || existing?.name || null,
    email,
    phone: phone || existing?.phone || null,
    tester_type: input.testerType || existing?.tester_type || "user",
    status: testerStatus,
    weekly_required_tests: existing?.weekly_required_tests || 5,
    weekly_completed_tests: existing?.weekly_completed_tests || 0,
    approved_by: existing?.approved_by || input.adminUserId || input.actor?.user_id || null,
    approved_at: existing?.approved_at || (!removing ? now : null),
    updated_at: now,
  };
  if (!existing?.invite_code) payload.invite_code = createInviteCode();
  const result = existing?.id
    ? await supabaseAdmin.from("beta_testers").update(payload).eq("id", existing.id).select("*").single()
    : await supabaseAdmin.from("beta_testers").insert(payload).select("*").single();
  if (result.error || !result.data) throw new Error(result.error?.message || "Unable to sync beta access.");

  if (input.applicationId) {
    await supabaseAdmin.from("beta_applications").update({ status: applicationStatus, reviewed_by: input.adminUserId || input.actor?.user_id || null, reviewed_at: now, updated_at: now }).eq("id", input.applicationId);
  } else {
    await supabaseAdmin.from("beta_applications").update({ status: applicationStatus, reviewed_by: input.adminUserId || input.actor?.user_id || null, reviewed_at: now, updated_at: now }).eq("email", email);
  }
  await supabaseAdmin.from("launch_waitlist_signups").update({ beta_application_status: applicationStatus === "rejected" ? "rejected" : "approved", beta_approved_at: removing ? null : now, beta_approved_by: input.adminUserId || input.actor?.user_id || null, weekly_task_eligibility_status: removing ? null : "pending_beta_tasks", updated_at: now }).eq("email", email);

  if (!removing) await assignWeeklyBetaTasksForTester(result.data.id).catch((error) => console.error("BETA_SYNC_ASSIGN_WEEKLY_FAILED", error));
  await logBetaProgramAudit({ action: removing ? "beta_access_removed" : "beta_access_synced", entityType: "beta_tester", entityId: result.data.id, targetEmail: email, actor: input.actor, summary: removing ? "Beta access removed" : "Beta access synced", metadata: { userId, source: input.source, requestedBetaStatus: requested } });
  return { success: true, status: testerStatus, message: removing ? "Beta access removed." : requested === "approve" || requested === "approved" ? "User approved as a beta tester." : "Beta access updated.", user_id: userId, beta_record_id: result.data.id, created_beta_record: !existing?.id, updated_profile: updatedProfile, tester: result.data };
}

export async function sendBetaApprovalEmailOnce(input: {
  email: string;
  fullName?: string | null;
  signupId?: string | null;
  actor?: Actor;
}) {
  const email = normalizeBetaEmail(input.email);
  const { data: signup } = await supabaseAdmin
    .from("launch_waitlist_signups")
    .select("id,metadata,full_name")
    .eq("email", email)
    .maybeSingle();
  const metadata = ((signup as any)?.metadata || {}) as Record<string, unknown>;
  if (metadata.beta_approval_email_sent_at)
    return { sent: false, skipped: true };
  const firstName =
    String(input.fullName || (signup as any)?.full_name || "there").split(
      /\s+/,
    )[0] || "there";
  await sendRawBrandedEmail({
    to: email,
    department: "account",
    subject: "You’re approved for TheOutHaven’s Beta Tester Program",
    heading: "Your beta account is ready",
    preview:
      "Log in to your beta dashboard and complete weekly beta tester tasks.",
    sections: [
      { type: "paragraph", text: `Hi ${firstName},` },
      {
        type: "paragraph",
        text: "Your email is verified and your beta account is ready.",
      },
      {
        type: "paragraph",
        text: "Log in to your beta dashboard to complete your weekly beta tester tasks.",
      },
      {
        type: "paragraph",
        text: "You must complete the required weekly beta steps to become prize-ready; social follows are optional bonus entries.",
      },
    ],
    cta: {
      label: "Go to Beta Dashboard",
      url: buildSiteUrl("/user/dashboard/beta"),
    },
  });
  await supabaseAdmin
    .from("launch_waitlist_signups")
    .update({
      metadata: {
        ...metadata,
        beta_approval_email_sent_at: new Date().toISOString(),
      },
    })
    .eq("id", (signup as any)?.id || input.signupId);
  await logBetaProgramAudit({
    action: "beta_approval_email_sent",
    entityType: "launch_waitlist_signup",
    entityId: (signup as any)?.id || input.signupId || null,
    targetEmail: email,
    actor: input.actor,
    summary: "Beta approval/dashboard email sent after password creation",
  });
  return { sent: true, skipped: false };
}

export async function repairBetaAccessForEmail(input: {
  email: string;
  fullName?: string | null;
  phone?: string | null;
  testerType?: string | null;
  applicationId?: string | null;
  actor?: Actor;
  sendInviteIfNeeded?: boolean;
}) {
  const email = normalizeBetaEmail(input.email);
  let userId = await findAuthUserIdByEmail(email);
  let inviteResult: Awaited<
    ReturnType<typeof createUserPasswordInvite>
  > | null = null;
  if (!userId || input.sendInviteIfNeeded) {
    inviteResult = await createUserPasswordInvite({
      email,
      fullName: input.fullName,
      phone: input.phone,
      role: "user",
      source: "beta_access_repair",
      betaTesterInvite: true,
      programName: "TheOutHaven Beta Tester Program",
      rewardName: "$500 gift card giveaway",
      dashboardUrl: buildSiteUrl("/user/dashboard/beta"),
    });
    userId = inviteResult.user_id;
  }
  const tester = await safeUpsertBetaTester({
    email,
    fullName: input.fullName,
    phone: input.phone,
    testerType: input.testerType,
    applicationId: input.applicationId,
    userId,
    approvedBy: input.actor?.user_id,
    status: "active",
  });
  if (tester.error || !tester.data)
    throw new Error(tester.error?.message || "Unable to repair beta access.");
  const assigned = await assignWeeklyBetaTasksForTester(tester.data.id);
  await supabaseAdmin
    .from("launch_waitlist_signups")
    .update({
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      beta_application_status: "approved",
      giveaway_status: "pending_beta_tasks",
      weekly_task_eligibility_status: "pending_beta_tasks",
    })
    .eq("email", email);
  await logBetaProgramAudit({
    action: "beta_access_repaired",
    entityType: "beta_tester",
    entityId: tester.data.id,
    targetEmail: email,
    actor: input.actor,
    summary: "Beta access repaired",
    metadata: {
      userId,
      assigned,
      inviteSent: inviteResult?.invite_sent ?? false,
    },
  });
  return { tester: tester.data, userId, inviteResult, assigned };
}
