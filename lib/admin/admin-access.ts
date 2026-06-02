import "server-only";

import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getCurrentAdmin, requireAdminRole } from "@/lib/admin-auth";
import type { AdminRole } from "@/lib/users/roles";

export const ADMIN_LOCATION_VIEW_ROLES = ["superadmin", "admin", "experience", "experience_team", "viewer"] as const satisfies readonly AdminRole[];
export const ADMIN_LOCATION_WRITE_ROLES = ["superadmin", "admin"] as const satisfies readonly AdminRole[];

export type AdminLocationPermission =
  | "view"
  | "edit"
  | "manage_reservations"
  | "manage_layout"
  | "manage_settings"
  | "manage_plan"
  | "superadmin";

export function isAdminLocationWriteRole(role: AdminRole | null | undefined) {
  return role === "superadmin" || role === "admin";
}

export function isAdminLocationViewRole(role: AdminRole | null | undefined) {
  return Boolean(role && (ADMIN_LOCATION_VIEW_ROLES as readonly string[]).includes(role));
}

export async function requireAdmin() {
  return requireAdminRole(ADMIN_LOCATION_WRITE_ROLES);
}

export async function requireAdminOrSupport() {
  return requireAdminRole(ADMIN_LOCATION_VIEW_ROLES);
}

export async function requireAdminLocationApiRead() {
  return requireAdminApiRole(ADMIN_LOCATION_VIEW_ROLES);
}

export async function requireAdminLocationApiWrite() {
  return requireAdminApiRole(ADMIN_LOCATION_WRITE_ROLES);
}

export function canAdminViewLocation(user: { role?: AdminRole | null } | null | undefined, _locationId?: string) {
  return isAdminLocationViewRole(user?.role);
}

export function canAdminModifyLocation(user: { role?: AdminRole | null } | null | undefined, _locationId?: string) {
  return isAdminLocationWriteRole(user?.role);
}

export async function getOptionalCurrentAdmin() {
  try {
    return await getCurrentAdmin();
  } catch {
    return null;
  }
}
