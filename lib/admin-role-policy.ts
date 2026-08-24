import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ADMIN_PAGE_ACCESS,
  ADMIN_ROLE_DESCRIPTIONS,
  ADMIN_ROLE_LABELS,
  type AdminPermissionKey,
} from "@/lib/admin-permissions";
import { ADMIN_ROLES, type AdminRole } from "@/lib/users/roles";
import { logAdminAuditEvent } from "@/lib/admin-audit-log";

const ALL_PERMISSION_KEYS = Object.keys(ADMIN_PAGE_ACCESS) as AdminPermissionKey[];

export const OWNER_LOCKED_PERMISSIONS = new Set<AdminPermissionKey>([
  "billing",
  "settings",
  "featureFlags",
  "logs",
  "security",
  "securityManage",
  "roles",
  "rolesManage",
  "adminUsers",
  "impersonation",
  "import",
  "promoCodes",
  "locationsDelete",
  "crmDelete",
]);

export type EffectiveAdminRolePolicy = {
  role: AdminRole;
  label: string;
  description: string;
  permissions: AdminPermissionKey[];
  customized: boolean;
  updated_at: string | null;
};

type StoredPolicy = {
  role: string;
  label: string;
  description: string;
  permissions: unknown;
  updated_at: string | null;
};

function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

function normalizePermissions(value: unknown): AdminPermissionKey[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(ALL_PERMISSION_KEYS);
  return [...new Set(value.filter((item): item is AdminPermissionKey => typeof item === "string" && allowed.has(item)))];
}

function defaultPermissions(role: AdminRole) {
  return ALL_PERMISSION_KEYS.filter((permission) =>
    (ADMIN_PAGE_ACCESS[permission] as readonly string[]).includes(role),
  );
}

function applySafetyRules(role: AdminRole, permissions: AdminPermissionKey[]) {
  if (role === "superadmin") return [...ALL_PERMISSION_KEYS];
  const next = permissions.filter((permission) => !OWNER_LOCKED_PERMISSIONS.has(permission));
  if (!next.includes("dashboard")) next.unshift("dashboard");
  return [...new Set(next)];
}

export async function listEffectiveAdminRolePolicies(): Promise<EffectiveAdminRolePolicy[]> {
  const { data, error } = await supabaseAdmin
    .from("admin_role_policies")
    .select("role,label,description,permissions,updated_at");
  if (error) throw error;

  const stored = new Map<AdminRole, StoredPolicy>();
  for (const row of data || []) {
    if (isAdminRole(row.role)) stored.set(row.role, row as StoredPolicy);
  }

  return ADMIN_ROLES.map((role) => {
    const override = stored.get(role);
    const permissions = applySafetyRules(
      role,
      override ? normalizePermissions(override.permissions) : defaultPermissions(role),
    );
    return {
      role,
      label: ADMIN_ROLE_LABELS[role],
      description: override?.description?.trim() || ADMIN_ROLE_DESCRIPTIONS[role],
      permissions,
      customized: Boolean(override) && role !== "superadmin",
      updated_at: override?.updated_at || null,
    };
  });
}

export async function getEffectiveAdminRolePolicy(role: AdminRole) {
  const policies = await listEffectiveAdminRolePolicies();
  return policies.find((policy) => policy.role === role)!;
}

export async function getEffectiveAdminPermissions(role: AdminRole) {
  return (await getEffectiveAdminRolePolicy(role)).permissions;
}

export async function adminRoleHasPermission(role: AdminRole, permission: AdminPermissionKey) {
  if (role === "superadmin") return true;
  return (await getEffectiveAdminPermissions(role)).includes(permission);
}

export async function saveAdminRolePolicy(input: {
  role: AdminRole;
  description: string;
  permissions: AdminPermissionKey[];
  actor: { user_id: string; email: string | null; role: AdminRole };
  request?: Request;
}) {
  if (input.role === "superadmin") throw new Error("Superadmin is a protected system role and cannot be edited.");

  const description = input.description.trim();
  if (description.length < 3 || description.length > 500) {
    throw new Error("Role description must be between 3 and 500 characters.");
  }

  const requested = normalizePermissions(input.permissions);
  const forbidden = requested.filter((permission) => OWNER_LOCKED_PERMISSIONS.has(permission));
  if (forbidden.length) throw new Error("Owner-only permissions cannot be assigned to this role.");

  const permissions = applySafetyRules(input.role, requested);
  const before = await getEffectiveAdminRolePolicy(input.role);
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from("admin_role_policies").upsert(
    {
      role: input.role,
      label: ADMIN_ROLE_LABELS[input.role],
      description,
      permissions,
      updated_by: input.actor.user_id,
      updated_at: now,
    },
    { onConflict: "role" },
  );
  if (error) throw error;

  await logAdminAuditEvent({
    actor: input.actor,
    action: "admin_role_policy_updated",
    entityType: "admin_role_policy",
    entityId: input.role,
    summary: `${ADMIN_ROLE_LABELS[input.role]} permissions were updated.`,
    beforeData: { description: before.description, permissions: before.permissions },
    afterData: { description, permissions },
    request: input.request,
  });

  return getEffectiveAdminRolePolicy(input.role);
}

export async function resetAdminRolePolicy(input: {
  role: AdminRole;
  actor: { user_id: string; email: string | null; role: AdminRole };
  request?: Request;
}) {
  if (input.role === "superadmin") throw new Error("Superadmin is a protected system role and cannot be reset.");
  const before = await getEffectiveAdminRolePolicy(input.role);
  const { error } = await supabaseAdmin.from("admin_role_policies").delete().eq("role", input.role);
  if (error) throw error;

  const after = await getEffectiveAdminRolePolicy(input.role);
  await logAdminAuditEvent({
    actor: input.actor,
    action: "admin_role_policy_reset",
    entityType: "admin_role_policy",
    entityId: input.role,
    summary: `${ADMIN_ROLE_LABELS[input.role]} permissions were reset to system defaults.`,
    beforeData: { description: before.description, permissions: before.permissions },
    afterData: { description: after.description, permissions: after.permissions },
    request: input.request,
  });
  return after;
}
