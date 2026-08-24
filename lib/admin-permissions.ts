import type { AdminRole } from "@/lib/users/roles";

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  manager: "Manager",
  editor: "Editor",
  reviewer: "Reviewer",
  ambassador: "Ambassador Team",
  experience_team: "Experience Team",
  partner_ambassador: "Partner Ambassador",
  marketing_intern: "Marketing Intern",
  marketing_specialist: "Marketing Specialist",
  marketing_manager: "Marketing Manager",
  viewer: "Viewer",
  experience: "Experience Team",
};

export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  superadmin: "Full platform access, ownership settings, billing, imports, users, and destructive actions.",
  admin: "Trusted operations access for locations, CRM, claims, reservations, Experience Team, marketing, and analytics.",
  manager: "Team operations access for dashboard, Team Tools, work sessions, reviews, and payroll workflows.",
  editor: "Content, location details, SEO, photos, templates, reviews, and marketing content.",
  reviewer: "Read-only review access to approved dashboard, CRM, location, analytics, reservation, communication, and content areas.",
  ambassador: "Sales and outreach access for assigned locations, claim links, pipeline updates, and upgrade opportunities.",
  experience_team: "Experience Team access for user questions, reservation issues, claims help, owner account assistance, and approved communications.",
  partner_ambassador: "Limited access to approved Partner Ambassador knowledge base resources.",
  marketing_intern: "Create and manage assigned marketing content, ideas, media, creator outreach, and marketing tasks without approval or account-control privileges.",
  marketing_specialist: "Marketing operations access for content, campaigns, creators, community, analytics, scheduling, and approved publishing workflows.",
  marketing_manager: "Marketing team oversight with routine content approvals, campaign management, creator management, publishing, and full marketing analytics.",
  viewer: "Read-only access to approved dashboard areas.",
  experience: "Legacy compatibility token that normalizes to Experience Team and is not assignable.",
};

export const ALL_ADMIN_ROLES = [
  "superadmin", "admin", "manager", "editor", "reviewer", "ambassador", "experience_team",
  "partner_ambassador", "marketing_intern", "marketing_specialist", "marketing_manager", "viewer",
] as const satisfies readonly AdminRole[];

const CORE_STAFF_ROLES = ["superadmin", "admin", "manager", "editor", "reviewer", "ambassador", "experience_team", "viewer"] as const satisfies readonly AdminRole[];
const MARKETING_ROLES = ["superadmin", "admin", "manager", "editor", "reviewer", "marketing_intern", "marketing_specialist", "marketing_manager"] as const satisfies readonly AdminRole[];

