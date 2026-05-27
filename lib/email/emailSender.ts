export const DEFAULT_EMAIL_ADDRESS = "concierge@theouthaven.com";

export type EmailSenderDepartment =
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

const DISPLAY_NAMES: Record<EmailSenderDepartment, string> = {
  account: "TheOutHaven.com Account Team",
  security: "TheOutHaven.com Security Team",
  reservations: "TheOutHaven.com Reservations Team",
  reviews: "TheOutHaven.com Reviews Team",
  claims: "TheOutHaven.com Claims Team",
  billing: "TheOutHaven.com Billing Team",
  plans: "TheOutHaven.com Plans Team",
  ownerAccounts: "TheOutHaven.com Owner Accounts Team",
  promoCodes: "TheOutHaven.com Promotions Team",
  marketing: "TheOutHaven.com Marketing Team",
  campaigns: "TheOutHaven.com Campaigns Team",
  launch: "TheOutHaven.com Launch Team",
  support: "TheOutHaven.com Customer Support",
  admin: "TheOutHaven.com Admin Team",
};

const ALIASES: Record<string, EmailSenderDepartment> = {
  account: "account", accounts: "account", auth: "security", security: "security", password: "security", reset: "security", login: "security", reservation: "reservations", reservations: "reservations", booking: "reservations", bookings: "reservations", outing: "reservations", outings: "reservations", review: "reviews", reviews: "reviews", claim: "claims", claims: "claims", billing: "billing", payment: "billing", invoice: "billing", subscription: "billing", plan: "plans", plans: "plans", owner: "ownerAccounts", owners: "ownerAccounts", owneraccount: "ownerAccounts", owneraccounts: "ownerAccounts", promo: "promoCodes", promos: "promoCodes", promotion: "promoCodes", promotions: "promoCodes", promocode: "promoCodes", promocodes: "promoCodes", marketing: "marketing", newsletter: "marketing", campaign: "campaigns", campaigns: "campaigns", launch: "launch", support: "support", help: "support", admin: "admin",
};

export function getEmailSenderDepartment(department?: EmailSenderDepartment | string | null): EmailSenderDepartment {
  if (!department) return "support";
  const normalized = String(department).trim().replace(/[\s_-]+/g, "").toLowerCase();
  if (!normalized) return "support";
  const exact = Object.keys(DISPLAY_NAMES).find((key) => key.toLowerCase() === normalized) as EmailSenderDepartment | undefined;
  if (exact) return exact;
  return ALIASES[normalized] || "support";
}

export function getEmailDisplayName(department?: EmailSenderDepartment | string | null): string {
  return DISPLAY_NAMES[getEmailSenderDepartment(department)];
}

export function getEmailFrom(department?: EmailSenderDepartment | string | null): string {
  return `${getEmailDisplayName(department)} <${DEFAULT_EMAIL_ADDRESS}>`;
}

export function getEmailReplyTo(): string {
  return DEFAULT_EMAIL_ADDRESS;
}
