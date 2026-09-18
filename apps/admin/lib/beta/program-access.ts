import "server-only";

import { randomUUID } from "node:crypto";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

type Actor =
  | { user_id?: string | null; email?: string | null; role?: string | null }
  | null
  | undefined;

function normalizeBetaEmail(email: string | null | undefined) {
  return String(email || "").trim().toLowerCase();
}

function getCurrentWeekStart(date = new Date()) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

function getProgramWeek(weekStart: string) {
  const firstWeekStart = new Date("2026-06-22T00:00:00.000Z");
  const current = new Date(`${weekStart}T00:00:00.000Z`);
  const diff = Math.floor((current.getTime() - firstWeekStart.getTime()) / 604800000) + 1;
  return Math.min(4, Math.max(1, Number.isFinite(diff) ? diff : 1));
}

function getWeekEnd(weekStart: string) {
  const value = new Date(`${weekStart}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 6);
  return value.toISOString().slice(0, 10);
}

function createInviteCode() {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

async function logBetaProgramAudit(input: {
  action: string;
  entityType: string;
  entityId?: string | null;
  targetEmail?: string | null;
  actor?: Actor;
  summary?: string;
  metadata?: Record<string, unknown>;
}) {
  await getAdminDatabaseClient()
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

async function findAuthUserIdByEmail(email: string) {
  const normalized = normalizeBetaEmail(email);
  const listed = await getAdminDatabaseClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) return null;
  return listed.data.users?.find((user) => user.email?.toLowerCase() === normalized)?.id ?? null;
}

async function assignWeeklyBetaTasksForTester(testerId: string) {
  const db = getAdminDatabaseClient();
  const weekStart = getCurrentWeekStart();
  const weekNumber = getProgramWeek(weekStart);
  const { data: tester } = await db
    .from("beta_testers")
    .select("id,user_id,weekly_completed_tests,weekly_required_tests,status")
    .eq("id", testerId)
    .maybeSingle();

  if (!tester) return { assigned: 0, weekStart, session: null };

  const { data: existing, error: existingError } = await db
    .from("beta_test_sessions")
    .select("*")
    .eq("tester_id", testerId)
    .eq("week_start_date", weekStart)
    .eq("test_mode", false)
    .maybeSingle();
  if (existingError) throw existingError;

  const session = existing || (
    await db
      .from("beta_test_sessions")
      .insert({
        user_id: tester.user_id ?? null,
        tester_id: testerId,
        week_number: weekNumber,
        week_start_date: weekStart,
        week_end_date: getWeekEnd(weekStart),
        status: "not_started",
        completed_steps: [],
        test_mode: false,
      })
      .select("*")
      .single()
  ).data;

  const completedSteps = Array.isArray(session?.completed_steps) ? session.completed_steps.length : 0;
  await db
    .from("beta_testers")
    .update({
      current_week_start: weekStart,
      weekly_completed_tests: completedSteps,
      weekly_required_tests: 5,
    })
    .eq("id", testerId);

  return { assigned: session ? 1 : 0, weekStart, session };
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
  const db = getAdminDatabaseClient();
  const now = new Date().toISOString();
  let userId = input.userId || null;
  let email = normalizeBetaEmail(input.email);
  let name = input.name || null;
  let phone = input.phone || null;

  if (userId) {
    const { data: userRow } = await db
      .from("users")
      .select("id,email,full_name,phone")
      .eq("id", userId)
      .maybeSingle();
    const authUser = await db.auth.admin.getUserById(userId).then((result) => result.data.user, () => null);
    email = email || normalizeBetaEmail((userRow as any)?.email || authUser?.email);
    name = name || (userRow as any)?.full_name || (authUser?.user_metadata as any)?.full_name || (authUser?.user_metadata as any)?.name || null;
    phone = phone || (userRow as any)?.phone || null;
  }

  if (!userId && email) userId = await findAuthUserIdByEmail(email);
  if (!email) throw new Error("Email is required before beta access can be updated.");

  const requested = String(input.requestedBetaStatus || "").toLowerCase();
  const removing = ["none", "remove", "removed", "inactive", "paused"].includes(requested);
  const testerStatus = removing ? "removed" : "active";
  const applicationStatus = removing
    ? "rejected"
    : requested === "invite" || requested === "invited"
      ? "invited"
      : "approved";
  let updatedProfile = false;

  if (userId) {
    await db
      .from("user_profiles")
      .upsert({ id: userId, email, full_name: name, phone, updated_at: now } as any, { onConflict: "id" })
      .then((result) => {
        if (!result.error) updatedProfile = true;
      });
    await db
      .from("users")
      .upsert({ id: userId, email, full_name: name, phone, updated_at: now } as any, { onConflict: "id" })
      .then(() => undefined, () => undefined);
  }

  const { data: existingByUser } = userId
    ? await db.from("beta_testers").select("*").eq("user_id", userId).maybeSingle()
    : ({ data: null } as any);
  const { data: existingByEmail } = !existingByUser
    ? await db.from("beta_testers").select("*").eq("email", email).maybeSingle()
    : ({ data: null } as any);
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
    ? await db.from("beta_testers").update(payload).eq("id", existing.id).select("*").single()
    : await db.from("beta_testers").insert(payload).select("*").single();
  if (result.error || !result.data) throw new Error(result.error?.message || "Unable to sync beta access.");

  if (input.applicationId) {
    await db
      .from("beta_applications")
      .update({
        status: applicationStatus,
        reviewed_by: input.adminUserId || input.actor?.user_id || null,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", input.applicationId);
  } else {
    await db
      .from("beta_applications")
      .update({
        status: applicationStatus,
        reviewed_by: input.adminUserId || input.actor?.user_id || null,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("email", email);
  }

  await db
    .from("launch_waitlist_signups")
    .update({
      beta_application_status: applicationStatus === "rejected" ? "rejected" : "approved",
      beta_approved_at: removing ? null : now,
      beta_approved_by: input.adminUserId || input.actor?.user_id || null,
      weekly_task_eligibility_status: removing ? null : "pending_beta_tasks",
      updated_at: now,
    })
    .eq("email", email);

  if (!removing) {
    await assignWeeklyBetaTasksForTester(result.data.id).catch((error) =>
      console.error("BETA_SYNC_ASSIGN_WEEKLY_FAILED", error),
    );
  }

  await logBetaProgramAudit({
    action: removing ? "beta_access_removed" : "beta_access_synced",
    entityType: "beta_tester",
    entityId: result.data.id,
    targetEmail: email,
    actor: input.actor,
    summary: removing ? "Beta access removed" : "Beta access synced",
    metadata: { userId, source: input.source, requestedBetaStatus: requested },
  });

  return {
    success: true,
    status: testerStatus,
    message: removing
      ? "Beta access removed."
      : requested === "approve" || requested === "approved"
        ? "User approved as a beta tester."
        : "Beta access updated.",
    user_id: userId,
    beta_record_id: result.data.id,
    created_beta_record: !existing?.id,
    updated_profile: updatedProfile,
    tester: result.data,
  };
}