const RAW_ADMIN_PAGE_ACCESS = {
  dashboard: ALL_ADMIN_ROLES,
  knowledgeBase: ALL_ADMIN_ROLES,
  analytics: CORE_STAFF_ROLES,

  locations: CORE_STAFF_ROLES,
  locationsCreate: ["superadmin", "admin"],
  locationsEdit: ["superadmin", "admin", "editor"],
  locationsDelete: ["superadmin"],

  events: ["superadmin", "admin", "editor"],
  eventsManage: ["superadmin", "admin", "editor"],
  eventsImport: ["superadmin", "admin"],

  fraud: ["superadmin", "admin", "manager", "reviewer"],
  fraudManage: ["superadmin", "admin", "manager"],
  fraudEnforce: ["superadmin", "admin"],

  crm: [...CORE_STAFF_ROLES, "marketing_intern", "marketing_specialist", "marketing_manager"],
  crmEdit: ["superadmin", "admin", "editor", "marketing_specialist", "marketing_manager"],
  crmSalesUpdate: ["superadmin", "admin", "ambassador"],
  crmExperienceUpdate: ["superadmin", "admin", "experience_team"],
  crmDelete: ["superadmin"],

  businessCrm: CORE_STAFF_ROLES,
  businessCrmEdit: ["superadmin", "admin", "editor"],
  businessCrmSalesUpdate: ["superadmin", "admin", "ambassador"],
  businessCrmExperienceUpdate: ["superadmin", "admin", "experience_team"],

  claims: ["superadmin", "admin", "ambassador", "experience_team", "viewer"],
  claimsManage: ["superadmin", "admin"],
  claimsEscalate: ["superadmin", "admin", "experience_team"],
  claimsOutreach: ["superadmin", "admin", "ambassador"],

  claimQrs: ["superadmin", "admin", "ambassador", "experience_team", "viewer"],
  claimQrsGenerate: ["superadmin", "admin", "ambassador"],

  mailingBatches: ["superadmin", "admin", "manager", "ambassador", "reviewer", "viewer"],
  mailingBatchesManage: ["superadmin", "admin", "manager"],
  claimTools: ["superadmin", "admin", "ambassador"],

  ownerAccounts: ["superadmin", "admin", "ambassador", "experience_team"],
  ownerAccountsManage: ["superadmin", "admin"],
  ownerAccountsExperience: ["superadmin", "admin", "experience_team"],

  reservations: CORE_STAFF_ROLES,
  reservationsManage: ["superadmin", "admin", "experience_team"],
  reservationsView: CORE_STAFF_ROLES,
  reservationLayouts: ["superadmin", "admin", "editor"],
  reservationLayoutsEdit: ["superadmin", "admin", "editor"],

  experienceInbox: ["superadmin", "admin", "experience_team", "viewer"],
  experienceInboxManage: ["superadmin", "admin", "experience_team"],

  communication: CORE_STAFF_ROLES,
  communicationSend: ["superadmin", "admin"],
  communicationOneToOne: ["superadmin", "admin", "ambassador", "experience_team"],
  emailTemplates: CORE_STAFF_ROLES,
  emailTemplatesEdit: ["superadmin", "admin", "editor"],
  emailTemplatesUse: ["superadmin", "admin", "ambassador", "experience_team"],
  sms: ["superadmin", "admin", "ambassador", "experience_team", "viewer"],
  smsSend: ["superadmin", "admin"],
  smsOneToOne: ["superadmin", "admin", "ambassador", "experience_team"],

  campaigns: ["superadmin", "admin", "editor", "viewer", "marketing_intern", "marketing_specialist", "marketing_manager"],
  campaignsEdit: ["superadmin", "admin", "editor", "marketing_intern", "marketing_specialist", "marketing_manager"],
  campaignsSend: ["superadmin", "admin", "marketing_specialist", "marketing_manager"],

  careers: CORE_STAFF_ROLES,
  careersEdit: ["superadmin", "admin", "editor"],
  careersJobsManage: ["superadmin", "admin", "editor"],
  careersApplicationsManage: ["superadmin", "admin", "manager", "editor", "ambassador", "experience_team", "viewer"],
  careersInterviewsManage: ["superadmin", "admin", "manager"],
  careersOffersManage: ["superadmin", "admin"],
  careersInternshipsManage: ["superadmin", "admin", "manager"],
  careersTeamConversion: ["superadmin", "admin"],
  careersMarketingReview: ["superadmin", "admin", "manager", "editor"],

  marketing: MARKETING_ROLES,
  marketingEdit: ["superadmin", "admin", "editor", "marketing_intern", "marketing_specialist", "marketing_manager"],
  marketingApprove: ["superadmin", "admin", "marketing_manager"],
  marketingPublish: ["superadmin", "admin", "marketing_specialist", "marketing_manager"],
  marketingSocialAccounts: ["superadmin", "admin"],
  marketingSpend: ["superadmin", "admin"],
  upgradeOpportunities: ["superadmin", "admin", "ambassador"],

  seoTools: ["superadmin", "admin", "editor", "viewer"],
  seoEdit: ["superadmin", "admin", "editor"],
  reviews: ["superadmin", "admin", "editor", "experience_team", "viewer"],
  reviewsModerate: ["superadmin", "admin", "editor"],
  reviewsExperienceResponse: ["superadmin", "admin", "experience_team"],
  promoCodes: ["superadmin"],
  promoCodesRequest: ["superadmin", "admin", "ambassador"],
  billing: ["superadmin"],
  billingExperienceView: ["superadmin", "admin", "experience_team"],
  settings: ["superadmin"],
  featureFlags: ["superadmin"],
  logs: ["superadmin"],
  security: ["superadmin"],
  securityManage: ["superadmin"],
  roles: ["superadmin"],
  rolesManage: ["superadmin"],
  experienceLogs: ["superadmin", "admin", "experience_team"],
  searchHealth: ["superadmin", "admin", "experience_team"],
  productionFinishLine: ["superadmin", "admin"],
  import: ["superadmin"],
  dataQuality: ["superadmin", "admin"],
  locationGrowth: ["superadmin", "admin", "ambassador"],
  adminUsers: ["superadmin"],
  impersonation: ["superadmin"],
  giveaway: ["superadmin", "admin", "manager", "experience_team", "viewer"],
  giveawayManage: ["superadmin", "admin", "manager"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type AdminPermissionKey = keyof typeof RAW_ADMIN_PAGE_ACCESS;

const permissionKeyByRoleList = new WeakMap<readonly AdminRole[], AdminPermissionKey>();

export const ADMIN_PAGE_ACCESS = Object.fromEntries(
  Object.entries(RAW_ADMIN_PAGE_ACCESS).map(([permission, roles]) => {
    const uniqueRoleList = Object.freeze([...roles]) as readonly AdminRole[];
    permissionKeyByRoleList.set(uniqueRoleList, permission as AdminPermissionKey);
    return [permission, uniqueRoleList];
  }),
) as { readonly [K in AdminPermissionKey]: readonly AdminRole[] };

export function permissionKeyForAdminRoleList(roles: readonly AdminRole[]) {
  return permissionKeyByRoleList.get(roles) ?? null;
}

export function canAdmin(role: AdminRole | null | undefined, permission: AdminPermissionKey) {
  if (!role) return false;
  return (ADMIN_PAGE_ACCESS[permission] as readonly string[]).includes(role);
}

export function canAnyAdmin(role: AdminRole | null | undefined, permissions: readonly AdminPermissionKey[]) {
  return permissions.some((permission) => canAdmin(role, permission));
}
