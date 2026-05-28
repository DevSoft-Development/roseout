export const USER_ROLES = [
  "user",
  "owner",
  "viewer",
  "editor",
  "reviewer",
  "admin",
  "superadmin",
  "disabled",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ADMIN_ROLES = [
  "superadmin",
  "admin",
  "editor",
  "reviewer",
  "viewer",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const USER_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "owner", label: "Owner" },
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
  { value: "reviewer", label: "Reviewer" },
  { value: "admin", label: "Admin" },
  { value: "superadmin", label: "Superadmin" },
  { value: "disabled", label: "Disabled" },
];

export function normalizeRole(role?: string | null) {
  if (role === "superuser") return "superadmin";
  return role ?? "user";
}

export function isUserRole(role: string): role is UserRole {
  return (USER_ROLES as readonly string[]).includes(role);
}

export function isAdminRole(role: unknown): role is AdminRole {
  return typeof role === "string" && (ADMIN_ROLES as readonly string[]).includes(normalizeRole(role));
}

export function formatRoleLabel(role?: string | null) {
  const normalizedRole = normalizeRole(role);
  return USER_ROLE_OPTIONS.find((option) => option.value === normalizedRole)?.label ?? normalizedRole;
}
