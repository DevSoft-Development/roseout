export const ADMIN_ROLES = [
  "superadmin",
  "admin",
  "manager",
  "editor",
  "reviewer",
  "ambassador",
  "experience_team",
  "partner_ambassador",
  "marketing_intern",
  "marketing_specialist",
  "marketing_manager",
  "viewer",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

const ROLE_ALIASES: Record<string, AdminRole> = {
  superuser: "superadmin",
  super_admin: "superadmin",
  sales: "ambassador",
  sales_rep: "ambassador",
  salesrep: "ambassador",
  ambassador_team: "ambassador",
  support: "experience_team",
  service: "experience_team",
  service_team: "experience_team",
  guest_care: "experience_team",
  guestcare: "experience_team",
  experience: "experience_team",
  partner_ambassador: "partner_ambassador",
  marketing: "marketing_specialist",
  social_media_intern: "marketing_intern",
  social_media_manager: "marketing_manager",
};

export function normalizeAdminRole(role: string | null | undefined): AdminRole | null {
  if (!role) return null;
  const normalized = role.trim().toLowerCase().replace(/\s+/g, "_");
  const mapped = ROLE_ALIASES[normalized] ?? normalized;
  return (ADMIN_ROLES as readonly string[]).includes(mapped) ? (mapped as AdminRole) : null;
}

export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return normalizeAdminRole(role) !== null;
}
