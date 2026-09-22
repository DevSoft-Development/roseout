import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { logAdminAuditEvent } from "@/lib/admin-audit-log";
import { USER_ROLES, type UserRole } from "@/lib/users/roles";

const AGE_RANGE_OPTIONS = ["Under 21", "21–24", "25–34", "35–44", "45–54", "55–64", "65+", "Prefer not to say"] as const;
const PLAN_OPTIONS = ["free", "unlimited", "comped", "admin"] as const;
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function safe<T>(fn: () => Promise<T>, fallback: T) {
  try { return await fn(); } catch { return fallback; }
}

async function listRows(table: string, userId: string, column = "user_id") {
  return safe(async () => {
    const { data } = await getAdminDatabaseClient()
      .from(table)
      .select("*")
      .eq(column, userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return data || [];
  }, [] as any[]);
}

async function listTickets(userId: string, email?: string | null) {
  return safe(async () => {
    const clause = `user_id.eq.${userId}${email ? `,requester_email.eq.${email},email.eq.${email}` : ""}`;
    const { data } = await getAdminDatabaseClient()
      .from("support_tickets")
      .select("*")
      .or(clause)
      .order("updated_at", { ascending: false })
      .limit(50);
    return data || [];
  }, [] as any[]);
}

export async function getAdminUserDetail(userId: string) {
  const db = getAdminDatabaseClient();
  const { data: consumerProfile } = await db.from("consumer_profiles").select("*").eq("user_id", userId).maybeSingle();
  const { data: legacyAccount } = await db.from("user_profiles").select("user_id,account_status,deleted_at,disabled_at,created_at").eq("user_id", userId).maybeSingle();
  const auth = uuidRe.test(userId)
    ? await safe(async () => (await db.auth.admin.getUserById(userId)).data.user, null as any)
    : null;

  let beta = await safe(async () => {
    const email = auth?.email || auth?.email;
    const clause = `user_id.eq.${userId}${email ? `,email.eq.${email}` : ""}`;
    return (await db.from("beta_testers").select("*").or(clause).maybeSingle()).data;
  }, null as any);

  if (!consumerProfile && !auth && !beta) {
    beta = await safe(async () => (await db.from("beta_testers").select("*").eq("id", userId).maybeSingle()).data, null as any);
  }

  const id = profile?.id || auth?.id || beta?.user_id || null;
  const email = auth?.email || auth?.email || beta?.email || null;

  const [admin, saved, booked, reservations, tickets, usage, subscription, betaAssignments, betaFeedback, betaBugReports] = await Promise.all([
    safe(async () => id ? (await db.from("admin_users").select("role").eq("user_id", id).maybeSingle()).data : null, null as any),
    id ? listRows("saved_plans", id) : Promise.resolve([]),
    id ? listRows("user_outings", id) : Promise.resolve([]),
    id ? listRows("location_reservations", id) : Promise.resolve([]),
    listTickets(id || userId, email),
    id ? listRows("search_usage_events", id, "auth_user_id") : Promise.resolve([]),
    safe(async () => id ? (await db.from("customer_subscriptions").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle()).data : null, null as any),
    beta?.id ? listRows("beta_task_assignments", beta.id, "tester_id") : Promise.resolve([]),
    beta?.id ? listRows("beta_feedback", beta.id, "tester_id") : Promise.resolve([]),
    beta?.id ? listRows("beta_bug_reports", beta.id, "tester_id") : Promise.resolve([]),
  ]);

  const hasAccount = Boolean(id);
  return {
    profile: {
      ...(consumerProfile || {}),
      id: id || beta?.id || userId,
      email,
      first_name: consumerProfile?.first_name || auth?.user_metadata?.first_name || beta?.name || null,
      phone: consumerProfile?.phone_e164 || beta?.phone || null,
      role: admin?.role || "user",
      plan: subscription?.plan_key || (hasAccount ? "free" : "Pending"),
      email_confirmed_at: auth?.email_confirmed_at,
      created_at: consumerProfile?.created_at || auth?.created_at || beta?.created_at,
      account_status:
        legacyAccount?.account_status ||
        (legacyAccount?.deleted_at || legacyAccount?.disabled_at || admin?.role === "disabled"
          ? "disabled"
          : hasAccount
            ? (auth?.email_confirmed_at ? "active" : "email_unverified")
            : "pending_account"),
      hasAccount,
    },
    beta,
    saved,
    booked,
    reservations,
    tickets,
    usage,
    subscription,
    betaAssignments,
    betaFeedback,
    betaBugReports,
  };
}

export async function updateAdminUserProfile(userId: string, input: any, actor?: any, request?: Request) {
  const db = getAdminDatabaseClient();
  const before = (await db.from("consumer_profiles").select("*").eq("user_id", userId).maybeSingle()).data || {};
  const row: any = { user_id: userId, updated_at: new Date().toISOString() };

  if ("first_name" in input) row.first_name = String(input.first_name || "").trim() || null;
  if ("phone_e164" in input) row.phone_e164 = String(input.phone_e164 || "").trim() || null;
  if ("birth_month" in input) {
    const month = Number(input.birth_month);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Birth month must be between 1 and 12");
    row.birth_month = month;
  }
  if ("home_zip_code" in input) {
    const zip = String(input.home_zip_code || "").replace(/\D/g, "").slice(0, 5);
    if (zip && !/^\d{5}$/.test(zip)) throw new Error("ZIP code must be 5 digits");
    row.home_zip_code = zip || null;
  }
  if ("sms_consent" in input) row.sms_consent = input.sms_consent === true;
  if ("personalization_enabled" in input) row.personalization_enabled = input.personalization_enabled !== false;

  const { data, error } = await db.from("consumer_profiles").upsert(row, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  await logAdminAuditEvent({ actor, targetUserId: userId, targetEmail: null, action: "user_updated", entityType: "consumer_profile", summary: "Canonical consumer profile updated", beforeData: before, afterData: data, request });
  return data;
}

export async function updateUserRole(userId: string, role: UserRole, actor: any, request?: Request) {
  if (!(USER_ROLES as readonly string[]).includes(role)) throw new Error("Invalid role");
  const db = getAdminDatabaseClient();
  const before = (await db.from("admin_users").select("*").eq("user_id", userId).maybeSingle()).data;

  if (userId === actor?.user_id && role !== "superadmin") {
    const { count } = await db.from("admin_users").select("user_id", { count: "exact", head: true }).eq("role", "superadmin");
    if ((count || 0) <= 1) throw new Error("You cannot remove the last superadmin.");
  }

  const auth = await safe(async () => (await db.auth.admin.getUserById(userId)).data.user, null as any);
  const payload = { user_id: userId, email: auth?.email || before?.email || null, role };
  const { data, error } = await db.from("admin_users").upsert(payload, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  await logAdminAuditEvent({ actor, targetUserId: userId, targetEmail: payload.email, action: "user_role_changed", entityType: "admin_user", summary: `Role changed from ${before?.role || "user"} to ${role}`, beforeData: before, afterData: data, request });
  return data;
}

export async function updateUserPlan(userId: string, plan: string, actor: any, request?: Request) {
  if (!(PLAN_OPTIONS as readonly string[]).includes(plan)) throw new Error("Invalid plan");
  const db = getAdminDatabaseClient();
  const before = (await db.from("customer_subscriptions").select("*").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
  const payload = { user_id: userId, plan_key: plan, status: "active", provider: "admin", updated_at: new Date().toISOString() };
  const result = before?.id
    ? await db.from("customer_subscriptions").update(payload).eq("id", before.id).select("*").single()
    : await db.from("customer_subscriptions").insert(payload).select("*").single();
  if (result.error) throw result.error;
  await logAdminAuditEvent({ actor, targetUserId: userId, action: "user_plan_changed", entityType: "customer_subscription", entityId: result.data.id, summary: `Plan changed from ${before?.plan_key || "free"} to ${plan}`, beforeData: before, afterData: result.data, request });
  return result.data;
}

export async function disableAdminUser(userId: string, reason: string, actor: any, request?: Request) {
  const before = await getAdminUserDetail(userId);
  const db = getAdminDatabaseClient();
  const now = new Date().toISOString();
  const { error } = await db.from("user_profiles").upsert({ id: userId, account_status: "disabled", disabled_at: now, disabled_by: actor.user_id, deleted_at: now, deleted_by: actor.user_id, updated_at: now }, { onConflict: "id" });
  if (error) throw error;
  await updateUserRole(userId, "disabled", actor, request);
  await logAdminAuditEvent({ actor, targetUserId: userId, targetEmail: before.profile.email, action: "user_deleted_or_disabled", entityType: "user", summary: `User disabled${reason ? `: ${reason}` : ""}`, beforeData: before.profile, afterData: { account_status: "disabled", reason }, request });
}

export async function sendUserPasswordReset(email: string) {
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
  const { error } = await getAdminDatabaseClient().auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/reset-password` });
  if (error) throw error;
}
