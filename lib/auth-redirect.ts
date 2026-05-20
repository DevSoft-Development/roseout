import type { User } from "@supabase/supabase-js";

type RedirectResolutionInput = {
  role?: string | null;
  profileRole?: string | null;
  profileAccountType?: string | null;
  isAdminUser?: boolean;
  isLocationOwner?: boolean;
  intendedPath?: string | null;
};

const ADMIN_ROLES = new Set(["admin", "super_admin", "superuser"]);
const OWNER_ROLES = new Set(["owner", "business_owner", "location_owner", "restaurants"]);

function normalizeRole(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().toLowerCase();
}

export function sanitizeIntendedPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  if (path.startsWith("/login") || path.startsWith("/signup")) return null;
  return path;
}

export function resolvePostLoginRedirect(input: RedirectResolutionInput): string {
  const roleCandidates = [input.role, input.profileRole, input.profileAccountType].map(normalizeRole);
  const isAdmin = input.isAdminUser || roleCandidates.some((role) => role && ADMIN_ROLES.has(role));

  if (isAdmin) {
    return "/admin/dashboard";
  }

  const isOwner = input.isLocationOwner || roleCandidates.some((role) => role && OWNER_ROLES.has(role));
  if (isOwner) {
    return "/dashboard";
  }

  return sanitizeIntendedPath(input.intendedPath) || "/create";
}

export function getUserMetadataRole(user: User | null | undefined): string | null {
  const metadataRole = user?.user_metadata?.role;
  return typeof metadataRole === "string" ? metadataRole : null;
}
