export const USER_ROLES = [
  "user",
  "owner",
  "viewer",
  "editor",
  "reviewer",
  "admin",
  "superadmin",
  "ambassador",
  "experience",
  "disabled",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type AdminRole =
  | "superadmin"
  | "admin"
  | "editor"
  | "ambassador"
  | "experience"
  | "viewer";

export const ADMIN_ROLES = [
  "superadmin",
  "admin",
  "editor",
  "ambassador",
  "experience",
  "viewer",
] as const satisfies readonly AdminRole[];

export const USER_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "owner", label: "Owner" },
  { value: "superadmin", label: "Superadmin" },
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "ambassador", label: "Ambassador Team" },
  { value: "experience", label: "Experience Team" },
  { value: "viewer", label: "Viewer" },
  { value: "reviewer", label: "Reviewer" },
  { value: "disabled", label: "Disabled" },
];

export const ADMIN_ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: "superadmin", label: "Superadmin" },
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "ambassador", label: "Ambassador Team" },
  { value: "experience", label: "Experience Team" },
  { value: "viewer", label: "Viewer" },
];

export function normalizeRole(role: string | null | undefined): AdminRole | UserRole | null {
  if (!role) return null;

  const normalized = role.trim().toLowerCase().replace(/\s+/g, "_");

  const aliases: Record<string, AdminRole> = {
    superuser: "superadmin",
    super_admin: "superadmin",
    sales: "ambassador",
    sales_rep: "ambassador",
    salesrep: "ambassador",
    ambassador_team: "ambassador",
    support: "experience",
    guest_care: "experience",
    guestcare: "experience",
    experience_team: "experience",
  };

  const mapped = aliases[normalized] ?? normalized;

  if ((USER_ROLES as readonly string[]).includes(mapped)) {
    return mapped as UserRole;
  }

  return null;
}

export function isUserRole(role: string | null | undefined): role is UserRole {
  const normalized = normalizeRole(role);
  return typeof normalized === "string" && (USER_ROLES as readonly string[]).includes(normalized);
}

export function isAdminRole(role: string | null | undefined): role is AdminRole {
  const normalized = normalizeRole(role);
  return typeof normalized === "string" && (ADMIN_ROLES as readonly string[]).includes(normalized);
}

export function formatRoleLabel(role: string | null | undefined): string {
  const normalized = normalizeRole(role);

  switch (normalized) {
    case "superadmin":
      return "Superadmin";
    case "admin":
      return "Admin";
    case "editor":
      return "Editor";
    case "ambassador":
      return "Ambassador Team";
    case "experience":
      return "Experience Team";
    case "viewer":
      return "Viewer";
    case "user":
      return "User";
    case "owner":
      return "Owner";
    case "reviewer":
      return "Reviewer";
    case "disabled":
      return "Disabled";
    default:
      return "Unknown";
  }
}
