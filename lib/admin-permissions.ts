import type { AdminRole } from "@/lib/users/roles";

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  manager: "Manager",
  editor: "Editor",
  ambassador: "Ambassador Team",
  experience: "Experience Team",
  partner_ambassador: "Partner Ambassador",
  experience_team: "Experience Team",
  viewer: "Viewer",
};

export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  superadmin:
    "Full platform access, ownership settings, billing, imports, users, and destructive actions.",
  admin:
    "Trusted operations access for locations, CRM, claims, reservations, Experience Team, marketing, and analytics.",
  manager:
    "Team operations access for dashboard, Team Tools, work sessions, reviews, and payroll workflows.",
  editor:
    "Content, location details, SEO, photos, templates, reviews, and marketing content.",
  ambassador:
    "Sales and outreach access for assigned locations, claim links, pipeline updates, and upgrade opportunities.",
  experience:
    "Experience Team access for user questions, reservation issues, claims help, owner account assistance, and approved communications.",
  partner_ambassador:
    "Limited access to approved Partner Ambassador knowledge base resources.",
  experience_team:
    "Limited access to approved Experience Team knowledge base resources.",
  viewer: "Read-only access to approved dashboard areas.",
};

export const ALL_ADMIN_ROLES = [
  "superadmin",
  "admin",
  "manager",
  "editor",
  "ambassador",
  "experience",
  "partner_ambassador",
  "experience_team",
  "viewer",
] as const satisfies readonly AdminRole[];

const LEGACY_DASHBOARD_ROLES = ["superadmin", "admin", "manager", "editor", "ambassador", "experience", "viewer"] as const satisfies readonly AdminRole[];

export const ADMIN_PAGE_ACCESS = {
  dashboard: ALL_ADMIN_ROLES,
  knowledgeBase: ALL_ADMIN_ROLES,
  analytics: LEGACY_DASHBOARD_ROLES,

  locations: LEGACY_DASHBOARD_ROLES,
  locationsCreate: ["superadmin", "admin"],
  locationsEdit: ["superadmin", "admin", "editor"],
  locationsDelete: ["superadmin"],

  crm: LEGACY_DASHBOARD_ROLES,
  crmEdit: ["superadmin", "admin", "editor"],
  crmSalesUpdate: ["superadmin", "admin", "ambassador"],
  crmExperienceUpdate: ["superadmin", "admin", "experience"],
  crmDelete: ["superadmin"],

  businessCrm: LEGACY_DASHBOARD_ROLES,
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

  reservations: LEGACY_DASHBOARD_ROLES,
  reservationsManage: ["superadmin", "admin", "experience"],
  reservationsView: LEGACY_DASHBOARD_ROLES,

  reservationLayouts: ["superadmin", "admin", "editor"],
  reservationLayoutsEdit: ["superadmin", "admin", "editor"],

  experienceInbox: ["superadmin", "admin", "experience", "viewer"],
  experienceInboxManage: ["superadmin", "admin", "experience"],

  communication: LEGACY_DASHBOARD_ROLES,
  communicationSend: ["superadmin", "admin"],
  communicationOneToOne: ["superadmin", "admin", "ambassador", "experience"],

  emailTemplates: LEGACY_DASHBOARD_ROLES,
  emailTemplatesEdit: ["superadmin", "admin", "editor"],
  emailTemplatesUse: ["superadmin", "admin", "ambassador", "experience"],

  sms: ["superadmin", "admin", "ambassador", "experience", "viewer"],
  smsSend: ["superadmin", "admin"],
  smsOneToOne: ["superadmin", "admin", "ambassador", "experience"],

  campaigns: ["superadmin", "admin", "editor", "viewer"],
  campaignsEdit: ["superadmin", "admin", "editor"],
  campaignsSend: ["superadmin", "admin"],



  careers: LEGACY_DASHBOARD_ROLES,
  careersEdit: ["superadmin", "admin", "editor"],
  careersJobsManage: ["superadmin", "admin", "editor"],
  careersApplicationsManage: ["superadmin", "admin", "manager", "editor", "ambassador", "experience", "viewer"],
  careersInterviewsManage: ["superadmin", "admin", "manager"],
  careersOffersManage: ["superadmin", "admin"],
  careersInternshipsManage: ["superadmin", "admin", "manager"],
  careersTeamConversion: ["superadmin", "admin"],
  careersMarketingReview: ["superadmin", "admin", "manager", "editor"],

  marketing: LEGACY_DASHBOARD_ROLES,
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
  searchHealth: ["superadmin", "admin", "experience", "experience_team"],

  import: ["superadmin"],
  dataQuality: ["superadmin", "admin"],
  locationGrowth: ["superadmin", "admin", "ambassador"],

  adminUsers: ["superadmin"],
  impersonation: ["superadmin"],
  giveaway: ["superadmin", "admin", "manager", "experience", "viewer"],
  giveawayManage: ["superadmin", "admin", "manager"],
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
