type RedirectResolutionInput = {
  adminRole?: string | null;
  role?: string | null;
  profileRole?: string | null;
  profileAccountType?: string | null;
  isAdminUser?: boolean;
  isLocationOwner?: boolean;
  intendedPath?: string | null;
};

const ADMIN_ROLES = new Set(["superadmin", "admin", "editor", "ambassador", "experience", "viewer"]);
const OWNER_ROLES = new Set(["owner", "business_owner", "location_owner", "restaurants"]);
const BLOCKED_INTENDED_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/logout",
  "/auth",
  "/api/auth",
];

function normalizeRole(value: string | null | undefined): string | null {
  if (!value) return null;
  const role = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (role === "superuser" || role === "super_admin") return "superadmin";
  if (["sales", "sales_rep", "salesrep", "ambassador_team"].includes(role)) return "ambassador";
  if (["support", "guest_care", "guestcare", "experience_team"].includes(role)) return "experience";
  return role;
}

export function sanitizeIntendedPath(path: string | null | undefined): string | null {
  if (!path) return null;

  const trimmedPath = path.trim();
  const lowerPath = trimmedPath.toLowerCase();

  if (!trimmedPath.startsWith("/")) return null;
  if (trimmedPath.startsWith("//")) return null;
  if (lowerPath.startsWith("javascript:")) return null;

  const pathname = trimmedPath.split(/[?#]/, 1)[0].toLowerCase();

  if (
    BLOCKED_INTENDED_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }

  try {
    const url = new URL(trimmedPath, "https://theouthaven.local");

    if (url.origin !== "https://theouthaven.local") return null;

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
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
    return "/owner/dashboard";
  }

  const safePath = sanitizeIntendedPath(input.intendedPath);

  if (safePath) {
    return safePath;
  }

  return "/create";
}
