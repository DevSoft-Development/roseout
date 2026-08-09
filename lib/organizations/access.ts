import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { OrganizationMemberRole } from "@/lib/organizations/types";

const ADMIN_ROLES = new Set(["superadmin", "admin", "manager"]);
const MANAGE_ROLES = new Set<OrganizationMemberRole>(["owner", "admin"]);
const OPERATE_ROLES = new Set<OrganizationMemberRole>(["owner", "admin", "manager"]);

export type OrganizationAccess = {
  organizationId: string;
  userId: string;
  isPlatformAdmin: boolean;
  memberRole: OrganizationMemberRole | null;
  canView: boolean;
  canOperate: boolean;
  canManage: boolean;
};

async function isPlatformAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return ADMIN_ROLES.has(String(data?.role || "").toLowerCase());
}

export async function getOrganizationAccess(userId: string, organizationId: string): Promise<OrganizationAccess> {
  const platformAdmin = await isPlatformAdmin(userId);
  if (platformAdmin) {
    return {
      organizationId,
      userId,
      isPlatformAdmin: true,
      memberRole: null,
      canView: true,
      canOperate: true,
      canManage: true,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("role,status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return {
      organizationId,
      userId,
      isPlatformAdmin: false,
      memberRole: null,
      canView: false,
      canOperate: false,
      canManage: false,
    };
  }

  const memberRole = data.role as OrganizationMemberRole;
  return {
    organizationId,
    userId,
    isPlatformAdmin: false,
    memberRole,
    canView: true,
    canOperate: OPERATE_ROLES.has(memberRole),
    canManage: MANAGE_ROLES.has(memberRole),
  };
}

export async function requireOrganizationView(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  return access.canView ? access : null;
}

export async function requireOrganizationOperate(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  return access.canOperate ? access : null;
}

export async function requireOrganizationManage(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  return access.canManage ? access : null;
}
