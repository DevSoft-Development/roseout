import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  ADMIN_ROLES,
  isAdminRole,
  type AdminRole,
} from "@theouthaven/auth/admin-roles";

export type AdminStaffSecurityRow = {
  admin_id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  role: AdminRole;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
};

async function countSuperadmins() {
  const adminDb = getAdminDatabaseClient();
  const { count, error } = await adminDb
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "superadmin");
  if (error) throw error;
  return count || 0;
}

export async function listAdminStaffSecurity(): Promise<AdminStaffSecurityRow[]> {
  const adminDb = getAdminDatabaseClient();
  const { data: staff, error } = await adminDb
    .from("admin_users")
    .select("id,user_id,email,full_name,role,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const authUsers: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error: authError } = await adminDb.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (authError) throw authError;
    authUsers.push(...data.users);
    if (data.users.length < 200) break;
  }

  const authById = new Map(authUsers.map((user: any) => [user.id, user]));

  return (staff || []).flatMap((row: any) => {
    if (!isAdminRole(row.role)) return [];
    const auth = row.user_id ? authById.get(row.user_id) : null;
    return [{
      admin_id: row.id,
      user_id: row.user_id || null,
      email: row.email || auth?.email || null,
      full_name: row.full_name || auth?.user_metadata?.full_name || null,
      role: row.role,
      created_at: row.created_at || null,
      last_sign_in_at: auth?.last_sign_in_at || null,
      email_confirmed_at: auth?.email_confirmed_at || null,
      banned_until: auth?.banned_until || null,
    }];
  });
}

export async function getAdminSecurityOverview() {
  const adminDb = getAdminDatabaseClient();
  const staff = await listAdminStaffSecurity();
  const now = Date.now();
  const staleCutoff = now - 90 * 24 * 60 * 60 * 1000;
  const active = staff.filter(
    (user) => !user.banned_until || new Date(user.banned_until).getTime() <= now,
  );
  const stale = active.filter(
    (user) =>
      !user.last_sign_in_at ||
      new Date(user.last_sign_in_at).getTime() < staleCutoff,
  );
  const unconfirmed = active.filter((user) => !user.email_confirmed_at);

  const { data: audit, error } = await adminDb
    .from("admin_audit_logs")
    .select(
      "id,actor_email,actor_role,target_email,action,entity_type,summary,ip_address,created_at",
    )
    .or(
      "entity_type.eq.admin_role,entity_type.eq.admin_security,action.ilike.%role%,action.ilike.%security%,action.ilike.%disable%,action.ilike.%password%",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  return {
    staff,
    recentAudit: audit || [],
    metrics: {
      total: staff.length,
      superadmins: staff.filter((user) => user.role === "superadmin").length,
      banned: staff.length - active.length,
      stale: stale.length,
      unconfirmed: unconfirmed.length,
    },
  };
}

function requestIp(request?: Request) {
  if (!request) return null;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export async function setAdminAccessState(input: {
  targetUserId: string;
  disabled: boolean;
  actor: { user_id: string; email: string | null; role: AdminRole };
  request?: Request;
}) {
  if (input.targetUserId === input.actor.user_id && input.disabled) {
    throw new Error("You cannot disable your own admin account.");
  }

  const adminDb = getAdminDatabaseClient();
  const { data: current, error } = await adminDb
    .from("admin_users")
    .select("user_id,email,full_name,role")
    .eq("user_id", input.targetUserId)
    .maybeSingle();
  if (error) throw error;
  if (!current || !isAdminRole(current.role)) {
    throw new Error("Admin staff member not found.");
  }

  if (
    current.role === "superadmin" &&
    input.disabled &&
    (await countSuperadmins()) <= 1
  ) {
    throw new Error("The last superadmin cannot be disabled.");
  }

  const { data: authUser, error: authError } =
    await adminDb.auth.admin.updateUserById(input.targetUserId, {
      ban_duration: input.disabled ? "876000h" : "none",
    });
  if (authError) throw authError;

  const action = input.disabled
    ? "admin_access_disabled"
    : "admin_access_restored";
  const summary = input.disabled
    ? "Admin sign-in access disabled."
    : "Admin sign-in access restored.";

  const { error: auditError } = await adminDb.from("admin_audit_logs").insert({
    actor_user_id: input.actor.user_id,
    actor_email: input.actor.email,
    actor_role: input.actor.role,
    target_user_id: input.targetUserId,
    target_email: current.email,
    action,
    entity_type: "admin_security",
    entity_id: input.targetUserId,
    summary,
    before_data: { banned_until: null },
    after_data: { banned_until: authUser.user?.banned_until || null },
    metadata: {},
    ip_address: requestIp(input.request),
    user_agent: input.request?.headers.get("user-agent") || null,
  });
  if (auditError) {
    console.error("ADMIN_AUDIT_LOG_FAILED", auditError);
  }

  return { banned_until: authUser.user?.banned_until || null };
}
