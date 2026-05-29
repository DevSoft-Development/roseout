type RedirectResolutionInput = {
  adminRole?: string | null;
  role?: string | null;
  profileRole?: string | null;
  profileAccountType?: string | null;
  isAdminUser?: boolean;
  isLocationOwner?: boolean;
  intendedPath?: string | null;
};

const ADMIN_ROLES = new Set(["superadmin", "admin"]);
const OWNER_ROLES = new Set(["owner", "business_owner", "location_owner", "restaurants"]);

function normalizeRole(value: string | null | undefined): string | null {
  if (!value) return null;
  const role = value.trim().toLowerCase();
  if (role === "superuser" || role === "super_admin") return "superadmin";
  return role;
}

export function sanitizeIntendedPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  if (path.startsWith("/login")) return null;
  if (path.startsWith("/signup")) return null;
  if (path.startsWith("/auth")) return null;
  return path;
}

export function resolvePostLoginRedirect(input: RedirectResolutionInput): string {
  const adminRole = normalizeRole(input.adminRole);

  if (input.isAdminUser || (adminRole && ADMIN_ROLES.has(adminRole))) {
    return "/admin/dashboard";
  }

  const roleCandidates = [
    input.role,
    input.profileRole,
    input.profileAccountType,
  ].map(normalizeRole);

  const isAdminFromProfile = roleCandidates.some(
    (role) => role && ADMIN_ROLES.has(role),
  );

  if (isAdminFromProfile) {
    return "/admin/dashboard";
  }

  const isOwner =
    input.isLocationOwner ||
    roleCandidates.some((role) => role && OWNER_ROLES.has(role));

  if (isOwner) {
    return "/dashboard";
  }

  return sanitizeIntendedPath(input.intendedPath) || "/create";
}
