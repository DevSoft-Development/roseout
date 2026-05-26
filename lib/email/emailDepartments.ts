export type EmailDepartment =
  | "account"
  | "security"
  | "reservations"
  | "reviews"
  | "claims"
  | "billing"
  | "plans"
  | "ownerAccounts"
  | "promoCodes"
  | "marketing"
  | "campaigns"
  | "launch"
  | "support"
  | "admin";

type EmailDepartmentConfig = { key: EmailDepartment; displayName: string; signoff: string };

export const EMAIL_DEPARTMENTS: Record<EmailDepartment, EmailDepartmentConfig> = {
  account: { key: "account", displayName: "TheOutHaven.com Account Team", signoff: "Thank you,\nTheOutHaven.com Account Team" },
  security: { key: "security", displayName: "TheOutHaven.com Security Team", signoff: "Thank you,\nTheOutHaven.com Security Team" },
  reservations: { key: "reservations", displayName: "TheOutHaven.com Reservations Team", signoff: "Thank you,\nTheOutHaven.com Reservations Team" },
  reviews: { key: "reviews", displayName: "TheOutHaven.com Reviews Team", signoff: "Thank you,\nTheOutHaven.com Reviews Team" },
  claims: { key: "claims", displayName: "TheOutHaven.com Claims Team", signoff: "Thank you,\nTheOutHaven.com Claims Team" },
  billing: { key: "billing", displayName: "TheOutHaven.com Billing Team", signoff: "Thank you,\nTheOutHaven.com Billing Team" },
  plans: { key: "plans", displayName: "TheOutHaven.com Plans Team", signoff: "Thank you,\nTheOutHaven.com Plans Team" },
  ownerAccounts: { key: "ownerAccounts", displayName: "TheOutHaven.com Owner Accounts Team", signoff: "Thank you,\nTheOutHaven.com Owner Accounts Team" },
  promoCodes: { key: "promoCodes", displayName: "TheOutHaven.com Promotions Team", signoff: "Thank you,\nTheOutHaven.com Promotions Team" },
  marketing: { key: "marketing", displayName: "TheOutHaven.com Marketing Team", signoff: "Thank you,\nTheOutHaven.com Marketing Team" },
  campaigns: { key: "campaigns", displayName: "TheOutHaven.com Campaigns Team", signoff: "Thank you,\nTheOutHaven.com Campaigns Team" },
  launch: { key: "launch", displayName: "TheOutHaven.com Launch Team", signoff: "Thank you,\nTheOutHaven.com Launch Team" },
  support: { key: "support", displayName: "TheOutHaven.com Customer Support", signoff: "Thank you,\nTheOutHaven.com Customer Support" },
  admin: { key: "admin", displayName: "TheOutHaven.com Admin Team", signoff: "Thank you,\nTheOutHaven.com Admin Team" },
};

const ALIASES: Record<string, EmailDepartment> = { password: "security", reset: "security", auth: "security", reservation: "reservations", booking: "reservations", review: "reviews", claim: "claims", billing: "billing", plan: "plans", owner: "ownerAccounts", promo: "promoCodes", marketing: "marketing", campaign: "campaigns", launch: "launch", support: "support", admin: "admin", account: "account", accounts: "account" };

export function getEmailDepartment(department?: EmailDepartment | string): EmailDepartment {
  if (!department) return "support";
  const normalized = String(department).trim().replace(/[\s_-]+/g, "").toLowerCase();
  if (!normalized) return "support";
  const exact = Object.keys(EMAIL_DEPARTMENTS).find((key) => key.toLowerCase() === normalized) as EmailDepartment | undefined;
  return exact || ALIASES[normalized] || "support";
}

export function getEmailSignature(department?: EmailDepartment | string): string {
  return EMAIL_DEPARTMENTS[getEmailDepartment(department)].signoff;
}
