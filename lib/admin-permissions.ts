import type { AdminRole } from "@/lib/users/roles";

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  editor: "Editor",
  ambassador: "Ambassador Team",
  experience: "Experience Team",
  viewer: "Viewer",
};

export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  superadmin:
    "Full platform access, ownership settings, billing, imports, users, and destructive actions.",
  admin:
    "Trusted operations access for locations, CRM, claims, reservations, Experience Team, marketing, and analytics.",
  editor:
    "Content, location details, SEO, photos, templates, reviews, and marketing content.",
  ambassador:
    "Sales and outreach access for assigned locations, claim links, pipeline updates, and upgrade opportunities.",
  experience:
    "Experience Team access for user questions, reservation issues, claims help, owner account assistance, and approved communications.",
  viewer: "Read-only access to approved dashboard areas.",
};

export const ALL_ADMIN_ROLES = [
  "superadmin",
  "admin",
  "editor",
  "ambassador",
  "experience",
  "viewer",
] as const satisfies readonly AdminRole[];

export const ADMIN_PAGE_ACCESS = {
  dashboard: ALL_ADMIN_ROLES,
  analytics: ALL_ADMIN_ROLES,

  locations: ALL_ADMIN_ROLES,
  locationsCreate: ["superadmin", "admin"],
  locationsEdit: ["superadmin", "admin", "editor"],
  locationsDelete: ["superadmin"],

  crm: ALL_ADMIN_ROLES,
  crmEdit: ["superadmin", "admin", "editor"],
  crmSalesUpdate: ["superadmin", "admin", "ambassador"],
  crmExperienceUpdate: ["superadmin", "admin", "experience"],
  crmDelete: ["superadmin"],

  businessCrm: ALL_ADMIN_ROLES,
  businessCrmEdit: ["superadmin", "admin", "editor"],
  businessCrmSalesUpdate: ["superadmin", "admin", "ambassador"],
  businessCrmExperienceUpdate: ["superadmin", "admin", "experience"],

  claims: ["superadmin", "admin", "ambassador", "experience", "viewer"],
  claimsManage: ["superadmin", "admin"],
  claimsEscalate: ["superadmin", "admin", "experience"],
  claimsOutreach: ["superadmin", "admin", "ambassador"],

  claimQrs: ["superadmin", "admin", "ambassador", "experience", "viewer"],
  claimQrsGenerate: ["superadmin", "admin", "ambassador"],

  claimTools: ["superadmin", "admin", "ambassador"],

  ownerAccounts: ["superadmin", "admin", "ambassador", "experience"],
  ownerAccountsManage: ["superadmin", "admin"],
  ownerAccountsExperience: ["superadmin", "admin", "experience"],

  reservations: ALL_ADMIN_ROLES,
  reservationsManage: ["superadmin", "admin", "experience"],
  reservationsView: ALL_ADMIN_ROLES,

  reservationLayouts: ["superadmin", "admin", "editor"],
  reservationLayoutsEdit: ["superadmin", "admin", "editor"],

  experienceInbox: ["superadmin", "admin", "experience", "viewer"],
  experienceInboxManage: ["superadmin", "admin", "experience"],

  communication: ALL_ADMIN_ROLES,
  communicationSend: ["superadmin", "admin"],
  communicationOneToOne: ["superadmin", "admin", "ambassador", "experience"],

  emailTemplates: ALL_ADMIN_ROLES,
  emailTemplatesEdit: ["superadmin", "admin", "editor"],
  emailTemplatesUse: ["superadmin", "admin", "ambassador", "experience"],

  sms: ["superadmin", "admin", "ambassador", "experience", "viewer"],
  smsSend: ["superadmin", "admin"],
  smsOneToOne: ["superadmin", "admin", "ambassador", "experience"],

  campaigns: ["superadmin", "admin", "editor", "viewer"],
  campaignsEdit: ["superadmin", "admin", "editor"],
  campaignsSend: ["superadmin", "admin"],

  marketing: ALL_ADMIN_ROLES,
  marketingEdit: ["superadmin", "admin", "editor"],
  upgradeOpportunities: ["superadmin", "admin", "ambassador"],

  seoTools: ["superadmin", "admin", "editor", "viewer"],
  seoEdit: ["superadmin", "admin", "editor"],

  reviews: ["superadmin", "admin", "editor", "experience", "viewer"],
  reviewsModerate: ["superadmin", "admin", "editor"],
  reviewsExperienceResponse: ["superadmin", "admin", "experience"],

  promoCodes: ["superadmin"],
  promoCodesRequest: ["superadmin", "admin", "ambassador"],

  billing: ["superadmin"],
  billingExperienceView: ["superadmin", "admin", "experience"],

  settings: ["superadmin"],
  featureFlags: ["superadmin"],
  logs: ["superadmin"],
  experienceLogs: ["superadmin", "admin", "experience"],

  import: ["superadmin"],
  dataQuality: ["superadmin", "admin"],
  locationGrowth: ["superadmin", "admin", "ambassador"],

  adminUsers: ["superadmin"],
  impersonation: ["superadmin"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type AdminPermissionKey = keyof typeof ADMIN_PAGE_ACCESS;

export function canAdmin(
  role: AdminRole | null | undefined,
  permission: AdminPermissionKey,
) {
  if (!role) return false;
  return (ADMIN_PAGE_ACCESS[permission] as readonly string[]).includes(role);
}

export function canAnyAdmin(
  role: AdminRole | null | undefined,
  permissions: readonly AdminPermissionKey[],
) {
  return permissions.some((permission) => canAdmin(role, permission));
}
