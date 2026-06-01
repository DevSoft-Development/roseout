import type { KnowledgeBaseVisibility } from "./types";

export const roleLabels: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  partner_ambassador: "Partner Ambassador",
  experience_team: "Experience Team",
  ambassador: "Ambassador Team",
  experience: "Experience Team",
  owner: "Location Owner",
  user: "User",
};

const aliases: Record<string, string> = {
  super_admin: "superadmin",
  superuser: "superadmin",
  sales: "partner_ambassador",
  sales_rep: "partner_ambassador",
  salesrep: "partner_ambassador",
  ambassador: "partner_ambassador",
  ambassador_team: "partner_ambassador",
  support: "experience_team",
  guest_care: "experience_team",
  guestcare: "experience_team",
  experience: "experience_team",
};

export function normalizeKbRole(role?: string | null): string {
  if (!role) return "user";
  const normalized = role.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return aliases[normalized] ?? normalized;
}

export function roleCanManageKb(role?: string | null): boolean {
  return ["superadmin", "admin"].includes(normalizeKbRole(role));
}

export function roleCanEditKb(role?: string | null): boolean {
  return ["superadmin", "admin", "editor"].includes(normalizeKbRole(role));
}

export function roleCanUseKbAi(role?: string | null): boolean {
  return ["superadmin", "admin", "editor", "viewer", "partner_ambassador", "experience_team"].includes(normalizeKbRole(role));
}

export function roleCanViewArticle(
  role: string | null,
  article: { visibility: KnowledgeBaseVisibility | string; allowed_roles: string[] | null },
): boolean {
  const normalized = normalizeKbRole(role);
  if (article.visibility === "public" || article.visibility === "both") return true;
  if (roleCanManageKb(normalized)) return true;
  return (article.allowed_roles ?? []).map(normalizeKbRole).includes(normalized);
}
