type RedirectResolutionInput = {
  role?: string | null;
  profileRole?: string | null;
  profileAccountType?: string | null;
  isAdminUser?: boolean;
  isLocationOwner?: boolean;
  intendedPath?: string | null;
};

const ADMIN_ROLES = new Set(["admin", "superadmin"]);
const OWNER_ROLES = new Set(["owner", "business_owner", "location_owner", "restaurants"]);

function normalizeRedirectRole(value: string | null | undefined): string | null {
  if (!value) return null;
  const role = value.trim().toLowerCase();
  if (role === "superuser") return "superadmin";
  return role;
}

export function sanitizeIntendedPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  if (path.startsWith("/login") || path.startsWith("/signin") || path.startsWith("/signup")) return null;
  return path;
}

export function resolvePostLoginRedirect(input: RedirectResolutionInput): string {
  const roleCandidates = [input.role, input.profileRole, input.profileAccountType].map(normalizeRedirectRole);
  const isAdmin = input.isAdminUser || roleCandidates.some((role) => role && ADMIN_ROLES.has(role));

  if (isAdmin) {
    return "/admin/dashboard";
  }

  const isOwner = input.isLocationOwner || roleCandidates.some((role) => role && OWNER_ROLES.has(role));
  if (isOwner) {
    return "/location-owner/dashboard";
  }

  return sanitizeIntendedPath(input.intendedPath) || "/create";
}
