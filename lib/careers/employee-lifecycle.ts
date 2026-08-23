export const EMPLOYEE_EMAIL_DOMAIN = "theouthaven.com";

export const PROVISIONABLE_ADMIN_ROLES = [
  "manager",
  "editor",
  "reviewer",
  "ambassador",
  "experience",
  "partner_ambassador",
  "experience_team",
  "viewer",
] as const;

export type ProvisionableAdminRole = (typeof PROVISIONABLE_ADMIN_ROLES)[number];

export function normalizeEmployeeEmailPart(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".")
    .slice(0, 48);
}

export function buildEmployeeEmailCandidates(firstName: string, lastName: string) {
  const first = normalizeEmployeeEmailPart(firstName);
  const last = normalizeEmployeeEmailPart(lastName);
  if (!first) throw new Error("A first name is required to create an employee email.");
  const candidates = [`${first}@${EMPLOYEE_EMAIL_DOMAIN}`];
  if (last) candidates.push(`${first}.${last}@${EMPLOYEE_EMAIL_DOMAIN}`);
  for (let index = 2; index <= 20 && last; index += 1) {
    candidates.push(`${first}.${last}${index}@${EMPLOYEE_EMAIL_DOMAIN}`);
  }
  return candidates;
}

export function isProvisionableAdminRole(role: string): role is ProvisionableAdminRole {
  return (PROVISIONABLE_ADMIN_ROLES as readonly string[]).includes(role);
}
