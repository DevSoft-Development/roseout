import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ADMIN_PAGE_ACCESS, ADMIN_ROLE_DESCRIPTIONS, ADMIN_ROLE_LABELS, type AdminPermissionKey } from "@/lib/admin-permissions";
import { ADMIN_ROLES, type AdminRole } from "@/lib/users/roles";
import { logAdminAuditEvent } from "@/lib/admin-audit-log";

export type AdminRoleSummary = {
  role: AdminRole;
  label: string;
  description: string;
  permissions: AdminPermissionKey[];
  users: number;
};

export type AdminStaffSecurityRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: AdminRole;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
};

function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export async function listAdminRoleSummaries(): Promise<AdminRoleSummary[]> {
  const { data: staff, error } = await supabaseAdmin.from("admin_users").select("role");
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of staff || []) counts.set(String(row.role), (counts.get(String(row.role)) || 0) + 1);

  return ADMIN_ROLES.map((role) => ({
    role,
    label: ADMIN_ROLE_LABELS[role],
    description: ADMIN_ROLE_DESCRIPTIONS[role],
    permissions: Object.entries(ADMIN_PAGE_ACCESS)
      .filter(([, roles]) => (roles as readonly string[]).includes(role))
      .map(([permission]) => permission as AdminPermissionKey),
    users: counts.get(role) || 0,
  }));
}

export async function listAdminStaffSecurity(): Promise<AdminStaffSecurityRow[]> {
  const { data: staff, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id,email,full_name,role,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const authUsers: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error: authError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (authError) throw authError;
    authUsers.push(...data.users);
    if (data.users.length < 200) break;
  }
  const authById = new Map(authUsers.map((user: any) => [user.id, user]));

  return (staff || []).flatMap((row: any) => {
    if (!isAdminRole(row.role)) return [];
    const auth = authById.get(row.user_id);
    return [{
      user_id: row.user_id,
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
  const staff = await listAdminStaffSecurity();
  const now = Date.now();
  const staleCutoff = now - 90 * 24 * 60 * 60 * 1000;
  const active = staff.filter((u) => !u.banned_until || new Date(u.banned_until).getTime() <= now);
  const stale = active.filter((u) => !u.last_sign_in_at || new Date(u.last_sign_in_at).getTime() < staleCutoff);
  const unconfirmed = active.filter((u) => !u.email_confirmed_at);

  const { data: audit, error } = await supabaseAdmin
    .from("admin_audit_logs")
    .select("id,actor_email,actor_role,target_email,action,entity_type,summary,ip_address,created_at")
    .or("entity_type.eq.admin_role,entity_type.eq.admin_security,action.ilike.%role%,action.ilike.%security%,action.ilike.%disable%,action.ilike.%password%")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  return {
    staff,
    recentAudit: audit || [],
    metrics: {
      total: staff.length,
      superadmins: staff.filter((u) => u.role === "superadmin").length,
      banned: staff.length - active.length,
      stale: stale.length,
      unconfirmed: unconfirmed.length,
    },
  };
}

export async function changeAdminRole(input: {
  targetUserId: string;
  role: AdminRole;
  actor: { user_id: string; email: string | null; role: AdminRole };
  request?: Request;
}) {
  if (!isAdminRole(input.role)) throw new Error("Invalid admin role.");
  const { data: current, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id,email,full_name,role")
    .eq("user_id", input.targetUserId)
    .maybeSingle();
  if (error) throw error;
  if (!current || !isAdminRole(current.role)) throw new Error("Admin staff member not found.");

  if (current.role === "superadmin" && input.role !== "superadmin") {
    const { count, error: countError } = await supabaseAdmin
      .from("admin_users")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "superadmin");
    if (countError) throw countError;
    if ((count || 0) <= 1) throw new Error("The last superadmin cannot be demoted.");
  }

  if (input.actor.user_id === input.targetUserId && current.role === "superadmin" && input.role !== "superadmin") {
    throw new Error("You cannot demote your own superadmin account.");
  }

  const { error: updateError } = await supabaseAdmin
    .from("admin_users")
    .update({ role: input.role })
    .eq("user_id", input.targetUserId);
  if (updateError) throw updateError;

  await logAdminAuditEvent({
    actor: input.actor,
    targetUserId: input.targetUserId,
    targetEmail: current.email,
    action: "admin_role_changed",
    entityType: "admin_role",
    entityId: input.targetUserId,
    summary: `Admin role changed from ${current.role} to ${input.role}.`,
    beforeData: { role: current.role },
    afterData: { role: input.role },
    request: input.request,
  });

  return { ...current, role: input.role };
}

export async function setAdminAccessState(input: {
  targetUserId: string;
  disabled: boolean;
  actor: { user_id: string; email: string | null; role: AdminRole };
  request?: Request;
}) {
  if (input.targetUserId === input.actor.user_id && input.disabled) throw new Error("You cannot disable your own admin account.");

  const { data: current, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id,email,full_name,role")
    .eq("user_id", input.targetUserId)
    .maybeSingle();
  if (error) throw error;
  if (!current || !isAdminRole(current.role)) throw new Error("Admin staff member not found.");

  if (current.role === "superadmin" && input.disabled) {
    const { count, error: countError } = await supabaseAdmin
      .from("admin_users")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "superadmin");
    if (countError) throw countError;
    if ((count || 0) <= 1) throw new Error("The last superadmin cannot be disabled.");
  }

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.updateUserById(
    input.targetUserId,
    { ban_duration: input.disabled ? "876000h" : "none" },
  );
  if (authError) throw authError;

  await logAdminAuditEvent({
    actor: input.actor,
    targetUserId: input.targetUserId,
    targetEmail: current.email,
    action: input.disabled ? "admin_access_disabled" : "admin_access_restored",
    entityType: "admin_security",
    entityId: input.targetUserId,
    summary: input.disabled ? "Admin sign-in access disabled." : "Admin sign-in access restored.",
    beforeData: { banned_until: null },
    afterData: { banned_until: authUser.user?.banned_until || null },
    request: input.request,
  });

  return { banned_until: authUser.user?.banned_until || null };
}
