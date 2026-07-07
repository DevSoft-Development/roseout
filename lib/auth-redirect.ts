type RedirectResolutionInput = {
  adminRole?: string | null;
  role?: string | null;
  profileRole?: string | null;
  profileAccountType?: string | null;
  teamProfileTeamType?: string | null;
  isAdminUser?: boolean;
  isLocationOwner?: boolean;
  intendedPath?: string | null;
};

const ADMIN_DASHBOARD_ROLES = new Set(["superadmin", "admin", "manager"]);
const TEAM_WORKSPACE_ROLES = new Set(["ambassador", "experience", "experience_team", "sales_team", "support_team"]);
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
  if (["support", "guest_care", "guestcare"].includes(role)) return "support_team";
  if (["experience_team"].includes(role)) return "experience_team";
  if (["manager", "team_manager"].includes(role)) return "manager";
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
  const safePath = sanitizeIntendedPath(input.intendedPath);

  // Claim QR/account creation is a protected handoff flow. When a user signs in
  // from /business/claim?code=..., always return them there so they do not need
  // to rescan the QR code or re-enter the claim code.
  if (safePath?.startsWith("/business/claim")) {
    return safePath;
  }

  const adminRole = normalizeRole(input.adminRole);

  if (input.isAdminUser || (adminRole && ADMIN_DASHBOARD_ROLES.has(adminRole))) {
    return "/admin/dashboard";
  }

  const roleCandidates = [
    input.role,
    input.profileRole,
    input.profileAccountType,
    input.teamProfileTeamType,
  ].map(normalizeRole);

  const isAdminFromProfile = roleCandidates.some(
    (role) => role && ADMIN_DASHBOARD_ROLES.has(role),
  );

  if (isAdminFromProfile) {
    return "/admin/dashboard";
  }

  const isTeamWorkspaceUser = roleCandidates.some(
    (role) => role && TEAM_WORKSPACE_ROLES.has(role),
  );

  if (isTeamWorkspaceUser) {
    return "/admin/dashboard/crm/work-queue?view=my-queue";
  }

  const isOwner =
    input.isLocationOwner ||
    roleCandidates.some((role) => role && OWNER_ROLES.has(role));

  if (isOwner) {
    return "/owner/dashboard";
  }

  if (safePath) {
    return safePath;
  }

  return "/user/dashboard";
}
